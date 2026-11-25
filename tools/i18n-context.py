"""Print each remaining CJK occurrence with a small context window, per file."""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "bundle"
CJK = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]")
SUFFIXES = {".js", ".html", ".css", ".mjs"}

per_file: dict[str, list[str]] = defaultdict(list)
for path in sorted(BUNDLE.rglob("*")):
    if path.suffix not in SUFFIXES or "vendor" in path.relative_to(BUNDLE).parts:
        continue
    text = path.read_text(encoding="utf-8")
    seen: set[str] = set()
    for m in CJK.finditer(text):
        lo = max(0, m.start() - 26)
        hi = min(len(text), m.end() + 26)
        window = text[lo:hi].replace("\n", "\\n")
        if window in seen:
            continue
        seen.add(window)
        per_file[str(path.relative_to(BUNDLE))].append(window)

total = sum(len(v) for v in per_file.values())
print(f"# {total} windows in {len(per_file)} files")
for name, windows in per_file.items():
    print(f"\n=== {name} ({len(windows)})")
    for w in windows:
        print(f"  {w}")
