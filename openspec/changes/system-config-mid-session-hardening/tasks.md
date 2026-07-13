## 1. Retained from earlier iterations (done)

- [x] 1.1 Rename Rust's `"empty_config_response"` string to `"empty_system_config_error"` in `TriggerFlowState::process_system_config` and `IpcData` conversion for `ResponseType::EmptyConfigResponse`
- [x] 1.2 Add `select_first_mp5_node` helper in `slot_channel_list.rs`; call from both `SlotChannelList::new` and the `SystemConfig` arm of `update_slot_channel_list`. Preserves the chosen node's `node_id`; drops other nodes
- [x] 1.3 MP5 localnode rule: drop all nodes when the local mainframe starts with `"MP5"` and has at least one non-Empty slot

## 2. Roll back earlier iteration work (before Path 2 lands)

- [ ] 2.1 Remove `pub is_valid: bool` and `pub in_use: bool` fields from `Slot` in `trigger-flow-manager/src/api/slot_channel_list.rs`
- [ ] 2.2 Remove default assignments for those fields in `impl TryFrom<&SlotJson> for Slot`
- [ ] 2.3 Remove the merge-by-`slot_id` logic in the `SystemConfig` arm of `update_slot_channel_list`; replace with fresh rebuild (assign `self.slots = parsed_slots` after parsing)
- [ ] 2.4 Remove the slot-level delete rule (`retain(|s| s.is_valid || s.in_use)`) from both arms of `update_slot_channel_list`
- [ ] 2.5 Remove the stderr drop log lines (`Dropping slot ...`)
- [ ] 2.6 Optional: remove the `println!("SlotChannelList after new/update: {:?}", ...)` debug traces (kept for smoke testing today)
- [ ] 2.7 Remove `isValid` and `inUse` from `ISlot` and `Slot` in `trigger-flow-ui/src/app/models/slotChannelModel.ts`
- [ ] 2.8 Remove the `slot.inUse = true` write from `canvasBlocksService.newModel` in `trigger-flow-ui/src/app/services/canvas-blocks.service.ts`

## 3. Path 2 core - model-level snapshot

- [ ] 3.1 Add `slot_module: Option<Module>` to `TriggerModelState` in `trigger-flow-manager/src/api/state.rs` with `#[serde(default)]`
- [ ] 3.2 Add `slot_module` field on the corresponding UI type (`ITriggerModel` / `TriggerModel`) in `trigger-flow-ui/src/app/models/triggerFlowState.ts`; copy through constructor with `?? undefined` default
- [ ] 3.3 In `canvasBlocksService.newModel`, snapshot `slot_module` from the current slot's module (from `triggerFlowDataService.getSlotChannelList()`) at creation time. Handle both `nodeId === 'localnode'` and TSP-Link node cases
- [ ] 3.4 In model-slot dropdown handlers (e.g., model settings modal), update `model.slot_module` when the user picks a new slot. Confirm coverage across all rebind code paths (create modal, template instantiation, any programmatic assignment)
- [ ] 3.5 Unit tests: (a) snapshot captured on newModel, (b) snapshot updated on rebind, (c) snapshot round-trips through evaluate/recall

## 4. Path 2 core - block-parameter snapshot

- [ ] 4.1 Add per-block storage for slot-ref parameter snapshots. Preferred shape: `slot_param_bindings: HashMap<String, Module>` on `TriggerModelBlock` (parameter-name to captured module). `#[serde(default)]`
- [ ] 4.2 Expose parameter-type metadata from the catalog: identify which parameters on a block are typed `SlotIndex`. Read from `Catalog::blocks[block_type].parameters[*].type == "SlotIndex"` (or equivalent existing catalog structure)
- [ ] 4.3 UI: at any point a `SlotIndex`-typed parameter value is set (block-param editor, template instantiation, drag-drop), snapshot the current module for that `(slot_index, node_id)` into `block.slot_param_bindings[param_name]`
- [ ] 4.4 Unit tests: (a) snapshot captured when notify block's slot_index is set, (b) snapshot preserved across evaluate round-trip, (c) new SlotIndex-typed parameter in a hypothetical block type gets snapshot automatically (mock catalog)

## 5. Path 2 core - rebuild-from-scratch on Systems update

- [ ] 5.1 In `SlotChannelList::update_slot_channel_list::SystemConfig` arm, replace the current logic (merge-by-slot_id + delete rule) with fresh rebuild: parse `slots` and `nodes` into locals, apply the `select_first_mp5_node` filter (already implemented), assign `self.slots`/`self.nodes`/`self.localnode`/`self.is_valid`
- [ ] 5.2 In `SlotChannelListUpdate::TriggerFlowState` arm, keep the existing per-channel `in_use` refresh. Remove the delete rule and stderr log
- [ ] 5.3 Unit tests covering the fresh rebuild: (a) module change on slot 1 -> new list has slot 1 with new module, is_valid on the list flag reflects overall validity, (b) localnode change -> new list has new localnode, (c) node identity change -> new list has new node

## 6. Path 2 core - staleness derivation and script gen

- [ ] 6.1 Update `Script::from_state` in `trigger-flow-manager/src/script/mod.rs`: for each model, resolve `(slot_index, node_id)` in `slot_channel_list`; compare `model.slot_module` against the resolved slot's `module`. If different (and `slot_module` is `Some`), skip generation for that model and emit a comment marker in the `.tsp`
- [ ] 6.2 Similarly: for each block within a non-skipped model, if any `slot_param_bindings` entry does not match its current slot's module, skip that block and emit a marker. Alternative: emit the block but leave a comment for the affected param
- [ ] 6.3 Update `module_type` handlebars helper signature: accept optional `expected_module` argument. Under Path 2 (one entry per `slot_id`) the lookup itself is unambiguous; the helper uses `expected_module` for the stale detection path
- [ ] 6.4 Unit test the "skip stale model" path: state with a stale model produces `.tsp` where the stale model is absent and a skip-marker comment is present

## 7. Save / recall backfill

- [ ] 7.1 In `RequestProcessor::handle_recall_request` (or the RecallRequest handling in `state.rs`), after deserializing the incoming state, walk `models`. For each model with `slot_module == None`, snapshot the currently-referenced slot's module (from the current `slot_channel_list`) into `slot_module`
- [ ] 7.2 Similarly for block `slot_param_bindings`: if a slot-ref parameter is set but has no snapshot, backfill from current
- [ ] 7.3 Unit test: recall a state where `slot_module == None` for all models; after recall, all models have `slot_module = Some(<current slot's module>)`

## 8. Structured error IPC (still pending from earlier)

- [ ] 8.1 Replace both `Err(_e) => "".to_string()` sinks in `TriggerFlowState::process_system_config` with a structured IPC payload: `{"request_type":"empty_system_config_error","additional_info":"","json_value":"{\"error\":\"<reason>\"}"}`
- [ ] 8.2 Verify `should_trigger_script` in `kic-trigger-flow/src/back_end/client_server.rs::StdinLine::Systems` now correctly evaluates to `false` on the error path

## 9. In-session validity gate and atomic parse (still pending from earlier)

- [ ] 9.1 In `TriggerFlowState::process_system_config` else branch, call `self.slot_channel_list.is_valid_config()` on the freshly built list before persisting; if false, keep the previous state and return the `empty_system_config_error` IPC
- [ ] 9.2 In `SlotChannelList::update_slot_channel_list` `SystemConfig` arm, parse `slots` and `nodes` into locals first; assign to `self.*` only if both parses succeed
- [ ] 9.3 Unit tests: (a) valid update accepted, (b) non-MP5 mid-session update rejected and prior state preserved, (c) update with malformed nodes slot rejected and `self.slots` unchanged

## 10. UI - derive virtual invalid dropdown entries

- [ ] 10.1 Add a helper (say `services/slot-binding-helper.ts` or extend `model-resource-allocation.service.ts`) that, given the current `slot_channel_list` and `models`, returns:
    - The set of valid slot options (from hardware).
    - The set of virtual invalid options (one per stale binding, deduped by `(slot_id, node_id, slot_module)`).
- [ ] 10.2 Use the helper in `main-flow.ts::loadSlotOptions` (create-new-model dropdown) - valid entries only
- [ ] 10.3 Use the helper in the model settings modal slot picker - valid entries + the currently-selected invalid entry rendered read-only
- [ ] 10.4 Use the helper in the block-param editor for `SlotIndex`-typed fields (event-block, etc.) - valid entries + the currently-selected invalid entry rendered read-only
- [ ] 10.5 Ensure virtual invalid entries are visually distinct (color, icon, label suffix) and NOT selectable when creating a new binding

## 11. UI - grey out affected controls

- [ ] 11.1 Add a computed getter (signal or method) on the model view: `isStale` = `model.slot_module !== undefined && slot_channel_list_slot(model.slot_index, model.node_id)?.module !== model.slot_module`
- [ ] 11.2 Bind the block panel's `disabled` state to `model.isStale` for that model. When stale, only the slot dropdown remains interactive
- [ ] 11.3 Similarly for block params: bind the individual param editor's disabled state to a per-param staleness check
- [ ] 11.4 Visual indicator: e.g., a warning icon next to a stale model's name; hover explains "hardware changed since binding"

## 12. Smoke tests

- [ ] 12.1 Fresh session, MP5 local with one module -> evaluate_response with slot valid, model creation works
- [ ] 12.2 Fresh session, no MP5 anywhere -> `empty_system_config_error` reaches UI, user sees message
- [ ] 12.3 Mid-session module change on a model's slot -> model becomes stale, block panel greyed, virtual invalid entry visible in dropdown
- [ ] 12.4 User rebinds -> model becomes valid, block panel enabled
- [ ] 12.5 Notify block with cross-slot param, that other slot changes module -> block greyed, model itself remains interactive
- [ ] 12.6 Localnode identity change -> all models on `localnode` become stale
- [ ] 12.7 Elevated node identity change (node3 -> node5) -> models on `node3` become stale, models on `localnode` unaffected
- [ ] 12.8 Save a stale session, recall on a machine with matching hardware -> stale detection works; recall on different hardware -> new staleness detected
- [ ] 12.9 Recall of a legacy session (no `slot_module`) -> models backfill, appear valid; next config change triggers staleness normally

## 13. Cross-referenced follow-ups (outside this change)

- [ ] 13.1 Draft a separate change proposal for TS-side gaps: gate `sendConfigData` on `existingSystems.some(s => s.isActive === true)`; fix `ConifgWebView.ts` delete-last-system to guard `systemInfo[0].name`
- [ ] 13.2 Track the "SlotChannelList.is_valid field write inconsistency and unread" cleanup as a small change (unrelated to Path 2)
- [ ] 13.3 Track future iteration: channel-level `is_valid`, block-level `block_error` (if new use cases emerge)



