use crate::{
    TriggerBlocks, api::{
        request::{RequestType, ResponseType},
        state::TriggerFlowState,
        system_config::{SlotChannelList, SystemConfiguration},
    }, validator::{ValidationChain, Validator, catalog_validator::CatalogValidator, slot_channel_hashmap::SlotChannelHashMap}
};
use anyhow::{Ok, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub struct RequestProcessor {
    catalog: Arc<TriggerBlocks>,
    validation_chain: ValidationChain,
}

impl RequestProcessor {
    pub fn new(catalog: TriggerBlocks) -> Self {
        let catalog = Arc::new(catalog);

        let validation_chain = ValidationChain::new()
            .add_validator(Box::new(CatalogValidator::new(Arc::clone(&catalog))));

        Self {
            catalog,
            validation_chain,
        }
    }
    pub fn process_request(
        &self,
        catalog: &'static TriggerBlocks,
        request: RequestType,
    ) -> Result<ResponseType> {
        match request {
            RequestType::InitialRequest => {
                let response = self.handle_initial_request(catalog, slot_channel_list.clone()) //will be intialized
                Ok(ResponseType::InitialResponse { slot_channel_list: response.slot_channel_list, catalog: response.catalog })
            }
            RequestType::EvaluateRequest { current_state } => {
                let response = self.handle_evaluate_request(current_state.clone())?;

                Ok(ResponseType::EvaluateResponse { current_state: response })
            }
        }
    }

    pub fn handle_initial_request(
        &self,
        catalog: &'static TriggerBlocks,
        slot_channel_list: SlotChannelList,
    ) -> Result<ResponseType> {
        Ok(ResponseType::InitialResponse {
            slot_channel_list: slot_channel_list.clone(),
            catalog: catalog.clone(),
        })
    }
    pub fn handle_evaluate_request(
        &self,
        current_state: TriggerFlowState,
    ) -> Result<TriggerFlowState> {
        Ok(current_state)
    }
}
