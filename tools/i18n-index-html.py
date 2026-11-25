"""index.html came from the source shell after the bulk pass; repair it line by line."""

from pathlib import Path

p = Path(__file__).resolve().parents[1] / "bundle" / "index.html"

PAIRS = [
    ('<html lang="zh-CN"', '<html lang="en"'),
    ("/* Title带上构建戳: Start器靠它认出“哪扇窗是这一版” (app 窗口的 --app 复用不可靠) */",
     "/* Build stamp in the title: the launcher uses it to tell which window belongs to this build (--app re-use is unreliable) */"),
    ("/* 主题在首帧前就定好: 以前等 refreshState 回来才套 rw-theme, 浅色用户会先看到一帧Dark页再翻白 (同样算闪一下) */",
     "/* Theme is pinned before the first frame: waiting for refreshState showed light-mode users a dark frame first (still a flash) */"),
    ('href="#main">跳到主要内容</a>', 'href="#main">Skip to main content</a>'),
    ('aria-label="To do 随手记"', 'aria-label="Quick to-dos"'),
    ('aria-label="BackPrevious面"', 'aria-label="Back to the previous page"'),
    ('aria-label="主要内容"', 'aria-label="Main content"'),
    ("<!-- 个人Material弹窗 (只留PinnedFields; the rest信息不Show) -->",
     "<!-- Profile dialog (pinned fields only, nothing else stored) -->"),
    ("<h3>个人Material</h3>", "<h3>Profile</h3>"),
    ("<span>用户名 (Show名)</span>", "<span>Display name</span>"),
    ('placeholder="For example: 姚同学"', 'placeholder="e.g. Alex Chen"'),
    ("<span>Avatar照片 (选了照片就优先用它, Emoji 留着备着)</span>",
     "<span>Avatar photo (used first when set, the emoji stays as a fallback)</span>"),
    ("+ Upload照片", "+ Upload photo"),
    ("<span>专业方向</span>", "<span>Field of study</span>"),
    ('placeholder="如: 材料科学与工程"', 'placeholder="e.g. Materials Science and Engineering"'),
    ('id="btnProfCancel" class="btn">取消<', 'id="btnProfCancel" class="btn">Cancel<'),
    ("<h3>从 Zotero 取文献</h3>", "<h3>Add from Zotero</h3>"),
    ("正在Connect Zotero 本地库...", "Connecting to the local Zotero library..."),
    ('title="Select Zotero 收藏夹 / Category"', 'title="Pick a Zotero collection"'),
    ('placeholder="按Title / 作者 / 标签Search the literature..."',
     'placeholder="Search by title, author, or tag..."'),
    ("<span>Select all本页</span>", "<span>Select this page</span>"),
    ("Add the selected papersinto the project", "Add the selected papers to the project"),
    ("<!-- 全局命令面板 (Command Palette - Ctrl+K) -->", "<!-- Command palette (Ctrl+K) -->"),
    ('aria-label="Search commands与页面"', 'aria-label="Search commands and pages"'),
    ('placeholder="SearchActions, 页面或Project..."', 'placeholder="Search actions, pages, or projects..."'),
    ('aria-label="关闭命令面板"', 'aria-label="Close the command palette"'),
    ("<kbd>↓</kbd> 导航</span>", "<kbd>↓</kbd> to navigate</span>"),
    ("<kbd>Esc</kbd> 关闭</span>", "<kbd>Esc</kbd> to close</span>"),
    (">View所有Shortcuts<", ">View all shortcuts<"),
    ("<!-- Diff 对比与Merge both ways面板 (Diff Review Studio) -->", "<!-- Diff review studio -->"),
    ("Body变更对比与Merge both ways</span>", "Compare body changes and merge both ways</span>"),
    ("全部接受变更 (Accept)", "Accept all changes"),
    ("Rejected建议并保留原版 (Reject)", "Reject the suggestions, keep the original"),
    ('id="btnDiffCancel" class="btn">关闭<', 'id="btnDiffCancel" class="btn">Close<'),
]

text = p.read_text(encoding="utf-8")
missed = [a for a, _ in PAIRS if a not in text]
for a, b in PAIRS:
    text = text.replace(a, b)
p.write_text(text, encoding="utf-8")

import re

CJK = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]")
left = [l for l in text.splitlines() if CJK.search(l)]
print(f"missed {len(missed)}")
for m in missed:
    print("  MISS:", m[:70])
print(f"lines with CJK left: {len(left)}")
for l in left[:6]:
    print("  ", l.strip()[:120])
