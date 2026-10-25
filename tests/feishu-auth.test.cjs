const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, imports = {}, env = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      URL,
      URLSearchParams,
      AbortSignal,
      process: { env },
      require(name) {
        if (name === "node:crypto" || name === "jose") {
          return require(name);
        }
        assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
      },
      ...extra,
    },
  );
  return exports;
}

function setup() {
  const env = {
    AUTH_PROVIDER: "feishu",
    AUTH_URL: "http://localhost:3000",
    FEISHU_APP_ID: "test-app",
    FEISHU_APP_SECRET: "test-only-app-secret",
    AUTH_SESSION_SECRET: "a-test-only-session-secret-of-more-than-32-characters",
  };
  return { env, session: load("src/lib/feishu-session.ts", {}, env) };
}

class MockResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
    this.headers = new Headers();
    this.savedCookies = new Map();
    this.cookies = {
      set: (name, value, options) => this.savedCookies.set(name, { value, ...options }),
    };
  }
  static json(body, options) {
    return new MockResponse(body, options?.status);
  }
  static redirect(url, status = 307) {
    const response = new MockResponse(null, status);
    response.headers.set("location", url.toString());
    return response;
  }
  static next() {
    return new MockResponse("next");
  }
}

const identity = { openId: "ou_test-person", tenantKey: "tenant-test", name: "测试用户" };

test("OAuth uses state, S256 PKCE and a fixed callback without requesting extra scopes", async () => {
  const { session } = setup();
  const request = session.createOAuthRequest("/interviews/example?call=one");
  const url = new URL(request.url);
  assert.equal(url.origin, "https://accounts.feishu.cn");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "http://localhost:3000/api/auth/feishu/callback",
  );
  assert.equal(url.searchParams.get("state"), request.transaction.state);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("code_challenge"),
    crypto.createHash("sha256").update(request.transaction.verifier).digest("base64url"),
  );
  assert.equal(url.searchParams.has("scope"), false);
  assert.equal(url.toString().includes("test-only-app-secret"), false);
  const encrypted = await session.seal(request.transaction, "oauth", 600);
  assert.equal((await session.unseal(encrypted, "oauth")).next, "/interviews/example?call=one");
  assert.equal(session.cookieOptions(600).httpOnly, true);
  assert.equal(session.cookieOptions(600).sameSite, "lax");
});

test("tampered, expired, wrong-purpose, wrong-app and rotated-key sessions are rejected", async () => {
  const { session, env } = setup();
  const encrypted = await session.seal(identity, "session", 300);
  assert.equal((await session.readFeishuSession(encrypted)).name, identity.name);
  assert.equal(await session.unseal(encrypted, "oauth"), null);
  const parts = encrypted.split(".");
  parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
  assert.equal(await session.readFeishuSession(parts.join(".")), null);
  assert.equal(await session.readFeishuSession(await session.seal(identity, "session", 0)), null);
  env.FEISHU_APP_ID = "another-app";
  assert.equal(await session.readFeishuSession(encrypted), null);
  env.FEISHU_APP_ID = "test-app";
  env.AUTH_SESSION_SECRET = "another-test-only-session-key-more-than-32-characters";
  assert.equal(await session.readFeishuSession(encrypted), null);
});

test("return URLs cannot leave the application or return to auth endpoints", () => {
  const { session } = setup();
  for (const input of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/sign-in",
    "/api/auth/feishu",
    "/dashboard\r\nX: evil",
  ]) {
    assert.equal(session.safeReturnTo(input), "/dashboard");
  }
  assert.equal(
    session.safeReturnTo("/interviews/example?call=one"),
    "/interviews/example?call=one",
  );
});

test("each verified account gets an isolated workspace; an email never links old data", () => {
  const { session } = setup();
  const owner = session.resolveFeishuWorkspace({ ...identity, email: "same@example.com" });
  const other = session.resolveFeishuWorkspace({
    ...identity,
    openId: "another-person",
    email: "same@example.com",
  });
  const tenant = session.resolveFeishuWorkspace({ ...identity, tenantKey: "another-tenant" });
  assert.notEqual(owner.userId, other.userId);
  assert.notEqual(owner.orgId, other.orgId);
  assert.notEqual(owner.orgId, tenant.orgId);
});

test("only the explicitly configured verified identity can access the previous workspace", async () => {
  const { session, env } = setup();
  const ownId = session.resolveFeishuWorkspace(identity).userId;
  const encrypted = await session.seal(identity, "session", 300);
  env.FEISHU_USER_BINDINGS = JSON.stringify({
    [ownId]: {
      userId: "old-user",
      orgId: "old-org",
      organizationName: "Existing workspace",
    },
  });
  const restored = await session.readFeishuSession(encrypted);
  assert.equal(restored.userId, "old-user");
  assert.equal(restored.orgId, "old-org");
  assert.notEqual(
    session.resolveFeishuWorkspace({ ...identity, openId: "another-user" }).orgId,
    "old-org",
  );
  env.FEISHU_USER_BINDINGS = JSON.stringify({ [ownId]: { orgId: "old-org" } });
  assert.throws(() => session.resolveFeishuWorkspace(identity), /Invalid/);
  env.FEISHU_USER_BINDINGS = "null";
  assert.throws(() => session.resolveFeishuWorkspace(identity), /Invalid/);
});

test("protected APIs resolve Feishu server sessions and retain ownership checks", async () => {
  const { session } = setup();
  let current = null;
  const auth = load("src/lib/auth.ts", {
    "@/lib/feishu-session": session,
    "@/lib/feishu-auth": { getFeishuSession: async () => current },
    "@clerk/nextjs/server": { auth: () => assert.fail("Feishu mode must not contact Clerk") },
    "next/server": { NextResponse: MockResponse },
  });
  assert.equal((await auth.requireUser()).error.status, 401);
  await assert.rejects(auth.getSignedInUser, /Unauthorized/);
  current = session.resolveFeishuWorkspace(identity);
  const user = (await auth.requireUser()).user;
  assert.equal(
    auth.canAccessInterview({ user_id: "different", organization_id: "other-org" }, user),
    false,
  );
  assert.equal(auth.canAccessInterview({ user_id: current.userId }, user), true);
});

function callbackSetup(failExchange = false) {
  const { session, env } = setup();
  const events = [];
  const route = load("src/app/api/auth/feishu/callback/route.ts", {
    "@/lib/feishu-session": session,
    "@/services/feishu-auth.service": {
      FeishuLoginError: Error,
      exchangeFeishuCode: async (code, verifier) => {
        events.push(["exchange", code, verifier]);
        if (failExchange) {
          throw new Error("test-only provider failure");
        }
        return identity;
      },
      ensureFeishuWorkspace: async (workspace) => {
        events.push(["save", workspace.userId]);
      },
    },
    "next/server": { NextResponse: MockResponse },
  });
  const request = (params, cookie) => {
    const url = new URL("http://localhost:3000/api/auth/feishu/callback");
    url.search = new URLSearchParams(params).toString();
    return { url: url.toString(), nextUrl: url, cookies: { get: () => ({ value: cookie }) } };
  };
  return { route, request, events, session, env };
}

test("invalid state and denied consent never exchange codes or save a workspace", async () => {
  const { route, request, events, session } = callbackSetup();
  const cookie = await session.seal({ state: "expected", verifier: "test-verifier" }, "oauth", 600);
  const invalid = await route.GET(request({ code: "test-code", state: "wrong" }, cookie));
  assert.match(invalid.headers.get("location"), /error=invalid_state/);
  assert.equal(invalid.savedCookies.get(session.OAUTH_COOKIE).maxAge, 0);
  const denied = await route.GET(request({ error: "access_denied", state: "expected" }, cookie));
  assert.match(denied.headers.get("location"), /error=cancelled/);
  assert.equal(events.length, 0);
});

test("successful callback exchanges once, creates a workspace and sets only an encrypted app session", async () => {
  const { route, request, events, session } = callbackSetup();
  const cookie = await session.seal(
    { state: "expected", verifier: "test-verifier", next: "/interviews/example" },
    "oauth",
    600,
  );
  const response = await route.GET(request({ code: "test-code", state: "expected" }, cookie));
  assert.equal(response.headers.get("location"), "http://localhost:3000/interviews/example");
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], ["exchange", "test-code", "test-verifier"]);
  const saved = response.savedCookies.get(session.SESSION_COOKIE);
  assert.equal(saved.httpOnly, true);
  assert.equal((await session.readFeishuSession(saved.value)).name, identity.name);
  assert.equal(saved.value.includes("test-code"), false);
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
});

test("failed token exchange cannot create an authenticated session or publish provider error details", async () => {
  const { route, request, events, session } = callbackSetup(true);
  const cookie = await session.seal({ state: "expected", verifier: "test-verifier" }, "oauth", 600);
  const response = await route.GET(request({ code: "test-code", state: "expected" }, cookie));
  assert.match(response.headers.get("location"), /error=provider_error/);
  assert.equal(response.headers.get("location").includes("test-only"), false);
  assert.equal(response.savedCookies.has(session.SESSION_COOKIE), false);
  assert.equal(events.length, 1);
});

test("token exchange uses the documented PKCE endpoint, never retries codes and rejects provider errors", async () => {
  const { session } = setup();
  const requests = [];
  const service = load(
    "src/services/feishu-auth.service.ts",
    {
      "@/lib/feishu-session": session,
      "@/lib/supabase": {},
    },
    {},
    {
      fetch: async (url, options) => {
        requests.push({ url, options });
        return {
          ok: true,
          json: async () =>
            requests.length === 1
              ? { code: 0, access_token: "test-only-provider-token" }
              : { code: 20005, data: { open_id: "untrusted" } },
        };
      },
    },
  );
  await assert.rejects(() => service.exchangeFeishuCode("test-code", "test-verifier"), /profile/);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://open.feishu.cn/open-apis/authen/v2/oauth/token");
  assert.equal(JSON.parse(requests[0].options.body).code_verifier, "test-verifier");
});

test("logout requires same-origin POST and expires both application cookies", async () => {
  const { session } = setup();
  const route = load("src/app/api/auth/logout/route.ts", {
    "@/lib/feishu-session": session,
    "next/server": { NextResponse: MockResponse },
  });
  const request = (origin) =>
    new Request("http://localhost:3000/api/auth/logout", { method: "POST", headers: { origin } });
  assert.equal((await route.POST(request("https://evil.example"))).status, 403);
  const response = await route.POST(request("http://localhost:3000"));
  assert.equal(response.status, 303);
  assert.equal(response.savedCookies.get(session.SESSION_COOKIE).maxAge, 0);
  assert.equal(response.savedCookies.get(session.OAUTH_COOKIE).maxAge, 0);
});

test("workspace creation never overwrites an existing user or organization", async () => {
  const requests = [];
  const service = load("src/services/feishu-auth.service.ts", {
    "@/lib/feishu-session": {},
    "@/lib/supabase": {
      createServiceClient: () => ({
        from: (table) => ({
          upsert: async (data, options) => {
            requests.push({ table, data, options });
            return {};
          },
        }),
      }),
    },
  });
  await service.ensureFeishuWorkspace({
    userId: "old-user",
    orgId: "old-org",
    organizationName: "Old workspace",
  });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.options.ignoreDuplicates === true));
});

test("proxy protects private pages and APIs while candidate links stay public", async () => {
  const { session, env } = setup();
  let clerkCalls = 0;
  const proxy = load("src/proxy.ts", {
    "@/lib/feishu-session": session,
    "@clerk/nextjs/server": {
      clerkMiddleware: () => async () => {
        clerkCalls++;
        return MockResponse.next();
      },
      createRouteMatcher: (patterns) => (req) =>
        patterns.some((pattern) => new RegExp(`^${pattern}$`).test(req.nextUrl.pathname)),
    },
    "next/server": { NextResponse: MockResponse },
  });
  const request = (path, value) => ({
    url: `http://localhost:3000${path}`,
    nextUrl: new URL(`http://localhost:3000${path}`),
    cookies: { get: () => ({ value }) },
  });
  assert.equal((await proxy.default(request("/api/get-call"))).status, 401);
  const page = await proxy.default(request("/interviews/test?call=one"));
  assert.equal(
    new URL(page.headers.get("location")).searchParams.get("next"),
    "/interviews/test?call=one",
  );
  assert.equal((await proxy.default(request("/call/candidate"))).body, "next");
  const token = await session.seal(identity, "session", 300);
  assert.equal((await proxy.default(request("/dashboard", token))).body, "next");
  assert.equal(clerkCalls, 0);
  env.AUTH_PROVIDER = "clerk";
  await proxy.default(request("/dashboard"));
  assert.equal(clerkCalls, 1);
});
