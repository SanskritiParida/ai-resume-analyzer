import "./ResultCard.css";

function Requirements({ title, items }) {
  return <div className="result-box full-width">
    <h3>{title}</h3>
    {!items.length && <p>None identified.</p>}
    {items.map(item => <div className="insight-card" key={item.id}>
      <h4>{item.requirement}</h4>
      <p>{item.importance === "required" ? "Required · weight 2" : "Preferred · weight 1"}{item.minimumYears !== null ? ` · ${item.minimumYears}+ years expectation` : ""}</p>
      <p>{item.reason}</p>
      {item.support.map(fact => <div key={fact.id}>
        <p><strong>{fact.record}:</strong> {fact.value}</p>
        <details><summary>Verified resume evidence</summary><p style={{ whiteSpace: "pre-wrap" }}>{fact.evidence}</p></details>
      </div>)}
    </div>)}
  </div>;
}

function JobMatchCard({ match }) {
  return <div className="result-card">
    <div className="score-section">
      <h2>Job Compatibility Score</h2>
      <p className="role-badge">Based on your supplied job description</p>
      <div className="score-circle" style={{ background: "#2563eb" }}>{match.score}%</div>
      <p className="feedback-text">{match.summary}</p>
      <p>Required weight: 2 · Preferred weight: 1<br />Matched: full credit · Partial: half credit · Not evidenced: zero</p>
      <p>Score = round(100 × {match.calculation.earnedWeight} / {match.calculation.totalWeight})</p>
    </div>
    <p>Not evidenced means this resume lacks supporting text, not that you lack the ability.</p>
    <div className="result-grid">
      <Requirements title="Matched Requirements" items={match.matchedRequirements} />
      <Requirements title="Partially Matched Requirements" items={match.partialRequirements} />
      <Requirements title="Requirements Not Evidenced in This Resume" items={match.missingRequirements} />
      <div className="result-box full-width">
        <h3>Relevant Strengths</h3>
        <ul>{match.strengths.map(fact => <li key={fact.id}><strong>{fact.record}:</strong> {fact.value}</li>)}</ul>
        {!match.strengths.length && <p>No clearly matched strengths identified.</p>}
      </div>
      <div className="result-box full-width">
        <h3>Grounded Improvement Suggestions</h3>
        <ul>{match.suggestions.map((item, index) => <li key={`${item.requirementId}:${index}`}>{item.text}</li>)}</ul>
        {!match.suggestions.length && <p>No additional suggestions identified.</p>}
      </div>
    </div>
  </div>;
}

export default JobMatchCard;
