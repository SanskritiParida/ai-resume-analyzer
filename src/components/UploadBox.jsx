import "./UploadBox.css";
import { useState } from "react";

const API_URL = (import.meta.env.VITE_API_URL ||
  "https://ai-resume-analyzer-api-hjy8.onrender.com").replace(/\/+$/, "");

function UploadBox({ setResult }) {
  const [role, setRole] = useState("");
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [extractionWarnings, setExtractionWarnings] = useState([]);
  function handleFileChange(event) {
    const selectedFile = event.target.files[0];
    setErrorMessage("");
    setExtractionWarnings([]);
    setResult(null);
    const extension = selectedFile?.name.split(".").pop().toLowerCase();
    const expectedMime = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    if (selectedFile && (!Object.hasOwn(expectedMime, extension) ||
        (selectedFile.type && selectedFile.type !== expectedMime[extension]))) {
      setFile(null);
      setErrorMessage("Only PDF and DOCX files are supported.");
      return;
    }
    if (selectedFile && selectedFile.size > 5 * 1024 * 1024) {
      setFile(null);
      setErrorMessage("Resume must be 5 MB or smaller.");
      return;
    }
    setFile(selectedFile);
  }

  async function handleAnalyze() {
    setResult(null);
    setErrorMessage("");
    setExtractionWarnings([]);
    if (!file || (!role && !jobDescription.length)) {
      setErrorMessage("Please select a resume and either a target role or a job description.");
      return;
    }
    if (jobDescription.length && !jobDescription.trim()) {
      setErrorMessage("Please paste a non-empty job description or clear it to use the role demo.");
      return;
    }
    if (jobDescription.length > 12000) {
      setErrorMessage("Job description must be 12,000 characters or fewer.");
      return;
    }
    setLoading(true);
    setLoadingText(jobDescription.length ? "🔍 Extracting resume and comparing job requirements..." : "🔍 Reading and analyzing resume...");

    try {
      const formData = new FormData();
      formData.append("resume", file);
      formData.append("role", role);
      if (jobDescription.length) {
        formData.append("jobDescription", jobDescription);
        formData.append("analysisMode", "job");
      }
      const response = await fetch(
        `${API_URL}/upload-resume`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || `Resume analysis failed (HTTP ${response.status}). Please try again.`);
      }
      const match = data?.jobMatch;
      const validJobMatch = data?.analysisMode === "job" && Number.isFinite(match?.score) && match.score >= 0 && match.score <= 100 &&
        typeof match.summary === "string" && Number.isFinite(match.calculation?.earnedWeight) && match.calculation?.totalWeight > 0 &&
        ["matchedRequirements", "partialRequirements", "missingRequirements"].every(key => Array.isArray(match[key]) && match[key].every(item =>
          typeof item.requirement === "string" && typeof item.reason === "string" && Array.isArray(item.support) &&
          item.support.every(fact => typeof fact.value === "string" && typeof fact.evidence === "string"))) &&
        Array.isArray(match.strengths) && match.strengths.every(fact => typeof fact.value === "string") &&
        Array.isArray(match.suggestions) && match.suggestions.every(item => typeof item.text === "string");
      const validRoleResult = data && data.analysisMode !== "job" && ["skillsFound", "missingSkills", "suggestions", "resumeTips", "insights"]
        .every(key => Array.isArray(data[key])) && data.statistics?.completeness;
      if (!validJobMatch && !validRoleResult) {
        throw new Error("The backend returned an invalid analysis result. Please try again.");
      }
      setResult(data);
      setExtractionWarnings(data.extraction?.warnings || []);

    } catch (error) {

      setErrorMessage(error instanceof TypeError
        ? "Unable to reach the backend. Check your connection and API URL."
        : error.message);
    } finally {
      setLoading(false);
      setLoadingText("");
    }

  }

  return (
    <div className="upload-box">
      <h2>Analyze Your Resume</h2>

      <label>Target Job Role (demo when no JD is supplied)</label>
      <div className="role-select">
        <select
          disabled={loading || jobDescription.length > 0}
          value={role}
          onChange={(event) => { setRole(event.target.value); setResult(null); setExtractionWarnings([]); }}
        >
          <option value="">Choose Target Role</option>

          <option value="frontend developer">
            💻 Frontend Developer
          </option>

          <option value="backend developer">
            ⚙️ Backend Developer
          </option>

          <option value="full stack developer">
            🚀 Full Stack Developer
          </option>

          <option value="software engineer">
            👨‍💻 Software Engineer
          </option>

          <option value="python developer">
            🐍 Python Developer
          </option>

          <option value="java developer">
            ☕ Java Developer
          </option>

          <option value="ai engineer">
            🤖 AI Engineer
          </option>
        </select>
      </div>

      <label htmlFor="job-description">Job Description (optional)</label>
      <textarea disabled={loading} id="job-description" rows={7} value={jobDescription}
        aria-describedby="job-description-note"
        placeholder="Paste actual job requirements. A supplied JD takes priority over the role demo."
        onChange={event => { setJobDescription(event.target.value); setResult(null); setErrorMessage(""); setExtractionWarnings([]); }} />
      <p id="job-description-note" className="upload-note">{jobDescription.length.toLocaleString()} / 12,000 characters. Leave empty for the role demo.</p>

      <label className="upload-area">
        <input
          disabled={loading}
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileChange}
        />

        {file ? (
          <>
            <h3>📄 {file.name}</h3>

            <p className="selected-file">
              ✅ Selected for analysis; extraction quality will be checked
            </p>
          </>
        ) : (
          <>
            <h3>📄 Click to Upload Resume</h3>

            <p>Browse and select your resume PDF or DOCX</p>

            <p className="upload-note">
              PDF or DOCX • Maximum 5 MB
            </p>
          </>
        )}
      </label>

      <button
        onClick={handleAnalyze}
        disabled={(!role && !jobDescription.length) || !file || loading}
      >
        {loading ? "Analyzing..." : "Analyze Resume"}
      </button>

      {loading && (
        <div className="loading-box" role="status" aria-live="polite">
          <p>{loadingText}</p>
        </div>
      )}

      {errorMessage && <p role="alert">{errorMessage}</p>}
      {extractionWarnings.map((warning) => <p role="alert" key={`${warning.code}:${warning.message}`}>⚠ {warning.message}</p>)}
      {jobDescription.length > 0 ? <p className="target-role">Analysis: supplied job description (role demo ignored)</p> : role && <p className="target-role">Role keyword demo: {role}</p>}
    </div>
  );
}

export default UploadBox;
