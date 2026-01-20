use trigger_flow_manager::model::trigger_model::TriggerModel;


#[derive(Clone)]
pub struct DataModel {
    pub trigger_models: Vec<TriggerModel>,
}

impl DataModel {
    pub fn new() -> Self {
        DataModel {
            trigger_models: Vec::new(),
        }
    }

    pub fn process_system_config() {

    }

    pub fn process_data_from_client() {
        
    }

    pub fn process_data_from_saved_config() {
        
    }

    pub fn serialize_trigger_model() {
        
    }

    pub fn serialize_empty_response() {
        
    }

    pub fn reset_sweep_config() {
        
    }
}
