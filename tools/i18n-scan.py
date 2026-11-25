"""Scan bundle/ for CJK-bearing text and report how much is unique.

Two buckets, because they are edited differently:
  literals  — string literals ('...', "...", `...`) that a user can see
  comments  — //, /* */, <!-- -->, # lines (must also reach zero)

Usage:  python tools/i18n-scan.py            # summary + top 40 by frequency
        python tools/i18n-scan.py --json    # full dump to docs/i18n/scan.json
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "bundle"
OUT = ROOT / "docs" / "i18n" / "scan.json"

CJK = re.compile(r"[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]")
LITERAL = re.compile(r"'([^'\\\n]|\\.)*'|\"([^\"\\\n]|\\.)*\"|`([^`\\]|\\.)*`", re.S)
COMMENT = re.compile(r"(?://[^\n]*|/\*.*?\*/|<!--.*?-->|^[ \t]*#[^\n]*)", re.S | re.M)
SUFFIXES = {".js", ".html", ".css", ".mjs"}


def files() -> list[Path]:
    return [
        p
        for p in BUNDLE.rglob("*")
        if p.suffix in SUFFIXES and "vendor" not in p.relative_to(BUNDLE).parts
    ]


def main() -> None:
    literal_counts: Counter[str] = Counter()
    comment_counts: Counter[str] = Counter()
    per_file: dict[str, dict[str, int]] = {}

    for path in files():
        text = path.read_text(encoding="utf-8", errors="replace")
        rel = str(path.relative_to(BUNDLE)).replace("\\", "/")
        stats = {"literals": 0, "comments": 0}

        for match in LITERAL.finditer(text):
            body = match.group(0)[1:-1]
            if CJK.search(body):
                literal_counts[body] += 1
                stats["literals"] += 1

        for match in COMMENT.finditer(text):
            body = match.group(0)
            if CJK.search(body):
                comment_counts[body.strip()] += 1
                stats["comments"] += 1

        if stats["literals"] or stats["comments"]:
            per_file[rel] = stats

    total_lit = sum(literal_counts.values())
    total_cmt = sum(comment_counts.values())
    print(f"files:           {len(per_file)}")
    print(f"literal hits:    {total_lit}  unique {len(literal_counts)}")
    print(f"comment hits:    {total_cmt}  unique {len(comment_counts)}")
    print(f"combined unique: {len(literal_counts) + len(comment_counts)}")
    print()
    print("--- top literals ---")
    for text, count in literal_counts.most_common(40):
        one = text.replace("\n", "\\n")[:70]
        print(f"{count:4}  {one}")

    if "--json" in sys.argv:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(
            json.dumps(
                {
                    "literals": literal_counts.most_common(),
                    "comments": comment_counts.most_common(),
                    "per_file": per_file,
                },
                ensure_ascii=False,
                indent=1,
            ),
            encoding="utf-8",
        )
        print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
