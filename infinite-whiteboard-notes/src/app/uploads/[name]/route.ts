import fs from "fs/promises";
import path from "path";
import { jsonError } from "@/lib/http";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export async function GET(_request: Request, context: { params: { name: string } }) {
  const safeName = path.basename(context.params.name);
  const ext = path.extname(safeName).toLowerCase();
  const contentType = contentTypes[ext];
  if (!contentType) {
    return jsonError("Unsupported image type.", 404);
  }

  try {
    const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
    const file = await fs.readFile(path.join(uploadDir, safeName));
    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return jsonError("File not found.", 404);
  }
}
