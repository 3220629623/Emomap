import fs from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";
import { MAX_IMAGE_BYTES } from "@/lib/config";
import { jsonError } from "@/lib/http";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("Missing file.");
  }
  const ext = allowedTypes.get(file.type);
  if (!ext) {
    return jsonError("Only jpg, png, and webp images are allowed.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return jsonError("Image is too large. Max size is 5MB.");
  }

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  await fs.mkdir(uploadDir, { recursive: true });
  const name = `${Date.now()}-${nanoid(8)}.${ext}`;
  const diskPath = path.join(uploadDir, name);
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(diskPath, bytes);

  return Response.json({ url: `/uploads/${name}` });
}
