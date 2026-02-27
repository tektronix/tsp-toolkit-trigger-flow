use crate::{
    Catalog, api::{
        request::{ErrorType, RequestType, ResponseType}, slot_channel_list::{self, SlotChannelList}, state::TriggerFlowState
    }, validator::{ValidationChain, Validator, catalog_validator::CatalogValidator, instr_validator::InstrumentValidator, slot_channel_hashmap::SlotChannelHashMap}
};
use anyhow::{Ok, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub struct RequestProcessor {
    catalog: &'static Catalog,
    validation_chain: ValidationChain,
}

impl RequestProcessor {
    pub fn new(catalog: &'static Catalog) -> Self {

        let validation_chain = ValidationChain::new()
            .add_validator(Box::new(CatalogValidator::new(&catalog)))
            .add_validator(Box::new(InstrumentValidator::new())); //pass initial empty slot_channel_list, will be updated with each request

        Self {
            catalog,
            validation_chain,
        }
    }
    pub fn process_request(
        &self,
        catalog: &'static Catalog,
        trigger_flow_state: &mut TriggerFlowState,
        request: RequestType,
    ) -> Result<String> {
        match request {
            RequestType::InitialRequest => {
                let response = "instrument data requested".to_string();
                Ok(response)
            }
            RequestType::EvaluateRequest { .. } => {
                let response = self.handle_evaluate_request(catalog, trigger_flow_state)?;
                Ok(response)
            }
        }
    }

    // pub fn handle_initial_request(
    //     &self,
    //     catalog: &'static Catalog,
    //     trigger_flow_state: &TriggerFlowState,
    // ) -> Result<String> {
    //     //call process_system_config with update type systemconfig
    //     trigger_flow_state.process_system_config(self, );
    //     Ok(ResponseType::InitialResponse {
    //         slot_channel_list: trigger_flow_state.slot_channel_list.clone(),
    //         catalog: catalog.clone(),
    //     })
    // }
    pub fn handle_evaluate_request(
        &self,
        catalog: &'static Catalog,
        trigger_flow_state: &mut TriggerFlowState,
    ) -> Result<String> {
        //call process_system_config with update type triggerflowstate
        
        let new_slot_channel_list = trigger_flow_state.slot_channel_list.update_slot_channel_list(slot_channel_list::SlotChannelListUpdate::TriggerFlowState(trigger_flow_state.clone()));
        trigger_flow_state.slot_channel_list = new_slot_channel_list.unwrap_or_else(|_| trigger_flow_state.slot_channel_list.clone());
        
        //evaluate models in state
        //validation chain validates the models first, then hashmap
        self.validation_chain.validate(trigger_flow_state)?;

        let response = ResponseType::EvaluateResponse { trigger_flow_state: trigger_flow_state.clone() };
        Ok(serde_json::to_string(&response)?)
    }
}
