import pg from "pg";
const { Pool } = pg;

async function run() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Checking if email column exists in aws_accounts...");
    const checkRes = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='aws_accounts' AND column_name='email';
    `);

    if (checkRes.rows.length === 0) {
      console.log("Adding email column to aws_accounts...");
      await pool.query("ALTER TABLE aws_accounts ADD COLUMN email TEXT;");
      console.log("Column added successfully.");
    } else {
      console.log("Email column already exists.");
    }

  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await pool.end();
  }
}

run();
