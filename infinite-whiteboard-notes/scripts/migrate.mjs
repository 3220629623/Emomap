import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    process.env[key] ??= value;
  }
}

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  await pool.query(schema);
  console.log("Database migration complete.");
} finally {
  await pool.end();
}
