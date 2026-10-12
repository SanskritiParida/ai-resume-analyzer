import { useEffect, useRef, useState } from "react";
const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "/api")
).replace(/\/+$/, "");
const MAX_FILE_MB = API_URL === "/api" ? 4 : 5;
function UploadBox({ setResult }) {
  const [file, setFile] = useState(null),
    [jd, setJD] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [dragging, setDragging] = useState(false);
  const input = useRef(null);
  const pending = useRef(false);
  const activeRequest = useRef(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  function choose(selected) {
    if (loading) return;
    setError("");
    setResult(null);
    if (!selected) return;
    const ext = selected.name.split(".").pop().toLowerCase();
    const mime = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    if (
      !Object.hasOwn(mime, ext) ||
      (selected.type && selected.type !== mime[ext])
    ) {
      setFile(null);
      setError(
        "Choose a PDF or DOCX document. Legacy DOC and images are not supported.",
      );
      return;
    }
    if (selected.size > MAX_FILE_MB * 1024 * 1024) {
      setFile(null);
      setError(`Resume must be ${MAX_FILE_MB} MB or smaller.`);
      return;
    }
    if (!selected.size) {
      setFile(null);
      setError("This file is empty. Choose a document containing resume text.");
      return;
    }
    setFile(selected);
  }
  async function analyze(event) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    setResult(null);
    if (!file) {
      setError("Select your resume first.");
      return;
    }
    if (jd.length > 12000) {
      setError("Job description must be 12,000 characters or fewer.");
      return;
    }
    pending.current = true;
    setLoading(true);
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestStart = performance.now();
    let failureCode;
    const trace = (stage, phase = "end", status) => {
      if (
        import.meta.env.DEV &&
        import.meta.env.VITE_ANALYSIS_TIMING === "true"
      ) {
        let target = "invalid API URL";
        try {
          target = new URL(API_URL).origin;
        } catch {
          /* Do not log credentials or query strings. */
        }
        console.info(
          JSON.stringify({
            stage,
            phase,
            elapsedMs: Math.round(performance.now() - requestStart),
            apiOrigin: target,
            status,
            code: failureCode,
          }),
        );
      }
    };
    trace("frontend_request", "start");
    try {
      const body = new FormData();
      body.append("resume", file);
      body.append("analysisMode", jd.trim() ? "job" : "general");
      if (jd.trim()) body.append("jobDescription", jd);
      const response = await fetch(API_URL + "/upload-resume", {
        method: "POST",
        body,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(140000),
        ]),
      });
      trace("frontend_headers", "end", response.status);
      trace("frontend_json", "start");
      const data = await response.json().catch(() => null);
      if (
        typeof data?.code === "string" &&
        /^(AI|JD|EXTRACTION|PDF|DOCX|FILE|MISSING|INVALID|INSUFFICIENT|ANALYSIS)_[A-Z_]+$/.test(
          data.code,
        )
      )
        failureCode = data.code;
      trace("frontend_json", "end", response.status);
      if (!response.ok)
        throw new Error(
          data?.message ||
            (response.status === 413
              ? "Upload exceeds the server limit. On Vercel, use a resume of 4 MB or smaller."
              : response.status === 504
                ? "The backend request timed out. Please retry."
                : "Analysis failed (HTTP " +
                  response.status +
                  "). Please retry."),
        );
      trace("frontend_validation", "start");
      const resume = data?.structuredResume;
      if (
        !resume?.basics ||
        ![
          "skills",
          "education",
          "experience",
          "projects",
          "certifications",
          "achievements",
        ].every((key) => Array.isArray(resume[key])) ||
        !["general", "job"].includes(data.analysisMode)
      )
        throw new Error(
          "The backend returned an invalid resume result. Please retry.",
        );
      const basicsValid =
        ["name", "email", "phone", "location", "evidence"].every(
          (key) =>
            resume.basics[key] === null ||
            typeof resume.basics[key] === "string",
        ) &&
        Array.isArray(resume.basics.links) &&
        resume.basics.links.every((link) => typeof link === "string");
      const recordsValid = [
        "skills",
        "education",
        "experience",
        "projects",
        "certifications",
        "achievements",
      ].every((key) =>
        resume[key].every(
          (item) =>
            item &&
            typeof item.evidence === "string" &&
            Object.values(item).every(
              (value) =>
                value === null ||
                typeof value === "string" ||
                (Array.isArray(value) &&
                  value.every((v) => typeof v === "string")),
            ),
        ),
      );
      if (!basicsValid || !recordsValid)
        throw new Error(
          "The backend returned invalid structured facts. Please retry.",
        );
      if (data.analysisMode === "job") {
        const match = data.jobMatch;
        const scoreValid =
          match?.scoringStatus === "insufficient_detail"
            ? match.score === null && match.calculation === null
            : match?.scoringStatus === "available" &&
              Number.isFinite(match.score) &&
              match.score >= 0 &&
              match.score <= 100 &&
              Number.isFinite(match.calculation?.earnedWeight) &&
              Number.isFinite(match.calculation?.totalWeight) &&
              match.calculation.totalWeight > 0;
        const valid =
          scoreValid &&
          (!match.warnings ||
            (Array.isArray(match.warnings) &&
              match.warnings.every(
                (warning) =>
                  typeof warning?.code === "string" &&
                  typeof warning.message === "string",
              ))) &&
          typeof match.summary === "string" &&
          Array.isArray(match.requirements) &&
          match.requirements.every(
            (item) =>
              typeof item?.subject === "string" &&
              typeof item.requirement === "string" &&
              typeof item.reason === "string" &&
              ["MATCHED", "PARTIAL", "NOT_EVIDENCED"].includes(
                item.classification,
              ) &&
              ["skill", "experience", "education", "other"].includes(
                item.kind,
              ) &&
              ["required", "preferred"].includes(item.importance) &&
              Array.isArray(item.support) &&
              item.support.every(
                (fact) =>
                  typeof fact?.id === "string" &&
                  typeof fact.record === "string" &&
                  typeof fact.value === "string" &&
                  typeof fact.evidence === "string",
              ),
          ) &&
          [
            "matchedRequirements",
            "partialRequirements",
            "missingRequirements",
          ].every(
            (key) =>
              Array.isArray(match[key]) &&
              match[key].every(
                (item) =>
                  typeof item?.requirement === "string" &&
                  typeof item.reason === "string" &&
                  Array.isArray(item.support) &&
                  item.support.every(
                    (fact) =>
                      typeof fact?.value === "string" &&
                      typeof fact.evidence === "string",
                  ),
              ),
          ) &&
          Array.isArray(match.strengths) &&
          match.strengths.every((fact) => typeof fact?.value === "string") &&
          Array.isArray(match.suggestions) &&
          match.suggestions.every((item) => typeof item?.text === "string");
        if (!valid)
          throw new Error(
            "The backend returned invalid job matching data. Please retry.",
          );
      }
      const review = data.resumeReview;
      if (
        !Array.isArray(review?.strengths) ||
        !review.strengths.every(
          (item) =>
            typeof item?.text === "string" &&
            (item.evidence === null || typeof item.evidence === "string"),
        ) ||
        !Array.isArray(review.recommendations) ||
        !review.recommendations.every(
          (item) =>
            typeof item?.id === "string" &&
            ["high", "medium", "low"].includes(item.priority) &&
            ["title", "why", "how"].every(
              (key) => typeof item[key] === "string",
            ) &&
            (item.evidence === null || typeof item.evidence === "string"),
        )
      )
        throw new Error(
          "The backend returned invalid writing guidance. Restart the updated backend and retry.",
        );
      trace("frontend_validation");
      setResult(data);
      trace("frontend_result");
    } catch (err) {
      setError(
        err.name === "TimeoutError"
          ? "The request timed out. Please retry."
          : err instanceof TypeError
            ? "Cannot reach the backend. Start the backend and check VITE_API_URL."
            : err.message,
      );
    } finally {
      trace("frontend_request");
      activeRequest.current = null;
      pending.current = false;
      setLoading(false);
    }
  }
  return (
    <form className="workspace" onSubmit={analyze} aria-busy={loading}>
      <div className="form-heading">
        <div>
          <span className="eyebrow">START YOUR REVIEW</span>
          <h2>A resume. An optional job description.</h2>
        </div>
        <span className="small-tag">PDF / DOCX</span>
      </div>
      <div className="input-grid">
        <section>
          <label className="field-label" htmlFor="resume-file">
            01 <span>Your resume</span>
          </label>
          <input
            ref={input}
            className="file-input"
            id="resume-file"
            type="file"
            accept=".pdf,.docx"
            disabled={loading}
            onChange={(e) => {
              choose(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className={"dropzone " + (dragging ? "dragging" : "")}
            disabled={loading}
            onClick={() => input.current.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!loading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length !== 1) {
                setError("Please upload one resume at a time.");
                return;
              }
              choose(e.dataTransfer.files[0]);
            }}
          >
            <span className="document-icon" aria-hidden="true">
              ↑
            </span>
            <strong>{file ? file.name : "Drop your resume here"}</strong>
            <span>
              {file
                ? (file.size / 1024).toFixed(0) + " KB · Click to replace"
                : "or click to browse your files"}
            </span>
            <small>
              PDF or DOCX · Up to {MAX_FILE_MB} MB · Selectable text
            </small>
          </button>
          <p className="field-note">
            Text is sent to Gemini for analysis. Use only resumes you have
            permission to submit.
          </p>
        </section>
        <section>
          <label className="field-label" htmlFor="job-description">
            02 <span>Job description</span>
            <small>Optional</small>
          </label>
          <textarea
            disabled={loading}
            id="job-description"
            value={jd}
            rows={7}
            placeholder="Paste the job requirements to see where your experience aligns…"
            onChange={(e) => {
              setJD(e.target.value);
              setResult(null);
              setError("");
            }}
          />
          <p className="field-note">
            {jd.length.toLocaleString()} / 12,000 characters · Leave empty for a
            general review.
          </p>
        </section>
      </div>
      <div className="form-actions">
        <p>
          Facts first. Evidence always.
          <br />
          <small>Source-checked facts, not a hidden keyword score.</small>
        </p>
        <button
          className="primary-button"
          disabled={!file || loading}
          type="submit"
        >
          {loading ? "Analyzing your resume…" : "Analyze resume"}
          <span aria-hidden="true">→</span>
        </button>
      </div>
      {loading && (
        <div className="status-message" role="status">
          <span className="spinner" />
          Extracting text and verifying resume facts
          {jd.trim() ? ", then checking your job description" : ""}. Please keep
          this page open while analysis completes.
        </div>
      )}
      {error && (
        <div className="error-message" role="alert">
          <strong>We couldn’t complete this review.</strong>
          <p>{error}</p>
        </div>
      )}
    </form>
  );
}
export default UploadBox;
