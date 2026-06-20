import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { MAX_IMAGES_PER_NOTE, MAX_NOTE_TEXT_LENGTH, getCellCoord } from "@/lib/config";
import { transaction } from "@/lib/db";
import { getDeviceId, jsonError } from "@/lib/http";
import { assertEnoughDistance } from "@/lib/notes";
import { ensureUserInTx } from "@/lib/user";

const publishSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  text: z.string().trim().min(1).max(MAX_NOTE_TEXT_LENGTH),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  images: z.array(z.object({ url: z.string().min(1).max(500) })).max(MAX_IMAGES_PER_NOTE).default([])
});

export async function POST(request: Request) {
  const deviceId = getDeviceId(request);
  if (!deviceId) {
    return jsonError("Missing x-device-id header.", 401);
  }

  const parsed = publishSchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonError("留言内容、颜色或图片参数不合法。");
  }

  try {
    const note = await transaction(async (client) => {
      const userId = await ensureUserInTx(client, deviceId);
      await assertEnoughDistance(client, parsed.data.x, parsed.data.y);

      const wallet = await client.query<{ write_credits: string }>(
        "select write_credits from wallets where user_id = $1 for update",
        [userId]
      );
      if (Number(wallet.rows[0]?.write_credits ?? 0) < 1) {
        throw new Error("写入次数不足，请先支付 0.01 元。");
      }

      const id = nanoid();
      const cellX = getCellCoord(parsed.data.x);
      const cellY = getCellCoord(parsed.data.y);
      const created = await client.query(
        `insert into notes (id, user_id, x, y, cell_x, cell_y, text, color)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id, x, y, cell_x, cell_y, color, left(text, 42) as text_preview, created_at::text`,
        [id, userId, parsed.data.x, parsed.data.y, cellX, cellY, parsed.data.text, parsed.data.color]
      );

      for (let i = 0; i < parsed.data.images.length; i += 1) {
        await client.query("insert into note_images (note_id, url, sort_order) values ($1, $2, $3)", [
          id,
          parsed.data.images[i].url,
          i
        ]);
      }

      await client.query("update wallets set write_credits = write_credits - 1, updated_at = now() where user_id = $1", [
        userId
      ]);
      await client.query(
        "insert into wallet_transactions (user_id, note_id, delta, reason) values ($1, $2, -1, 'publish_note')",
        [userId, id]
      );
      return created.rows[0];
    });

    return NextResponse.json({ note });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "发布失败。");
  }
}
