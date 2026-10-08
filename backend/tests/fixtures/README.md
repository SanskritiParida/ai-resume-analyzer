# Extraction fixtures

Run `npm test` from `backend/`. No AI or network API is used.

The eight supplied PDF/DOCX files are **synthetic source documents** with deliberately known content. `cases.json` lists the text fragments the real parsers must recover. Tests never return fabricated extraction results to production.

The source content and PDF geometry are in `generate.cjs`. Fixtures are already saved; regeneration is optional using `node tests/fixtures/generate.cjs` from `backend/`. That helper uses the project's existing frontend jsPDF and Mammoth's JSZip dependency; install both frontend and backend dependencies before regenerating. It rasterizes a source page solely to create the image-only test file, not to OCR uploaded resumes.

Coverage:

- `single-column.pdf`: ordinary lines and paragraphs.
- `two-column.pdf` and `multi-column.pdf`: two/three visual columns drawn row-by-row. Text survival is tested, **not correct column reading order**.
- `table.pdf`: a simple three-column table; cell strings must survive, but relationship reconstruction is not tested.
- `unusual-headings.pdf`: unconventional headings and reversed section order.
- `paragraphs-and-table.docx`: paragraphs plus a Word table. Page count is unknown, not guessed.
- `image-only.pdf`: a raster image of the single-column fixture with no embedded text; must stop analysis.
- `mixed-text-image.pdf`: a text page followed by an image-only page; must produce a visible partial-extraction warning.

These controlled fixtures are regression probes, **not proof of support for arbitrary real-world resumes**. PDF.js can emit content-stream order rather than the order a person reads the columns. Our extractor does not reorder it.

The supplied stored resume is also tested if it is present in `backend/uploads/1782455157014-resumetest.pdf`. Set `RESUME_SAMPLE_PATH` to test that same expected-content sample from another location. It is not copied into tracked fixtures. If absent, that one test is explicitly skipped.

## Additional real samples needed

Provide redacted versions of:

1. A normal one-page single-column PDF (the current supplied sample is three pages).
2. A two-column PDF, preferably from Word/Canva, with sidebar skills and dated experience.
3. A three-column or otherwise complex multi-column PDF.
4. A table-based PDF with related degree/institution/year and employer/title/date cells.
5. An unusual-heading/reordered-sections resume.
6. A real DOCX resume, including tables or text boxes if you use them.
7. A scanned/image-only PDF and, if available, one with both text and scanned pages.

For each sample, identify the exact sentences, technologies, employers/degrees, and dates that must survive, and the intended reading order. Add a `cases.json` entry with `file`, `format`, `fragments`, `provenance`, and optionally `quality`, then rerun the suite. Expected source fragments belong only in tests, not in extraction code. Avoid committing personal data.

## Quality thresholds

Useful text counts Unicode letters and numbers. Less than 80 is insufficient; 80–299 triggers a low-text warning. A multi-page PDF with a page below 40 useful characters triggers a sparse-page warning. At least 2% replacement glyphs, or a readable fraction below 30% with at least 80 useful characters, triggers an encoding/content warning. Parser warnings also mark extraction suspicious.

These are initial conservative sanity checks, unrelated to the analyzer's 250-word suggestion. They do not verify truth, detect all glyph corruption, infer section completeness, or prove reading order. A sparse page may be intentionally blank; it is a warning, not an assertion that it was scanned.
