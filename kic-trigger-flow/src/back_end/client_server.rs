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
                slot_channel_list: SlotChannelList::default(),
                models: IndexMap::new(),
            })),
            trigger_flow_tx: broadcast::channel(100).0,
            work_folder: Arc::new(Mutex::new(Some(String::new()))),
        }
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
                                    // Stateless processing - no backend state needed
                                    let processor = RequestProcessor::new(app_state.catalog);
                                    let response_type = processor.process_request(request);
                                    let response = match response_type {
                                        Ok(Some(resp)) => resp,
                                        Ok(None) => continue,

                                        Err(e) => {
                                            let error_response = serde_json::json!({
                                                "error": e.to_string()
                                            });
                                            error_response.to_string()
                                        }
                                    };
                                    println!("Sending WebSocket response: {}", response);
                                    if !response.contains("error") {
                                        if let Err(e) = app_state.trigger_flow_tx.send(()) {
                                            eprintln!("Failed to send signal: {e}");
                                        }
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

    let _trigger_flow_rx = app_state.trigger_flow_tx.subscribe();

    {
        let app_state_clone = app_state.clone();
        tokio::spawn(async move {
            while let Ok(()) = trigger_flow_rx.recv().await {
                println!("Signal received to start trigger flow!");
                let trigger_flow_state = app_state_clone.trigger_flow_state.lock().await;
                let work_folder_guard = app_state_clone.work_folder.lock().await;
                let work_folder = work_folder_guard
                    .as_deref()
                    .map(Path::new)
                    .unwrap_or_else(|| Path::new("./default.tsp"));
                //need to add function that creates file and writes script buffer to it
                let script = match Script::from_state(app_state_clone.catalog, &trigger_flow_state)
                {
                    Ok(script) => script,
                    Err(e) => {
                        eprintln!("Failed to create script from state: {}", e);
                        continue; // Skip this iteration
                    }
                };

                //TODO: Use script location and/or project name as appropriate
                let script_output: PathBuf = PathBuf::from(work_folder);

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
                    let updated = script.replace_generated(app_state_clone.catalog, &file_contents);
                    let file = File::options()
                        .truncate(true) //truncate the file to 0 length so we can replace the contents
                        .write(true)
                        .open(&script_output);
                    if let Ok(mut file) = file {
                        if let Err(e) = file.write_all(&updated.as_bytes()) {
                            eprintln!(
                                "Failed to write updated script to {}: {}",
                                script_output.display(),
                                e
                            );
                        }
                    } else if let Err(e) = file {
                        eprintln!(
                            "Failed to open script file at {}: {}",
                            script_output.display(),
                            e
                        );
                    }
                } else {
                    let file = File::options()
                        .create(true) //create a new file
                        .write(true)
                        .open(&script_output);
                    if let Ok(mut file) = file {
                        if let Err(e) = file.write_all(script.to_string().as_bytes()) {
                            eprintln!(
                                "Failed to write new script to {}: {}",
                                script_output.display(),
                                e
                            );
                        }
                    } else if let Err(e) = file {
                        eprintln!(
                            "Failed to open script file at {}: {}",
                            script_output.display(),
                            e
                        );
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
            println!("Received stdin line: {}", trimmed_line);
            if trimmed_line == "shutdown" {
                println!("Received shutdown command from stdin, shutting down...");
                let _ = value.send(());
                break;
            } else if let Ok(msg) = StdinLine::try_from(trimmed_line) {
                print!("Received stdin message: {:?}", msg);
                match msg {
                    StdinLine::Systems(msg) => {
                        //convert the systems_msg to slotChannelList
                        //use the triggerflowState mutex to update the state if slotChannelList already exists for it
                        println!("Received Systems command from stdin");
                        let mut triggerflow_state: tokio::sync::MutexGuard<'_, TriggerFlowState> =
                            app_state.trigger_flow_state.lock().await;

                        // Pass the entire Systems structure to process_system_config
                        let systems_json = serde_json::to_string(&msg).unwrap();
                        let response = triggerflow_state
                            .process_system_config(&systems_json, app_state.catalog);

                        println!("{}", response);
                        if !response.contains("error") {
                            if let Err(e) = app_state_clone.trigger_flow_tx.send(()) {
                                eprintln!("Failed to send signal: {e}");
                            }
                        }
                        //if session exists, change in system will be evaluate request and should be handled and response sent to UI
                        let mut session_lock = app_state_clone.session.lock().await;
                        if let Some(ref mut session) = session_lock.as_mut() {
                            if let Err(e) = session.text(response).await {
                                eprintln!("Failed to send response to WebSocket: {:?}", e);
                                // Clear the closed session
                                *session_lock = None;
                            }
                        }
                    }
                    StdinLine::Session(msg) => {
                        // handle session
                        println!("Received Session command from stdin: {:?}", msg);
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
                }
            } else {
                eprintln!("Failed to parse stdin JSON");
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
