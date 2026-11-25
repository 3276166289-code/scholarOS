"""Print the longest still-Chinese string bodies, full text, for hand translation."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "bundle"
DICT_DIR = ROOT / "docs" / "i18n"
SUFFIXES = {".js", ".html", ".css", ".mjs"}
CJK = re.compile(r"[\u4e00-\u9fff]")
LIT = re.compile(r"'([^'\\\n]|\\.)*'|\"([^\"\\\n]|\\.)*\"|`([^`\\]|\\.)*`")

done: set[str] = set()
for p in sorted(DICT_DIR.glob("en-*.json")):
    done |= set(json.loads(p.read_text(encoding="utf-8")).keys())

bodies: dict[str, int] = {}
for path in BUNDLE.rglob("*"):
    if path.suffix not in SUFFIXES or "vendor" in path.relative_to(BUNDLE).parts:
        continue
    text = path.read_text(encoding="utf-8")
    for m in LIT.finditer(text):
        raw = m.group(0)
        body = raw[1:-1]
        if not CJK.search(body) or body in done:
            continue
        bodies[body] = bodies.get(body, 0) + 1

limit = int(sys.argv[1]) if len(sys.argv) > 1 else 20
floor = int(sys.argv[2]) if len(sys.argv) > 2 else 0
items = [(b, n) for b, n in bodies.items() if len(b) >= floor]
items.sort(key=lambda bn: -len(bn[0]))
print(f"# {len(items)} pending bodies >= {floor} chars; showing {min(limit, len(items))}")
for body, n in items[:limit]:
    print(f"--- {len(body)}c x{n}\n{body}")
