const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const React = require("react");
const ts = require("typescript");

const t = (text) => text;
const statuses = {
  NO_STATUS: "NO_STATUS",
  NOT_SELECTED: "NOT_SELECTED",
  POTENTIAL: "POTENTIAL",
  SELECTED: "SELECTED",
};
const componentStubs = new Proxy(
  { __esModule: true, default: "stub" },
  { get: (target, key) => target[key] ?? key },
);

function harness(path, imports = {}) {
  const values = [];
  const effects = [];
  const callbacks = [];
  let index = 0;
  let queued = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const hooks = {
    ...React,
    use: (value) => value,
    useState(initial) {
      const slot = index++;
      if (!(slot in values)) {
        values[slot] = initial;
      }
      return [
        values[slot],
        (value) => {
          values[slot] = typeof value === "function" ? value(values[slot]) : value;
        },
      ];
    },
    useEffect(effect, deps) {
      const slot = index++;
      if (!same(effects[slot]?.deps, deps)) {
        queued.push(() => {
          effects[slot]?.cleanup?.();
          effects[slot] = { deps, cleanup: effect() };
        });
      }
    },
    useCallback(callback, deps) {
      const slot = index++;
      if (!same(callbacks[slot]?.deps, deps)) {
        callbacks[slot] = { deps, callback };
      }
      return callbacks[slot].callback;
    },
  };
  const dependencies = {
    react: hooks,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/contexts/language.context": { useLanguage: () => ({ t, locale: "zh-CN" }) },
    "@/lib/enum": { CandidateStatus: statuses },
    "@/lib/utils": {
      formatTimestampToDateHHMM: () => "test time",
      convertSecondstoMMSS: String,
    },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    marked: { marked: (value) => value },
    ...imports,
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      AbortController,
      process: { env: {} },
      console,
      require: (name) => dependencies[name] ?? componentStubs,
    },
  );
  return {
    render(props) {
      index = 0;
      queued = [];
      const tree = exports.default(props);
      for (const effect of queued) {
        effect();
      }
      return tree;
    },
  };
}

function find(node, predicate) {
  if (Array.isArray(node)) {
    for (const item of node) {
      const match = find(item, predicate);
      if (match) {
        return match;
      }
    }
  } else if (node && typeof node === "object") {
    return predicate(node) ? node : find(node.props?.children, predicate);
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const metadata = {
  call_id: "call-current",
  interview_id: "interview-test",
  duration: 0,
  tab_switch_count: 0,
};
const details = { start_timestamp: 1000, end_timestamp: 61000, transcript: "User: 测试回答。" };
const analytics = { overallScore: 72, communication: { score: 7 }, callSummary: "中文面试摘要" };

test("newly loaded report updates list scores and summary duration without a reload or another analysis", async () => {
  let reads = 0;
  const oldResponses = [
    { ...metadata, id: 1 },
    { call_id: "call-other", duration: 30, id: 2 },
  ];
  const page = harness("src/app/(client)/interviews/[interviewId]/page.tsx", {
    "@/components/call/callInfo": { __esModule: true, default: "CallInfo" },
    "@/components/dashboard/interview/summaryInfo": { __esModule: true, default: "SummaryInfo" },
    "@clerk/nextjs": {
      useAuth: () => ({ isLoaded: true, userId: "owner-test", orgId: "org-test" }),
      useOrganization: () => ({ isLoaded: true }),
    },
    "@/actions/dashboard": {
      getMyInterview: async () => ({ id: "interview-test" }),
      getMyInterviewResponses: async () => {
        reads++;
        return oldResponses;
      },
    },
  });
  const props = {
    params: { interviewId: "interview-test" },
    searchParams: { call: metadata.call_id },
  };
  page.render(props);
  await settle();
  const callProps = find(page.render(props), (n) => n.type === "CallInfo").props;
  let requests = 0;
  const call = harness("src/components/call/callInfo.tsx", {
    axios: {
      __esModule: true,
      default: {
        post: async () => {
          requests++;
          return { data: { callResponse: details, analytics } };
        },
      },
    },
    "@/actions/dashboard": { getMyResponse: async () => metadata },
  });
  call.render(callProps);
  // Preserve a status changed while the report request is in flight.
  callProps.onCandidateStatusChange(metadata.call_id, statuses.POTENTIAL);
  await settle();
  const reportTree = call.render(callProps);
  const header = find(
    reportTree,
    (n) => n.props?.className === "flex justify-between items-center pb-4 pr-2",
  );
  assert.equal(
    header.props.children.includes(0),
    false,
    "zero tab switches must not render a stray 0",
  );
  const updatedCallProps = find(page.render(props), (n) => n.type === "CallInfo").props;
  assert.equal(
    updatedCallProps.onReportLoaded,
    callProps.onReportLoaded,
    "report callback remains stable",
  );
  call.render(updatedCallProps);
  await settle();
  const summary = find(
    page.render({ ...props, searchParams: {} }),
    (n) => n.type === "SummaryInfo",
  );
  const [updated, other] = summary.props.responses;
  assert.equal(updated.analytics, analytics);
  assert.equal(updated.details, details);
  assert.equal(updated.duration, 60);
  assert.equal(updated.is_analysed, true);
  assert.equal(updated.candidate_status, statuses.POTENTIAL);
  assert.equal(other, oldResponses[1]);
  assert.equal(reads, 1);
  assert.equal(requests, 1, "updating the list must not trigger another report request");
  const filter = find(page.render(props), (n) => n.type === "Select");
  await filter.props.onValueChange(statuses.NO_STATUS);
  const filteredTree = page.render(props);
  assert.ok(find(filteredTree, (n) => n.type === "button" && n.key === "2"));
  assert.equal(
    find(filteredTree, (n) => n.type === "button" && n.key === "1"),
    undefined,
  );
});

test("an obsolete report request cannot replace another call's list data", async () => {
  const pending = {};
  const received = [];
  const call = harness("src/components/call/callInfo.tsx", {
    axios: {
      __esModule: true,
      default: {
        post: (_, body) =>
          new Promise((resolve) => {
            pending[body.id] = resolve;
          }),
      },
    },
    "@/actions/dashboard": { getMyResponse: async () => metadata },
  });
  const props = { call_id: "old-call", onReportLoaded: (report) => received.push(report) };
  call.render(props);
  call.render({ ...props, call_id: "new-call" });
  pending["old-call"]({ data: { callResponse: details, analytics } });
  await settle();
  assert.equal(received.length, 0);
  pending["new-call"]({ data: { callResponse: details, analytics } });
  await settle();
  assert.deepEqual(
    received.map((r) => r.call_id),
    ["new-call"],
  );
});

test("an incomplete report never publishes invented scores to the summary", async () => {
  const received = [];
  const call = harness("src/components/call/callInfo.tsx", {
    axios: {
      __esModule: true,
      default: {
        post: async () => ({ data: { callResponse: details } }),
        isAxiosError: () => false,
      },
    },
    "@/actions/dashboard": { getMyResponse: async () => metadata },
  });
  const props = { call_id: "unfinished", onReportLoaded: (report) => received.push(report) };
  call.render(props);
  await settle();
  const tree = call.render(props);
  assert.equal(received.length, 0);
  assert.ok(find(tree, (n) => n.props?.role === "alert"));
});

test("unmarked candidate counts include null, missing and empty saved statuses", () => {
  const summary = harness("src/components/dashboard/interview/summaryInfo.tsx", {
    "@/contexts/interviewers.context": { useInterviewers: () => ({ interviewers: [] }) },
  });
  const props = {
    interview: { id: "interview-test" },
    responses: [null, undefined, "", statuses.NO_STATUS, statuses.SELECTED].map((status) => ({
      duration: 10,
      candidate_status: status,
    })),
  };
  summary.render(props);
  const chart = find(
    summary.render(props),
    (n) =>
      n.type === "PieChart" &&
      n.props.series[0].data.some((item) => item.label === "No Status (4)"),
  );
  assert.ok(chart);
  assert.equal(
    chart.props.series[0].data.reduce((sum, item) => sum + item.value, 0),
    5,
  );
});
