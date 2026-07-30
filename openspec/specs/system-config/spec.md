# system-config

Living contract for how physical system configuration (the `Systems` payload)
flows from the tsp-toolkit VS Code extension into the trigger-flow backend and
out to the Angular UI.

## Purpose

Describe the ingestion, validation, and reconciliation of `Systems` payloads
arriving on the `kic-trigger-flow` process stdin, and the responses emitted to
the Angular UI over the WebSocket at `127.0.0.1:27951/ws`.

## Requirements

### Requirement: Wire payload shape

The system SHALL accept a newline-terminated JSON payload of the shape
`{ "systems": [ SystemConfigJson, ... ] }` on stdin, where each
`SystemConfigJson` has `name`, `localNode`, `isActive`, and optional `slots`
and `nodes`. `slotId` values MUST be of the form `slot[<u8>]`. Module strings
MUST be one of `"MPSU50-2ST"`, `"MSMU60-2"`, or `"Empty"`. Additional fields
in the JSON are ignored.

#### Scenario: Well-formed payload with a single active MP5 system

- **WHEN** stdin receives `{"systems":[{"name":"Bench","localNode":"MP5103","isActive":true,"slots":[{"slotId":"slot[1]","module":"MPSU50-2ST"}]}]}`
- **THEN** the process parses it into `StdinLine::Systems(Systems)` without error
- **AND** proceeds to `process_system_config`

#### Scenario: Malformed slotId is rejected

- **WHEN** the payload contains `"slotId": "1"` (missing the `slot[...]` wrapper)
- **THEN** `Slot::try_from` returns `Err("Invalid slot index: ...")` and no state mutation occurs

### Requirement: Active system selection

The system SHALL treat the entry with `"isActive": true` as the only source of
hardware configuration. Entries with `isActive` false, null, or missing MUST
be ignored. Under normal use the payload contains exactly one active entry
(guaranteed by the tsp-toolkit UI).

#### Scenario: One active entry selected among many

- **WHEN** `systems[]` contains two entries where the second has `isActive: true`
- **THEN** only the second entry's `localNode`, `slots`, and `nodes` are read
- **AND** the first entry has no effect on the resulting state

#### Scenario: No active entry rejected

- **WHEN** `systems[]` is empty or no entry has `isActive: true`
- **THEN** the system returns an error and does NOT mutate `TriggerFlowState`
- **AND** an IPC error payload is emitted to the UI so it can react

### Requirement: Wire to domain conversion

The system SHALL convert each `SlotJson` to a `Slot` with a `SlotIndex(u8)`
parsed from the numeric substring of `slot[N]`, a `Module` enum value chosen
by literal match on the module string, and exactly two synthesized channels
with `channel_index` 1 and 2 and `in_use: false`. Each `NodeJson` SHALL be
converted to `Nodes` with the same rules applied to its inner slots.

#### Scenario: Slot conversion produces synthesized channels

- **WHEN** a `SlotJson` with `"slotId": "slot[2]", "module": "MSMU60-2"` is converted
- **THEN** the resulting `Slot` has `slot_id: SlotIndex(2)`, `module: Module::MSMU60_2`, and two channels with `in_use: false`

### Requirement: MP5 localnode ignores TSP-Link nodes

The system SHALL discard the incoming `nodes` array when the active system's
`localNode` starts with `"MP5"` AND at least one local slot has a module
other than `Module::Empty`. An MP5 mainframe with only Empty slots or no
slots does NOT trigger this rule, so a valid TSP-Link configuration is
preserved.

#### Scenario: MP5 with installed modules drops nodes

- **WHEN** the active system has `localNode: "MP5103"`, `slots: [{"slotId":"slot[1]","module":"MPSU50-2ST"}]`, and `nodes: [{"nodeId":"node2",...}]`
- **THEN** the resulting `SlotChannelList.nodes` is empty
- **AND** `SlotChannelList.slots` contains the single MPSU50_2ST slot

#### Scenario: MP5 with only Empty slots preserves nodes

- **WHEN** the active system has `localNode: "MP5103"`, `slots: [{"slotId":"slot[1]","module":"Empty"}]`, and non-empty `nodes`
- **THEN** the resulting `SlotChannelList.nodes` reflects the payload's nodes

### Requirement: Fresh-init configuration validity gate

The system SHALL, on the first `Systems` payload after backend startup or
reset, evaluate `is_valid_config()` (mainframe starts with `"MP5"` AND at
least one non-Empty slot anywhere) before storing the derived
`SlotChannelList`. If invalid, the state MUST be reset to
`SlotChannelList::default()` and an error IPC payload emitted; the UI MUST
recognize this response and surface the condition to the user.

#### Scenario: Invalid fresh-init config resets state

- **WHEN** the first `Systems` payload has `localNode: "2450"` and no MP5 nodes
- **THEN** `slot_channel_list` is set to `SlotChannelList::default()`
- **AND** an IPC payload the UI recognizes as "empty system config" is sent
- **AND** the UI does not enter a loading-forever state

### Requirement: In-session configuration reconciliation

On any subsequent `Systems` payload, the system SHALL replace
`slot_channel_list.slots`, `nodes`, and `localnode` atomically. Existing
trigger models MUST NOT be silently mutated by this update. If the incoming
payload is invalid per `is_valid_config()`, the system MUST reject the
update, keep the previous `slot_channel_list`, and emit an error IPC payload.

#### Scenario: Valid in-session update rewrites slots

- **WHEN** state already has an MP5103 with MPSU50_2ST in slot 1 and a new payload changes slot 1 to MSMU60_2
- **THEN** `slot_channel_list.slots[0].module` becomes `Module::MSMU60_2`
- **AND** existing entries in `models` are preserved

#### Scenario: Invalid in-session update rejected

- **WHEN** state has a valid MP5 configuration and a new payload has `localNode: "2450"` with no MP5 nodes
- **THEN** the previous `slot_channel_list` is retained
- **AND** an error IPC payload is emitted describing the rejection

### Requirement: Structured error surfacing

The system SHALL produce a serialized `IpcData` error payload for every
failure inside `process_system_config` (no active system, unknown module
type, invalid slot index, invalid overall config). The payload's top-level
JSON MUST contain an `"error"` key. The system MUST NOT emit an empty
WebSocket text frame or trigger script regeneration on error.

#### Scenario: Error swallowing is prohibited

- **WHEN** `SlotChannelList::new` returns `Err("Unknown module type: ...")`
- **THEN** the response is a non-empty JSON string containing `"error"`
- **AND** `should_trigger_script` evaluates to `false` and no script regeneration is fired
- **AND** no empty text frame is sent over the WebSocket

### Requirement: Channel usage is derived, not authoritative

The system SHALL populate `Channel.in_use` by scanning
`TriggerFlowState.models` for blocks whose `get_used_channels()` includes
that channel on the same slot. This flag is informational for the UI. It
MUST NOT be the source of truth for block validity, which is derived from
the block's parameters compared against the current `slot_channel_list`.

#### Scenario: in_use reflects model usage

- **WHEN** a block in `models` references `slot_index 1, channel_index 2`
- **THEN** after reconciliation, `slot_channel_list.slots[0].channels[1].in_use` is `true`

### Requirement: Session-lifecycle stdin messages

The system SHALL accept `SessionPath` (`{"session":"...","folder":"..."}`),
`SessionData` (an `IpcData` envelope routed over stdin), `ResetSession`
(`{"reset":true}`), and `Shutdown` (`{"shutdown":true}`) as sibling variants
of the `StdinLine` untagged enum. These messages do NOT carry system
hardware configuration and MUST NOT be conflated with the `Systems` variant.

#### Scenario: ResetSession clears state

- **WHEN** stdin receives `{"reset":true}`
- **THEN** `TriggerFlowState.catalog` becomes `None`
- **AND** `slot_channel_list` becomes `SlotChannelList::default()`
- **AND** `models` is emptied
