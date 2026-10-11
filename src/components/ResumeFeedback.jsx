function ResumeFeedback({ review, skillsOnly = false, compact = false }) {
  if (!review) return null;
  const recommendations = skillsOnly
    ? review.skillImprovements || []
    : review.recommendations
        .filter((r) => !r.id.startsWith("jd-"))
        .slice(0, compact ? 3 : 6);
  return (
    <>
      {!skillsOnly && !compact && (
        <section className="dashboard-panel">
          <h3>Resume strengths</h3>
          {review.strengths.length ? (
            <ul className="strength-list">
              {review.strengths.map((item, i) => (
                <li key={i}>
                  <p>{item.text}</p>
                  {item.evidence && (
                    <details className="evidence">
                      <summary>View source evidence</summary>
                      <pre>{item.evidence}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Too little verified information to describe strengths. Review the
              retained facts and extraction warnings.
            </p>
          )}
        </section>
      )}
      <section
        className="dashboard-panel"
        aria-label="Resume improvement recommendations"
      >
        <span className="eyebrow">PRACTICAL NEXT STEPS</span>
        <h3>
          {skillsOnly
            ? "Prioritized Skill Improvements"
            : "How to Improve Your Resume"}
        </h3>
        {skillsOnly ? (
          <p className="muted">
            Required gaps come first; partial evidence and preferred skills
            follow. Optional tools have lower priority.{" "}
            {recommendations.length === 0
              ? "No additional skill gaps were identified among the assessed requirements."
              : "Add a skill only when you can support it with genuine experience."}
          </p>
        ) : (
          <p className="muted">
            Writing guidance based on retained facts
            {review.recommendations.some((r) => r.id.startsWith("jd-"))
              ? " and your JD"
              : ""}
            . Check the original document before treating an extraction omission
            as missing content.
          </p>
        )}
        {["high", "medium", "low"].map((priority) => {
          const items = recommendations.filter((r) => r.priority === priority);
          return items.length ? (
            <section className="priority-group" key={priority}>
              <h4>
                <span
                  className={"priority-dot " + priority}
                  aria-hidden="true"
                />
                {priority[0].toUpperCase() + priority.slice(1)} priority
              </h4>
              {items.map((item) => (
                <article className="recommendation" key={item.id}>
                  <h5>{item.title}</h5>
                  <p>
                    <strong>Why:</strong> {item.why}
                  </p>
                  <p>
                    <strong>How:</strong> {item.how}
                  </p>
                  {item.evidence && (
                    <details className="evidence">
                      <summary>View related source evidence</summary>
                      <pre>{item.evidence}</pre>
                    </details>
                  )}
                </article>
              ))}
            </section>
          ) : null;
        })}
      </section>
    </>
  );
}
export default ResumeFeedback;
