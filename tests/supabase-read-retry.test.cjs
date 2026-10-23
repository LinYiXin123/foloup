const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = ts.transpileModule(fs.readFileSync("src/lib/supabase.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(respond) {
  const calls = [];
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    Request,
    fetch: async (...args) => {
      calls.push(args);
      return respond(calls.length);
    },
    setTimeout: (callback) => callback(),
    require: () => ({}),
  });
  return { fetch: exports.fetchWithReadRetries, calls };
}

test("a transient read connection failure can recover", async () => {
  const client = setup((attempt) => {
    if (attempt === 1) {
      throw new TypeError("fetch failed");
    }
    return new Response("ok");
  });
  assert.equal(await (await client.fetch("https://database.test/rest/v1/response")).text(), "ok");
  assert.equal(client.calls.length, 2);
});

test("a temporary upstream read failure can recover", async () => {
  const client = setup((attempt) => new Response("", { status: attempt === 1 ? 503 : 200 }));
  assert.equal((await client.fetch("https://database.test/", { method: "HEAD" })).status, 200);
  assert.equal(client.calls.length, 2);
});

test("persistent read failures stop after three attempts", async () => {
  const client = setup(() => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(client.fetch("https://database.test/"), /fetch failed/);
  assert.equal(client.calls.length, 3);
});

for (const method of ["POST", "PATCH"]) {
  test(`${method} writes are never retried after a lost response`, async () => {
    const client = setup(() => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(client.fetch("https://database.test/", { method }), /fetch failed/);
    assert.equal(client.calls.length, 1);
  });
}

test("authentication failures are not retried", async () => {
  const client = setup(() => new Response("", { status: 401 }));
  assert.equal((await client.fetch("https://database.test/")).status, 401);
  assert.equal(client.calls.length, 1);
});

test("a caller cancellation stops read retries", async () => {
  const controller = new AbortController();
  const client = setup(() => {
    controller.abort();
    throw new Error("cancelled");
  });
  await assert.rejects(
    client.fetch("https://database.test/", { signal: controller.signal }),
    /cancelled/,
  );
  assert.equal(client.calls.length, 1);
});
