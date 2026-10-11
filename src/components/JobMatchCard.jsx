import {
  skillMatchGroups,
  isSkillRequirement,
} from "../utils/matchPresentation";

function Requirement({ item }) {
  return (
    <article className="requirement-row">
      <div className="section-heading">
        <h4>{item.subject}</h4>
        <span className={"match-status " + item.classification.toLowerCase()}>
          {item.classification === "MATCHED"
            ? "Matched"
            : item.classification === "PARTIAL"
              ? "Partial evidence"
              : "Not evidenced"}
        </span>
      </div>
      <small>
        {item.importance === "required"
          ? "Required · weight 2"
          : "Preferred · weight 1"}
      </small>
      <p className="jd-quote">JD: {item.requirement}</p>
      <p>{item.reason}</p>
      {item.support.length > 0 && (
        <details className="evidence">
          <summary>View supporting resume evidence</summary>
          {[...new Map(item.support.map((f) => [f.evidence, f])).values()].map(
            (f) => (
              <div key={f.id}>
                <b>{f.record}</b>
                <pre>{f.evidence}</pre>
              </div>
            ),
          )}
        </details>
      )}
    </article>
  );
}

function JobMatchCard({ match }) {
  const {
    matched,
    notEvidenced,
    requiredCount,
    matchedRequiredCount,
    partialRequiredCount,
  } = skillMatchGroups(match.requirements);
  const other = match.requirements.filter((r) => !isSkillRequirement(r));
  const scored =
    match.scoringStatus === "available" && Number.isFinite(match.score);
  return (
    <section
      className="dashboard-panel job-review"
      aria-label="Job description comparison"
    >
      {match.warnings?.map((warning) => (
        <p className="warning-message" role="alert" key={warning.code}>
          {warning.message}
        </p>
      ))}
      {scored ? (
        <>
          <div className="match-score-layout">
            <div
              className="match-gauge"
              role="img"
              aria-label={`ATS-style match estimate: ${match.score} percent`}
            >
              <svg viewBox="0 0 160 160" aria-hidden="true">
                <circle className="gauge-track" cx="80" cy="80" r="68" />
                <circle
                  className="gauge-value"
                  cx="80"
                  cy="80"
                  r="68"
                  pathLength="100"
                  strokeDasharray={`${match.score} 100`}
                />
              </svg>
              <span>
                <strong>{match.score}%</strong>
                <small>Requirement match</small>
              </span>
            </div>
            <div>
              <span className="eyebrow">YOUR SUPPLIED JOB DESCRIPTION</span>
              <h3>ATS-Style Match Score (Estimate)</h3>
              <p>
                {match.matchedRequirements.length} matched ·{" "}
                {match.partialRequirements.length} partial ·{" "}
                {match.missingRequirements.length} not evidenced
              </p>
              <p className="muted">
                An explainable requirement comparison. Not an official ATS
                score, hiring probability or guarantee of selection.
              </p>
            </div>
          </div>
          <details className="score-explanation">
            <summary>Why this score? View the calculation</summary>
            <p>
              Required requirements have weight 2; preferred requirements have
              weight 1. Full matches earn 1 × weight, partial matches 0.5 ×
              weight, and not-evidenced requirements earn zero.
            </p>
            <p>
              <strong>
                round(100 × {match.calculation.earnedWeight} /{" "}
                {match.calculation.totalWeight}) = {match.score}%
              </strong>
            </p>
            <p>
              The denominator includes all listed skills, experience, education
              and other requirements. Matching classifications use verified
              facts; the percentage is calculated locally. No years of
              experience are inferred from dates.
            </p>
          </details>
        </>
      ) : (
        <div className="unscored-notice" role="status">
          <h3>More JD detail needed</h3>
          <p>{match.summary}</p>
          <p className="muted">No match percentage has been assigned.</p>
        </div>
      )}
      {match.requirements.length > 0 && (
        <>
          <div className="section-heading skill-match-heading">
            <div>
              <h3>Skill match analysis</h3>
              <p>
                {matchedRequiredCount} of {requiredCount} required skills
                evidenced
                {partialRequiredCount
                  ? ` · ${partialRequiredCount} partially evidenced`
                  : ""}
              </p>
            </div>
          </div>
          <p className="muted">
            Not evidenced means this resume lacks verified support, not that you
            lack the ability. Partial requirements remain incomplete. Preferred
            skills are labeled separately.
          </p>
          <div className="skill-match-columns">
            <section className="match-column">
              <h4 className="match-column-title">Matched Skills</h4>
              {matched.length ? (
                matched.map((item) => <Requirement key={item.id} item={item} />)
              ) : (
                <p className="muted">
                  No fully supported skill requirements identified.
                </p>
              )}
            </section>
            <section className="match-column">
              <h4 className="match-column-title">Not Evidenced in Resume</h4>
              {notEvidenced.length ? (
                notEvidenced.map((item) => (
                  <Requirement key={item.id} item={item} />
                ))
              ) : (
                <p className="muted">
                  All identified skill requirements have supporting evidence.
                </p>
              )}
              {notEvidenced.length > 0 && (
                <p className="muted">
                  If you genuinely possess a skill, demonstrate it with a
                  specific, truthful example. A keyword alone does not establish
                  experience.
                </p>
              )}
            </section>
          </div>
          {other.length > 0 && (
            <details className="other-requirements">
              <summary>
                Experience, education & other requirements ({other.length})
              </summary>
              {other.map((item) => (
                <Requirement key={item.id} item={item} />
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}

export default JobMatchCard;
