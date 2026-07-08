## 1. Error IPC and `request_type` unification

- [x] 1.1 Rename Rust's `"empty_config_response"` string to `"empty_system_config_error"` in `TriggerFlowState::process_system_config` and `IpcData` conversion for `ResponseType::EmptyConfigResponse`
- [ ] 1.2 Replace both `Err(_e) => "".to_string()` sinks in `TriggerFlowState::process_system_config` with a structured IPC payload of the form `{"request_type":"empty_system_config_error","additional_info":"","json_value":"{\"error\":\"...\"}"}`
- [ ] 1.3 Verify `should_trigger_script` in `kic-trigger-flow/src/back_end/client_server.rs::StdinLine::Systems` now correctly evaluates to `false` on the error path

## 2. In-session validity gate and atomic update

- [ ] 2.1 In `TriggerFlowState::process_system_config` else branch, call `self.slot_channel_list.is_valid_config()` on the freshly built list before persisting; if false, keep the previous state and return the `empty_system_config_error` IPC
- [ ] 2.2 In `SlotChannelList::update_slot_channel_list` `SystemConfig` arm, parse `slots` and `nodes` into locals first; assign to `self.slots`/`self.nodes`/`self.localnode`/`self.is_valid` only if both parses succeed
- [ ] 2.3 Add unit tests: (a) valid update accepted, (b) non-MP5 mid-session update rejected and prior state preserved, (c) update with malformed nodes slot rejected and `self.slots` unchanged

## 3. Slot-level `is_valid` and `in_use`

- [ ] 3.1 Add `pub is_valid: bool` and `pub in_use: bool` on `Slot` in `trigger-flow-manager/src/api/slot_channel_list.rs`; default both to `true` and `false` respectively; the existing `#[serde(rename_all = "camelCase")]` will emit `isValid` / `inUse`
- [ ] 3.2 Update `impl TryFrom<&SlotJson> for Slot` to set `is_valid: true, in_use: false` on construction
- [ ] 3.3 Update the two `SlotChannelList` builder sites (`new` fresh-init and the `SystemConfig` arm of `update_slot_channel_list`) to include the fields; keep the MP5-drop-nodes guard intact
- [ ] 3.4 Add a `Slot` unit test asserting the default flag values

## 4. Merge logic on Systems update

- [ ] 4.1 In `SlotChannelList::update_slot_channel_list` `SystemConfig` arm, replace the wholesale `self.slots = new_slots;` write with a merge-by-`slot_id`:
    - For each new slot, look up any existing slot with the same `slot_id`.
    - Not present before -> keep new slot as-is (`is_valid = true`).
    - Same module -> preserve the existing `is_valid` value.
    - Different module -> set `is_valid = false`.
- [ ] 4.2 After merging, recompute `Slot.in_use` for every slot from `trigger_flow_state.models` (extend the update signature or add a follow-up call site to pass models into the function)
- [ ] 4.3 Apply the delete rule: retain only slots where `is_valid || in_use`. Log each dropped slot to stderr with `slot_id`, previous module, and reason
- [ ] 4.4 Unit tests: (a) same module preserves flag, (b) different module flips flag with `in_use` preserved, (c) different module with no `in_use` drops the slot, (d) fresh slot_id added as valid, (e) missing slot_id from payload is dropped

## 5. Evaluate-cycle delete step

- [ ] 5.1 In the `TriggerFlowState` arm of `SlotChannelList::update_slot_channel_list`, after the existing `in_use` refresh on `Channel`, also recompute `Slot.in_use` for each slot
- [ ] 5.2 Apply the delete rule (retain only `is_valid || in_use`). Do not touch `is_valid`
- [ ] 5.3 Unit tests: (a) slot flagged invalid remains while `in_use` is true, (b) slot flagged invalid dropped when `in_use` becomes false, (c) valid slots never dropped

## 6. UI type updates (surface only)

- [ ] 6.1 Add `isValid: boolean` and `inUse: boolean` on `ISlot` and `Slot` in `trigger-flow-ui/src/app/models/slotChannelModel.ts`; copy them through in the constructor
- [ ] 6.2 Do not add UI behaviour yet; that lands in a follow-up change
- [ ] 6.3 Manual smoke test: `evaluate_response` payload from Rust now carries `isValid` / `inUse` fields on every slot, both defaulting to `true` / `false` under happy path

## 7. Cross-referenced follow-ups (outside this change)

- [ ] 7.1 Draft a follow-up change proposal for UI reaction: disable block panel and offer model reassignment when a model's slot is `!isValid`; also render slots with `!isValid` distinctly in the palette
- [ ] 7.2 Draft a separate change proposal for TS-side gaps: gate `sendConfigData` on `existingSystems.some(s => s.isActive === true)`; fix `ConifgWebView.ts` delete-last-system to guard `systemInfo[0].name`
- [ ] 7.3 Track the "SlotChannelList.is_valid field write inconsistency and unread" cleanup as a small change if it does not fall out of tasks 2.x above
- [ ] 7.4 Track future iteration: channel-level `is_valid`, block-level `block_error` for module drift, per-block-type compatibility in the catalog

