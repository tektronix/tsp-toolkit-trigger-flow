//placeholder to prove server is running
use actix_web::{web, App, Error, HttpResponse, HttpServer};
use std::fs::{self as other_fs};

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

pub async fn start_web_server() -> std::io::Result<()> {
    let server = HttpServer::new(move || {
        App::new().route("/", web::get().to(serve_index_html)).wrap(
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
