# system-config-mid-session-hardening

## Why

When hardware configuration changes mid-session, existing trigger models
silently break. The specific failure modes:

- A slot's installed module changes (SMU → PSU or vice versa) while a
  model is bound to it.
- The active `localNode` string changes.
- A TSP-Link node's `nodeId` or `mainframe` changes.
- The user switches the `isActive` flag to a different `SystemConfigJson`.
- The `Systems` payload no longer contains the slot or node a model
  references.

In every case the model's block parameters become stale; the generated
`.tsp` script becomes wrong; and the UI shows no signal to the user.
Additionally, several existing bugs live in this code path: errors are
swallowed to `""` (misleading `should_trigger_script` and sending empty
WS frames), the in-session update branch has no validity gate, and
`SlotChannelList::update_slot_channel_list` can partial-mutate on a
mid-parse failure. This change fixes all of these.

## What Changes

### Core design — Path 2

- Every `Systems` payload rebuilds `SlotChannelList` from scratch (like
  the existing fresh-init path). `SlotChannelList.slots` always reflects
  current hardware only; one entry per `slot_id`.
- Add `slot_module: Option<Module>` on `TriggerModelState`. Captured at
  model creation from the current slot's module. Never auto-updated by
  Rust; changed only by explicit user rebind via the model settings UI.
- Add per-parameter `slot_module` snapshot for any block parameter
  declared with type `SlotIndex` in the catalog (e.g., notify block's
  `slot_index`). Snapshot is set at parameter-write time. Catalog-driven
  so future block types with `SlotIndex` params are auto-covered.
- UI derives "virtual invalid" dropdown entries: for each stale binding,
  synthesize an entry showing the captured `slot_module` alongside the
  valid entries from current hardware. Virtual entries are display-only,
  not selectable when rebinding.
- UI greys out block-editing controls whose binding is stale (model or
  block-param level) until the user rebinds to a valid entry.
- Recovery is per-binding and independent: a model's slot binding and a
  block parameter's slot ref are separate concerns.

### Save / recall

- No shape change to `SlotChannelList`. Backward compat trivial.
- Legacy sessions saved before this feature have models with
  `slot_module: None`. On recall, Rust backfills `slot_module` from the
  currently-referenced slot's module. This aligns legacy sessions with
  current hardware and enables staleness detection for the next config
  change.

### Retained from prior iterations

- Rename Rust `request_type` string to `"empty_system_config_error"`
  (matches UI switch). **Done.**
- `select_first_mp5_node` filter: preserves the first qualifying MP5
  node's identity; drops other nodes. Applied in both `SlotChannelList::new`
  and the `SystemConfig` update arm. **Done.**
- MP5 localnode rule: drop all nodes when the local mainframe is MP5
  with a non-Empty slot. **Done.**

### Still pending (independent of Path 2)

- Replace both `Err(_e) => "".to_string()` sinks in
  `process_system_config` with structured `IpcData` payloads carrying
  `request_type: "empty_system_config_error"` and a `json_value` with
  an `"error"` key. So `should_trigger_script` correctly evaluates to
  `false` and the UI receives a real frame.
- Gate the in-session update branch of `process_system_config` on
  `is_valid_config()`. If the rebuilt list is invalid, keep the previous
  state and emit `empty_system_config_error`.
- Atomic parse in `SlotChannelList::update_slot_channel_list`: parse
  `slots` and `nodes` into locals before mutating `self`.

### Rolls back from earlier iterations of this change

The earlier iterations added slot-level flags. Path 2 makes them
redundant; they are removed.

- `Slot.is_valid` and `Slot.in_use` fields (both Rust and UI models).
- Merge-by-`slot_id` logic in the `SystemConfig` arm of
  `update_slot_channel_list`. Replaced with fresh rebuild.
- Slot-level delete rule (`retain(|s| s.is_valid || s.in_use)`) in
  both arms of `update_slot_channel_list`. Removed.
- Stderr log per dropped slot. Removed (nothing to drop).
- UI-side `newModel` write of `slot.inUse = true`. Replaced with
  `model.slot_module` snapshot.
- Slot debug logs (`println!("SlotChannelList after new/update: ..."`)
  in `slot_channel_list.rs` — retain for now; optional cleanup.

## Capabilities

### New Capabilities

<!-- None. All changes target the existing system-config capability. -->

### Modified Capabilities

- `system-config`:
    - Rebuilds `SlotChannelList` fresh on every Systems update; no merge,
      no slot-level flag preservation.
    - Adds `slot_module` snapshot on `TriggerModelState`.
    - Adds `slot_module` snapshot on slot-typed block parameters,
      catalog-driven.
    - Defines per-binding staleness by comparison of snapshot to current
      hardware.
    - Handles all wholesale mainframe change flavors (module swap,
      localnode change, node identity change, active system swap) via a
      single rule.
    - Adds an in-session validity gate.
    - Mandates structured error IPC.
    - Unifies the empty-config response identifier (already done).
    - Prescribes atomic parsing in the update path.
    - Recall backfill for legacy sessions.

## Impact

### Rust (trigger-flow-manager)

- `api/slot_channel_list.rs::Slot`:
    - Remove `is_valid` and `in_use` fields (revert of earlier work).
- `api/slot_channel_list.rs::update_slot_channel_list`:
    - `SystemConfig` arm: replace merge-by-`slot_id` with fresh rebuild.
      Same signature; internally behaves like `new` on the payload.
    - Remove slot-level delete rule from both arms.
    - `TriggerFlowState` arm: keep existing `Channel.in_use` refresh.
    - Add atomic parse (still pending): parse `slots` and `nodes` into
      locals first.
- `api/slot_channel_list.rs::select_first_mp5_node`: unchanged.
- `api/state.rs::TriggerModelState`: add `slot_module: Option<Module>`
  with `#[serde(default)]`. On recall, backfill `None` from current
  slot's module.
- `api/state.rs::process_system_config`:
    - Replace `""` error sinks with `empty_system_config_error` IPC.
    - Gate the else branch on `is_valid_config()`.
- `model/trigger_model_block.rs::TriggerModelBlock`:
    - Add `slot_param_bindings: HashMap<String, Module>` (or equivalent)
      to store the `slot_module` snapshot for each `SlotIndex`-typed
      parameter this block carries. `#[serde(default)]`.
- `trigger_model_blocks/catalog.rs::BlockDefinition` (or catalog reader):
    - Expose which parameters are typed `SlotIndex` so the auto-snapshot
      logic can identify them.
- `script/mod.rs::module_type` handlebars helper:
    - Take an optional `expected_module` argument. Resolves the module
      for the specific binding. Preserves the existing signature via
      handlebars defaulting.
- `script/mod.rs::Script::from_state`:
    - Skip generation for stale models (where
      `model.slot_module != current_slot_module` for the model's
      `(slot_index, node_id)`). Emit a comment marker in the `.tsp`
      indicating the skip.

### Rust (kic-trigger-flow)

- `back_end/client_server.rs::StdinLine::Systems`: no code changes.
  Behavior improves automatically once the error-IPC and validity-gate
  work lands.

### UI (trigger-flow-ui)

- `models/slotChannelModel.ts`: remove `isValid` and `inUse` fields from
  `ISlot` and `Slot` (revert of earlier work).
- `models/triggerFlowState.ts::ITriggerModel` / `TriggerModel`: add
  `slot_module` field. Copy through constructor.
- `models/triggerBlock.ts` and related block-param types: add per-block
  storage for `SlotIndex` param snapshots.
- `services/canvas-blocks.service.ts`:
    - `newModel`: snapshot `slot_module` at model creation from the
      current slot's module. Remove the `slot.inUse = true` write.
    - `logIpcDataFormat`: revert to original simple form. No `inUse`
      computation.
    - Block-param mutation code paths: snapshot `slot_module` when a
      `SlotIndex`-typed parameter is set.
- `services/model-resource-allocation.service.ts`,
  `main-flow/main-flow.ts::loadSlotOptions`, and block-param editors:
  new helper that derives the union of "current hardware slots" +
  "virtual invalid entries from stale bindings". Used by the three
  dropdown surfaces:
    - Create-new-model modal (offers valid entries only).
    - Edit-existing-model slot picker (offers valid entries + shows
      current invalid selection as a read-only virtual entry).
    - Slot-typed block parameter editor (same treatment).
- `main-flow/canvas/canvas.ts` (or wherever block panel gates):
  compute per-model and per-block staleness (via `slot_module`
  comparison) and bind the block panel's disabled state.

### Save / recall

- Existing session JSON round-trips with an additional optional field
  on each model. No schema break.
- Legacy sessions: on recall, Rust walks `models`; for any model whose
  `slot_module` is `None`, snapshots the currently-referenced slot's
  module. First user rebind after that populates the field explicitly.

### Out of scope

- Channel-level state changes (`Channel.is_valid`, `Channel.in_use`
  cleanup). `Channel.in_use` remains derived but unread on Rust; UI
  informational.
- Block-level flagging via `block_error` for module drift.
- Catalog-driven per-block module compatibility. Not needed under
  per-binding snapshots.
- TS-side gaps (`sendConfigData` gating in
  `triggerFlowWebViewManager.ts`, `ConifgWebView.ts` delete-last-system
  crash).

