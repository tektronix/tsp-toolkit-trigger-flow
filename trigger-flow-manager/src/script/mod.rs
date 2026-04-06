use std::fmt::Display;

use anyhow::Error;
use handlebars::Handlebars;

use crate::{api::state::TriggerFlowState, Catalog};

/// A script representing the contents of a script. The preamble and postable are used
/// for comments to be rendered to the file only if the file is being written for the
/// first time. Otherwise, only the contents should be written between the sentinal
/// comments.
#[derive(Default, Debug, Clone, PartialEq)]
pub struct Script {
    pub preamble: String,
    pub contents: String,
    pub postamble: String,
}

impl Script {
    /// Take the current [`TriggerFlowState`] and, using the provided [`TriggerBlocks`] catalog,
    /// generate the appropriate [`Script`].
    pub fn from_state(catalog: &Catalog, state: &TriggerFlowState) -> Result<Self, Error> {
        let mut hb = Handlebars::new();

        // load the script templates into hb
        hb.register_template_string("preamble", catalog.script_template.preamble.clone())
            .expect("should have loaded 'preamble' template");

        hb.register_template_string("postamble", catalog.script_template.postamble.clone())
            .expect("should have loaded 'postamble' template");

        hb.register_template_string("contents", catalog.script_template.contents.clone())
            .expect("should have loaded 'contents' template");

        hb.register_template_string(
            "begin_sentinel",
            catalog.script_template.begin_sentinel.clone(),
        )
        .expect("should have loaded 'begin_sentinel' template");

        hb.register_template_string("end_sentinel", catalog.script_template.end_sentinel.clone())
            .expect("should have loaded 'end_sentinel' template");

        // load the block templates into hb
        for (name, block) in catalog.blocks.clone().into_iter() {
            hb.register_template_string(&name, block.syntax.clone())
                .unwrap_or_else(|_| panic!("should have loaded '{name}' block template"));
        }

        // load the event templates into hb
        for (name, event) in catalog.trigger_events.clone().into_iter() {
            hb.register_template_string(&name, event.syntax.clone())
                .unwrap_or_else(|_| panic!("should have loaded '{name}' trigger event template"));
        }

        // render preamble
        let preamble = hb
            .render("preamble", state)
            .expect("should render preamble");

        // render contents
        let contents = hb
            .render("contents", state)
            .expect("should render contents");

        // render postamble
        let postamble = hb
            .render("postamble", state)
            .expect("should render postamble");

        Ok(Script {
            preamble,
            contents,
            postamble,
        })
    }

    /// Replace the contents of the original script with the updated contents, preserving
    /// the information before and after the generated contents.
    ///
    /// If the sentinel values defined in the Catalog are not present, the script will
    /// be completely preserved and no updates will occur.
    pub fn replace_generated(&self, catalog: &Catalog, original: &str) -> String {
        enum ReplaceState {
            Preamble,
            WriteNewContent,
            SeekPostamble,
            Postamble,
        }
        let mut state = ReplaceState::Preamble;
        let mut updated = String::new();

        for l in original.lines() {
            match state {
                ReplaceState::Preamble => {
                    updated = format!("{updated}{l}\n");
                    if l.trim() == catalog.script_template.begin_sentinel.trim() {
                        state = ReplaceState::WriteNewContent;
                    }
                }
                ReplaceState::WriteNewContent => {
                    updated.push_str(&self.contents);
                    state = ReplaceState::SeekPostamble;
                }
                ReplaceState::SeekPostamble => {
                    if l.trim() == catalog.script_template.end_sentinel.trim() {
                        updated = format!("{updated}{l}\n");
                        state = ReplaceState::Postamble;
                    }
                }
                ReplaceState::Postamble => updated = format!("{updated}{l}\n"),
            }
        }
        updated
    }
}

impl Display for Script {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}{}{}", self.preamble, self.contents, self.postamble)
    }
}

#[cfg(test)]
pub(crate) mod script_tests {
    use std::collections::HashMap;

    use crate::{
        api::{
            slot_channel_list::{Channel, ChannelIndex, Module, Slot, SlotChannelList, SlotIndex},
            state::{TriggerFlowState, TriggerModelState},
        },
        model::trigger_model_block::{BlockPosition, TriggerModelBlock},
        trigger_model_blocks::{
            catalog::{ParameterRange, ScriptTemplate},
            param_types::ParamTypeName,
        },
        BlockDefinition, Catalog, EventDefinition, Parameter,
    };
    use indexmap::IndexMap;

    use crate::script::Script;

    fn catalog() -> Catalog {
        let blocks: HashMap<String, BlockDefinition> = HashMap::from([
            (
                "always".to_string(),
                BlockDefinition {
                    parameters: vec![
                        Parameter {
                            name: "slot_index".to_string(),
                            param_type: ParamTypeName::SlotIndex,
                            required: true,
                            options: None,
                            default: Some(1.into()),
                            range: Some(ParameterRange {
                                min: Some(1.into()),
                                max: Some(64.into()),
                            }),
                        },
                        Parameter {
                            name: "trigger_model_name".to_string(),
                            param_type: ParamTypeName::String,
                            required: true,
                            options: None,
                            default: Some("model_name".into()),
                            range: None,
                        },
                        Parameter {
                            name: "trigger_block_name".to_string(),
                            param_type: ParamTypeName::String,
                            required: true,
                            options: None,
                            default: None,
                            range: None,
                        },
                        Parameter {
                            name: "branch_to_block_name".to_string(),
                            param_type: ParamTypeName::String,
                            required: true,
                            options: None,
                            default: None,
                            range: None,
                        },
                    ],
                    syntax: "slot[{{slot_index}}].trigger.model.addblock.branch.always(\
                        \"{{trigger_model_name}}\", \
                        \"{{trigger_block_name}}\", \
                        \"{{branch_to_block_name}}\")"
                        .to_string(),
                    description: Some("".to_string()),
                    shape: "".to_string(),
                },
            ),
            (
                "measure".to_string(),
                BlockDefinition {
                    parameters: vec![
                        Parameter {
                            name: "slot_index".to_string(),
                            param_type: ParamTypeName::SlotIndex,
                            required: true,
                            options: None,
                            default: Some(1.into()),
                            range: Some(ParameterRange {
                                min: Some(1.into()),
                                max: Some(64.into()),
                            }),
                        },
                        Parameter {
                            name: "trigger_model_name".to_string(),
                            param_type: ParamTypeName::String,
                            required: true,
                            options: None,
                            default: Some("model_name".into()),
                            range: None,
                        },
                        Parameter {
                            name: "trigger_block_name".to_string(),
                            param_type: ParamTypeName::String,
                            required: true,
                            options: None,
                            default: None,
                            range: None,
                        },
                        Parameter {
                            name: "channel_list".to_string(),
                            param_type: ParamTypeName::ChannelList,
                            required: true,
                            options: None,
                            default: None,
                            range: None,
                        },
                        Parameter {
                            name: "measure_count".to_string(),
                            param_type: ParamTypeName::Number,
                            required: false,
                            options: None,
                            default: None,
                            range: None,
                        },
                    ],
                    syntax: "slot[{{slot_index}}].trigger.model.addblock.measure(\
                        \"{{trigger_model_name}}\", \
                        \"{{trigger_block_name}}\", \
                        { {{#each channel_list}}{{this}}{{#unless @last}}, {{/unless}}{{/each}} }\
                        {{#if measure_count}}, {{measure_count}}{{/if}})"
                        .to_string(),
                    description: Some("".to_string()),
                    shape: "".to_string(),
                },
            ),
        ]);
        let trigger_events: HashMap<String, EventDefinition> = HashMap::from([]);
        Catalog {
            script_template: ScriptTemplate {
                preamble: "-- Preamble Text\n{{> begin_sentinel}}".to_string(),
                postamble: "{{> end_sentinel}}\n\n-- Postamble Text".to_string(),
                contents: r##"{{#each models}}
-- {{this.trigger_model_name}}
slot[{{this.slot_index}}].trigger.model.create("{{this.trigger_model_name}}")
{{#each this.blocks}}
{{> (lookup this "type") this.block_parameters}}

{{/each}}
-- slot[{{this.slot_index}}].trigger.model.initialize("{{this.trigger_model_name}}")
{{/each}}
"##
                .to_string(),
                begin_sentinel: "-- BEGIN GENERATED TRIGGER MODEL --".to_string(),
                end_sentinel: "-- END GENERATED TRIGGER MODEL --".to_string(),
            },
            blocks,
            trigger_events,
        }
    }

    fn slot_channel_list() -> SlotChannelList {
        SlotChannelList {
            slots: vec![
                Slot {
                    slot_index: SlotIndex(1),
                    module: Module::MSMU60_2,
                    node_id: "localnode".to_string(),
                    channels: vec![
                        Channel {
                            channel_index: ChannelIndex(1),
                            in_use: false,
                        },
                        Channel {
                            channel_index: ChannelIndex(2),
                            in_use: false,
                        },
                    ],
                },
                Slot {
                    slot_index: SlotIndex(2),
                    module: Module::MPSU50_2ST,
                    node_id: "localnode".to_string(),
                    channels: vec![
                        Channel {
                            channel_index: ChannelIndex(1),
                            in_use: false,
                        },
                        Channel {
                            channel_index: ChannelIndex(2),
                            in_use: false,
                        },
                    ],
                },
            ],
        }
    }

    #[test]
    fn empty_trigger_flow_state_produces_empty_script() {
        let catalog = catalog();
        let slot_channel_list = slot_channel_list();

        let input = TriggerFlowState {
            slot_channel_list,
            models: IndexMap::new(),
        };

        let Ok(actual) = Script::from_state(&catalog, &input) else {
            panic!("should be able to create script");
        };

        let expected = Script {
            preamble: r#"-- Preamble Text
-- BEGIN GENERATED TRIGGER MODEL --"#
                .to_string(),
            postamble: r#"-- END GENERATED TRIGGER MODEL --
-- Postamble Text"#
                .to_string(),
            contents: "".to_string(),
        };

        assert_eq!(expected, actual);
    }

    #[test]
    fn single_tm_single_block() {
        let catalog = catalog();
        let slot_channel_list = slot_channel_list();

        let input = TriggerFlowState {
            slot_channel_list,
            models: IndexMap::from([(
                "tm1".to_string(),
                TriggerModelState {
                    model_name: "tm1".to_string(),
                    slot_index: SlotIndex(1),
                    blocks: vec![TriggerModelBlock {
                        block_type: "always".to_string(),
                        block_parameters: HashMap::from([
                            ("slot_index".to_string(), 1.into()),
                            ("trigger_model_name".to_string(), "tm1".into()),
                            ("trigger_block_name".to_string(), "tm1_always_001".into()),
                            ("branch_to_block_name".to_string(), "other_block".into()),
                        ]),
                        incoming: None,
                        outgoing: None,
                        block_position: BlockPosition { x: 0.0, y: 0.0 },
                        block_id: "tm1_always_001".to_string(),
                        block_error: None,
                    }],
                },
            )]),
        };

        eprintln!(
            "input: {}",
            serde_json::to_string_pretty(&input).expect("Could print input json")
        );

        let Ok(actual) = Script::from_state(&catalog, &input) else {
            panic!("should be able to create script");
        };

        let expected = Script {
            preamble: r#"-- Preamble Text
-- BEGIN GENERATED TRIGGER MODEL --"#
                .to_string(),
            postamble: r#"-- END GENERATED TRIGGER MODEL --
-- Postamble Text"#
                .to_string(),
            contents: r##"-- tm1
slot[1].trigger.model.create("tm1")
slot[1].trigger.model.addblock.branch.always("tm1", "tm1_always_001", "other_block")
-- slot[1].trigger.model.initialize("tm1")
"##
            .to_string(),
        };

        assert_eq!(expected, actual);
    }

    #[test]
    fn single_tm_multiple_blocks() {
        let catalog = catalog();
        let slot_channel_list = slot_channel_list();

        let input = TriggerFlowState {
            slot_channel_list,
            models: IndexMap::from([(
                "tm1".to_string(),
                TriggerModelState {
                    model_name: "tm1".to_string(),
                    slot_index: SlotIndex(1),
                    blocks: vec![
                        TriggerModelBlock {
                            block_type: "always".to_string(),
                            block_parameters: HashMap::from([
                                ("slot_index".to_string(), 1.into()),
                                ("trigger_model_name".to_string(), "tm1".into()),
                                ("trigger_block_name".to_string(), "tm1_always_001".into()),
                                ("branch_to_block_name".to_string(), "other_block".into()),
                            ]),
                            incoming: None,
                            outgoing: None,
                            block_position: BlockPosition { x: 0.0, y: 0.0 },
                            block_id: "tm1_always_001".to_string(),
                            block_error: None,
                        },
                        TriggerModelBlock {
                            block_type: "measure".to_string(),
                            block_parameters: HashMap::from([
                                ("slot_index".to_string(), 1.into()),
                                ("trigger_model_name".to_string(), "tm1".into()),
                                ("trigger_block_name".to_string(), "tm1_measure_001".into()),
                                ("channel_list".to_string(), vec![1].into()),
                                ("measure_count".to_string(), 5.into()),
                            ]),
                            incoming: None,
                            outgoing: None,
                            block_position: BlockPosition { x: 0.0, y: 0.0 },
                            block_id: "tm1_measure_001".to_string(),
                            block_error: None,
                        },
                    ],
                },
            )]),
        };

        let Ok(actual) = Script::from_state(&catalog, &input) else {
            panic!("should be able to create script");
        };

        let expected = Script {
            preamble: r#"-- Preamble Text
-- BEGIN GENERATED TRIGGER MODEL --"#
                .to_string(),
            postamble: r#"-- END GENERATED TRIGGER MODEL --
-- Postamble Text"#
                .to_string(),
            contents: r##"-- tm1
slot[1].trigger.model.create("tm1")
slot[1].trigger.model.addblock.branch.always("tm1", "tm1_always_001", "other_block")
slot[1].trigger.model.addblock.measure("tm1", "tm1_measure_001", { 1 }, 5)
-- slot[1].trigger.model.initialize("tm1")
"##
            .to_string(),
        };

        assert_eq!(expected, actual);
    }

    #[test]
    fn multiple_models_single_block() {
        let catalog = catalog();
        let slot_channel_list = slot_channel_list();

        let input = TriggerFlowState {
            slot_channel_list,
            models: IndexMap::from([
                (
                    "tm1".to_string(),
                    TriggerModelState {
                        model_name: "tm1".to_string(),
                        slot_index: SlotIndex(1),
                        blocks: vec![TriggerModelBlock {
                            block_type: "always".to_string(),
                            block_parameters: HashMap::from([
                                ("slot_index".to_string(), 1.into()),
                                ("trigger_model_name".to_string(), "tm1".into()),
                                ("trigger_block_name".to_string(), "tm1_always_001".into()),
                                ("branch_to_block_name".to_string(), "other_block".into()),
                            ]),
                            incoming: None,
                            outgoing: None,
                            block_position: BlockPosition { x: 0.0, y: 0.0 },
                            block_id: "tm1_always_001".to_string(),
                            block_error: None,
                        }],
                    },
                ),
                (
                    "tm2".to_string(),
                    TriggerModelState {
                        model_name: "tm2".to_string(),
                        slot_index: SlotIndex(2),
                        blocks: vec![TriggerModelBlock {
                            block_type: "measure".to_string(),
                            block_parameters: HashMap::from([
                                ("slot_index".to_string(), 2.into()),
                                ("trigger_model_name".to_string(), "tm2".into()),
                                ("trigger_block_name".to_string(), "tm2_measure_001".into()),
                                ("channel_list".to_string(), vec![1].into()),
                                ("measure_count".to_string(), 5.into()),
                            ]),
                            incoming: None,
                            outgoing: None,
                            block_position: BlockPosition { x: 0.0, y: 0.0 },
                            block_id: "tm2_measure_001".to_string(),
                            block_error: None,
                        }],
                    },
                ),
            ]),
        };

        let Ok(actual) = Script::from_state(&catalog, &input) else {
            panic!("should be able to create script");
        };

        let expected = Script {
            preamble: r#"-- Preamble Text
-- BEGIN GENERATED TRIGGER MODEL --"#
                .to_string(),
            postamble: r#"-- END GENERATED TRIGGER MODEL --
-- Postamble Text"#
                .to_string(),
            contents: r##"-- tm1
slot[1].trigger.model.create("tm1")
slot[1].trigger.model.addblock.branch.always("tm1", "tm1_always_001", "other_block")
-- slot[1].trigger.model.initialize("tm1")
-- tm2
slot[2].trigger.model.create("tm2")
slot[2].trigger.model.addblock.measure("tm2", "tm2_measure_001", { 1 }, 5)
-- slot[2].trigger.model.initialize("tm2")
"##
            .to_string(),
        };

        assert_eq!(expected, actual);
    }

    #[test]
    fn multiple_tm_multiple_blocks() {
        let catalog = catalog();
        let slot_channel_list = slot_channel_list();

        let input = TriggerFlowState {
            slot_channel_list,
            models: IndexMap::from([
                (
                    "tm1".to_string(),
                    TriggerModelState {
                        model_name: "tm1".to_string(),
                        slot_index: SlotIndex(1),
                        blocks: vec![
                            TriggerModelBlock {
                                block_type: "always".to_string(),
                                block_parameters: HashMap::from([
                                    ("slot_index".to_string(), 1.into()),
                                    ("trigger_model_name".to_string(), "tm1".into()),
                                    ("trigger_block_name".to_string(), "tm1_always_001".into()),
                                    ("branch_to_block_name".to_string(), "other_block".into()),
                                ]),
                                incoming: None,
                                outgoing: None,
                                block_position: BlockPosition { x: 0.0, y: 0.0 },
                                block_id: "tm1_always_001".to_string(),
                                block_error: None,
                            },
                            TriggerModelBlock {
                                block_type: "measure".to_string(),
                                block_parameters: HashMap::from([
                                    ("slot_index".to_string(), 1.into()),
                                    ("trigger_model_name".to_string(), "tm1".into()),
                                    ("trigger_block_name".to_string(), "tm1_measure_001".into()),
                                    ("channel_list".to_string(), vec![1].into()),
                                    ("measure_count".to_string(), 5.into()),
                                ]),
                                incoming: None,
                                outgoing: None,
                                block_position: BlockPosition { x: 0.0, y: 0.0 },
                                block_id: "tm1_measure_001".to_string(),
                                block_error: None,
                            },
                        ],
                    },
                ),
                (
                    "tm2".to_string(),
                    TriggerModelState {
                        model_name: "tm2".to_string(),
                        slot_index: SlotIndex(2),
                        blocks: vec![
                            TriggerModelBlock {
                                block_type: "always".to_string(),
                                block_parameters: HashMap::from([
                                    ("slot_index".to_string(), 2.into()),
                                    ("trigger_model_name".to_string(), "tm2".into()),
                                    ("trigger_block_name".to_string(), "tm2_always_001".into()),
                                    ("branch_to_block_name".to_string(), "other_block".into()),
                                ]),
                                incoming: None,
                                outgoing: None,
                                block_position: BlockPosition { x: 0.0, y: 0.0 },
                                block_id: "tm2_always_001".to_string(),
                                block_error: None,
                            },
                            TriggerModelBlock {
                                block_type: "measure".to_string(),
                                block_parameters: HashMap::from([
                                    ("slot_index".to_string(), 2.into()),
                                    ("trigger_model_name".to_string(), "tm2".into()),
                                    ("trigger_block_name".to_string(), "tm2_measure_001".into()),
                                    ("channel_list".to_string(), vec![1].into()),
                                ]),
                                incoming: None,
                                outgoing: None,
                                block_position: BlockPosition { x: 0.0, y: 0.0 },
                                block_id: "tm2_measure_001".to_string(),
                                block_error: None,
                            },
                        ],
                    },
                ),
            ]),
        };

        let Ok(actual) = Script::from_state(&catalog, &input) else {
            panic!("should be able to create script");
        };

        let expected = Script {
            preamble: r#"-- Preamble Text
-- BEGIN GENERATED TRIGGER MODEL --"#
                .to_string(),
            postamble: r#"-- END GENERATED TRIGGER MODEL --
-- Postamble Text"#
                .to_string(),
            contents: r##"-- tm1
slot[1].trigger.model.create("tm1")
slot[1].trigger.model.addblock.branch.always("tm1", "tm1_always_001", "other_block")
slot[1].trigger.model.addblock.measure("tm1", "tm1_measure_001", { 1 }, 5)
-- slot[1].trigger.model.initialize("tm1")
-- tm2
slot[2].trigger.model.create("tm2")
slot[2].trigger.model.addblock.branch.always("tm2", "tm2_always_001", "other_block")
slot[2].trigger.model.addblock.measure("tm2", "tm2_measure_001", { 1 })
-- slot[2].trigger.model.initialize("tm2")
"##
            .to_string(),
        };

        assert_eq!(expected, actual);
    }

    #[test]
    fn replace_generated_with_sentinels() {
        let catalog = catalog();
        let slot_channel_list = slot_channel_list();

        let initial = r#"-- Preamble Text
-- BEGIN GENERATED TRIGGER MODEL --
-- tm1
slot[1].trigger.model.create("tm1")
slot[1].trigger.model.addblock.branch.always("tm1", "tm1_always_001", "other_block")
-- slot[1].trigger.model.initialize("tm1")
-- END GENERATED TRIGGER MODEL --
-- Postamble Text
"#;
        let input = TriggerFlowState {
            slot_channel_list,
            models: IndexMap::from([(
                "tm2".to_string(),
                TriggerModelState {
                    model_name: "tm2".to_string(),
                    slot_index: SlotIndex(2),
                    blocks: vec![TriggerModelBlock {
                        block_type: "always".to_string(),
                        block_parameters: HashMap::from([
                            ("slot_index".to_string(), 2.into()),
                            ("trigger_model_name".to_string(), "tm2".into()),
                            ("trigger_block_name".to_string(), "tm2_always_001".into()),
                            ("branch_to_block_name".to_string(), "other_block".into()),
                        ]),
                        incoming: None,
                        outgoing: None,
                        block_position: BlockPosition { x: 0.0, y: 0.0 },
                        block_id: "tm2_always_001".to_string(),
                        block_error: None,
                    }],
                },
            )]),
        };

        let Ok(script) = Script::from_state(&catalog, &input) else {
            panic!("should be able to create script");
        };

        let actual = script.replace_generated(&catalog, &initial);

        let expected = r#"-- Preamble Text
-- BEGIN GENERATED TRIGGER MODEL --
-- tm2
slot[2].trigger.model.create("tm2")
slot[2].trigger.model.addblock.branch.always("tm2", "tm2_always_001", "other_block")
-- slot[2].trigger.model.initialize("tm2")
-- END GENERATED TRIGGER MODEL --
-- Postamble Text
"#;

        assert_eq!(expected, actual);
    }

    #[test]
    fn replace_generated_no_sentinels() {
        let catalog = catalog();
        let slot_channel_list = slot_channel_list();

        let initial = r#"-- Preamble Text
-- tm1
slot[1].trigger.model.create("tm1")
slot[1].trigger.model.addblock.branch.always("tm1", "tm1_always_001", "other_block")
-- slot[1].trigger.model.initialize("tm1")
-- Postamble Text
"#;
        let input = TriggerFlowState {
            slot_channel_list,
            models: IndexMap::from([(
                "tm2".to_string(),
                TriggerModelState {
                    model_name: "tm2".to_string(),
                    slot_index: SlotIndex(2),
                    blocks: vec![TriggerModelBlock {
                        block_type: "always".to_string(),
                        block_parameters: HashMap::from([
                            ("slot_index".to_string(), 2.into()),
                            ("trigger_model_name".to_string(), "tm2".into()),
                            ("trigger_block_name".to_string(), "tm2_always_001".into()),
                            ("branch_to_block_name".to_string(), "other_block".into()),
                        ]),
                        incoming: None,
                        outgoing: None,
                        block_position: BlockPosition { x: 0.0, y: 0.0 },
                        block_id: "tm2_always_001".to_string(),
                        block_error: None,
                    }],
                },
            )]),
        };

        let Ok(script) = Script::from_state(&catalog, &input) else {
            panic!("should be able to create script");
        };

        let actual = script.replace_generated(&catalog, &initial);

        //expect that no change happened to the script.
        let expected = r#"-- Preamble Text
-- tm1
slot[1].trigger.model.create("tm1")
slot[1].trigger.model.addblock.branch.always("tm1", "tm1_always_001", "other_block")
-- slot[1].trigger.model.initialize("tm1")
-- Postamble Text
"#;

        assert_eq!(expected, actual);
    }
}
