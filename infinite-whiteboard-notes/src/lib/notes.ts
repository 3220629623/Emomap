import { PoolClient } from "pg";
import { CELL_SIZE, MIN_NOTE_DISTANCE, getCellCoord } from "./config";

export type NoteSummary = {
  id: string;
  x: number;
  y: number;
  cell_x: number;
  cell_y: number;
  color: string;
  text_preview: string;
  created_at: string;
};

export function parseCells(input: string | null) {
  if (!input) {
    return [];
  }

  return input
    .split(";")
    .map((part) => part.split(",").map((value) => Number.parseInt(value, 10)))
    .filter(([cellX, cellY]) => Number.isInteger(cellX) && Number.isInteger(cellY))
    .slice(0, 80)
    .map(([cellX, cellY]) => ({ cellX, cellY }));
}

export function getNeighborCells(x: number, y: number) {
  const cellX = getCellCoord(x);
  const cellY = getCellCoord(y);
  const cells: Array<{ cellX: number; cellY: number }> = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      cells.push({ cellX: cellX + dx, cellY: cellY + dy });
    }
  }
  return { cellX, cellY, cells };
}

export async function assertEnoughDistance(client: PoolClient, x: number, y: number) {
  const { cells } = getNeighborCells(x, y);
  const values = cells.map((_, index) => `($${index * 2 + 3}::integer, $${index * 2 + 4}::integer)`).join(",");
  const params: unknown[] = [x, y];
  for (const cell of cells) {
    params.push(cell.cellX, cell.cellY);
  }

  const nearby = await client.query<{ id: string; distance: number }>(
    `select id, sqrt(power(x - $1, 2) + power(y - $2, 2)) as distance
     from notes
     where status = 'published'
       and (cell_x, cell_y) in (${values})
       and sqrt(power(x - $1, 2) + power(y - $2, 2)) < $${params.length + 1}
     limit 1`,
    [...params, MIN_NOTE_DISTANCE]
  );

  if (nearby.rows[0]) {
    throw new Error("附近已经有留言了，请换一个稍远的位置。");
  }
}

export function getCellsForViewport(left: number, right: number, top: number, bottom: number) {
  const minX = Math.floor(left / CELL_SIZE) - 1;
  const maxX = Math.floor(right / CELL_SIZE) + 1;
  const minY = Math.floor(top / CELL_SIZE) - 1;
  const maxY = Math.floor(bottom / CELL_SIZE) + 1;
  const cells: string[] = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      cells.push(`${x},${y}`);
    }
  }
  return cells;
}
