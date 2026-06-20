import crypto from "crypto";
import fs from "fs";
import { nanoid } from "nanoid";
import { requireEnv, WRITE_PRICE_CENTS } from "./config";

type NativeOrderResponse = {
  code_url: string;
};

export function getWechatConfig() {
  return {
    appid: requireEnv("WECHAT_APPID"),
    mchid: requireEnv("WECHAT_MCH_ID"),
    serialNo: requireEnv("WECHAT_MCH_CERT_SERIAL_NO"),
    privateKeyPath: requireEnv("WECHAT_MCH_PRIVATE_KEY_PATH"),
    notifyUrl: requireEnv("WECHAT_PAY_NOTIFY_URL"),
    platformPublicKeyPath: requireEnv("WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH"),
    apiV3Key: requireEnv("WECHAT_API_V3_KEY")
  };
}

export function createOutTradeNo() {
  return `note_${Date.now()}_${nanoid(10)}`;
}

function getPrivateKey() {
  return fs.readFileSync(getWechatConfig().privateKeyPath, "utf8");
}

function sign(message: string) {
  return crypto.createSign("RSA-SHA256").update(message).sign(getPrivateKey(), "base64");
}

function buildAuthorization(method: string, urlPath: string, body: string) {
  const config = getWechatConfig();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = nanoid(32);
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = sign(message);
  const token =
    `mchid="${config.mchid}",` +
    `nonce_str="${nonceStr}",` +
    `timestamp="${timestamp}",` +
    `serial_no="${config.serialNo}",` +
    `signature="${signature}"`;
  return `WECHATPAY2-SHA256-RSA2048 ${token}`;
}

export async function createNativePayment(description: string, outTradeNo: string) {
  const config = getWechatConfig();
  const urlPath = "/v3/pay/transactions/native";
  const body = JSON.stringify({
    appid: config.appid,
    mchid: config.mchid,
    description,
    out_trade_no: outTradeNo,
    notify_url: config.notifyUrl,
    amount: {
      total: WRITE_PRICE_CENTS,
      currency: "CNY"
    }
  });

  const response = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
    method: "POST",
    headers: {
      Authorization: buildAuthorization("POST", urlPath, body),
      "Content-Type": "application/json",
      Accept: "application/json",
      "Wechatpay-Serial": config.serialNo
    },
    body
  });

  const payload = (await response.json()) as Partial<NativeOrderResponse> & { message?: string };
  if (!response.ok || !payload.code_url) {
    throw new Error(payload.message ?? "微信支付下单失败");
  }

  return payload.code_url;
}

export function decryptWechatResource(resource: { associated_data?: string; nonce: string; ciphertext: string }) {
  const key = Buffer.from(getWechatConfig().apiV3Key, "utf8");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(resource.nonce, "utf8"));
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  }
  const ciphertext = Buffer.from(resource.ciphertext, "base64");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  decipher.setAuthTag(authTag);
  const decoded = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(decoded) as {
    mchid: string;
    out_trade_no: string;
    transaction_id: string;
    trade_state: string;
    amount: { total: number; payer_total?: number; currency?: string };
  };
}

export function verifyWechatNotifySignature(request: Request, rawBody: string) {
  const timestamp = request.headers.get("wechatpay-timestamp");
  const nonce = request.headers.get("wechatpay-nonce");
  const signature = request.headers.get("wechatpay-signature");
  if (!timestamp || !nonce || !signature) {
    return false;
  }

  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const publicKey = fs.readFileSync(getWechatConfig().platformPublicKeyPath, "utf8");
  return crypto.verify("RSA-SHA256", Buffer.from(message), publicKey, Buffer.from(signature, "base64"));
}
