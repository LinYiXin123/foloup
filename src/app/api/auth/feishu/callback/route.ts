import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_SECONDS,
  cookieOptions,
  getFeishuConfig,
  resolveFeishuWorkspace,
  safeReturnTo,
  seal,
  unseal,
  usesFeishu,
} from "@/lib/feishu-session";
import {
  FeishuLoginError,
  ensureFeishuWorkspace,
  exchangeFeishuCode,
} from "@/services/feishu-auth.service";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (!usesFeishu()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const config = getFeishuConfig();
  const transaction = await unseal(req.cookies.get(OAUTH_COOKIE)?.value, "oauth");
  const params = req.nextUrl.searchParams;
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, config.origin));
    response.cookies.set(OAUTH_COOKIE, "", cookieOptions(0));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  if (
    !transaction ||
    typeof transaction.state !== "string" ||
    transaction.state !== params.get("state") ||
    typeof transaction.verifier !== "string"
  ) {
    return finish("/sign-in?error=invalid_state");
  }
  if (params.has("error") || !params.get("code")) {
    return finish("/sign-in?error=cancelled");
  }
  try {
    const identity = await exchangeFeishuCode(params.get("code") as string, transaction.verifier);
    const session = resolveFeishuWorkspace(identity);
    await ensureFeishuWorkspace(session);
    const response = finish(
      safeReturnTo(typeof transaction.next === "string" ? transaction.next : null),
    );
    response.cookies.set(
      SESSION_COOKIE,
      await seal(identity, "session", SESSION_SECONDS),
      cookieOptions(SESSION_SECONDS),
    );
    return response;
  } catch (error) {
    // Do not log authorization codes, provider tokens or secrets.
    console.error(
      "Feishu login failed",
      error instanceof FeishuLoginError
        ? { stage: error.stage, code: error.code }
        : { stage: "connection_or_configuration" },
    );
    return finish("/sign-in?error=provider_error");
  }
}
