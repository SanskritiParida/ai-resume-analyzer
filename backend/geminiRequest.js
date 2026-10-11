// One bounded request, no automatic retry. Diagnostics never contain user data.
function requestTimeout(env = process.env) {
  const configured = Number(env.GEMINI_TIMEOUT_MS);
  return Number.isFinite(configured) &&
    configured >= 1000 &&
    configured <= 60000
    ? configured
    : 45000;
}
function validationTiming(env, stage, start, phase = "end") {
  if (env.NODE_ENV !== "production" && env.DEV_ANALYSIS_TIMING === "true")
    console.log(
      JSON.stringify({ stage, phase, elapsedMs: Date.now() - start }),
    );
}
async function geminiRequest(client, request, options = {}) {
  const env = options.env || process.env;
  const timeout = requestTimeout(env);
  const start = Date.now();
  let status = "failed";
  let httpStatus;
  let errorKind;
  const diagnostics =
    env.NODE_ENV !== "production" && env.DEV_ANALYSIS_TIMING === "true";
  if (diagnostics)
    console.log(
      JSON.stringify({
        stage: options.stage,
        phase: "start",
        model: request.model,
        timeoutMs: timeout,
        inputCharacters: request.input.length,
        requestCharacters: JSON.stringify(request).length,
        retries: 0,
      }),
    );
  try {
    const response = await client.interactions.create(request, {
      timeout_ms: timeout,
      retries: { strategy: "none" },
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
    });
    status = response?.status || "invalid";
    return response;
  } catch (caughtError) {
    let error = caughtError;
    // A caller disconnect is not a slow model. Preserve timer errors separately.
    if (
      options.signal?.aborted &&
      options.signal.reason?.name !== "TimeoutError"
    ) {
      const cancelled = new Error("Analysis request cancelled by client.");
      cancelled.name = "AnalysisCancelledError";
      error = cancelled;
    }
    errorKind = [
      "RequestTimeoutError",
      "RequestAbortedError",
      "TimeoutError",
      "AbortError",
      "AnalysisCancelledError",
      "ConnectionError",
      "InternalServerError",
    ].includes(error.name)
      ? error.name
      : "ProviderError";
    httpStatus =
      Number(error.statusCode || error.status || error.response?.status) ||
      undefined;
    throw error;
  } finally {
    if (diagnostics) {
      console.log(
        JSON.stringify({
          stage: options.stage,
          phase: "end",
          model: request.model,
          elapsedMs: Date.now() - start,
          timeoutMs: timeout,
          status,
          httpStatus,
          errorKind,
          inputCharacters: request.input.length,
        }),
      );
    }
  }
}
module.exports = { geminiRequest, requestTimeout, validationTiming };
