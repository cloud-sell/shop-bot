
import { db } from "../server/db";
import { settings } from "../shared/schema";

async function check() {
    const all = await db.select().from(settings);
    console.log(JSON.stringify(all, null, 2));
    process.exit(0);
}

check();
