const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the real route without loading credentials, contacting providers, or writing data.
const routePath = path.join(__dirname, "../src/app/api/get-call/route.ts");
const routeCode = ts.transpileModule(fs.readFileSync(routePath, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

const analytics = { overallScore: 75, overallFeedback: "A clear example." };
const completedCall = {
  call_status: "ended",
  transcript: "Agent: Describe a project. User: I built a task board.",
  start_timestamp: 1_000,
  end_timestamp: 62_000,
};

function setup(options = {}) {
  const state = {
    record: { interview_id: "interview-1", is_analysed: false, ...options.record },
    call: { ...completedCall, ...options.call },
    result: options.result ?? { status: 200, analytics },
    retrieved: [],
    analysed: [],
    saved: [],
  };
  const imports = {
    "@/lib/auth": {
      requireUser: async () => ({ user: { userId: "owner-1" } }),
      canAccessInterview: () => options.authorized !== false,
    },
    "@/lib/logger": { logger: { info() {}, error() {} } },
    "@/services/analytics.service": {
      generateInterviewAnalytics: async (payload) => {
        state.analysed.push(JSON.parse(JSON.stringify(payload)));
        return state.result;
      },
    },
    "@/services/interviews.service": {
      InterviewService: { getInterviewById: async () => ({ id: "interview-1" }) },
    },
    "@/services/responses.service": {
      ResponseService: {
        getResponseByCallId: async () => state.record,
        saveResponse: async (payload, callId) => {
          state.saved.push({ payload: JSON.parse(JSON.stringify(payload)), callId });
          Object.assign(state.record, payload);
        },
      },
    },
    "next/server": { NextResponse: Response },
    "retell-sdk": class Retell {
      call = {
        retrieve: async (callId) => {
          state.retrieved.push(callId);
          return state.call;
        },
      };
    },
  };
  const exports = {};
  vm.runInNewContext(
    routeCode,
    {
      exports,
      process: { env: { RETELL_API_KEY: "test-only" } },
      require: (name) => {
        assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
      },
    },
    { filename: routePath },
  );

  const post = () =>
    exports.POST(
      new Request("http://localhost/api/get-call", {
        method: "POST",
        body: JSON.stringify({ id: "call-1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

  return { state, post };
}

test("completed interview saves the transcript, duration, and successful analysis", async () => {
  const { state, post } = setup();
  const response = await post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { callResponse: completedCall, analytics });
  assert.deepEqual(state.analysed, [
    { callId: "call-1", interviewId: "interview-1", transcript: completedCall.transcript },
  ]);
  assert.deepEqual(state.saved, [
    {
      callId: "call-1",
      payload: {
        details: completedCall,
        is_ended: true,
        is_analysed: true,
        duration: 61,
        analytics,
      },
    },
  ]);
});

for (const call_status of ["registered", "ongoing", "error"]) {
  test(`${call_status} calls do not request or save an analysis`, async () => {
    const { state, post } = setup({ call: { call_status } });
    assert.equal((await post()).status, 409);
    assert.equal(state.analysed.length, 0);
    assert.equal(state.saved.length, 0);
    assert.equal(state.record.is_analysed, false);
  });
}

for (const transcript of [undefined, "", "  \n "]) {
  test(`missing or blank transcript (${JSON.stringify(transcript)}) does not incur analysis`, async () => {
    const { state, post } = setup({ call: { transcript } });
    assert.equal((await post()).status, 409);
    assert.equal(state.analysed.length, 0);
    assert.equal(state.saved.length, 0);
  });
}

test("incomplete timing does not produce an invalid saved duration", async () => {
  const { state, post } = setup({ call: { end_timestamp: undefined } });
  assert.equal((await post()).status, 409);
  assert.equal(state.analysed.length, 0);
  assert.equal(state.saved.length, 0);
});

test("analysis failure leaves the response retryable and a later retry succeeds", async () => {
  const { state, post } = setup({ result: { status: 500, error: "quota exhausted" } });
  assert.equal((await post()).status, 502);
  assert.equal(state.saved.length, 0);
  assert.equal(state.record.is_analysed, false);

  state.result = { status: 200, analytics };
  assert.equal((await post()).status, 200);
  assert.equal(state.analysed.length, 2);
  assert.equal(state.saved.length, 1);
  assert.equal(state.record.is_analysed, true);
});

test("success without analytics is not saved as analysed", async () => {
  const { state, post } = setup({ result: { status: 200 } });
  assert.equal((await post()).status, 502);
  assert.equal(state.saved.length, 0);
});

test("existing successful analysis is reused without another provider request", async () => {
  const { state, post } = setup({
    record: { is_analysed: true, details: completedCall, analytics },
  });
  assert.equal((await post()).status, 200);
  assert.equal(state.retrieved.length, 0);
  assert.equal(state.analysed.length, 0);
  assert.equal(state.saved.length, 0);
});

test("a legacy analysed flag without analytics can recover", async () => {
  const { state, post } = setup({ record: { is_analysed: true, analytics: null } });
  assert.equal((await post()).status, 200);
  assert.equal(state.analysed.length, 1);
  assert.equal(state.saved.length, 1);
});

test("another user's interview cannot trigger provider requests or database updates", async () => {
  const { state, post } = setup({ authorized: false });
  assert.equal((await post()).status, 404);
  assert.equal(state.retrieved.length, 0);
  assert.equal(state.analysed.length, 0);
  assert.equal(state.saved.length, 0);
});
