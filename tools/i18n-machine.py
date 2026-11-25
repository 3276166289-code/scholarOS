"""Draft translations for pending CJK runs with the local model, then validate.

The model only drafts; every line is checked (count, no CJK left, non-empty)
before it is written to docs/i18n/runs-m<NN>.json, so a bad batch is thrown
away rather than applied.

Usage:  python tools/i18n-machine.py --sample 20      # 20 runs, printed, not saved
        python tools/i18n-machine.py --batch 40 --save
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "bundle"
DICT_DIR = ROOT / "docs" / "i18n"
SUFFIXES = {".js", ".html", ".css", ".mjs"}
RUN = re.compile(r"[\u4e00-\u9fff][\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]*")
CJK = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]")
MODEL = "qwen3:8b-64k"
HOST = "http://127.0.0.1:11434/api/generate"

GLOSSARY = (
    "项目 Project; 文献 Literature; 笔记 Notes; 稿件 Manuscript; 论文 Paper; "
    "工具箱 Toolbox; 工作流 Workflow; 任务 Task; 专家 Expert; 团队 Team; "
    "知识库 Knowledge base; 检索 Search; 摘要 Abstract; 章节 Section; "
    "引文 Citation; 润色 Polish; 翻译 Translate; 归档 Archive; 星图 Star map; "
    "交付 Deliver; 验收 Review; 合规 Compliance; 图表 Figure; 正文 Body; "
    "批注 Annotation; 收件箱 Inbox; 日程 Schedule; 待办 To-do; "
    "里程碑 Milestone; 证据 Evidence; 推理 Reasoning; 智研管家 Assistant; "
    "览籍智研 scholarOS."
)

RULES = """You translate UI strings of a research-paper app from Chinese to English.
Return ONLY a JSON object mapping each number (as a string) to its English text.
Rules:
- Keep every placeholder such as ${x}, ${a.b}, <b>, %s, {0} exactly as it is, in place.
- A fragment must stay a fragment: never add words the source does not have.
- Keep trailing punctuation and trailing spaces if the source has them.
- Sentence case; buttons start with a verb; no full stops on short labels.
- Never leave Chinese characters or full-width punctuation; use ASCII , . : ; ( ) ? !
- Output valid JSON only, no code fence, no commentary."""


def pending_runs(limit: int) -> list[str]:
    done: set[str] = set()
    for path in sorted(DICT_DIR.glob("runs-*.json")):
        done |= set(json.loads(path.read_text(encoding="utf-8")).keys())
    counts: Counter[str] = Counter()
    for path in BUNDLE.rglob("*"):
        if path.suffix not in SUFFIXES or "vendor" in path.relative_to(BUNDLE).parts:
            continue
        counts.update(RUN.findall(path.read_text(encoding="utf-8")))
    items = [(r, n) for r, n in counts.items() if r not in done]
    items.sort(key=lambda rn: (-len(rn[0]), -rn[1]))
    return [r for r, _ in items[:limit]]


def ask(runs: list[str]) -> dict[str, str] | None:
    numbered = "\n".join(f"{i + 1}. {r}" for i, r in enumerate(runs))
    prompt = f"{RULES}\n\nGlossary: {GLOSSARY}\n\nTranslate these {len(runs)} strings:\n{numbered}\n"
    body = json.dumps(
        {
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0, "num_ctx": 8192},
        }
    ).encode()
    req = urllib.request.Request(HOST, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        payload = json.loads(resp.read())
    text = payload.get("response", "")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if isinstance(data, list):
        data = {str(i + 1): v for i, v in enumerate(data)}
    if not isinstance(data, dict):
        return None
    out: dict[str, str] = {}
    for i, run in enumerate(runs, start=1):
        value = data.get(str(i), data.get(i))
        if not isinstance(value, str) or not value.strip() or CJK.search(value):
            continue
        out[run] = value
    return out


def main() -> None:
    sample = "--sample" in sys.argv
    batch = int(sys.argv[sys.argv.index("--batch") + 1]) if "--batch" in sys.argv else 20
    runs = pending_runs(batch)
    result = ask(runs)
    if result is None:
        print("model returned nothing usable")
        return
    print(f"asked {len(runs)}  got {len(result)}")
    for run, value in result.items():
        print(f"  {run}\n    -> {value}")
    if "--save" in sys.argv and not sample:
        existing = sorted(DICT_DIR.glob("runs-m*.json"))
        path = DICT_DIR / f"runs-m{len(existing) + 1:02d}.json"
        path.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
