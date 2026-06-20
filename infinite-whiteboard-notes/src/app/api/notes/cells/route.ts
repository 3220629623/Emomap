import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { NoteSummary, parseCells } from "@/lib/notes";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cells = parseCells(url.searchParams.get("cells"));
  if (cells.length === 0) {
    return NextResponse.json({ notes: [] });
  }

  const values = cells.map((_, index) => `($${index * 2 + 1}::integer, $${index * 2 + 2}::integer)`).join(",");
  const params = cells.flatMap((cell) => [cell.cellX, cell.cellY]);

  const result = await query<NoteSummary>(
    `select id, x, y, cell_x, cell_y, color, left(text, 42) as text_preview, created_at::text
     from notes
     where status = 'published'
       and visibility = 'visible'
       and (cell_x, cell_y) in (${values})
     order by created_at desc
     limit 3000`,
    params
  );

  return NextResponse.json({ notes: result.rows });
}
