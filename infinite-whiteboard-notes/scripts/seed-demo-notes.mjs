import pg from "pg";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";

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

const pool = new pg.Pool({ connectionString: databaseUrl });
const userId = "demo-user";

await pool.query("insert into users (id, device_id) values ($1, $2) on conflict do nothing", [userId, "demo-device"]);
await pool.query("insert into wallets (user_id, write_credits) values ($1, $2) on conflict do nothing", [userId, 0]);

const colors = ["#ffdf6e", "#ffa6c1", "#9ee493", "#9bd7ff", "#d8b4fe"];
for (let i = 0; i < 2000; i += 1) {
  const x = Math.round((Math.random() - 0.5) * 30000);
  const y = Math.round((Math.random() - 0.5) * 30000);
  await pool.query(
    `insert into notes (id, user_id, x, y, cell_x, cell_y, text, color)
     values ($1, $2, $3, $4, floor($3 / 1024.0), floor($4 / 1024.0), $5, $6)
     on conflict do nothing`,
    [nanoid(), userId, x, y, `这里是一张轻轻贴在白纸上的留言 ${i + 1}`, colors[i % colors.length]]
  );
}

await pool.end();
console.log("Seeded demo notes.");
