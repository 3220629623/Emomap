import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function getDeviceId(request: Request) {
  const headerValue = request.headers.get("x-device-id");
  if (headerValue && /^[a-zA-Z0-9_-]{8,80}$/.test(headerValue)) {
    return headerValue;
  }
  return null;
}
