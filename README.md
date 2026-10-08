# AI Resume Analyzer

A resume review project that compares PDF/DOCX resumes with an actual job description, showing requirements, supporting resume evidence, gaps and practical suggestions. It exists to make resume tailoring explainable rather than produce an unexplained score.

## What it does

Upload a resume (PDF or DOCX, maximum 5 MiB) and optionally paste a job description (maximum 12,000 characters). With a JD, the primary result is the **Job Compatibility Score**, matched/partial/not-evidenced requirements, verified source evidence and grounded suggestions. Without a JD, choose one of seven roles for a clearly labeled keyword demo. The demo retains statistics, a basic checklist and PDF report download; its substring score and rule-based notes are not AI judgments. PDF report download applies to the role demo only.

## Architecture and flow

React/Vite → Express `/upload-resume` multipart upload → document extraction and quality gate → Gemini structured resume extraction → JSON/Zod validation → strict local evidence verification.

Then either:
- JD supplied: verified resume fact catalog + JD → Gemini requirement classification → local schema/reference/quote checks → deterministic score → JD result card.
- No JD: selected role → existing substring keyword coverage and heuristic checklist → role demo result card.

The JD path returns before the legacy scorer runs. The backend uses the same Gemini provider/model in both paths. A normal role upload makes one model request; a JD upload makes two. Retries are disabled; each call has a 30-second timeout. Failures return useful HTTP errors rather than a success payload or silent fallback.

## Tech stack

Frontend: JavaScript, React, Vite, CSS and jsPDF (role-demo export). Backend: Node.js, Express, CORS, Multer, pdf-parse/PDF.js, Mammoth, Google GenAI SDK and Zod. Testing: Node's built-in test runner, mocked provider responses and real document fixtures. ESLint covers browser modules and CommonJS backend code separately. No database or authentication.

## PDF/DOCX extraction

`backend/extractResumeText.js` uses pdf-parse for embedded PDF text and Mammoth raw-text extraction for DOCX. It conservatively normalizes whitespace, retains useful paragraph/page boundaries and reports page/character/useful-text counts and quality warnings. DOCX page count is unknown. Essentially empty text stops analysis; suspicious extraction remains visibly warned. The quality heuristic checks usability, not correctness of reading order. Scanned/image-only PDFs require a text-based export; there is no OCR or legacy `.doc` support.

## Gemini, Zod and evidence grounding

`backend/analyzeResume.js` requests structured JSON using Gemini's Interactions API (`store: false`) and a Zod-derived schema. Unknown facts remain null/empty. Local verification requires exact contiguous evidence from normalized source text, preserves newlines and checks facts against their record's evidence. Descriptions cannot be paraphrased as evidence. Resume input is capped at 40,000 characters; responses at 8,000 tokens. Invalid JSON, schema violations or unsupported evidence reject the result.

These checks reduce unsupported output; they do not prove real-world truth, completeness or perfect semantic associations. Normalized resume text is sent to Google, including personal details present in it. Provider retention/billing policies still apply; use fictional samples for demos and obtain permission before submitting others' resumes. API keys stay backend-only.

## JD matching and deterministic scoring

`backend/analyzeJobMatch.js` sends the JD and verified field-specific facts (excluding contact fields) to Gemini. The model identifies explicit requirements, required/preferred importance, classifications and supporting fact IDs. It does **not** calculate the score. Local checks validate exact JD quotes, factual references, relevant positive skill evidence, qualifiers and suggestion references. Unproven years/degree completion cannot receive unsupported full credit. Matching facts are capped at 60,000 serialized characters, with at most 30 requirements and four suggestions. Numeric/array bounds are enforced locally; unsupported bounds are omitted only from the provider wire schema.

Weights: required = 2, preferred = 1. Credits: matched = 1, partial = 0.5, not evidenced = 0.

`Job Compatibility Score = round(100 × sum(weight × credit) / sum(weight))`

The UI shows earned/possible weight and evidence. Not evidenced means the resume lacks supporting proof; it does not establish lack of ability. This score is neither hiring probability nor recruiter probability nor a real ATS score. Advice uses constrained actions and backend wording, requiring truthful experience and metrics.

## Prompt-injection and negation safeguards

Resume and JD text are treated as untrusted data. Prompts instruct Gemini to ignore embedded instructions. Local checks reject recognized instruction-like evidence, invented facts/references and lexically negated technologies/requirements. Tests include a fake Google-employment instruction and “SpendScope does not use React.” These safeguards are conservative and are not universal protection against every adversarial wording.

## Local setup and environment

Use Node 22+ and npm. From the project root:

```powershell
npm ci
Copy-Item .env.example .env.local
cd backend
npm ci
Copy-Item .env.example .env
```

Edit `backend/.env` locally:

```dotenv
GEMINI_API_KEY=your_backend_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

- `GEMINI_API_KEY`: required backend secret. Never put it in a `VITE_` variable.
- `GEMINI_MODEL`: optional model override; default shown above, subject to account availability.
- `PORT`: optional backend port; default 5000.
- `VITE_API_URL`: frontend backend base URL, e.g. `http://localhost:5000`. Vite reads it at startup/build time; restart/rebuild after changing it. Without it, the existing Render URL remains the fallback.

Examples contain no credentials. `.env`/environment variants, uploads, node_modules and build output are ignored by Git.

## Running

In one terminal, from `backend`: `npm start` (loads local `.env`). In another, from the project root: `npm run dev`. For frontend production output: `npm run build`; preview locally with `npm run preview`. Configure backend secrets on the deployment host and the frontend API URL when building.

## Testing

From `backend`: `npm test` — all 49 automated tests, including real parsing, HTTP uploads/errors/cleanup, schema/evidence checks, negation/injection and deterministic scoring. Provider responses are mocked in automated tests; no API key or paid request is needed.

From the root: `npm run lint` and `npm run build`. Backend syntax can be checked with `node --check backend/server.js` and the three extraction/analysis modules.

Previously approved live validation covered single/two-column PDFs, DOCX, injection and JD strong/partial/adversarial cases. Final polish made no live calls. `backend/tests/manual-ai.cjs` remains an explicitly opt-in live resume test, not part of `npm test`; it may incur charges and its output may contain resume data. Save outputs outside Git. Fixture expectations are not fabricated live model output. See `backend/tests/fixtures/README.md` and the supplied ground-truth checklist.

## Limitations and repository notes

- Complex columns/tables may have incorrect reading order; tests demonstrate supplied files only. No OCR or universal layout recovery.
- Gemini can omit requirements or misinterpret associations, alternatives, aliases and qualifiers. Exact evidence checks can reject otherwise correct output.
- The role demo uses substring matching (including negation/short-token false positives); its checklist and word-count advice are heuristics. It still requires successful Gemini extraction, although its score is deterministic keyword coverage.
- No authenticity verification, employer ATS integration, recruitment predictions, persistence or public-service abuse controls. CORS currently permits all origins.
- Temporary uploads are removed in the request's `finally` path and PDF resources are destroyed. Process crashes/aborted uploads are not guaranteed clean; the installed Multer version has relevant advisories. There is no scheduled stale-file cleanup.
- Final npm audit: frontend/toolchain 21 findings (1 low, 4 moderate, 16 high); backend 8 (5 moderate, 1 high, 2 critical), including propagated dependency findings. No risky upgrades were attempted. Review advisories before exposing the app as a public production service. These counts are time-dependent.
- The frontend build succeeds with a chunk-size warning (main bundle about 605 kB). Legacy screenshot images may show older labels; current source is authoritative.

Developed by Sanskriti Parida.
