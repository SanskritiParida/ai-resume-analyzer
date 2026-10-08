const fs = require("node:fs/promises");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

// Preserve lines, paragraphs, tabs (potential table cells), and page boundaries.
function normalizeText(text) {
  return text.normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B\uFEFF]/g, "")
    // Deliberately remove control glyphs while preserving tab, LF, and form-feed.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000E-\u001F\u007F]/g, " ")
    .replace(/[^\S\n\t\f]+/g, " ")
    .replace(/ +$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function usefulLength(text) {
  return (text.match(/[\p{L}\p{N}]/gu) || []).length;
}

function assessExtractionQuality(text, pages, format, parserWarnings = []) {
  const usefulTextLength = usefulLength(text);
  const warnings = [...parserWarnings];
  // Text-usability thresholds, independent of the analyzer's 250-word advice.
  if (usefulTextLength < 80) {
    warnings.push({
      code: "INSUFFICIENT_TEXT",
      message: format === "pdf"
        ? "Too little useful embedded text was extracted. This PDF may be scanned/image-based or have inaccessible text. Please upload a text-based PDF; OCR is not enabled."
        : "Too little useful text was extracted from this DOCX. It may be empty or contain resume content as images. Please upload a document with selectable text.",
    });
  } else if (usefulTextLength < 300) {
    warnings.push({ code: "LOW_TEXT", message: "Only a small amount of useful text was extracted. Review the source; analysis may be incomplete." });
  }

  const sparsePages = pages.filter((page) => page.usefulTextLength < 40).map((page) => page.pageNumber);
  if (pages.length > 1 && sparsePages.length > 0 && usefulTextLength >= 80) {
    warnings.push({ code: "SPARSE_PAGES", message: `PDF pages ${sparsePages.join(", ")} contain little or no useful text. They may be blank, scanned, or poorly decoded; analysis may be incomplete.` });
  }

  const visibleLength = text.replace(/\s/g, "").length;
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  if (visibleLength > 0 && (replacementCount / visibleLength >= 0.02 ||
      (usefulTextLength >= 80 && usefulTextLength / visibleLength < 0.3))) {
    warnings.push({ code: "SUSPICIOUS_TEXT", message: "The extracted text contains many unreadable characters or unusually little readable content. Review it before relying on the analysis." });
  }

  return {
    usefulTextLength,
    extractionQuality: usefulTextLength < 80 ? "insufficient" : warnings.length > 0 ? "suspicious" : "good",
    warnings,
  };
}

async function extractResumeText(filePath, format) {
  if (!["pdf", "docx"].includes(format)) {
    throw Object.assign(new Error("Only PDF and DOCX files are supported."), { code: "UNSUPPORTED_FILE" });
  }

  let text;
  let pages = [];
  let pageCount = null; // DOCX is reflowable; Mammoth does not determine rendered page count.
  let parser;
  const parserWarnings = [];
  try {
    const data = await fs.readFile(filePath);
    if (format === "pdf") {
      parser = new PDFParse({ data });
      const result = await parser.getText({ pageJoiner: "" });
      pages = result.pages.map((page) => {
        const pageText = normalizeText(page.text);
        return { pageNumber: page.num, text: pageText, usefulTextLength: usefulLength(pageText) };
      });
      pageCount = result.total;
      // Use page text, not the parser's concatenation with synthetic page-number markers.
      text = pages.map((page) => page.text).join("\n\n\f\n\n");
    } else {
      const result = await mammoth.extractRawText({ buffer: data });
      text = normalizeText(result.value);
      for (const warning of result.messages) {
        parserWarnings.push({ code: "DOCX_PARSER_WARNING", message: `DOCX parser: ${warning.message}` });
      }
    }
  } catch (error) {
    throw Object.assign(new Error(format === "pdf"
      ? "Could not extract text from this PDF. It may be corrupted or password-protected."
      : "Could not extract text from this DOCX. It may be corrupted or not a valid Word document.", { cause: error }),
    { code: format === "pdf" ? "PDF_EXTRACTION_FAILED" : "DOCX_EXTRACTION_FAILED" });
  } finally {
    if (parser) {
      await parser.destroy().catch((error) => console.error("PDF cleanup failed:", error));
    }
  }

  return {
    format,
    text,
    pages,
    pageCount,
    characterCount: text.length,
    readingOrder: "unverified",
    ...assessExtractionQuality(text, pages, format, parserWarnings),
  };
}

module.exports = { extractResumeText, normalizeText, assessExtractionQuality };
