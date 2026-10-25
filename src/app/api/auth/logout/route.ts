import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  cookieOptions,
  getFeishuConfig,
  usesFeishu,
} from "@/lib/feishu-session";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  if (!usesFeishu()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const config = getFeishuConfig();
  if (req.headers.get("origin") !== config.origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const response = NextResponse.redirect(new URL("/sign-in", config.origin), 303);
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  response.cookies.set(OAUTH_COOKIE, "", cookieOptions(0));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
