use crate::api::state::{TriggerFlowState, CLAMP_NOTE_PREFIX};
use anyhow::Result;

pub trait Validator {
    fn validate(&self, model: &mut TriggerFlowState) -> Result<()>;
}

pub struct ValidationChain {
    validators: Vec<Box<dyn Validator>>,
}
impl Default for ValidationChain {
    fn default() -> Self {
        Self::new()
    }
}

impl ValidationChain {
    pub fn new() -> Self {
        Self {
            validators: Vec::new(),
        }
    }

    pub fn add_validator(mut self, validator: Box<dyn Validator>) -> Self {
        self.validators.push(validator);
        self
    }
    pub fn validate(&self, state: &mut TriggerFlowState) -> Result<TriggerFlowState> {
        // Clear old validator-origin errors before revalidating. Clients
        // may send back state that still has errors from a previous
        // response (for example, a recall payload). Without this reset,
        // the validators would add to the old list, causing duplicates.
        //
        // Preserve clamp-origin entries (identified by CLAMP_NOTE_PREFIX)
        // so hardware notes just written by `reconcile_derived_state`
        // survive the round-trip. Without this the notify-to-Empty-slot
        // block_error would be wiped on every evaluate / recall.
        //
        // Stale models are skipped by every individual validator, so
        // wiping their block_error here would leave it empty until the
        // user rebinds AND triggers another evaluate — wrong for both
        // mid-session recovery via Systems (no validate runs) and recall
        // of already-stale sessions.
        for model in state.models.values_mut() {
            if model.has_system_config_error() {
                continue;
            }
            for block in &mut model.blocks {
                if let Some(entries) = block.block_error.as_mut() {
                    entries.retain(|(_, msg)| msg.starts_with(CLAMP_NOTE_PREFIX));
                    if entries.is_empty() {
                        block.block_error = None;
                    }
                }
            }
        }

        for validator in &self.validators {
            validator.validate(state)?;
        }
        Ok(state.clone())
    }
}
pub mod catalog_validator;
pub mod instr_validator;
pub mod slot_channel_hashmap;

#[cfg(test)]
mod stale_wipe_tests {
    use super::*;
    use crate::api::slot_channel_list::{
        Channel, ChannelIndex, Module, Slot, SlotChannelList, SlotIndex,
    };
    use crate::api::state::{ModelErrorKind, TriggerFlowState, TriggerModelState};
    use crate::model::trigger_model_block::{BlockPosition, TriggerModelBlock};
    use indexmap::IndexMap;
    use std::collections::HashMap;

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

    fn list_with_local_slot(id: u8, module: Module) -> SlotChannelList {
        SlotChannelList {
            localnode: "MP5".to_string(),
            slots: vec![slot(id, module)],
            nodes: vec![],
        }
    }

    fn block_with_error(id: &str, msg: &str) -> TriggerModelBlock {
        TriggerModelBlock {
            block_id: id.to_string(),
            block_type: "config list next".to_string(),
            block_parameters: HashMap::new(),
            incoming: None,
            outgoing: None,
            block_position: BlockPosition { x: 0.0, y: 0.0 },
            block_error: Some(vec![(true, msg.to_string())]),
        }
    }

    fn stale_model(name: &str, blocks: Vec<TriggerModelBlock>) -> TriggerModelState {
        TriggerModelState {
            model_name: name.to_string(),
            slot_index: SlotIndex(1),
            node_id: "localnode".to_string(),
            blocks,
            slot_module: Some(Module::MSMU60_2),
            // Populated to mark the model stale without needing to run recompute.
            model_error: vec![(
                ModelErrorKind::SystemConfig,
                "Hardware changed since binding.".to_string(),
            )],
        }
    }

    fn healthy_model(name: &str, blocks: Vec<TriggerModelBlock>) -> TriggerModelState {
        TriggerModelState {
            model_name: name.to_string(),
            slot_index: SlotIndex(1),
            node_id: "localnode".to_string(),
            blocks,
            slot_module: Some(Module::MSMU60_2),
            model_error: vec![],
        }
    }

    fn state_with_models(models: Vec<TriggerModelState>) -> TriggerFlowState {
        let mut map = IndexMap::new();
        for m in models {
            map.insert(m.model_name.clone(), m);
        }
        TriggerFlowState {
            catalog: None,
            slot_channel_list: list_with_local_slot(1, Module::MSMU60_2),
            models: map,
        }
    }

    #[test]
    fn wipe_preserves_block_error_on_stale_model() {
        let mut state = state_with_models(vec![stale_model(
            "stale",
            vec![block_with_error("b1", "channel_index required")],
        )]);

        let chain = ValidationChain::new();
        chain.validate(&mut state).expect("validate");

        let preserved = state.models["stale"].blocks[0]
            .block_error
            .as_ref()
            .expect("block_error should be preserved on stale model");
        assert_eq!(preserved.len(), 1);
        assert!(preserved[0].1.contains("channel_index required"));
    }

    #[test]
    fn wipe_clears_validator_origin_block_error_on_healthy_model() {
        let mut state = state_with_models(vec![healthy_model(
            "healthy",
            vec![block_with_error("b1", "channel_index required")],
        )]);

        let chain = ValidationChain::new();
        chain.validate(&mut state).expect("validate");

        assert!(
            state.models["healthy"].blocks[0].block_error.is_none(),
            "validator-origin block_error should be wiped for revalidation",
        );
    }

    #[test]
    fn wipe_preserves_clamp_origin_block_error_on_healthy_model() {
        let clamp_note = format!("{}notify event references slot 1", CLAMP_NOTE_PREFIX);
        let mut state = state_with_models(vec![healthy_model(
            "healthy",
            vec![block_with_error("b1", &clamp_note)],
        )]);

        let chain = ValidationChain::new();
        chain.validate(&mut state).expect("validate");

        let preserved = state.models["healthy"].blocks[0]
            .block_error
            .as_ref()
            .expect("clamp-origin block_error should survive the wipe");
        assert_eq!(preserved.len(), 1);
        assert!(preserved[0].1.starts_with(CLAMP_NOTE_PREFIX));
    }

    #[test]
    fn wipe_keeps_clamp_note_drops_validator_note_on_same_block() {
        let clamp_note = format!("{}notify event references slot 1", CLAMP_NOTE_PREFIX);
        let mut block = block_with_error("b1", "channel_index required");
        block
            .block_error
            .as_mut()
            .unwrap()
            .push((true, clamp_note.clone()));
        let mut state = state_with_models(vec![healthy_model("healthy", vec![block])]);

        let chain = ValidationChain::new();
        chain.validate(&mut state).expect("validate");

        let remaining = state.models["healthy"].blocks[0]
            .block_error
            .as_ref()
            .expect("clamp-origin entry should remain");
        assert_eq!(remaining.len(), 1);
        assert!(remaining[0].1.starts_with(CLAMP_NOTE_PREFIX));
    }

    #[test]
    fn wipe_mixed_stale_preserved_healthy_wiped() {
        let mut state = state_with_models(vec![
            stale_model(
                "stale",
                vec![block_with_error("s1", "stale error preserved")],
            ),
            healthy_model(
                "healthy",
                vec![block_with_error("h1", "healthy error wiped")],
            ),
        ]);

        let chain = ValidationChain::new();
        chain.validate(&mut state).expect("validate");

        let stale_err = state.models["stale"].blocks[0]
            .block_error
            .as_ref()
            .expect("stale block_error preserved");
        assert_eq!(stale_err.len(), 1);
        assert!(stale_err[0].1.contains("stale error preserved"));

        assert!(
            state.models["healthy"].blocks[0].block_error.is_none(),
            "healthy block_error should be wiped",
        );
    }
}
