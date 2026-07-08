# system-config-mid-session-hardening

## Why

Mid-session `Systems` payload changes today are silent: invalid updates
overwrite state without a validity gate, errors are swallowed to `""` (which
spuriously triggers script regen and sends empty WS frames), the intended
"empty config" IPC uses a `request_type` string the UI does not recognize,
and there is no signal to the UI when a slot's module changes under an
existing trigger model. This blocks safe hardware reconfiguration during
an active session.

## What Changes

- Unify the `request_type` string used for "no usable hardware" between
  the Rust emitter and the UI switch in
  `trigger-flow-ui/src/app/app.ts`. **(done)**
- Replace both `Err(_e) => "".to_string()` sinks in `process_system_config`
  with structured `IpcData` error payloads so `should_trigger_script`
  correctly evaluates to `false` and the UI receives a non-empty frame.
- Gate the in-session update branch of `process_system_config` on
  `is_valid_config()`, matching the fresh-init branch. Reject invalid
  payloads and keep prior state.
- Add `is_valid: bool` and `in_use: bool` on `Slot`. `is_valid` starts
  `true`, flips to `false` when a `Systems` update reports a different
  module for the same `slot_id`. `in_use` is derived from `models`.
- On every `Systems` update AND every evaluate cycle, drop slots where
  `!is_valid && !in_use`. The next `Systems` payload re-adds them fresh.
- Fix the partial-state hazard in `SlotChannelList::update_slot_channel_list`
  where a mid-parse failure on `nodes` leaves `self.slots` written but
  `self.nodes` and `self.is_valid` stale.

## Capabilities

### New Capabilities

<!-- None. All changes target the existing system-config capability. -->

### Modified Capabilities

- `system-config`: adds slot-level `is_valid` and `in_use`, defines the
  invalidation trigger (module diff on Systems update) and the delete
  trigger (`!is_valid && !in_use` on Systems update or evaluate cycle);
  adds an in-session validity gate; mandates structured error IPC;
  unifies the empty-config response identifier; prescribes atomic parsing
  in the update path.

## Impact

- **Rust** (trigger-flow-manager):
  - `api/slot_channel_list.rs::Slot` - two new fields, wire through serde with camelCase.
  - `api/slot_channel_list.rs::update_slot_channel_list` - merge-by-slot_id logic; atomic parse; recompute in_use; delete step.
  - `api/state.rs::process_system_config` - error handling + in-session validity gate.
- **Rust** (kic-trigger-flow):
  - `back_end/client_server.rs::StdinLine::Systems` - unchanged behavior, but now benefits from correct `should_trigger_script` gating.
- **UI** (trigger-flow-ui):
  - `src/app/app.ts` switch case - already handles `empty_system_config_error`; no changes needed unless we add copy.
  - `slotChannelModel.ts` - add `isValid` and `inUse` on `Slot` interface/class.
  - Components that render slots - decide whether to visually gate on `isValid` (disable block panel, indicator, etc.); may land in a follow-up change.
- **Out of scope for this change**:
  - Channel-level state (`Channel.is_valid`, block-level flagging via `block_error`).
  - Catalog-driven per-block module compatibility.
  - TS-side gaps (`sendConfigData` gating, `ConifgWebView.ts` delete-last-system crash).
  - Full UI reaction (disable block panel while slot invalid). Tracked separately.

