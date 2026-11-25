# English style guide (scholarOS)

Applies to every user-visible string in `bundle/`. Machine-checked only for CJK
(`tools/lint-cjk.sh`); everything else is a review rule.

## 1. Voice

- Second person, imperative for actions. The app talks to a researcher, not to a user.
- No marketing adjectives. Say what happens, not how exciting it is.
- Banned words: `leverage`, `seamless`, `revolutionize`, `empower`, `unleash`, `cutting-edge`, `robust`, `powerful`.

## 2. Case

| Element | Rule | Example |
|---|---|---|
| Window / view title | Sentence case | `Paper toolbox` |
| Section heading | Sentence case | `Recent jobs` |
| Button / menu item | Sentence case, no period | `Export to Word` |
| Label next to a field | Sentence case, no colon | `Citation style` |
| Badge / status | lowercase or sentence case | `running`, `3 queued` |
| Product name | always `scholarOS` (lowercase s, capital OS) | — |

## 3. Punctuation and typography

- Half-width punctuation only: `,` `.` `:` `;` `(` `)` `"` `'`. Never `，。：；（）「」《》`.
- Ranges use an en dash without spaces: `2019–2024`. Not `~`, not `-`.
- Sentence breaks inside UI copy use a period + space, not `·`, not `｜`.
- Ellipsis is `…` (single character), only for "in progress", never mid-sentence.
- Numbers: `1,000`; units with a space: `10 mA h g⁻¹`, `300 dpi`, `50 MB`.
- Dates: `2026-11-25` in data, `25 Nov 2026` in prose.
- No exclamation marks anywhere in the UI.

## 4. Errors

Shape: **what failed + why (if known) + what to do next.** One to two sentences, no stack traces, no error codes in the primary line.

| Bad | Good |
|---|---|
| 解析失败 | `Couldn't read this PDF. It looks like a scan — run OCR first, then retry.` |
| 文件过大 | `This file is 82 MB. The limit is 50 MB — split it or compress it first.` |
| 网络错误 | `Couldn't reach Crossref. Check your connection and try again.` |
| 不支持 | `scholarOS can't open .doc files. Save it as .docx and upload again.` |

Never blame the user. Never say "invalid input" without saying what was expected.

## 5. Terminology (fixed — do not vary)

| 中文 | English | Notes |
|---|---|---|
| 论文工具箱 | Paper toolbox | view title is sentence case |
| 图注 | Caption | |
| 润色 | Polish | verb: `Polish text` |
| 合规检查 | Compliance check | |
| 参考文献 | References | |
| 文献库 | Library | |
| 知识星图 | Star map | |
| 项目空间 | Project space | |
| 研讨室 | Seminar room | team feature |
| 团队协调员 | Team lead | |
| 虚拟办公室 | Team office | |
| 一键生成 | Generate | never "one-click" |
| 转 Word | Export to Word | |
| 导入文献 | Import papers | |
| 精读 | Close read | |
| 综述 | Literature review | |

## 6. Copy patterns

- Empty state: one line of what goes here + one action. `No papers yet. Upload a PDF to start.`
- Confirmation of a destructive action: verb in the button, not "OK". `Delete project` / `Cancel`.
- Progress: `Extracting text… (2 of 9)`
- Tooltip: a noun phrase, no period, ≤ 8 words.

## 7. What not to translate

Delete rather than translate anything tied to a Chinese-only service or workflow:

`知网` `CNKI` `飞书` `WebVPN` `GB/T 7714` `万方` `维普`

If a feature only makes sense inside China, it does not ship in this build.
