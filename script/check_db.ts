import { db } from "../server/db";
import { settings } from "../shared/schema";

async function main() {
  try {
    const results = await db.select().from(settings);
    console.log("Settings in database:");
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error("Error reading database settings:", err);
  }
  process.exit(0);
}

main();
