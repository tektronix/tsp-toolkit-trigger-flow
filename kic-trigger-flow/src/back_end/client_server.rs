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
