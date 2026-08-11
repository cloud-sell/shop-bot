import { db } from './server/db'; 
import { credentials } from './shared/schema'; 
import { desc } from 'drizzle-orm'; 
import fs from 'fs';

async function run() {
  try {
    const c = await db.select().from(credentials).orderBy(desc(credentials.id)).limit(3);
    fs.writeFileSync('creds_debug.json', JSON.stringify(c, null, 2));
    console.log("Successfully dumped credentials to creds_debug.json");
  } catch (err) {
    console.error("Error dumping:", err);
  }
  process.exit(0);
}
run();
