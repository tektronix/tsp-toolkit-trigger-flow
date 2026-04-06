
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
}

impl RequestProcessor {
    pub fn new(catalog: &'static Catalog) -> Self {
        let validation_chain = ValidationChain::new()
            .add_validator(Box::new(CatalogValidator::new(catalog)))
            .add_validator(Box::new(InstrumentValidator::new())); //pass initial empty slot_channel_list, will be updated with each request

        Self { validation_chain }
    }
    pub fn process_request(&self, request: RequestType) -> Result<Option<String>> {
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
        }
    }

    pub fn handle_evaluate_request(
        &self,
        trigger_flow_state: &mut TriggerFlowState,
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
