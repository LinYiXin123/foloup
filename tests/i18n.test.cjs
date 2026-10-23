const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const React = require("react");
const ReactDOMServer = require("react-dom/server");

function compile(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => imports[name] ?? require(name) });
  return exports;
}
const messages = compile("src/lib/i18n/messages.ts");

test("Chinese covers main navigation, interview, resume and report actions", () => {
  for (const label of [
    "Interviews",
    "Interviewers",
    "Create an Interview",
    "Drop PDF Here",
    "Start Interview",
    "General Summary",
    "Transcript",
    "Retry",
    "Save",
  ]) {
    assert.match(messages.translate(label, "zh-CN"), /[\u3400-\u9fff]/);
    assert.equal(messages.translate(label, "en"), label);
  }
});
test("unknown candidate content and interview titles remain unchanged", () => {
  for (const value of [
    "Alex Test 3",
    "简历提问验证-内容实习生-20261022",
    "I built a content dashboard with 5000 readers.",
  ]) {
    assert.equal(messages.translate(value, "zh-CN"), value);
    assert.equal(messages.translate(value, "en"), value);
  }
});
test("dynamic response labels preserve names, including dollar-sign sequences", () => {
  assert.equal(
    messages.translate("{name}'s Response", "zh-CN", { name: "林 $&" }),
    "林 $&的面试记录",
  );
  assert.equal(messages.translate("{name}'s Response", "en", { name: "Alex" }), "Alex's Response");
});
test("existing system error state can be displayed after switching language", () => {
  const chinese = messages.translate("Could not start the interview. Please try again.", "zh-CN");
  assert.equal(
    messages.translate(chinese, "en"),
    "Could not start the interview. Please try again.",
  );
});
test("English JSX apostrophes display as text while unknown candidate text is preserved", () => {
  assert.equal(messages.translate("I&apos;ll do it myself", "en"), "I'll do it myself");
  assert.equal(
    messages.translate("Candidate&apos;s original text", "en"),
    "Candidate&apos;s original text",
  );
});
test("server rendering defaults to Chinese without reading browser storage", () => {
  const context = compile("src/contexts/language.context.tsx", {
    "@/lib/i18n/messages": messages,
    "@clerk/localizations": { zhCN: {}, enUS: {} },
    "@clerk/nextjs": { ClerkProvider: () => null },
    sonner: { Toaster: () => null },
  });
  function Probe() {
    const { locale, t } = context.useLanguage();
    return React.createElement("button", { "data-locale": locale }, t("Start Interview"));
  }
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(context.LanguageProvider, null, React.createElement(Probe)),
  );
  assert.match(html, /data-locale="zh-CN"/);
  assert.match(html, /开始面试/);
});
test("stored candidate status values remain language independent", () => {
  const { CandidateStatus } = compile("src/lib/enum.tsx");
  assert.deepEqual(Object.values(CandidateStatus), [
    "NO_STATUS",
    "NOT_SELECTED",
    "POTENTIAL",
    "SELECTED",
  ]);
});
test("visible static English UI text is extracted rather than left in components", () => {
  function walk(dir) {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  }
  const allowed = new Set(["Folo", "Up", "founders@folo-up.co"]);
  const missing = [];
  for (const file of [...walk("src/components"), ...walk("src/app")].filter((f) =>
    f.endsWith(".tsx"),
  )) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node) => {
      if (ts.isJsxText(node)) {
        const label = node.text.replace(/\s+/g, " ").trim();
        if (
          /[a-zA-Z]{2}/.test(label) &&
          !allowed.has(label) &&
          !file.endsWith("languageSwitcher.tsx")
        ) {
          missing.push(`${file}: ${label}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(missing, []);
});
