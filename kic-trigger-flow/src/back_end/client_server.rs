//placeholder to prove server is running
use crate::back_end::stdin_line::StdinLine;
use actix_files as fs;
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer};
use actix_ws::{Message, Session};
use futures::StreamExt;
use indexmap::IndexMap;
use std::{
    collections::HashMap,
    fs::{self as other_fs},
    sync::Arc,
};
use tokio::{
    io::{self, AsyncBufReadExt},
    sync::{broadcast, Mutex},
};
use trigger_flow_manager::{
    api::{request::RequestType, slot_channel_list::SlotChannelList, state::TriggerFlowState},
    request_processor::RequestProcessor,
    Catalog, IpcData,
};

use handlebars::Handlebars;

#[derive(Clone)]
pub struct AppState {
    session: Arc<Mutex<Option<Session>>>,
    catalog: &'static Catalog,
    trigger_flow_state: Arc<Mutex<TriggerFlowState>>,
    trigger_flow_tx: broadcast::Sender<()>,
}

impl AppState {
    pub fn new(catalog_ref: &'static Catalog) -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
            catalog: catalog_ref,
            trigger_flow_state: Arc::new(Mutex::new(TriggerFlowState {
                slot_channel_list: SlotChannelList::default(),
                models: IndexMap::new(),
            })),
            trigger_flow_tx: broadcast::channel(100).0,
        }
    }
}

async fn serve_index_html() -> Result<HttpResponse, Error> {
    // Try to get the html path, this is temporary fix until the just file is ready for triggerFlow, when that is ready, we will use current_exe
    println!("{}", std::env::current_dir().unwrap().display());
    println!(
        "{}",
        std::env::current_exe().unwrap().parent().unwrap().display()
    );
    let mut html_path =
        std::env::current_dir().expect("should be able to get the path of current directory");
    html_path.push("trigger-flow-ui");
    html_path.push("dist");
    html_path.push("trigger-flow-ui");
    html_path.push("browser");
    html_path.push("index.html");

    let html_content = other_fs::read_to_string(&html_path).map_err(|e| {
        eprintln!("Failed to read HTML file at {}: {}", html_path.display(), e);
        actix_web::error::ErrorInternalServerError("Failed to load HTML")
    })?;

    Ok(HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html_content))
}

async fn ws_index(
    req: HttpRequest,
    body: web::Payload,
    app_state: web::Data<Arc<AppState>>,
) -> Result<HttpResponse, Error> {
    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, body)?;

    // Use the app_state here
    {
        let mut session_lock = app_state.session.lock().await;
        *session_lock = Some(session.clone());
    }

    let mut chunk_buffers: HashMap<String, Vec<Option<String>>> = HashMap::new();

    actix_web::rt::spawn(async move {
        while let Some(Ok(msg)) = msg_stream.next().await {
            match msg {
                Message::Ping(bytes) => {
                    if session.pong(&bytes).await.is_err() {
                        return;
                    }
                }
                Message::Text(mut msg) => {
                    let mut is_chunked = false;
                    {
                        use serde_json::Value;
                        if let Ok(value) = serde_json::from_str::<Value>(&msg) {
                            if let (
                                Some(msg_id),
                                Some(chunk_index),
                                Some(total_chunks),
                                Some(data),
                            ) = (
                                value.get("msg_id").and_then(|v| v.as_str()),
                                value.get("chunk_index").and_then(|v| v.as_u64()),
                                value.get("total_chunks").and_then(|v| v.as_u64()),
                                value.get("data").and_then(|v| v.as_str()),
                            ) {
                                is_chunked = true;
                                let entry = chunk_buffers
                                    .entry(msg_id.to_string())
                                    .or_insert_with(|| vec![None; total_chunks as usize]);
                                entry[chunk_index as usize] = Some(data.to_string());
                                if entry.iter().all(|c| c.is_some()) {
                                    let full_msg = entry
                                        .iter()
                                        .map(|c| c.as_ref().unwrap().as_str())
                                        .collect::<String>();
                                    chunk_buffers.remove(msg_id);
                                    println!(
                                        "Received complete chunked message of size: {} bytes",
                                        full_msg.len()
                                    );
                                    msg = full_msg.into();
                                } else {
                                    println!(
                                        "Received chunk {}/{} for msg_id {}",
                                        chunk_index + 1,
                                        total_chunks,
                                        msg_id
                                    );
                                    continue;
                                }
                            }
                        }
                    }
                    // --- End chunked message reassembly logic ---
                    // Only fall through to normal processing if not a chunked message or if chunk is complete
                    if is_chunked && msg.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<IpcData>(&msg) {
                        Ok(ipc_data) => {
                            match RequestType::try_from(&ipc_data) {
                                Ok(request) => {
                                    // Stateless processing - no backend state needed
                                    let processor = RequestProcessor::new(app_state.catalog);
                                    let response_type = processor.process_request(request);
                                    let response = match response_type {
                                        Ok(resp) => resp,
                                        Err(e) => {
                                            let error_response = serde_json::json!({
                                                "error": e.to_string()
                                            });
                                            error_response.to_string()
                                        }
                                    };
                                    println!("Sending WebSocket response: {}", response);
                                    session.text(&*response).await.unwrap();
                                }
                                Err(err) => {
                                    eprintln!("Failed to convert IpcData to RequestType: {err:?}");
                                    continue;
                                }
                            }
                            //send response back to UI
                        }
                        Err(e) => {
                            eprintln!("Failed to deserialize IpcData: {e}");
                        }
                    }
                }
                Message::Close(reason) => {
                    println!("Connection closed: {reason:?}");
                    return;
                }
                _ => (),
            }
        }
        println!("WebSocket message loop ended - connection lost or closed");
    });

    Ok(response)
}

pub async fn start_web_server(app_state: Arc<AppState>) -> std::io::Result<()> {
    let server = HttpServer::new(move || {
        let mut browser_path =
            std::env::current_dir().expect("should be able to get the path of current directory");
        browser_path.push("trigger-flow-ui");
        browser_path.push("dist");
        browser_path.push("trigger-flow-ui");
        browser_path.push("browser");
        App::new()
            .app_data(web::Data::new(app_state.clone()))
            .route("/", web::get().to(serve_index_html))
            .route("/ws", web::get().to(ws_index))
            .service(fs::Files::new("/", browser_path).index_file("index.html"))
            .wrap(
                actix_cors::Cors::default()
                    .allow_any_origin()
                    .allowed_methods(vec!["GET", "POST"])
                    .allowed_headers(vec!["Content-Type"]),
            )
    })
    .bind(("127.0.0.1", 27951))?
    .run();

    server.await
}

pub async fn start(catalog_ref: &'static Catalog) -> anyhow::Result<()> {
    let app_state = Arc::new(AppState::new(catalog_ref));
    let server = start_web_server(app_state.clone());

    let mut trigger_flow_rx = app_state.trigger_flow_tx.subscribe();

    tokio::spawn(async move {
        let stdin: tokio::io::Stdin = io::stdin();
        let mut reader: io::Lines<io::BufReader<io::Stdin>> = io::BufReader::new(stdin).lines();

        let app_state = app_state.clone();
        println!("Listening for stdin input...");
        while let Some(line) = reader.next_line().await.unwrap() {
            let trimmed_line = line.trim();
            println!("Received stdin line: {}", trimmed_line);
            if let Ok(msg) = StdinLine::try_from(trimmed_line) {
                print!("Received stdin message: {:?}", msg);
                match msg {
                    StdinLine::Systems(msg) => {
                        //convert the systems_msg to slotChannelList
                        //use the triggerflowState mutex to update the state if slotChannelList already exists for it
                        println!("Received Systems command from stdin");
                        let mut triggerflow_state: tokio::sync::MutexGuard<'_, TriggerFlowState> =
                            app_state.trigger_flow_state.lock().await;
                        // Process each system in the systems array
                        let response = if let Some(system_config) = msg.systems.first() {
                            let system_json = serde_json::to_string(system_config).unwrap();
                            triggerflow_state
                                .process_system_config(&system_json, &app_state.catalog)
                        } else {
                            "No systems found in message".to_string()
                        };

                        println!("{}", response);

                        //if session exists, change in system will be evaluate request and should be handled and response sent to UI
                        let mut session = app_state.session.lock().await;
                        if let Some(session) = session.as_mut() {
                            session.text(response).await.unwrap();
                        }
                    }
                }
            } else {
                eprintln!("Failed to parse stdin JSON");
            }
        }
    });

    server.await?;
    Ok(())
}

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
                .expect(format!("should have loaded '{name}' block template").as_str());
        }

        // load the event templates into hb
        for (name, event) in catalog.trigger_events.clone().into_iter() {
            hb.register_template_string(&name, event.syntax.clone())
                .expect(format!("should have loaded '{name}' trigger event template").as_str());
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
}

#[cfg(test)]
mod script_tests {
    use std::collections::HashMap;

    use trigger_flow_manager::{
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

    use crate::back_end::client_server::Script;

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
                contents: r##"{{#each trigger_models}}
-- {{this.model_name}}
slot[{{this.slot_index}}].trigger.model.create("{{this.model_name}}")
{{#each this.blocks}}
{{> (lookup this "type") this.block_parameters}}

{{/each}}
-- slot[{{this.slot_index}}].trigger.model.initialize("{{this.model_name}}")
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
            trigger_models: vec![],
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
            trigger_models: vec![TriggerModelState {
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
                    block_id: 1,
                }],
            }],
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
            trigger_models: vec![TriggerModelState {
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
                        block_id: 1,
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
                        block_id: 1,
                    },
                ],
            }],
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
            trigger_models: vec![
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
                        block_id: 1,
                    }],
                },
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
                        block_id: 1,
                    }],
                },
            ],
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
            trigger_models: vec![
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
                            block_id: 1,
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
                            block_id: 1,
                        },
                    ],
                },
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
                            block_id: 1,
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
                            block_id: 1,
                        },
                    ],
                },
            ],
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
}
