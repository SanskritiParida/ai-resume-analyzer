// Explicit opt-in only: one Gemini request against the supplied synthetic DOCX.
const path = require("node:path");
const fs = require("node:fs/promises");
const { extractResumeText } = require("../extractResumeText");
const { analyzeResume } = require("../analyzeResume");
async function main() {
  if (!process.env.GEMINI_API_KEY?.trim()) throw new Error("AI_NOT_CONFIGURED: configure backend/.env before running this manual test.");
  const file = process.argv[2] || path.join(__dirname, "real-resume-samples/03_docx_table_resume.docx");
  const extracted = await extractResumeText(file, path.extname(file).slice(1).toLowerCase());
  const structuredResume = await analyzeResume(extracted.text, { extractionQuality: extracted.extractionQuality });
  const output = JSON.stringify({ live: true, model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", structuredResume }, null, 2);
  if (process.argv[3]) await fs.writeFile(process.argv[3], output + "\n");
  else console.log(output);
}
main().catch((error) => { console.error(error.code || "MANUAL_TEST_FAILED", error.message); process.exitCode = 1; });
