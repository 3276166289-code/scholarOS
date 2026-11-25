"""ASCII-ise full-width punctuation left behind in bundle strings.

Full-width punctuation cannot appear in JS syntax, so every occurrence sits
inside a string or comment and a straight text swap is safe. Quotes map to the
typographic forms so they never terminate a '...' or "..." literal.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "bundle"
SUFFIXES = {".js", ".html", ".css", ".mjs"}
PUNCT = re.compile(r"[\u3000-\u303f\uff00-\uffef]")

MAP = {
    "\uff08": " (", "\uff09": ")", "\uff1a": ": ", "\uff0c": ", ",
    "\u3001": ", ", "\u3002": ". ", "\uff1b": "; ", "\uff01": "!",
    "\uff1f": "?", "\uff0b": "+", "\uff0d": "-", "\uff1d": "=",
    "\u300c": "\u201c", "\u300d": "\u201d", "\u300a": "\u201c", "\u300b": "\u201d",
    "\u3010": "[", "\u3011": "]", "\u2026": "...", "\u2014": "-",
    "\uff5e": "~", "\u3000": " ",
}


def main() -> None:
    hits = 0
    for path in sorted(BUNDLE.rglob("*")):
        if path.suffix not in SUFFIXES or "vendor" in path.relative_to(BUNDLE).parts:
            continue
        text = original = path.read_text(encoding="utf-8")
        for src, dst in MAP.items():
            if src in text:
                hits += text.count(src)
                text = text.replace(src, dst)
        if text != original:
            path.write_text(text, encoding="utf-8")
    left = PUNCT.findall("".join(
        p.read_text(encoding="utf-8") for p in BUNDLE.rglob("*")
        if p.suffix in SUFFIXES and "vendor" not in p.relative_to(BUNDLE).parts
    ))
    print(f"replaced {hits} punctuation marks; {len(left)} left ({''.join(sorted(set(left)))})")


if __name__ == "__main__":
    main()
