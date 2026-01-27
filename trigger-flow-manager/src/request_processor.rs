use crate::{
    api::{
        request::{BlockData, Request},
        response::Response,
        state::{SystemConfiguration, TriggerFlowState},
    },
    model::{trigger_model::TriggerModel, trigger_model_block::TriggerModelBlock},
    validator::{catalog_validator::CatalogValidator, ValidationChain, Validator},
    TriggerBlocks,
};
use anyhow::Result;
use std::{collections::HashMap, sync::Arc};

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

    fn validate_with_system_config(
        &self,
        model: &TriggerModel,
        system_config: &SystemConfiguration,
    ) -> Result<()> {
        use crate::validator::instr_validator::InstrumentValidator;

        self.validation_chain.validate(model)?;

        let instr_validator = InstrumentValidator::new(system_config.clone());
        instr_validator.validate(model)?;

        Ok(())
    }

    pub fn process_request(
        &self,
        request: Request,
        current_state: Option<TriggerFlowState>,
    ) -> Result<Response> {
        match request {
            Request::InitialRequest { system_config } => self.handle_initial_request(system_config),
            Request::AddModel { model_name } => {
                let state =
                    current_state.ok_or_else(|| anyhow::anyhow!("No current state available"))?;
                if state.system_config.is_none() {
                    return Err(anyhow::anyhow!("System not configured."));
                }
                self.handle_add_model(model_name, state)
            }
            Request::AddBlock {
                model_name,
                block_data,
            } => {
                let state = current_state.ok_or_else(|| anyhow::anyhow!("No state provided."))?;

                if state.system_config.is_none() {
                    return Err(anyhow::anyhow!("System not configured."));
                }
                self.handle_add_block(model_name, block_data, state)
            }
            Request::UpdateBlock {
                model_name,
                block_id,
                block_data,
            } => {
                let state = current_state.ok_or_else(|| anyhow::anyhow!("No state provided."))?;
                if state.system_config.is_none() {
                    return Err(anyhow::anyhow!("System not configured."));
                }
                self.handle_update_block(model_name, block_id, block_data, state)
                // Pass block_data
            }
            Request::DeleteBlock {
                model_name,
                block_id,
            } => {
                let state = current_state.ok_or_else(|| anyhow::anyhow!("No state provided."))?;
                if state.system_config.is_none() {
                    return Err(anyhow::anyhow!("System not configured."));
                }
                self.handle_delete_block(model_name, block_id, state)
            }
        }
    }

    pub fn handle_initial_request(&self, config: SystemConfiguration) -> Result<Response> {
        //validate the config
        //create initial empty state
        let state = TriggerFlowState {
            system_config: Some(config),
            models: HashMap::new(),
        };

        Ok(Response::Success { state })
    }

    pub fn handle_add_model(
        &self,
        model_name: String,
        mut current_state: TriggerFlowState,
    ) -> Result<Response> {
        let model = TriggerModel::new(model_name.clone());

        let model_state = model.to_state();

        current_state.models.insert(model_name, model_state);

        Ok(Response::Success {
            state: current_state,
        })
    }

    pub fn handle_add_block(
        &self,
        model_name: String,
        block_data: BlockData,
        mut current_state: TriggerFlowState,
    ) -> Result<Response> {
        //create model (pass the existing state)
        let model_state = current_state
            .models
            .get_mut(&model_name)
            .ok_or_else(|| anyhow::anyhow!("Model '{}' not found", model_name))?;

        let mut domain_model = TriggerModel::from_state(model_state, &self.catalog)?;

        let mut block = TriggerModelBlock::default_block(
            &self.catalog,
            &block_data.block_type,
            block_data.position,
            domain_model.next_block_id, // Use the model's next ID
        )?;

        // Merge user-provided parameters (they override defaults)
        for (key, value) in block_data.parameters {
            block.block_parameters.insert(key, value);
        }

        let block_id = domain_model.add_block(block);

        self.validation_chain.validate(&domain_model)?;

        let system_config = current_state
            .system_config
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("System config required"))?;

        self.validate_with_system_config(&domain_model, system_config)?;

        *model_state = domain_model.to_state();

        Ok(Response::Success {
            state: current_state,
        })
    }

    pub fn handle_update_block(
        &self,
        model_name: String,
        block_id: u32,
        updated_data: BlockData, 
        mut current_state: TriggerFlowState,
    ) -> Result<Response> {
        let model_state = current_state
            .models
            .get_mut(&model_name)
            .ok_or_else(|| anyhow::anyhow!("Model '{}' not found", model_name))?;

        let mut domain_model = TriggerModel::from_state(model_state, &self.catalog)?;


        let block = domain_model
            .model_blocks
            .get_mut(&block_id)
            .ok_or_else(|| anyhow::anyhow!("Block ID {} not found", block_id))?;

        for (key, value) in updated_data.parameters {
            block.block_parameters.insert(key, value);
        }

        
        block.block_position = updated_data.position;

        self.validation_chain.validate(&domain_model)?;

        let system_config = current_state
            .system_config
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("System config required"))?;

        self.validate_with_system_config(&domain_model, system_config)?;

        *model_state = domain_model.to_state();

        Ok(Response::Success {
            state: current_state,
        })
    }

    pub fn handle_delete_block(
        &self,
        model_name: String,
        block_id: u32,
        mut current_state: TriggerFlowState,
    ) -> Result<Response> {
        let model_state = current_state
            .models
            .get_mut(&model_name)
            .ok_or_else(|| anyhow::anyhow!("Model '{}' not found", model_name))?;

        let mut domain_model = TriggerModel::from_state(model_state, &self.catalog)?;

        
        let _deleted_block = domain_model
            .delete_block(block_id)
            .ok_or_else(|| anyhow::anyhow!("Block ID {} not found", block_id))?;

       
        let block_id_str = block_id.to_string();
        for (_id, block) in domain_model.model_blocks.iter_mut() {
        
            if let Some(ref incoming) = block.incoming {
                if incoming == &block_id_str {
                    block.incoming = None;
                }
            }
            if let Some(ref outgoing) = block.outgoing {
                if outgoing == &block_id_str {
                    block.outgoing = None;
                }
            }
        }
        *model_state = domain_model.to_state();

        Ok(Response::Success {
            state: current_state,
        })
    }
}
