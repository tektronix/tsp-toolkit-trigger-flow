# Design

## Context

Today, `Systems` payloads arrive on the `kic-trigger-flow` stdin and are
processed by `TriggerFlowState::process_system_config` in
`trigger-flow-manager/src/api/state.rs`. Two branches exist:

- **Fresh init** (empty `slot_channel_list`): calls `SlotChannelList::new`,
  gates the result on `is_valid_config()`, and emits either
  `evaluate_response` or `empty_config_response`.
- **In-session update**: calls `update_slot_channel_list` and unconditionally
  emits `evaluate_response`, regardless of whether the result is valid.

Errors in both branches are collapsed to `""` at
`Err(_e) => "".to_string()`. The caller in
`kic-trigger-flow/src/back_end/client_server.rs` evaluates
`should_trigger_script` on that response. An empty string is not valid JSON,
so the fallback `!response.contains("\"error\"")` returns `true`, spuriously
firing script regeneration and sending an empty WebSocket text frame that
the UI silently drops.

Even the intended `empty_config_response` never reaches the UI: the Angular
switch in `trigger-flow-ui/src/app/app.ts` expects
`"empty_system_config_error"` instead. String mismatch. Falls to
`default: console.warn`.

`InstrumentValidator` today only detects cross-model channel conflicts
inside `TriggerFlowState.models`. It does not compare block parameters
against the current `slot_channel_list.slots[i].module`, so a
module swap (e.g., MPSU50_2ST -> MSMU60_2) that invalidates block usage
goes undetected.

`SlotChannelList::update_slot_channel_list` writes `self.slots` before
`self.nodes` via `?`. A parse failure inside the nodes half leaves
`self.slots` freshly overwritten but `self.nodes`/`localnode`/`is_valid`
stale for all subsequent requests until the next successful `Systems` line.

## Goals / Non-Goals

**Goals:**
- Symmetric validity gating on both branches of `process_system_config`.
- Structured `{"error": ...}` IPC payload for every failure path.
- End-to-end consistency of the "no usable hardware" signal between Rust and UI.
- Detection of module-type drift on existing blocks after a hardware change.
- Automatic cleanup of unused blocks orphaned by hardware changes.
- Atomic mutation in `update_slot_channel_list`.

**Non-Goals:**
- Changing the wire vs domain type split. Preserved.
- Changing the `Systems` payload shape. Owned by tsp-toolkit.
- Fixing TS-side gaps (`sendConfigData` should be gated on active-present,
  delete-last-system throws in `ConifgWebView.ts`). Tracked separately.
- Rewriting `InstrumentValidator` conflict detection. The module-drift
  detector may be a new sibling validator to keep concerns separated.
- Introducing new hardware or module types.

## Decisions

### Decision: Add a `ModuleCompatibilityValidator` sibling to `InstrumentValidator`

Rather than expand `InstrumentValidator`, add a separate validator that
compares each block's slot reference to
`trigger_flow_state.slot_channel_list.slots[i].module`. Reports drift via
`block.block_error`.

**Rationale:** Single responsibility. Channel conflict and module drift
are orthogonal concerns; interleaving them makes both harder to reason
about. The validator chain in `RequestProcessor` already supports adding
another link.

**Alternative considered:** Fold into `InstrumentValidator`. Rejected -
mixes two independent checks and would require passing the
`slot_channel_list` into a struct that today only holds a
`SlotChannelHashMap`.

### Decision: Store per-block-type module compatibility in the Catalog

Add (or read from an existing field in) `BlockDefinition` a
`compatible_modules: Vec<Module>` list. Sourced from `triggerBlocks.yaml`.
The validator looks up
`catalog.blocks[block.block_type].compatible_modules`.

**Rationale:** Catalog is the natural home for block metadata and is
already loaded once at startup. Keeps validators stateless w.r.t. hardware
knowledge.

**Alternative considered:** Hardcode compatibility in Rust. Rejected -
duplicates knowledge already present in `triggerBlocks.yaml` and forces a
recompile per new block/module.

Phase 0 task: audit `BlockDefinition` and `triggerBlocks.yaml` to confirm
whether a suitable field already exists.

### Decision: Unify `request_type` on the Rust side

Rename Rust's `"empty_config_response"` to
`"empty_system_config_error"` to match the UI's existing switch case.
The UI has more consumers of `request_type` strings than Rust does, and
the UI's name is more descriptive of the failure semantics.

**Alternative considered:** Change the UI switch. Rejected - the string
`_error` conveys intent better than `_response`, and the UI change is
still trivial if we later prefer that direction.

### Decision: Atomic parse in `update_slot_channel_list`

Parse `slots` and `nodes` into local `Vec` bindings first. Assign to
`self.*` only after both parse successfully. Same rule applied to
`localnode` and `is_valid`.

**Rationale:** Removes the partial-state hazard entirely at negligible
cost (two extra locals). Matches the pattern already used in `new`.

### Decision: Auto-remove classification

An affected block is "unused" iff its `incoming` and `outgoing` are both
`None` (no wiring in the flow graph) AND its `block_parameters` match the
block-type default in the catalog. Otherwise it is "in use" and kept with
`block_error` set.

**Alternative considered:** Only wiring, ignore parameters. Rejected -
users may configure a parameter set without wiring; still counts as
intent.

**Alternative considered:** Only parameters, ignore wiring. Rejected - a
default-param block that participates in a wired chain is meaningful.

## Risks / Trade-offs

- **[Risk] Catalog does not currently carry per-block module compatibility.**
  Mitigation: Phase 0 gate; if the field is missing, propose the shape as
  the first output. Do not proceed to Phase 1 without it.

- **[Risk] Auto-removing "unused" blocks may surprise users.**
  Mitigation: log every removal to stderr with block id, model name, and
  reason; and defer this to Phase 3 so the detection-only phases give us
  time to validate the classification rule against real sessions.

- **[Risk] Renaming `request_type` string is a coordinated change across Rust and UI.**
  Mitigation: land Rust rename and UI switch update in the same PR, add
  an integration test that exercises the fresh-init invalid-config path
  and asserts the UI dispatches into the correct case.

- **[Trade-off] Structured error IPC changes what the UI receives during
  transient config states.** The UI may see an error toast in scenarios
  today that pass silently (e.g., mid-session all-systems-removed). This
  is the intended outcome but should be flagged in UX review before landing.

- **[Trade-off] Two-write TS delete-active-system path** will produce a
  spurious `"no active system"` error IPC to the UI in the window between
  writes. Considered acceptable; the transient closes on the second write.
  Follow-up: TS-side consolidation to a single write.

## Migration Plan

- Land changes behind normal deploys; no persisted data schema change.
- Rust rename of `request_type` string coupled with UI switch update in
  the same commit to avoid a bad intermediate state.
- No feature flag needed. Blocks flagged with new `block_error` values
  will simply appear as errors in the existing UI error path.

## Open Questions

1. Does `BlockDefinition` (or `triggerBlocks.yaml`) already carry module
   compatibility? Phase 0 answers this before Phase 1 starts.
2. Should the drift validator also flag blocks whose slot became `Empty`
   (module removed entirely, not swapped)? Default: yes, same drift
   category. Confirm during Phase 1.
3. Should the auto-remove step also run on a `RecallRequest` (in addition
   to a `Systems` update), for the case where a recall payload references
   modules that no longer exist on current hardware? Deferred - answer
   after Phase 1 detection is in.
