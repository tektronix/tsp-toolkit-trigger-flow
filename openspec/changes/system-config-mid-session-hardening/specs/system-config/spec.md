## MODIFIED Requirements

### Requirement: In-session configuration reconciliation

On any subsequent `Systems` payload, the system SHALL replace
`slot_channel_list.slots`, `nodes`, and `localnode` atomically and only if
`is_valid_config()` returns `true` on the result. If the incoming payload
is invalid, the system MUST reject the update, keep the previous
`slot_channel_list`, and emit the `empty_system_config_error` IPC payload.
`SlotChannelList::update_slot_channel_list` MUST parse `slots` and `nodes`
into locals first, assigning to `self.*` only when both parses succeed;
partial mutation on a mid-parse failure is prohibited. Existing trigger
models MUST NOT be silently mutated by the update itself, but blocks
affected by module drift SHALL be flagged per the "Module drift detection"
requirement below.

#### Scenario: Valid in-session update rewrites slots

- **WHEN** state already has an MP5103 with MPSU50_2ST in slot 1 and a new payload changes slot 1 to MSMU60_2
- **THEN** `slot_channel_list.slots[0].module` becomes `Module::MSMU60_2`
- **AND** existing entries in `models` are preserved

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
an `"error"` key with a human-readable reason. The system MUST NOT emit an
empty WebSocket text frame or trigger script regeneration on error. The
Angular UI switch in `trigger-flow-ui/src/app/app.ts` MUST dispatch this
`request_type` into a user-visible handler.

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

### Requirement: Module drift detection on trigger blocks

The system SHALL, on every `Systems` update (both fresh-init and
in-session) and on every `EvaluateRequest`/`RecallRequest`, compare each
`TriggerModelBlock` in `TriggerFlowState.models` against the current
`slot_channel_list`. If the module in the block's referenced slot differs
from a module the block is defined to support (per the catalog's
per-block-type compatibility metadata), the system MUST push a descriptive
error entry into that block's `block_error` naming the previous and
current module and the affected slot.

#### Scenario: Swapped module flags affected block

- **WHEN** state has a block on `slot_index: 1` that supports only `MPSU50_2ST`, and a new `Systems` payload changes slot 1 to `MSMU60_2`
- **THEN** after `process_system_config` returns, the block's `block_error` contains an entry describing the module change and marking the block as invalid

#### Scenario: Unchanged slot not flagged

- **WHEN** state has a block on slot 1 and a new `Systems` payload keeps slot 1 as the same module
- **THEN** the block's `block_error` is unchanged

#### Scenario: Slot becoming Empty flags block

- **WHEN** state has a block on slot 2 and a new `Systems` payload sets slot 2's module to `Empty`
- **THEN** the block's `block_error` contains an entry indicating the module was removed

### Requirement: Unused-block auto-removal on drift

The system SHALL, when a module drift is detected on a block classified as
"unused" (both `incoming` and `outgoing` are `None` AND `block_parameters`
equal the catalog's default for that block type), remove the block from
its containing model instead of flagging it. Removal MUST be logged to
stderr with the model name, block id, slot, previous module, and new
module. Blocks not meeting the "unused" criteria MUST be retained and
flagged per the drift detection requirement.

#### Scenario: Unused drifted block is removed

- **WHEN** an affected block has `incoming: None`, `outgoing: None`, and default parameters
- **THEN** it is removed from `TriggerFlowState.models[model_name].blocks`
- **AND** a stderr log line records the removal

#### Scenario: Wired drifted block is retained with error

- **WHEN** an affected block has `incoming: Some(_)` or `outgoing: Some(_)`
- **THEN** it remains in `models` and has a `block_error` entry

#### Scenario: Parameterized drifted block is retained with error

- **WHEN** an affected block has default wiring but any parameter differs from the catalog default
- **THEN** it remains in `models` and has a `block_error` entry
