const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const { extractResumeText, normalizeText, assessExtractionQuality } = require("../extractResumeText");

const backend = path.resolve(__dirname, "..");
const fixtures = path.join(__dirname, "fixtures");
const cases = JSON.parse(fs.readFileSync(path.join(fixtures, "cases.json"), "utf8"));

test("Normalization preserves paragraph, line, tab, page, bullet and technology content", () => {
  const text = "  Tools:  C++\u00a0 C#\r\n\r\n\r\n• Built\tAPI  services\r\nmachine-\r\nlearning\fNext page\u200B\u0000";
  assert.equal(normalizeText(text), "Tools: C++ C#\n\n• Built\tAPI services\nmachine-\nlearning\fNext page");
  assert.equal(normalizeText("Résumé 日本語 React"), "Résumé 日本語 React");
});

test("Quality boundaries use useful Unicode characters, not the recommendation word count", () => {
  const quality = (text) => assessExtractionQuality(text, [], "pdf");
  assert.equal(quality("\n-- !! --\n").extractionQuality, "insufficient");
  assert.equal(quality("a".repeat(79)).extractionQuality, "insufficient");
  assert.equal(quality("a".repeat(80)).extractionQuality, "suspicious");
  assert.equal(quality("a".repeat(299)).extractionQuality, "suspicious");
  assert.equal(quality("a".repeat(300)).extractionQuality, "good");
  assert.equal(quality("日本語".repeat(100)).usefulTextLength, 300);
  assert.equal(quality("readable ".repeat(60) + "\uFFFD".repeat(100)).extractionQuality, "suspicious");
});

for (const fixture of cases) {
  test(`Source content survives: ${fixture.file} (${fixture.provenance})`, async () => {
    const result = await extractResumeText(path.join(fixtures, fixture.file), fixture.format);
    for (const fragment of fixture.fragments) assert.ok(result.text.includes(fragment), `Missing source text: ${fragment}`);
    assert.equal(result.characterCount, result.text.length);
    assert.equal(result.usefulTextLength, (result.text.match(/[\p{L}\p{N}]/gu) || []).length);
    assert.equal(result.readingOrder, "unverified");
    assert.ok(!/-- \d+ of \d+ --/.test(result.text), "Synthetic parser markers must not leak into content");
    if (fixture.quality) assert.equal(result.extractionQuality, fixture.quality);
    if (fixture.format === "docx") {
      assert.equal(result.pageCount, null);
      assert.ok(result.text.includes("\n\n"), "DOCX paragraphs must stay separated");
    } else {
      assert.equal(result.pages.length, result.pageCount);
    }
    if (fixture.file === "mixed-text-image.pdf") {
      assert.equal(result.pageCount, 2);
      assert.equal(result.text.split("\f").length, 2);
      assert.ok(result.warnings.some((warning) => warning.code === "SPARSE_PAGES"));
    }
  });
}

const storedPdf = process.env.RESUME_SAMPLE_PATH || path.join(backend, "uploads/1782455157014-resumetest.pdf");
test("Existing supplied resume: useful source facts and three pages survive", { skip: !fs.existsSync(storedPdf) }, async () => {
  const result = await extractResumeText(storedPdf, "pdf");
  for (const fragment of ["KIIT University", "Bachelor of Technology", "QueueCure", "Web Development Intern", "SQL for Developers", "450+ DSA problems"]) {
    assert.ok(result.text.includes(fragment), `Missing supplied source content: ${fragment}`);
  }
  assert.equal(result.pageCount, 3);
  assert.equal(result.text.split("\f").length, 3);
  assert.equal(result.extractionQuality, "good");
});

test("Parser failure releases PDF resources and keeps a format-specific error", async () => {
  let destroyed = false;
  const context = {
    require: (name) => ({
      "node:fs/promises": { readFile: async () => Buffer.from("PDF") },
      "pdf-parse": { PDFParse: class { async getText() { throw new Error("Corrupt input"); } async destroy() { destroyed = true; } } },
      mammoth: {},
    })[name],
    module: { exports: {} }, console,
  };
  vm.runInNewContext(fs.readFileSync(path.join(backend, "extractResumeText.js"), "utf8"), context);
  await assert.rejects(context.module.exports.extractResumeText("unused.pdf", "pdf"), (error) => error.code === "PDF_EXTRACTION_FAILED");
  assert.ok(destroyed);
});

test("Corrupt DOCX and legacy DOC are not analyzed", async () => {
  await assert.rejects(extractResumeText(path.join(fixtures, "single-column.pdf"), "docx"), (error) => error.code === "DOCX_EXTRACTION_FAILED");
  await assert.rejects(extractResumeText("unused.doc", "doc"), (error) => error.code === "UNSUPPORTED_FILE");
});

test("Programming error after extraction remains an analysis error", async () => {
  let route;
  let removed = false;
  const app = { use() {}, get() {}, post(p, middleware, handler) { route = handler; }, listen() {} };
  const multer = () => ({ single: () => () => {} });
  multer.diskStorage = (storage) => storage;
  const context = {
    require: (name) => ({
      express: () => app, cors: () => () => {}, multer,
      "node:fs": { mkdirSync() {}, promises: { unlink: async () => { removed = true; } } },
      "node:path": path,
      "./analyzeResume": { analyzeResume: async () => ({}), AIError: class extends Error {} },
      "./analyzeJobMatch": require("../analyzeJobMatch"),
      "./extractResumeText": { extractResumeText: async () => ({ text: { toLowerCase() { throw new Error("Injected analyzer failure"); } }, pages: [], extractionQuality: "good", warnings: [] }) },
    })[name],
    __dirname: backend, process: { env: {} }, console: { log() {}, error() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(backend, "server.js"), "utf8"), context);
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await route({ file: { path: "unused.pdf", originalname: "resume.pdf", size: 100 }, body: { role: "frontend developer" } }, response);
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.code, "ANALYSIS_FAILED");
  assert.ok(removed);
});

test("Real HTTP uploads preserve Phase 1 validation, errors, success fields and cleanup", async () => {
  const before = fs.readdirSync(path.join(backend, "uploads")).sort();
  const server = spawn(process.execPath, [path.join(backend, "tests/helpers/server-with-mocked-ai.cjs")], {
    cwd: path.dirname(backend), env: { ...process.env, PORT: "15529" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let serverErrors = "";
  server.stderr.on("data", (data) => { serverErrors += data.toString(); });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timeout: ${serverErrors}`)), 10000);
      server.once("error", (error) => { clearTimeout(timer); reject(error); });
      server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code} ${serverErrors}`)); });
      server.stdout.on("data", (data) => { if (data.toString().includes("Server running")) { clearTimeout(timer); resolve(); } });
    });
    async function post({ file = "single-column.pdf", name = file, mime = "application/pdf", bytes, role = "frontend developer", jd, analysisMode } = {}) {
      const body = new FormData();
      if (file) body.append("resume", new Blob([bytes || fs.readFileSync(path.join(fixtures, file))], { type: mime }), name);
      if (role !== null) body.append("role", role);
      if (jd !== undefined) body.append("jobDescription", jd);
      if (analysisMode !== undefined) body.append("analysisMode", analysisMode);
      const response = await fetch("http://127.0.0.1:15529/upload-resume", { method: "POST", body, signal: AbortSignal.timeout(10000) });
      return { status: response.status, body: await response.json() };
    }

    for (const role of ["frontend developer", "backend developer", "full stack developer", "software engineer", "python developer", "java developer", "ai engineer"]) {
      const result = await post({ role });
      assert.equal(result.status, 200);
      assert.ok(result.body.structuredResume);
      assert.equal(result.body.score, result.body.statistics.skillCoverage);
      assert.equal(result.body.analysisMode, "role");
      assert.ok(!JSON.stringify(result.body.insights).includes("ATS Score"));
      assert.ok(result.body.suggestions.some(item => item.includes("genuinely")) || result.body.missingSkills.length === 0);
      for (const key of ["skillsFound", "missingSkills", "suggestions", "resumeTips", "insights"]) assert.ok(Array.isArray(result.body[key]));
      assert.ok(!Object.hasOwn(result.body.extraction, "text"), "Do not send full resume text to the UI");
    }
    const docx = await post({ file: "paragraphs-and-table.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    assert.equal(docx.status, 200);
    assert.equal(docx.body.extraction.format, "docx");
    assert.equal(docx.body.statistics.pageCount, null);
    const jobMatch = await post({ jd: "Python required.", analysisMode: "job", role: null });
    assert.equal(jobMatch.status, 200);
    assert.equal(jobMatch.body.analysisMode, "job");
    assert.equal(jobMatch.body.jobMatch.score, 0);
    assert.equal(jobMatch.body.jobMatch.missingRequirements[0].subject, "Python");
    assert.ok(!Object.hasOwn(jobMatch.body, "score"), "Legacy keyword score must not masquerade as JD score");
    const jdPriority = await post({ jd: "Python required.", role: "frontend developer" });
    assert.equal(jdPriority.body.analysisMode, "job");
    for (const [input, status, code] of [
      [{ jd: " \n " }, 400, "MISSING_JOB_DESCRIPTION"],
      [{ analysisMode: "job" }, 400, "INVALID_JOB_DESCRIPTION"],
      [{ jd: "a".repeat(12001) }, 413, "JOB_DESCRIPTION_TOO_LONG"],
      [{ jd: "a".repeat(60001) }, 413, "JOB_DESCRIPTION_TOO_LONG"],
      [{ analysisMode: "invalid" }, 400, "INVALID_ANALYSIS_MODE"],
    ]) {
      const result = await post(input);
      assert.equal(result.status, status);
      assert.equal(result.body.code, code);
    }
    const mixed = await post({ file: "mixed-text-image.pdf" });
    assert.equal(mixed.status, 200);
    assert.equal(mixed.body.extraction.extractionQuality, "suspicious");
    assert.ok(mixed.body.extraction.warnings.some((warning) => warning.code === "SPARSE_PAGES"));

    for (const [input, status, code] of [
      [{ file: null }, 400, "MISSING_FILE"],
      [{ name: "resume.doc", mime: "application/msword" }, 415, "UNSUPPORTED_FILE"],
      [{ mime: "text/plain" }, 415, "UNSUPPORTED_FILE"],
      [{ bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }, 413, "FILE_TOO_LARGE"],
      [{ bytes: Buffer.alloc(5 * 1024 * 1024) }, 422, "PDF_EXTRACTION_FAILED"],
      [{ bytes: Buffer.from("corrupt PDF") }, 422, "PDF_EXTRACTION_FAILED"],
      [{ file: "paragraphs-and-table.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: Buffer.from("not a zip") }, 422, "DOCX_EXTRACTION_FAILED"],
      [{ file: "image-only.pdf" }, 422, "INSUFFICIENT_EXTRACTION"],
      [{ role: null }, 400, undefined],
      [{ role: "constructor" }, 400, undefined],
    ]) {
      const result = await post(input);
      assert.equal(result.status, status);
      if (code) assert.equal(result.body.code, code);
      assert.ok(!Object.hasOwn(result.body, "score"), "Rejected extraction must not run scoring");
    }
    if (fs.existsSync(storedPdf)) {
      const sample = await post({ bytes: fs.readFileSync(storedPdf) });
      assert.equal(sample.status, 200);
      console.log("Stored PDF metrics:", JSON.stringify(sample.body.extraction), "words:", sample.body.statistics.wordCount);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(fs.readdirSync(path.join(backend, "uploads")).sort(), before);
  } finally {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    if (server.exitCode === null) { server.kill(); await exited; }
  }
});

test("AI stage returns safe HTTP errors and always removes the upload", async () => {
  const { AIError } = require("../analyzeResume");
  for (const [code, status] of [["AI_NOT_CONFIGURED", 503], ["AI_PROVIDER_ERROR", 502], ["AI_TIMEOUT", 504], ["AI_INVALID_RESPONSE", 502], ["AI_SCHEMA_VALIDATION_FAILED", 502], ["AI_EVIDENCE_VALIDATION_FAILED", 502]]) {
    let route;
    let removed = false;
    const app = { use() {}, get() {}, post(p, middleware, handler) { route = handler; }, listen() {} };
    const multer = () => ({ single: () => () => {} });
    multer.diskStorage = (storage) => storage;
    const context = {
      require: (name) => ({
        express: () => app, cors: () => () => {}, multer,
        "node:fs": { mkdirSync() {}, promises: { unlink: async () => { removed = true; } } },
        "node:path": path,
        "./extractResumeText": { extractResumeText: async () => ({ text: "Source text", extractionQuality: "good", warnings: [] }) },
        "./analyzeResume": { AIError, analyzeResume: async () => { throw new AIError(code, status, "Safe analysis failure"); } },
        "./analyzeJobMatch": require("../analyzeJobMatch"),
      })[name],
      __dirname: backend, process: { env: {} }, console: { log() {}, error() {} },
    };
    vm.runInNewContext(fs.readFileSync(path.join(backend, "server.js"), "utf8"), context);
    const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await route({ file: { path: "unused.pdf", originalname: "resume.pdf", size: 100 }, body: { role: "frontend developer" } }, response);
    assert.equal(response.statusCode, status);
    assert.equal(response.body.code, code);
    assert.deepEqual(Object.keys(response.body).sort(), ["code", "message"]);
    assert.ok(removed);
  }
});

test("JD provider/evidence failures stay in the job-match stage and clean up uploads", async () => {
  const { AIError } = require("../analyzeResume");
  for (const code of ["JD_PROVIDER_ERROR", "JD_EVIDENCE_VALIDATION_FAILED"]) {
    let route;
    let removed = false;
    const app = { use() {}, get() {}, post(p, middleware, handler) { route = handler; }, listen() {} };
    const multer = () => ({ single: () => () => {} }); multer.diskStorage = storage => storage;
    const context = {
      require: name => ({ express: () => app, cors: () => () => {}, multer,
        "node:fs": { mkdirSync() {}, promises: { unlink: async () => { removed = true; } } }, "node:path": path,
        "./extractResumeText": { extractResumeText: async () => ({ text: "Source text", extractionQuality: "good", warnings: [] }) },
        "./analyzeResume": { AIError, analyzeResume: async () => ({}) },
        "./analyzeJobMatch": { validateJobDescription: value => value, analyzeJobMatch: async () => { throw new AIError(code, 502, "Safe JD failure"); } },
      })[name], __dirname: backend, process: { env: {} }, console: { log() {}, error() {} },
    };
    vm.runInNewContext(fs.readFileSync(path.join(backend, "server.js"), "utf8"), context);
    const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await route({ file: { path: "unused.pdf", originalname: "resume.pdf", size: 100 }, body: { jobDescription: "Python required." } }, response);
    assert.equal(response.statusCode, 502); assert.equal(response.body.code, code);
    assert.equal(response.body.stage, "job_match"); assert.ok(removed);
    assert.ok(!Object.hasOwn(response.body, "jobMatch"));
  }
});

