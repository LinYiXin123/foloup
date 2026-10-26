const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function load(relativePath, imports = {}, env = {}) {
  const filename = path.join(__dirname, "..", relativePath);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    code,
    {
      exports,
      URL,
      process: { env },
      require(name) {
        assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
      },
    },
    { filename },
  );
  return exports;
}

const { getInterviewUrl, isLocalInterviewUrl } = load("src/lib/interview-url.ts");

for (const [base, expectedOrigin] of [
  ["http://localhost:3000/", "http://localhost:3000"],
  ["localhost:3000", "http://localhost:3000"],
  ["127.0.0.1:3000/", "http://127.0.0.1:3000"],
  ["[::1]:3000", "http://[::1]:3000"],
  [" https://interviews.example.com/ ", "https://interviews.example.com"],
  ["interviews.example.com", "https://interviews.example.com"],
  ["https://interviews.example.com/call/old-id", "https://interviews.example.com"],
]) {
  test(`preview and share URLs normalize ${base}`, () => {
    const url = new URL(getInterviewUrl("面试 #1/测试", base));
    assert.equal(url.origin, expectedOrigin);
    assert.equal(decodeURIComponent(url.pathname.slice("/call/".length)), "面试 #1/测试");
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
  });
}

test("a public visit replaces a localhost development setting in candidate links", () => {
  for (const base of ["localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
    assert.equal(
      getInterviewUrl("ai管培生", base, "https://interviews.example.com"),
      "https://interviews.example.com/call/ai%E7%AE%A1%E5%9F%B9%E7%94%9F",
    );
  }
});

test("a configured public address is retained when managing interviews locally", () => {
  assert.equal(
    getInterviewUrl("interview-1", "https://interviews.example.com", "http://localhost:3000"),
    "https://interviews.example.com/call/interview-1",
  );
});

test("local-link notices identify loopback hosts rather than text in a public URL", () => {
  for (const url of ["http://localhost:3000/call/1", "127.0.0.1:3000", "http://[::1]:3000"]) {
    assert.equal(isLocalInterviewUrl(url), true);
  }
  for (const url of ["https://localhost.example.com", "https://example.com/call/localhost", ""]) {
    assert.equal(isLocalInterviewUrl(url), false);
  }
});

function setup({ failure, anonymous = false, base, origin = "http://localhost:3000" } = {}) {
  const inserted = [];
  const { InterviewService } = load("src/services/interviews.service.ts", {
    "@/lib/supabase": {
      createServiceClient: () => ({
        from(table) {
          assert.equal(table, "interview");
          return {
            insert: async (payload) => {
              inserted.push(JSON.parse(JSON.stringify(payload)));
              return { data: null, error: failure };
            },
          };
        },
      }),
    },
  });
  const { POST } = load(
    "src/app/api/create-interview/route.ts",
    {
      "@/lib/auth": {
        requireUser: async () =>
          anonymous
            ? { error: Response.json({ error: "Unauthorized" }, { status: 401 }) }
            : { user: { userId: "owner-1", orgId: "org-1" } },
      },
      "@/lib/interview-url": { getInterviewUrl },
      "@/lib/logger": { logger: { info() {}, error() {} } },
      "@/services/interviews.service": { InterviewService },
      nanoid: { nanoid: () => "new-interview" },
      "next/server": { NextResponse: Response },
    },
    { NEXT_PUBLIC_LIVE_URL: base },
  );
  return {
    inserted,
    post: () =>
      POST(
        new Request(`${origin}/api/create-interview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationName: "Test Org",
            interviewData: {
              name: "Test Interview",
              interviewer_id: "1",
              user_id: "forged-owner",
              organization_id: "forged-org",
            },
          }),
        }),
      ),
  };
}

test("creation saves a valid candidate URL and session ownership", async () => {
  const { inserted, post } = setup({ base: "http://localhost:3000/" });
  assert.equal((await post()).status, 200);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].url, "http://localhost:3000/call/new-interview");
  assert.equal(inserted[0].user_id, "owner-1");
  assert.equal(inserted[0].organization_id, "org-1");
});

test("creation falls back to the request origin when the public URL is unset", async () => {
  const { inserted, post } = setup();
  assert.equal((await post()).status, 200);
  assert.equal(inserted[0].url, "http://localhost:3000/call/new-interview");
});

test("creation through a public domain does not store the localhost development address", async () => {
  const { inserted, post } = setup({
    base: "http://localhost:3000",
    origin: "https://interviews.example.com",
  });
  assert.equal((await post()).status, 200);
  assert.equal(inserted[0].url, "https://interviews.example.com/call/new-interview");
});

test("a database write failure returns an error rather than successful creation", async () => {
  const { inserted, post } = setup({ failure: { code: "23503", message: "Missing interviewer" } });
  const response = await post();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error" });
  assert.equal(inserted.length, 1);
});

test("anonymous callers cannot create an interview", async () => {
  const { inserted, post } = setup({ anonymous: true });
  assert.equal((await post()).status, 401);
  assert.equal(inserted.length, 0);
});

test("a failed status update rejects so the UI cannot report a saved change", async () => {
  const failure = { code: "08006", message: "Connection lost" };
  const { InterviewService } = load("src/services/interviews.service.ts", {
    "@/lib/supabase": {
      createServiceClient: () => ({
        from: () => ({ update: () => ({ eq: async () => ({ data: null, error: failure }) }) }),
      }),
    },
  });
  await assert.rejects(
    InterviewService.updateInterview({ is_active: false }, "interview-1"),
    (error) => error === failure,
  );
});
