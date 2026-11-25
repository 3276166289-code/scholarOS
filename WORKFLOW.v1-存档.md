# scholarOS — Anna App 化工作流程

> 工作区：`C:\Users\24410\Desktop\科研agent\scholarOS`
> 源仓库（只读参考，不作改动）：`C:\Users\24410\Desktop\览籍智研2.0`
> 状态：方案定稿，未开工。路线 B（静态 SPA bundle + 1 个 Python Executa）。

---

## 0. 目标与验收定义

**一句话目标**：把「览籍智研 2.0」的论文工具箱主线，改造成 Anna App `@Linder0613/scholarOS`——纯英文界面、静态 SPA bundle、单个 Python Executa，经 `anna-app apps publish` 上架 Anna App Store。

**验收三条（全部满足才算完）**

| # | 验收项 | 判据 |
|---|---|---|
| V1 | 构建合规 | `anna-app validate` 零 error |
| V2 | 运行正确 | 商店安装后英文全流程可走通：上传 → 工具箱任务 → 结果下载；无中文残留、无 404、不依赖 localhost:8766 |
| V3 | 上架成功 | Review Approved，状态 PUBLISHED，`anna.partners/store/@Linder0613/scholarOS` 可访问 |

**身份信息（已定，不再讨论）**

| 项 | 值 | 备注 |
|---|---|---|
| Display name | `scholarOS` | 列表页显示 |
| Slug | `scholaros` | ⚠ 平台 slug 通常强制小写；若 Console 接受 `scholarOS` 则用之，否则用小写，显示名不受影响 |
| Handle | `@Linder0613` | 需先在 Console 激活 developer handle |
| 上架形态 | schema 4，`ui.bundle.format = static-spa` + 1 Executa | 路线 B |

---

## 1. 基线：源仓库实测盘点（2026-11-25）

以下是实际 grep / wc 的结果，不是估计。

| 对象 | 规模 | 说明 |
|---|---|---|
| `apps/desktop/web/` | 78 个 js/html/css 文件，18 MB | 含 `vendor/`（pdfjs、katex、mermaid、starmap、marked、dompurify） |
| 其中含中文的行 | **5126 行** | `notes-and-settings.js` 455、`chat-views.js` 283、`paper-translation.js` 154 |
| `index.html` | 202 行 | **无打包器**，按顺序 `<script src>` 加载约 30 个 view |
| `css/app.css` | 2891 行 | 单一主样式表 + 各 view 自带 css |
| `apps/desktop/server.py` + `handlers/` | 约 3095 行（含 355 行中文） | 本地 HTTP 服务，端口 8766 |
| `packages/` | 6 个包：ai-runtime / connectors / contracts / database / workspace-core / workspace-service | 全仓 Python 合计 **73,083 行** |
| `paper-toolbox.js` | 54 KB | 9 类任务：caption / image_convert / translate / polish / convert / references / compliance / pdf_translate / mermaid |
| 后端接口 | 12 个 | `/api/paper-toolbox{,/file,/import,/preview,/result,/save,/start,/upload}`、`/api/agent{,/cancel}`、`/api/conv/open`、`/api/trans/status`、`/api/task` |
| 本机工具链 | node v24.16 / npm 11.13 / uv 0.12.9 | Anna CLI 要求 node ≥22 ✓，`anna-app` **未安装** |
| Python 依赖 | pypdf / pdfplumber / Pillow / pypdfium2 / python-docx / PyYAML / numpy / langgraph | 前五个是 Executa 真正需要的 |

### 三条决定性结论

1. **前端没有构建步骤**。`index.html` 顺序加载 30 个脚本，纯全局变量协作。Anna bundle 只要求「静态文件能跑」，所以**继续零构建**——引入 esbuild 会多一条工具链和一次调试面，首版不需要。等 bundle 超过 5 MB 或首屏 >3 s 再说。
2. **所有数据面都收敛在 `fetch('/api/...')` 上**。这是整个改造里唯一真正需要设计的抽象：把这 12 个调用点收成一个 `api.js`，再把 `api.js` 的实现从「本地 HTTP」换成「Anna host API + Executa invoke」。其余 view 一行都不用动。
3. **73k 行 Python 里只有 handlers 那 3 千行是我们的服务面**。`packages/ai-runtime`、`database` 在 Anna 上由平台接管，不搬。搬得越少，审核面越小。

---

## 2. 目标目录结构

```
scholarOS/
├─ WORKFLOW.md                  # 本文件
├─ app.json                     # anna-app init 生成的应用身份
├─ manifest.json                # schema 4 运行时声明
├─ bundle/                      # 静态 SPA（从源 web/ 平移改造）
│  ├─ index.html                # 保留零构建顺序加载
│  ├─ css/app.css
│  ├─ vendor/                   # pdfjs / katex / mermaid / starmap 原样搬
│  ├─ views/                    # 平移 + 英文改写
│  ├─ i18n/en.json              # 抽取出的短标签
│  └─ api.js                    # ★ 唯一的出口层（P2 产出）
├─ executas/
│  └─ paper-core/
│     ├─ executa.json           # 工具清单与入参 schema
│     ├─ main.py                # 单入口，按 tool 名路由
│     ├─ tools/                 # 每个工具一个文件
│     └─ requirements.txt
├─ tools/
│  ├─ extract-strings.mjs       # 中文串抽取器
│  ├─ lint-cjk.sh               # CJK 归零门禁
│  └─ build-executa.ps1         # 本地 PyInstaller 构建
├─ .github/workflows/build-executa.yml   # linux-x86_64 矩阵构建
└─ docs/
   ├─ style-en.md               # 英文文案规范 + 术语表
   ├─ i18n-inventory.md         # 抽取清单（文件 → 条目 → 类型）
   ├─ executa-contract.md       # 工具契约
   └─ listing/                  # logo / 截图 / 文案
```

**为什么只有一个 Executa**：Anna 里每个 Executa 都是一份要构建、要签名、要过审的二进制。9 类任务全部是「文件进、文件出」的离线计算，共用 pdfplumber / Pillow / python-docx 同一批依赖——拆两个只会让两份依赖各占一轮体积。

---

## 3. 能力映射表（现状 → Anna）

| 现有能力 | 现在在哪 | Anna 里对应 | 动作 |
|---|---|---|---|
| 论文工具箱 9 类任务 | `paper-toolbox.js` + `/api/paper-toolbox/*` | Executa `paper-core` 的工具 | **改**：服务端逻辑重写成 tool 函数 |
| 文件上传 | `/api/paper-toolbox/upload` | `anna.files.upload` → 传给 Executa 的路径 | **改** |
| 结果保存/预览 | `/api/paper-toolbox/{save,result,preview,file}` | host storage + 浏览器下载 | **改** |
| LLM 调用（翻译/润色/改写） | `/api/agent`（本地转发） | bundle 侧 host `llm`；长任务走 Executa 的 `sampling` | **改** |
| 任务轮询 | `/api/task` 轮询 | 同步等待 + 前端进度条 | **砍**（轮询是本地 daemon 才需要的） |
| 项目/会话/任务持久化 | `packages/database` SQLite | host storage（`user: rw` scope）存 JSON | **改** |
| 本地目录遍历 | 文件系统直读 | 只认上传的文件 | **砍** |
| Zotero 本地 API（127.0.0.1:23119） | `project-zotero.js` | v2 走 Zotero Web API + 用户 API key | **砍**（v1） |
| 飞书长连接 / 邮件收发 | `lark-oapi` / `mail-view.js` | 无对应能力 | **砍** |
| 定时任务 / cron | `.agents/skills/scheduled-*` | 平台无 | **砍** |
| 知识星图 | `starmap.js` + `starmap-view.js` | 纯前端，原样可跑 | **搬** |
| 团队页 / 虚拟办公室 | `team-office.js` | 需要多人后端 | **砍** |
| 桌面窗口 pywebview | `server.py` | 平台 iframe | **砍** |
| 引用样式 GB/T 7714 | `references` / `compliance` 工具 | APA 7（默认）/ IEEE / Nature | **改** |
| 中文排版口径（不用小括号、不用分号） | 全局 | 英文版失效，改用英文标点规范 | **改** |

### 首版范围白名单（v1 只交付这些）

1. **论文工具箱**：caption、image_convert、convert、references、compliance 五类离线任务（纯计算，好验、不烧 token）
2. **translate / polish**：保留，但走 host `llm`，不进 Executa
3. **文献列表 + 项目空间**：只读列表 + 上传 + 结果下载
4. **知识星图**：原样搬
5. **pdf_translate**：v1.1 再上（它依赖长流程与轮询，是最大的不确定性）

明确不上：团队页、邮件、RSS、Zotero、飞书、定时任务、工作流图编辑器、执行板。**v1 的可审核面积越小，第一轮 review 越快。**

---

## 4. 阶段流程 P0–P7

每个阶段都有「产出」「验收命令」「阻塞点」。验收不过不进下一阶段。

---

### P0 — 立项与骨架（0.5 天）

**目标**：让 `anna-app` 在本机能跑，并且本工作区被平台认成一个合法应用。

```bash
cd /c/Users/24410/Desktop/科研agent/scholarOS
npm i -g @anna-ai/cli
anna-app --version                    # 记录版本，写进 package.json 的 engines
anna-app init --dir . --name scholarOS --slug scholaros
anna-app login --host https://anna.partners   # 浏览器 Approve，PAT 落在 ~/.config/anna/credentials.json
```

- 到 Console（`anna.partners/dashboard`）**激活 developer handle `@Linder0613`**。不激活，发布时会被拦。
- 把 CLI 版本号记进 `docs/decisions.md`——host API 会随版本变。

**产出**：`app.json`、`manifest.json` 空壳、`bundle/index.html` 占位。
**验收**：`anna-app validate` 能跑通（哪怕内容为空）。
**阻塞点**：handle 激活需要人工在浏览器点，卡住就先去 P1。

---

### P1 — 英文基线与归零门禁（3–4 天）

先做翻译，不是先搬代码。理由：后面每个阶段都要在英文语境里验，中文混着改会反复返工。

**步骤**

1. 写 `tools/extract-strings.mjs`（约 120 行，Node 原生，无依赖）：
   - 扫 `bundle/**/*.{js,html,css}`，排除 `vendor/`
   - **只抽短串**：字符串字面量 / HTML 文本节点，长度 ≤40 字符且不含换行 → 生成 `i18n/en.json` 的 key
   - **长文本不抽**：提示词、模板、示例论文正文、错误长文案 → 输出到 `docs/i18n-inventory.md` 的「人工重写」分区，逐条给出 `文件:行号` 和原文
2. 人工重写长文本（这部分机翻一定出戏，必须重写）
3. 建立 `tools/lint-cjk.sh`：

```bash
grep -rnP "[\x{4e00}-\x{9fff}]" bundle \
  --include=*.js --include=*.html --include=*.css \
  | grep -v "/vendor/" && { echo "CJK 残留"; exit 1; } || echo "OK"
```

4. 写 `docs/style-en.md`：句式（按钮动词开头、标题 Sentence case、错误消息 what+why+next）、标点（不保留全角，范围用 en dash）、术语表（见 §5）
5. 字体：删除 CJK 字体与 fallback 声明，主字体换 Inter，等宽换 JetBrains Mono

**产出**：`bundle/i18n/en.json`、`docs/i18n-inventory.md`、`docs/style-en.md`、`tools/lint-cjk.sh`
**验收**：`bash tools/lint-cjk.sh` 输出 OK；英文界面在本地 `npx serve bundle` 能看
**阻塞点**：5126 行里约 800 行是注释与日志，`lint-cjk.sh` 的排除规则要先定，否则天天假报警

---

### P2 — fetch 收敛为 adapter 层（2–3 天，最关键的架构动作）

**目标**：让 bundle 在**完全没有后端**的情况下跑起来。这是 P3 之前唯一的验证手段。

**步骤**

1. 新建 `bundle/api.js`，对外只暴露函数，不暴露 URL：

```js
// bundle/api.js —— 全应用唯一出口
export const API = {
  upload(file)                 { /* anna.files.upload → 返回 fileId */ },
  runTool(tool, fileId, opts)  { /* invoke executa paper-core */ },
  resultUrl(taskId)            { /* host storage 签名下载 */ },
  askLLM(messages)             { /* host llm */ },
  storage: { get(k), set(k,v), list() },
};
```

2. 全量替换：把 `paper-toolbox.js` 等文件里的 `fetch('/api/...')` 改为 `API.xxx()`。源仓库里 12 个端点，逐个对应。
3. 第一版实现走 **本地 mock**（`localStorage` + 内置 fixture），先把 UI 全流程跑通。

**产出**：`bundle/api.js` + 各 view 的调用点替换
**验收**：`grep -rn "fetch('/api" bundle --include=*.js | grep -v api.js` 输出为空
**阻塞点**：`/api/task` 的轮询语义散在多个 view，替换时注意别把「等待」变成「卡死」，统一改成 `await` + spinner

---

### P3 — Executa 契约与实现（5–7 天）

**目标**：`paper-core` 一个二进制，装 8 个工具，本地能跑、能自测。

**工具清单**（详细入参出参见 `docs/executa-contract.md`）

| tool | 用途 | 依赖 | 关键约束 |
|---|---|---|---|
| `parse_pdf` | 抽文本 + 词坐标 | pdfplumber | ≤30 页/次，≤50 MB |
| `extract_text` | txt/md/tex/docx/pdf → 纯文本 | pypdf, python-docx | 编码探测 UTF-8 优先 |
| `render_page` | 页面 → PNG | pypdfium2 | dpi 参数，≤300 |
| `convert_docx` | 文本 → .docx | python-docx | 模板可选 |
| `bib_parse` | .bib/.ris → 结构化条目 | 纯 Python 正则 | 解析失败要报行号 |
| `cite_format` | 条目 → APA 7 / IEEE / Nature | 纯 Python | 三种样式各有单测 |
| `caption_compose` | 图片 → 图注草稿 | Pillow（取尺寸） | 无 LLM，纯模板 |
| `image_convert` | PNG/JPG/WebP/TIFF 互转 | Pillow | 保持 EXIF 方向 |

**明确的边界**：LLM 任务（translate / polish / 改写）**不进 Executa**。Executa 是纯计算，进 LLM 会让它变慢、变贵、变不可测。

**步骤**

1. `executa.json` 写工具清单与入参 JSON Schema
2. `main.py` 单入口：`tool_name` 路由 + 统一错误包装（`{ok:false, code, message}`，绝不抛裸栈）
3. 每个 tool 一个文件，一个 `__main__` 自测块（用 `assets/fixtures/` 里的小样本）
4. 单个工具只留**一条**可跑的 check：`python main.py --self-test` 全过

**验收**

```bash
anna-app executa run paper-core parse_pdf --input assets/fixtures/in.json
python -m executas.paper_core.main --self-test
```

三个关键工具（parse_pdf / cite_format / convert_docx）在本地全绿。
**阻塞点**：pypdfium2 的 `.so` 在 PyInstaller 下常丢，先单独验它再谈全量

---

### P4 — 数据与格式本地化（2 天）

| 项 | 从 | 到 |
|---|---|---|
| 引用样式 | GB/T 7714 | APA 7（默认）/ IEEE / Nature |
| 字段名 | 卷/期/页 | Vol. / No. / pp. |
| 日期 | 2026年11月25日 | 2026-11-25（ISO） |
| 数字 | 万/亿 | 千分位 + SI 前缀 |
| 字体 | 中文字体栈 | Inter + JetBrains Mono |
| 示例数据 | 中文论文样例 | 英文论文样例（3 篇，真引用） |

`cite_format` 三种样式各留一条 fixture 断言，出偏差立刻红。

---

### P5 — manifest 与 listing（1 天）

`manifest.json`（schema 4，`extra="forbid"`，多写一个键直接被拒）：

```json
{
  "schema": 4,
  "storage": { "scopes": { "user": "rw" } },
  "system_prompt_addendum": "You are scholarOS, a meticulous research workbench for ... (≤4000 字符，纯英文)",
  "ui": {
    "bundle": { "format": "static-spa", "entry": "index.html", "external_origins": [] },
    "views": [ { "id": "paper-toolbox", "title": "Paper Toolbox" } ]
  },
  "executas": [ { "id": "paper-core", "path": "executas/paper-core" } ]
}
```

**不要写** `permissions` / `host_capabilities`——schema 4 会直接拒。reviewer 的核对清单就是 capability 声明，**声明越少，过审越快**。

**listing 素材**（Console 的 Listing 页填，不在 manifest 里）：

| 项 | 要求 |
|---|---|
| name | scholarOS |
| tagline | ≤60 字符，一句话说清「给科研人的论文工作台」 |
| description | 150–300 words 英文，先讲痛点再讲能力，末尾列清单 |
| category | Productivity / Research |
| logo | 512×512 PNG，透明底 |
| screenshots | 5 张，1280×800，全英文界面 |
| pricing | 先免费 |

---

### P6 — 构建流水线（1–2 天）

**为什么必须 CI**：Anna 的 Cloud Agent 跑 Linux，本机是 Windows。Executa 必须是 `linux-x86_64`。本地构建不算数。

`.github/workflows/build-executa.yml`：

- `runs-on: ubuntu-latest`
- Python 3.10（与源仓库 `requirements.txt` 一致），`uv pip install -r executas/paper-core/requirements.txt`
- `pyinstaller --onedir`（不用 `--onefile`，启动快且避免临时解包权限问题）
- 矩阵目标：`linux-x86_64`（**必需**）、`darwin-arm64`、`win-x64`（可选，仅桌面本地调试用）
- 产物上传为 artifact，并在 workflow 里跑一次 `--self-test`

**体积红线**：先控 <50 MB。pdfplumber + pypdfium2 + Pillow 已经占 ~20 MB，python-docx 和 numpy 能不加就不加（numpy 只有语义检索用，v1 不搬）。

**验收**：干净容器里 `./paper-core --self-test` 通过；`anna-app validate` 认得出 executas 段。

---

### P7 — 发布（0.5 天）

```bash
anna-app validate                      # 零 error 才继续
anna-app apps publish                  # 版本号 SemVer 严格递增，pre-release 排在正式版之前
# → Console 装回自己账号 → 关键路径手测
# → Submit for review
```

**手测清单**（Store 安装版，不是本地版）：上传 PDF → 跑 5 个离线工具 → 下载结果 → 刷新后历史还在 → 切语言无中文 → 手机尺寸视口不塌。

**回滚**：坏版本直接删；已安装用户发 patch 版本。发布后 24 h 内盯 Console 的崩溃/错误面板。

**阻塞点**：审核周期不可控（论坛有卡 In Review 两天的）。不要把上线日期绑在 review 上。

---

## 5. 英文规范与术语表

**key 命名**：`view.section.item`，例 `paperToolbox.button.start`、`compliance.error.missingRef`

**不抽的**：注释、日志、测试、`vendor/` 内一切

**英文规则**
- 按钮：动词开头，无句点 —— `Start`, `Download result`
- 标题：Sentence case —— `Paper toolbox`（不是 Paper Toolbox）
- 错误：what + why + next —— `Couldn't read the PDF. It looks scanned. Try OCR first.`
- 数字与单位：`10 mA h g⁻¹`，空格分隔，上标用 Unicode
- 禁用词：`leverage` / `seamless` / `revolutionize` / `empower` / `unleash`

**术语表（固定译法，不许各改各的）**

| 中文 | 英文 |
|---|---|
| 论文工具箱 | Paper Toolbox |
| 图注 | Caption |
| 润色 | Polish |
| 合规检查 | Compliance Check |
| 参考文献 | References |
| 文献列表 | Library |
| 知识星图 | Star Map |
| 项目空间 | Project Space |
| 一键生成 | Generate（不译成 one-click） |
| 转 Word | Export to Word |

---

## 6. 质量门（每道不过不进下一阶段）

| 门 | 命令 | 通过条件 | 何时跑 |
|---|---|---|---|
| G1 无中文 | `bash tools/lint-cjk.sh` | 输出 OK | 每次提交 / CI |
| G2 无本地接口 | `grep -rn "fetch('/api" bundle --include=*.js \| grep -v api.js` | 空 | P2 起每次提交 |
| G3 manifest | `anna-app validate` | 零 error | P5 起每次提交 |
| G4 Executa 自测 | `python -m executas.paper_core.main --self-test` | 全绿 | P3 起每次提交 |
| G5 首屏 | Lighthouse 冷启动 | <3 s | P5、P7 |
| G6 手测清单 | §P7 那 6 条 | 全过 | 每次 publish 前 |

`lint-cjk.sh` 与 G2 的 grep 上 CI，否则三个月后中文和本地接口会一起回流。

---

## 7. 风险登记册

| # | 风险 | 概率 | 影响 | 兜底 |
|---|---|---|---|---|
| R1 | pypdfium2 的 `.so` 在 PyInstaller/linux 下丢失 | 高 | 高 | 先单验；失败则 `render_page` 降级为不支持，页面预览改用 pdfjs 前端渲染（本来就有） |
| R2 | Executa 体积超限 | 中 | 中 | 只装五个必需 wheel；numpy / langgraph 一律不进 |
| R3 | slug 大小写被平台强制小写 | 高 | 低 | 用 `scholaros`，display name 仍是 scholarOS |
| R4 | 商店已有同名 ScholarOS | 中 | 低 | display name 加词（`scholarOS — Research Workbench`），slug 不动 |
| R5 | host API 随 CLI 版本变化 | 中 | 高 | 锁定 CLI 版本，写进 `docs/decisions.md`；升级前先跑一遍 G1–G4 |
| R6 | 审核因 capability 声明过多被拒 | 中 | 中 | 首版只声明真用到的；宁少不多 |
| R7 | `/api/task` 轮询改同步后长任务超时 | 中 | 中 | Executa 单次调用设上限，超 60 s 的任务（pdf_translate）推迟到 v1.1 |
| R8 | 中文长文本机翻后语义失真 | 高 | 中 | 长文本一律人工重写，只对短标签用抽取表 |

---

## 8. 里程碑

| 周 | 阶段 | 可演示的东西 |
|---|---|---|
| W0 | P0 + P1 | 英文壳跑起来，CJK 归零 |
| W1 | P2 | 无后端 mock 版，全流程可点 |
| W2–W3 | P3 | Executa 本地跑通 8 个工具 |
| W3 | P4 + P5 | 格式本地化 + manifest 合规 + 素材齐 |
| W4 | P6 + P7 | linux 二进制产出 → validate → publish → 提交审核 |

---

## 9. 决策记录

**已定**
- 名字 `scholarOS` / slug `scholaros` / handle `@Linder0613`
- 路线 B：static-spa bundle + 单 Python Executa
- 工作区 = 本目录；源仓库只读，不回写
- 前端零构建（不引 esbuild）
- v1 范围 = 首版白名单五条，其余砍

**待定（做到那一步再定，不提前设计）**
- `pdf_translate` 是否进 v1.1 还是砍掉
- Zotero 是否用 Web API 做进 v2
- 是否收费（先免费跑一轮 review）
- `api.js` 用 ESM 还是继续挂全局（取决于 index.html 现状，P2 时看）

---

## 10. 开工顺序（一句话版）

P0 装 CLI 激活 handle → P1 抽串 + CJK 归零 → P2 收敛 fetch → P3 写 Executa → P4 格式 → P5 manifest → P6 CI 构建 → P7 发布。

**任何阶段卡住超过半天，就去问平台/查文档，不要自己造轮子绕过去。**
