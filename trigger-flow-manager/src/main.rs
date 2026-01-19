mod trigger_model_blocks;

use trigger_model_blocks::TriggerBlocks;

fn main() -> anyhow::Result<()> {
    println!("Loading trigger blocks schema...");

    // Load the trigger blocks from the JSON file
    let blocks = TriggerBlocks::from_file("triggerBlocks.json")?;

    Ok(())
}
