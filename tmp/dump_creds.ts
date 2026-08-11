import { db } from './server/db'; 
import { credentials } from './shared/schema'; 
import { desc } from 'drizzle-orm'; 
import fs from 'fs';

async function run() {
  const c = await db.select().from(credentials).orderBy(desc(credentials.id)).limit(2);
  fs.writeFileSync('tmp/cred_dump.json', JSON.stringify(c.map(x => x.content), null, 2));
  console.log("Done dumping.");
  process.exit(0);
}
run();
