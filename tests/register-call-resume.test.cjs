const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function setup({ syncFailure = false, active = true, archived = false } = {}) {
  const state = { calls: [], saved: [], prompts: [] };
  const prompt = fs
    .readFileSync("src/lib/constants.ts", "utf8")
    .match(/RETELL_AGENT_GENERAL_PROMPT = `([\s\S]*?)`;/)[1];
  const imports = {
    "@/lib/constants": { RETELL_AGENT_GENERAL_PROMPT: prompt },
    "@/lib/logger": { logger: { info() {}, error() {} } },
    "@/services/interviewers.service": {
      InterviewerService: { getInterviewer: async () => ({ agent_id: "agent-test" }) },
    },
    "@/services/interviews.service": {
      InterviewService: {
        getInterviewById: async () => ({
          id: "interview-test",
          is_active: active,
          is_archived: archived,
          is_anonymous: false,
          respondents: [],
          time_duration: "1",
          objective: "Content planning",
          questions: [{ question: "Describe your content process." }],
        }),
      },
    },
    "@/services/responses.service": {
      ResponseService: {
        getAllEmails: async () => [],
        createResponse: async (p) => state.saved.push(p),
      },
    },
    "next/server": { NextResponse: Response },
    "retell-sdk": class {
      agent = {
        retrieve: async () => {
          if (syncFailure) {
            throw new Error("provider unavailable");
          }
          return { response_engine: { type: "retell-llm", llm_id: "llm-test" } };
        },
      };
      llm = {
        retrieve: async () => ({ general_prompt: "legacy" }),
        update: async (_, p) => state.prompts.push(p),
      };
      call = {
        createWebCall: async (p) => {
          state.calls.push(p);
          return { call_id: "call-test", access_token: "test-only" };
        },
      };
    },
  };
  const code = ts.transpileModule(fs.readFileSync("src/app/api/register-call/route.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    process: { env: {} },
    require: (n) => {
      assert.ok(Object.hasOwn(imports, n));
      return imports[n];
    },
  });
  return {
    state,
    post: (resume) =>
      exports.POST(
        new Request("http://localhost/api/register-call", {
          method: "POST",
          body: JSON.stringify({
            interview_id: "interview-test",
            name: "Test operator",
            email: "test@example.com",
            resume,
          }),
        }),
      ),
  };
}
test("resume is sent in this call dynamic variables, with stored questions and objective", async () => {
  const { state, post } = setup();
  assert.equal((await post("  UniqueResumeProject result 42  ")).status, 200);
  assert.equal(state.calls[0].retell_llm_dynamic_variables.resume, "UniqueResumeProject result 42");
  assert.equal(
    state.calls[0].retell_llm_dynamic_variables.questions,
    "Describe your content process.",
  );
  assert.match(state.prompts[0].general_prompt, /In your first question, refer to a concrete/);
  assert.equal(state.saved[0].name, "Test operator");
});
test("prompt sync failure stops a resume call before any paid session is created", async () => {
  const { state, post } = setup({ syncFailure: true });
  assert.equal((await post("A real resume")).status, 503);
  assert.equal(state.calls.length, 0);
  assert.equal(state.saved.length, 0);
});
test("resume cannot add unbounded text to the provider context", async () => {
  const { state, post } = setup();
  await post("x".repeat(15000));
  assert.equal(state.calls[0].retell_llm_dynamic_variables.resume.length, 12000);
});
test("a call without a resume retains the explicit Not provided marker", async () => {
  const { state, post } = setup();
  await post("");
  assert.equal(state.calls[0].retell_llm_dynamic_variables.resume, "Not provided");
});
test("an inactive interview cannot create a provider call", async () => {
  const { state, post } = setup({ active: false });
  assert.equal((await post("resume")).status, 404);
  assert.equal(state.calls.length, 0);
});

test("a deleted interview cannot create a paid call even if its active flag is stale", async () => {
  const { state, post } = setup({ active: true, archived: true });
  assert.equal((await post("test-only resume")).status, 404);
  assert.equal(state.calls.length, 0);
  assert.equal(state.prompts.length, 0);
});
