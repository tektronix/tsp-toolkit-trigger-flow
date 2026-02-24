//placeholder to prove server is running
use crate::back_end::stdin_line::StdinLine;
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer};
use actix_ws::{Message, Session};
use futures::StreamExt;
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
    api::{
        request::{RequestType, ResponseWrapper},
        slot_channel_list::SlotChannelList,
        state::TriggerFlowState,
    },
    request_processor::RequestProcessor,
    IpcData, TriggerBlocks,
};

#[derive(Clone)]
pub struct AppState {
    session: Arc<Mutex<Option<Session>>>,
    catalog: &'static TriggerBlocks,
    trigger_flow_state: Arc<Mutex<TriggerFlowState>>,
    trigger_flow_tx: broadcast::Sender<()>,
}

impl AppState {
    pub fn new(catalog_ref: &'static TriggerBlocks) -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
            catalog: catalog_ref,
            trigger_flow_state: Arc::new(Mutex::new(TriggerFlowState {
                slot_channel_list: SlotChannelList::default(),
                models: HashMap::new(),
            })),
            trigger_flow_tx: broadcast::channel(100).0,
        }
    }
}
async fn ws_index(
    req: HttpRequest,
    body: web::Payload,
    app_state: web::Data<AppState>,
    processor: web::Data<RequestProcessor>,
) -> Result<HttpResponse, Error> {
    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, body)?;
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
                                    let trigger_flow_state =
                                        app_state.trigger_flow_state.lock().await;
                                    let response_type = RequestProcessor::process_request(
                                        &processor,
                                        &app_state.catalog,
                                        &trigger_flow_state.slot_channel_list.clone(),
                                        request,
                                    );
                                    let response_wrapper = match response_type {
                                        Ok(resp) => ResponseWrapper::Ok(resp),
                                        Err(e) => ResponseWrapper::Err(e.to_string()),
                                    };
                                    let response =
                                        serde_json::to_string(&response_wrapper).unwrap();
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

async fn serve_index_html() -> Result<HttpResponse, Error> {
    let html_path = "index.html";

    let html_content = other_fs::read_to_string(html_path).map_err(|e| {
        eprintln!("Failed to read HTML file at {}: {}", html_path, e);
        actix_web::error::ErrorInternalServerError("Failed to load HTML")
    })?;

    Ok(HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html_content))
}

pub async fn start_web_server(app_state: Arc<AppState>) -> std::io::Result<()> {
    let server = HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(app_state.clone()))
            .route("/", web::get().to(serve_index_html))
            .route("/ws", web::get().to(ws_index))
            .wrap(
                actix_cors::Cors::default()
                    .allow_any_origin()
                    .allowed_methods(vec!["GET", "POST"])
                    .allowed_headers(vec!["Content-Type"]),
            )
    })
    .bind(("127.0.0.1", 27950))?
    .run();

    server.await
}

pub async fn start(catalog_ref: &'static TriggerBlocks) -> anyhow::Result<()> {
    let app_state = Arc::new(AppState::new(catalog_ref));
    let server = start_web_server(app_state.clone());

    let mut trigger_flow_rx = app_state.trigger_flow_tx.subscribe();

    tokio::spawn(async move {
        let stdin: tokio::io::Stdin = io::stdin();
        let mut reader: io::Lines<io::BufReader<io::Stdin>> =
            io::BufReader::new(stdin).lines();

        let app_state = app_state.clone();

        while let Some(line) = reader.next_line().await.unwrap() {
            let trimmed_line = line.trim();
            match StdinLine::try_from(trimmed_line) {
                Ok(StdinLine::Systems) => {
                    //convert the trimmed_line to slotChannelList
                    //use the triggerflowState mutex to update the state if slotChannelList already exists for it

                    let mut triggerflow_state: tokio::sync::MutexGuard<'_, TriggerFlowState> =
                        app_state.trigger_flow_state.lock().await;
                    let response =
                        triggerflow_state.process_system_config(trimmed_line, &app_state.catalog);

                    println!("{}", response);

                    //if session exists, change in system will be evaluate request and should be handled and response sent to UI
                    let mut session = app_state.session.lock().await;
                    if let Some(session) = session.as_mut() {
                        session.text(response).await.unwrap();
                    }
                }
                Err(e) => {
                    eprintln!("Failed to parse stdin line: {}", e);
                }
            }
        }
    });

    server.await?;
    Ok(())
}
