# scholarOS — Anna App 全量迁移工作流程（v2）

> 工作区：`C:\Users\24410\Desktop\科研agent\scholarOS`
> 源仓库（只读，不回写）：`C:\Users\24410\Desktop\览籍智研2.0`
> 范围：**Anna 能承载的功能全部推上去**，不做范围裁剪。
> 状态：方案定稿，未开工。旧的白名单版存为 `WORKFLOW.v1-存档.md`。

---

## 0. v1 → v2 的变化（先看这节，别按旧稿施工）

| # | v1 的说法 | 实际（已查 Anna 官方文档核实） |
|---|---|---|
| 1 | v1 只留「论文工具箱 + 文献列表 + 星图」三条主线 | **作废**。全量迁移。实测只有 4 类上不去，其中 3 类是平台已经替我们做了 |
| 2 | `anna-app init --dir . --name scholarOS --slug scholaros` | 实际：先 `anna-app doctor`，再 `anna-app init <name> --slug <slug>`（位置参数） |
| 3 | 本地用 `npx serve bundle` 看效果 | 实际：`anna-app dev`，harness 起在 `localhost:5180`，跑**生产同款 dispatcher**，热重载 |
| 4 | mock 用 `localStorage` | **错**。Anna 明确无 localStorage，窗口状态服务端权威。应用状态写 `storage.set`（≤256 KB），大对象走 `files.*` / artifact |
| 5 | 「capability 声明越多审核越慢」 | 不准。所有 Host API 命名空间**安装即授权**、无需声明。只有 3 项需声明，且仅当触及第二方主体 |
| 6 | 未提发布顺序 | 有硬顺序：**Executa 必须先发布进目录（public / app_bundled），App 的 manifest 才能引用其 tool_id** |

---

## 1. 目标与验收

**一句话**：把「览籍智研 2.0」的 60 个视图、42 个后端 API 域，整体改造成 Anna App `@Linder0613/scholarOS`——纯英文、schema 4、静态 SPA 多窗口 UI + 3 个 Executa Tool + 若干 Skill，上架 App Store。

| # | 验收项 | 判据 |
|---|---|---|
| V1 | 构建合规 | `anna-app validate --strict` 零 error（含 Host API 调用名核查） |
| V2 | 本地全流程 | `anna-app dev` 里 60 个视图都能打开，主路径无 404、无中文 |
| V3 | 生产全流程 | 商店安装后 `#scholarOS` 唤起窗口，上传 → 解析 → 生成 → 下载全通 |
| V4 | 上架 | Review Approved → PUBLISHED |

**身份**：display `scholarOS`，slug `scholaros`（平台 slug 小写；Console 若收大写则用 `scholarOS`），handle `@Linder0613`。

---

## 2. Anna 能力清单（全量方案的依据）

### 2.1 免费可用、无需声明（安装即授权）

| 命名空间 | 能做什么 | 对应我们的功能 |
|---|---|---|
| `llm.*` | 模型调用、流式 | 翻译 / 润色 / 改写 / 综述 / 审稿意见 |
| `chat.*` | 会话读写、发消息 | 聊天视图、结果回帖 |
| `agent.session.*` | 起沙箱 agent 会话（受 `agent.tools` 约束） | 工作流编排、多步任务 |
| `web.*` | 联网检索 / 抓取 | RSS、EasyScholar、期刊页解析 |
| `upload.*` `files.*` | 上传、文件读写 | 论文 / 图片 / 数据文件进出 |
| `storage.*`（本 app scope） | 键值 + 文件存储 | 项目、文献库、笔记、图、设置 |
| `artifact.*` | 生成可预览制品 | 结果卡片、报告 |
| `window.*` | 窗口标题、ready、几何 | 多窗口 UI |
| `tools.*` | `invoke` 调 Executa、`getJob` 查异步任务 | 所有重计算 |
| `image.*` `video.*` `music.*` `audio.*` | 生成与处理 | 图注配图、论文朗读 |
| `mobile.*` `apps.*` | 移动端、跨 app | 备用 |

### 2.2 必须声明（只 3 项，且仅当触及第二方主体）

| 声明 | 位置 | 我们用在哪 |
|---|---|---|
| `ui.host_api.credentials: ["google", …]` | ui 段 | 邮件（Gmail）、Drive 文献同步 |
| `ui.host_api.agent.tools: ["fs_read_file","exec_run",…]` | ui 段 | 本地 Zotero 库、本地 PDF 目录批量导入 |
| `storage.scopes: {user/app/tool: r/w/rw}` | 顶层 | 仅当要把数据共享给用户其他 app；自己 app 桶不用声明 |

### 2.3 真正上不去的（这才是减法）

| 拿不到 | 原因 | 替代 |
|---|---|---|
| 常驻长连接（飞书收消息） | Tool 是 stdin/stdout 请求-响应，不常驻 | 改「主动推送」：Tool 内 HTTP POST 飞书 webhook，可保留 |
| app 级定时调度器 | 文档未提供 | Skill 配方 + 对话触发；平台开放后再挂 |
| 本地 8766 端口服务、pywebview 窗口 | 平台 iframe 容器 | 改 UI 视图 + Executa |
| 自建模型配置 / 用量面板 / 能力安装器 | `llm.*`、CU 配额、Executa Hub 已接管 | 删这 3 个视图——不是砍能力，是重复了 |

**结论：真正上不去的只有 3 类（飞书收消息、app 级 cron、本地端口/桌面窗口），另有 3 个视图平台已经做过（模型配置、用量、能力安装）。其余全部 1:1 迁移，团队页也不需要降级——它是 AI 助手编队，不是人类协作。**

---

## 3. 源仓库基线（实测，2026-11-25）

| 对象 | 规模 |
|---|---|
| `apps/desktop/web/` | **60 个 view + 18 个 css + index.html(202 行)**，18 MB（含 vendor） |
| 含中文的行 | **5126 行** |
| 后端 | `server.py` + `handlers/` ≈ 3095 行（355 行含中文），端口 8766 |
| `packages/` | ai-runtime / connectors / contracts / database / workspace-core / workspace-service；全仓 py **73,083 行** |
| 后端 API 域 | 42 个前缀：agent / assistant / chat / models / team / calendar / capabilities / zotero / workflow / project-tasks / execution-board / conv / handoff / todos / easyscholar / feishu / rss / file / project / library / mail / translate / message-channels / app / assets / mdnotes / providers / schedule / settings / state / task / tools / paper-toolbox / trans / prompt-templates / plans / usage / paper / security / step / win |
| 前端构建 | **无**（index.html 顺序加载 30 个脚本，全局变量协作） |
| 本机 | node v24.16 ✓ / npm 11.13 / uv 0.12.9 ✓ / `anna-app` 未装 |

---

## 4. 全量能力矩阵（60 个视图逐个裁决）

图例：**搬** = 原样/近原样；**改** = 换数据源；**删** = 平台已做或不可承载。

### 4.1 基础设施（8+6）

| 视图 | 裁决 | 落点 |
|---|---|---|
| `app-core.js` `app-navigation.js` `platform-nav.js` `interactions.js` | 搬 | 骨架，改入口 |
| `agent-runtime.js` | 改 | 本地 agent → `agent.session.*` + `llm.*` |
| `file-drop.js` `file-handoff.js` | 改 | 上传 → `upload.*` |
| `diff-viewer.js` `list-search.js` `node-registry.js` `executor-choices.js` `global-todo.js` `mermaid-tool.js` | 搬 | 纯前端 + storage |

### 4.2 论文生产线（14）

| 视图 | 裁决 | 落点 |
|---|---|---|
| `paper-toolbox.js`（9 类任务） | 改 | 纯计算 → `paper-core`；含 LLM 的（translate/polish）→ `llm.*` |
| `paper-translation.js` | 改 | 分块翻译 → `llm.*` + `paper-core.extract_text`；长任务用 `tools.getJob` |
| `workflow-layout.js` `project-workflow-graph.js` `workflow-node-*.js`（9 个） | 搬 | 图编辑纯前端；节点执行 → `agent.session` + `tools.invoke` |
| `workflow-review.js` `project-output-review.js` | 改 | 审稿意见 → `llm.*` |
| `workflow-node-workbench.js` | 搬 | 节点工作台 |

### 4.3 文献与情报（6）

| 视图 | 裁决 | 落点 |
|---|---|---|
| `literature-import.js` | 改 | 导入 → `literature` tool + `web.*` |
| `project-literature.js` | 改 | 文献库 → `storage` + `literature.search` |
| `rss-settings.js` `intelligence-view.js` | 改 | RSS → `literature.fetch_rss`（Tool 内联网），触发靠对话 |
| `connected-research.js` | 改 | 检索聚合 → `web.*` + `literature` tool |
| `project-zotero.js` | 改 | 默认 Zotero Web API（key 存 storage）；本地库需声明 `agent.tools: ["fs_read_file"]` |
| `starmap-view.js` + `vendor/starmap.js` | 搬 | 纯前端，数据走 `storage` |

### 4.4 项目与任务（11）

| 视图 | 裁决 | 落点 |
|---|---|---|
| `project-manager.js` `project-space.js` `project-files.js` `project-resources.js` `project-workspace.js` | 改 | 本地 SQLite → `storage`（app scope） |
| `task-center.js` `task-actions.js` `project-task-ui.js` `execution-conversation.js` | 改 | `/api/task` 轮询 → `tools.getJob` + SSE |
| `notebook.js` + `notes-and-settings.js`（拆分） | 改 | 笔记 → `storage`；设置页大部分删（见 4.6） |
| `workspace-trajectory.js` | 改 | 轨迹 → `storage` |
| `team-office.js`（虚拟办公室） | 改 | **不降级**。团队 = AI 助手编队（leader「团队协调员」+ 成员各带 `assistant_id`/prompt），数据本来就在单用户库里：roster → `storage`；成员执行 → `agent.session`（带该成员 persona）；派活队列 → `tools.getJob`；本地 `TICK=3.0` 线程轮询与内存 `RUNNING` 集合去掉。「进研讨室跳科研台」是纯前端跳转，不动 |

### 4.5 沟通类（9）

| 视图 | 裁决 | 落点 |
|---|---|---|
| `chat-views.js` `conversation-history.js` `prompt-templates.js` `prompt-library.js` | 改 | 会话交平台 `chat.*`；只留 prompt 模板库（storage） |
| `mail-view.js` `mail-template.js` | 改 | 声明 `credentials: ["google"]`；非 Google 账号走 `mail` tool 的 IMAP/SMTP + storage 凭据 |
| `integrations-settings.js` | 改 | 飞书只留 webhook 推送；EasyScholar → `literature` tool；Zotero 同 4.3 |
| `message-channels.js` | 删 | 平台无对应通道管理 |
| `calendar-view.js` | 搬 | 纯前端 + storage，不接系统日历 |

### 4.6 平台已接管（4）

| 视图 | 裁决 | 理由 |
|---|---|---|
| `agent-settings.js`（模型/provider 配置） | 删 | `llm.*` 由平台统一 |
| `capabilities.js` `skill-installer.js` | 删 | Executa Hub 就是安装器 |
| `usage-view.js` | 删 | CU 配额在平台面板 |

**统计：搬 18，改 28，删 4，降级 0（另 1 个拆分）。**

---

## 5. Executa 拆分（3 + 1）

一个 Tool 一个网络/二进制边界；纯计算的合并。

| tool_id | 方法 | 为什么单独 |
|---|---|---|
| `paper-core` | `parse_pdf` `extract_text` `render_page` `convert_docx` `bib_parse` `cite_format` `caption_compose` `image_convert` `merge_pdf` | 纯离线计算，依赖 pdfplumber / pypdfium2 / python-docx / Pillow，体积最大 |
| `literature` | `search` `fetch_rss` `resolve_doi` `fetch_arxiv` `zotero_web` `easyscholar` | 全联网 + 需 API key，独立发版节奏 |
| `mail` | `send` `fetch_inbox` `search` | IMAP/SMTP，凭据敏感，单独隔离 |
| `lab-ml`（可选，v1.1） | `train_regressor` `predict` `shap_summary` | 材料 ML（numpy/sklearn/xgboost），体积大，不塞进上面三个 |

每个 Tool 实现 JSON-RPC 三方法：`describe` / `health` / `invoke`（stdin/stdout 逐行）。`invoke` 的 params 是 `{tool, arguments}`，**返回值必须包信封**：`{"success": true, "data": {...}}` 或 `{"success": false, "error": "..."}`，否则 iframe 侧只看到 `tool_failed`。日志 stderr，结果 stdout。

**LLM 任务一律不进 Tool**（翻译/润色/综述/审稿）——走 `llm.*`，在 UI 或 `agent.session` 里做。

---

## 6. 目标目录

```
scholarOS/
├─ WORKFLOW.md                  # 本文件
├─ app.json                     # listing 元数据（Console 也维护一份）
├─ manifest.json                # schema 4
├─ bundle/
│  ├─ index.html                # iframe 入口，引 AnnaAppRuntime SDK
│  ├─ api.js                    # ★ 唯一出口层
│  ├─ css/
│  ├─ vendor/                   # pdfjs / katex / mermaid / starmap
│  ├─ views/                    # 60 个视图改造后
│  └─ i18n/en.json
├─ executas/
│  ├─ paper-core/{executa.json,pyproject.toml,main.py,tools/}
│  ├─ literature/{...}
│  └─ mail/{...}
├─ tools/
│  ├─ extract-strings.mjs
│  ├─ lint-cjk.sh
│  └─ build-executa.ps1
├─ .github/workflows/build-executa.yml
└─ docs/{style-en.md, i18n-inventory.md, executa-contract.md, capability-map.md, decisions.md, listing/}
```

---

## 7. 阶段 P0–P8

### P0 — 环境与骨架（0.5 天）✅ 已完成

```bash
npm i -g @anna-ai/cli
export UV_DEFAULT_INDEX=https://mirrors.huaweicloud.com/repository/pypi/simple   # 必设，见下
anna-app doctor
anna-app init <dir> --slug scholaros     # 位置参数是目录
anna-app validate --strict
anna-app dev --no-llm                    # 无 PAT 也能开发
```

**踩坑（已解）**：不设 `UV_DEFAULT_INDEX` 时 `uvx` 卡在 `Downloading primp (6.1MiB)`，bridge 8 s 超时报 `python bridge did not signal ready`。不是代理问题（本机 `HTTP_PROXY=127.0.0.1:10090` 实测 200 正常），是 files.pythonhosted.org 大文件拉不动。换华为云镜像后 3.7 s 完成。

- `anna-app dev` 无 PAT 会拒绝启动；加 `--no-llm` 可跑（llm bridge disabled / storage 走内存 / web 走本地免 key）
- 发版仍需 `anna-app login --host <nexus-url>`（要人工浏览器 Approve）
- CLI 版本 **0.1.68**，schema 包 dispatcher_version 0.36.0
- 激活 developer handle `@Linder0613` 留到发布前

**验收**：`anna-app validate --strict` 通过；`anna-app dev --no-llm` 起在 `localhost:5180`，`GET /` 返回 200。

---

### P1 — 英文基线与归零门禁（4–5 天）✅ 已完成

**结果（2026-11-25）**：`bash tools/lint-cjk.sh` = OK（66 个非 vendor 文件 0 行 CJK / 全角标点），`node --check` 66/66 通过，`anna-app validate` 通过。字体栈里的 Microsoft YaHei / PingFang / SimSun / KaiTi 已换成 Inter / Georgia / JetBrains Mono。

遗留（不阻塞 P2）：示例数据仍是中文论文 3 篇；`docs/style-en.md` 未写。

**不做运行时 i18n**。这是纯英文版，没有语言切换需求，所以不建 `i18n/en.json`、不做 key 查表——直接在原文件里把文案改写成英语。省掉一整层框架和 60 个文件的取值改造。

1. `tools/extract-strings.mjs`（已写）：扫 `bundle/` 排除 `vendor/`，产出 `docs/i18n-inventory.md` —— 按文件统计 + 短标签表（≤40 字符，原地改）+ 长文本表（提示词/模板/示例，必须手写）+ 注释计数
2. `tools/lint-cjk.sh`（已写）：CJK + 全角标点归零门禁，排除 `vendor/`
3. `docs/style-en.md`：按钮动词开头、标题 Sentence case、错误 what+why+next、术语表（§8）
4. 字体：删 CJK 栈，主字体 Inter + JetBrains Mono
5. 示例数据换英文论文 3 篇

**实测清单（`node tools/extract-strings.mjs` 输出）**

| 项 | 数量 |
|---|--:|
| 含中文的文件 | 66 |
| 短标签（原地改） | **2700** |
| 长文本（手写） | **1253** |
| 注释/日志（不面向用户） | 316 |
| `lint-cjk.sh` 当前命中行 | **3159**（目标 0） |

**验收**：`bash tools/lint-cjk.sh` = OK（0 行）。

---

### P2 — 出口层收敛（3–4 天，最关键）

**目标**：bundle 里不再出现 `/api/*`，也不再依赖 localStorage。

```js
// bundle/api.js —— 全应用唯一出口
export const API = {
  upload(file), download(handle),                    // upload.* / files.*
  invoke(toolId, method, args), jobStatus(jobId),    // tools.*
  ask(messages, opts),                               // llm.*
  state: { get(k), set(k, v), patch(k, obj) },       // storage.*（<=256 KB）
  webFetch(url, opts),                               // web.*
};
```

替代表：`fetch('/api/task')` → `API.jobStatus()`；`fetch('/api/paper-toolbox/*')` → `API.invoke('paper-core', ...)`；`localStorage.*` → `API.state.*`；`fetch('/api/agent')` → `API.ask()`。

**验收**：
```bash
grep -rn "fetch('/api\|localStorage" bundle --include=*.js | grep -v api.js   # 必须空
anna-app validate --strict                                                    # Host API 名必须真实存在
```
**阻塞点**：`/api/task` 的轮询语义散在多个 view，换 `getJob` 时别把「等待」变成「卡死」。

---

### P3 — Executa 契约与实现（10–12 天）🟢 paper-core 已完成

**`paper-core` 已实现 11 个工具**（`executas/paper-core/paper_core.py`，单文件 + 自测）：

| 工具 | 依赖 | 实测 |
|---|---|---|
| `cite_format` | 无 | APA 7 / IEEE / Nature 三样式断言通过 |
| `references` | 无 | 去重 + 缺字段审计 + 可选排版 |
| `compliance` | 无 | 图表编号、引用越界、单位空格、缩写、绝对化表述 |
| `bib_parse` | 无 | 结构化记录（type/key/fields/missing） |
| `caption_compose` | 无 | 图/表题草稿，空输入与 0 编号报错 |
| `extract_text` | pdfplumber/python-docx | PDF/DOCX/TXT/MD/TeX，utf-8→latin-1 回退 |
| `parse_pdf` | pdfplumber | 真论文 11 页，逐页字符 [3118, 7439]，无空页 |
| `render_page` | pypdfium2 | 真论文 p1 → 1241×1648 @150dpi / 492 KB |
| `convert_docx` | python-docx | 写出 .docx 并回路径与段落数 |
| `image_convert` | Pillow | PNG→JPEG，max_side 800 → 602×800 / 110 KB |
| `merge_pdf` | pypdf | 2 篇 → 27 页 / 3.4 MB |

- 自测：`python executas/paper-core/paper_core.py --self-test`（系统 python 与 `.venv` 3.10 双跑均绿）
- RPC：`describe` / `health` / `invoke` 三方法手测通过，返回值严格 `{"success":…, "data":…}` 信封
- 体积：11 个工具、约 700 行、无框架

**自测抓到并修掉的真 bug**：缩写句点缺失、单作者作者串为空、单行 BibTeX 解析错位、caption 备注首字母未大写。

剩余 Executa：`literature`（联网，3 天）、`mail`（IMAP/SMTP，2 天）、`lab-ml`（延后 v1.1）。

**本地验证**：`anna-app dev` 自动发现 `executas/<name>/` 并以 stdio 进程监管；同时可：
```bash
python -m executas.paper_core.main --self-test
```

**验收**：`describe`/`health`/`invoke` 全通；`--self-test` 全绿；单次 invoke P95 < 3 s（`parse_pdf` 除外）。

---

### P4 — UI 视图迁移（12–15 天）

按 §4 分六组推进，每组一个可验收里程碑：

| 组 | 视图数 | 产出 | 验收 |
|---|---|---|---|
| 基础设施 | 14 | 骨架在 iframe 里跑起来 | `anna-app dev` 无 console 错误 |
| 论文生产线 | 14 | 工具箱 9 任务 + 工作流图 + 审稿 | 上传 PDF → 全任务可跑 |
| 文献情报 | 6 | 导入、RSS、EasyScholar、Zotero、星图 | 检索出结果，星图可渲染 |
| 项目任务 | 11 | 项目、任务、job 状态、轨迹、**虚拟办公室（AI 编队）** | 关窗重开状态还在（服务端权威） |
| 沟通类 | 9 | 聊天、邮件、prompt 库、日历、飞书 webhook | 发信成功、webhook 200 |
| 平台已接管 | 4 | 删除 + 引导文案 | 无死链 |

**多窗口要点**：`ui.views[]` 每项 = 一个可被 `open_app_view` 唤起的窗口；LLM 用 `open_app_view` / `update_app_view` 推状态。视图名必须唯一（validate 会查）。

---

### P5 — 本地化收尾（2–3 天）

| 项 | 从 | 到 |
|---|---|---|
| 引用样式 | GB/T 7714 | APA 7（默认）/ IEEE / Nature |
| 字段 | 卷/期/页 | Vol. / No. / pp. |
| 日期 | 2026年11月25日 | 2026-11-25 |
| 数字 | 万/亿 | 千分位 + SI |
| 报错 | 中文短句 | what + why + next |

---

### P6 — manifest 与 listing（1 天）

```json
{
  "schema": 4,
  "required_executas": [
    { "tool_id": "paper-core" },
    { "tool_id": "literature" }
  ],
  "optional_executas": [
    { "tool_id": "mail" }
  ],
  "storage": { "scopes": { "user": "rw" } },
  "system_prompt_addendum": "You are scholarOS, a meticulous research workbench... (<=4000 字符, 纯英文)",
  "ui": {
    "bundle": { "format": "static-spa", "entry": "index.html", "external_origins": [] },
    "views": [ { "name": "paper-toolbox", "title": "Paper Toolbox" } ],
    "host_api": { "credentials": ["google"] }
  }
}
```

红线：
- `extra="forbid"`：写 `permissions` / `host_capabilities` 直接拒
- `required_executas` 的 `tool_id` **必须已在目录里 public 或 app_bundled**（见 P7 顺序）
- `system_prompt_addendum` <= 4000 字符
- 用 `user_message_prefix_template` 时须恰好一个 `{user_message}`，且它只是提示、不会真替换

Listing（Console 的 Listing 页，不在 manifest）：name / slug / tagline<=60 / description 150–300 words / category / logo 512 PNG / 截图 5 张 / pricing。

---

### P7 — 发布顺序（0.5 天，**顺序不能反**）

```
1. 先发 Executa：paper-core → literature → mail（Executa Hub，visibility = public 或 app_bundled）
2. 再发 App：manifest 引用上面的 tool_id
3. anna-app validate --strict
4. anna-app publish
5. 自己安装 → 手测 → Submit for review
```

版本号 SemVer **严格大于**历史最大值（pre-release 排在正式版之前）。

**手测清单**（商店安装版）：`#scholarOS` 唤起 → 6 组视图逐个打开 → 上传 PDF 跑 9 任务 → 结果下载 → 关窗重开状态还在 → 邮件发一封 → 全英文无残留 → 窄窗口不塌。

---

### P8 — 构建流水线（1–2 天）

`anna-app dev` 本地用 `uv run` 起 Python，但**发布必须给 linux-x86_64 产物**（Cloud Agent 跑 Linux）。

`.github/workflows/build-executa.yml`：
- `ubuntu-latest`，Python 3.10，`uv pip install -r executas/*/requirements.txt`
- `pyinstaller --onedir`（不用 onefile）
- 矩阵：`linux-x86_64`（必需）、`darwin-arm64`、`win-x64`（本地调试）
- 产物先跑 `--self-test` 再上传 artifact

体积红线：`paper-core` < 50 MB；`literature` / `mail` < 20 MB。

---

## 8. 英文规范

- key：`view.section.item`（`paperToolbox.button.start`）
- 不抽：注释、日志、测试、`vendor/`
- 按钮动词开头无句点；标题 Sentence case；错误 what+why+next
- 禁用词：leverage / seamless / revolutionize / empower / unleash
- 术语表：论文工具箱 Paper Toolbox｜图注 Caption｜润色 Polish｜合规检查 Compliance Check｜参考文献 References｜文献库 Library｜知识星图 Star Map｜项目空间 Project Space｜转 Word Export to Word｜一键生成 Generate

---

## 9. 质量门

| 门 | 命令 | 通过条件 | 何时 |
|---|---|---|---|
| G1 无中文 | `bash tools/lint-cjk.sh` | OK | 每次提交 |
| G2 无本地接口 | `grep -rn "fetch('/api\|localStorage" bundle --include=*.js \| grep -v api.js` | 空 | P2 起每次提交 |
| G3 manifest | `anna-app validate --strict` | 零 error | P6 起每次提交 |
| G4 Executa | 三个 tool 各自 `--self-test` | 全绿 | P3 起每次提交 |
| G5 视图全覆盖 | 手测表 60 项 | 60/60 能打开 | P4 每组结束 |
| G6 手测 | §P7 清单 | 全过 | 每次 publish 前 |

G1/G2/G3 上 CI，否则中文与本地接口会回流。

---

## 10. 风险登记册

| # | 风险 | 概率 | 影响 | 兜底 |
|---|---|---|---|---|
| R1 | `pypdfium2` 的 `.so` 在 PyInstaller/linux 下丢失 | 高 | 高 | 先单验；失败则 `render_page` 降级，页面预览改 pdfjs 前端渲染（本来就有） |
| R2 | `paper-core` 体积超限 | 中 | 中 | 只装五个必需 wheel；numpy 只在 `lab-ml` 里 |
| R3 | Executa 未发布就发 App → `tool_id` 校验失败 | 高 | 中 | 固定 P7 顺序；发布前先 `validate` |
| R4 | 服务端权威状态 256 KB 上限装不下项目数据 | 中 | 高 | 大对象走 `files.*` / artifact，`storage` 只存索引与指针 |
| R5 | 团队成员状态在 Anna 里没有常驻 runner，靠 `getJob` 拉可能滞后 | 中 | 中 | 成员执行改 `agent.session` 后，状态以 job 为准；UI 显示「排队/运行/完成」三态，不追求秒级 |
| R6 | app 级定时任务无平台支持 | 高 | 低 | 改 Skill 配方 + 对话触发 |
| R7 | 60 视图工作量被低估 | 中 | 高 | P4 分六组，每组独立可验收，不做大爆炸合并 |
| R8 | 本地 Zotero 需 `agent.tools` 声明，审核多一项 | 中 | 低 | 默认 Zotero Web API；本地库作可选能力 |
| R9 | CLI / Host API 版本变动 | 中 | 高 | 锁 CLI 版本；升级前跑 G1–G4 |
| R10 | slug 大小写 | 高 | 低 | 用 `scholaros`，display 仍 `scholarOS` |
| R11 | 商店已有同名 ScholarOS | 中 | 低 | display 加副标题，slug 不动 |

---

## 11. 里程碑（全量版）

| 周 | 阶段 | 可演示 |
|---|---|---|
| W0 | P0 + P1 起 | 英文壳跑起来 |
| W1 | P1 收尾 + P2 | 无本地接口的 bundle，`validate --strict` 干净 |
| W2–W3 | P3 | 三个 Executa 本地全通 |
| W4–W6 | P4 六组 | 60 视图逐个点亮 |
| W6 | P5 + P6 | 本地化 + manifest 合规 |
| W7 | P7 | Tool 上目录 → App 上架 |
| W7 | P8 | linux 产物进 CI |

---

## 12. 决策记录

**已定**
- 名字 `scholarOS` / slug `scholaros` / handle `@Linder0613`
- 路线 B：schema 4 静态 SPA 多窗口 + 3 个 Tool + Skill 若干
- **全量迁移**，不裁剪范围；只有 §2.3 那 4 类不上
- 前端零构建，不引 esbuild
- 状态服务端权威，禁 localStorage

**待定（做到再定）**
- `lab-ml` 是否进 v1.1
- 是否用 `user_message_prefix_template`
- 收费策略（先免费）

---

## 13. 一句话顺序

`doctor` → `init` → 抽串归零 → 收敛出口层 → 三个 Executa → 六组视图 → 本地化 → manifest → **先发 Tool 再发 App** → CI 出 linux 产物。
