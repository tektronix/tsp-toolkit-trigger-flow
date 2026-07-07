## 1. Phase 0 - Catalog audit and shared plumbing

- [ ] 1.1 Read `BlockDefinition` in `trigger-flow-manager/src/trigger_model_blocks/catalog.rs` and `triggerBlocks.yaml`; determine whether module compatibility per block type already exists (field name, encoding, coverage)
- [ ] 1.2 If missing, propose the field shape (name, position, default) and add it to `BlockDefinition` and `triggerBlocks.yaml` for all existing block types
- [ ] 1.3 Extend `Catalog` accessors so a validator can cheaply look up compatible modules by `block_type`

## 2. Error IPC and `request_type` unification

- [ ] 2.1 Replace both `Err(_e) => "".to_string()` sinks in `TriggerFlowState::process_system_config` with a structured IPC payload of the form `{"request_type":"empty_system_config_error","additional_info":"","json_value":"{\"error\":\"...\"}"}`
- [ ] 2.2 Rename Rust's `"empty_config_response"` string to `"empty_system_config_error"` in `process_system_config`
- [ ] 2.3 Verify `should_trigger_script` in `kic-trigger-flow/src/back_end/client_server.rs::StdinLine::Systems` now correctly evaluates to `false` on the error path
- [ ] 2.4 Add a UI-side integration test (or manual smoke test) that a non-MP5 fresh-init payload lands in the `empty_system_config_error` case of the switch in `trigger-flow-ui/src/app/app.ts` and displays a user-visible message

## 3. In-session validity gate and atomic update

- [ ] 3.1 In `TriggerFlowState::process_system_config` else branch, call `self.slot_channel_list.is_valid_config()` on the freshly built list before persisting; if false, keep the previous state and return the same `empty_system_config_error` IPC
- [ ] 3.2 In `SlotChannelList::update_slot_channel_list` `SystemConfig` arm, parse `slots` and `nodes` into locals first; assign to `self.slots`/`self.nodes`/`self.localnode`/`self.is_valid` only if both parses succeed
- [ ] 3.3 Add unit tests covering: (a) valid update, (b) non-MP5 mid-session update (rejected, state unchanged), (c) update with malformed nodes slot (rejected, `self.slots` unchanged)

## 4. Module-drift detection (Phase 1 - detection only)

- [ ] 4.1 Create `trigger-flow-manager/src/validator/module_compat_validator.rs` implementing `Validator` trait; for each block, look up `compatible_modules` via the catalog and compare against `slot_channel_list.slots[i].module`
- [ ] 4.2 Wire the new validator into the chain in `RequestProcessor::new`, after `InstrumentValidator`
- [ ] 4.3 On drift, push a `(true, "Module changed from X to Y on slot N; this block is no longer valid")` entry into `block.block_error`
- [ ] 4.4 Ensure the validator runs during `handle_evaluate_request` and `handle_recall_request`, and after `process_system_config` in-session updates
- [ ] 4.5 Add unit tests for drift detection: unchanged slot (no error), swapped module (error), slot became Empty (error)

## 5. Classification and auto-remove (Phase 2-3)

- [ ] 5.1 Add a helper on `TriggerModelBlock` (or a free function) that reports whether a block is "in use" per the design decision: `incoming.is_some() || outgoing.is_some() || parameters_differ_from_default(catalog, block_type, block_parameters)`
- [ ] 5.2 On successful `Systems` update inside `process_system_config`, iterate `models`, run module-drift detection, and remove blocks classified as "unused" whose slot's module changed
- [ ] 5.3 Log each removal to stderr with block id, model name, slot, old module, new module
- [ ] 5.4 Emit the resulting `evaluate_response` reflecting removed blocks; do not emit a separate notification
- [ ] 5.5 Unit tests: (a) unused drifted block removed, (b) wired drifted block kept with error, (c) parameterized drifted block kept with error, (d) unaffected blocks untouched

## 6. UI copy and follow-up (Phase 4)

- [ ] 6.1 Review the way `block_error` is rendered in `trigger-flow-ui` and confirm module-drift errors read acceptably
- [ ] 6.2 If needed, distinguish "module changed" errors from "channel conflict" errors visually (icon or label)
- [ ] 6.3 Document the new behavior in the change spec and archive

## 7. Cross-referenced follow-ups (outside this change)

- [ ] 7.1 Draft a separate change proposal for TS-side gaps: gate `sendConfigData` in `triggerFlowWebViewManager.ts::listenToConfigChanges` on `existingSystems.some(s => s.isActive === true)`; fix `ConifgWebView.ts` delete case to promote-in-single-write and guard `systemInfo[0].name` when deleting last
- [ ] 7.2 Track the "is_valid field write inconsistency and unread" cleanup as a separate small change if it does not fall out of tasks 3.x above
