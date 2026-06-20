import { WRITE_CREDITS_PER_PAYMENT } from "@/lib/config";
import { transaction } from "@/lib/db";
import { getDeviceId, jsonError } from "@/lib/http";
import { ensureUserInTx } from "@/lib/user";

export async function POST(request: Request) {
  const deviceId = getDeviceId(request);
  if (!deviceId) {
    return jsonError("Missing x-device-id header.", 401);
  }

  const body = (await request.json().catch(() => ({}))) as { code?: string };
  if (body.code !== "123456") {
    return jsonError("Invalid development code.", 403);
  }

  const writeCredits = await transaction(async (client) => {
    const userId = await ensureUserInTx(client, deviceId);
    const wallet = await client.query<{ write_credits: string }>(
      `update wallets
       set write_credits = write_credits + $1, updated_at = now()
       where user_id = $2
       returning write_credits`,
      [WRITE_CREDITS_PER_PAYMENT, userId]
    );
    await client.query(
      "insert into wallet_transactions (user_id, delta, reason) values ($1, $2, 'mock_payment')",
      [userId, WRITE_CREDITS_PER_PAYMENT]
    );
    return Number(wallet.rows[0].write_credits);
  });

  return Response.json({ writeCredits });
}
