import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    message: "MVP 使用 /api/notes/publish 在支付获得写入额度后直接发布。"
  });
}
