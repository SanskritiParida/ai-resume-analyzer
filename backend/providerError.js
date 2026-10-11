function providerFailure(error, prefix) {
  if (error.name === "AnalysisCancelledError")
    return [
      prefix + "_CANCELLED",
      499,
      "Analysis was cancelled because the client disconnected.",
    ];
  const status = Number(
    error.statusCode || error.status || error.response?.status,
  );
  if (
    /Timeout|Abort/i.test(error.name || "") ||
    status === 408 ||
    status === 504
  )
    return [prefix + "_TIMEOUT", 504, "AI analysis timed out. Please retry."];
  if (status === 503)
    return [
      prefix + "_UNAVAILABLE",
      503,
      "Gemini is temporarily busy or unavailable. Please try again in a moment.",
    ];
  if (status === 401 || status === 403)
    return [
      prefix + "_AUTH_ERROR",
      502,
      "Gemini rejected authentication or API permissions. Check the backend key and Google project access.",
    ];
  if (status === 429)
    return [
      prefix +
        (/quota|daily limit|billing|limit.*(?:day|month)/i.test(
          error.message || "",
        )
          ? "_QUOTA_EXHAUSTED"
          : "_RATE_LIMIT"),
      503,
      /quota|daily limit|billing|limit.*(?:day|month)/i.test(
        error.message || "",
      )
        ? "Gemini reports an exhausted quota. Check your Google project quota or billing before retrying."
        : "Gemini request limit reached. Wait before retrying; check project quota if the error persists.",
    ];
  if (status === 404)
    return [
      prefix + "_MODEL_UNAVAILABLE",
      502,
      "The configured Gemini model or API endpoint is unavailable. Check GEMINI_MODEL.",
    ];
  if (status === 400 && /API.key|key.not.valid/i.test(error.message || ""))
    return [
      prefix + "_AUTH_ERROR",
      502,
      "Gemini rejected the backend API key. Check its validity.",
    ];
  if (
    /fetch|network|ENOTFOUND|ECONN|EAI_AGAIN/i.test(error.message || "") ||
    error.cause?.code
  )
    return [
      prefix + "_NETWORK_ERROR",
      502,
      "The backend could not reach Gemini. Check network connectivity.",
    ];
  return [
    prefix + "_PROVIDER_ERROR",
    502,
    "The AI provider could not complete analysis. Please retry.",
  ];
}
module.exports = { providerFailure };
