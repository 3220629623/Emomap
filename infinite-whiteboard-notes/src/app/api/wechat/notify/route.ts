import { WRITE_CREDITS_PER_PAYMENT, WRITE_PRICE_CENTS } from "@/lib/config";
import { transaction } from "@/lib/db";
import { decryptWechatResource, getWechatConfig, verifyWechatNotifySignature } from "@/lib/wechat";

type NotifyPayload = {
  resource?: {
    associated_data?: string;
    nonce: string;
    ciphertext: string;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyWechatNotifySignature(request, rawBody)) {
    return Response.json({ code: "FAIL", message: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as NotifyPayload;
  if (!payload.resource) {
    return Response.json({ code: "FAIL", message: "missing resource" }, { status: 400 });
  }

  const resource = decryptWechatResource(payload.resource);
  const config = getWechatConfig();
  if (resource.mchid !== config.mchid || resource.amount.total !== WRITE_PRICE_CENTS) {
    return Response.json({ code: "FAIL", message: "payment mismatch" }, { status: 400 });
  }

  await transaction(async (client) => {
    const payment = await client.query<{ id: number; user_id: string; status: string }>(
      "select id, user_id, status from payments where out_trade_no = $1 for update",
      [resource.out_trade_no]
    );
    if (!payment.rows[0]) {
      throw new Error("payment not found");
    }
    if (payment.rows[0].status === "paid") {
      return;
    }
    if (resource.trade_state !== "SUCCESS") {
      await client.query("update payments set status = $1, raw_notify = $2 where id = $3", [
        resource.trade_state.toLowerCase(),
        JSON.stringify(resource),
        payment.rows[0].id
      ]);
      return;
    }

    await client.query(
      `update payments
       set status = 'paid', transaction_id = $1, raw_notify = $2, paid_at = now()
       where id = $3`,
      [resource.transaction_id, JSON.stringify(resource), payment.rows[0].id]
    );
    await client.query("update wallets set write_credits = write_credits + $1, updated_at = now() where user_id = $2", [
      WRITE_CREDITS_PER_PAYMENT,
      payment.rows[0].user_id
    ]);
    await client.query(
      "insert into wallet_transactions (user_id, payment_id, delta, reason) values ($1, $2, $3, 'wechat_payment')",
      [payment.rows[0].user_id, payment.rows[0].id, WRITE_CREDITS_PER_PAYMENT]
    );
  });

  return Response.json({ code: "SUCCESS", message: "success" });
}
