# system-config-mid-session-hardening

## Why

Mid-session `Systems` payload changes today are silent: invalid updates
overwrite state without a validity gate, errors are swallowed to `""` (which
spuriously triggers script regen and sends empty WS frames), the intended
"empty config" IPC uses a `request_type` string the UI does not recognize,
and there is no detection when a module swap invalidates existing trigger
blocks. This blocks safe hardware reconfiguration during an active session.

## What Changes

- Gate the in-session update branch of `process_system_config` on
  `is_valid_config()`, matching the fresh-init branch. Reject invalid
  payloads and keep prior state.
- Replace both `Err(_e) => "".to_string()` sinks in `process_system_config`
  with structured `IpcData` error payloads so `should_trigger_script`
  correctly evaluates to `false` and the UI receives a non-empty frame.
- Unify the `request_type` string used for "no usable hardware" between the
  Rust emitter and the UI switch in `trigger-flow-ui/src/app/app.ts`.
- Detect module drift on `Systems` update: for each existing trigger block
  whose slot's module changed, flag it via `TriggerModelBlock.block_error`
  with a clear message.
- Classify affected blocks as in-use vs unused. Auto-remove blocks that are
  unused (default parameters, no wiring); leave in-use blocks flagged for
  the user to resolve.
- Fix the partial-state hazard in `SlotChannelList::update_slot_channel_list`
  where a mid-parse failure on `nodes` leaves `self.slots` written but
  `self.nodes` and `self.is_valid` stale.

## Capabilities

### New Capabilities

<!-- None. All changes target the existing system-config capability. -->

### Modified Capabilities

- `system-config`: adds an in-session validity gate, mandates structured
  error IPC, unifies the empty-config response identifier, adds module-drift
  detection surfaced through `block_error`, and prescribes atomic parsing
  in the update path.

## Impact

- **Rust** (trigger-flow-manager):
  - `api/state.rs::process_system_config` - error handling + update-branch gate + drift detection.
  - `api/slot_channel_list.rs::update_slot_channel_list` - atomic parse of slots/nodes before mutation.
  - `validator/instr_validator.rs` or a new sibling validator - module compatibility check per block.
- **Rust** (kic-trigger-flow):
  - `back_end/client_server.rs::StdinLine::Systems` - unchanged behavior, but now benefits from correct `should_trigger_script` gating.
- **UI** (trigger-flow-ui):
  - `src/app/app.ts` switch case - rename `empty_system_config_error` OR the Rust emitter, whichever we settle on.
  - Any component that renders `block_error` may need a copy update if we distinguish "module changed" from "channel conflict".
- **Catalog / triggerBlocks.yaml**:
  - Requires a per-block `compatible_modules` field (or equivalent) so drift detection knows which modules each block type supports. Exact field TBD in Phase 0.
- **Out of scope**: TS side (`sendConfigData` gating in `triggerFlowWebViewManager.ts`, the delete-last-system crash in `ConifgWebView.ts`) - tracked separately; may be picked up in a follow-up change.
