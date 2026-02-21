use crate::{
    api::{
        request::{RequestType, ResponseType},
        state::{SystemConfiguration, TriggerFlowState},
    },
    validator::{catalog_validator::CatalogValidator, ValidationChain, Validator},
    TriggerBlocks,
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
    pub fn process_request(&self, request: RequestType) -> Result<ResponseType> {
        match request {
            RequestType::InitialRequest { system_config } => {
                self.handle_initial_request(system_config.clone())?;
                Ok(ResponseType::InitialResponse {
                    system_config: system_config.clone(),
                    catalog: self.catalog.as_ref().clone(),
                })
            }
            RequestType::EvaluateRequest { current_state } => {
                let state = current_state.clone();
                self.handle_evaluate_request(state)?;

                Ok(ResponseType::EvaluateResponse { current_state })
            }
        }
    }

    pub fn handle_initial_request(&self, config: SystemConfiguration) -> Result<()> {
        //translate the config to structure
        //send catalog
        Ok(())
    }
    pub fn handle_evaluate_request(
        &self,
        current_state: TriggerFlowState,
    ) -> Result<TriggerFlowState> {
        Ok(current_state)
    }
}
