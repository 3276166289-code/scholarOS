"""Translate Chinese *runs*, not whole literals.

A run is a maximal sequence of CJK characters (plus CJK punctuation). By
construction a run can contain no quote, backtick or newline, so replacing it
can never break a JS string, a template literal or a comment — which is what
made the long HTML templates unsafe to touch with a literal-keyed dictionary.

Usage:  python tools/i18n-runs.py --list 200        # pending runs, longest first
        python tools/i18n-runs.py --apply          # apply docs/i18n/runs-*.json
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "bundle"
DICT_DIR = ROOT / "docs" / "i18n"
SUFFIXES = {".js", ".html", ".css", ".mjs"}

RUN = re.compile(r"[\u4e00-\u9fff][\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]*")
CJK = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]")


def files() -> list[Path]:
    return [
        p
        for p in BUNDLE.rglob("*")
        if p.suffix in SUFFIXES and "vendor" not in p.relative_to(BUNDLE).parts
    ]


def load_runs() -> dict[str, str]:
    merged: dict[str, str] = {}
    for path in sorted(DICT_DIR.glob("runs-*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            merged.update({k: v for k, v in data.items() if isinstance(v, str) and k})
    return merged


def counts(only: str | None = None) -> Counter[str]:
    c: Counter[str] = Counter()
    for path in files():
        rel = str(path.relative_to(BUNDLE)).replace("\\", "/")
        if only and only not in rel:
            continue
        c.update(RUN.findall(path.read_text(encoding="utf-8")))
    return c


def main() -> None:
    table = load_runs()
    only = sys.argv[sys.argv.index("--file") + 1] if "--file" in sys.argv else None
    c = counts(only)
    pending = [(r, n) for r, n in c.items() if r not in table]
    pending.sort(key=lambda rn: (-len(rn[0]), -rn[1]))

    if "--apply" in sys.argv:
        keys = sorted(table, key=len, reverse=True)
        changed = hits = 0
        for path in files():
            text = original = path.read_text(encoding="utf-8")
            for run in keys:
                if run in text:
                    hits += text.count(run)
                    text = text.replace(run, table[run])
            if text != original:
                changed += 1
                path.write_text(text, encoding="utf-8")
        left = sum(
            1
            for p in files()
            for line in p.read_text(encoding="utf-8").splitlines()
            if CJK.search(line)
        )
        print(f"applied {len(table)} runs -> {hits} replacements in {changed} file(s)")
        print(f"remaining CJK lines: {left}")
        print(f"runs still pending: {len(pending)}")
        return

    limit = int(sys.argv[sys.argv.index("--list") + 1]) if "--list" in sys.argv else 100
    print(f"# unique runs {len(c)} | translated {len(table)} | pending {len(pending)}")
    for run, n in pending[:limit]:
        print(f"{n}\t{run}")


if __name__ == "__main__":
    main()
