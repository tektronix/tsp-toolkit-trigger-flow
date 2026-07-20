use serde::{Deserialize, Serialize};

use crate::api::state::TriggerFlowState;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Module {
    #[serde(rename = "MPSU50_2ST")]
    MPSU50_2ST,
    #[serde(rename = "MSMU60_2")]
    MSMU60_2,
    Empty,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct SlotIndex(pub u8);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct ChannelIndex(pub u8);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    pub channel_index: ChannelIndex,
    pub in_use: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Slot {
    pub slot_id: SlotIndex,
    pub module: Module,
    pub channels: Vec<Channel>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotJson {
    pub slot_id: String,
    pub module: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeJson {
    pub node_id: String,
    pub mainframe: String,
    pub slots: Option<Vec<SlotJson>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Nodes {
    pub node_id: String,
    pub mainframe: String,
    pub slots: Option<Vec<Slot>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Systems {
    pub systems: Vec<SystemConfigJson>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemConfigJson {
    pub name: String,
    #[serde(rename = "localNode")]
    pub localnode: String,
    #[serde(rename = "isActive")]
    pub is_active: Option<bool>, // Optionally handle isActive
    pub slots: Option<Vec<SlotJson>>,
    pub nodes: Option<Vec<NodeJson>>,
}

#[derive(Debug, Clone)]
pub enum SlotChannelListUpdate {
    SystemConfig(Systems),
    TriggerFlowState(TriggerFlowState),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SlotChannelList {
    pub localnode: String,
    pub slots: Vec<Slot>,
    pub nodes: Vec<Nodes>,
}

// Filter the incoming nodes to at most one entry: the first node whose
// mainframe starts with "MP5" and has at least one non-Empty slot. Preserves
// the node's identity (node_id) so any block referencing it keeps resolving,
// while pruning non-MP5 nodes and additional MP5s.
fn select_first_mp5_node(active_nodes: &[NodeJson]) -> Result<Vec<Nodes>, String> {
    let parsed_nodes: Vec<Nodes> = active_nodes
        .iter()
        .map(Nodes::try_from)
        .collect::<Result<Vec<_>, _>>()?;

    Ok(parsed_nodes
        .into_iter()
        .find(|n| {
            n.mainframe.starts_with("MP5")
                && n.slots
                    .as_ref()
                    .is_some_and(|slots| slots.iter().any(|s| s.module != Module::Empty))
        })
        .into_iter()
        .collect())
}

impl SlotChannelList {
    pub fn new(config_json: &Systems) -> Result<Self, String> {
        let active_system = config_json
            .systems
            .iter()
            .find(|system| system.is_active == Some(true))
            .ok_or_else(|| "No active system found in configuration".to_string())?;

        let _slots = active_system
            .slots
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(Slot::try_from)
            .collect::<Result<Vec<_>, _>>()?;

        // If the localnode is an MP5 mainframe with at least one installed module,
        // treat it as a standalone system: drop all nodes.
        // Otherwise, keep only the first node whose mainframe is MP5 and has at
        // least one non-Empty slot; drop every other node.
        let _nodes = if active_system.localnode.starts_with("MP5")
            && _slots.iter().any(|s| s.module != Module::Empty)
        {
            Vec::new()
        } else {
            select_first_mp5_node(active_system.nodes.as_deref().unwrap_or_default())?
        };

        let result = SlotChannelList {
            localnode: active_system.localnode.clone(),
            slots: _slots,
            nodes: _nodes,
        };
        println!("SlotChannelList after new: {:?}", result);
        Ok(result)
    }

    pub fn update_slot_channel_list(
        &mut self,
        update: SlotChannelListUpdate,
    ) -> Result<Self, String> {
        match update {
            SlotChannelListUpdate::SystemConfig(config_json) => {
                let active_system = config_json
                    .systems
                    .iter()
                    .find(|system| system.is_active == Some(true))
                    .ok_or_else(|| "No active system found in configuration".to_string())?;

                let parsed_slots: Vec<Slot> = active_system
                    .slots
                    .as_deref()
                    .unwrap_or_default()
                    .iter()
                    .map(Slot::try_from)
                    .collect::<Result<Vec<_>, _>>()?;

                // If the localnode is an MP5 mainframe with at least one installed module,
                // treat it as a standalone system: drop all nodes.
                // Otherwise, keep only the first node whose mainframe is MP5 and has at
                // least one non-Empty slot; drop every other node.
                let parsed_nodes = if active_system.localnode.starts_with("MP5")
                    && parsed_slots.iter().any(|s| s.module != Module::Empty)
                {
                    Vec::new()
                } else {
                    select_first_mp5_node(
                        active_system.nodes.as_deref().unwrap_or_default(),
                    )?
                };

                // All parse steps succeeded. Commit atomically so a mid-way
                // Err never leaves `self` half-updated.
                self.slots = parsed_slots;
                self.nodes = parsed_nodes;
                self.localnode = active_system.localnode.clone();
            }
            SlotChannelListUpdate::TriggerFlowState(triggerflow_state) => {
                for slot in &mut self.slots {
                    for channel in &mut slot.channels {
                        channel.in_use = triggerflow_state
                            .is_channel_in_use(slot.slot_id, channel.channel_index);
                    }
                }
            }
        }
        let result = SlotChannelList {
            localnode: self.localnode.clone(),
            slots: self.slots.clone(),
            nodes: self.nodes.clone(),
        };
        println!("SlotChannelList after update: {:?}", result);
        Ok(result)
    }

    pub fn has_mp5_mainframe(&self) -> bool {
        self.localnode.starts_with("MP5")
            || self.nodes.iter().any(|n| n.mainframe.starts_with("MP5"))
    }

    pub fn has_non_empty_slots(&self) -> bool {
        self.slots.iter().any(|s| s.module != Module::Empty)
            || self.nodes.iter().any(|n| {
                n.slots
                    .as_ref()
                    .is_none_or(|slots| slots.iter().any(|s| s.module != Module::Empty))
            })
    }

    pub fn is_valid_config(&self) -> bool {
        self.has_mp5_mainframe() && self.has_non_empty_slots()
    }
}

impl TryFrom<&SlotJson> for Slot {
    type Error = String;

    fn try_from(slot_json: &SlotJson) -> Result<Self, Self::Error> {
        let module = match slot_json.module.as_str() {
            "MPSU50-2ST" => Module::MPSU50_2ST,
            "MSMU60-2" => Module::MSMU60_2,
            "Empty" => Module::Empty,
            _ => return Err(format!("Unknown module type: {}", slot_json.module)),
        };

        let slot_index = slot_json
            .slot_id
            .trim_start_matches("slot[")
            .trim_end_matches(']')
            .parse::<u8>()
            .map_err(|e| format!("Invalid slot index: {}", e))?;

        let channel_indices = vec![ChannelIndex(1), ChannelIndex(2)];
        Ok(Slot {
            slot_id: SlotIndex(slot_index),
            module,
            channels: channel_indices
                .into_iter()
                .map(|ci| Channel {
                    channel_index: ci,
                    in_use: false,
                })
                .collect(),
        })
    }
}

impl TryFrom<&NodeJson> for Nodes {
    type Error = String;

    fn try_from(node_json: &NodeJson) -> Result<Self, Self::Error> {
        let node_id = node_json.node_id.clone();
        let mainframe = node_json.mainframe.clone();

        // Convert Option<Vec<SlotJson>> to Option<Vec<Slot>>
        let slots = node_json
            .slots
            .as_ref()
            .map(|slot_json| {
                slot_json
                    .iter()
                    .map(Slot::try_from)
                    .collect::<Result<Vec<_>, _>>()
            })
            .transpose()?;

        Ok(Nodes {
            node_id,
            mainframe,
            slots,
        })
    }
}

#[cfg(test)]
mod atomic_update_tests {
    use super::*;

    fn slot_json(id: &str, module: &str) -> SlotJson {
        SlotJson {
            slot_id: id.to_string(),
            module: module.to_string(),
        }
    }

    fn systems_local_and_node(
        localnode: &str,
        local_slots: Vec<SlotJson>,
        node_id: &str,
        node_mainframe: &str,
        node_slots: Vec<SlotJson>,
    ) -> Systems {
        Systems {
            systems: vec![SystemConfigJson {
                name: "sys1".to_string(),
                localnode: localnode.to_string(),
                is_active: Some(true),
                slots: Some(local_slots),
                nodes: Some(vec![NodeJson {
                    node_id: node_id.to_string(),
                    mainframe: node_mainframe.to_string(),
                    slots: Some(node_slots),
                }]),
            }],
        }
    }

    fn seed_valid_state() -> SlotChannelList {
        // Non-MP5 local + MP5 elevated node keeps the elevated node in the
        // list (the localnode-MP5-with-modules short-circuit does not apply).
        let mut list = SlotChannelList::default();
        list.update_slot_channel_list(SlotChannelListUpdate::SystemConfig(
            systems_local_and_node(
                "2450",
                vec![slot_json("slot[1]", "Empty")],
                "node[3]",
                "MP5103",
                vec![slot_json("slot[1]", "MSMU60-2")],
            ),
        ))
        .expect("seed update should succeed");
        list
    }

    #[test]
    fn malformed_nodes_update_leaves_self_unchanged() {
        let mut list = seed_valid_state();
        let before = list.clone();

        // Well-formed slots on the local mainframe, but the elevated node
        // carries an unknown module string. The update must be all-or-nothing:
        // failing on nodes must not leave `self.slots` overwritten.
        let bad = systems_local_and_node(
            "2450",
            vec![slot_json("slot[1]", "MPSU50-2ST")],
            "node[3]",
            "MP5103",
            vec![slot_json("slot[1]", "GARBAGE")],
        );

        let result = list.update_slot_channel_list(
            SlotChannelListUpdate::SystemConfig(bad),
        );
        assert!(result.is_err(), "malformed nodes must return Err");

        // Every field on `self` must still match the seeded state.
        assert_eq!(list, before, "self should be unchanged after a failed update");
    }
}
