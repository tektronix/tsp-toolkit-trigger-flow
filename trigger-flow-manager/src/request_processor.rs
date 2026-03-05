use crate::{
    api::{
        request::{RequestType, ResponseType},
        slot_channel_list::{self},
        state::TriggerFlowState,
    },
    validator::{
        catalog_validator::CatalogValidator, instr_validator::InstrumentValidator, ValidationChain,
    },
    Catalog,
};
use anyhow::{Ok, Result};

pub struct RequestProcessor {
    validation_chain: ValidationChain,
}

impl RequestProcessor {
    pub fn new(catalog: &'static Catalog) -> Self {
    pub fn new(catalog: &'static Catalog) -> Self {
        let validation_chain = ValidationChain::new()
            .add_validator(Box::new(CatalogValidator::new(&catalog)))
            .add_validator(Box::new(InstrumentValidator::new())); //pass initial empty slot_channel_list, will be updated with each request

        Self { validation_chain }
    }
    pub fn process_request(
        &self,
        trigger_flow_state: &mut TriggerFlowState,
        request: RequestType,
    ) -> Result<String> {
    pub fn process_request(
        &self,
        trigger_flow_state: &mut TriggerFlowState,
        request: RequestType,
    ) -> Result<String> {
        match request {
            RequestType::InitialRequest => {
                let response = "instrument data requested".to_string();
                println!("Generated InitialRequest response: {}", response);
                Ok(response)
            }
            RequestType::EvaluateRequest { .. } => {
                let response = self.handle_evaluate_request(trigger_flow_state)?;
                Ok(response)
            }
        }
    }

    pub fn handle_initial_request(&self, config: SystemConfiguration) -> Result<()> {
        //validate the config
        //send catalog
        Ok(())
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
        let serialized_response = serde_json::to_string(&response)?;
        println!("Generated EvaluateResponse: {}", serialized_response);
        Ok(serialized_response)
    }
}
