## 1. Retained from earlier iterations — done

- [x] 1.1 Rename Rust's `"empty_config_response"` string to `"empty_system_config_error"` in `TriggerFlowState::process_system_config` and `IpcData` conversion for `ResponseType::EmptyConfigResponse`
- [x] 1.2 Add `select_first_mp5_node` helper in `slot_channel_list.rs`; call from both `SlotChannelList::new` and the `SystemConfig` arm of `update_slot_channel_list`. Preserves the chosen node's `node_id`; drops other nodes
- [x] 1.3 MP5 localnode rule: drop all nodes when the local mainframe starts with `"MP5"` and has at least one non-Empty slot

## 2. Roll back earlier iteration work — done

- [x] 2.1 Remove `pub is_valid: bool` and `pub in_use: bool` fields from `Slot` in `trigger-flow-manager/src/api/slot_channel_list.rs`
- [x] 2.2 Remove default assignments for those fields in `impl TryFrom<&SlotJson> for Slot`
- [x] 2.3 Remove the merge-by-`slot_id` logic in the `SystemConfig` arm of `update_slot_channel_list`; replace with fresh rebuild (assign `self.slots = parsed_slots` after parsing)
- [x] 2.4 Remove the slot-level delete rule (`retain(|s| s.is_valid || s.in_use)`) from both arms of `update_slot_channel_list`
- [x] 2.5 Remove the stderr drop log lines (`Dropping slot ...`)
- [x] 2.6 Optional: remove the `println!("SlotChannelList after new/update: {:?}", ...)` debug traces (kept for smoke testing today)
- [x] 2.7 Remove `isValid` and `inUse` from `ISlot` and `Slot` in `trigger-flow-ui/src/app/models/slotChannelModel.ts`
- [x] 2.8 Remove the `slot.inUse = true` write from `canvasBlocksService.newModel` in `trigger-flow-ui/src/app/services/canvas-blocks.service.ts`

## 3. Path 2 core — model-level snapshot

- [x] 3.1 Add `slot_module: Option<Module>` to `TriggerModelState` in `trigger-flow-manager/src/api/state.rs` with `#[serde(default)]`
- [x] 3.2 Add `slot_module` field on the corresponding UI type (`ITriggerModel` / `TriggerModel`) in `trigger-flow-ui/src/app/models/triggerFlowState.ts`; copy through constructor with `?? null` default
- [x] 3.3 In `canvasBlocksService.newModel` (and `addBlocksFromTemplate`), snapshot `slot_module` via new private helper `snapshotSlotModule(slotIndex, nodeId)`. Handles both `nodeId === 'localnode'` and TSP-Link node cases
- [ ] 3.4 In model-slot dropdown handlers (e.g., model settings modal), update `model.slot_module` when the user picks a new slot. Confirm coverage across all rebind code paths (create modal, template instantiation, any programmatic assignment)
- [ ] 3.5 Unit tests: (a) snapshot captured on newModel, (b) snapshot updated on rebind, (c) snapshot round-trips through evaluate/recall

## 4. Path 2 core — block-parameter snapshot — DEFERRED (post-MVP)

Scope pared back to model-level for first delivery. Per-block-param `SlotIndex` snapshots (needed for cross-slot notify-block-param staleness) land as a follow-up change. Existing behaviour for those params is unchanged from shipping (no regression, no protection).

- [ ] 4.1 [deferred] Add per-block storage for slot-ref parameter snapshots. Preferred shape: `slot_param_bindings: HashMap<String, Module>` on `TriggerModelBlock` (parameter-name to captured module). `#[serde(default)]`
- [ ] 4.2 [deferred] Expose parameter-type metadata from the catalog: identify which parameters on a block are typed `SlotIndex`
- [ ] 4.3 [deferred] UI: at any point a `SlotIndex`-typed parameter value is set, snapshot the current module for that `(slot_index, node_id)` into `block.slot_param_bindings[param_name]`
- [ ] 4.4 [deferred] Unit tests for block-param snapshot capture and round-trip

## 5. Path 2 core — rebuild-from-scratch on Systems update — done via §2 rollback

- [x] 5.1 In `SlotChannelList::update_slot_channel_list::SystemConfig` arm, replaced the earlier merge-by-slot_id + delete rule with fresh rebuild (parse into locals via `Slot::try_from`, apply `select_first_mp5_node` filter, assign `self.slots` / `self.nodes` / `self.localnode` / `self.is_valid`)
- [x] 5.2 In `SlotChannelListUpdate::TriggerFlowState` arm, kept the per-channel `in_use` refresh. Removed the delete rule and stderr log
- [x] 5.3 Unit tests covering the fresh rebuild in `slot_channel_list.rs::fresh_rebuild_tests`: (a) module change on slot 1 -> new list has slot 1 with new module, (b) localnode identity change -> localnode string updated, (c) node identity change -> node[3] replaced by node[5]

## 6. Path 2 core — staleness derivation and script gen

- [x] 6.1 `Script::from_state` in `trigger-flow-manager/src/script/mod.rs`: for each model, call `model.is_stale(&state.slot_channel_list)`; if stale, remove from the state clone before rendering and prepend `-- model 'name' skipped: stale binding` markers to the rendered `contents`
- [ ] 6.2 [deferred with §4] Similarly for block-param staleness — skip blocks whose `slot_param_bindings` mismatch, or leave a comment for the affected param
- [ ] 6.3 [deferred with §4] Update `module_type` handlebars helper signature to accept optional `expected_module` for block-param resolution
- [x] 6.4 Unit test the "skip stale model" path: `stale_model_is_skipped_with_comment` in `script::script_tests` asserts marker present, no `trigger.model.create` emitted

## 6a. Path 2 core — staleness predicate — done

- [x] 6a.1 `TriggerModelState::is_stale(&SlotChannelList) -> bool` on Rust (`state.rs`) — treats `None` snapshot as stale (broken state); compares `slot_module` against `current_module(&list)` at `(node_id, slot_index)`
- [x] 6a.2 `TriggerModelState::current_module(&SlotChannelList) -> Option<Module>` private helper — reusable for future script-gen module resolution
- [x] 6a.3 Six unit tests locking the predicate semantics (`is_stale_tests` mod in `state.rs`): match, module differs, slot missing, snapshot None, elevated node missing, elevated node match
- [x] 6a.4 UI mirror `isModelStale(model, list)` in `triggerFlowState.ts` — same semantics as Rust; accepts `Pick<ITriggerModel, 'slot_index'|'node_id'|'slot_module'>` so both class and plain-object model types work — **SUPERSEDED by §6d**: UI reads `model.model_error` directly; mirror deleted

## 6b. Path 2 core — validator skip — done

- [x] 6b.1 `CatalogValidator::validate` skips stale models before block-uniqueness / catalog-lookup pass — **REWORKED by §6c.7**: gate switches from `is_stale(list)` to `has_system_config_error()`
- [x] 6b.2 `InstrumentValidator::validate` skips stale models before channel-conflict pass — **REWORKED by §6c.7**
- [x] 6b.3 Uses disjoint-field borrow — `let list = &state.slot_channel_list;` alongside `state.models.iter_mut()` (no clone needed) — obsolete after §6c.7 removes the list read at the validator gate

## 6c. Path 2 promotion — Rust-owned `model_error` field — done

- [x] 6c.1 Add `ModelErrorKind` enum in `trigger-flow-manager/src/api/state.rs` with single variant `SystemConfig` and `#[serde(rename_all = "snake_case")]`. Public. Future kinds (`Validation`, `NameConflict`, etc.) additive
- [x] 6c.2 Add `pub model_error: Vec<(ModelErrorKind, String)>` field on `TriggerModelState` with `#[serde(skip_serializing_if = "Vec::is_empty", default)]`. Derived state; absent from the wire when empty (so healthy models stay clean); repopulated by every recompute pass; legacy sessions load as `[]`
- [x] 6c.3 Add three methods on `TriggerModelState`: `diagnose_system_config(&self, &SlotChannelList) -> Option<String>` (reason logic + message composition in one place; checks in order: snapshot missing, node missing, slot missing, module mismatch); `recompute_error(&mut self, &SlotChannelList)` (clears vec, pushes diagnosis result); `has_system_config_error(&self) -> bool` (narrow gate — only `SystemConfig` kind blocks; future kinds informational)
- [x] 6c.4 Add `TriggerFlowState::recompute_all_model_errors(&mut self)` iterating `models.values_mut()` against a disjoint borrow of `slot_channel_list`
- [x] 6c.5 Reduce `TriggerModelState::is_stale` to a one-line delegate over `diagnose_system_config(...).is_some()`. Keeps existing 6 `is_stale_tests` passing without porting
- [x] 6c.6 Insert `recompute_all_model_errors()` calls at three sites: `state.rs::process_system_config` (before each `self.clone()` in both success arms — fresh init and in-session update); `request_processor.rs::handle_evaluate_request` (after `slot_channel_list` update, before validation); `request_processor.rs::handle_recall_request` (after backfill AND `slot_channel_list` update, before validation). Error/`EmptyConfigResponse` arms skip recompute (list is reset)
- [x] 6c.7 Switch three consumers from `is_stale(list)` to `has_system_config_error()`: `validator/catalog_validator.rs`, `validator/instr_validator.rs`, `script/mod.rs::Script::from_state`
- [x] 6c.8 Tests: `model_error_tests` module covers four diagnose cases (snapshot missing, node missing, slot missing, module mismatch), clears-on-heal, and wire visibility (`model_error_absent_from_wire_when_empty` + `model_error_present_on_wire_when_non_empty`). 22 tests total, all passing

## 6d. UI switchover to `model_error` field — done

- [x] 6d.1 Add `model_error: [ModelErrorKind, string][]` on `ITriggerModel` / `TriggerModel` in `trigger-flow-ui/src/app/models/triggerFlowState.ts`; copy through constructor with `?? []` default. Add matching TS `ModelErrorKind` enum with `system_config` variant. Also add `model_error` field to the inline model shape in `canvas-blocks.service.ts` (four insertion points) so the service round-trips the field from wire through canvas state
- [x] 6d.2 Delete the `isModelStale` TS mirror from `triggerFlowState.ts`. All consumers switch to reading `model.model_error`
- [x] 6d.3 In `main-flow/canvas/canvas.ts`: rename `getSectionIsStale` → `getSectionHasModelError` reading `(model?.model_error?.length ?? 0) > 0`; delete `getSectionStaleTooltip` — model errors now fold into the existing error-icon rollup via `errorMaps` (model messages first, blank-line separator, then per-block messages). Remove `slotChannelList$()` signal reads
- [x] 6d.4 In `main-flow/canvas/canvas.html`: rename `[class.section-title--stale]` → `[class.section-title--has-model-error]`; remove `[title]` binding on section-title (tooltip lives on the error icon)
- [x] 6d.5 In `main-flow/canvas/canvas.scss`: rename `.section-title--stale` → `.section-title--has-model-error`. Keep red border + tinted background. `pointer-events: auto` no longer needed since tooltip moved to the icon which already has pointer events enabled
- [x] 6d.6 Task **11a.1** obsoleted (see §11a.1 note)

## 7. Save / recall backfill

- [x] 7.1 In `RequestProcessor::handle_recall_request`, walk `trigger_flow_state.models`; for any model with `slot_module.is_none()`, snapshot the currently-referenced slot's module from the saved `slot_channel_list` in the same payload
- [ ] 7.2 [deferred with §4] Similarly for block `slot_param_bindings`
- [x] 7.3 Unit tests in `request_processor.rs::recall_backfill_tests`: `recall_backfills_slot_module_from_saved_list` (legacy state where `slot_module == None` gets filled from the saved slot list) and `recall_preserves_existing_snapshot` (existing snapshot untouched; module mismatch surfaces as a `ModuleChanged` warning)

## 8. Structured error IPC — still pending

- [x] 8.1 Replace both `Err(_e) => "".to_string()` sinks in `TriggerFlowState::process_system_config` with a structured IPC payload: `{"request_type":"empty_system_config_error","additional_info":"<reason>","json_value":"<serialized state with mass-stale models, or empty>"}`. Extended to also cover the Ok-but-invalid path (see §9.1) via a shared `emit_empty_config` helper.
- [x] 8.2 `should_trigger_script` helper in `kic-trigger-flow/src/back_end/client_server.rs` now gates on `request_type == "empty_system_config_error"` in addition to top-level `error`. Applied at all three call sites (WebSocket, Stdin Systems, SessionData).

## 9. In-session validity gate and atomic parse — still pending

- [x] 9.1 In-session update branch now gates on `is_valid_config()` symmetrically with fresh-init. On invalid, resets `slot_channel_list` to `default()`, recomputes to mass-stale every model, and emits `empty_system_config_error` carrying the state in `json_value` so the UI can render the stale flags. Catalog left untouched so the UI still has block metadata.
- [x] 9.2 In `SlotChannelList::update_slot_channel_list` `SystemConfig` arm, parse `slots` and `nodes` into locals first; assign to `self.*` only if both parses succeed. Makes the method fully transactional: on `Err`, `self` is untouched.
- [x] 9.3 Unit tests covering: valid update accepted, in-session parse-fail mass-stales + carries state, in-session Ok-but-invalid mass-stales + carries state, fresh-init parse-fail returns empty error without state, fresh-init Ok-but-invalid returns empty error without state, healed-after-reconfigure clears error, recall-completion attaches catalog, in-session normal update clears catalog (`process_system_config_tests` module in `state.rs`, 9 tests)

## 10. UI — derive virtual invalid dropdown entries — still pending

- [x] 10.1 `SlotBindingHelperService` in `trigger-flow-ui/src/app/services/slot-binding-helper.service.ts` exposes `validOptions()` (non-Empty slots present in hardware with available capacity). Virtual-invalid options deferred with §10.3 — will land when the model settings rebind picker arrives.
- [x] 10.2 `main-flow.ts::computeSlotOptions` now delegates to `SlotBindingHelperService.validOptions()`. Same behavior as before (valid entries only); one source of truth going forward
- [ ] 10.3 Use the helper in the model settings modal slot picker — valid entries + the currently-selected invalid entry rendered read-only
- [ ] 10.4 [deferred with §4] Use the helper in the block-param editor for `SlotIndex`-typed fields
- [ ] 10.5 Ensure virtual invalid entries are visually distinct (color, icon, label suffix) and NOT selectable when creating a new binding

## 11. UI — grey out affected controls

- [x] 11.1 `getSectionIsStale(modelName)` on canvas component reads `slotChannelList$()` signal + delegates to `isModelStale`. Reactive: Angular's signal-based CD re-invokes the getter on every hardware update — **REPLACED by §6d.3**: reads pre-computed `model.model_error`; no signal read needed
- [x] 11.2 Block panel `disabled` state bound to `isModelStale()` in `block-parameters.ts`, which narrowed to blocking `system_config` kind only via the taxonomy split. Warning-only entries (`module_changed`) do not disable the panel so the user can adjust module-specific params
- [ ] 11.3 [deferred with §4] Similarly for block params: bind the individual param editor's disabled state to a per-param staleness check
- [x] 11.4 Visual indicator: stale section header uses `--vscode-editorError-foreground` red — 2px border + tinted background via `color-mix`. Tooltip via `getSectionStaleTooltip(modelName)` reads `"Hardware changed since binding. Was: X. Now: Y. Rebind to recover."` — uniform with existing error indicators (`.error-icon--has-error`, `.node-wrapper--error`)

## 11a. UI — reactivity gaps found during audit

- [ ] 11a.1 `event-block.ts` caches `slotChannelList` to a private field in `ngOnChanges`; only refreshes when a parent `@Input()` changes. Convert to signal-based read (or `effect()`) so mid-session Systems updates flow through — **OBSOLETED by §6c/§6d**: staleness now rides on `models$`; the cached-list class of bugs no longer applies to model-level error state. Retain only if `event-block.ts` uses `slotChannelList` for something other than staleness
- [ ] 11a.2 Confirm `model-resource-allocation.service.ts` methods called from templates are re-invoked on `slot_channel_list` changes (they read via `getSlotChannelList()` — fine when a signal in the same render pipeline changes; risky when not)

## 12. Smoke tests — still pending

- [ ] 12.1 Fresh session, MP5 local with one module -> evaluate_response with slot valid, model creation works
- [ ] 12.2 Fresh session, no MP5 anywhere -> `empty_system_config_error` reaches UI, user sees message
- [ ] 12.3 Mid-session module change on a model's slot -> model becomes stale, block panel greyed, virtual invalid entry visible in dropdown
- [ ] 12.4 User rebinds -> model becomes valid, block panel enabled
- [ ] 12.5 [deferred with §4] Notify block with cross-slot param, that other slot changes module -> block greyed, model itself remains interactive
- [ ] 12.6 Localnode identity change -> all models on `localnode` become stale
- [ ] 12.7 Elevated node identity change (node3 -> node5) -> models on `node3` become stale, models on `localnode` unaffected
- [ ] 12.8 Save a stale session, recall on a machine with matching hardware -> stale detection works; recall on different hardware -> new staleness detected
- [ ] 12.9 Recall of a legacy session (no `slot_module`) -> models backfill, appear valid; next config change triggers staleness normally

## 13. Cross-referenced follow-ups (outside this change)

- [ ] 13.1 Draft a separate change proposal for TS-side gaps: gate `sendConfigData` on `existingSystems.some(s => s.isActive === true)`; fix `ConifgWebView.ts` delete-last-system to guard `systemInfo[0].name`
- [ ] 13.2 Track the "SlotChannelList.is_valid field write inconsistency and unread" cleanup as a small change (unrelated to Path 2)
- [ ] 13.3 Track future iteration: channel-level `is_valid`, block-level `block_error` (if new use cases emerge)
- [ ] 13.4 Follow-up change proposal: Path 2 block-param snapshot (§4, §6.2/6.3, §7.2, §10.4, §11.3, §12.5) — enables per-block-param staleness for notify-block cross-slot params
- [ ] 13.5 UI normalizer bypass + snapshot-driven option lookup (Gate A/B/D from design discussion): `normalizeParameterValues(..., isBindingStale)` short-circuits on stale; `moduleTraits` static table (Module → channels, Module → constraint key); `getChannelOptionsForBlock` / `getModuleForBlock` / `getConstraintKeyForSlot` route via a resolver so stale bindings render against snapshot module. Needed before we let users edit stale block panels safely; not needed for grey-out-only phase
- [ ] 13.6 Normalize `block_error` shape to match `model_error`: change Rust `Option<Vec<BlockErrorEntry>>` → `Vec<BlockErrorEntry>` with `#[serde(default)]`; TS `BlockErrorEntry[] | null` → `BlockErrorEntry[]`; drop null-check branches in `hasBlockErrorItems`, `getBlockMessages`, and constructor defaults. Purely a cleanup — no downstream reader currently distinguishes `None` from `Some(vec![])`. Out of scope for this change.
- [ ] 13.7 Preserve block selection across mid-session Systems updates. Root cause found via diagnostic trace: the recall response from `handle_recall_request` never reaches the UI — recall arrives via `StdinLine::SessionData` before the WebSocket reconnects, so the response is written to a not-yet-connected socket and lost. The UI only learns about recalled models via the follow-up Systems response, which currently must carry catalog so the UI takes its full-rebuild path (`loadSessionData`). The `is_recall_completion` heuristic in `process_system_config` (attach catalog when models exist) is doing that job — but it also fires on every mid-session hardware change, forcing a full rebuild that wipes the user's block selection. Correct fix: change the UI's decision from "rebuild when `payload.catalog` present" to "rebuild when the payload has any model name not in local" — handles fresh init, recall-via-Systems, and mid-session updates correctly. With that UI change in place, Rust can drop `is_recall_completion` and always set `self.catalog = None` in the mid-session else branch. Not blocking current implementation — red border and stale banner still surface correctly on mid-session hardware changes; only block selection is lost.
- [ ] 13.8 Channel-usage semantics inconsistency. `is_channel_in_use` (Rust) and `getChannelOptionsForBlock` (UI) both compute "channel used by other models" independently, both include stale models, and have narrow field coverage (`channel_list` only in UI; both `channel_index` and `channel_list` in Rust). `Channel.in_use` on the wire is written by `update_slot_channel_list(TriggerFlowState variant)` but never read. Fix scope: (1) decide semantics for stale bindings (do they reserve channels?); (2) unify the UI and Rust computations, or make the UI consume `Channel.in_use` from the wire; (3) cover both single-channel (`channel_index`) and multi-channel (`channel_list`) param shapes in the UI picker; (4) refresh `Channel.in_use` in `process_system_config` after the fresh rebuild, or accept that it is only accurate after evaluate/recall and document that. Not blocking current implementation — script-side conflict validation still works via `InstrumentValidator`.
