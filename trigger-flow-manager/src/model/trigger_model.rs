use std::collections::HashMap;
use anyhow::Result;
use crate::{TriggerBlocks, api::state::TriggerModelState, model::trigger_model_block::TriggerModelBlock};

#[derive(Debug, Clone)]

pub struct TriggerModel {
    pub model_name: String,
    pub model_blocks: HashMap<u32, TriggerModelBlock>,
    pub next_block_id: u32,
    pub start_block: Option<u32>,
}

impl TriggerModel {
    pub fn new(name: String) -> Self {
        Self {model_name: name,
        model_blocks: HashMap::new(),
        next_block_id: 1,
        start_block: None,}
    }

    pub fn add_block(&mut self, mut block: TriggerModelBlock) -> u32 {
        let id: u32 = self.next_block_id;
        
        block.block_id = id;

        if self.start_block.is_none() {
            self.start_block = Some(id);
        }

        self.model_blocks.insert(id, block);

        self.next_block_id += 1;

        id
    }

    pub fn delete_block(&mut self, id: u32) -> Option<TriggerModelBlock> {
        
        let removed_block = self.model_blocks.remove(&id)?;

        if self.start_block == Some(id) {
            self.start_block = None;
        }

        Some(removed_block)
    }

    pub fn get_block(&self, id: u32) -> Option<&TriggerModelBlock> {
        self.model_blocks.get(&id)
    }

    pub fn connect_blocks(&mut self, from_id: u32, to_id: u32) -> Result<()> {
        let from_block = self.model_blocks.get_mut(&from_id).ok_or_else(|| anyhow::anyhow!("Block with id {} not found", from_id))?;
        from_block.outgoing = Some(to_id.to_string());

        let to_block = self.model_blocks.get_mut(&to_id).ok_or_else(|| anyhow::anyhow!("Block with id {} not found", to_id))?;
        to_block.incoming = Some(from_id.to_string());

        Ok(())
    }

    pub fn to_state(&self) -> TriggerModelState {
        TriggerModelState {
            model_name: self.model_name.clone(),
            blocks: self.model_blocks.values().cloned().collect(),
        }
    }

    pub fn from_state(state: &TriggerModelState, _catalog: &TriggerBlocks) -> Result<Self> {
        let mut model = TriggerModel::new(state.model_name.clone());
        for block in &state.blocks {
            model.add_block(block.clone());
        }
        if let Some(max_id) = model.model_blocks.keys().max() {
        model.next_block_id = max_id + 1;
    }
        Ok(model)
    }
}
