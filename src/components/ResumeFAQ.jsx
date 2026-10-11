function ResumeFAQ({ resume, match, review }) {
  const requirements = match?.requirements || [];
  const missing = requirements.filter(
    (r) =>
      r.kind === "skill" &&
      r.importance === "required" &&
      r.classification === "NOT_EVIDENCED",
  );
  const partial = requirements.filter(
    (r) =>
      r.classification === "PARTIAL" &&
      (r.kind === "skill" ||
        review?.skillImprovements?.some((item) => item.id === `skill-${r.id}`)),
  );
  const names = (items) => [...new Set(items.map((r) => r.subject))].join(", ");
  const projectCounts = new Map();
  for (const requirement of requirements) {
    const cited = new Set(
      requirement.support
        .filter((f) => f.section === "projects")
        .map((f) => f.record),
    );
    for (const name of cited)
      if (resume.projects.some((p) => p.name === name))
        projectCounts.set(name, (projectCounts.get(name) || 0) + 1);
  }
  const projects = [...projectCounts].sort((a, b) => b[1] - a[1]);
  const questions =
    match?.scoringStatus === "available"
      ? [
          [
            "Why is my match score not higher?",
            `${match.partialRequirements.length} requirements have partial evidence and ${match.missingRequirements.length} are not evidenced. Required items weigh 2; preferred items weigh 1. Partial evidence earns half credit. This estimate is not an official ATS score or hiring probability.`,
          ],
          [
            "Which required skills should I prioritize?",
            missing.length
              ? `Start with ${names(missing)}. These required skills are not established in this resume. Document genuine use if you already possess them; otherwise build the capability before claiming it.`
              : "No required skill was classified as entirely not evidenced. Review any partial requirements and their qualifiers before applying.",
          ],
          [
            "Which projects support this role?",
            projects.length
              ? `${projects.map(([name, count]) => name + " supports " + count + " assessed requirement" + (count === 1 ? "" : "s")).join("; ")}. This counts verified citations, not project quality. Highlight your actual contribution.`
              : "No project was cited as support for the assessed requirements. This does not establish that your projects are irrelevant; review their verified technologies and the JD.",
          ],
          [
            "How can I strengthen partial skill evidence?",
            partial.length
              ? `For ${names(partial)}, clarify the specific scope requested in each JD requirement using genuine project or work examples. A listed skill alone does not establish duration or proficiency.`
              : "No skill requirement is classified as partial. Check the other requirement types and missing evidence before making changes.",
          ],
        ]
      : [
          [
            "What information was verified?",
            `${resume.skills.length} skills, ${resume.projects.length} projects, ${resume.experience.length} experience entries and ${resume.education.length} education entries were retained. Source excerpts confirm text support, not real-world authenticity or complete extraction.`,
          ],
          [
            "Which projects can I explain in an interview?",
            resume.projects.length
              ? `Prepare to explain ${resume.projects.map((p) => p.name).join(", ")}: your own contribution, the documented technologies and actual outcomes. Only describe work you genuinely performed.`
              : "No verified project was retained. Check for extraction omissions; add genuine academic or personal work if relevant.",
          ],
          [
            "Why is there no match percentage?",
            match
              ? "This JD did not contain enough distinct, explicit requirements for a meaningful estimate. Your general resume review is available."
              : "No job description was supplied. Your resume can be reviewed, but a job comparison would need actual requirements.",
          ],
          [
            "Does a missing field mean my resume lacks it?",
            "No. Formatting or evidence checks may omit content. Check the original document and visible warnings before adding or changing facts.",
          ],
        ];
  questions.push([
    "What should I check before applying?",
    (review?.recommendations || [])
      .filter((r) => !r.id.startsWith("jd-"))
      .slice(0, 2)
      .map((r) => r.title)
      .join(". ") +
      ". Confirm every statement reflects your actual work; never invent metrics, skills or employment.",
  ]);
  questions.push([
    "How is my resume handled?",
    "The backend temporarily writes uploads and attempts deletion after each request. A crash or interrupted upload can leave a file. There is no application database; results stay in page memory. Text is sent to Google; store:false does not promise zero provider retention.",
  ]);
  return (
    <section
      className="dashboard-panel faq-panel"
      aria-label="Frequently asked questions"
    >
      <span className="eyebrow">UNDERSTAND YOUR REVIEW</span>
      <h3>Frequently asked questions</h3>
      {questions.map(([question, answer]) => (
        <details key={question}>
          <summary>{question}</summary>
          <p>{answer}</p>
        </details>
      ))}
    </section>
  );
}
export default ResumeFAQ;
