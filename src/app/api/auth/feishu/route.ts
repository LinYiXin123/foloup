import {
  OAUTH_COOKIE,
  OAUTH_SECONDS,
  cookieOptions,
  createOAuthRequest,
  seal,
  usesFeishu,
} from "@/lib/feishu-session";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  if (!usesFeishu()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const { url, transaction } = createOAuthRequest(new URL(req.url).searchParams.get("next"));
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(
      OAUTH_COOKIE,
      await seal(transaction, "oauth", OAUTH_SECONDS),
      cookieOptions(OAUTH_SECONDS),
    );
    return response;
  } catch {
    return NextResponse.json(
      { error: "管理员尚未配置飞书登录，请检查本机环境变量。" },
      { status: 503 },
    );
  }
}
