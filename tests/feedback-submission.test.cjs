const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const React = require("react");
const ts = require("typescript");

function form(onSubmit) {
  const values = [];
  let index = 0;
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync("src/components/call/feedbackForm.tsx", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
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
    },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/textarea": { Textarea: "textarea" },
    "@/contexts/language.context": { useLanguage: () => ({ t: (text) => text }) },
  };
  vm.runInNewContext(code, { exports, require: (name) => imports[name] ?? require(name) });
  return () => {
    index = 0;
    const tree = exports.FeedbackForm({ onSubmit, email: "synthetic@example.com" });
    return React.Children.toArray(tree.props.children).at(-1).props;
  };
}

test("feedback stays busy during the write and blocks another submission", async () => {
  let complete;
  let calls = 0;
  const render = form(async (payload) => {
    calls++;
    assert.equal(payload.email, "synthetic@example.com");
    await new Promise((resolve) => {
      complete = resolve;
    });
  });
  const pending = render().onClick();
  assert.equal(render().disabled, true);
  assert.equal(render()["aria-busy"], true);
  await render().onClick();
  assert.equal(calls, 1);
  complete();
  await pending;
  assert.equal(render().disabled, false);
});

test("a failed feedback write releases the button for a deliberate retry", async () => {
  const render = form(async () => {
    throw new Error("Network unavailable");
  });
  await assert.rejects(render().onClick(), /Network unavailable/);
  assert.equal(render().disabled, false);
  assert.equal(render()["aria-busy"], false);
});
