## MODIFIED Requirements

### Requirement: In-session configuration reconciliation

The system SHALL rebuild `slot_channel_list` from scratch on every
`Systems` payload arriving after the fresh-init phase. The rebuild uses
the same logic as `SlotChannelList::new`: pick the `isActive: true`
entry, parse its local slots, apply the node selection filter, and set
`self.slots` / `self.nodes` / `self.localnode` / `self.is_valid`
accordingly. The system MUST NOT preserve any per-slot flags or state
across the rebuild (there are no per-slot flags in this design). The
rebuild MUST be atomic: parse `slots` and `nodes` into local `Vec`
bindings first; assign to `self.*` only when both parses succeed. If
the rebuilt `SlotChannelList` fails `is_valid_config()`, the system MUST
retain the previous state and emit the `empty_system_config_error` IPC
payload; existing trigger models MUST NOT be mutated.

#### Scenario: Valid in-session update replaces the list

- **WHEN** state has slot 1 with `MPSU50_2ST` and a new payload changes slot 1 to `MSMU60_2`
- **THEN** `slot_channel_list.slots[0].module` becomes `Module::MSMU60_2` (single entry per `slot_id` reflecting current hardware)
- **AND** existing entries in `models` are preserved unchanged; their `slot_module` snapshots capture the previous binding

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

### Requirement: Model captures slot_module snapshot at binding time

The system SHALL add a field `slot_module: Option<Module>` to
`TriggerModelState` with `#[serde(default)]`. The UI MUST set
`slot_module` to the current slot's module at the moment a model is
created or its slot binding is explicitly changed by the user. Rust
MUST NOT auto-update `slot_module`; the field persists across Systems
updates untouched.

#### Scenario: newModel captures slot_module

- **WHEN** the UI creates a new model on `localnode.slot[1]` while the current hardware reports slot 1 module as `MSMU60_2`
- **THEN** the model's `slot_module` is set to `Module::MSMU60_2`
- **AND** the model is shipped to Rust in the next `evaluate_request` with that value

#### Scenario: Systems update does not mutate slot_module

- **WHEN** a model has `slot_module: MSMU60_2` and a Systems payload changes slot 1 to `MPSU50_2ST`
- **THEN** after `process_system_config`, the model's `slot_module` remains `MSMU60_2`
- **AND** the model is now considered stale for its slot binding

#### Scenario: User rebind updates slot_module

- **WHEN** a stale model's slot dropdown is used to pick a valid entry with module `MPSU50_2ST`
- **THEN** the model's `slot_module` becomes `MPSU50_2ST`
- **AND** the model is no longer stale

### Requirement: Slot-referencing block parameters capture slot_module snapshot

The system SHALL, for every block parameter whose catalog type is
`SlotIndex`, capture a `slot_module` snapshot at the moment the
parameter is set. Storage on the block MUST be per-parameter (e.g.,
`slot_param_bindings: HashMap<String, Module>` where the key is the
parameter name) with `#[serde(default)]`. Rust MUST NOT auto-update
these snapshots. Catalog-declared parameter types drive which
parameters get snapshotted (auto-covered for future block types with
`SlotIndex` params).

#### Scenario: Notify block slot_index param snapshot on set

- **WHEN** the user sets a notify block's `slot_index` parameter to slot 3 on `localnode`, and current hardware reports slot 3 module as `MSMU60_2`
- **THEN** the block's `slot_param_bindings["slot_index"]` is set to `Module::MSMU60_2`

#### Scenario: Snapshot persists across Systems updates

- **WHEN** a notify block has `slot_param_bindings["slot_index"] = MSMU60_2` and slot 3's module changes to `MPSU50_2ST` via a Systems payload
- **THEN** the block's snapshot remains `MSMU60_2`
- **AND** the block is considered stale for that parameter

### Requirement: Per-binding staleness is derived from snapshot comparison

The system SHALL determine staleness per binding by comparing the
captured `slot_module` against the current hardware at the binding's
`(slot_id, node_id)`. A binding is stale iff:

- The binding has `slot_module = Some(m)`, AND
- The slot at `(slot_id, node_id)` in the current `slot_channel_list`
  is absent OR has a different `module` than `m`.

Bindings with `slot_module = None` (legacy sessions before backfill)
MUST be treated as valid.

#### Scenario: Model stale when its slot's module changed

- **WHEN** model A has `slot_index: 1, node_id: "localnode", slot_module: MSMU60_2`, and current hardware reports slot 1 module as `MPSU50_2ST`
- **THEN** model A is stale

#### Scenario: Model stale when its node identity changed

- **WHEN** model B has `slot_index: 1, node_id: "node3", slot_module: MSMU60_2`, and current hardware has no node with `nodeId == "node3"`
- **THEN** model B is stale

#### Scenario: Model with node localnode change is stale

- **WHEN** model C has `slot_index: 1, node_id: "localnode", slot_module: MSMU60_2` and current hardware's `localnode` is `"2450"` with no local slots
- **THEN** model C is stale

#### Scenario: Block parameter stale independently of its model

- **WHEN** model D has `slot_module: MSMU60_2` matching current hardware (model itself valid), but contains a notify block whose `slot_param_bindings["slot_index"]` is `MSMU60_2` referencing slot 3, and current hardware reports slot 3 as `MPSU50_2ST`
- **THEN** model D is not stale
- **AND** the notify block is stale

### Requirement: Node selection filter (unchanged)

The system SHALL, whenever the local mainframe is not the effective
mainframe (i.e., the localnode does not start with `"MP5"` or has no
non-Empty slots), filter the incoming `nodes` to at most one entry: the
first node in payload array order whose `mainframe.starts_with("MP5")`
AND has at least one non-Empty slot. The chosen node's `node_id` MUST
be preserved intact so any block referencing it via `node_id` continues
to resolve. Non-MP5 nodes and additional qualifying MP5 nodes MUST be
dropped. The filter MUST apply in both `SlotChannelList::new` (fresh
init) and the `SystemConfig` arm of `update_slot_channel_list`.

#### Scenario: MP5 local with installed module drops all nodes

- **WHEN** the active system has `localNode: "MP5103"` with at least one non-Empty local slot and a `nodes` array with any content
- **THEN** `slot_channel_list.nodes` is empty after processing

#### Scenario: Non-MP5 local with qualifying MP5 node keeps that node only

- **WHEN** the active system has `localNode: "2450"`, `nodes[0]` has `mainframe: "3706A"`, `nodes[1]` has `mainframe: "MP5103"` with a non-Empty slot, and `nodes[2]` has `mainframe: "MP5103"` with a non-Empty slot
- **THEN** `slot_channel_list.nodes` contains only the entry from payload `nodes[1]` with its `node_id` and slots preserved

#### Scenario: Non-MP5 local with only non-qualifying nodes yields empty nodes

- **WHEN** the active system has `localNode: "2450"` and every node either has `mainframe` not starting with `"MP5"` or has only Empty slots
- **THEN** `slot_channel_list.nodes` is empty
- **AND** downstream `is_valid_config()` returns `false`, producing `empty_system_config_error`

### Requirement: Recall backfills legacy sessions

The system SHALL, on every `RecallRequest`, walk `TriggerFlowState.models`
and back-fill any model whose `slot_module` is `None` with the module of
the currently-referenced slot from the live `slot_channel_list`. The
same backfill MUST apply to block-parameter `slot_param_bindings`
entries that are absent for `SlotIndex`-typed parameters that carry a
value. Legacy sessions saved before this feature MUST NOT be marked
stale on load; they align with current hardware via backfill and
participate in staleness detection from that point forward.

#### Scenario: Legacy model without slot_module gets backfilled

- **WHEN** a recall payload contains model A with `slot_index: 1, node_id: "localnode", slot_module: None`, and current hardware reports slot 1 module as `MPSU50_2ST`
- **THEN** after recall processing, model A has `slot_module = Some(MPSU50_2ST)`

#### Scenario: Legacy block param snapshot backfilled

- **WHEN** a recall payload contains a notify block whose `slot_index` parameter is set to `3` but has no `slot_param_bindings["slot_index"]` entry, and slot 3 currently has module `MSMU60_2`
- **THEN** after recall processing, `slot_param_bindings["slot_index"] = MSMU60_2`

### Requirement: Script generation skips stale models and stale block params

The system SHALL, in `Script::from_state`, iterate `TriggerFlowState.models`
and skip generation for any model whose `slot_module` is `Some(m)` and
`m != resolved_slot.module`. A skip MUST inject a comment marker in the
generated `.tsp` output identifying the model and reason. Similarly for
block-parameter snapshots: a block with any stale `slot_param_bindings`
entry MUST either be skipped in full or have its emission marked with
a comment noting the stale parameter.

#### Scenario: Stale model skipped with comment

- **WHEN** state has model A on slot 1 with `slot_module: MSMU60_2`, current slot 1 module is `MPSU50_2ST`, and script generation is invoked
- **THEN** model A is not emitted into the generated `.tsp`
- **AND** the `.tsp` contains a comment like `-- model 'A' skipped: slot 1 module changed since binding (was MSMU60_2, now MPSU50_2ST)`

#### Scenario: Non-stale models generate normally

- **WHEN** state has model B on slot 2 with `slot_module: MSMU60_2` and current slot 2 module is `MSMU60_2`
- **THEN** model B is emitted in full into the generated `.tsp`

### Requirement: UI derives virtual invalid dropdown entries

The system SHALL, on the UI side, compute a per-slot-dropdown display
that combines:

- Valid entries: one per slot present in `slot_channel_list.slots` and
  in each `slot_channel_list.nodes[i].slots`.
- Virtual invalid entries: one per stale binding, labeled with the
  binding's captured `slot_module`. Virtual entries MUST be deduped by
  `(slot_id, node_id, slot_module)` across all stale bindings.

Virtual invalid entries MUST be visually distinct from valid entries
(e.g., color, icon, label suffix) and MUST NOT be selectable when the
user is creating or rebinding a binding.

#### Scenario: Dropdown shows valid and invalid entries side by side

- **WHEN** state has model A on `localnode.slot[1]` with `slot_module: MSMU60_2`, and current hardware reports slot 1 module as `MPSU50_2ST`
- **THEN** the model's slot dropdown lists two entries: `localnode.slot[1] (MPSU50_2ST)` as a valid selectable option, and `localnode.slot[1] (MSMU60_2, invalid)` as a read-only visual entry

#### Scenario: Virtual entries are not selectable when creating new bindings

- **WHEN** the user opens the "create new model" modal, and the current derived dropdown includes a virtual invalid entry
- **THEN** the virtual invalid entry is not offered as a selectable option in that context
- **AND** only valid entries can be picked

### Requirement: UI greys out controls for stale bindings

The system SHALL, on the UI side, disable block-editing controls for
any model whose slot binding is stale, and disable per-parameter
editors for any block parameter whose slot-ref binding is stale. The
slot-selection dropdown on the affected model or block parameter MUST
remain interactive so the user can rebind. Grey-out MUST be per-binding
(a stale block parameter does not disable other blocks in the same
model or other parameters in the same block).

#### Scenario: Stale model greys out its block panel

- **WHEN** a model becomes stale (its `slot_module` no longer matches current hardware)
- **THEN** all block editing controls for that model are disabled
- **AND** only the model's slot dropdown remains interactive

#### Scenario: Stale block parameter greys out only that parameter

- **WHEN** a block within an otherwise-valid model has a stale slot-ref parameter
- **THEN** only that parameter's editor is disabled
- **AND** other parameters and other blocks in the same model remain interactive


