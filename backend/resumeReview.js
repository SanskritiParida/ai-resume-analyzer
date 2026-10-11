// Deterministic presentation feedback over retained, source-verified facts.
// This module neither creates qualifications nor asks the model for a score.
const { canonicalSkillName } = require("./analyzeJobMatch");

function assessJobDescription(jd) {
  const text = jd.replace(/\s+/g, " ").trim();
  const words = text.split(" ").filter(Boolean).length;
  return {
    detailed: text.length >= 180 && words >= 30,
    characterCount: text.length,
    wordCount: words,
  };
}

function unscoredJobMatch(
  requirements = [],
  message = "Add a fuller job description with responsibilities and explicit qualifications. Your general resume review is still available.",
) {
  return {
    score: null,
    calculation: null,
    scoringStatus: "insufficient_detail",
    summary: message,
    requirements,
    matchedRequirements: requirements.filter(
      (r) => r.classification === "MATCHED",
    ),
    partialRequirements: requirements.filter(
      (r) => r.classification === "PARTIAL",
    ),
    missingRequirements: requirements.filter(
      (r) => r.classification === "NOT_EVIDENCED",
    ),
    strengths: [],
    suggestions: [],
  };
}

function publishJobMatch(match, jd) {
  const subjects = new Set(
    match.requirements.map((r) => `${r.kind}:${canonicalSkillName(r.subject)}`),
  );
  if (!assessJobDescription(jd).detailed || subjects.size < 3) {
    return {
      ...unscoredJobMatch(
        match.requirements,
        "Too few distinct, explicit requirements for a meaningful percentage. Review the evidenced requirements below or provide a more detailed JD.",
      ),
      warnings: match.warnings || [],
    };
  }
  return { ...match, scoringStatus: "available" };
}

const measured = (text) =>
  /\d+(?:[.,]\d+)?\s*(?:%|percent|users?\b|requests?\b|records?\b|seconds?\b|milliseconds?\b|hours?\b|transactions?\b)|[$₹€£]\s*\d/i.test(
    text || "",
  );

function skillImprovements(resume, match) {
  const known = new Set(resume.skills.map((s) => canonicalSkillName(s.name)));
  for (const entry of [...resume.projects, ...resume.experience])
    for (const skill of entry.technologies)
      known.add(canonicalSkillName(skill));
  const seen = new Set();
  return (match?.requirements || [])
    .filter((r) => {
      const key = canonicalSkillName(r.subject);
      const technical =
        r.kind === "skill" || (r.kind === "experience" && known.has(key));
      if (!technical || r.classification === "MATCHED" || seen.has(key))
        return false;
      seen.add(key);
      return true;
    })
    .map((r) => {
      const documented =
        known.has(canonicalSkillName(r.subject)) || r.support.length > 0;
      const optional =
        r.importance === "preferred" &&
        /\boptional\b|nice[ -]to[ -]have|\ba plus\b/i.test(r.requirement);
      const priority =
        r.classification === "PARTIAL"
          ? "medium"
          : r.importance === "required"
            ? "high"
            : optional
              ? "low"
              : "medium";
      return {
        id: `skill-${r.id}`,
        priority,
        title: r.subject,
        why: `${r.importance === "required" ? "Required" : "Preferred"} by the JD: “${r.requirement}”. ${r.classification === "PARTIAL" ? "Verified evidence covers only part of this requirement." : "Not established by retained resume evidence; this does not prove missing ability."}`,
        how: documented
          ? `Document genuine use of ${r.subject} in a relevant project or work bullet. Clarify the specific scope requested by the JD; do not claim unverified proficiency or duration.`
          : `If you already use ${r.subject}, document your actual contribution. Otherwise practise it in a small extension to an existing project, and describe it only after gaining genuine experience.`,
        evidence: r.support[0]?.evidence || null,
      };
    });
}

function buildResumeReview(resume, match = null, extraction = {}) {
  const strengths = [],
    recommendations = [];
  const add = (id, priority, title, why, how, evidence = null) =>
    recommendations.push({ id, priority, title, why, how, evidence });
  if (resume.projects.length)
    strengths.push({
      text: `${resume.projects.length} documented project${resume.projects.length === 1 ? "" : "s"}, including ${resume.projects[0].name}.`,
      evidence: resume.projects[0].evidence,
    });
  if (resume.experience.length)
    strengths.push({
      text: `Documented experience at ${resume.experience[0].company}${resume.experience[0].role ? ` as ${resume.experience[0].role}` : ""}.`,
      evidence: resume.experience[0].evidence,
    });
  if (resume.education.length)
    strengths.push({
      text: `Education documented at ${resume.education[0].institution || "the institution in your source"}.`,
      evidence: resume.education[0].evidence,
    });
  if (resume.certifications.length)
    strengths.push({
      text: `${resume.certifications.length} source-supported certification${resume.certifications.length === 1 ? "" : "s"}.`,
      evidence: resume.certifications[0].evidence,
    });
  if (!strengths.length && resume.skills.length)
    strengths.push({
      text: `${resume.skills.length} explicitly documented skills. This does not establish proficiency.`,
      evidence: resume.skills[0].evidence,
    });

  if (!resume.basics.email && !resume.basics.phone)
    add(
      "contact",
      "high",
      "Make a contact method readable",
      "No email or phone was retained as verified information.",
      "Check the extracted source and include a current email or phone as selectable text; do not add private details unnecessarily.",
    );
  const gaps = (match?.requirements || []).filter(
    (r) => r.classification !== "MATCHED",
  );
  // Consolidate missing skill advice by priority; partial qualifiers stay specific.
  const seen = new Set();
  for (const r of gaps) {
    const key = `${r.kind}:${canonicalSkillName(r.subject)}`;
    if (seen.has(key)) continue;
    if (r.kind === "skill" && r.classification === "NOT_EVIDENCED") {
      const related = gaps.filter(
        (other) =>
          other.kind === "skill" &&
          other.classification === "NOT_EVIDENCED" &&
          other.importance === r.importance &&
          !seen.has(`skill:${canonicalSkillName(other.subject)}`),
      );
      const names = [...new Set(related.map((other) => other.subject))].join(
        ", ",
      );
      related.forEach((other) =>
        seen.add(`skill:${canonicalSkillName(other.subject)}`),
      );
      add(
        `jd-skills-${r.importance}`,
        r.importance === "required" ? "high" : "medium",
        `Demonstrate, if genuinely possessed: ${names}`,
        `${r.importance === "required" ? "Required" : "Preferred"} skills not established by the retained resume evidence: ${names}. Lack of evidence does not establish lack of ability.`,
        `If you genuinely possess ${names}, document their actual use in the relevant project or work example, including your specific contribution. Otherwise build the capability first; do not insert unsupported keywords. Inspect each JD requirement in the breakdown before tailoring your wording.`,
      );
      continue;
    }
    seen.add(key);
    add(
      `jd-${r.id}`,
      r.classification === "PARTIAL"
        ? "medium"
        : r.importance === "required"
          ? "high"
          : "medium",
      `${r.classification === "PARTIAL" ? "Clarify partial evidence for" : "Demonstrate, if genuinely possessed:"} ${r.subject}`,
      `${r.importance === "required" ? "Required" : "Preferred"} by the JD. ${r.reason}`,
      r.classification === "PARTIAL"
        ? `Check “${r.requirement}”. Describe the actual scope, context and duration in the relevant entry. Do not infer years, completion or proficiency from a skill list.`
        : `If you genuinely meet “${r.requirement}”, add a specific project, employment or education example with your actual contribution. Otherwise build the capability first; do not insert the keyword as a claim.`,
      r.support[0]?.evidence || null,
    );
  }
  for (const [section, label] of [
    ["experience", "experience"],
    ["projects", "project"],
  ]) {
    const records = resume[section];
    for (const [index, record] of records.entries()) {
      if (record.description) continue;
      add(
        `${section}-description-${index}`,
        "medium",
        `Clarify ${record.name || record.company}`,
        `No contiguous, source-supported ${label} description was retained; this may reflect formatting or omitted detail.`,
        `Check the original ${label} entry. Add a concise bullet describing what you actually built or did, your contribution and the technologies genuinely used. Keep related details together.`,
        record.evidence,
      );
    }
  }
  const impactEntries = [...resume.experience, ...resume.projects].filter(
    (r) => r.description && !measured(r.description),
  );
  if (impactEntries.length) {
    const names = impactEntries
      .slice(0, 2)
      .map((r) => r.name || r.company)
      .join(" and ");
    add(
      "impact",
      "medium",
      `Explain the outcome of ${names}`,
      `These verified descriptions contain no recognized measurable outcome; qualitative results can also be useful. Start with this existing work: “${impactEntries[0].description.slice(0, 160)}”.`,
      "Describe an actual outcome. If you have reliable measurements, use: “Improved [actual measure] from [verified baseline] to [verified result] by [actual action].” Replace every placeholder with your own substantiated facts, or omit the numbers.",
      impactEntries[0].evidence,
    );
  }
  if (!resume.experience.length && !resume.projects.length)
    add(
      "examples",
      "high",
      "Provide concrete work or project examples",
      "No project or experience records were retained; a skill list alone cannot establish applied experience.",
      "Check for extraction omissions. If applicable, add genuine academic, personal or professional work with your contribution and outcome. Do not invent employment.",
    );
  const used = new Set(
    [...resume.experience, ...resume.projects]
      .flatMap((r) => r.technologies)
      .map(canonicalSkillName),
  );
  const standalone = resume.skills.filter(
    (s) => !used.has(canonicalSkillName(s.name)),
  );
  if (standalone.length)
    add(
      "skills-context",
      "medium",
      "Connect listed skills to demonstrated work",
      `The extracted technology lists do not link ${standalone
        .slice(0, 4)
        .map((s) => s.name)
        .join(
          ", ",
        )} to a project or experience record. This is a presentation check, not proof of missing ability.`,
      "For skills you actually used, name them in the relevant project or experience bullet with your contribution. Review the original source before adding anything; descriptions may already contain additional context.",
      standalone[0].evidence,
    );
  if (!resume.education.length)
    add(
      "education",
      "low",
      "Check education visibility, if relevant",
      "No education record was retained.",
      "If relevant to your application, provide your actual institution, qualification and accurate dates in selectable text. First check whether extraction missed existing information.",
    );
  else if (resume.education.some((r) => !r.degree || !r.endDate))
    add(
      "education-details",
      "low",
      "Clarify qualification and education dates",
      "At least one verified education entry lacks a degree or end date.",
      "Check the source and state the actual qualification and completed or expected date. Label ongoing education accurately.",
      resume.education.find((r) => !r.degree || !r.endDate).evidence,
    );
  if (resume.certifications.some((r) => !r.issuer || !r.date))
    add(
      "certification-details",
      "low",
      "Keep certification details together",
      "An issuer or date is not verified for at least one certification; shared lists may not establish associations.",
      "Only if present and accurate, place each certificate title, issuer and date together. Do not attach an issuer or date from another certificate.",
      resume.certifications.find((r) => !r.issuer || !r.date).evidence,
    );
  add(
    "readability",
    extraction.extractionQuality === "suspicious" ? "high" : "low",
    "Check the exported text and reading order",
    "Text extraction cannot certify visual layout or compatibility with a commercial ATS.",
    "Use clear section headings and selectable text. Open the evidence excerpts to check reading order, especially for columns and tables. Confirm the exported PDF/DOCX preserves your content.",
  );
  return {
    strengths,
    recommendations,
    skillImprovements: skillImprovements(resume, match),
    method:
      "Deterministic writing guidance from retained verified facts and validated JD requirements; no additional model call or resume quality score.",
  };
}

module.exports = {
  assessJobDescription,
  unscoredJobMatch,
  publishJobMatch,
  buildResumeReview,
  skillImprovements,
};
