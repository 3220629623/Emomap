import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getDeviceId, jsonError } from "@/lib/http";
import { ensureUser } from "@/lib/user";

export async function GET(request: Request) {
  const deviceId = getDeviceId(request);
  if (!deviceId) {
    return jsonError("Missing x-device-id header.", 401);
  }
  const userId = await ensureUser(deviceId);
  const wallet = await query<{ write_credits: string }>("select write_credits from wallets where user_id = $1", [userId]);
  return NextResponse.json({
    userId,
    writeCredits: Number(wallet.rows[0]?.write_credits ?? 0)
  });
}
