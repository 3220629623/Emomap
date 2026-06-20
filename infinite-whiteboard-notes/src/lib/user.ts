import { PoolClient } from "pg";
import { nanoid } from "nanoid";
import { query } from "./db";

export async function ensureUser(deviceId: string) {
  const existing = await query<{ id: string }>("select id from users where device_id = $1", [deviceId]);
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const id = nanoid();
  const created = await query<{ id: string }>(
    `insert into users (id, device_id)
     values ($1, $2)
     on conflict (device_id) do update set device_id = excluded.device_id
     returning id`,
    [id, deviceId]
  );
  await query(
    `insert into wallets (user_id, write_credits)
     values ($1, 0)
     on conflict (user_id) do nothing`,
    [created.rows[0].id]
  );
  return created.rows[0].id;
}

export async function ensureUserInTx(client: PoolClient, deviceId: string) {
  const existing = await client.query<{ id: string }>("select id from users where device_id = $1", [deviceId]);
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const id = nanoid();
  const created = await client.query<{ id: string }>(
    `insert into users (id, device_id)
     values ($1, $2)
     on conflict (device_id) do update set device_id = excluded.device_id
     returning id`,
    [id, deviceId]
  );
  await client.query(
    `insert into wallets (user_id, write_credits)
     values ($1, 0)
     on conflict (user_id) do nothing`,
    [created.rows[0].id]
  );
  return created.rows[0].id;
}
