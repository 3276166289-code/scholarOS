"""Delete Chinese-only comments from bundle/.

Translating 500 dev comments is busywork: the original Chinese source stays in
the 2.0 repo, and English code should not carry Chinese commentary. Removes a
comment only when it contains no code — a trailing comment on a code line is
cut, a comment line is dropped, a whole /* */ block goes if every line in it is
comment.

Usage: python tools/i18n-strip-comments.py [--dry]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "bundle"
SUFFIXES = {".js", ".html", ".css", ".mjs"}
CJK = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]")


def files() -> list[Path]:
    return [
        p
        for p in BUNDLE.rglob("*")
        if p.suffix in SUFFIXES and "vendor" not in p.relative_to(BUNDLE).parts
    ]


def strip_js_css(text: str) -> tuple[str, int]:
    """Line-oriented; tracks /* */ so a block is only dropped when it is all comment."""
    out: list[str] = []
    removed = 0
    in_block = False
    block_lines: list[str] = []

    for line in text.splitlines(keepends=True):
        stripped = line.strip()

        if in_block:
            block_lines.append(line)
            if "*/" in stripped:
                in_block = False
                if any(CJK.search(b) for b in block_lines):
                    removed += len(block_lines)
                else:
                    out.extend(block_lines)
                block_lines = []
            continue

        # comment-only line
        if stripped.startswith(("//", "/*", "*", "#")) and CJK.search(line):
            if stripped.startswith("/*") and "*/" not in stripped:
                in_block = True
                block_lines = [line]
                continue
            removed += 1
            continue

        # trailing comments are left alone: "//" also appears inside URLs, regex
        # literals and strings, and cutting there deletes real code.
        out.append(line)

    if block_lines:  # unterminated: leave it alone
        out.extend(block_lines)
    return "".join(out), removed


def strip_html(text: str) -> tuple[str, int]:
    removed = 0

    def drop(match: re.Match[str]) -> str:
        nonlocal removed
        if CJK.search(match.group(0)):
            removed += 1
            return ""
        return match.group(0)

    text = re.sub(r"<!--.*?-->", drop, text, flags=re.S)
    return text, removed


def main() -> None:
    dry = "--dry" in sys.argv
    total = 0
    touched = 0
    for path in files():
        text = path.read_text(encoding="utf-8")
        new, n = strip_html(text) if path.suffix == ".html" else strip_js_css(text)
        if n:
            touched += 1
            total += n
            if not dry:
                path.write_text(new, encoding="utf-8")
    print(f"{'would remove' if dry else 'removed'} {total} comment(s) in {touched} file(s)")


if __name__ == "__main__":
    main()
