"""Check translation files against the scan before applying them.

For every docs/i18n/en-*.json:
  - keys that are not in scan.json (typo / invented key)
  - values containing CJK or fullwidth punctuation
  - duplicate keys (JSON keeps the last one silently)
Usage: python tools/i18n-validate.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DICT_DIR = ROOT / "docs" / "i18n"
CJK = re.compile(r"[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]")


def main() -> int:
    scan = json.loads((DICT_DIR / "scan.json").read_text(encoding="utf-8"))
    known = {t for t, _ in scan["literals"]} | {t for t, _ in scan["comments"]}

    problems = 0
    total = 0
    for path in sorted(DICT_DIR.glob("en-*.json")):
        raw = path.read_text(encoding="utf-8")
        pairs = json.loads(raw, object_pairs_hook=lambda kv: kv)
        keys = [k for k, _ in pairs]
        dupes = {k for k in keys if keys.count(k) > 1}
        data = dict(pairs)

        unknown = [k for k in data if k not in known]
        bad_values = [k for k, v in data.items() if CJK.search(str(v))]
        empty = [k for k, v in data.items() if not str(v).strip()]

        total += len(data)
        flag = "OK " if not (unknown or bad_values or empty or dupes) else "BAD"
        if flag == "BAD":
            problems += 1
        print(f"{flag} {path.name}: {len(data)} entries")
        if dupes:
            print(f"    duplicate keys: {len(dupes)} e.g. {list(dupes)[:3]}")
        if unknown:
            print(f"    not in scan: {len(unknown)} e.g. {[u[:30] for u in unknown[:3]]}")
        if bad_values:
            print(f"    value still has CJK: {len(bad_values)} e.g. {[b[:30] for b in bad_values[:3]]}")
        if empty:
            print(f"    empty value: {len(empty)} e.g. {[e[:30] for e in empty[:3]]}")

    print(f"\ntotal entries across files: {total} | files with problems: {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
