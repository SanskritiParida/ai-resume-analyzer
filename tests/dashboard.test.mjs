import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import {
  skillMatchGroups,
  isSkillRequirement,
} from "../src/utils/matchPresentation.js";
const require = createRequire(import.meta.url);
const {
  buildResumeReview,
  publishJobMatch,
  unscoredJobMatch,
} = require("../backend/resumeReview.js");
const { calculateScore } = require("../backend/analyzeJobMatch.js");

async function compile(name, extra = {}) {
  let source = fs.readFileSync(
    new URL(`../src/components/${name}.jsx`, import.meta.url),
    "utf8",
  );
  source = source
    .replace(/^import [\s\S]*?;\s*/gm, "")
    .replace(`export default ${name};`, `module.exports = ${name};`);
  const transformed = await transformWithOxc(source, name + ".jsx", {
    jsx: { runtime: "classic" },
  });
  const module = { exports: {} };
  vm.runInNewContext(transformed.code, { React, module, ...extra });
  return module.exports;
}
const JobMatchCard = await compile("JobMatchCard", {
  skillMatchGroups,
  isSkillRequirement,
});
const ResumeFeedback = await compile("ResumeFeedback");
const ResumeFAQ = await compile("ResumeFAQ");
const Dashboard = await compile("ResumeDashboard", {
  JobMatchCard,
  ResumeFeedback,
  ResumeFAQ,
});
const render = (result) =>
  renderToStaticMarkup(React.createElement(Dashboard, { result }));
const resume = {
  basics: {
    name: "Test Candidate",
    email: null,
    phone: null,
    location: null,
    links: [],
    evidence: "Test Candidate",
  },
  skills: [{ name: "Python", category: null, evidence: "Python" }],
  projects: [
    {
      name: "Example App",
      description: null,
      technologies: ["Python"],
      evidence: "Example App Python",
    },
  ],
  experience: [],
  education: [],
  certifications: [],
  achievements: [],
};
const result = (match) => ({
  structuredResume: resume,
  extraction: {
    format: "docx",
    characterCount: 800,
    extractionQuality: "good",
    warnings: [],
  },
  resumeReview: buildResumeReview(resume, match),
  ...(match ? { jobMatch: match } : {}),
});
const r = (
  subject,
  classification,
  importance = "required",
  kind = "skill",
) => ({
  id: subject,
  subject,
  kind,
  classification,
  importance,
  minimumYears: null,
  requirement: subject,
  reason: "Test requirement reason",
  support:
    classification === "NOT_EVIDENCED"
      ? []
      : [
          {
            id: subject,
            value: "Python",
            record: "Example App",
            evidence: "Example App Python",
          },
        ],
});
const detailed =
  "We are hiring a developer to build reliable web services with our engineering team and maintain documented project contributions. The required qualifications include Python, Docker and Java with clear examples of genuine practical experience.";

test("Resume-only dashboard displays personalized guidance, verified sections and six FAQs without a score", () => {
  const html = render(result());
  for (const text of [
    "Test Candidate",
    "How to Improve Your Resume",
    "Resume strengths",
    "Clarify Example App",
    "High priority",
    "Medium priority",
    "Low priority",
    "Experience",
    "Education",
    "Certifications",
    "Achievements",
    "Frequently asked questions",
  ])
    assert.ok(html.includes(text), text);
  assert.ok(!html.includes("match-gauge"));
  assert.equal((html.match(/<details><summary>/g) || []).length, 6);
  assert.ok(html.includes("store:false") && html.includes("crash"));
});

test("Personalized FAQs use only verified projects and classified requirements", () => {
  const requirements = [
    r("Docker", "NOT_EVIDENCED"),
    r("Python", "PARTIAL"),
    r("Redis", "NOT_EVIDENCED", "preferred"),
  ];
  requirements[1].support[0].section = "projects";
  const calculation = calculateScore(requirements);
  const match = {
    scoringStatus: "available",
    requirements,
    score: calculation.score,
    calculation,
    matchedRequirements: [],
    partialRequirements: [requirements[1]],
    missingRequirements: [requirements[0], requirements[2]],
  };
  const html = renderToStaticMarkup(
    React.createElement(ResumeFAQ, {
      resume,
      match,
      review: buildResumeReview(resume, match),
    }),
  );
  assert.equal((html.match(/<details><summary>/g) || []).length, 6);
  assert.ok(html.includes("Start with Docker") && html.includes("For Python"));
  assert.ok(html.includes("Example App supports 1 assessed requirement"));
  assert.ok(
    !html.includes("worked at Google") && !html.includes("Start with Redis"),
  );
  const general = renderToStaticMarkup(
    React.createElement(ResumeFAQ, {
      resume,
      review: buildResumeReview(resume),
    }),
  );
  assert.ok(general.includes("Prepare to explain Example App"));
  assert.ok(!general.includes("Which required skills should I prioritize"));
});

test("Dashboard order is score, skill breakdown, skill priorities, visible resume details, FAQs", () => {
  const requirements = [
    r("Docker", "NOT_EVIDENCED"),
    r("Python", "PARTIAL"),
    r("Redis", "NOT_EVIDENCED", "preferred"),
  ];
  const calculation = calculateScore(requirements);
  const match = {
    scoringStatus: "available",
    requirements,
    score: calculation.score,
    calculation,
    matchedRequirements: [],
    partialRequirements: [requirements[1]],
    missingRequirements: [requirements[0], requirements[2]],
  };
  const html = render(result(match));
  const labels = [
    "match-gauge",
    "Skill match analysis",
    "Prioritized Skill Improvements",
    "Technical Skills",
    "Projects",
    "Experience",
    "Education",
    "Certifications",
    "Frequently asked questions",
  ];
  const positions = labels.map((label) =>
    html.indexOf(
      label === "Projects" ||
        label === "Experience" ||
        label === "Education" ||
        label === "Certifications"
        ? `<h3>${label}</h3>`
        : label,
    ),
  );
  assert.ok(positions.every((p) => p >= 0));
  assert.ok(positions.every((p, i) => i === 0 || p > positions[i - 1]));
});

test("Technical years qualifiers appear as partial skills without accepting unrelated citations", () => {
  const requirement = r("PostgreSQL", "PARTIAL", "required", "experience");
  requirement.support = [
    {
      id: "projects.0.technologies.0",
      section: "projects",
      field: "technologies",
      value: "Postgres",
      record: "Example App",
      evidence: "Example App Postgres",
    },
  ];
  assert.equal(isSkillRequirement(requirement), true);
  assert.equal(skillMatchGroups([requirement]).partialRequiredCount, 1);
  requirement.subject = "Java";
  assert.equal(isSkillRequirement(requirement), false);
});

test("Scored dashboard shows the exact formula, two skill columns, partial labels, preferences and evidence", () => {
  const requirements = [
    r("Python", "MATCHED"),
    r("Docker", "PARTIAL"),
    r("Java", "NOT_EVIDENCED"),
    r("Redis", "NOT_EVIDENCED", "preferred"),
    r("Work experience", "PARTIAL", "required", "experience"),
  ];
  const calculation = calculateScore(requirements);
  const match = publishJobMatch(
    {
      score: calculation.score,
      calculation,
      requirements,
      matchedRequirements: [requirements[0]],
      partialRequirements: [requirements[1], requirements[4]],
      missingRequirements: [requirements[2], requirements[3]],
    },
    detailed,
  );
  const html = render(result(match));
  assert.ok(html.includes("ATS-Style Match Score (Estimate)"));
  assert.ok(html.includes(`${match.score}%`));
  assert.ok(
    html.includes(
      `round(100 × ${calculation.earnedWeight} / ${calculation.totalWeight})`,
    ),
  );
  assert.equal((html.match(/class="match-column"/g) || []).length, 2);
  assert.ok(
    html.includes("1 of 3 required skills evidenced · 1 partially evidenced"),
  );
  assert.ok(
    html.includes("Preferred · weight 1") && html.includes("Partial evidence"),
  );
  assert.ok(html.includes("View supporting resume evidence"));
  assert.ok(
    html.includes("Experience, education &amp; other requirements (1)"),
  );
  assert.ok(
    html.indexOf("match-gauge") < html.indexOf("Profile &amp; contact"),
  );
  assert.ok(
    html.indexOf("Prioritized Skill Improvements") < html.indexOf("skill-grid"),
  );
  assert.ok(!html.includes("Required Skills</h4>"));
});

test("Vague JD and no explicit requirements produce a helpful state with no percentage or gauge", () => {
  const html = render(result(unscoredJobMatch()));
  assert.ok(
    html.includes("More JD detail needed") &&
      html.includes("general resume review"),
  );
  assert.ok(!html.includes("match-gauge") && !html.includes("0%"));
  assert.ok(html.includes("How to Improve Your Resume"));
});

test("Two-column classification never treats partial evidence as a full match and deduplicates subjects", () => {
  const groups = skillMatchGroups([
    r("Python", "MATCHED"),
    r("Python", "PARTIAL", "preferred"),
    r("Docker", "NOT_EVIDENCED"),
    r("Java", "MATCHED", "preferred"),
  ]);
  assert.equal(groups.requiredCount, 2);
  assert.equal(groups.matchedRequiredCount, 0);
  assert.equal(groups.partialRequiredCount, 1);
  assert.deepEqual(
    groups.matched.map((i) => i.subject),
    ["Java"],
  );
  assert.equal(groups.notEvidenced.length, 2);
});

test("Partial verification warnings remain visible and untrusted strings are escaped", () => {
  const data = result();
  data.evidenceValidation = { status: "partial" };
  data.analysisWarnings = [
    { code: "PARTIAL_EVIDENCE", message: "Unsupported claims omitted." },
  ];
  data.structuredResume = structuredClone(resume);
  data.structuredResume.basics.name = "<script>alert(1)</script>";
  const html = render(data);
  assert.ok(
    html.includes("Partial review · retained facts verified") &&
      html.includes("Unsupported claims omitted."),
  );
  assert.ok(!html.includes("<script>") && html.includes("&lt;script&gt;"));
});

test("Unscored comparisons display safe optional-suggestion warnings without showing a percentage", () => {
  const match = unscoredJobMatch();
  match.warnings = [
    {
      code: "JD_SUGGESTION_OMITTED",
      message: "An unsupported optional suggestion was excluded.",
    },
  ];
  const html = render(result(match));
  assert.ok(html.includes("An unsupported optional suggestion was excluded."));
  assert.ok(!html.includes("match-gauge"));
});

