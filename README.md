# scholarOS

A paper workbench for Anna: read, extract, cite, and ship manuscripts.

scholarOS turns a folder of PDFs into something you can submit. It runs as an
Anna App — a static interface plus a local Python tool process — so the
computational work never leaves your machine.

## What it does

**Read.** Upload a PDF and get page count, per-page character counts, and the
pages that came back empty because they are scans. DOCX, Markdown, and LaTeX
work too.

**Extract.** Render any page to PNG at the dpi you pick. Convert figures between
PNG, JPEG, WebP, and TIFF, capped to a maximum side. Merge PDFs in the order you
choose.

**Cite.** Paste BibTeX or RIS. scholarOS drops duplicates, names the metadata
that is missing, and formats the rest in APA 7, IEEE, or Nature style.

**Check.** Before you submit: figure and table numbering with gaps flagged,
in-text citations that point past the end of your reference list, numbers glued
to units, abbreviations you never defined, and absolutist claims worth
re-reading.

**Write.** Compose figure and table captions from a template, export to DOCX, and
send prose through your Anna model for translation, polishing, or review.

## Why it is built this way

Extraction, rendering, conversion, merging, citation formatting, and the
compliance check are plain functions over a file you already have. Shipping them
as a hosted service would mean uploading unpublished manuscripts to somebody
else's disk for no benefit. They run in-process instead.

## Status

Early access. The tool layer is complete and self-tested; the interface is being
ported. See [WORKFLOW.md](WORKFLOW.md) for the migration plan.

## Development

```bash
anna-app validate           # static checks
anna-app validate --strict  # + agent allowed_tools vs ui.host_api.agent.tools
anna-app dev                # local harness — opens http://127.0.0.1:5180/dev/<wid>?t=<dev-token>
```

## Links

- Support and bug reports: [docs/listing/support.md](docs/listing/support.md)
- Privacy policy: [docs/listing/privacy.md](docs/listing/privacy.md)
- Store listing copy and assets: [docs/listing/listing.md](docs/listing/listing.md)
