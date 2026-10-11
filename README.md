# ResumeLens — AI Resume Analyzer

A resume review project that compares PDF/DOCX resumes with an actual job description, showing requirements, supporting resume evidence, gaps and practical suggestions. It exists to make resume tailoring explainable rather than produce an unexplained score.

## What it does

Upload a resume (PDF or DOCX, maximum 5 MiB) and optionally paste a job description (maximum 12,000 characters). With a sufficiently detailed JD, the primary comparison is an **ATS-Style Match Score (Estimate)**, with a circular gauge, transparent requirement breakdown and exactly two skill columns: **Matched Skills** and **Not Evidenced in Resume**. Partial evidence is clearly labeled, preferred skills are distinguished, and the summary counts fully evidenced required skills. Other requirements remain inspectable separately. This does not replicate a commercial ATS or predict hiring.

Every general/JD review includes verified profile details, skills, experience, education, projects, certifications and achievements; strengths; prioritized writing guidance; expandable source evidence; and eight explanatory FAQs. No JD means no match percentage. A vague JD produces a useful general review and a request for more detail, without a fabricated score. Branding and existing design are retained. The interface supports drag-and-drop and has no target-role dropdown. Historical role-demo API requests remain supported for compatibility, but are not part of the main interface. Legacy role-only PDF export components remain in source; the current dashboard does not offer export.

## Architecture and flow

React/Vite → Express `/upload-resume` multipart upload → document extraction and quality gate → Gemini structured resume extraction → JSON/Zod validation → strict local evidence verification.

Then either:
- Detailed JD supplied: verified resume fact catalog + JD → Gemini requirement classification → local schema/reference/quote checks → scoring eligibility gate → deterministic score and comparison dashboard.
- No JD or vague JD: verified structured resume → general evidence dashboard; vague JDs also display an unscored notice. Explicit legacy role requests remain supported by the API.
- Retained facts + validated requirements → `backend/resumeReview.js` → deterministic strengths/writing recommendations → the same results dashboard. No extra AI request is made for writing guidance.

General and JD paths return before the legacy scorer runs. The backend uses the same Gemini provider/model in both paths. A general/role upload makes one model request; a detailed JD upload makes two. A JD below the detail gate makes only the resume request. Retries are disabled; each call has a 30-second timeout. Failures return useful HTTP errors rather than a success payload or silent fallback. Missing configuration, authentication/permissions, quota/rate limiting, model unavailability, network failures, timeouts and invalid evidence are diagnosed separately without returning raw provider messages.

## Tech stack

Frontend: JavaScript, React, Vite, CSS and jsPDF (role-demo export). Backend: Node.js, Express, CORS, Multer, pdf-parse/PDF.js, Mammoth, Google GenAI SDK and Zod. Testing: Node's built-in test runner, mocked provider responses and real document fixtures. ESLint covers browser modules and CommonJS backend code separately. No database or authentication.

## PDF/DOCX extraction

`backend/extractResumeText.js` uses pdf-parse for embedded PDF text and Mammoth raw-text extraction for DOCX. It conservatively normalizes whitespace, retains useful paragraph/page boundaries and reports page/character/useful-text counts and quality warnings. DOCX page count is unknown. Essentially empty text stops analysis; suspicious extraction remains visibly warned. The quality heuristic checks usability, not correctness of reading order. Scanned/image-only PDFs require a text-based export; there is no OCR or legacy `.doc` support.

## Gemini, Zod and evidence grounding

`backend/analyzeResume.js` requests structured JSON using Gemini's Interactions API (`store: false`) and a Zod-derived schema. Unknown facts remain null/empty. Local verification requires exact contiguous evidence from normalized source text, preserves newlines and checks facts against their record's evidence. Descriptions cannot be paraphrased as evidence. Resume input is capped at 40,000 characters; responses at 8,000 tokens. Invalid JSON and schema violations reject the response. Evidence handling restores whitespace/NFC-only variations to exact source slices, scopes shared certification-list quotes to individual titles, and excludes unsupported optional claims or unsafe records with visible warnings. Every retained record still passes strict evidence, negation and association checks. No verified facts means failure, not an empty success. Punctuation, invented table separators and paraphrases are not treated as equivalent evidence.

These checks reduce unsupported output; they do not prove real-world truth, completeness or perfect semantic associations. Normalized resume text is sent to Google, including personal details present in it. Provider retention/billing policies still apply; use fictional samples for demos and obtain permission before submitting others' resumes. API keys stay backend-only. The server loads `backend/.env` by absolute path using Node 22's native dotenv-file loader, independent of the current directory. Hosting environment variables take precedence; no dotenv package is necessary.

## JD matching and deterministic scoring

`backend/analyzeJobMatch.js` sends the JD and verified field-specific facts (excluding contact fields) to Gemini. The model identifies explicit requirements, required/preferred importance, classifications and supporting fact IDs. It does **not** calculate the score. Local checks validate exact JD quotes, factual references, relevant positive skill evidence, qualifiers and suggestion references. Unproven years/degree completion cannot receive unsupported full credit. Matching facts are capped at 60,000 serialized characters, with at most 30 requirements and four suggestions. Numeric/array bounds are enforced locally; unsupported bounds are omitted only from the provider wire schema.

Weights: required = 2, preferred = 1. Credits: matched = 1, partial = 0.5, not evidenced = 0.

`ATS-Style Match Score (Estimate) = round(100 × sum(weight × credit) / sum(weight))`

The UI shows earned/possible weight and evidence. All validated explicit requirements contribute, including experience/education and preferences; the skill-count summary is a separate count of required skills only. Known but unrelated skill citations are excluded with a visible warning; each retained skill citation must positively establish its subject. No relevant support still fails validation. Not evidenced means the resume lacks supporting proof; it does not establish lack of ability. This score is neither hiring probability nor recruiter probability nor an official ATS score.

The production response publishes a percentage only when the whitespace-collapsed JD has at least **180 characters and 30 words**, and Gemini/local verification identify at least **three distinct requirement subjects** (kind plus canonical subject). These are conservative detail checks, not a scientific confidence measure. Short/vague input skips JD classification; detailed input with too few/no assessable requirements remains unscored (`score: null`, `calculation: null`, `scoringStatus: insufficient_detail`). The pure scoring helper remains independently testable on smaller inputs.

Narrow spelling aliases are allowed: Node.js/Nodejs, PostgreSQL/Postgres, JavaScript/JS, TypeScript/TS, React/React.js/ReactJS and Express/Express.js. Related technologies are not assumed equivalent: JavaScript cannot support Java, and React Native alone cannot establish React web experience. Repeated aliases/requirements across required/preferred lists are rejected locally to avoid double credit. Semantic classifications can vary between model requests; identical validated classifications produce identical percentages.

## Writing feedback and FAQs

Recommendations are generated locally from retained verified facts and validated JD gaps. Each has a priority, specific improvement, reason and practical action; related source excerpts remain expandable. Rules check missing descriptions, recognized measurable outcomes, skills not linked in extracted technology lists, contact visibility and incomplete education/certification details. Omission can be an extraction issue, so advice asks users to check the original document. Metrics are placeholders for the user's own substantiated values. Layout advice is a check users should perform, not a claim that the system inspected visual formatting. The rules assess presentation, not resume quality or candidate proficiency.

Gemini's constrained JD suggestions remain supported. Optional suggestions with invalid actions/references are excluded with a visible `JD_SUGGESTION_OMITTED` warning; valid requirement credit remains unchanged. This includes QUANTIFY referencing a technology rather than a description, or advice referencing a fact not cited for that requirement. Unknown requirement fact references, unsupported qualifications and invalid requirement evidence still fail validation. The FAQ describes the score, matching, Gemini/source checks and actual temporary-file handling, without promising zero provider retention.

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
- `GEMINI_TIMEOUT_MS`: optional per-model deadline, default 45,000 ms; accepted range 1,000–60,000 ms. Invalid values fall back to the default. Automatic retries remain disabled. The frontend waits at most 140 seconds to cover two capped model calls and extraction. Disconnecting cancels the active provider request.
- `DEV_ANALYSIS_TIMING=true`: development-only stage duration, model/status and input character counts. Production suppresses these logs. Resume text, provider error bodies and API keys are never logged.
- `VITE_API_URL`: frontend backend base URL, e.g. `http://localhost:5000`. Vite reads it at startup/build time; restart/rebuild after changing it. Without it, development uses `http://localhost:5000`; production keeps the existing Render fallback. Set `VITE_API_URL` explicitly for deployment. A local key does not configure Render; hosting secrets must be set separately.

Examples contain no credentials. `.env`/environment variants, uploads, node_modules and build output are ignored by Git.

## Running

In one terminal, from `backend`: `npm start` (loads local `.env`). You can also run `node backend/server.js` from the project root, or use the absolute server path from any directory. In another, from the project root: `npm run dev`. For frontend production output: `npm run build`; preview locally with `npm run preview`. Configure backend secrets on the deployment host and the frontend API URL when building.

## Testing

From `backend`: `npm test` — 80 automated tests, including real parsing, HTTP uploads/errors/cleanup, schema/evidence checks, negation/injection, deterministic scoring, detail gating, aliases and writing feedback. Provider responses are mocked in automated tests; no API key or paid request is needed.

From the root: `npm test` — nine dashboard rendering/presentation regressions; `npm run lint`; `npm run build`. Backend syntax can be checked with `node --check backend/server.js` and the extraction/analysis/review modules.

Previously approved live validation covered single/two-column PDFs, DOCX, injection and JD strong/partial/adversarial cases. The latest repair validation also passed real Express uploads: PDF general analysis and DOCX with JD matching; a real browser PDF submission also rendered successfully. `backend/tests/manual-ai.cjs` remains an explicitly opt-in live resume test, not part of `npm test`; it may incur charges and its output may contain resume data. Save outputs outside Git. Fixture expectations are not fabricated live model output. See `backend/tests/fixtures/README.md` and the supplied ground-truth checklist.

## Limitations and repository notes

- Complex columns/tables may have incorrect reading order; tests demonstrate supplied files only. No OCR or universal layout recovery.
- Gemini can omit requirements or misinterpret associations, alternatives, aliases and qualifiers. Exact evidence checks can reject otherwise correct output. The detail gate cannot guarantee a complete or meaningful JD; verified matching still needs user inspection.
- The role demo uses substring matching (including negation/short-token false positives); its checklist and word-count advice are heuristics. It still requires successful Gemini extraction, although its score is deterministic keyword coverage. It is retained only for legacy API compatibility, not shown in the new interface.
- No authenticity verification, employer ATS integration, recruitment predictions, persistence or public-service abuse controls. CORS currently permits all origins.
- Temporary uploads are removed in the request's `finally` path and PDF resources are destroyed. Results are kept in React page memory until refresh/replacement, without application database persistence. Process crashes/aborted uploads are not guaranteed clean; the installed Multer version has relevant advisories. There is no scheduled stale-file cleanup. Google receives resume text and its retention policies apply despite `store: false`.
- Final npm audit: frontend/toolchain 21 findings (1 low, 4 moderate, 16 high); backend 8 (5 moderate, 1 high, 2 critical), including propagated dependency findings. No risky upgrades were attempted. Review advisories before exposing the app as a public production service. These counts are time-dependent.
- The current main frontend bundle is about 217 kB; the build has no chunk-size warning. Legacy screenshot images show older screens; current source is authoritative.

Developed by Sanskriti Parida.

## Actual DOCX evidence regression

A live test reproduced the supplied personal DOCX failure: four certification records quoted one exact shared list, triggering the sibling-association guard. Record-specific exact quotes now preserve supported certifications without disabling that guard. Fresh production HTTP uploads of that DOCX passed both general and JD analysis, followed by independent strict re-verification. An anonymized regression covers the same list shape; Unicode/table/bullet fixtures use real DOCX extraction and explicitly mocked AI. Partial results expose safe field-path/reason diagnostics and visible warnings; JD matching consumes only retained verified facts. No personal resume contents or credentials are stored in repository tests.

## Stability and student dashboard refinement

Resume-only analysis makes one Gemini call; a detailed JD makes one additional matching call. A vague JD skips matching. Recommendations and six contextual FAQs use validated data locally, with no extra model request. Matching sends stable fact IDs and factual values; original source evidence stays available for strict local checks and UI transparency.

The dashboard shows the match estimate, matched/not-evidenced skill columns, prioritized skill improvements, directly visible resume details, then contextual FAQs. Required missing skills are high priority; partial evidence and preferred skills are medium; explicitly optional preferred tools are low. Technical experience qualifiers remain partial when duration is unproven. General analysis shows verified details and concise writing guidance without a percentage or empty JD columns.

During this refinement a real Gemini resume response took 35.8 seconds (beyond the old 30-second deadline), followed by 16.7-second JD matching and strict verification. Separate live attempts returned HTTP 503, now reported as temporary provider unavailability. The capped deadline addresses premature cancellation, not provider outages or every possible slow response. Scoring and evidence safeguards are unchanged.


## Timeout investigation

The October 8 live investigation reproduced a 45-second timeout while awaiting Gemini, before response parsing or evidence verification. Tiny probes also returned HTTP 503; subsequent real browser resume-only and resume-plus-JD uploads passed in 13.7 and 23.2 seconds. The intermittent upstream latency cause remains unconfirmed; these successes do not establish that timeouts are eliminated.

Development diagnostics now mark stage start/end without logging source text or keys. Set DEV_ANALYSIS_TIMING=true for the backend and VITE_ANALYSIS_TIMING=true before starting Vite for browser timings. Client cancellation is distinguished from model timeout. Backend startup now fails truthfully with a nonzero exit when its port is occupied, instead of reporting success while an older process continues serving. Model, deadlines, scoring and strict verification are unchanged.
