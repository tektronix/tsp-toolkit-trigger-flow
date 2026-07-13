# Design

## Context

`Systems` payloads arrive on the `kic-trigger-flow` stdin from the
`tsp-toolkit` VS Code extension and are processed by
`TriggerFlowState::process_system_config` in
`trigger-flow-manager/src/api/state.rs`. Two branches:

- **Fresh init** (empty `slot_channel_list`): calls `SlotChannelList::new`,
  gates on `is_valid_config()`, emits `evaluate_response` or
  `empty_system_config_error`.
- **In-session update**: calls `update_slot_channel_list`, emits
  `evaluate_response`. Currently has no validity gate.

Existing bugs in this code path:

- Both branches collapse `Err(_e)` to `""`, misleading
  `should_trigger_script` and sending empty WS frames.
- `update_slot_channel_list` writes `self.slots` before `self.nodes` via
  `?`, leaving partial state on a mid-parse failure.
- No signal to the UI when a slot's module changes under an existing
  trigger model.

Iterations before Path 2 explored:

1. Block-level flagging via `block_error` and a `ModuleCompatibilityValidator`.
   Required new catalog metadata; rejected.
2. Slot-level `is_valid`/`in_use` fields with merge-by-`slot_id` and a
   delete rule. Implemented, then abandoned: could not represent "show
   old and new modules together" with a single entry per `slot_id`;
   could not disambiguate when multiple models sharing a `slot_id` bound
   to different modules; delete-in-same-trigger surprised users.
3. Duplicate `slot_id` entries in `Vec<Slot>`. Rejected: every consumer
   keying by `slot_id` alone would need disambiguation logic. Also
   required a per-model module snapshot to identify which duplicate a
   model was bound to (effectively Path 2 anyway).

Path 2 emerged as the simplest design that satisfies the "show old + new,
handle all mainframe change flavors uniformly, no catalog metadata" set of
constraints.

## Goals / Non-Goals

**Goals:**

- Rebuild `SlotChannelList` fresh from every `Systems` payload. Single
  entry per `slot_id`. No merge, no flag preservation.
- Per-binding staleness: each model and each slot-referencing block
  parameter carries a `slot_module` snapshot. Comparison to current
  hardware determines staleness.
- Handle all mainframe-change flavors via one rule: module swap,
  localnode identity change, elevated node identity change, active
  system entry switch. Every case is "did the binding still resolve to
  what it expected?".
- Structured `IpcData` error payloads for every failure path.
  `should_trigger_script` correctly gates on error responses.
- Symmetric validity gating on both branches of `process_system_config`.
- Atomic mutation in `update_slot_channel_list`.
- Save/recall backward compat: legacy sessions (no `slot_module`)
  backfill from current hardware on recall.
- UI derives virtual "invalid" dropdown entries from stale bindings.
  Grey-out affected controls until user rebinds.

**Non-Goals:**

- Channel-level state changes (`Channel.is_valid` etc.).
- Block-level flagging via `block_error` for module drift.
- Catalog-driven module compatibility declarations (per block type).
- Changes to the wire vs domain type split.
- Changes to the `Systems` payload shape (owned by tsp-toolkit).
- TS-side gaps (`sendConfigData` gating, delete-last-system crash) —
  tracked separately.

## Decisions

### Decision: Rebuild `SlotChannelList` fresh on every `Systems` payload

`SlotChannelList.slots` holds one entry per `slot_id`, reflecting current
hardware only. The `SystemConfig` arm of `update_slot_channel_list`
becomes structurally similar to `SlotChannelList::new` — it constructs
a fresh list from the payload and replaces `self`.

**Rationale:** No merge, no flag maintenance, no delete rule. Every
"the mainframe changed" scenario resolves to "the fresh list now
differs from what some binding expected", detected by per-binding
comparison downstream.

**Alternative considered:** Merge-by-`slot_id` with slot-level flags.
Rejected as it duplicated state and couldn't represent "show old + new"
without a data model change.

**Alternative considered:** Duplicate `slot_id` entries. Rejected due
to disambiguation ripple across every consumer.

### Decision: Per-binding `slot_module` snapshot

Each place that binds to a slot captures the current module at bind
time. Two binding sites:

- **Model level:** `TriggerModelState.slot_module: Option<Module>`.
  Set at model creation.
- **Block-parameter level:** for any block parameter whose catalog type
  is `SlotIndex`, a per-parameter `slot_module` snapshot is captured at
  parameter-write time. Storage on the block: a map from parameter name
  to `Module`, or an inline field per known slot-ref param, depending
  on how block-param mutation is implemented today.

Snapshots are never auto-updated by Rust. They change only when the
user explicitly rebinds via the UI.

**Rationale:** The binding's expectation is the ground truth for
"stale". Storing it on the binding site (model or param) captures user
intent without coupling to catalog metadata about compatibility.

**Alternative considered:** Store the expectation on `Slot` (as
`previous_module` or `expected_module`). Rejected — multiple models
with different expectations on the same slot can't be represented as
one field.

**Alternative considered:** Rust derives staleness from block parameter
types via the catalog. Rejected — same catalog-metadata dependency we
were avoiding.

### Decision: Catalog-driven auto-snapshot for slot-ref parameters

Rather than hand-hooking each block type that has a slot-ref
parameter, the "capture on set" logic reads the block's catalog
definition and snapshots `slot_module` for every parameter typed
`SlotIndex`. Consequences:

- Any future block type with a `SlotIndex` param gets staleness
  detection for free.
- One helper, not one hook per block type.

**Rationale:** Minimises the "forgot to add a hook" pitfall. Catalog
already declares parameter types; we're reading, not adding, metadata.

### Decision: UI derives virtual invalid dropdown entries

The wire structure does not carry "old" entries. Rust ships:

- `slot_channel_list.slots`: current hardware, one entry per `slot_id`.
- `TriggerModelState.slot_module`: what each model expected.
- Per-block-param `slot_module`: what each param expected.

UI computes at render time: for each binding whose `slot_module` does
not match the current hardware at its `(slot_id, node_id)`, emit a
virtual "invalid" dropdown entry labeled with the captured
`slot_module`. Deduplicate virtual entries by
`(slot_id, node_id, slot_module)` for display.

Valid dropdown entries come directly from `slot_channel_list.slots` and
`slot_channel_list.nodes[i].slots`.

**Rationale:** The data on the wire encodes only facts (hardware,
expectations). Presentation is derived. Consumers keying by `slot_id`
alone continue to work unchanged.

### Decision: Virtual invalid entries are read-only

The user MUST NOT be able to select a virtual invalid entry when
rebinding. Selecting one would immediately rebind to a stale module
and re-trigger the same invalid state. Only valid entries (current
hardware) are selectable.

**Rationale:** Prevents the "resolve to something already broken"
confusion.

### Decision: Grey-out block editing for stale models and stale params

- If a model has `slot_module != current slot.module` (its slot changed
  under it), the entire block panel for that model is disabled. Only
  the model's slot dropdown remains interactive so the user can rebind.
- If a specific block parameter has a stale slot-ref, that parameter's
  editor is greyed. Other parameters and other blocks in the same model
  remain interactive.

**Rationale:** Fine-grained: don't lock the whole model when only one
notify block is stale.

### Decision: Recovery is per-binding via explicit rebind

When the user picks a valid entry in a stale binding's dropdown, that
binding's `slot_module` updates to the newly-picked module. The
previously-flagged virtual entry vanishes from the derived display on
the next render. Other stale bindings are unaffected.

**Rationale:** Independent bindings recover independently. Model A can
be rebound without touching model B or model A's block params.

### Decision: Node selection filter (unchanged from earlier iteration)

`select_first_mp5_node` free function called from both
`SlotChannelList::new` and the `SystemConfig` arm of
`update_slot_channel_list`. Returns 0 or 1 nodes: the first entry in
payload array order with `mainframe.starts_with("MP5")` AND a
non-Empty slot. The chosen node retains its `node_id` intact so
`node_id`-keyed lookups continue to work.

**Rationale:** Preserves hardware identity for downstream consumers
(script generation via `module_type` helper looks up modules by
`node_id`; blocks reference specific `node_id` values). Elevation
(moving node slots into `slot_channel_list.slots` and renaming
`localnode` to the `nodeId`) was rejected in an earlier iteration
because it decouples `node_id` from the surviving hardware in a way
blocks and script generation aren't prepared for.

### Decision: Save/recall backfill for legacy sessions

Recall payloads may deserialize a `TriggerModelState.slot_module` as
`None` for sessions saved before this feature. On recall, Rust walks
`models` and, for any model with `slot_module == None`, sets it to
whatever the currently-referenced slot's module is.

**Rationale:** Aligns legacy sessions with current hardware. Legacy
models become "valid" until the next real config change. Explicit
migration on load beats leaving `None` as an ambiguous "always-valid"
sentinel.

**Alternative considered:** Treat `None` as "no expectation, always
valid". Rejected — leaves legacy sessions unable to participate in
staleness detection for future config changes.

### Decision: Script generation skips stale models

In `Script::from_state`, iterate models; for each, resolve
`(slot_index, node_id)` in `slot_channel_list`; compare
`model.slot_module` (with `None` treated as valid) to the resolved
slot's `module`. If they differ, skip emission for that model and
inject a comment marker in the generated `.tsp`:

```lua
-- model 'A' skipped: slot 1 module changed since binding
```

**Rationale:** Prevents garbage `.tsp` writes for stale bindings. User
sees a script that reflects only currently-valid models plus explicit
skip markers.

### Decision: Rust `module_type` helper takes `expected_module`

The handlebars helper signature changes to include the model's
`slot_module` (or the block-param's `slot_module`). It resolves the
specific module without needing to guess among ambiguous entries. Since
Path 2 has one entry per `slot_id`, resolution is unambiguous by
`(slot_id, node_id)`. The helper still needs `expected_module` to
detect the stale case for script-gen skip.

### Decision: Unify `request_type` on the Rust side (done)

Renamed Rust's `"empty_config_response"` to `"empty_system_config_error"`
to match the UI's existing switch case. Landed as an isolated commit.

### Decision: In-session validity gate

`process_system_config` else branch calls `is_valid_config()` on the
rebuilt `SlotChannelList`. If false, keep the previous state and emit
`empty_system_config_error`.

### Decision: Atomic parse in `update_slot_channel_list`

Parse `slots` and `nodes` into local `Vec` bindings first. Assign to
`self.*` only after both parse successfully. Same rule for
`localnode` and `is_valid`.

**Rationale:** Removes the partial-state hazard at negligible cost.

## Risks / Trade-offs

- **[Risk] Rebind hooks — every rebind code path must update
  `slot_module`.** Miss one → silent stale. Mitigation: audit list at
  implementation time (model modal, first-block-drop `newModel`,
  template instantiation, block-param editors for `SlotIndex`-typed
  fields). Tests must exercise each path.

- **[Risk] Catalog-driven auto-snapshot depends on the catalog
  correctly declaring parameter types.** If a slot-ref parameter is not
  declared as `SlotIndex` in the catalog, its staleness is undetected.
  Mitigation: cross-check catalog declarations during implementation;
  document the convention.

- **[Risk] Virtual invalid entry rendering across three dropdown
  surfaces.** Create-new, edit-existing, block-param editor all need
  consistent derivation. Mitigation: single UI helper that computes the
  union; the three surfaces call it.

- **[Risk] Legacy session backfill on recall changes semantics for
  older sessions.** A user opening a 6-month-old session on new
  hardware would see all models auto-align to current hardware. If they
  didn't intend that, they lose the "wait, this was configured
  differently" signal. Mitigation: document; consider a one-time toast
  on legacy-session backfill.

- **[Trade-off] Per-binding snapshot means the wire payload grows
  slightly.** One `Option<Module>` per model, plus a small map per
  block for slot-ref params. Negligible in practice.

- **[Trade-off] `Channel.in_use` remains derived-but-unread on the
  Rust side.** Kept because the UI uses it for informational display.
  No cleanup planned.

## Migration Plan

- Land as a normal deploy; the `SlotChannelList` wire shape is
  unchanged. One optional field on `TriggerModelState` and one on
  `TriggerModelBlock` (map).
- Legacy sessions: on recall, Rust backfills `slot_module` for models
  where it's absent. First user action on a legacy model populates
  the field explicitly.
- Roll back the earlier iterations' `Slot.is_valid`/`Slot.in_use` and
  merge/delete-rule logic. UI equivalents on `Slot` also removed.

## Open Questions

- (Open) Should legacy-session backfill emit a one-time UI toast so
  the user knows their models were auto-aligned to current hardware?
  Default: no toast, just do it. Configurable if the UX team prefers
  the toast.
- (Open) On script-gen skip for stale models, is the injected `.tsp`
  comment format sufficient, or should we also fail the run in some
  more visible way (e.g., a warning IPC to the UI)? Default: comment
  in the file; UI already surfaces stale state via grey-out.
- (Open) When user rebinds a model to a slot on a different node, do
  we also update `model.node_id`? Yes, semantically must — the
  binding is `(slot_index, node_id, slot_module)`.


