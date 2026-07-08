# Design

## Context

Today, `Systems` payloads arrive on the `kic-trigger-flow` stdin and are
processed by `TriggerFlowState::process_system_config` in
`trigger-flow-manager/src/api/state.rs`. Two branches exist:

- **Fresh init** (empty `slot_channel_list`): calls `SlotChannelList::new`,
  gates the result on `is_valid_config()`, and emits either
  `evaluate_response` or `empty_system_config_error`.
- **In-session update**: calls `update_slot_channel_list` and unconditionally
  emits `evaluate_response`, regardless of whether the result is valid.
  Slots are overwritten wholesale from the payload; there is no
  comparison against prior module values.

Errors in both branches are collapsed to `""` at
`Err(_e) => "".to_string()`. The caller in
`kic-trigger-flow/src/back_end/client_server.rs` evaluates
`should_trigger_script` on that response. An empty string is not valid JSON,
so the fallback `!response.contains("\"error\"")` returns `true`, spuriously
firing script regeneration and sending an empty WebSocket text frame that
the UI silently drops.

Channels currently carry `in_use` but nothing on the Rust side reads it
for validation. Slots carry no per-slot validity signal at all. Trigger
models are bound to slots via `TriggerModelState.slot_index` but there is
no way for the UI to know that a slot's module has changed under a model.

`SlotChannelList::update_slot_channel_list` writes `self.slots` before
`self.nodes` via `?`. A parse failure inside the nodes half leaves
`self.slots` freshly overwritten but `self.nodes`/`localnode`/`is_valid`
stale for all subsequent requests until the next successful `Systems` line.

## Goals / Non-Goals

**Goals:**
- Symmetric validity gating on both branches of `process_system_config`.
- Structured `{"error": ...}` IPC payload for every failure path.
- End-to-end consistency of the "no usable hardware" signal between Rust
  and UI. **(done: `request_type` renamed to `empty_system_config_error`.)**
- Slot-level invalidation and cleanup: when a module changes on a slot,
  flag the slot; when nothing references it, drop it so the next payload
  brings it back fresh.
- Atomic mutation in `update_slot_channel_list`.

**Non-Goals:**
- Any channel-level state changes (`Channel.is_valid`). Channels live
  inside slots; slot invalidity is authoritative.
- Block-level flagging via `block_error` for module drift. Deferred; UI
  can gate at the slot level for now.
- Catalog metadata for per-block module compatibility. Not needed under
  slot-level invalidation.
- UI reaction (block panel disable, indicator styling). Tracked as a
  follow-up change; this change only wires the Rust signal.
- Changing the wire vs domain type split.
- Changing the `Systems` payload shape.
- Fixing TS-side gaps (`sendConfigData` gating, delete-last-system crash).

## Decisions

### Decision: Slot-level invalidation, not block-level

Add `is_valid: bool` and `in_use: bool` to `Slot`. `is_valid` flips to
`false` when a `Systems` update reports a module different from what we
had stored for the same `slot_id`. `in_use` is derived from `models`:
`models.values().any(|m| m.slot_index == this.slot_id)`. Blocks and
models are not touched by this change; the UI reads `slot.is_valid` and
gates block interaction accordingly.

**Rationale:** The invalidation signal is truly on the hardware object.
Every derived structure (channels, models, blocks) becomes stale together
when a slot's module changes; putting the flag on the parent avoids
duplicating the same signal across children. Also removes the need for
per-block-type compatibility metadata in the catalog.

**Alternative considered:** Per-block flagging via `block_error` and a
`ModuleCompatibilityValidator`. Rejected because it requires new catalog
metadata that does not exist today, and duplicates the "stale" signal
across every block on the affected slot.

**Alternative considered:** Also add `Channel.is_valid`. Rejected as
redundant; slot invalidity fully implies channel invalidity in this
model. Can be reintroduced later if a per-channel distinction ever
becomes real.

### Decision: Two triggers, one flag-write, two delete-writes

`is_valid` is written only when a `Systems` update is processed. The
evaluate cycle (`SlotChannelListUpdate::TriggerFlowState`) never touches
`is_valid`; it only recomputes `in_use` and applies the delete rule.

- On `Systems` update: merge-by-`slot_id`, compare modules, set
  `is_valid = false` on diff and `is_valid = true` on fresh add.
  Recompute `in_use`. Delete `!is_valid && !in_use` slots.
- On evaluate cycle: recompute `in_use`. Delete `!is_valid && !in_use`
  slots. Do not touch `is_valid`.

**Rationale:** The flag is a claim about "the module changed under this
slot". That claim is only meaningful in the context of a hardware
observation. Evaluate cycles are pure state updates from the UI and
carry no new hardware information.

### Decision: Recovery via delete and re-add

A flagged slot stays flagged as long as anything references it. When the
user removes/reassigns all models off the slot (via the model config
panel), the next evaluate cycle sees `in_use = false` and deletes the
slot from `slot_channel_list.slots`. The next `Systems` payload treats
it as a fresh add and stores `is_valid = true`.

**Rationale:** Simple and predictable. No need to track "expected module"
per model. No manual clear step. The user's only recovery action is to
detach existing models from the invalid slot (or accept the new module
and rebuild), which is exactly the intended UX.

**Alternative considered:** Track expected module per `TriggerModelState`
and recompute `is_valid` on every state change. Rejected as
overengineering for the current requirements.

### Decision: Delete means physical removal from `slot_channel_list.slots`

When `!is_valid && !in_use`, the slot entry is dropped from the vec, not
reset in place. The vec no longer contains that `slot_id` until the next
`Systems` payload arrives.

**Rationale:** Transient state (next `Systems` re-adds it) and the UI
already tolerates absence: dropdowns iterate `slots`, absence means "not
offered". Physical removal keeps state minimal and avoids any ambiguous
"invalid but present" middle ground when nothing depends on the slot.

**Alternative considered:** Reset in place to
`{ is_valid: true, in_use: false }` with the new module. Rejected as
saving essentially nothing; the next payload will overwrite it anyway.

### Decision: Unify `request_type` on the Rust side (done)

Renamed Rust's `"empty_config_response"` to `"empty_system_config_error"`
to match the UI's existing switch case. Landed as an isolated commit.

### Decision: Atomic parse in `update_slot_channel_list`

Parse `slots` and `nodes` into local `Vec` bindings first. Assign to
`self.*` only after both parse successfully. Same rule applied to
`localnode` and `is_valid`.

**Rationale:** Removes the partial-state hazard entirely at negligible
cost. Matches the pattern already used in `new`.

## Risks / Trade-offs

- **[Risk] Merge-by-slot_id changes the update path's semantics.**
  Today `self.slots = new_slots` is a simple replace. Merge logic
  introduces an ordering-independent comparison. Mitigation: unit tests
  covering (a) same module (no change), (b) different module (flag),
  (c) new slot_id (fresh add), (d) missing slot_id in payload (drop).

- **[Risk] Physical delete on `!is_valid && !in_use` may cause a slot to
  briefly disappear from the UI if the next payload is delayed.**
  Mitigation: acceptable per current UX. The tsp-toolkit host pushes on
  every settings change, so latency is small.

- **[Trade-off] Slot-level flag means the UI cannot distinguish "channel
  1 config invalid" from "channel 2 config invalid" from "slot module
  changed".** All roll up to `slot.is_valid = false`. Accepted; can be
  refined later.

- **[Trade-off] `Channel.in_use` remains derived but unread on the Rust
  side.** Kept because the UI does use it for informational display.
  No cleanup planned in this change.

## Migration Plan

- Land as a normal deploy; no persisted data schema change.
- The new fields on `Slot` (`is_valid`, `in_use`) serialize with defaults
  compatible with any existing UI code that reads by field name. UI
  needs to opt in to reading them.

## Open Questions

1. Should we log slot deletions to stderr (as we do for other silent
   drops)? Default: yes, one line per deleted slot on each trigger.
2. Should the in-session validity gate also emit
   `empty_system_config_error` (like the fresh-init branch does), or a
   different signal like `evaluate_response` with an `error` field?
   Default: `empty_system_config_error` for consistency. Confirm during
   task 2.1.

