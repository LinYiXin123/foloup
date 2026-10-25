const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, imports) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      console,
      require: (name) => {
        assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
      },
    },
  );
  return exports;
}

function serviceSetup(error = null) {
  const operations = [];
  const query = {};
  for (const name of ["select", "or", "not", "eq", "update"]) {
    query[name] = (...args) => {
      operations.push([name, ...args]);
      return query;
    };
  }
  query.order = async (...args) => {
    operations.push(["order", ...args]);
    return { data: [], error };
  };
  query.single = async () => ({ data: { id: "interview-test" }, error });
  query.delete = () => assert.fail("Deleting a managed interview must not physically remove data");
  const { InterviewService } = load("src/services/interviews.service.ts", {
    "@/lib/supabase": {
      createServiceClient: () => ({
        from: (table) => {
          assert.equal(table, "interview", "responses and recordings must not be removed");
          return query;
        },
      }),
    },
  });
  return { service: InterviewService, operations };
}

test("deleting moves an interview to the recycle bin and disables its link without removing responses", async () => {
  const { service, operations } = serviceSetup();
  await service.deleteInterview("interview-test");
  assert.equal(operations.find((operation) => operation[0] === "update")[1].is_archived, true);
  assert.equal(operations.find((operation) => operation[0] === "update")[1].is_active, false);
  assert.deepEqual(
    operations.find((operation) => operation[0] === "eq"),
    ["eq", "id", "interview-test"],
  );
});

test("restoring makes the interview visible while keeping its candidate link inactive", async () => {
  const { service, operations } = serviceSetup();
  await service.restoreInterview("interview-test");
  const payload = operations.find((operation) => operation[0] === "update")[1];
  assert.equal(payload.is_archived, false);
  assert.equal(payload.is_active, false);
});

test("failed delete and restore writes reject instead of displaying false success", async () => {
  const error = { message: "Write failed" };
  const { service } = serviceSetup(error);
  await assert.rejects(service.deleteInterview("interview-test"), (failure) => failure === error);
  await assert.rejects(service.restoreInterview("interview-test"), (failure) => failure === error);
});

for (const archived of [false, true]) {
  test(`the ${archived ? "recycle bin" : "normal list"} keeps the ownership filter intact`, async () => {
    const { service, operations } = serviceSetup();
    await service.getAllInterviews("owner-1", "org-1", archived);
    assert.deepEqual(
      operations.filter((operation) => operation[0] === "or"),
      [["or", "organization_id.eq.org-1,user_id.eq.owner-1"]],
    );
    assert.ok(
      operations.some((operation) =>
        archived
          ? operation[0] === "eq" && operation[1] === "is_archived" && operation[2] === true
          : operation[0] === "not" &&
            operation[1] === "is_archived" &&
            operation[2] === "is" &&
            operation[3] === true,
      ),
    );
  });
}

test("org-less users cannot list other org-less users' deleted interviews", async () => {
  const { service, operations } = serviceSetup();
  await service.getAllInterviews("owner-1", "", true);
  assert.deepEqual(
    operations.find((operation) => operation[0] === "or"),
    ["or", "user_id.eq.owner-1"],
  );
});

function actionSetup(owned = true, archived = false) {
  const events = [];
  const auth = load("src/lib/auth.ts", {
    "@/lib/feishu-auth": {},
    "@/lib/feishu-session": { usesFeishu: () => false },
    "@clerk/nextjs/server": { auth: async () => ({ userId: "owner-1", orgId: "org-1" }) },
    "next/server": { NextResponse: Response },
  });
  const actions = load("src/actions/dashboard.ts", {
    "@/lib/auth": auth,
    "@/lib/feishu-auth": {},
    "@/lib/feishu-session": { usesFeishu: () => false },
    "@clerk/nextjs/server": {},
    "@/services/call-reconciliation.service": {},
    "@/services/clients.service": {},
    "@/services/interviewers.service": {},
    "@/services/responses.service": {},
    "@/services/interviews.service": {
      InterviewService: {
        getInterviewById: async () => ({
          id: "interview-test",
          user_id: owned ? "owner-1" : "other-user",
          is_archived: archived,
        }),
        deleteInterview: async (id) => events.push(["delete", id]),
        restoreInterview: async (id) => events.push(["restore", id]),
        getAllInterviews: async (...args) => events.push(["list", ...args]),
        updateInterview: async (payload) => events.push(["update", payload]),
      },
    },
  });
  return { actions, events };
}

test("another account cannot delete or restore an interview", async () => {
  const { actions, events } = actionSetup(false);
  await assert.rejects(actions.deleteMyInterview("interview-test"), /not found/);
  await assert.rejects(actions.restoreMyInterview("interview-test"), /not found/);
  assert.equal(events.length, 0);
});

test("the recycle bin uses server session ownership instead of caller-supplied identities", async () => {
  const { actions, events } = actionSetup();
  await actions.getMyDeletedInterviews();
  assert.deepEqual(events[0], ["list", "owner-1", "org-1", true]);
});

test("editing cannot move ownership, rewrite candidate URLs or bypass the recycle bin", async () => {
  const { actions, events } = actionSetup();
  await actions.updateMyInterview("interview-test", {
    name: "Renamed",
    user_id: "forged",
    organization_id: "forged-org",
    url: "https://invalid.example",
    is_archived: true,
  });
  assert.equal(events[0][1].name, "Renamed");
  assert.deepEqual(Object.keys(events[0][1]), ["name"]);
  const deleted = actionSetup(true, true);
  await assert.rejects(
    deleted.actions.updateMyInterview("interview-test", { is_active: true }),
    /Restore/,
  );
  assert.equal(deleted.events.length, 0);
});

test("deleted interviews no longer expose the public candidate page", async () => {
  const candidate = load("src/actions/candidate.ts", {
    "@/services/feedback.service": {},
    "@/services/interviewers.service": {},
    "@/services/responses.service": {},
    "@/services/interviews.service": {
      InterviewService: {
        getInterviewById: async () => ({ id: "interview-test", is_archived: true }),
      },
    },
  });
  assert.equal(await candidate.getPublicInterview("interview-test"), null);
});
