const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function loadModule(relativePath, imports) {
  const filename = path.join(__dirname, "..", relativePath);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    code,
    {
      exports,
      process: { env: { RETELL_API_KEY: "test-only" } },
      AbortController,
      setTimeout,
      clearTimeout,
      require: (name) => {
        assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
      },
    },
    { filename },
  );
  return exports;
}

function setup(calls, options = {}) {
  const state = { queried: [], retrieved: [], saved: [], warnings: 0, clientOptions: null };
  const pending = Object.keys(calls).map((call_id) => ({ call_id }));
  const { reconcileInterviewCalls } = loadModule("src/services/call-reconciliation.service.ts", {
    "server-only": {},
    "@/lib/logger": { logger: { warn: () => state.warnings++ } },
    "@/services/responses.service": {
      ResponseService: {
        getPendingCalls: async (interviewId) => {
          state.queried.push(interviewId);
          if (options.queryError) {
            throw new Error("database unavailable");
          }
          return pending;
        },
        saveResponse: async (payload, callId) => {
          state.saved.push({ callId, payload: JSON.parse(JSON.stringify(payload)) });
        },
      },
    },
    "retell-sdk": class Retell {
      constructor(clientOptions) {
        state.clientOptions = clientOptions;
      }
      call = {
        retrieve: async (callId, requestOptions) => {
          assert.ok(requestOptions.signal instanceof AbortSignal);
          state.retrieved.push(callId);
          if (calls[callId] instanceof Error) {
            throw calls[callId];
          }
          return calls[callId];
        },
      };
    },
  });
  return { state, reconcile: () => reconcileInterviewCalls("owned-interview") };
}

test("provider-ended call recovers its list visibility and valid duration without analytics", async () => {
  const { state, reconcile } = setup({
    "ended-call": { call_status: "ended", start_timestamp: 1000, end_timestamp: 61500 },
  });
  await reconcile();
  assert.deepEqual(state.queried, ["owned-interview"]);
  assert.deepEqual(state.saved, [
    { callId: "ended-call", payload: { is_ended: true, duration: 61 } },
  ]);
  assert.equal(state.clientOptions.maxRetries, 0);
  assert.equal(state.clientOptions.timeout, 8000);
});

test("registered, ongoing, error and unknown not-connected states remain pending", async () => {
  const { state, reconcile } = setup(
    Object.fromEntries(
      ["registered", "ongoing", "error", "not_connected"].map((call_status) => [
        call_status,
        { call_status },
      ]),
    ),
  );
  await reconcile();
  assert.equal(state.retrieved.length, 4);
  assert.deepEqual(state.saved, []);
});

test("one provider failure does not prevent another completed call from recovering", async () => {
  const { state, reconcile } = setup({
    "failed-call": new Error("provider unavailable"),
    "ended-call": { call_status: "ended" },
  });
  await reconcile();
  assert.equal(state.warnings, 1);
  assert.deepEqual(state.saved, [{ callId: "ended-call", payload: { is_ended: true } }]);
});

test("invalid timestamps never persist a NaN, negative, or invented duration", async () => {
  const { state, reconcile } = setup({
    "missing-timing": { call_status: "ended" },
    "invalid-timing": { call_status: "ended", start_timestamp: Number.NaN, end_timestamp: 3000 },
    "reversed-timing": { call_status: "ended", start_timestamp: 3000, end_timestamp: 1000 },
  });
  await reconcile();
  assert.equal(state.saved.length, 3);
  for (const { payload } of state.saved) {
    assert.deepEqual(payload, { is_ended: true });
  }
});

test("a failed pending query leaves the existing dashboard usable and performs no provider request", async () => {
  const { state, reconcile } = setup({}, { queryError: true });
  await reconcile();
  assert.deepEqual(state.retrieved, []);
  assert.deepEqual(state.saved, []);
  assert.equal(state.warnings, 1);
});

function setupDashboard(authorized) {
  const events = [];
  const actions = loadModule("src/actions/dashboard.ts", {
    "@/lib/feishu-auth": {},
    "@/lib/feishu-session": { usesFeishu: () => false },
    "@/lib/auth": {
      getSignedInUser: async () => {
        events.push("auth");
        return { userId: "owner" };
      },
      canAccessInterview: () => {
        events.push("ownership");
        return authorized;
      },
    },
    "@/services/call-reconciliation.service": {
      reconcileInterviewCalls: async (id) => events.push(`reconcile:${id}`),
    },
    "@/services/clients.service": {},
    "@/services/interviewers.service": {},
    "@/services/interviews.service": {
      InterviewService: { getInterviewById: async () => ({ id: "canonical-owned-id" }) },
    },
    "@/services/responses.service": {
      ResponseService: {
        getAllResponses: async (id) => {
          events.push(`list:${id}`);
          return [];
        },
      },
    },
    "@clerk/nextjs/server": {},
  });
  return { events, actions };
}

test("dashboard verifies ownership before reconciling and lists after reconciliation", async () => {
  const { events, actions } = setupDashboard(true);
  await actions.getMyInterviewResponses("requested-id");
  assert.deepEqual(events, [
    "auth",
    "ownership",
    "reconcile:canonical-owned-id",
    "list:canonical-owned-id",
  ]);
});

test("another user's interview cannot trigger reconciliation or response queries", async () => {
  const { events, actions } = setupDashboard(false);
  await assert.rejects(actions.getMyInterviewResponses("someone-elses-id"), /Interview not found/);
  assert.deepEqual(events, ["auth", "ownership"]);
});

test("pending query is interview-scoped and includes null flags; ended list does not require Retell analysis", async () => {
  const queries = [];
  const builder = {
    select: (...args) => {
      queries.push(["select", ...args]);
      return builder;
    },
    eq: (...args) => {
      queries.push(["eq", ...args]);
      return builder;
    },
    or: (...args) => {
      queries.push(["or", ...args]);
      return builder;
    },
    order: () => Promise.resolve({ data: [], error: null }),
  };
  const { ResponseService } = loadModule("src/services/responses.service.ts", {
    "@/lib/supabase": { createServiceClient: () => ({ from: () => builder }) },
  });
  await ResponseService.getPendingCalls("owned-interview");
  assert.deepEqual(queries, [
    ["select", "call_id"],
    ["eq", "interview_id", "owned-interview"],
    ["or", "is_ended.is.null,is_ended.eq.false"],
  ]);
  queries.length = 0;
  await ResponseService.getAllResponses("owned-interview");
  assert.deepEqual(queries, [
    ["select", "*"],
    ["eq", "interview_id", "owned-interview"],
    ["eq", "is_ended", true],
  ]);
});

for (const failure of ["query", "network"]) {
  test(`${failure} failure does not appear as a successful empty response list`, async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: async () => {
        if (failure === "network") {
          throw new Error("network unavailable");
        }
        return { data: null, error: { message: "database unavailable" } };
      },
    };
    const { ResponseService } = loadModule("src/services/responses.service.ts", {
      "@/lib/supabase": { createServiceClient: () => ({ from: () => builder }) },
    });
    await assert.rejects(
      ResponseService.getAllResponses("owned-interview"),
      failure === "network" ? /network unavailable/ : /Could not load interview responses/,
    );
  });
}
