use crate::{
    TriggerBlocks, api::{
        request::{ RequestType, ResponseType},
        state::{SystemConfiguration, TriggerFlowState},
    }, validator::{ValidationChain, Validator, catalog_validator::CatalogValidator}
};
use anyhow::{Ok, Result};
use std::{sync::Arc};

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
        request: RequestType,
        current_state: Option<TriggerFlowState>,
    ) -> Result<ResponseType> {
        match request {
            RequestType::InitialRequest { system_config } => {
                self.handle_initial_request(system_config)?;
                Ok(ResponseType::InitialResponse { system_config, catalog: () })
            },
            RequestType::EvaluateRequest { current_state } => {
                let state = current_state.ok_or_else(|| {
                    anyhow::anyhow!("Current state is required for EvaluateRequest")
                })?;
                self.handle_evaluate_request(state);

                Ok(ResponseType::EvaluateResponse { current_state } )
            }
        }
    }

    pub fn handle_initial_request(&self, config: SystemConfiguration) -> Result<()> {
        //validate the config
        //send catalog
    }
    pub fn handle_evaluate_request(&self, current_state: TriggerFlowState) -> Result<{ (state: TriggerFlowState) }> {
        //validate against catalog
    }
}
