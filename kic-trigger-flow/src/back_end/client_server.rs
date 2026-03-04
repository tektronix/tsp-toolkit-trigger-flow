//placeholder to prove server is running
use actix_web::{App, Error, HttpRequest, HttpResponse, HttpServer, web};
use actix_ws::{Message, Session};
use futures::StreamExt;
use std::fs::{self as other_fs};
use actix_files as fs;

async fn serve_index_html() -> Result<HttpResponse, Error> {
    // Try to get the current directory
    let mut browser_path =
        std::env::current_dir().expect("should be able to get the path of current directory");
    browser_path.push("trigger-flow-ui");
    browser_path.push("dist\\trigger-flow-ui");
    browser_path.push("browser");
    browser_path.push("index.html");

    let html_content = other_fs::read_to_string(&browser_path).map_err(|e| {
        eprintln!(
            "Failed to read HTML file at {}: {}",
            browser_path.display(),
            e
        );
        actix_web::error::ErrorInternalServerError("Failed to load HTML")
    })?;

    Ok(HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html_content))
}

async fn ws_index(
    req: HttpRequest,
    body: web::Payload,
) -> Result<HttpResponse, Error> {
    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, body)?;

    actix_web::rt::spawn(async move {
        while let Some(Ok(msg)) = msg_stream.next().await {
            match msg {
                Message::Ping(bytes) => {
                    if session.pong(&bytes).await.is_err() {
                        return;
                    }
                }
                Message::Text(mut msg) => {
                        
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

pub async fn start_web_server() -> std::io::Result<()> {
    let server = HttpServer::new(move || {
        let mut browser_path =
            std::env::current_dir().expect("should be able to get the path of current directory");
        browser_path.push("trigger-flow-ui");
        browser_path.push("dist\\trigger-flow-ui");
        browser_path.push("browser");
        App::new()
            .route("/", web::get().to(serve_index_html))
            .route("/ws", web::get().to(ws_index))
            .service(fs::Files::new("/","C:/git/Boxcar/tsp-toolkit-trigger-flow/trigger-flow-ui/dist/trigger-flow-ui/browser").index_file("index.html"))
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

pub async fn start() -> anyhow::Result<()> {
    let server = start_web_server();
    server.await?;
    Ok(())
}
