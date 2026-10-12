// Readiness must not import extraction, native canvas, Gemini or upload storage.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.statusCode = 200;
  res.end(
    JSON.stringify({
      status: "ok",
      aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    }),
  );
}
