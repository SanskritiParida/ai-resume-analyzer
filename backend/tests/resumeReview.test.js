const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assessJobDescription,
  publishJobMatch,
  unscoredJobMatch,
  buildResumeReview,
} = require("../resumeReview");
const {
  calculateScore,
  validateAndScore,
  resumeFacts,
} = require("../analyzeJobMatch");

const detailed =
  "We need a backend engineer to develop reliable web services and maintain data pipelines with our team. Required qualifications: Python, Java and Docker skills, demonstrated through documented projects and actual engineering contributions.";
const resume = () => ({
  basics: {
    name: "Test Student",
    email: "test@example.test",
    phone: null,
    location: null,
    links: [],
    evidence: "Test Student test@example.test",
  },
  skills: ["Python", "Java", "Docker"].map((name) => ({
    name,
    category: null,
    evidence: "Python Java Docker",
  })),
  education: [],
  experience: [],
  certifications: [],
  achievements: [],
  projects: [
    {
      name: "Test Pipeline",
      description: "Built Python pipelines.",
      technologies: ["Python"],
      evidence: "Test Pipeline Built Python pipelines.",
    },
  ],
});
const req = (subject, classification = "MATCHED", importance = "required") => ({
  id: subject,
  subject,
  kind: "skill",
  importance,
  classification,
  requirement: subject,
  support: [],
  reason: "Verified test reason",
});

test("Vague, padded and long single-subject JDs have no published percentage", () => {
  assert.equal(assessJobDescription("frontend role").detailed, false);
  assert.equal(
    assessJobDescription("frontend role" + " ".repeat(300)).detailed,
    false,
  );
  assert.equal(assessJobDescription(detailed).detailed, true);
  for (const [jd, requirements] of [
    ["frontend role", [req("React")]],
    [detailed, [req("Python")]],
    [detailed, [req("Postgres"), req("PostgreSQL"), req("Java")]],
  ]) {
    const published = publishJobMatch({ requirements }, jd);
    assert.equal(published.score, null);
    assert.equal(published.calculation, null);
    assert.equal(published.scoringStatus, "insufficient_detail");
  }
  assert.equal(unscoredJobMatch().score, null);
});

test("Comparable strong, partial and weak matches retain deterministic fixed scoring", () => {
  const scores = [];
  for (const status of ["MATCHED", "PARTIAL", "NOT_EVIDENCED"]) {
    const requirements = ["Python", "Java", "Docker"].map((s) =>
      req(s, status),
    );
    const calculation = calculateScore(requirements);
    const output = publishJobMatch(
      { score: calculation.score, calculation, requirements },
      detailed,
    );
    assert.equal(output.scoringStatus, "available");
    for (let i = 0; i < 5; i++)
      assert.deepEqual(calculateScore(requirements), calculation);
    scores.push(output.score);
  }
  assert.deepEqual(scores, [100, 50, 0]);
});

test("Narrow spelling aliases work, while misleading related technologies are rejected", () => {
  const value = resume();
  value.skills = [
    { name: "PostgreSQL", category: null, evidence: "PostgreSQL" },
  ];
  const candidate = {
    requirements: [
      {
        requirement: "Postgres required.",
        subject: "Postgres",
        kind: "skill",
        importance: "required",
        classification: "MATCHED",
        factIds: ["skills.0.name"],
      },
    ],
    suggestions: [],
  };
  assert.equal(
    validateAndScore(candidate, resumeFacts(value), "Postgres required.").score,
    100,
  );
  for (const [fact, subject] of [
    ["JavaScript", "Java"],
    ["React Native", "React"],
    ["Python is not used.", "Python"],
  ]) {
    value.skills = [{ name: fact, category: null, evidence: fact }];
    candidate.requirements[0] = {
      ...candidate.requirements[0],
      requirement: `${subject} required.`,
      subject,
    };
    assert.throws(
      () =>
        validateAndScore(candidate, resumeFacts(value), `${subject} required.`),
      (e) => e.code === "JD_EVIDENCE_VALIDATION_FAILED",
    );
  }
});

test("Aliases and repeated required/preferred requirements cannot earn double credit", () => {
  const value = resume();
  value.skills = [
    { name: "PostgreSQL", category: null, evidence: "PostgreSQL" },
  ];
  const jd = "Postgres required. PostgreSQL preferred.";
  const requirements = ["Postgres", "PostgreSQL"].map((subject, index) => ({
    requirement: `${subject} ${index ? "preferred" : "required"}.`,
    subject,
    kind: "skill",
    importance: index ? "preferred" : "required",
    classification: "MATCHED",
    factIds: ["skills.0.name"],
  }));
  assert.throws(
    () =>
      validateAndScore(
        { requirements, suggestions: [] },
        resumeFacts(value),
        jd,
      ),
    (e) => e.code === "JD_EVIDENCE_VALIDATION_FAILED",
  );
});

test("Resume-only feedback is personalized, grounded and uses placeholders instead of invented metrics", () => {
  const value = resume();
  const output = buildResumeReview(value);
  assert.ok(output.strengths.some((s) => s.text.includes("Test Pipeline")));
  assert.ok(
    output.recommendations.some((r) => r.title.includes("Test Pipeline")),
  );
  assert.ok(
    output.recommendations.some((r) => r.how.includes("[verified result]")),
  );
  assert.ok(!output.recommendations.some((r) => r.id.startsWith("jd-")));
  assert.ok(!Object.hasOwn(output, "score"));
  assert.equal(
    new Set(output.recommendations.map((r) => r.id)).size,
    output.recommendations.length,
  );
  for (const item of [...output.strengths, ...output.recommendations])
    if (item.evidence)
      assert.ok(
        JSON.stringify(value).includes(
          JSON.stringify(item.evidence).slice(1, -1),
        ),
      );
});

test("Missing major sections yield conditional guidance, not fabricated content", () => {
  const value = resume();
  value.projects = [];
  value.skills = [];
  value.basics.email = null;
  const output = buildResumeReview(value);
  assert.equal(output.strengths.length, 0);
  assert.ok(output.recommendations.some((r) => r.id === "examples"));
  assert.ok(output.recommendations.some((r) => r.id === "contact"));
  assert.ok(
    output.recommendations.some(
      (r) => r.id === "education" && r.how.includes("If relevant"),
    ),
  );
});

test("JD gaps have priority, no invented claims, and partial support remains partial", () => {
  const requirements = [
    req("Kubernetes", "NOT_EVIDENCED"),
    req("Python", "PARTIAL"),
    req("Redis", "NOT_EVIDENCED", "preferred"),
  ];
  const output = buildResumeReview(resume(), { requirements });
  const gaps = output.recommendations.filter((r) => r.id.startsWith("jd-"));
  assert.deepEqual(
    gaps.map((r) => r.priority),
    ["high", "medium", "medium"],
  );
  assert.match(gaps[0].how, /Otherwise build the capability first/);
  assert.match(gaps[1].title, /partial evidence/);
});

test("Existing truthful measurements do not trigger an unnecessary quantify suggestion", () => {
  const value = resume();
  value.projects[0].description =
    "Built Python pipelines processing 100 records.";
  assert.ok(
    !buildResumeReview(value).recommendations.some((r) => r.id === "impact"),
  );
});

test("Multiple missing skills are consolidated without repeated generic advice or new qualifications", () => {
  const requirements = ["Rust", "Kubernetes", "Terraform"].map((subject) =>
    req(subject, "NOT_EVIDENCED"),
  );
  const output = buildResumeReview(resume(), { requirements });
  const items = output.recommendations.filter((r) => r.id.startsWith("jd-"));
  assert.equal(items.length, 1);
  assert.match(items[0].title, /Rust, Kubernetes, Terraform/);
  assert.equal(items[0].priority, "high");
  assert.equal(items[0].evidence, null);
  assert.match(items[0].how, /genuinely possess/);
});

test("Skill advice uses verified importance, keeps partial medium and optional tools low", () => {
  const requirements = [
    req("Kubernetes", "NOT_EVIDENCED"),
    req("Python", "PARTIAL"),
    req("Redis", "NOT_EVIDENCED", "preferred"),
    req("Git", "NOT_EVIDENCED", "preferred"),
    req("SQL", "MATCHED"),
  ];
  requirements[3].requirement = "Git is an optional tool.";
  const items = buildResumeReview(resume(), { requirements }).skillImprovements;
  assert.deepEqual(
    items.map((r) => r.priority),
    ["high", "medium", "medium", "low"],
  );
  assert.deepEqual(
    items.map((r) => r.title),
    ["Kubernetes", "Python", "Redis", "Git"],
  );
  assert.match(items[1].how, /Document genuine use/);
  assert.doesNotMatch(items[1].how, /learn|build the capability/i);
  assert.match(items[0].how, /If you already use Kubernetes/);
  assert.match(items[3].why, /Git is an optional tool/);
  assert.deepEqual(buildResumeReview(resume()).skillImprovements, []);
});

test("Technical experience qualifiers remain medium-priority partial evidence", () => {
  const requirement = req("Python", "PARTIAL", "required", "experience");
  requirement.requirement = "3+ years Python experience required.";
  const advice = buildResumeReview(resume(), {
    requirements: [requirement],
  }).skillImprovements;
  assert.equal(advice.length, 1);
  assert.equal(advice[0].priority, "medium");
  assert.match(advice[0].why, /3\+ years Python/);
  assert.match(
    advice[0].how,
    /do not claim unverified proficiency or duration/,
  );
});
