# scholarOS — Support

scholarOS is a research workbench for Anna: it reads papers, extracts text and
figures, formats references, and checks a manuscript before you submit it.

## Before you write in

- **A PDF came back with empty pages.** It is almost certainly a scan. scholarOS
  reports which pages had no extractable text; those need OCR before the text
  tools can use them.
- **A reference formatted oddly.** The audit names the fields that were missing.
  Metadata that was not in the source file is never invented — add it and re-run.
- **A tool says a file type is unsupported.** Supported inputs are PDF, DOCX,
  TXT, Markdown, LaTeX, BibTeX, and RIS.

## Reporting a bug

Please include:

1. What you did, in order.
2. What you expected.
3. What happened instead — the exact message if there is one.
4. The file that triggered it, if you can share it. If it is unpublished work,
   a two-page excerpt with the same structure is enough.

## Where to report

Open an issue at the support URL on the app's listing page.

## What is out of scope

scholarOS does not verify that a cited paper exists, does not check for
plagiarism, and does not know a specific journal's submission rules. The
compliance check applies fixed, published rules and says so in its output.
