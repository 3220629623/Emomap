import QRCode from "qrcode";
import { WRITE_CREDITS_PER_PAYMENT, WRITE_PRICE_CENTS } from "@/lib/config";
import { transaction } from "@/lib/db";
import { getDeviceId, jsonError } from "@/lib/http";
import { ensureUserInTx } from "@/lib/user";
import { createNativePayment, createOutTradeNo } from "@/lib/wechat";

export async function POST(request: Request) {
  const deviceId = getDeviceId(request);
  if (!deviceId) {
    return jsonError("Missing x-device-id header.", 401);
  }

  try {
    const result = await transaction(async (client) => {
      const userId = await ensureUserInTx(client, deviceId);
      const outTradeNo = createOutTradeNo();
      await client.query(
        `insert into payments (user_id, out_trade_no, amount_cents, status)
         values ($1, $2, $3, 'creating')`,
        [userId, outTradeNo, WRITE_PRICE_CENTS]
      );

      const codeUrl = await createNativePayment("无限白纸留言写入 1 次", outTradeNo);
      await client.query("update payments set status = 'pending', code_url = $1 where out_trade_no = $2", [
        codeUrl,
        outTradeNo
      ]);
      const qrDataUrl = await QRCode.toDataURL(codeUrl, { margin: 1, width: 280 });
      return { outTradeNo, codeUrl, qrDataUrl };
    });

    return Response.json({
      ...result,
      amountCents: WRITE_PRICE_CENTS,
      writeCredits: WRITE_CREDITS_PER_PAYMENT
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "微信支付下单失败。", 500);
  }
}
