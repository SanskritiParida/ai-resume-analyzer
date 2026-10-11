const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { providerFailure } = require("../providerError");

test("Express bind failure cannot claim that the updated backend started", () => {
  for (const failed of [true, false]) {
    const logs = [],
      errors = [];
    const app = {
      use() {},
      get() {},
      post() {},
      listen(port, callback) {
        callback(
          failed
            ? Object.assign(new Error("PRIVATE_DETAIL"), { code: "EADDRINUSE" })
            : undefined,
        );
      },
    };
    const multer = () => ({ single: () => () => {} });
    multer.diskStorage = (value) => value;
    const context = {
      __dirname: path.resolve(__dirname, ".."),
      process: { env: { PORT: "5000" }, exitCode: 0 },
      console: {
        log: (...args) => logs.push(args.join(" ")),
        error: (...args) => errors.push(args.join(" ")),
      },
      require: (name) => {
        if (name === "./loadEnvironment") return { loadEnvironment() {} };
        if (name === "express") return () => app;
        if (name === "cors") return () => () => {};
        if (name === "multer") return multer;
        if (name === "node:fs") return { mkdirSync() {} };
        return require(
          name.startsWith("./") ? path.resolve(__dirname, "..", name) : name,
        );
      },
    };
    vm.runInNewContext(
      fs.readFileSync(path.resolve(__dirname, "../server.js"), "utf8"),
      context,
    );
    assert.equal(context.process.exitCode, failed ? 1 : 0);
    assert.equal(
      logs.some((line) => line.includes("Server running")),
      !failed,
    );
    if (failed) assert.match(errors[0], /EADDRINUSE.*5000/);
    assert.ok(!errors.join(" ").includes("PRIVATE_DETAIL"));
  }
});
test("Environment loader resolves .env from backend directory and permits absent local file", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../loadEnvironment.js"),
    "utf8",
  );
  let loaded;
  const context = {
    require: () => path,
    __dirname: path.join(__dirname, ".."),
    process: {
      loadEnvFile: (p) => {
        loaded = p;
      },
    },
    module: { exports: {} },
  };
  vm.runInNewContext(source, context);
  context.module.exports.loadEnvironment();
  assert.equal(loaded, path.join(__dirname, "../.env"));
  context.process.loadEnvFile = () => {
    throw Object.assign(new Error(), { code: "ENOENT" });
  };
  assert.doesNotThrow(() => context.module.exports.loadEnvironment());
  context.process.loadEnvFile = () => {
    throw Object.assign(new Error("hidden"), { code: "EACCES" });
  };
  assert.throws(
    () => context.module.exports.loadEnvironment(),
    /environment configuration/,
  );
});
test("Gemini authentication, quota, unavailable model and network failures remain distinct and safe", () => {
  for (const [error, suffix, status] of [
    [{ statusCode: 401 }, "AUTH_ERROR", 502],
    [{ status: 403 }, "AUTH_ERROR", 502],
    [{ status: 429 }, "RATE_LIMIT", 503],
    [
      { status: 429, message: "Daily quota exceeded SECRET" },
      "QUOTA_EXHAUSTED",
      503,
    ],
    [{ status: 503 }, "UNAVAILABLE", 503],
    [{ status: 404 }, "MODEL_UNAVAILABLE", 502],
    [{ message: "fetch failed: SECRET" }, "NETWORK_ERROR", 502],
    [{ name: "AbortError" }, "TIMEOUT", 504],
    [{ name: "AnalysisCancelledError" }, "CANCELLED", 499],
    [{ status: 500 }, "PROVIDER_ERROR", 502],
    [{ status: 400, message: "API key not valid: SECRET" }, "AUTH_ERROR", 502],
  ]) {
    for (const prefix of ["AI", "JD"]) {
      const result = providerFailure(error, prefix);
      assert.equal(result[0], prefix + "_" + suffix);
      assert.equal(result[1], status);
      assert.ok(!result[2].includes("SECRET"));
    }
  }
});

test("Gemini deadline is bounded, makes one attempt and supports cancellation", async () => {
  const { requestTimeout, geminiRequest } = require("../geminiRequest");
  assert.equal(requestTimeout({}), 45000);
  assert.equal(requestTimeout({ GEMINI_TIMEOUT_MS: "60000" }), 60000);
  assert.equal(requestTimeout({ GEMINI_TIMEOUT_MS: "60001" }), 45000);
  assert.equal(requestTimeout({ GEMINI_TIMEOUT_MS: "invalid" }), 45000);
  let calls = 0;
  const controller = new AbortController();
  const client = {
    interactions: {
      create: async (_, options) => {
        calls++;
        assert.equal(options.timeout_ms, 45000);
        assert.equal(options.retries.strategy, "none");
        controller.abort();
        assert.equal(options.signal.aborted, true);
        options.signal.throwIfAborted();
      },
    },
  };
  await assert.rejects(
    geminiRequest(
      client,
      { model: "test", input: "private" },
      { env: {}, signal: controller.signal },
    ),
    { name: "AnalysisCancelledError" },
  );
  assert.equal(calls, 1);
});

test("A slow provider attempt expires without retry or fake success", async () => {
  const { geminiRequest } = require("../geminiRequest");
  let calls = 0;
  const hold = setTimeout(() => {}, 2000);
  try {
    await assert.rejects(
      geminiRequest(
        {
          interactions: {
            create: (_, options) => {
              calls++;
              return new Promise((_, reject) =>
                options.signal.addEventListener(
                  "abort",
                  () => reject(options.signal.reason),
                  { once: true },
                ),
              );
            },
          },
        },
        { model: "test", input: "private" },
        { env: { GEMINI_TIMEOUT_MS: "1000" } },
      ),
      { name: "TimeoutError" },
    );
    assert.equal(calls, 1);
  } finally {
    clearTimeout(hold);
  }
});

test("Timing logs are opt-in, suppressed in production and exclude private input", async () => {
  const { geminiRequest } = require("../geminiRequest");
  const logs = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  const client = {
    interactions: { create: async () => ({ status: "completed" }) },
  };
  try {
    const request = { model: "test", input: "PRIVATE_RESUME_CONTENT" };
    await geminiRequest(client, request, { env: {} });
    await geminiRequest(client, request, {
      env: { NODE_ENV: "production", DEV_ANALYSIS_TIMING: "true" },
    });
    assert.equal(logs.length, 0);
    await geminiRequest(client, request, {
      stage: "resume_model",
      env: { DEV_ANALYSIS_TIMING: "true", GEMINI_API_KEY: "PRIVATE_KEY" },
    });
    assert.equal(logs.length, 2);
    assert.ok(logs.every((line) => !line.includes("PRIVATE")));
    assert.equal(JSON.parse(logs[1]).inputCharacters, request.input.length);
    assert.equal(JSON.parse(logs[0]).phase, "start");
    assert.equal(JSON.parse(logs[1]).phase, "end");
  } finally {
    console.log = original;
  }
});
