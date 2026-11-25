"""Split the pending strings into N slices for parallel translation.

Usage: python tools/i18n-slice.py 10        # writes docs/i18n/pending/slice-01.json ...
Each slice is a JSON array of exact source strings (round-robin over the list
sorted by length, so every slice has the same difficulty mix).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DICT_DIR = ROOT / "docs" / "i18n"
OUT = DICT_DIR / "pending"


def load_dict() -> dict[str, str]:
    merged: dict[str, str] = {}
    for path in sorted(DICT_DIR.glob("*.json")):
        if path.name == "scan.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            merged.update({k: v for k, v in data.items() if isinstance(v, str)})
    return merged


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    scan = json.loads((DICT_DIR / "scan.json").read_text(encoding="utf-8"))
    done = load_dict()
    pending = [t for t, _ in scan["literals"] if t not in done]
    pending += [t for t, _ in scan["comments"] if t not in done]
    pending.sort(key=len)

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("slice-*.json"):
        old.unlink()

    slices: list[list[str]] = [[] for _ in range(n)]
    for i, text in enumerate(pending):
        slices[i % n].append(text)

    for i, chunk in enumerate(slices, start=1):
        path = OUT / f"slice-{i:02d}.json"
        path.write_text(json.dumps(chunk, ensure_ascii=False, indent=0), encoding="utf-8")
        chars = sum(len(t) for t in chunk)
        print(f"{path.name}: {len(chunk)} strings, {chars} chars")


if __name__ == "__main__":
    main()
