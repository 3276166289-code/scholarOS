"""paper-core Executa: offline reference formatting and submission checks.

No network, no model calls, stdlib only. Every rule here is deterministic;
anything that cannot be decided from the text is reported as "confirm", never guessed.
"""

from __future__ import annotations

import json
import os
import re
import sys

MANIFEST = {
    "name": "paper-core",
    "version": "0.1.0",
    "tools": [
        {
            "name": "references",
            "description": "Parse BibTeX/RIS, drop duplicates, report missing fields, optionally format in a style.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "BibTeX or RIS source."},
                    "style": {"type": "string", "enum": ["apa", "ieee", "nature", ""], "default": ""},
                },
                "required": ["text"],
                "additionalProperties": False,
            },
        },
        {
            "name": "compliance",
            "description": "Pre-submission check: figure/table numbering, citation numbers, unit spacing, undefined abbreviations.",
            "parameters": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
                "additionalProperties": False,
            },
        },
        {
            "name": "extract_text",
            "description": "Extract plain text from PDF, DOCX, TXT, Markdown or LaTeX.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path to the uploaded file."},
                    "max_chars": {"type": "integer", "default": 200000},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
        {
            "name": "parse_pdf",
            "description": "Report page count, per-page character counts and the extracted text of a PDF.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "max_pages": {"type": "integer", "default": 30},
                    "max_chars": {"type": "integer", "default": 200000},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
        {
            "name": "bib_parse",
            "description": "Parse BibTeX/RIS into structured records (type, key, fields) instead of a report.",
            "parameters": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
                "additionalProperties": False,
            },
        },
        {
            "name": "convert_docx",
            "description": "Write plain text to a .docx file and return its path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "out_dir": {"type": "string"},
                    "filename": {"type": "string", "default": "manuscript.docx"},
                },
                "required": ["text"],
                "additionalProperties": False,
            },
        },
        {
            "name": "docx_b64",
            "description": "Build a .docx from Markdown/plain text and return it as base64 bytes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "filename": {"type": "string", "default": "manuscript.docx"},
                },
                "required": ["text"],
                "additionalProperties": False,
            },
        },
        {
            "name": "render_page",
            "description": "Render one PDF page to PNG and return the image path and pixel size.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "page": {"type": "integer", "default": 1},
                    "dpi": {"type": "integer", "default": 150},
                    "out_dir": {"type": "string"},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
        {
            "name": "caption_compose",
            "description": "Draft a figure or table caption from a number and what it shows.",
            "parameters": {
                "type": "object",
                "properties": {
                    "number": {"type": "integer"},
                    "content": {"type": "string"},
                    "kind": {"type": "string", "enum": ["figure", "table"], "default": "figure"},
                    "note": {"type": "string", "default": ""},
                },
                "required": ["number", "content"],
                "additionalProperties": False,
            },
        },
        {
            "name": "image_convert",
            "description": "Convert an image between PNG/JPEG/WebP/TIFF, optionally capping the long side.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "target_format": {"type": "string", "enum": ["png", "jpeg", "webp", "tiff"], "default": "png"},
                    "out_dir": {"type": "string"},
                    "max_side": {"type": "integer", "default": 0},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
        {
            "name": "merge_pdf",
            "description": "Concatenate PDFs in the given order.",
            "parameters": {
                "type": "object",
                "properties": {
                    "paths": {"type": "array", "items": {"type": "string"}},
                    "out_name": {"type": "string", "default": "merged.pdf"},
                    "out_dir": {"type": "string"},
                },
                "required": ["paths"],
                "additionalProperties": False,
            },
        },
        {
            "name": "cite_format",
            "description": "Format BibTeX/RIS entries in APA 7, IEEE or Nature style.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "style": {"type": "string", "enum": ["apa", "ieee", "nature"]},
                },
                "required": ["text", "style"],
                "additionalProperties": False,
            },
        },
    ],
}

STYLE_NAMES = {"apa": "APA 7", "ieee": "IEEE", "nature": "Nature"}

FIGURE = re.compile(r"(?:图|Fig(?:ure)?\.?)\s*(\d+)", re.I)
TABLE = re.compile(r"(?:表|Table)\s*(\d+)", re.I)
INLINE_CITE = re.compile(r"\[(\d+(?:\s*[,，–-]\s*\d+)*)\]")
UNIT_GAP = re.compile(
    r"(?<![A-Za-z0-9.．])(\d+(?:[.,]\d+)?)(mAh|mV|mA|nA|μA|uA|nm|μm|um|mm|cm|mg|kg|mol|min|h)\b"
)
ABSOLUTE = re.compile(r"(首次|证明了|毫无疑问|彻底解决|完全一致|必然|definitively proven|undoubtedly|conclusively)")
DOI = re.compile(r"10\.\d{4,9}/[^\s}\"<>]+", re.I)


# ---------------------------------------------------------------- parsing
def _authors(entry: str, ris: bool) -> str:
    if ris:
        names = re.findall(r"^AU\s+-\s*(.+)$", entry, re.M)
        return " and ".join(name.strip() for name in names)
    for pattern in (r"author\s*=\s*\{(.*?)\}", r'author\s*=\s*"([^"]*)"', r"author\s*=\s*([^,\n]+)"):
        match = re.search(pattern, entry, re.S | re.I)
        if match:
            return re.sub(r"\s+", " ", match.group(1)).strip()
    return ""


def _people(value: str) -> list[tuple[str, str]]:
    people = []
    for item in re.split(r"\s+and\s+|;\s*", value or ""):
        item = item.strip("{} ,")
        if not item:
            continue
        if "," in item:
            surname, given = item.split(",", 1)
        else:
            bits = item.split()
            if len(bits) < 2:
                people.append((item, ""))
                continue
            surname, given = bits[-1], " ".join(bits[:-1])
        initials = "".join(word[0] for word in re.findall(r"[A-Za-z]+", given)).upper()
        people.append((surname.strip(), initials))
    return people


def _field(data: dict, *keys: str) -> str:
    for key in keys:
        raw = (data.get(key) or "").strip()
        if raw:
            return raw.strip("{}\",' ").strip()
    return ""


def _split_entries(text: str) -> tuple[list[str], bool, str]:
    if re.search(r"^TY\s+-", text, re.M):
        parts = [part.strip() + "\nER  -" for part in re.split(r"^ER\s+-?\s*$", text, flags=re.M) if part.strip()]
        return parts, True, "DO"
    starts = list(re.finditer(r"@\w+\s*\{\s*([^,]+),", text))
    if not starts:
        raise ValueError("No BibTeX or RIS entries found.")
    entries = [
        text[match.start() : starts[i + 1].start() if i + 1 < len(starts) else len(text)].strip()
        for i, match in enumerate(starts)
    ]
    return entries, False, "doi"


def _fields(entry: str, ris: bool) -> dict:
    if ris:
        return {m[0]: m[1].strip() for m in re.findall(r"^([A-Z0-9]{2})\s+-\s*(.+)$", entry, re.M)}
    # BibTeX fields may sit on one line, span lines, or nest one level of braces.
    field = re.compile(r"(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|\"[^\"]*\"|[^,\n}]+)", re.S)
    return {m.group(1).lower(): m.group(2).strip().strip('{}" ').strip() for m in field.finditer(entry)}


# ---------------------------------------------------------------- formatting
def _init(initials: str) -> str:
    """APA/IEEE/Nature all want a period after initials."""
    return f"{initials}." if initials else ""


def _names_apa(people: list[tuple[str, str]]) -> str:
    if not people:
        return ""
    one = lambda p: f"{p[0]}, {_init(p[1])}".strip()  # noqa: E731
    if len(people) == 1:
        return one(people[0])
    return ", ".join([one(p) for p in people[:-1]] + [f"& {one(people[-1])}"])


def _names_ieee(people: list[tuple[str, str]]) -> str:
    if not people:
        return ""
    one = lambda p: f"{_init(p[1])} {p[0]}".strip()  # noqa: E731
    if len(people) == 1:
        return one(people[0])
    return ", ".join([one(p) for p in people[:-1]]) + f", and {one(people[-1])}"


def _names_nature(people: list[tuple[str, str]]) -> str:
    if not people:
        return ""
    one = lambda p: f"{p[0]}, {_init(p[1])}".strip()  # noqa: E731
    if len(people) == 1:
        return one(people[0])
    return ", ".join([one(p) for p in people[:-1]]) + f" & {one(people[-1])}"


def _format_one(index: int, entry: str, data: dict, ris: bool, style: str) -> str:
    title = _field(data, "title", "TI").rstrip(".")
    journal = _field(data, "journal", "journaltitle", "JO", "T2")
    year = _field(data, "year", "PY")
    volume = _field(data, "volume", "VL")
    issue = _field(data, "number", "IS")
    pages = _field(data, "pages", "SP")
    tail = _field(data, "EP")
    if ris and pages and tail and tail != pages:
        pages += "-" + tail
    doi = _field(data, "doi", "DO")
    people = _people(_authors(entry, ris))

    if not (title and journal and year and people):
        excerpt = " ".join(entry.split())[:120]
        return f"{index}. Metadata incomplete, entry kept as-is: {excerpt}"

    if style == "apa":
        names = _names_apa(people)
        source = journal + (f", {volume}" if volume else "") + (f"({issue})" if issue else "")
        source += f", {pages}" if pages else ""
        line = f"{names} ({year}). {title}. {source}."
        return f"{line} https://doi.org/{doi}" if doi else line

    if style == "ieee":
        names = _names_ieee(people)
        source = journal + (f", vol. {volume}" if volume else "") + (f", no. {issue}" if issue else "")
        source += f", pp. {pages}" if pages else ""
        line = f'[{index}] {names}, "{title}," {source}, {year}.'
        return f"{line} doi: {doi}" if doi else line

    names = _names_nature(people)
    source = journal + (f" {volume}" if volume else "") + (f", {pages}" if pages else "") + f" ({year})."
    line = f"{names}. {title}. {source}"
    return f"{line} doi:{doi}" if doi else line


def cite_format(text: str, style: str) -> str:
    if style not in STYLE_NAMES:
        raise ValueError(f"Unknown style: {style}. Use one of {', '.join(STYLE_NAMES)}.")
    entries, ris, _ = _split_entries(text)
    return "\n\n".join(
        _format_one(i, entry, _fields(entry, ris), ris, style) for i, entry in enumerate(entries, 1)
    )


# ---------------------------------------------------------------- audit
def references(text: str, style: str = "") -> str:
    entries, ris, doi_field = _split_entries(text)
    required = ("TI", "AU", "PY") if ris else ("title", "author", "year")
    seen: set[str] = set()
    kept: list[str] = []
    warnings: list[str] = []

    for i, entry in enumerate(entries, 1):
        data = _fields(entry, ris)
        doi = DOI.search(data.get(doi_field, ""))
        key = (
            doi.group(0).lower().rstrip(",")
            if doi
            else re.sub(r"\s+", "", data.get("title") or data.get("TI") or entry).casefold()
        )
        if key in seen:
            warnings.append(f"Entry {i} duplicates an earlier one and was merged.")
            continue
        seen.add(key)
        kept.append(entry)
        missing = [field for field in required if not data.get(field)]
        if missing:
            warnings.append(f"Entry {i} is missing: {', '.join(missing)}")

    report = (
        f"# Reference audit\n\nRead {len(entries)}, kept {len(kept)}.\n\n"
        + ("\n".join("- " + line for line in warnings) or "No duplicates or missing fields found.")
    )
    if style:
        report += f"\n\n## {STYLE_NAMES[style]} style\n\n" + cite_format("\n\n".join(kept), style)
    report += (
        "\n\n```\n" + "\n\n".join(kept) + "\n```\n\n"
        "This checks format and fields. It does not verify that the papers exist."
    )
    return report


def compliance(text: str) -> str:
    cjk = len(re.findall(r"[\u4e00-\u9fff]", text))
    words = len(re.findall(r"\b[A-Za-z][A-Za-z'\-]*\b", text))
    paragraphs = [part for part in re.split(r"\n\s*\n", text) if part.strip()]
    issues: list[str] = []
    notes: list[str] = []
    counts: list[str] = []

    for label, pattern in (("Figures", FIGURE), ("Tables", TABLE)):
        numbers = sorted({int(value) for value in pattern.findall(text)})
        counts.append(f"{len(numbers)} {label.lower()}")
        missing = [n for n in range(1, (numbers[-1] if numbers else 0) + 1) if n not in numbers]
        if missing:
            issues.append(f"{label} are not numbered consecutively; missing {', '.join(map(str, missing[:5]))}.")

    body = re.sub(r"^[ \t]*\[\d+\]", "", text, flags=re.M)
    cited: set[int] = set()
    for group in INLINE_CITE.findall(body):
        for part in re.split(r"[,，]", group):
            bounds = re.split(r"[–-]", part.strip())
            try:
                if len(bounds) == 2:
                    cited.update(range(int(bounds[0]), int(bounds[1]) + 1))
                else:
                    cited.add(int(bounds[0]))
            except ValueError:
                pass

    listed = sorted({int(n) for n in re.findall(r"^\s*\[(\d+)\]", text, re.M)})
    if listed and cited:
        beyond = sorted(n for n in cited if n > len(listed))
        if beyond:
            issues.append(
                f"In-text citations exceed the reference list: {', '.join(map(str, beyond[:5]))} has no entry."
            )
        unused = [n for n in listed if n not in cited]
        if unused:
            notes.append(f"{len(unused)} references are never cited: {', '.join(map(str, unused[:8]))}.")
    elif cited:
        notes.append("Found [n] citations but no numbered reference list; ignore if the journal uses author-year.")

    gaps = UNIT_GAP.findall(text)
    if gaps:
        joined = ", ".join(number + unit for number, unit in gaps[:3])
        issues.append(f"{len(gaps)} number/unit pairs are missing a space: {joined}.")
    if cjk and "（" in text and re.search(r"(?<![A-Za-z0-9])\(", text):
        notes.append("Full-width and half-width parentheses are mixed.")
    absolutes = list(dict.fromkeys(ABSOLUTE.findall(text)))
    if absolutes:
        notes.append(f"Absolute claims: {', '.join(absolutes[:6])} (support them or soften the wording).")
    frequent = [name for name in set(re.findall(r"\b[A-Z]{2,6}\b", text)) if text.count(name) >= 2]
    undefined = [
        name
        for name in frequent
        if not re.search(r"[（(][^）)\n]{0,40}" + re.escape(name) + r"[^）)\n]{0,40}[）)]", text)
    ]
    if undefined:
        notes.append(f"Abbreviations used more than once but never defined: {', '.join(undefined[:6])}.")
    long_paragraphs = [str(i) for i, part in enumerate(paragraphs, 1) if len(part) > 1500]
    if long_paragraphs:
        notes.append(f"Paragraphs over 1500 characters: {', '.join(long_paragraphs[:5])}.")

    head = (
        f"# Pre-submission check\n\n**Length**: {words} English words · {cjk} CJK characters · "
        f"{len(paragraphs)} paragraphs\n\n**Floats**: {' · '.join(counts)}\n\n"
        f"**References**: {len(listed)}"
    )
    if cited:
        head += f" · cited up to [{max(cited)}]"
    head += "\n\n## Must fix\n\n" + ("\n".join("- " + line for line in issues) if issues else "Nothing hard failed.")
    head += "\n\n## Confirm\n\n" + ("\n".join("- " + line for line in notes) if notes else "None.")
    return head + (
        "\n\nThese are fixed rules over length, numbering, citations and common formatting. "
        "No plagiarism check, no judgement about a specific journal's requirements."
    )


# ---------------------------------------------------------------- files
def _cap(text: str, limit: int) -> tuple[str, bool]:
    if len(text) <= limit:
        return text, False
    return text[:limit], True


def extract_text(path: str, max_chars: int = 200000) -> str:
    suffix = path.lower().rsplit(".", 1)[-1]
    if suffix == "pdf":
        return parse_pdf(path, max_pages=10_000, max_chars=max_chars)["text"]
    if suffix == "docx":
        from docx import Document

        paragraphs = [p.text for p in Document(path).paragraphs]
        text, cut = _cap("\n".join(paragraphs), max_chars)
        return text + ("\n\n[truncated]" if cut else "")
    if suffix in {"txt", "md", "markdown", "tex", "bib", "bibtex", "ris", "csv"}:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw = fh.read()
        except UnicodeDecodeError:
            with open(path, "r", encoding="latin-1") as fh:
                raw = fh.read()
        text, cut = _cap(raw, max_chars)
        return text + ("\n\n[truncated]" if cut else "")
    raise ValueError(f"Unsupported file type: .{suffix}. Use PDF, DOCX, TXT, Markdown or LaTeX.")


def parse_pdf(path: str, max_pages: int = 30, max_chars: int = 200000) -> dict:
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(path) as pdf:
        total = len(pdf.pages)
        for page in pdf.pages[: min(total, max_pages)]:
            pages.append(page.extract_text() or "")
    joined, cut = _cap("\n\n".join(pages), max_chars)
    return {
        "text": joined + ("\n\n[truncated]" if cut else ""),
        "pages_total": total,
        "pages_read": len(pages),
        "chars": [len(p) for p in pages],
        "empty_pages": [i + 1 for i, p in enumerate(pages) if not p.strip()],
    }


# ---------------------------------------------------------------- files
def _out_dir(out_dir: str) -> str:
    import tempfile

    target = out_dir or tempfile.mkdtemp(prefix="scholaros-")
    os.makedirs(target, exist_ok=True)
    return target


def bib_parse(text: str) -> str:
    entries, ris, _ = _split_entries(text)
    records = []
    for index, entry in enumerate(entries, 1):
        data = _fields(entry, ris)
        kind = re.match(r"@(\w+)", entry)
        key = re.match(r"@\w+\s*\{\s*([^,]+),", entry)
        records.append(
            {
                "index": index,
                "type": (kind.group(1).lower() if kind else "ris"),
                "key": (key.group(1).strip() if key else ""),
                "fields": data,
                "missing": [f for f in ("title", "author", "year") if not _field(data, f, f.upper())],
            }
        )
    return json.dumps({"count": len(records), "records": records}, ensure_ascii=False)


def _docx_document(text: str):
    from docx import Document

    document = Document()
    for block in re.split(r"\n\s*\n", text):
        block = block.strip()
        if not block:
            continue
        if block.startswith("#"):
            document.add_heading(block.lstrip("#").strip(), level=1)
        else:
            document.add_paragraph(block)
    return document


def convert_docx(text: str, out_dir: str = "", filename: str = "manuscript.docx") -> str:
    document = _docx_document(text)
    path = os.path.join(_out_dir(out_dir), filename)
    document.save(path)
    return json.dumps({"path": path, "paragraphs": len(document.paragraphs)})


def docx_b64(text: str, filename: str = "manuscript.docx") -> str:
    """DOCX as base64 — the app ships as a browser bundle, so a written path is unreachable."""
    import base64
    import io

    document = _docx_document(text)
    buffer = io.BytesIO()
    document.save(buffer)
    return json.dumps(
        {
            "filename": filename,
            "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "b64": base64.b64encode(buffer.getvalue()).decode("ascii"),
            "paragraphs": len(document.paragraphs),
        }
    )


def render_page(path: str, page: int = 1, dpi: int = 150, out_dir: str = "") -> str:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(path)
    if not 1 <= page <= len(pdf):
        raise ValueError(f"Page {page} is out of range; this PDF has {len(pdf)} page(s).")
    image = pdf[page - 1].render(scale=dpi / 72).to_pil()
    target = os.path.join(_out_dir(out_dir), f"page-{page}.png")
    image.save(target)
    return json.dumps({"path": target, "width": image.width, "height": image.height, "dpi": dpi})


def caption_compose(number: int, content: str, kind: str = "figure", note: str = "") -> str:
    if number < 1:
        raise ValueError("Figure/table numbers start at 1.")
    label = "Figure" if kind == "figure" else "Table"
    body = content.strip().rstrip(".")
    if not body:
        raise ValueError("Describe what the item shows.")
    body = body[0].upper() + body[1:]
    line = f"{label} {number}. {body}."
    if note.strip():
        extra = note.strip().rstrip(".")
        line += " " + extra[0].upper() + extra[1:] + "."
    return line


def image_convert(path: str, target_format: str = "png", out_dir: str = "", max_side: int = 0) -> str:
    from PIL import Image, ImageOps

    fmt = target_format.lower().lstrip(".")
    if fmt not in {"png", "jpeg", "jpg", "webp", "tiff"}:
        raise ValueError(f"Unsupported target format: {target_format}. Use PNG, JPEG, WebP or TIFF.")
    image = ImageOps.exif_transpose(Image.open(path))
    if max_side and max(image.size) > max_side:
        image.thumbnail((max_side, max_side))
    if fmt in {"jpeg", "jpg"} and image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    suffix = "jpg" if fmt == "jpg" else fmt
    base = os.path.splitext(os.path.basename(path))[0]
    target = os.path.join(_out_dir(out_dir), f"{base}.{suffix}")
    image.save(target, format=("JPEG" if suffix == "jpg" else suffix.upper()))
    return json.dumps({"path": target, "width": image.width, "height": image.height, "format": suffix})


def merge_pdf(paths: list[str], out_name: str = "merged.pdf", out_dir: str = "") -> str:
    from pypdf import PdfWriter

    if not paths:
        raise ValueError("Give at least one PDF path to merge.")
    writer = PdfWriter()
    for path in paths:
        writer.append(path)
    target = os.path.join(_out_dir(out_dir), out_name)
    with open(target, "wb") as fh:
        writer.write(fh)
    return json.dumps({"path": target, "pages": len(writer.pages), "sources": len(paths)})


# ---------------------------------------------------------------- rpc
TOOLS = {
    "references": lambda a: references(a["text"], a.get("style", "")),
    "compliance": lambda a: compliance(a["text"]),
    "cite_format": lambda a: cite_format(a["text"], a["style"]),
    "extract_text": lambda a: extract_text(a["path"], a.get("max_chars", 200000)),
    "parse_pdf": lambda a: json.dumps(parse_pdf(a["path"], a.get("max_pages", 30), a.get("max_chars", 200000))),
    "bib_parse": lambda a: bib_parse(a["text"]),
    "convert_docx": lambda a: convert_docx(a["text"], a.get("out_dir", ""), a.get("filename", "manuscript.docx")),
    "docx_b64": lambda a: docx_b64(a["text"], a.get("filename", "manuscript.docx")),
    "render_page": lambda a: render_page(a["path"], a.get("page", 1), a.get("dpi", 150), a.get("out_dir", "")),
    "caption_compose": lambda a: caption_compose(a["number"], a["content"], a.get("kind", "figure"), a.get("note", "")),
    "image_convert": lambda a: image_convert(a["path"], a.get("target_format", "png"), a.get("out_dir", ""), a.get("max_side", 0)),
    "merge_pdf": lambda a: merge_pdf(a["paths"], a.get("out_name", "merged.pdf"), a.get("out_dir", "")),
}


def invoke(tool: str, args: dict) -> dict:
    handler = TOOLS.get(tool)
    if handler is None:
        return {"success": False, "error": f"unknown tool: {tool}"}
    try:
        return {"success": True, "data": {"text": handler(args)}}
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller, never a stack trace
        return {"success": False, "error": str(exc)}


def main() -> None:
    if "--self-test" in sys.argv:
        _self_test()
        return

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            method = request.get("method")
            if method == "initialize":
                result = {
                    "protocolVersion": "2.0",
                    "server_info": {
                        "name": MANIFEST.get("display_name", "paper-core"),
                        "version": MANIFEST.get("version", "0.1.0"),
                    },
                    "capabilities": {},
                }
            elif method == "describe":
                result = MANIFEST
            elif method == "health":
                result = {"status": "ready"}
            elif method == "invoke":
                params = request["params"]
                result = invoke(params["tool"], params.get("arguments", {}))
            else:
                raise ValueError(f"unknown rpc: {method}")
            sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": request.get("id"), "result": result}) + "\n")
        except Exception as exc:  # noqa: BLE001
            sys.stdout.write(
                json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32601, "message": str(exc)}})
                + "\n"
            )
        sys.stdout.flush()


# ---------------------------------------------------------------- self-check
_APA_BIB = """@article{zhang2023,
  author = {Zhang, Wei and Li, Ming},
  title = {Sodium layered oxides for fast charging},
  journal = {Nature Energy},
  year = {2023},
  volume = {8},
  number = {4},
  pages = {301-312},
  doi = {10.1038/s41560-023-01234-5}
}"""

_IEEE_BIB = """@article{doe2021,
  author = {Doe, Jane},
  title = {A single author paper},
  journal = {J. Power Sources},
  year = {2021},
  volume = {480},
  pages = {229-236}
}"""


def _self_test() -> None:
    apa = cite_format(_APA_BIB, "apa")
    assert "Zhang, W." in apa, apa
    assert "(2023)." in apa, apa
    assert "Nature Energy, 8(4), 301-312" in apa, apa
    assert "https://doi.org/10.1038/s41560-023-01234-5" in apa, apa

    ieee = cite_format(_IEEE_BIB, "ieee")
    assert ieee.startswith("[1] J. Doe"), ieee
    assert 'vol. 480' in ieee and "2021." in ieee, ieee

    nature = cite_format(_APA_BIB, "nature")
    assert "&" in nature and "(2023)." in nature, nature

    # Regression: BibTeX on a single line must parse the same as a multi-line entry.
    one_line = "@article{x, author={Doe, Jane}, title={Sodium oxides}, journal={Nature Energy}, year={2024}, volume={9}, pages={1-9}}"
    single = cite_format(one_line, "apa")
    assert "Metadata incomplete" not in single, single
    assert "Nature Energy, 9" in single and "(2024)." in single, single

    audit = references(_APA_BIB + "\n\n" + _APA_BIB, "ieee")
    assert "Read 2, kept 1" in audit, audit
    assert "duplicates" in audit, audit

    report = compliance(
        "Figure 1 shows 10mAh capacity.\n\nAs shown in [3] and [4], the result is conclusive.\n\n[1] A\n[2] B"
    )
    assert "must fix" in report.lower() or "Must fix" in report, report
    assert "missing a space" in report, report
    assert "exceed the reference list" in report, report

    bad = invoke("nope", {})
    assert bad["success"] is False and "unknown tool" in bad["error"], bad

    broken = invoke("references", {"text": "nothing here"})
    assert broken["success"] is False and "No BibTeX" in broken["error"], broken

    # File path handling: plain text round-trips, unknown extensions fail loudly.
    import tempfile

    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as fh:
        fh.write("# Title\n\nBody with 10mAh.")
        sample = fh.name
    got = extract_text(sample, max_chars=5)
    assert got.startswith("# Tit") and "[truncated]" in got, got
    try:
        extract_text("whatever.xlsx")
    except ValueError as exc:
        assert "Unsupported file type" in str(exc), exc
    else:
        raise AssertionError("unsupported extension should raise")

    parsed = json.loads(bib_parse(_APA_BIB))
    assert parsed["count"] == 1 and parsed["records"][0]["key"] == "zhang2023", parsed
    assert parsed["records"][0]["fields"]["journal"] == "Nature Energy", parsed
    assert parsed["records"][0]["type"] == "article", parsed

    cap = caption_compose(3, "sodium layered oxide cathode after 100 cycles", "figure", "error bars are s.d.")
    assert cap == "Figure 3. Sodium layered oxide cathode after 100 cycles. Error bars are s.d.", cap
    assert caption_compose(1, "rate capability", "table").startswith("Table 1."), "table label"
    for bad in (lambda: caption_compose(0, "x"), lambda: caption_compose(1, "  ")):
        try:
            bad()
        except ValueError:
            pass
        else:
            raise AssertionError("caption_compose should reject empty or zero input")

    try:
        import docx  # noqa: F401
    except ImportError:
        pass
    else:
        made = json.loads(convert_docx("# Head\n\nBody text.", out_dir=_out_dir("")))
        assert made["paragraphs"] >= 1 and os.path.getsize(made["path"]) > 0, made
        # docx_b64 is the only lane the browser bundle can receive a document through
        packed = json.loads(docx_b64("# Head\n\nBody text."))
        assert packed["mime"].startswith("application/vnd") and len(packed["b64"]) > 600, packed.keys()

    print("paper-core self-test OK (cite/audit/compliance/extract/bib/caption/docx)")

if __name__ == "__main__":
    main()
