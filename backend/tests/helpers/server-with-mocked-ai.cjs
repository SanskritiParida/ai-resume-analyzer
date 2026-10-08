// Only the provider boundary is stubbed. Production schema/evidence validation runs.
const ai = require("../../analyzeResume");
const real = ai.analyzeResume;
const empty = { basics: { name: null, email: null, phone: null, location: null, links: [], evidence: null }, skills: [], education: [], experience: [], projects: [], certifications: [], achievements: [] };
const client = { interactions: { create: async () => ({ status: "completed", output_text: JSON.stringify(empty) }) } };
ai.analyzeResume = (text, options) => real(text, { ...options, client });
const jobs = require("../../analyzeJobMatch");
const realJobMatch = jobs.analyzeJobMatch;
const jobClient = { interactions: { create: async () => ({ status: "completed", output_text: JSON.stringify({
  requirements: [{ requirement: "Python required.", subject: "Python", kind: "skill", importance: "required", classification: "NOT_EVIDENCED", factIds: [] }], suggestions: [],
}) }) } };
jobs.analyzeJobMatch = (resume, jd, options) => realJobMatch(resume, jd, { ...options, client: jobClient });
require("../../server");
