import JobMatchCard from "./JobMatchCard";
import ResumeFeedback from "./ResumeFeedback";
import ResumeFAQ from "./ResumeFAQ";
function Evidence({ text }) {
  return text ? (
    <details className="evidence">
      <summary>Source excerpt</summary>
      <pre>{text}</pre>
    </details>
  ) : null;
}
function Records({ title, items, kind }) {
  return (
    <section className="dashboard-panel">
      <div className="section-heading">
        <h3>{title}</h3>
        <span className="count">{items.length}</span>
      </div>
      {!items.length ? (
        <p className="muted">
          No verified {title.toLowerCase()} found in this document.
        </p>
      ) : (
        items.map((item, i) => (
          <article className="record" key={i}>
            <h4>
              {item.name ||
                item.company ||
                item.institution ||
                item.description}
            </h4>
            {kind === "experience" && (
              <p>
                {item.role}
                {item.startDate || item.endDate
                  ? " · " +
                    [item.startDate, item.endDate].filter(Boolean).join(" – ")
                  : ""}
              </p>
            )}
            {kind === "education" && (
              <p>
                {[
                  item.degree,
                  item.field,
                  item.startDate,
                  item.endDate,
                  item.grade,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {item.description &&
              item.description !== item.name &&
              kind !== "achievements" && (
                <p className="description">
                  {item.description.length > 240
                    ? item.description.slice(0, 240) + "…"
                    : item.description}
                </p>
              )}
            {item.issuer && (
              <p>{[item.issuer, item.date].filter(Boolean).join(" · ")}</p>
            )}
            {item.technologies?.length > 0 && (
              <div className="chips">
                {item.technologies.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            )}
            <Evidence text={item.evidence} />
          </article>
        ))
      )}
    </section>
  );
}
function ResumeDashboard({ result }) {
  const r = result.structuredResume,
    b = r.basics;
  return (
    <section className="dashboard" aria-label="Analysis results">
      {result.jobMatch && <JobMatchCard match={result.jobMatch} />}
      {result.jobMatch?.requirements.length > 0 && (
        <ResumeFeedback review={result.resumeReview} skillsOnly />
      )}
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">YOUR REVIEW</span>
          <h2>{b.name || "Your structured resume"}</h2>
          <p>
            Extracted facts verified against your document. Unknown information
            stays unknown.
          </p>
        </div>
        <span className="verified-tag">
          {result.evidenceValidation?.status === "partial"
            ? "Partial review · retained facts verified"
            : "Source evidence verified"}
        </span>
      </div>
      {result.extraction?.warnings?.map((w) => (
        <p className="warning-message" role="alert" key={w.code}>
          {w.message}
        </p>
      ))}
      {result.analysisWarnings?.map((warning) => (
        <p className="warning-message" role="alert" key={warning.code}>
          {warning.message}
        </p>
      ))}
      <div className="metric-grid">
        <div>
          <span>Verified skills</span>
          <strong>{r.skills.length}</strong>
        </div>
        <div>
          <span>Experience entries</span>
          <strong>{r.experience.length}</strong>
        </div>
        <div>
          <span>Projects</span>
          <strong>{r.projects.length}</strong>
        </div>
        <div>
          <span>Extraction</span>
          <strong className="quality">
            {result.extraction?.extractionQuality || "Unknown"}
          </strong>
          <small>
            {result.extraction?.format?.toUpperCase()} ·{" "}
            {result.extraction?.characterCount?.toLocaleString()} characters
          </small>
        </div>
      </div>
      <section className="dashboard-panel">
        <h3>Profile & contact</h3>
        <p>
          {[b.email, b.phone, b.location].filter(Boolean).join(" · ") ||
            "Contact details not evidenced."}
        </p>
        {b.links.map((link) => (
          <p key={link}>{link}</p>
        ))}
        <Evidence text={b.evidence} />
      </section>
      <section className="dashboard-panel">
        <div className="section-heading">
          <h3>Technical Skills</h3>
          <span className="count">{r.skills.length}</span>
        </div>
        <div className="skill-grid">
          {r.skills.map((s, i) => (
            <div className="skill" key={i}>
              <b>{s.name}</b>
              {s.category && <small>{s.category}</small>}
              <Evidence text={s.evidence} />
            </div>
          ))}
        </div>
        {!r.skills.length && (
          <p className="muted">No verified skills identified.</p>
        )}
      </section>
      <div className="record-grid">
        <Records title="Projects" items={r.projects} kind="projects" />
        <Records title="Experience" items={r.experience} kind="experience" />
        <Records title="Education" items={r.education} kind="education" />
        <Records
          title="Certifications"
          items={r.certifications}
          kind="certifications"
        />
      </div>
      <Records
        title="Achievements"
        items={r.achievements}
        kind="achievements"
      />
      <p className="results-note">
        Evidence verifies that text exists in the source; it does not establish
        authenticity or guarantee complete extraction.
      </p>
      <ResumeFeedback
        review={result.resumeReview}
        compact={Boolean(result.jobMatch)}
      />
      <ResumeFAQ
        resume={r}
        match={result.jobMatch}
        review={result.resumeReview}
      />
    </section>
  );
}
export default ResumeDashboard;
