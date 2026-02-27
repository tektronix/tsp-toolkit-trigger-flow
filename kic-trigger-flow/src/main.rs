use kic_trigger_flow::back_end::client_server::start;
use once_cell::sync::Lazy;
use trigger_flow_manager::Catalog;

pub static CATALOG: Lazy<Catalog> = Lazy::new(|| {
    Catalog::from_file("triggerBlocks.json").expect("Failed to load triggerBlocks.json")
});
#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    println!("Welcome to KIC Script Generator!");

    start(&*CATALOG).await?;

    Ok(())
}
