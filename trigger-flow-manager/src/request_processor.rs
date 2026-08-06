use crate::{
    api::{
        request::{RequestType, ResponseType},
        slot_channel_list::{Slot, SlotChannelListUpdate},
        state::TriggerFlowState,
    },
    debug::DEBUG,
    validator::{
        catalog_validator::CatalogValidator, instr_validator::InstrumentValidator, ValidationChain,
    },
    Catalog, IpcData,
};
use anyhow::{Ok, Result};

pub struct RequestProcessor {
    validation_chain: ValidationChain,
    catalog: &'static Catalog,
}

impl RequestProcessor {
    pub fn new(catalog: &'static Catalog) -> Self {
        let validation_chain = ValidationChain::new()
            .add_validator(Box::new(CatalogValidator::new(catalog)))
            .add_validator(Box::new(InstrumentValidator::new())); //pass initial empty slot_channel_list, will be updated with each request

        Self {
            validation_chain,
            catalog,
        }
    }
    pub fn process_request(
        &self,
        request: RequestType,
    ) -> Result<Option<(String, Option<TriggerFlowState>)>> {
        if DEBUG {
            println!(
                "###RequestProcessor::process_request called with: {:?}",
                request
            );
        }
        match request {
            RequestType::InitialRequest => {
                println!("instrument data requested");
                Ok(None)
            }
            RequestType::EvaluateRequest {
                trigger_flow_state: request_state,
            } => {
                // Process only the state from the request - no backend state persistence
                let mut working_state = request_state;
                if DEBUG {
                    println!(
                        "Processing EvaluateRequest with TriggerFlowState: {:?}",
                        working_state
                    );
                }
                let response = self.handle_evaluate_request(&mut working_state)?;
                // Return validated state alongside response so callers persist
                // post-clamp values, not the raw request snapshot.
                Ok(Some((response, Some(working_state))))
            }
            RequestType::RecallRequest {
                trigger_flow_state: request_state,
            } => {
                if DEBUG {
                    println!(
                        "Processing RecallRequest with TriggerFlowState: {:?}",
                        request_state
                    );
                }
                let mut working_state = request_state;
                let response = self.handle_recall_request(&mut working_state)?;
                Ok(Some((response, Some(working_state))))
            }
        }
    }

    pub fn handle_evaluate_request(
        &self,
        trigger_flow_state: &mut TriggerFlowState,
    ) -> Result<String> {
        println!("###handle_evaluate_request called");
        //call process_system_config with update type triggerflowstate

        let new_slot_channel_list = trigger_flow_state
            .slot_channel_list
            .update_slot_channel_list(SlotChannelListUpdate::TriggerFlowState(
                trigger_flow_state.clone(),
            ));
        trigger_flow_state.slot_channel_list =
            new_slot_channel_list.unwrap_or_else(|_| trigger_flow_state.slot_channel_list.clone());

        // Recompute against the updated list before validation.
        trigger_flow_state.reconcile_derived_state(self.catalog);

        //evaluate models in state
        //validation chain validates the models first, then hashmap
        self.validation_chain.validate(trigger_flow_state)?;

        println!("###Creating ResponseType::EvaluateResponse with catalog");
        let response = ResponseType::EvaluateResponse {
            // Regular evaluates don't need catalog
            trigger_flow_state: trigger_flow_state.clone(),
        };

        println!("###About to convert ResponseType to IpcData");

        match IpcData::try_from(&response) {
            Result::Ok(ipc_response) => {
                let serialized_response = serde_json::to_string(&ipc_response)?;
                if DEBUG {
                    println!("Generated EvaluateResponse: {}", serialized_response);
                }
                Ok(serialized_response)
            }
            Result::Err(e) => {
                println!("Failed to convert to IpcData: {:?}", e);
                Ok("{\"error\":\"IPC conversion failed\"}".to_string())
            }
        }
    }

    pub fn handle_recall_request(
        &self,
        trigger_flow_state: &mut TriggerFlowState,
    ) -> Result<String> {
        // Backfill slot_module for models saved before the field existed.
        // Source is the saved slot_channel_list in the incoming payload — it
        // reflects the hardware the user was looking at when they saved. Any
        // subsequent divergence from current hardware surfaces as staleness
        // once the follow-up Systems payload arrives.
        for model in trigger_flow_state.models.values_mut() {
            if model.slot_module.is_some() {
                continue;
            }
            let slots: &[Slot] = if model.node_id == "localnode" {
                &trigger_flow_state.slot_channel_list.slots
            } else {
                trigger_flow_state
                    .slot_channel_list
                    .nodes
                    .iter()
                    .find(|n| n.node_id == model.node_id)
                    .and_then(|n| n.slots.as_deref())
                    .unwrap_or(&[])
            };
            model.slot_module = slots
                .iter()
                .find(|s| s.slot_id == model.slot_index)
                .map(|s| s.module);
        }

        //call process_system_config with update type triggerflowstate

        let new_slot_channel_list = trigger_flow_state
            .slot_channel_list
            .update_slot_channel_list(SlotChannelListUpdate::TriggerFlowState(
                trigger_flow_state.clone(),
            ));
        trigger_flow_state.slot_channel_list =
            new_slot_channel_list.unwrap_or_else(|_| trigger_flow_state.slot_channel_list.clone());

        // Recompute against the updated list before validation.
        trigger_flow_state.reconcile_derived_state(self.catalog);

        //evaluate models in state
        //validation chain validates the models first, then hashmap
        self.validation_chain.validate(trigger_flow_state)?;
        if DEBUG {
            println!("###Catalog is {:?}", self.catalog.clone());
        }
        trigger_flow_state.catalog = Some(self.catalog.clone()); // Include catalog in recall response
        let response = ResponseType::EvaluateResponse {
            trigger_flow_state: trigger_flow_state.clone(),
        };

        match IpcData::try_from(&response) {
            Result::Ok(ipc_response) => {
                let serialized_response = serde_json::to_string(&ipc_response)?;
                if DEBUG {
                    println!("Generated EvaluateResponse: {}", serialized_response);
                }
                Ok(serialized_response)
            }
            Result::Err(e) => {
                println!("Failed to convert to IpcData: {:?}", e);
                Ok("{\"error\":\"IPC conversion failed\"}".to_string())
            }
        }
    }
}

#[cfg(test)]
mod recall_backfill_tests {
    use super::*;
    use crate::api::slot_channel_list::{
        Channel, ChannelIndex, Module, SlotChannelList, SlotIndex,
    };
    use crate::api::state::{ModelErrorKind, TriggerModelState};
    use crate::trigger_model_blocks::catalog::ScriptTemplate;
    use indexmap::IndexMap;
    use std::collections::HashMap;
    use std::sync::LazyLock;

    /// Test-only empty catalog. Constructed once per process on first
    /// access; the `static` binding gives it a `'static` lifetime so
    /// `&EMPTY_CATALOG` satisfies `RequestProcessor::new`.
    static EMPTY_CATALOG: LazyLock<Catalog> = LazyLock::new(|| Catalog {
        script_template: ScriptTemplate::default(),
        blocks: HashMap::new(),
        trigger_events: HashMap::new(),
        templates: HashMap::new(),
        custom_types: HashMap::new(),
    });

    fn slot(id: u8, module: Module) -> Slot {
        Slot {
            slot_id: SlotIndex(id),
            module,
            channels: vec![Channel {
                channel_index: ChannelIndex(1),
                in_use: false,
            }],
        }
    }

    fn state_with_legacy_model(list_module: Module) -> TriggerFlowState {
        let mut state = TriggerFlowState {
            catalog: None,
            slot_channel_list: SlotChannelList {
                localnode: "MP5103".to_string(),
                slots: vec![slot(1, list_module)],
                nodes: vec![],
            },
            models: IndexMap::new(),
        };
        state.models.insert(
            "tm1".to_string(),
            TriggerModelState {
                model_name: "tm1".to_string(),
                slot_index: SlotIndex(1),
                node_id: "localnode".to_string(),
                blocks: vec![],
                // Legacy: no snapshot recorded when the model was saved.
                slot_module: None,
                model_error: vec![],
            },
        );
        state
    }

    #[test]
    fn recall_backfills_slot_module_from_saved_list() {
        let processor = RequestProcessor::new(&EMPTY_CATALOG);
        let mut state = state_with_legacy_model(Module::MSMU60_2);

        processor
            .handle_recall_request(&mut state)
            .expect("recall should succeed");

        let model = &state.models["tm1"];
        assert_eq!(
            model.slot_module,
            Some(Module::MSMU60_2),
            "slot_module must be backfilled from the saved slot_channel_list",
        );
        // With a matching backfill, the recompute pass should leave no error.
        assert!(model.model_error.is_empty());
    }

    #[test]
    fn recall_preserves_existing_snapshot() {
        let processor = RequestProcessor::new(&EMPTY_CATALOG);
        let mut state = state_with_legacy_model(Module::MSMU60_2);
        // Existing snapshot from a modern save must not be overwritten.
        state
            .models
            .get_mut("tm1")
            .expect("seed model exists")
            .slot_module = Some(Module::MPSU50_2ST);

        processor
            .handle_recall_request(&mut state)
            .expect("recall should succeed");

        let model = &state.models["tm1"];
        assert_eq!(
            model.slot_module,
            Some(Module::MPSU50_2ST),
            "existing snapshot must be preserved",
        );
        // Snapshot differs from the current module in the list -> warning.
        assert!(model
            .model_error
            .iter()
            .any(|(k, _)| matches!(k, ModelErrorKind::ModuleChanged)));
    }
}
