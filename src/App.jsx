import { useState } from "react";
import "./App.css";
import UploadBox from "./components/UploadBox";
import ResumeDashboard from "./components/ResumeDashboard";
function App() {
  const [result, setResult] = useState(null);
  return (
    <div className="app-container">
      <header className="topbar">
        <a href="#" className="brand">
          <span className="brand-mark">R</span> ResumeLens
        </a>
        <span className="topbar-note">Evidence-led resume review</span>
      </header>
      <main>
        <section className="hero">
          <span className="eyebrow">CLARITY BEFORE YOUR NEXT APPLICATION</span>
          <h1>
            Your experience.
            <br />
            <span>A clearer perspective.</span>
          </h1>
          <p>
            Understand what your resume says. See how it aligns with a role.
            Every extracted fact stays connected to its source.
          </p>
        </section>
        <UploadBox setResult={setResult} />
        {result ? (
          <ResumeDashboard result={result} />
        ) : (
          <section className="empty-state">
            <span className="eyebrow">WHAT YOU GET</span>
            <div className="feature-grid">
              <article>
                <b>01 / A structured profile</b>
                <p>
                  Your skills, experience and projects, organized from source
                  text.
                </p>
              </article>
              <article>
                <b>02 / An evidence trail</b>
                <p>
                  Open any fact to inspect the exact supporting resume excerpt.
                </p>
              </article>
              <article>
                <b>03 / Optional job alignment</b>
                <p>Compare actual requirements with documented experience.</p>
              </article>
            </div>
          </section>
        )}
      </main>
      <footer>
        ResumeLens · AI-assisted extraction, locally verified evidence.
        <span>Compatibility is not a hiring prediction.</span>
      </footer>
    </div>
  );
}
export default App;
