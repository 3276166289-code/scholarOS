"""Apply the English dictionary to bundle/ and report what is left.

Dictionary = every dict in docs/i18n/*.json merged (later files win). Keys are
the exact source text; longest key replaced first so "项目工作区" wins over "项目".

Usage:  python tools/i18n-apply.py            # apply, then report remaining CJK
        python tools/i18n-apply.py --dry      # report only
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


def load_dict() -> dict[str, str]:
    merged: dict[str, str] = {}
    for path in sorted(DICT_DIR.glob("*.json")):
        if path.name == "scan.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            continue
        for key, value in data.items():
            if key.startswith("_") or not isinstance(value, str) or not key:
                continue
            merged[key] = sanitize(value)
    return merged


def sanitize(value: str) -> str:
    """Make a value safe inside any JS string delimiter.

    A translation lands inside '...', "..." or `...` depending on the source
    line, so an ASCII quote or backtick in the value can terminate the literal
    early. Typographic marks read the same and cannot.
    """
    return (
        value.replace("`", "'")
        .replace('\\"', '"')
        .replace('"', "\u201d")
        .replace("'", "\u2019")
    )


def files() -> list[Path]:
    return [
        p
        for p in BUNDLE.rglob("*")
        if p.suffix in SUFFIXES and "vendor" not in p.relative_to(BUNDLE).parts
    ]


def main() -> None:
    dry = "--dry" in sys.argv
    table = load_dict()
    keys = sorted(table, key=len, reverse=True)
    print(f"dictionary: {len(table)} entries")

    # One alternation per run instead of a regex per key: 1000 keys x 4 passes x
    # 66 files of compile() is minutes; a single leftmost-longest alternation is
    # seconds. Sorted longest-first so "项目工作区" wins over "项目".
    alternation = "|".join(re.escape(k) for k in keys)
    combined = re.compile(rf"(?<!{CJK_CLASS})(?:{alternation})(?!{CJK_CLASS})")

    changed = 0
    hits = 0
    for path in files():
        text = original = path.read_text(encoding="utf-8")
        for _ in range(4):
            text, n = combined.subn(lambda m: table[m.group(0)], text)
            hits += n
            if not n:
                break
        if text != original:
            changed += 1
            if not dry:
                path.write_text(text, encoding="utf-8")

    print(f"{'would change' if dry else 'changed'} {changed} file(s), {hits} replacement(s)")

    left_lines = 0
    left_files: dict[str, int] = {}
    for path in files():
        text = path.read_text(encoding="utf-8")
        n = sum(1 for line in text.splitlines() if CJK.search(line))
        if n:
            left_lines += n
            left_files[str(path.relative_to(BUNDLE)).replace("\\", "/")] = n
    print(f"remaining CJK lines: {left_lines} across {len(left_files)} file(s)")
    for name, n in sorted(left_files.items(), key=lambda kv: -kv[1])[:12]:
        print(f"  {n:5}  {name}")


if __name__ == "__main__":
    main()
