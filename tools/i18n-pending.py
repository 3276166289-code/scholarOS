"""Print pending strings to translate, cheapest first.

Usage: python tools/i18n-apply.py --pending 250 --max 10
Reads docs/i18n/scan.json, drops anything already in the dictionary, sorts by
length then frequency, and prints one `count<TAB>text` line each.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DICT_DIR = ROOT / "docs" / "i18n"


def load_dict() -> dict[str, str]:
    merged: dict[str, str] = {}
    for path in sorted(DICT_DIR.glob("*.json")):
        if path.name == "scan.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            merged.update({k: v for k, v in data.items() if isinstance(v, str)})
    return merged


def arg(name: str, default: int) -> int:
    return int(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def main() -> None:
    scan = json.loads((DICT_DIR / "scan.json").read_text(encoding="utf-8"))
    done = load_dict()
    pending = [(t, c) for t, c in scan["literals"] if t not in done]
    pending += [(t, c) for t, c in scan["comments"] if t not in done]
    pending.sort(key=lambda tc: (len(tc[0]), -tc[1]))

    if "--applicable" in sys.argv:
        # Only what tools/i18n-translate.py will actually splice: short enough
        # for one line of source, and balanced templates.
        pending = [
            tc
            for tc in pending
            if len(tc[0]) <= 120 and tc[0].count("${") == tc[0].count("}")
        ]

    limit = arg("--pending", 200)
    ceiling = arg("--max", 10_000)
    picked = [tc for tc in pending if len(tc[0]) <= ceiling][:limit]

    total = len(pending)
    print(f"# pending {total}  | showing {len(picked)}  | len<={ceiling}")
    for text, count in picked:
        print(f"{count}\t{text}")


if __name__ == "__main__":
    main()
