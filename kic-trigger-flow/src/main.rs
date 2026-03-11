use std::path::PathBuf;

use kic_trigger_flow::back_end::client_server::start;
use once_cell::sync::Lazy;
use trigger_flow_manager::Catalog;

pub static CATALOG: Lazy<Catalog> = Lazy::new(|| {
    // TODO: Make sure we are getting the triggerBlocks file from the path where this
    // executable lives, not in the current working directory. Even better, when not
    // in debug, we should load the file at compile-time.
    Catalog::from_file(&PathBuf::from("triggerBlocks.yaml"))
        .expect("Failed to load triggerBlocks.yaml")
});

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    println!("Welcome to KIC Script Generator!");

    start(&*CATALOG).await?;

    Ok(())
}
