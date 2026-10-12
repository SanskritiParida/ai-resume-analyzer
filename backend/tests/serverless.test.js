const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const backend = path.resolve(__dirname, "..");

test("Vercel environment never loads a bundled local secret file", () => {
  let called = false;
  const context = {
    __dirname: backend,
    module: { exports: {} },
    require: () => path,
    process: {
      env: { VERCEL: "1" },
      loadEnvFile() {
        called = true;
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(backend, "loadEnvironment.js"), "utf8"),
    context,
  );
  context.module.exports.loadEnvironment();
  assert.equal(called, false);
});

test("Vercel app export does not listen and uploads target the runtime temp directory", () => {
  let directory;
  let storage;
  const app = {
    use() {},
    get() {},
    post() {},
    listen() {
      assert.fail("Serverless import must not listen");
    },
  };
  const multer = () => ({ single: () => () => {} });
  multer.diskStorage = (config) => {
    storage = config;
    return config;
  };
  const context = {
    __dirname: backend,
    process: { env: { VERCEL: "1" } },
    module: { exports: {} },
    console,
    require: (name) => {
      if (name === "./loadEnvironment") return { loadEnvironment() {} };
      if (name === "express") return () => app;
      if (name === "cors") return () => () => {};
      if (name === "multer") return multer;
      if (name === "node:fs")
        return {
          mkdirSync(p) {
            directory = p;
          },
        };
      return require(name.startsWith("./") ? path.join(backend, name) : name);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(backend, "server.js"), "utf8"),
    context,
  );
  assert.equal(context.module.exports, app);
  assert.equal(directory, path.join(os.tmpdir(), "resumelens-uploads"));
  storage.filename(
    {},
    { originalname: "PRIVATE_PERSON.docx" },
    (error, filename) => {
      assert.equal(error, null);
      assert.match(filename, /^[\da-f-]+\.docx$/);
      assert.ok(!filename.includes("PRIVATE_PERSON"));
    },
  );
});

test("Serverless adapter preserves multipart PDF/DOCX, JD verification, validation and temp cleanup (mocked Gemini)", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "resumelens-test-"));
  const child = spawn(
    process.execPath,
    [path.join(__dirname, "helpers/server-with-mocked-ai.cjs")],
    {
      env: {
        ...process.env,
        VERCEL: "1",
        NODE_ENV: "production",
        TEST_VERCEL_ADAPTER: "1",
        GEMINI_API_KEY: "",
        TEMP: temp,
        TMP: temp,
        TMPDIR: temp,
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Adapter startup timeout")),
        10000,
      );
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Adapter exited"));
      });
      child.stdout.on("data", (chunk) => {
        const match = String(chunk).match(/SERVERLESS_TEST_PORT=(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
    });
    const base = `http://127.0.0.1:${port}`;
    const health = await (await fetch(base + "/api/health")).json();
    assert.deepEqual(health, { status: "ok", aiConfigured: false });
    const post = async (file, mime, jd, bytes) => {
      const form = new FormData();
      if (file)
        form.append(
          "resume",
          new Blob(
            [bytes || fs.readFileSync(path.join(__dirname, "fixtures", file))],
            { type: mime },
          ),
          file,
        );
      form.append("analysisMode", jd ? "job" : "general");
      if (jd) form.append("jobDescription", jd);
      const response = await fetch(base + "/api/upload-resume", {
        method: "POST",
        body: form,
      });
      return { status: response.status, body: await response.json() };
    };
    for (const [file, mime] of [
      ["single-column.pdf", "application/pdf"],
      [
        "paragraphs-and-table.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
    ]) {
      const result = await post(file, mime);
      assert.equal(result.status, 200);
      assert.equal(result.body.analysisMode, "general");
      assert.ok(result.body.structuredResume.basics.evidence);
    }
    const matched = await post(
      "single-column.pdf",
      "application/pdf",
      "We are hiring a data developer to build and maintain reliable data services with our engineering team. You will collaborate with developers, review changes, improve reliability, document services and deliver maintainable solutions for our customers. Required qualifications:\nPython required.",
    );
    assert.equal(matched.status, 200);
    assert.equal(
      matched.body.jobMatch.requirements[0].classification,
      "NOT_EVIDENCED",
    );
    assert.equal(matched.body.jobMatch.score, null); // One explicit requirement remains unscored.
    assert.equal((await post(null)).body.code, "MISSING_FILE");
    assert.equal(
      (
        await post(
          "invalid.txt",
          "text/plain",
          null,
          Buffer.from("not a resume"),
        )
      ).body.code,
      "UNSUPPORTED_FILE",
    );
    assert.equal(
      (
        await post(
          "single-column.pdf",
          "application/pdf",
          null,
          Buffer.alloc(4 * 1024 * 1024 + 1),
        )
      ).body.code,
      "FILE_TOO_LARGE",
    );
    const uploads = path.join(temp, "resumelens-uploads");
    assert.deepEqual(fs.readdirSync(uploads), []);
  } finally {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", resolve);
    });
    const uploads = path.join(temp, "resumelens-uploads");
    if (fs.existsSync(uploads) && !fs.readdirSync(uploads).length)
      fs.rmdirSync(uploads);
    if (!fs.readdirSync(temp).length) fs.rmdirSync(temp);
  }
});
