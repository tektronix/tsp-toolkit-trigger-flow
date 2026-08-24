//placeholder to prove server is running
use crate::back_end::stdin_line::StdinLine;
use actix_files as fs;
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer};
use actix_ws::{Message, Session};
use futures::StreamExt;
use indexmap::IndexMap;
use std::{
    collections::HashMap,
    fs::{self as other_fs, File},
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::{
    io::{self, AsyncBufReadExt},
    signal,
    sync::{broadcast, watch, Mutex},
};
use trigger_flow_manager::{
    api::{request::RequestType, slot_channel_list::SlotChannelList, state::TriggerFlowState},
    debug::DEBUG,
    request_processor::RequestProcessor,
    script::Script,
    Catalog, IpcData,
};

#[derive(Clone)]
pub struct AppState {
    session: Arc<Mutex<Option<Session>>>,
    catalog: &'static Catalog,
    trigger_flow_state: Arc<Mutex<TriggerFlowState>>,
    trigger_flow_tx: broadcast::Sender<()>,
    work_folder: Arc<Mutex<Option<String>>>,
}

impl AppState {
    pub fn new(catalog_ref: &'static Catalog) -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
            catalog: catalog_ref,
            trigger_flow_state: Arc::new(Mutex::new(TriggerFlowState {
                catalog: None,
                slot_channel_list: SlotChannelList::default(),
                models: IndexMap::new(),
                state_type: None,
            })),
            trigger_flow_tx: broadcast::channel(100).0,
            work_folder: Arc::new(Mutex::new(Option::None)),
        }
    }
}

/// True when the response should trigger downstream script generation.
///
/// Fires whenever the payload is well-formed and carries no top-level `error`
/// key. `empty_system_config_error` is treated the same as `evaluate_response`
/// for gating purposes: mass-stale models still round-trip through the script
/// generator, which emits `-- model 'name' skipped: stale binding` markers for
/// each. Keeps the emitted script consistent across partial-stale and
/// fully-stale states.
fn should_trigger_script(response: &str) -> bool {
    match serde_json::from_str::<serde_json::Value>(response) {
        Ok(value) => value.get("error").is_none(),
        Err(_) => !response.contains("\"error\""),
    }
}

async fn serve_index_html() -> Result<HttpResponse, Error> {
    let exe_path =
        std::env::current_exe().expect("should be able to get path of server executable");

    // Get the directory of the executable (this will be `trigger-flow-win32-x64/bin`)
    let exe_dir = exe_path
        .parent()
        .expect("should be able to get directory of server executable");

    //browser directory and trigger-flow.exe are on the same level in npm package
    let browser_dir = exe_dir.join("browser");

    // Path to the HTML file
    let html_path = browser_dir.join("index.html");

    let html_content = other_fs::read_to_string(&html_path).map_err(|e| {
        eprintln!("Failed to read HTML file at {}: {}", html_path.display(), e);
        actix_web::error::ErrorInternalServerError("Failed to load HTML")
    })?;

    // Rewrite resource URLs to absolute URLs pointing to the local server
    let base_url = "http://127.0.0.1:27951";
    let modified_html = html_content
        .replace("src=\"", &format!("src=\"{base_url}/"))
        .replace("href=\"", &format!("href=\"{base_url}/"));

    Ok(HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(modified_html))
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
                                    // Capture state from the original request for backend persistence
                                    // BEFORE handing the request off to the (consuming) processor.
                                    let request_state_for_persist: Option<(
                                        TriggerFlowState,
                                        bool,
                                    )> = match &request {
                                        RequestType::EvaluateRequest { trigger_flow_state } => {
                                            Some((trigger_flow_state.clone(), false))
                                        }
                                        RequestType::RecallRequest { trigger_flow_state } => {
                                            Some((trigger_flow_state.clone(), true))
                                        }
                                        RequestType::InitialRequest => None,
                                    };

                                    // Stateless processing - no backend state needed
                                    let processor = RequestProcessor::new(app_state.catalog);
                                    let response_type = processor.process_request(request);
                                    let (response, validated_state) = match response_type {
                                        Ok(Some((resp, state))) => (resp, state),
                                        Ok(None) => continue,

                                        Err(e) => {
                                            let error_response = serde_json::json!({
                                                "error": e.to_string()
                                            });
                                            (error_response.to_string(), None)
                                        }
                                    };
                                    if DEBUG {
                                        println!("Sending WebSocket response: {}", response);
                                    }
                                    let should_trigger_script = should_trigger_script(&response);
                                    println!(
                                        "WebSocket trigger decision: should_trigger_script={}, receiver_count={}",
                                        should_trigger_script,
                                        app_state.trigger_flow_tx.receiver_count()
                                    );
                                    if should_trigger_script {
                                        let mut state_persisted = false;
                                        if let Some((_incoming_state, is_recall)) =
                                            request_state_for_persist
                                        {
                                            match validated_state {
                                                Some(state) => {
                                                    let mut state_lock =
                                                        app_state.trigger_flow_state.lock().await;
                                                    // Recall arrives BEFORE Systems: the recall payload
                                                    // already contains the saved slot_channel_list and
                                                    // models, so persist it as-is. Systems will later
                                                    // refresh slot_channel_list against current hardware.
                                                    *state_lock = state;
                                                    println!(
                                                        "###WS persist: is_recall={}, slots={}, nodes={}, models={}",
                                                        is_recall,
                                                        state_lock.slot_channel_list.slots.len(),
                                                        state_lock.slot_channel_list.nodes.len(),
                                                        state_lock.models.len()
                                                    );
                                                    if is_recall {
                                                        println!(
                                                            "Persisted recall state from WebSocket request"
                                                        );
                                                    } else {
                                                        println!(
                                                            "Persisted evaluate state from WebSocket request before script generation"
                                                        );
                                                    }
                                                    state_persisted = true;
                                                }
                                                None => {
                                                    eprintln!(
                                                        "WS persist skipped: processor returned no validated state; refusing to write potentially stale script"
                                                    );
                                                }
                                            }
                                        } else {
                                            println!(
                                                "WebSocket request did not contain evaluate state; skipping script-generation signal"
                                            );
                                        }

                                        if state_persisted {
                                            match app_state.trigger_flow_tx.send(()) {
                                                Ok(receiver_count) => {
                                                    println!(
                                                        "WebSocket trigger_flow_tx signal sent to {} receivers",
                                                        receiver_count
                                                    );
                                                }
                                                Err(e) => {
                                                    eprintln!("Failed to send signal: {e}");
                                                }
                                            }
                                        } else {
                                            println!(
                                                "Skipping trigger_flow_tx send because evaluate state was not persisted"
                                            );
                                        }
                                    } else {
                                        println!(
                                            "Skipping trigger_flow_tx send for WebSocket response because payload contains an error"
                                        );
                                    }
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

pub async fn start_web_server(
    app_state: Arc<AppState>,
    mut shutdown_rx: watch::Receiver<()>,
) -> std::io::Result<()> {
    let server = HttpServer::new(move || {
        let exe_path =
            std::env::current_exe().expect("should be able to get path of server executable");
        let exe_dir = exe_path
            .parent()
            .expect("should be able to get directory of server executable");
        let browser_dir = exe_dir.join("browser");

        App::new()
            .app_data(web::Data::new(app_state.clone()))
            .route("/", web::get().to(serve_index_html))
            .route("/ws", web::get().to(ws_index))
            .service(fs::Files::new("/", browser_dir).index_file("index.html"))
            .wrap(
                actix_cors::Cors::default()
                    .allow_any_origin()
                    .allowed_methods(vec!["GET", "POST"])
                    .allowed_headers(vec!["Content-Type"]),
            )
    })
    .bind(("127.0.0.1", 27951))?
    .run();
    tokio::select! {
        res = server => res,
        _ = shutdown_rx.changed() => {
            println!("Shutdown signal received, stopping server...");
            Ok(())
        },
    }
}

pub async fn start(catalog_ref: &'static Catalog) -> anyhow::Result<()> {
    let app_state = Arc::new(AppState::new(catalog_ref));
    let (shutdown_tx, shutdown_rx) = watch::channel(());
    let server = start_web_server(app_state.clone(), shutdown_rx.clone());

    let mut trigger_flow_rx = app_state.trigger_flow_tx.subscribe();

    {
        let app_state_clone = app_state.clone();
        tokio::spawn(async move {
            loop {
                match trigger_flow_rx.recv().await {
                    Ok(()) => {
                        println!("Signal received to generate/update script");
                        let trigger_flow_state = app_state_clone.trigger_flow_state.lock().await;
                        println!(
                            "Script generation state snapshot: models={}, slots={}",
                            trigger_flow_state.models.len(),
                            trigger_flow_state.slot_channel_list.slots.len()
                        );
                        let work_folder_guard = app_state_clone.work_folder.lock().await;
                        let work_folder = work_folder_guard
                            .as_deref()
                            .map(Path::new)
                            .unwrap_or_else(|| Path::new("./default.tsp"));
                        //need to add function that creates file and writes script buffer to it
                        let script = match Script::from_state(
                            app_state_clone.catalog,
                            &trigger_flow_state,
                        ) {
                            Ok(script) => script,
                            Err(e) => {
                                eprintln!("Failed to create script from state: {}", e);
                                continue; // Skip this iteration
                            }
                        };

                        //TODO: Use script location and/or project name as appropriate
                        let script_output: PathBuf = PathBuf::from(work_folder);
                        if let Some(parent) = script_output.parent() {
                            if !parent.exists() {
                                if let Err(e) = std::fs::create_dir_all(parent) {
                                    eprintln!(
                                        "Failed to create directory {}: {}",
                                        parent.display(),
                                        e
                                    );
                                    continue;
                                }
                            }
                        }
                        if script_output.exists() {
                            let file_contents = match std::fs::read_to_string(&script_output) {
                                Ok(file_contents) => file_contents,
                                Err(e) => {
                                    eprintln!(
                                        "Failed to read existing script file at {}: {}",
                                        script_output.display(),
                                        e
                                    );
                                    continue; // Skip this iteration
                                }
                            };
                            let begin_sentinel = app_state_clone
                                .catalog
                                .script_template
                                .begin_sentinel
                                .trim();
                            let end_sentinel =
                                app_state_clone.catalog.script_template.end_sentinel.trim();
                            let has_sentinels =
                                file_contents.lines().any(|l| l.trim() == begin_sentinel)
                                    && file_contents.lines().any(|l| l.trim() == end_sentinel);

                            let updated = if has_sentinels {
                                script.replace_generated(app_state_clone.catalog, &file_contents)
                            } else {
                                println!(
                                    "Existing script file has no sentinels; replacing full file with generated script"
                                );
                                script.to_string()
                            };
                            match File::options()
                                .truncate(true)
                                .write(true)
                                .open(&script_output)
                            {
                                Ok(mut file) => {
                                    if let Err(e) = file.write_all(updated.as_bytes()) {
                                        eprintln!(
                                            "Failed to write updated script to {}: {}",
                                            script_output.display(),
                                            e
                                        );
                                    } else {
                                        println!(
                                            "Successfully updated script file: {}",
                                            script_output.display()
                                        );
                                    }
                                }
                                Err(e) => {
                                    eprintln!(
                                        "Failed to open script file at {}: {}",
                                        script_output.display(),
                                        e
                                    );
                                }
                            }
                        } else {
                            match File::options()
                                .create(true) //create a new file
                                .write(true)
                                .truncate(true)
                                .open(&script_output)
                            {
                                Ok(mut file) => {
                                    let script_content = script.to_string();
                                    if let Err(e) = file.write_all(script_content.as_bytes()) {
                                        eprintln!(
                                            "Failed to write new script to {}: {}",
                                            script_output.display(),
                                            e
                                        );
                                    } else {
                                        println!(
                                            "Successfully created script file: {}",
                                            script_output.display()
                                        );
                                    }
                                }
                                Err(e) => {
                                    eprintln!(
                                        "Failed to create script file at {}: {}",
                                        script_output.display(),
                                        e
                                    );
                                }
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        eprintln!(
                            "trigger_flow_rx lagged by {} messages; continuing to listen",
                            skipped
                        );
                        continue;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        eprintln!("trigger_flow_rx closed; stopping script generation task");
                        break;
                    }
                }
            }
        });
    }

    let value = shutdown_tx.clone();

    let app_state_clone = app_state.clone();
    tokio::spawn(async move {
        let stdin: tokio::io::Stdin = io::stdin();
        let mut reader: io::Lines<io::BufReader<io::Stdin>> = io::BufReader::new(stdin).lines();

        println!("Listening for stdin input...");
        while let Some(line) = reader.next_line().await.unwrap() {
            let trimmed_line = line.trim();
            if DEBUG {
                println!("Received stdin line: {}", trimmed_line);
            }
            if let Ok(msg) = StdinLine::try_from(trimmed_line) {
                if DEBUG {
                    print!("Received stdin message: {:?}", msg);
                }
                match msg {
                    StdinLine::Systems(msg) => {
                        //convert the systems_msg to slotChannelList
                        //use the triggerflowState mutex to update the state if slotChannelList already exists for it
                        println!("Received Systems command from stdin");
                        let mut triggerflow_state: tokio::sync::MutexGuard<'_, TriggerFlowState> =
                            app_state.trigger_flow_state.lock().await;

                        let response =
                            triggerflow_state.process_system_config(&msg, app_state.catalog);

                        let should_trigger_script = should_trigger_script(&response);
                        println!(
                            "Stdin Systems trigger decision: should_trigger_script={}, receiver_count={}",
                            should_trigger_script,
                            app_state_clone.trigger_flow_tx.receiver_count()
                        );
                        if should_trigger_script {
                            match app_state_clone.trigger_flow_tx.send(()) {
                                Ok(receiver_count) => {
                                    println!(
                                        "Stdin Systems trigger_flow_tx signal sent to {} receivers",
                                        receiver_count
                                    );
                                }
                                Err(e) => {
                                    eprintln!("Failed to send signal: {e}");
                                }
                            }
                        } else {
                            println!(
                                "Skipping trigger_flow_tx send for Systems response because payload contains an error"
                            );
                        }
                        let mut session = app_state.session.lock().await;
                        if let Some(session) = session.as_mut() {
                            session.text(response).await.unwrap();
                        }
                    }
                    StdinLine::SessionPath(msg) => {
                        // handle session
                        let mut work_folder_guard = app_state_clone.work_folder.lock().await;
                        let value = msg; // msg is already a ScriptPath with both session and folder fields
                        let filename: String = format!("{}.tsp", value.session.clone());
                        let path_file = Path::new(&value.folder).join(filename);
                        let folder = path_file.parent();
                        //println!("Updating work folder to: {:?}", folder.to_string_lossy().to_string());
                        // Check if the folder exists and is writable

                        if let Some(folder) = folder {
                            if folder.exists() {
                                *work_folder_guard = Some(path_file.to_string_lossy().to_string());
                                println!("Work folder updated to: {:?}", work_folder_guard);
                            } else {
                                println!(
                                    "The folder is read-only (OR) Work folder does not exist: {:?}",
                                    path_file.to_string_lossy().to_string()
                                );
                                println!(
                                    "Work folder does not exist: {:?}",
                                    path_file.to_string_lossy().to_string()
                                );
                            }
                        }
                    }
                    StdinLine::SessionData(msg) => {
                        // handle session data
                        if DEBUG {
                            println!(
                                "kic-trigger-flow-op:Received SessionData command from stdin: {:?}",
                                msg
                            );
                        }
                        // For demonstration, we just print the session data. You can add your own processing logic here.
                        match RequestType::try_from(&msg) {
                            Ok(request) => {
                                // Capture state from the original request for backend persistence
                                // BEFORE handing the request off to the (consuming) processor.
                                let request_state_for_persist: Option<(TriggerFlowState, bool)> =
                                    match &request {
                                        RequestType::EvaluateRequest { trigger_flow_state } => {
                                            Some((trigger_flow_state.clone(), false))
                                        }
                                        RequestType::RecallRequest { trigger_flow_state } => {
                                            Some((trigger_flow_state.clone(), true))
                                        }
                                        RequestType::InitialRequest => None,
                                    };

                                // Keep processor scoped so it is dropped before any await below.
                                let (response, validated_state) = {
                                    let processor = RequestProcessor::new(app_state.catalog);
                                    let response_type = processor.process_request(request);
                                    match response_type {
                                        Ok(Some((resp, state))) => (resp, state),
                                        Ok(None) => continue,

                                        Err(e) => {
                                            let error_response = serde_json::json!({
                                                "error": e.to_string()
                                            });
                                            (error_response.to_string(), None)
                                        }
                                    }
                                };
                                if DEBUG {
                                    println!("Sending WebSocket response: {}", response);
                                }

                                let should_trigger_script = should_trigger_script(&response);
                                println!(
                                    "SessionData trigger decision: should_trigger_script={}, receiver_count={}",
                                    should_trigger_script,
                                    app_state_clone.trigger_flow_tx.receiver_count()
                                );
                                if should_trigger_script {
                                    let mut state_persisted = false;
                                    if let Some((_incoming_state, is_recall)) =
                                        request_state_for_persist
                                    {
                                        match validated_state {
                                            Some(state) => {
                                                let mut state_lock =
                                                    app_state_clone.trigger_flow_state.lock().await;
                                                // Recall arrives BEFORE Systems: the recall payload
                                                // already contains the saved slot_channel_list and
                                                // models, so persist it as-is. Systems will later
                                                // refresh slot_channel_list against current hardware.
                                                *state_lock = state;
                                                println!(
                                                    "###SessionData persist: is_recall={}, slots={}, nodes={}, models={}",
                                                    is_recall,
                                                    state_lock.slot_channel_list.slots.len(),
                                                    state_lock.slot_channel_list.nodes.len(),
                                                    state_lock.models.len()
                                                );
                                                if is_recall {
                                                    println!(
                                                        "Persisted recall state from SessionData request"
                                                    );
                                                } else {
                                                    println!(
                                                        "Persisted evaluate state from SessionData request before script generation"
                                                    );
                                                }
                                                state_persisted = true;
                                            }
                                            None => {
                                                eprintln!(
                                                    "SessionData persist skipped: processor returned no validated state; refusing to write potentially stale script"
                                                );
                                            }
                                        }
                                    } else {
                                        println!(
                                            "SessionData request did not contain evaluate state; skipping script-generation signal"
                                        );
                                    }

                                    if state_persisted {
                                        match app_state_clone.trigger_flow_tx.send(()) {
                                            Ok(receiver_count) => {
                                                println!(
                                                    "SessionData trigger_flow_tx signal sent to {} receivers",
                                                    receiver_count
                                                );
                                            }
                                            Err(e) => {
                                                eprintln!("Failed to send signal: {e}");
                                            }
                                        }
                                    } else {
                                        println!(
                                            "Skipping trigger_flow_tx send because evaluate state was not persisted"
                                        );
                                    }
                                } else {
                                    println!(
                                        "Skipping trigger_flow_tx send for SessionData response because payload contains an error"
                                    );
                                }

                                // if session exists, send response back to UI
                                let mut session_lock = app_state_clone.session.lock().await;
                                if DEBUG {
                                    println!("send response to WebSocket session: {}", response);
                                }
                                if let Some(ref mut session) = session_lock.as_mut() {
                                    if let Err(e) = session.text(response).await {
                                        eprintln!("Failed to send response to WebSocket: {:?}", e);
                                        // Clear the closed session
                                        *session_lock = None;
                                    }
                                }
                            }
                            Err(err) => {
                                eprintln!("Failed to convert IpcData to RequestType: {err:?}");
                                continue;
                            }
                        }
                        //send response back to UI
                    }
                    StdinLine::Shutdown(_) => {
                        println!("Received shutdown command from stdin, shutting down...");
                        let _ = value.send(());
                        break;
                    }
                    StdinLine::ResetSession(_reset) => {
                        let mut triggerflow_state: tokio::sync::MutexGuard<'_, TriggerFlowState> =
                            app_state.trigger_flow_state.lock().await;

                        // Pass the entire Systems structure to process_system_config
                        triggerflow_state.reset();

                        let response = IpcData {
                            request_type: "Reset_session".to_string(),
                            additional_info: "".to_string(),
                            json_value: "{}".to_string(),
                        };
                        let mut session = app_state.session.lock().await;
                        if let Some(session) = session.as_mut() {
                            session
                                .text(serde_json::to_string(&response).unwrap())
                                .await
                                .unwrap();
                        }
                    }
                }
            } else {
                eprintln!(
                    "Failed to parse stdin line into StdinLine: {}",
                    trimmed_line
                );
            }
        }
    });

    // Spawn a task to listen for shutdown signal (e.g., Ctrl+C)
    tokio::spawn({
        let shutdown_tx = shutdown_tx.clone();
        async move {
            signal::ctrl_c().await.expect("Failed to listen for event");
            println!("Received Ctrl+C, shutting down...");
            let _ = shutdown_tx.send(());
        }
    });

    server.await?;
    Ok(())
}
