import { SESSION_COOKIE, readFeishuSession, usesFeishu } from "@/lib/feishu-session";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

// Everything is private unless listed here. Candidates open /call/* without an account,
// so the call page and the one API it needs stay public. The Retell webhook is verified
// by its signature instead of a session.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/call(.*)",
  "/api/register-call(.*)",
  "/api/response-webhook(.*)",
  "/api/auth(.*)",
]);

const protectWithClerk = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!usesFeishu()) {
    return protectWithClerk(req, event);
  }
  if (!isPublicRoute(req) && !(await readFeishuSession(req.cookies.get(SESSION_COOKIE)?.value))) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
