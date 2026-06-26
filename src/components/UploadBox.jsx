import "./UploadBox.css";
import { useState } from "react";

function UploadBox({ setResult }) {
  const [role, setRole] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  function handleFileChange(event) {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
  }

  async function handleAnalyze() {

    setLoading(true);
    setLoadingText("🔍 Reading Resume...");
    setTimeout(() => {
      setLoadingText("🧠 Analyzing Skills...");
    }, 800);
    setTimeout(() => {
      setLoadingText("📊 Calculating ATS Score...");
    }, 1600);
    await new Promise(resolve =>
      setTimeout(resolve, 2500)
    );
    setLoadingText("✅ Generating Report...");

    setResult(null);

    const formData = new FormData();

    formData.append("resume", file);
    formData.append("role", role);

    try {

      const response = await fetch(
        "http://localhost:5000/upload-resume",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();
      setResult(data);


    

      await new Promise(resolve =>
        setTimeout(resolve, 2500)
      );

       setLoading(false);

    } catch (error) {

      console.log(error);

      setLoading(false);

    }

  }

  return (
    <div className="upload-box">
      <h2>Analyze Your Resume</h2>

      <label>Target Job Role</label>
      <div className="role-select">
        <select
          value={role}
          onChange={(event) => setRole(event.target.value)}
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

      <label className="upload-area">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
        />

        {file ? (
          <>
            <h3>📄 {file.name}</h3>

            <p className="selected-file">
              ✅ Ready for Analysis
            </p>
          </>
        ) : (
          <>
            <h3>📄 Click to Upload Resume</h3>

            <p>Browse and select your resume PDF</p>

            <p className="upload-note">
              PDF only • Maximum 5 MB
            </p>
          </>
        )}
      </label>

      <button
        onClick={handleAnalyze}
        disabled={!role || !file || loading}
      >
        {loading ? "Analyzing..." : "Analyze Resume"}
      </button>

      {loading && (
        <div className="loading-box">
          <p>{loadingText}</p>
        </div>
      )}

      {role && <p className="target-role">Target Role: {role}</p>}
    </div>
  );
}

export default UploadBox;