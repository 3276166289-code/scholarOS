"""Replace Chinese literals and comments in bundle/ with their English entries.

Occurrence-based, not text-based: the file is re-scanned with the same regexes
that built scan.json, and only a literal whose *whole body* matches a dictionary
key is replaced. Delimiters, quotes in HTML attributes and multi-line template
literals therefore stay exactly as the parser expects — a global str.replace
breaks JS the moment a translation contains a quote or a newline.

Usage:  python tools/i18n-translate.py            # apply
        python tools/i18n-translate.py --dry      # report only
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "bundle"
DICT_DIR = ROOT / "docs" / "i18n"
SUFFIXES = {".js", ".html", ".css", ".mjs"}

CJK_CLASS = r"[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]"
CJK = re.compile(CJK_CLASS)
LITERAL = re.compile(r"'([^'\\\n]|\\.)*'|\"([^\"\\\n]|\\.)*\"|`([^`\\]|\\.)*`", re.S)
COMMENT = re.compile(r"(?://[^\n]*|/\*.*?\*/|<!--.*?-->|^[ \t]*#[^\n]*)", re.S | re.M)


def load_dict() -> dict[str, str]:
    merged: dict[str, str] = {}
    for path in sorted(DICT_DIR.glob("*.json")):
        if path.name == "scan.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            merged.update({k: v for k, v in data.items() if isinstance(v, str) and k})
    return merged


def shape(body: str, value: str) -> str:
    """Fit a translation to the delimiter it is about to land in."""
    if not body.startswith(("`", "'", '"')):
        return value  # comment: only the comment terminator matters
    if "\n" not in body:
        value = " ".join(value.split())
    if body.startswith("`"):
        return value.replace("`", "'")
    if body.startswith('"'):
        return value.replace('"', "\u201d")
    return value.replace("'", "\u2019")


def rewrite(text: str, table: dict[str, str]) -> tuple[str, int]:
    hits = 0
    out: list[str] = []
    index = 0
    for match in LITERAL.finditer(text):
        raw = match.group(0)
        if not CJK.search(raw):
            continue
        body = raw[1:-1]
        value = table.get(body)
        if value is None:
            continue
        # Skip the class of literals a regex cannot slice correctly: a template
        # with a nested template (`...${ cond ? `inner` : ... }...`) ends the
        # match at the inner backtick, so its "body" is a fragment and splicing
        # a translation there breaks the expression. Those get hand-edited.
        if "`" in value or ("${" in value and "${" not in body):
            continue
        # A template literal sliced at a nested backtick leaves an unbalanced
        # fragment ("...${group.map((r,i)=>"): translating it splices text into
        # the middle of an expression.
        if raw.startswith("`") and body.count("${") != body.count("}"):
            continue
        if raw.startswith(("'", '"')) and "\n" in value:
            value = " ".join(value.split())
        out.append(text[index : match.start()])
        out.append(raw[0] + shape(raw, value) + raw[-1])
        index = match.end()
        hits += 1
    out.append(text[index:])
    text = "".join(out)

    out = []
    index = 0
    for match in COMMENT.finditer(text):
        raw = match.group(0)
        if not CJK.search(raw):
            continue
        value = table.get(raw)
        if value is None:
            continue
        # A block comment's own terminator is part of the key, so allow the one
        # closing "*/" and reject any extra one that would cut the comment short.
        if raw.startswith("/*") and value.count("*/") > 1:
            continue
        if not raw.startswith(("//", "/*", "<!--", "#")) and "*/" in value:
            continue
        out.append(text[index : match.start()])
        out.append(value)
        index = match.end()
        hits += 1
    out.append(text[index:])
    return "".join(out), hits


def files() -> list[Path]:
    return [
        p
        for p in BUNDLE.rglob("*")
        if p.suffix in SUFFIXES and "vendor" not in p.relative_to(BUNDLE).parts
    ]


def main() -> None:
    dry = "--dry" in sys.argv
    table = load_dict()
    print(f"dictionary: {len(table)} entries")

    changed = 0
    total = 0
    for path in files():
        text = original = path.read_text(encoding="utf-8")
        text, hits = rewrite(text, table)
        if hits:
            changed += 1
            total += hits
            if not dry:
                path.write_text(text, encoding="utf-8")
    print(f"{'would change' if dry else 'changed'} {changed} file(s), {total} literal(s)")

    left = 0
    per_file: dict[str, int] = {}
    for path in files():
        text = path.read_text(encoding="utf-8")
        n = sum(1 for line in text.splitlines() if CJK.search(line))
        if n:
            left += n
            per_file[str(path.relative_to(BUNDLE)).replace("\\", "/")] = n
    print(f"remaining CJK lines: {left} across {len(per_file)} file(s)")
    for name, n in sorted(per_file.items(), key=lambda kv: -kv[1])[:10]:
        print(f"  {n:5}  {name}")


if __name__ == "__main__":
    main()
