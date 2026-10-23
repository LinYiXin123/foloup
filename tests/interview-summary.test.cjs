const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const React = require("react");
const ts = require("typescript");

function completionText(analyses) {
  const values = [];
  let index = 0;
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync("src/components/dashboard/interview/summaryInfo.tsx", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const imports = {
    react: {
      ...React,
      useState(initial) {
        const position = index++;
        if (!(position in values)) {
          values[position] = initial;
        }
        return [
          values[position],
          (value) => {
            values[position] = value;
          },
        ];
      },
      useEffect(effect) {
        effect();
      },
    },
    "@/contexts/language.context": { useLanguage: () => ({ t: (text) => text, locale: "en" }) },
    "@/contexts/interviewers.context": { useInterviewers: () => ({ interviewers: [] }) },
    "@/lib/enum": {
      CandidateStatus: {
        NO_STATUS: "NO_STATUS",
        NOT_SELECTED: "NOT_SELECTED",
        POTENTIAL: "POTENTIAL",
        SELECTED: "SELECTED",
      },
    },
    "@/lib/utils": { convertSecondstoMMSS: String },
  };
  const componentStubs = new Proxy(
    { __esModule: true, default: "div" },
    { get: (target, key) => target[key] ?? "div" },
  );
  vm.runInNewContext(code, {
    exports,
    require: (name) =>
      imports[name] ?? (name === "react/jsx-runtime" ? require(name) : componentStubs),
  });
  const props = {
    interview: { id: "synthetic", interviewer_id: 1 },
    responses: analyses.map((analysis) => ({
      details: { call_analysis: analysis },
      duration: 10,
      candidate_status: "NO_STATUS",
    })),
  };
  exports.default(props);
  index = 0;
  const tree = exports.default(props);
  function content(node) {
    if (Array.isArray(node)) {
      return node.map(content).join("");
    }
    if (node && typeof node === "object") {
      return content(node.props?.children);
    }
    return node == null || typeof node === "boolean" ? "" : String(node);
  }
  return content(tree);
}

test("current successful calls contribute to the actual summary completion rate", () => {
  assert.match(completionText([{ call_successful: true }]), /Interview Completion Rate100%/);
  assert.match(
    completionText([{ call_successful: true }, { call_successful: false }]),
    /Interview Completion Rate50%/,
  );
});

test("explicit failure overrides legacy ratings while older stored calls remain supported", () => {
  assert.match(
    completionText([{ call_successful: false, agent_task_completion_rating: "Complete" }]),
    /Interview Completion Rate0%/,
  );
  assert.match(
    completionText([
      { agent_task_completion_rating: "Complete" },
      { agent_task_completion_rating: "Partial" },
      {},
    ]),
    /Interview Completion Rate66.67%/,
  );
});
