require("./loadEnvironment").loadEnvironment();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { extractResumeText } = require("./extractResumeText");
const { analyzeResume, AIError } = require("./analyzeResume");
const {
  analyzeJobMatch,
  validateJobDescription,
} = require("./analyzeJobMatch");
const fs = require("node:fs");
const path = require("node:path");
const {
  assessJobDescription,
  unscoredJobMatch,
  publishJobMatch,
  buildResumeReview,
} = require("./resumeReview");

const roleSkills = {
  "frontend developer": ["react", "javascript", "html", "css", "git", "redux"],
  "backend developer": [
    "node",
    "express",
    "mongodb",
    "api",
    "sql",
    "javascript",
  ],
  "full stack developer": [
    "react",
    "node",
    "express",
    "mongodb",
    "javascript",
    "html",
    "css",
    "git",
  ],
  "software engineer": [
    "python",
    "c",
    "dsa",
    "arrays",
    "linked lists",
    "trees",
    "graphs",
  ],
  "python developer": ["python", "api", "sql", "flask", "django"],
  "java developer": ["java", "oops", "collections", "jdbc", "sql"],
  "ai engineer": [
    "python",
    "machine learning",
    "tensorflow",
    "pandas",
    "numpy",
  ],
};

const skillSuggestions = {
  react: "Build at least one React project and mention it in your resume.",
  javascript: "Add JavaScript projects demonstrating DOM and ES6 concepts.",
  html: "Highlight responsive HTML layouts and forms.",
  css: "Showcase modern CSS projects with Flexbox and Grid.",
  git: "Mention Git and GitHub usage in projects.",
  redux: "Learn Redux for advanced React state management.",
  node: "Build backend APIs using Node.js and Express.",
  express: "Mention Express.js projects and REST APIs.",
  mongodb: "Add database projects using MongoDB.",
  sql: "Include SQL queries and database experience.",
};

const app = express();
// Keep the existing Express routes behind Vercel's same-origin /api prefix.
app.use((req, res, next) => {
  if (process.env.VERCEL && req.url.startsWith("/api/"))
    req.url = req.url.slice(4);
  next();
});
app.use(cors());

const uploadDirectory = process.env.VERCEL
  ? path.join(require("node:os").tmpdir(), "resumelens-uploads")
  : path.join(__dirname, "uploads");
// Leave room for multipart fields under Vercel's 4.5 MB request limit.
const maxFileMB = process.env.VERCEL ? 4 : 5;
const maxFileBytes = maxFileMB * 1024 * 1024;
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDirectory);
  },
  filename: function (req, file, cb) {
    cb(
      null,
      require("node:crypto").randomUUID() +
        path.extname(file.originalname).toLowerCase(),
    );
  },
});

const upload = multer({
  storage,
  // Busboy flags a file at the limit, so allow one byte for an inclusive maximum.
  limits: { fileSize: maxFileBytes + 1, fieldSize: 60000, fields: 4 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const expectedMime = {
      ".pdf": "application/pdf",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    if (
      !Object.hasOwn(expectedMime, extension) ||
      file.mimetype !== expectedMime[extension]
    ) {
      return cb(new Error("Only PDF and DOCX files are supported."));
    }
    cb(null, true);
  },
});

app.get("/", (req, res) => {
  res.send("Backend Running");
});

app.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    status: "ok",
    aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
  });
});

app.post(
  "/upload-resume",
  (req, res, next) => {
    upload.single("resume")(req, res, (error) => {
      if (error) {
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        const unsupported =
          error.message === "Only PDF and DOCX files are supported.";
        if (
          error.code === "LIMIT_FIELD_VALUE" &&
          error.field === "jobDescription"
        ) {
          return res.status(413).json({
            code: "JOB_DESCRIPTION_TOO_LONG",
            message: "Job description must be 12,000 characters or fewer.",
          });
        }
        return res
          .status(
            tooLarge
              ? 413
              : unsupported
                ? 415
                : error instanceof multer.MulterError
                  ? 400
                  : 500,
          )
          .json({
            code: tooLarge
              ? "FILE_TOO_LARGE"
              : unsupported
                ? "UNSUPPORTED_FILE"
                : "UPLOAD_FAILED",
            message: tooLarge
              ? `Resume must be ${maxFileMB} MB or smaller.`
              : unsupported
                ? error.message
                : "Resume upload failed. Please try again.",
          });
      }
      next();
    });
  },
  async (req, res) => {
    let stage = "extraction";
    const cancellation =
      typeof res.once === "function" ? new AbortController() : null;
    const onDisconnect = () => {
      if (!res.writableEnded) cancellation?.abort();
    };
    res.once?.("close", onDisconnect);
    const started = Date.now();
    const timing = (step, since, phase = "end") => {
      if (
        process.env.NODE_ENV !== "production" &&
        process.env.DEV_ANALYSIS_TIMING === "true"
      )
        console.log(
          JSON.stringify({ stage: step, phase, elapsedMs: Date.now() - since }),
        );
    };
    try {
      if (!req.file) {
        return res.status(400).json({
          code: "MISSING_FILE",
          message: "Please upload a PDF or DOCX resume.",
        });
      }
      if (req.file.size > maxFileBytes) {
        return res.status(413).json({
          code: "FILE_TOO_LARGE",
          message: `Resume must be ${maxFileMB} MB or smaller.`,
        });
      }

      stage = "job_validation";
      if (
        req.body.analysisMode &&
        !["job", "role", "general"].includes(req.body.analysisMode)
      ) {
        throw new AIError(
          "INVALID_ANALYSIS_MODE",
          400,
          "Choose job-description analysis or the role demo.",
        );
      }
      const useJD =
        Object.hasOwn(req.body, "jobDescription") ||
        req.body.analysisMode === "job";
      const jobDescription = useJD
        ? validateJobDescription(req.body.jobDescription)
        : null;
      const role =
        typeof req.body.role === "string" ? req.body.role.toLowerCase() : "";
      if (
        !useJD &&
        (role || req.body.analysisMode === "role") &&
        !Object.hasOwn(roleSkills, role)
      ) {
        return res.status(400).json({ message: "Invalid role selected." });
      }

      stage = "extraction";
      const format = path.extname(req.file.originalname).slice(1).toLowerCase();
      const extractionStart = Date.now();
      timing("extraction", extractionStart, "start");
      const extracted = await extractResumeText(req.file.path, format);
      timing("extraction", extractionStart);
      const extraction = { ...extracted };
      delete extraction.text;
      delete extraction.pages;
      if (extraction.extractionQuality === "insufficient") {
        return res.status(422).json({
          code: "INSUFFICIENT_EXTRACTION",
          message: extraction.warnings.find(
            (warning) => warning.code === "INSUFFICIENT_TEXT",
          ).message,
          extraction,
        });
      }
      stage = "ai";
      let evidenceValidation = {
        status: "verified",
        correctedEvidenceCount: 0,
        omittedClaimCount: 0,
        omittedRecordCount: 0,
        issues: [],
        warnings: [],
      };
      const structuredResume = await analyzeResume(extracted.text, {
        signal: cancellation?.signal,
        extractionQuality: extracted.extractionQuality,
        onEvidenceValidation: (report) => {
          evidenceValidation = report;
        },
      });
      const analysisWarnings = evidenceValidation.warnings;
      if (useJD) {
        stage = "job_match";
        let jobMatch = unscoredJobMatch();
        if (assessJobDescription(jobDescription).detailed) {
          try {
            jobMatch = publishJobMatch(
              await analyzeJobMatch(structuredResume, jobDescription, {
                signal: cancellation?.signal,
              }),
              jobDescription,
            );
          } catch (error) {
            if (error.code !== "JD_NO_REQUIREMENTS") throw error;
            jobMatch = unscoredJobMatch(
              [],
              "No explicit, assessable requirements were found. Your general review is available; add concrete qualifications to receive a match estimate.",
            );
          }
        }
        return res.json({
          analysisMode: "job",
          jobMatch,
          structuredResume,
          extraction,
          evidenceValidation,
          analysisWarnings,
          resumeReview: buildResumeReview(
            structuredResume,
            jobMatch,
            extraction,
          ),
        });
      }
      if (!role || req.body.analysisMode === "general") {
        return res.json({
          analysisMode: "general",
          structuredResume,
          extraction,
          evidenceValidation,
          analysisWarnings,
          resumeReview: buildResumeReview(structuredResume, null, extraction),
        });
      }
      stage = "analysis";
      const requiredSkills = roleSkills[role];
      const resumeText = extracted.text.toLowerCase();

      const words = resumeText.split(/\s+/).filter((word) => word.length > 0);

      const wordCount = words.length;

      const certificationCount = (
        resumeText.match(/certification|certificate/g) || []
      ).length;

      const educationCount = (
        resumeText.match(/education|university|college|school/g) || []
      ).length;

      const skillsFound = requiredSkills.filter((skill) =>
        resumeText.includes(skill),
      );

      const missingSkills = requiredSkills.filter(
        (skill) => !resumeText.includes(skill),
      );

      const score =
        requiredSkills.length === 0
          ? 0
          : Math.round((skillsFound.length / requiredSkills.length) * 100);

      const skillCoverage = score;

      const completeness = {
        email: /\S+@\S+\.\S+/.test(resumeText),
        phone: /(\+91)?[6-9]\d{9}/.test(resumeText),
        github: resumeText.includes("github"),
        linkedin: resumeText.includes("linkedin"),
        education: educationCount > 0,
        skills: skillsFound.length > 0,
      };

      const completenessScore =
        Object.values(completeness).filter(Boolean).length;

      const completenessPercentage = Math.round((completenessScore / 6) * 100);

      const suggestions = [];

      if (missingSkills.length > 0) {
        suggestions.push(
          "Only include skills and experience you genuinely have; develop missing skills before claiming them.",
        );
      }

      if (score < 70) {
        suggestions.push(
          "Develop relevant projects and describe genuine experience to improve demo keyword coverage.",
        );
      }

      if (wordCount < 250) {
        suggestions.push(
          "Your resume appears short. Include more project details and achievements.",
        );
      }

      if (!resumeText.includes("github")) {
        suggestions.push(
          "Include your GitHub profile to showcase your technical projects.",
        );
      }

      if (!resumeText.includes("linkedin")) {
        suggestions.push(
          "Include your LinkedIn profile to improve recruiter visibility.",
        );
      }

      missingSkills.forEach((skill) => {
        if (skillSuggestions[skill]) {
          suggestions.push(skillSuggestions[skill]);
        }
      });

      const resumeTips = [
        "Quantify achievements only with truthful, verifiable results.",
        "Use strong action verbs like Built, Developed and Designed.",
        "Keep resume formatting clean and ATS friendly.",
        "Tailor your resume for every job role.",
        "Highlight technical projects with impact and outcomes.",
      ];

      const insights = [
        {
          question: `Why is my role keyword coverage ${score}%?`,
          answer: `Your resume matches ${skillsFound.length} out of ${requiredSkills.length} demo keywords for the ${role} role. This measures substring coverage, not job suitability.`,
        },
        {
          question: "What should I improve first?",
          answer:
            missingSkills.length > 0
              ? `Consider learning these skills; mention them only after genuine use: ${missingSkills.join(", ")}.`
              : "All demo keywords occur in the extracted text; this does not establish proficiency.",
        },
        {
          question: "How much of the demo keyword list is present?",
          answer:
            score >= 85
              ? "Most demo keywords are present. Actual requirements need separate review."
              : score >= 70
                ? "Many demo keywords are present; review an actual job description for context."
                : "Several demo keywords were not found; this does not determine whether you should apply.",
        },
        {
          question: "What are my strongest areas?",
          answer:
            skillsFound.length >= 5
              ? "Several demo keywords occur in the text; keyword presence does not establish proficiency."
              : "Strengthen your technical skills section by adding more relevant technologies.",
        },
        {
          question: "What does the word-count heuristic show?",
          answer:
            wordCount >= 300
              ? "The extracted text contains at least 300 words. Word count cannot predict recruiter interest."
              : "Your resume appears short. Adding more projects and achievements will improve its impact.",
        },
        {
          question: "How can I describe relevant experience clearly?",
          answer:
            "Describe technologies in projects or experience where you actually used them. Do not add unsupported skills.",
        },
        {
          question: "Does my resume contain enough technical keywords?",
          answer:
            skillCoverage >= 75
              ? "Yes. Your resume contains most of the important keywords for this role."
              : "Several important technical keywords are still missing.",
        },
        {
          question: "What should I do before applying?",
          answer:
            score >= 80
              ? "Proofread and compare your genuine experience with the actual job requirements before applying."
              : "Improve the missing skills, strengthen your projects and tailor your resume before applying.",
        },
      ];

      res.json({
        analysisMode: "role",
        role,
        score,
        skillsFound,
        missingSkills,
        suggestions,
        resumeTips,
        insights,
        extraction,
        structuredResume,
        evidenceValidation,
        analysisWarnings,
        statistics: {
          pageCount: extraction.pageCount,
          characterCount: extraction.characterCount,
          wordCount,
          certificationCount,
          educationCount,
          matchedSkills: skillsFound.length,
          missingSkills: missingSkills.length,
          totalRequiredSkills: requiredSkills.length,
          skillCoverage,
          completeness,
          completenessPercentage,
        },
      });
    } catch (error) {
      if (stage === "job_validation" || stage === "job_match") {
        const known = error instanceof AIError;
        console.error(
          "Job matching failed:",
          known ? error.code : "JD_INTERNAL_ERROR",
        );
        return res.status(known ? error.status : 500).json({
          code: known ? error.code : "JD_INTERNAL_ERROR",
          message: known
            ? error.message
            : "Job matching failed. Please try again.",
          stage,
        });
      }
      if (stage === "ai") {
        const known = error instanceof AIError;
        console.error(
          "Structured resume analysis failed:",
          known ? error.code : "AI_INTERNAL_ERROR",
        );
        return res.status(known ? error.status : 500).json({
          code: known ? error.code : "AI_INTERNAL_ERROR",
          stage: error.code?.includes("EVIDENCE")
            ? "resume_evidence"
            : /INVALID_RESPONSE|SCHEMA/.test(error.code || "")
              ? "resume_response"
              : "resume_model",
          message: known
            ? error.message
            : "Structured resume analysis failed. Please try again.",
        });
      }
      console.error(`${stage} failed:`, error.code || "INTERNAL_ERROR");

      res.status(stage === "extraction" ? 422 : 500).json({
        code:
          stage === "extraction"
            ? error.code || "EXTRACTION_FAILED"
            : "ANALYSIS_FAILED",
        message:
          stage === "extraction"
            ? error.message
            : "Resume text was extracted, but resume analysis failed. Please try again.",
      });
    } finally {
      res.removeListener?.("close", onDisconnect);
      timing("request_total", started);
      if (req.file) {
        await fs.promises
          .unlink(req.file.path)
          .catch((error) =>
            console.error(
              "Upload cleanup failed:",
              error.code || "CLEANUP_ERROR",
            ),
          );
      }
    }
  },
);

module.exports = app;

const PORT = process.env.PORT || 5000;

if (!process.env.VERCEL)
  app.listen(PORT, (error) => {
    // Express 5 passes bind failures to this callback, rather than throwing.
    if (error) {
      console.error(
        "Backend startup failed:",
        error.code || "LISTEN_FAILED",
        "port",
        PORT,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Server running on port ${PORT}`);
  });
