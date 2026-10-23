const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

async function parser() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync("src/actions/parse-pdf.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    File,
    Uint8Array,
    TextDecoder,
    console: { error() {} },
    require(name) {
      assert.equal(name, "pdfjs-dist/legacy/build/pdf.mjs");
      return pdfjs;
    },
  });
  return exports.parsePdf;
}

function pdf(text = "") {
  const content = text ? `BT /F1 12 Tf 30 100 Td (${text}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let result = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return result;
}

async function parse(contents, type = "application/pdf") {
  const form = new FormData();
  form.append("file", new File([contents], "resume.pdf", { type }));
  return (await parser())(form);
}

test("extracts the actual project text from a valid PDF", async () => {
  const result = await parse(pdf("ProjectResumeSentinel localStorage"));
  assert.equal(result.success, true);
  assert.match(result.text, /ProjectResumeSentinel localStorage/);
});
test("rejects a blank/scanned PDF instead of reporting successful upload", async () => {
  const result = await parse(pdf());
  assert.equal(result.success, false);
  assert.match(result.error, /OCR/);
});
test("rejects a file merely renamed as PDF", async () => {
  assert.equal((await parse("not a PDF")).success, false);
});
test("rejects a corrupt PDF despite a valid signature", async () => {
  assert.equal((await parse("%PDF-1.4 broken")).success, false);
});
test("rejects empty files", async () => {
  assert.equal((await parse("")).success, false);
});
test("enforces the 10MB maximum on the server", async () => {
  const result = await parse(new Uint8Array(10 * 1024 * 1024 + 1));
  assert.equal(result.success, false);
  assert.match(result.error, /10MB/);
});
test("rejects missing or text form fields without trusting the filename", async () => {
  const parsePdf = await parser();
  assert.equal((await parsePdf(new FormData())).success, false);
  const form = new FormData();
  form.append("file", "resume.pdf");
  assert.equal((await parsePdf(form)).success, false);
});
