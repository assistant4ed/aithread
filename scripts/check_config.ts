
import { getSettings } from '../lib/sheet_config';

async function main() {
    console.log("Fetching settings from sheet...");
    const settings = await getSettings();
    console.log("Current Settings:");
    console.log(JSON.stringify(settings, null, 2));
}

main().catch(console.error);
