import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getDeviceId, jsonError } from "@/lib/http";
import { ensureUser } from "@/lib/user";

const themeSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});

export async function GET(_request: Request, context: { params: { id: string } }) {
  const note = await query(
    `select id, user_id, x, y, color, text, created_at::text
     from notes
     where id = $1 and status = 'published' and visibility = 'visible'`,
    [context.params.id]
  );
  if (!note.rows[0]) {
    return jsonError("Note not found.", 404);
  }

  const images = await query(
    `select id, url, width, height, sort_order
     from note_images
     where note_id = $1
     order by sort_order asc, id asc`,
    [context.params.id]
  );

  return NextResponse.json({ note: note.rows[0], images: images.rows });
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const deviceId = getDeviceId(request);
  if (!deviceId) {
    return jsonError("Missing x-device-id header.", 401);
  }
  const userId = await ensureUser(deviceId);
  const body = themeSchema.safeParse(await request.json());
  if (!body.success) {
    return jsonError("Invalid color.");
  }

  const updated = await query(
    `update notes
     set color = $1, updated_at = now()
     where id = $2 and user_id = $3 and status = 'published'
     returning id, color`,
    [body.data.color, context.params.id, userId]
  );

  if (!updated.rows[0]) {
    return jsonError("Only the author can change this note color.", 403);
  }
  return NextResponse.json({ note: updated.rows[0] });
}
