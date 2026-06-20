import { query } from "@/lib/db";
import { getDeviceId, jsonError } from "@/lib/http";
import { ensureUser } from "@/lib/user";

export async function GET(request: Request, context: { params: { outTradeNo: string } }) {
  const deviceId = getDeviceId(request);
  if (!deviceId) {
    return jsonError("Missing x-device-id header.", 401);
  }
  const userId = await ensureUser(deviceId);
  const payment = await query(
    "select out_trade_no, amount_cents, status, paid_at::text from payments where out_trade_no = $1 and user_id = $2",
    [context.params.outTradeNo, userId]
  );
  if (!payment.rows[0]) {
    return jsonError("Order not found.", 404);
  }
  return Response.json({ payment: payment.rows[0] });
}
