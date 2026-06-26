const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { PDFParse } = require("pdf-parse");

const roleSkills = {
  "frontend developer": ["react", "javascript", "html", "css", "git", "redux"],
  "backend developer": ["node", "express", "mongodb", "api", "sql", "javascript"],
  "full stack developer": ["react", "node", "express", "mongodb", "javascript", "html", "css", "git"],
  "software engineer": ["python", "c", "dsa", "arrays", "linked lists", "trees", "graphs"],
  "python developer": ["python", "api", "sql", "flask", "django"],
  "java developer": ["java", "oops", "collections", "jdbc", "sql"],
  "ai engineer": ["python", "machine learning", "tensorflow", "pandas", "numpy"],
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
app.use(cors());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

app.get("/", (req, res) => {
  res.send("Backend Running");
});

app.post("/upload-resume", upload.single("resume"), async (req, res) => {
  try {
    const parser = new PDFParse({
      url: req.file.path,
    });

    const pdfData = await parser.getText();

    const role = req.body.role.toLowerCase();
    const requiredSkills = roleSkills[role] || [];

    const resumeText = pdfData.text.toLowerCase();

    const words = resumeText
      .split(/\s+/)
      .filter((word) => word.length > 0);

    const wordCount = words.length;

    const certificationCount =
      (resumeText.match(/certification|certificate/g) || []).length;

    const educationCount =
      (resumeText.match(/education|university|college|school/g) || []).length;

    const skillsFound = requiredSkills.filter((skill) =>
      resumeText.includes(skill)
    );

    const missingSkills = requiredSkills.filter(
      (skill) => !resumeText.includes(skill)
    );

    const score =
      requiredSkills.length === 0
        ? 0
        : Math.round((skillsFound.length / requiredSkills.length) * 100);

    const skillCoverage =
      requiredSkills.length === 0
        ? 0
        : Math.round((skillsFound.length / requiredSkills.length) * 100);

    const completeness = {
      email: /\S+@\S+\.\S+/.test(resumeText),
      phone: /(\+91)?[6-9]\d{9}/.test(resumeText),
      github: resumeText.includes("github"),
      linkedin: resumeText.includes("linkedin"),
      education: educationCount > 0,
      skills: skillsFound.length > 0,
    };

    const completenessScore = Object.values(completeness).filter(Boolean).length;

    const completenessPercentage = Math.round((completenessScore / 6) * 100);

    const suggestions = [];

    if (missingSkills.length > 0) {
      suggestions.push(
        "Add the missing technical skills relevant to the selected role."
      );
    }

    if (score < 70) {
      suggestions.push(
        "Improve your ATS score by adding more role-specific projects and technical skills."
      );
    }

    if (wordCount < 250) {
      suggestions.push(
        "Your resume appears short. Include more project details and achievements."
      );
    }

    if (!resumeText.includes("github")) {
      suggestions.push(
        "Include your GitHub profile to showcase your technical projects."
      );
    }

    if (!resumeText.includes("linkedin")) {
      suggestions.push(
        "Include your LinkedIn profile to improve recruiter visibility."
      );
    }

    missingSkills.forEach((skill) => {
      if (skillSuggestions[skill]) {
        suggestions.push(skillSuggestions[skill]);
      }
    });

    const resumeTips = [
      "Quantify achievements using measurable results.",
      "Use strong action verbs like Built, Developed and Designed.",
      "Keep resume formatting clean and ATS friendly.",
      "Tailor your resume for every job role.",
      "Highlight technical projects with impact and outcomes.",
    ];

    const insights = [
      {
        question: `Why is my ATS Score ${score}%?`,
        answer: `Your resume matches ${skillsFound.length} out of ${requiredSkills.length} required skills for the ${role} role. Missing role-specific skills reduced your overall ATS score.`,
      },
      {
        question: "What should I improve first?",
        answer:
          missingSkills.length > 0
            ? `Focus on learning and adding these skills: ${missingSkills.join(", ")}.`
            : "Excellent! Your resume already contains all the required technical skills.",
      },
      {
        question: "Is my resume ready for this role?",
        answer:
          score >= 85
            ? "Yes. Your resume is strongly aligned with this role."
            : score >= 70
            ? "Your resume is a good match but can be improved further."
            : "Your resume needs additional role-specific skills before applying.",
      },
      {
        question: "What are my strongest areas?",
        answer:
          skillsFound.length >= 5
            ? "Your resume demonstrates a strong technical foundation with several relevant skills."
            : "Strengthen your technical skills section by adding more relevant technologies.",
      },
      {
        question: "Will recruiters notice my resume?",
        answer:
          wordCount >= 300
            ? "Yes. Your resume contains a good amount of technical content."
            : "Your resume appears short. Adding more projects and achievements will improve its impact.",
      },
      {
        question: "How can I improve my ATS score quickly?",
        answer:
          "Include the missing skills naturally inside your projects, experience and skills sections instead of only listing them.",
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
            ? "Review your resume once, proofread it carefully and start applying."
            : "Improve the missing skills, strengthen your projects and tailor your resume before applying.",
      },
    ];

    res.json({
      role,
      score,
      skillsFound,
      missingSkills,
      suggestions,
      resumeTips,
      insights,
      statistics: {
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
    console.log(error);

    res.status(500).json({
      message: "Error Reading PDF",
    });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});