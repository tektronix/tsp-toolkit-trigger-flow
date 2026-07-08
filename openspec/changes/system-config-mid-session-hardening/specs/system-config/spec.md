## MODIFIED Requirements

### Requirement: In-session configuration reconciliation

The system SHALL reconcile any subsequent `Systems` payload into
`slot_channel_list` atomically and only if `is_valid_config()` returns
`true` on the result. `SlotChannelList::update_slot_channel_list` MUST
parse `slots` and `nodes` into locals first, assigning to `self.*` only
when both parses succeed; partial mutation on a mid-parse failure is
prohibited. For each incoming slot, the system MUST merge by `slot_id`
against the previously stored slot: if the module differs, set
`is_valid = false` on the merged slot; if the module matches, preserve
the existing `is_valid` value. Slots not present in the incoming payload
MUST be removed. After merging, the system MUST recompute each slot's
`in_use` from `TriggerFlowState.models` and drop every slot where
`!is_valid && !in_use`. If the incoming payload as a whole fails
`is_valid_config()`, the previous `slot_channel_list` MUST be retained
unchanged and the `empty_system_config_error` IPC payload emitted.
Existing trigger models MUST NOT be mutated by this update.

#### Scenario: Same module preserves the slot as valid

- **WHEN** state has slot 1 with `MPSU50_2ST` and `is_valid: true`, and a new payload has slot 1 with `MPSU50_2ST`
- **THEN** `slot_channel_list.slots[0].is_valid` remains `true`
- **AND** the slot is retained regardless of `in_use`

#### Scenario: Different module with in_use flags the slot

- **WHEN** state has slot 1 with `MPSU50_2ST` and a model with `slot_index == 1`, and a new payload changes slot 1 to `MSMU60_2`
- **THEN** `slot_channel_list.slots[0].module` becomes `Module::MSMU60_2`
- **AND** `slot_channel_list.slots[0].is_valid` becomes `false`
- **AND** the slot is retained because `in_use` is `true`

#### Scenario: Different module without in_use drops the slot

- **WHEN** state has slot 1 with `MPSU50_2ST` and no model has `slot_index == 1`, and a new payload changes slot 1 to `MSMU60_2`
- **THEN** slot 1 is not present in `slot_channel_list.slots` after the update

#### Scenario: Invalid in-session update rejected

- **WHEN** state has a valid MP5 configuration and a new payload has `localNode: "2450"` with no MP5 nodes
- **THEN** the previous `slot_channel_list` is retained
- **AND** an IPC payload with `request_type: "empty_system_config_error"` is emitted

#### Scenario: Atomic parse on nodes failure

- **WHEN** the incoming payload has valid `slots` but a `nodes[i].slots[j]` with an unknown module string
- **THEN** `self.slots`, `self.nodes`, and `self.localnode` are all unchanged from the pre-call state
- **AND** an error IPC payload is emitted

### Requirement: Structured error surfacing

The system SHALL produce a serialized `IpcData` payload for every failure
inside `process_system_config` (no active system, unknown module type,
invalid slot index, invalid overall config on either branch) with
`request_type: "empty_system_config_error"` and a `json_value` containing
an `"error"` key with a human-readable reason. The system MUST NOT emit
an empty WebSocket text frame or trigger script regeneration on error.
The Angular UI switch in `trigger-flow-ui/src/app/app.ts` MUST dispatch
this `request_type` into a user-visible handler.

#### Scenario: Error swallowing is prohibited

- **WHEN** `SlotChannelList::new` returns `Err("Unknown module type: ...")`
- **THEN** the response is a non-empty JSON string with `request_type: "empty_system_config_error"` and `json_value` containing `"error"`
- **AND** `should_trigger_script` evaluates to `false` and no script regeneration is fired
- **AND** no empty text frame is sent over the WebSocket

#### Scenario: UI recognizes the error request_type

- **WHEN** the UI receives an `IpcData` with `request_type: "empty_system_config_error"`
- **THEN** the UI dispatches into a handler that surfaces the condition to the user
- **AND** does not log an "Unknown request type" warning

### Requirement: Fresh-init configuration validity gate

The system SHALL, on the first `Systems` payload after backend startup or
reset, evaluate `is_valid_config()` (mainframe starts with `"MP5"` AND at
least one non-Empty slot anywhere) before storing the derived
`SlotChannelList`. If invalid, the state MUST be reset to
`SlotChannelList::default()` and the `empty_system_config_error` IPC
payload emitted; the UI MUST recognize this response and surface the
condition to the user.

#### Scenario: Invalid fresh-init config resets state

- **WHEN** the first `Systems` payload has `localNode: "2450"` and no MP5 nodes
- **THEN** `slot_channel_list` is set to `SlotChannelList::default()`
- **AND** an IPC payload with `request_type: "empty_system_config_error"` is sent
- **AND** the UI does not enter a loading-forever state

## ADDED Requirements

### Requirement: Slot carries validity and usage flags

The system SHALL add two boolean fields to `Slot`: `is_valid` (default
`true`, JSON key `isValid`) and `in_use` (default `false`, JSON key
`inUse`). `is_valid` MUST be set only during `Systems` update processing.
`in_use` MUST be derived from `TriggerFlowState.models`: it is `true`
when at least one `TriggerModelState.slot_index` equals this slot's
`slot_id`, otherwise `false`. Both fields MUST be serialized on every
`SlotChannelList` payload sent to the UI.

#### Scenario: Fresh slot construction has default flags

- **WHEN** a slot is created via `Slot::try_from(&SlotJson)`
- **THEN** its `is_valid` is `true` and its `in_use` is `false`

#### Scenario: in_use reflects model presence

- **WHEN** `TriggerFlowState.models` contains a model with `slot_index == 2`
- **THEN** after the next reconciliation, `slot_channel_list.slots` for slot 2 has `in_use == true`

### Requirement: Slot deletion on evaluate cycle

The system SHALL, on every evaluate cycle
(`SlotChannelListUpdate::TriggerFlowState`), recompute each slot's
`in_use` from `TriggerFlowState.models` and drop every slot where
`!is_valid && !in_use`. The system MUST NOT modify any slot's `is_valid`
during this cycle.

#### Scenario: Flagged slot with in_use survives evaluate cycle

- **WHEN** slot 1 has `is_valid: false, in_use: true` and an evaluate cycle runs
- **THEN** slot 1 remains in `slot_channel_list.slots`
- **AND** its `is_valid` remains `false`

#### Scenario: Flagged slot without in_use is dropped on evaluate cycle

- **WHEN** slot 1 has `is_valid: false, in_use: true` and the user removes the only model referencing slot 1, then an evaluate cycle runs
- **THEN** the recompute sets `in_use` to `false`
- **AND** slot 1 is not present in `slot_channel_list.slots` after the cycle

#### Scenario: Valid slot never dropped by evaluate cycle

- **WHEN** slot 1 has `is_valid: true, in_use: false` and an evaluate cycle runs
- **THEN** slot 1 remains in `slot_channel_list.slots`

### Requirement: Recovery via delete and re-add

The system SHALL recover a flagged slot only through the delete-then-readd
cycle: a `!is_valid && !in_use` slot is dropped on the next trigger, and
the following `Systems` payload treats its `slot_id` as a fresh addition
with `is_valid: true`. Model reassignment MUST NOT clear `is_valid`
directly; the flag persists until the slot is deleted and re-added.

#### Scenario: Slot recovers only after delete and re-add

- **WHEN** slot 1 is dropped from `slot_channel_list.slots` (via evaluate cycle after `in_use` became false), and the next `Systems` payload includes slot 1 with `MSMU60_2`
- **THEN** slot 1 reappears with `is_valid: true, in_use: false, module: Module::MSMU60_2`

