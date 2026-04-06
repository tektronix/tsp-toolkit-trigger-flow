use kic_trigger_flow::back_end::client_server::start;
use once_cell::sync::Lazy;
use trigger_flow_manager::Catalog;

const TRIGGER_BLOCKS_YAML: &str = include_str!("../../trigger-flow-manager/triggerBlocks.yaml");

pub static CATALOG: Lazy<Catalog> = Lazy::new(|| {
    // TODO: Make sure we are getting the triggerBlocks file from the path where this
    // executable lives, not in the current working directory. Even better, when not
    // in debug, we should load the file at compile-time.
    Catalog::from_yaml(TRIGGER_BLOCKS_YAML).expect("Failed to load triggerBlocks.yaml")
});

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    println!("Welcome to KIC TriggerFlow!");

    start(&CATALOG).await?;

    Ok(())
}
