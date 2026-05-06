use crate::{
    api::{
        request::{RequestType, ResponseType},
        slot_channel_list::{self},
        state::TriggerFlowState,
    },
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

        Self { validation_chain, catalog }
    }
    pub fn process_request(&self, request: RequestType) -> Result<Option<String>> {
        println!("###RequestProcessor::process_request called with: {:?}", request);
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
                println!(
                    "Processing EvaluateRequest with TriggerFlowState: {:?}",
                    working_state
                );
                let response = self.handle_evaluate_request(&mut working_state)?;
                // Return response without persisting state (stateless)
                Ok(Some(response))
            }
            RequestType::RecallRequest { trigger_flow_state: request_state } => {
                println!("Processing RecallRequest with TriggerFlowState: {:?}", request_state);
                let mut working_state = request_state;
                let response = self.handle_recall_request(&mut working_state)?;
                Ok(Some(response))
            }
        }
    }

    pub fn handle_evaluate_request(
        &self,
        trigger_flow_state: &mut TriggerFlowState
    ) -> Result<String> {
        println!("###handle_evaluate_request called");
        //call process_system_config with update type triggerflowstate

        let new_slot_channel_list = trigger_flow_state
            .slot_channel_list
            .update_slot_channel_list(slot_channel_list::SlotChannelListUpdate::TriggerFlowState(
                trigger_flow_state.clone(),
            ));
        trigger_flow_state.slot_channel_list =
            new_slot_channel_list.unwrap_or_else(|_| trigger_flow_state.slot_channel_list.clone());

        //evaluate models in state
        //validation chain validates the models first, then hashmap
        self.validation_chain.validate(trigger_flow_state)?;
        
        println!("###Creating ResponseType::EvaluateResponse with catalog");
        let response = ResponseType::EvaluateResponse { // Regular evaluates don't need catalog
            trigger_flow_state: trigger_flow_state.clone(),
        };

        println!("###About to convert ResponseType to IpcData");
    
        
        match IpcData::try_from(&response) {
            Result::Ok(ipc_response) => {
                let serialized_response = serde_json::to_string(&ipc_response)?;
                println!("Generated EvaluateResponse: {}", serialized_response);
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
        trigger_flow_state: &mut TriggerFlowState
    ) -> Result<String> {
        //call process_system_config with update type triggerflowstate

        let new_slot_channel_list = trigger_flow_state
            .slot_channel_list
            .update_slot_channel_list(slot_channel_list::SlotChannelListUpdate::TriggerFlowState(
                trigger_flow_state.clone(),
            ));
        trigger_flow_state.slot_channel_list =
            new_slot_channel_list.unwrap_or_else(|_| trigger_flow_state.slot_channel_list.clone());

        //evaluate models in state
        //validation chain validates the models first, then hashmap
        self.validation_chain.validate(trigger_flow_state)?;
        println!("###Catalog is {:?}", self.catalog.clone());
        trigger_flow_state.catalog = Some(self.catalog.clone()); // Include catalog in recall response
        let response = ResponseType::EvaluateResponse {
            trigger_flow_state: trigger_flow_state.clone(),
        };

        match IpcData::try_from(&response) {
            Result::Ok(ipc_response) => {
                let serialized_response = serde_json::to_string(&ipc_response)?;
                println!("Generated EvaluateResponse: {}", serialized_response);
                Ok(serialized_response)
            }
            Result::Err(e) => {
                println!("Failed to convert to IpcData: {:?}", e);
                Ok("{\"error\":\"IPC conversion failed\"}".to_string())
            }
        }
    }
}
