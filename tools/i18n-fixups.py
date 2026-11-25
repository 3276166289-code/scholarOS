"""Last-mile fixes: exact (find, replace) pairs taken from the remaining context windows.

Every pair is a literal substring of one bundle file; anything that does not
apply is reported instead of silently skipped.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
B = ROOT / "bundle"

FIX: dict[str, list[tuple[str, str]]] = {
    "views/agent-settings.js": [
        ("/v1 等 API prefix", "/v1 and other API prefixes"),
    ],
    "views/app-core.js": [
        (" 周${w} ", " (${w}) "),
    ],
    "views/calendar-view.js": [
        ('<span>一</span><span>二</span>', "<span>Mon</span><span>Tue</span>"),
        ("<span>三</span>", "<span>Wed</span>"),
        ("<span>四</span>", "<span>Thu</span>"),
        ("<span>五</span>", "<span>Fri</span>"),
        ('class="cal-we">六</span>', 'class="cal-we">Sat</span>'),
        ('class="cal-we">日</span>', 'class="cal-we">Sun</span>'),
        ("} 项</span>", "} items</span>"),
    ],
    "views/capabilities.js": [
        ('"Tools 与 MCP', '"Tools and MCP'),
        ("cwd)或 Streamable", "cwd) or Streamable"),
        (" 的 Skills, Tools", "'s skills, tools"),
    ],
    "views/chat-views.js": [
        ("}人)</option>", "} people)</option>"),
        ("} 项</summary>", "} items</summary>"),
        ("} 次</summary>", "} runs</summary>"),
        ("/助[handle]/g", "/^(助手|助)$/g"),
        ("} 篇`", "} papers`"),
        ("// 照 use-composer-drop", "// see use-composer-drop"),
    ],
    "views/execution-conversation.js": [
        ("第 ${message.attempt} runs", "attempt ${message.attempt}"),
    ],
    "views/global-todo.js": [
        ("Enter P0, P1 或 P2", "Enter P0, P1, or P2"),
    ],
    "views/integrations-settings.js": [
        ('placeholder="在 easyScholar', 'placeholder="in easyScholar'),
        ('">去 MCP Matrix permissions', '">Go to MCP matrix permissions'),
        ('">在Project space的“Literature”', '">In the project space, “Literature”'),
        ("needs key 和 version", "needs key and version"),
    ],
    "views/interactions.js": [
        ("”或 Shift+F10", "” or Shift+F10"),
    ],
    "views/mail-view.js": [
        ("· 共 ${mailTotal} 封", "· ${mailTotal} messages"),
        ("per page ${n} 封", "per page ${n} messages"),
    ],
    "views/notebook.js": [
        ("} 篇</span>", "} notes</span>"),
    ],
    "views/notes-and-settings.js": [
        ("| 列 1 | 列 2 | 列 3 |", "| Col 1 | Col 2 | Col 3 |"),
        ("Select .md 或 .markdown", "Select .md or .markdown"),
        ("Cron (分 时 日 月 weeks)", "Cron (min hour day month weeks)"),
        ("} 篇 ·", "} notes ·"),
        ("relations · 用 ${", "relations · in ${"),
        ("按 Esc or click outside", "Press Esc or click outside"),
        ("· 共 ${allFiles.length} 篇", "· ${allFiles.length} notes"),
        ("includes ${totalFiles} 篇 Markdown", "includes ${totalFiles} Markdown"),
        ("length} 家 Provider", "length} providers"),
        ('["large","大"]', '["large","Large"]'),
    ],
    "views/paper-toolbox.js": [
        ("TIFF 或 PDF", "TIFF, or PDF"),
        ("RIS 或 TXT", "RIS, or TXT"),
        ("Markdown 或 TXT", "Markdown, or TXT"),
        ("HTML 或 LaTeX", "HTML, or LaTeX"),
        ("items · 共 ${total} pages", "items · ${total} pages"),
        ("BibTeX 或 RIS", "BibTeX, or RIS"),
        ("TIFF 和 PDF", "TIFF, and PDF"),
    ],
    "views/paper-translation.js": [
        ("第 1 page preview", "page 1 preview"),
        ("把 PDF Drop it here", "Drop the PDF here"),
        ("第 ${n} pages", "page ${n}"),
        ("}分${el%60}秒", "}m ${el%60}s"),
        ("}分${el%60}seconds", "}m ${el%60}s"),
        ("Project literature库", "Project literature"),
    ],
    "views/project-literature.js": [
        ("从 Zotero selection", "From Zotero selection"),
        ("authors,DOI 或 Zotero Key", "authors, DOI, or Zotero key"),
        ('value="pdf">有 PDF', 'value="pdf">Has PDF'),
        ("Selected 0 篇", "Selected 0 papers"),
        ("'有 PDF':'References'", "'Has PDF':'References'"),
        ("} 篇 PDF.", "} PDFs."),
    ],
    "views/project-task-ui.js": [
        ("按 Full access Auto-accept", "Full access auto-accept"),
    ],
    "views/project-workspace.js": [
        ("”的Search results", "” search results"),
        ("} 项</small>", "} items</small>"),
        ("'第 '+run.attempt+' runs'", "'attempt '+run.attempt"),
        ("· 第 ${task.latest_run.attempt", "· attempt ${task.latest_run.attempt"),
    ],
    "views/project-zotero.js": [
        ("”的 ${rows.length} papers?", "”: ${rows.length} papers?"),
        ("} 项 · Conflicts", "} items · Conflicts"),
        ("} 项</p>", "} items</p>"),
    ],
    "views/starmap-view.js": [
        ("从 Zotero Import papers", "Import papers from Zotero"),
    ],
    "views/task-actions.js": [
        ("`将${section", "`Move ${section"),
    ],
    "views/task-center.js": [
        ("||'助')", "||'A')"),
        ("第 '+row.attempt+' 次", "attempt '+row.attempt"),
    ],
    "views/team-office.js": [
        ("} 人</div>", "} people</div>"),
        ("<span>统 筹</span>", "<span>Lead</span>"),
        ("<span>成 员</span>", "<span>Members</span>"),
        ("<span>最 近 流 水</span>", "<span>Recent activity</span>"),
        ("Standing ${fixed.length} 间", "Standing ${fixed.length} rooms"),
        ("} 间 / Rush", "} / Rush"),
        ("<span>走 廊</span>", "<span>Corridor</span>"),
        ("<span>Empty 位</span>", "<span>Empty desk</span>"),
    ],
    "views/usage-view.js": [
        (">共 ${full(total)} characters", ">${full(total)} characters"),
        ("'＜0.1%'", "'<0.1%'"),
        ("API 的 Token cost", "API token cost"),
        ("Input ＞${", "Input >${"),
        ("按 Token Sort", "Sort by token"),
        (">共 ${full(totals.requests)}", ">${full(totals.requests)}"),
    ],
    "views/workflow-layout.js": [
        ("如 literature_reviewer", "e.g. literature_reviewer"),
        ("Hold Ctrl 或 ⌘", "Hold Ctrl or ⌘"),
        ("step 和 label", "step and label"),
    ],
    "views/workflow-node-download.js": [
        ("· 第 ${escape(page)} pages", "· page ${escape(page)}"),
    ],
    "views/workflow-node-literature.js": [
        ("· 共 ${rows.length} items", "· ${rows.length} items"),
        ("<span>第 ${view.page + 1} /", "<span>Page ${view.page + 1} /"),
    ],
    "views/workflow-node-map.js": [
        ("· 第 ${escape(source.page_no)}", "· page ${escape(source.page_no)}"),
    ],
    "views/workflow-node-workbench.js": [
        ("?'否':'是'", "?'No':'Yes'"),
        ('aria-label="第 ${rowIndex+1} no.', 'aria-label="row ${rowIndex + 1}, no.'),
    ],
    "views/workspace-trajectory.js": [
        ("' · 第 '+(row.round+1)+' 轮'", "' · round '+(row.round+1)"),
    ],
}


def main() -> None:
    missed: list[str] = []
    changed = 0
    for rel, pairs in FIX.items():
        path = B / rel
        text = path.read_text(encoding="utf-8")
        for find, repl in pairs:
            if find in text:
                text = text.replace(find, repl)
                changed += 1
            else:
                missed.append(f"{rel}: {find}")
        path.write_text(text, encoding="utf-8")
    print(f"applied {changed} fixups")
    if missed:
        print("MISSED:")
        for m in missed:
            print("  " + m)


if __name__ == "__main__":
    main()
