use kic_trigger_flow::back_end::client_server::start;

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    println!("Welcome to KIC Script Generator!");

    start().await?;

    Ok(())
}
