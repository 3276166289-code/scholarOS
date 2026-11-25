/* Local capability editors. No MCP process is started by rendering this page. */
(() => {
  "use strict";
  const sections = new Set(["skills", "tools", "mcp"]);
  const cache = new Map();
  let projectId = "", view = "list", search = "", request = 0, activeDialogClose = null;
  const e = value => esc(String(value ?? ""));
  const context = () => projectId ? {project_id: projectId} : {};
  const query = () => projectId ? "?project_id=" + encodeURIComponent(projectId) : "";
  const labels = {skills: "Skills", tools: "Tools", mcp: "MCP"};
  const kinds = {skills: "skill", tools: "tool", mcp: "mcp"};
  const styles = document.createElement("style");
  styles.textContent = `
    .cap-toolbar .control{min-width:150px;max-width:270px}
    .cap-matrix-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px}
    .cap-cats{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .cap-cat-pill{border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;color:var(--muted);transition:all .15s;display:inline-flex;align-items:center;gap:5px}
    .cap-cat-pill:hover{border-color:var(--accent);color:var(--fg)}
    .cap-cat-pill.on{background:color-mix(in srgb,var(--accent) 15%,transparent);border-color:var(--accent);color:var(--accent)}
    .cap-cat-count{font-size:10.5px;padding:1px 6px;border-radius:999px;background:var(--panel2,rgba(255,255,255,0.06));opacity:.85}

    /* List View Styles */
    .cap-list{display:flex;flex-direction:column;gap:7px;margin-top:12px}
    .cap-list-row{display:flex;align-items:center;gap:14px;padding:11px 16px;background:var(--panel,var(--bg));border:1px solid var(--line);border-radius:10px;cursor:pointer;transition:all .15s ease}
    .cap-list-row:hover{background:color-mix(in srgb,var(--accent) 7%,var(--panel,var(--bg)));border-color:color-mix(in srgb,var(--accent) 45%,var(--line));box-shadow:0 3px 10px rgba(0,0,0,0.05);transform:translateY(-1px)}
    .cap-row-icon{font-size:18px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:8px;background:var(--panel2,rgba(255,255,255,0.04));border:1px solid var(--line)}
    .cap-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
    .cap-row-top{display:flex;align-items:center;gap:8px}
    .cap-item-name{font-size:14px;font-weight:600;color:var(--fg);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cap-scope-pill{font-size:11px;padding:1px 7px;border-radius:999px}
    .cap-scope-pill.user{color:#38bdf8;border-color:color-mix(in srgb,#38bdf8 35%,transparent);background:color-mix(in srgb,#38bdf8 10%,transparent)}
    .cap-scope-pill.proj{color:#a855f7;border-color:color-mix(in srgb,#a855f7 35%,transparent);background:color-mix(in srgb,#a855f7 10%,transparent)}
    .cap-row-desc{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4}
    .cap-row-meta{flex-shrink:0;display:flex;align-items:center;gap:8px}
    .cap-binding-badge{font-size:12px;padding:2px 8px;border-radius:6px;background:var(--panel2,rgba(255,255,255,0.04));border:1px solid var(--line);color:var(--muted);white-space:nowrap}
    .cap-row-actions{flex-shrink:0;display:flex;align-items:center;gap:6px}
    .cap-btn-sm{padding:4px 10px;font-size:12px;border-radius:6px;line-height:1.4;white-space:nowrap}

    /* Detail View Styles */
    .cap-detail-nav-card{margin-bottom:12px;padding:12px 18px}
    .cap-detail-nav{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
    .cap-detail-nav-left{display:flex;align-items:center;gap:12px}
    .cap-btn-back{font-weight:600;display:inline-flex;align-items:center;gap:6px}
    .cap-breadcrumbs{display:flex;align-items:center;gap:8px;font-size:14px}
    .cap-breadcrumbs .sep{color:var(--muted);opacity:.6}
    .cap-detail-nav-right{display:flex;align-items:center;gap:8px}

    .cap-detail-card{padding:22px;border-radius:12px;background:var(--panel,var(--bg));border:1px solid var(--line)}
    .cap-detail-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;padding-bottom:16px;border-bottom:1px solid var(--line)}
    .cap-detail-title-group{display:flex;align-items:center;gap:14px}
    .cap-detail-icon{font-size:30px;width:50px;height:50px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--panel2,rgba(255,255,255,0.05));border:1px solid var(--line)}
    .cap-detail-title{margin:0;font-size:20px;font-weight:700;letter-spacing:-0.01em;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
    .cap-detail-tags{display:flex;gap:8px;align-items:center;margin-top:6px}

    .cap-detail-path-box{display:flex;align-items:center;gap:10px;background:var(--panel2,rgba(255,255,255,0.03));padding:10px 14px;border-radius:8px;border:1px solid var(--line);margin:16px 0}
    .cap-detail-path-box code{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted)}

    .cap-detail-section{margin-top:20px}
    .cap-section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px}
    .cap-section-title{font-size:14px;font-weight:700;margin:0;color:var(--fg)}
    .cap-detail-desc{font-size:13.5px;line-height:1.65;color:var(--fg);background:var(--panel2,rgba(255,255,255,0.03));padding:14px 16px;border-radius:8px;border:1px solid var(--line);white-space:pre-wrap;overflow-wrap:anywhere}

    .cap-detail-assistants-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-top:8px}
    .cap-detail-as-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel2,var(--bg));cursor:pointer;transition:all .15s}
    .cap-detail-as-item:hover{border-color:var(--accent)}
    .cap-detail-as-item.checked{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--panel2,var(--bg)))}
    .cap-detail-as-item input{width:16px;height:16px;cursor:pointer}
    .cap-as-name{font-size:13px;font-weight:500;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    .cap-file-tabs{display:flex;gap:4px}
    .cap-file-tabs .btn.active{background:color-mix(in srgb,var(--accent) 18%,transparent);border-color:var(--accent);color:var(--accent);font-weight:600}
    .cap-code-view{background:var(--panel2,#121316);border:1px solid var(--line);border-radius:8px;padding:14px 16px;max-height:480px;overflow:auto}
    .cap-code-view pre{margin:0;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--fg)}
    .cap-detail-editor{width:100%;min-height:360px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;line-height:1.6;resize:vertical;border-radius:8px;padding:12px;box-sizing:border-box}

    /* Existing Matrix & Dialog Styles */
    .cap-th-corner{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .cap-th-col{display:flex;flex-direction:column;align-items:center;gap:4px;white-space:nowrap;padding:4px 0}
    .cap-row-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .cap-row-title{min-width:0;line-height:1.3}
    .cap-bulk-btns{display:flex;align-items:center;gap:4px;flex-shrink:0}
    .cap-btn-mini{font-size:10.5px;padding:1px 6px;border-radius:4px;border:1px solid var(--line);background:var(--panel);cursor:pointer;line-height:1.4;transition:all .15s}
    .cap-btn-mini.on:hover{background:color-mix(in srgb,var(--accent) 20%,transparent);border-color:var(--accent);color:var(--accent)}
    .cap-btn-mini.off:hover{background:color-mix(in srgb,var(--err,#bd3f34) 20%,transparent);border-color:var(--err,#bd3f34);color:var(--err,#bd3f34)}
    .cap-table{overflow:auto;max-height:calc(100vh - 280px);min-height:360px;border:1px solid var(--line);border-radius:10px;position:relative}
    .cap-table table{margin:0;min-width:max-content;border-collapse:separate;border-spacing:0}
    .cap-table th{position:sticky;top:0;background:var(--panel2,var(--bg));z-index:2;border-bottom:1px solid var(--line);padding:8px 10px}
    .cap-table th:first-child,.cap-table td:first-child{position:sticky;left:0;background:var(--panel,var(--bg));z-index:1;min-width:260px;max-width:320px;white-space:normal;overflow-wrap:anywhere;box-shadow:1px 0 0 var(--line)}
    .cap-table th:first-child{z-index:3;background:var(--panel2,var(--bg))}
    .cap-table input{width:18px;height:18px;cursor:pointer}
    .cap-overlay{position:fixed;inset:0;z-index:9000;background:#0008;display:flex;align-items:center;justify-content:center;padding:18px}
    .cap-dialog{background:var(--panel,var(--bg));border:1px solid var(--line);border-radius:16px;padding:22px;width:min(1050px,95vw);max-height:90vh;overflow:auto;box-shadow:0 24px 80px #0005}
    .cap-dialog-head{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:14px}.cap-dialog h3{margin:0;overflow-wrap:anywhere}
    .cap-dialog textarea{width:100%;min-height:390px;resize:vertical;font-family:Consolas,monospace;line-height:1.6}.cap-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:58vh;overflow:auto}
    .cap-field{display:grid;gap:6px;margin:12px 0}.cap-error{color:var(--danger,#bd3f34);white-space:pre-wrap}.cap-hint{margin:12px 0;overflow-wrap:anywhere}
    @media(max-width:650px){.cap-overlay{padding:6px}.cap-dialog{padding:14px;max-height:96vh}.cap-dialog textarea{min-height:300px}.cap-list-row{flex-direction:column;align-items:flex-start}.cap-row-meta,.cap-row-actions{width:100%;justify-content:space-between}}
  `;
  document.head.appendChild(styles);

  function notify(message, type) {
    if (typeof toast === "function") toast(message, type);
  }
  function dialog(title, html, bind) {
    activeDialogClose?.();
    const overlay = document.createElement("div");
    overlay.className = "cap-overlay";
    overlay.innerHTML = `<section class="cap-dialog" role="dialog" aria-modal="true" aria-label="${e(title)}"><div class="cap-dialog-head"><h3>${e(title)}</h3><button class="btn ghost" data-close aria-label="Close">Close</button></div>${html}<p class="cap-error" data-error role="alert"></p></section>`;
    const previousFocus = document.activeElement;
    function close() {
      overlay.querySelectorAll("textarea,input").forEach(field => { field.value = ""; });
      overlay.remove();
      document.removeEventListener("keydown", keydown);
      if (activeDialogClose === close) activeDialogClose = null;
      previousFocus?.focus();
    }
    function keydown(event) {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const fields = [...overlay.querySelectorAll("button,input,textarea,select,[tabindex]")].filter(node => !node.hidden && !node.disabled && node.offsetParent);
      if (!fields.length) return;
      const first = fields[0], last = fields[fields.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    activeDialogClose = close;
    overlay.querySelector("[data-close]").onclick = close;
    overlay.onclick = event => { if (event.target === overlay) close(); };
    document.body.appendChild(overlay);
    overlay.querySelector("button").focus();
    bind?.(overlay, close);
    return overlay;
  }
  function fail(host, error) {
    const target = host.querySelector("[data-error]");
    if (target) target.textContent = error.message || String(error);
    else notify(error.message || String(error), "error");
  }
  async function update() {
    cache.delete(projectId);
    skillFileCache.clear();
    await load();
  }
  function checked(meta, aid, kind, itemId) {
    const binding = meta.bindings.find(item => item.assistant_id === aid && item.kind === kind && item.item_id === itemId);
    if (binding) return Boolean(binding.enabled);
    const global = meta.bindings.find(item => item.assistant_id === "*" && item.kind === kind && item.item_id === itemId);
    return global ? Boolean(global.enabled) : meta.default_enabled !== false;
  }
  let currentCategory = "all";
  let selectedId = null;
  let detailTab = "preview";
  let currentSection = "";
  const skillFileCache = new Map();

  function itemCategory(item) {
    const text = ((item.label || "") + " " + (item.description || item.desc || "") + " " + (item.id || item.name || "")).toLowerCase();
    if (/arxiv|pubmed|scholar|search|cite|lit|bib|paper|Search|Literature|Citation|Reading|Deep reading/.test(text)) return "literature";
    if (/write|doc|outline|draft|review|compile|edit|Writing|Outline|Drafting|Review|Typesetting|Body|Change/.test(text)) return "writing";
    if (/file|folder|vault|note|library|obsidian|read|attachment|skill_read|Knowledge|Workspace|Notes|Attachments/.test(text)) return "workspace";
    if (/feishu|zotero|mail|hook|webhook|Lark|Mail|Integrations|Messaging/.test(text)) return "integration";
    return "general";
  }
  const CATEGORIES = [
    {id: "all", label: "All", icon: "📋"},
    {id: "literature", label: "Literature search", icon: "🔎"},
    {id: "writing", label: "Paper writing", icon: "✍️"},
    {id: "workspace", label: "Knowledge and workspace", icon: "📚"},
    {id: "integration", label: "Integrations", icon: "🔌"},
    {id: "general", label: "General", icon: "⚙️"}
  ];

  function categoryIcon(item) {
    const cat = itemCategory(item);
    const map = {literature: "🔎", writing: "✍️", workspace: "📚", integration: "🔌", general: "⚙️"};
    return map[cat] || "⚡";
  }
  function categoryLabel(item) {
    const cat = typeof item === "string" ? item : itemCategory(item);
    const found = CATEGORIES.find(c => c.id === cat);
    return found ? found.label : "General";
  }
  function categoryCount(meta, catId) {
    const list = meta[setSec] || [];
    if (catId === "all") return list.length;
    return list.filter(item => itemCategory(item) === catId).length;
  }
  function bindingBadgeText(meta, item) {
    const kind = kinds[setSec];
    const assistants = meta.assistants || [];
    let count = 0;
    assistants.forEach(a => {
      if (checked(meta, a.id, kind, item.id)) count++;
    });
    if (count === 0) return `<span class="cap-binding-badge" style="opacity:.6">Unauthorized expert</span>`;
    if (count === assistants.length) return `<span class="cap-binding-badge" style="color:var(--accent);border-color:color-mix(in srgb,var(--accent) 30%,transparent)">All experts (${count})</span>`;
    return `<span class="cap-binding-badge">${count}/${assistants.length} experts</span>`;
  }

  function filtered(meta) {
    const needle = search.trim().toLocaleLowerCase();
    let list = meta[setSec] || [];
    if (currentCategory !== "all") {
      list = list.filter(item => itemCategory(item) === currentCategory);
    }
    if (needle) {
      list = list.filter(item => [item.name, item.label, item.description, item.desc].some(value => String(value || "").toLocaleLowerCase().includes(needle)));
    }
    return list;
  }
  function drawMatrix(meta, items) {
    const kind = kinds[setSec];
    const assistants = [{id: "*", name: "Default / No expert bound"}, ...meta.assistants];
    return `
      <div class="cap-matrix-header">
        <p class="hint" style="margin:0">Ticking saves at once; scrolls sideways/Vertical/One switch enables or disables everything. Scroll smoothly in both directions; the header and capability column stay fixed.</p>
        <div class="cap-cats">
          ${CATEGORIES.map(c => `<button class="cap-cat-pill ${currentCategory === c.id ? "on" : ""}" data-cap-cat="${c.id}">${c.icon} ${c.label}</button>`).join("")}
        </div>
      </div>
      <div class="cap-table" id="capTableWrap">
        <table>
          <thead>
            <tr>
              <th>
                <div class="cap-th-corner">
                  <span>${labels[setSec]} (${items.length})</span>
                  <div class="cap-bulk-btns">
                    <button class="cap-btn-mini on" id="cap-mat-all-on" title="Enable every item in this category for all experts">All on</button>
                    <button class="cap-btn-mini off" id="cap-mat-all-off" title="Disable every item in this category for all experts">All off</button>
                  </div>
                </div>
              </th>
              ${assistants.map(a => `<th title="${e(a.id)}">
                <div class="cap-th-col">
                  <b>${e(a.name)}${a.enabled === 0 ? "(off)" : ""}</b>
                  <div class="cap-bulk-btns">
                    <button class="cap-btn-mini on" data-col-toggle="${e(a.id)}" data-action="1" title="Enable this column for every entry of this expert">All on</button>
                    <button class="cap-btn-mini off" data-col-toggle="${e(a.id)}" data-action="0" title="Turn off this column for that expert">All off</button>
                  </div>
                </div>
              </th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map(item => `<tr>
              <td>
                <div class="cap-row-head">
                  <div class="cap-row-title">
                    <strong>${e(item.label || item.name)}</strong>
                    ${item.scope ? `<br><span class="hint">${e(item.scope)}</span>` : ""}
                  </div>
                  <div class="cap-bulk-btns">
                    <button class="cap-btn-mini on" data-row-toggle="${e(item.id)}" data-action="1" title="Enable all experts for this item (all of them)">All on</button>
                    <button class="cap-btn-mini off" data-row-toggle="${e(item.id)}" data-action="0" title="Disable all experts for this item (all across the row)">All off</button>
                  </div>
                </div>
              </td>
              ${assistants.map(a => `<td style="text-align:center">
                <input type="checkbox" data-cap-binding data-kind="${kind}" data-item="${e(item.id)}" data-assistant="${e(a.id)}" aria-label="${e(a.name + ' / ' + item.name)}" ${checked(meta, a.id, kind, item.id) ? "checked" : ""}>
              </td>`).join("")}
            </tr>`).join("") : `<tr><td colspan="${assistants.length + 1}" style="text-align:center;padding:24px;color:var(--muted)">No projects in this category</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }
  function drawListView(meta, items) {
    const section = setSec;
    if (!items.length) {
      return `<div class="card" style="text-align:center;padding:36px;color:var(--muted)"><h4>Nothing matched${labels[section]}</h4><p class="hint">Adjust the search terms or switch the category filter above.</p></div>`;
    }
    return `<div class="cap-list">
      ${items.map(item => `
        <div class="cap-list-row" data-cap-row="${e(item.id)}" title="Click to view details">
          <div class="cap-row-icon" title="${e(categoryLabel(item))}">${categoryIcon(item)}</div>
          <div class="cap-row-main">
            <div class="cap-row-top">
              <span class="cap-item-name" title="${e(item.label || item.name)}">${e(item.label || item.name)}</span>
              <span class="pill cap-scope-pill ${item.scope === 'project' ? 'proj' : 'user'}">${item.scope === 'project' ? 'Project' : 'Global'}</span>
              ${section === 'mcp' ? `<span class="pill ${item.enabled ? 'on' : 'off'}">${item.enabled ? 'Enable' : 'Disable'}</span>` : ''}
              ${item.installation ? `<span class="pill" title="${e(item.installation.source)}">Installed</span>` : ''}
            </div>
            <div class="cap-row-desc" title="${e(item.description || item.desc || '')}">${e(item.description || item.desc || 'No description')}</div>
          </div>
          <div class="cap-row-meta">
            ${bindingBadgeText(meta, item)}
          </div>
          <div class="cap-row-actions">
            <button class="btn ghost cap-btn-sm" data-cap-detail="${e(item.id)}" title="Open details">Details →</button>
            <button class="btn ghost cap-btn-sm" data-cap-preview="${e(item.id)}" title="Quick popup preview/edit">Preview/Edit</button>
          </div>
        </div>
      `).join("")}
    </div>`;
  }

  function drawDetailView(meta, item, items) {
    const section = setSec;
    const kind = kinds[section];
    const assistants = [{id: "*", name: "Default / No expert bound"}, ...meta.assistants];
    const currentIndex = items.findIndex(it => it.id === item.id);
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex >= 0 && currentIndex < items.length - 1;
    const prevId = hasPrev ? items[currentIndex - 1].id : "";
    const nextId = hasNext ? items[currentIndex + 1].id : "";

    return `
      <div class="card cap-detail-nav-card">
        <div class="cap-detail-nav">
          <div class="cap-detail-nav-left">
            <button class="btn ghost cap-btn-back" id="cap-back-list">← Back to the skill list</button>
            <div class="cap-breadcrumbs">
              <span class="muted">${labels[section]}</span>
              <span class="sep">/</span>
              <strong>${e(item.label || item.name)}</strong>
            </div>
          </div>
          <div class="cap-detail-nav-right">
            <button class="btn ghost cap-btn-sm" id="cap-prev-item" data-target="${e(prevId)}" ${hasPrev ? "" : "disabled"} title="Previous skill">← Previous item</button>
            <span class="hint" style="font-size:12px">${currentIndex >= 0 ? currentIndex + 1 : 1} / ${items.length}</span>
            <button class="btn ghost cap-btn-sm" id="cap-next-item" data-target="${e(nextId)}" ${hasNext ? "" : "disabled"} title="Next skill">Next item →</button>
          </div>
        </div>
      </div>

      <div class="card cap-detail-card">
        <div class="cap-detail-header">
          <div class="cap-detail-title-group">
            <div class="cap-detail-icon">${categoryIcon(item)}</div>
            <div>
              <h3 class="cap-detail-title">${e(item.label || item.name)}</h3>
              <div class="cap-detail-tags">
                <span class="pill cap-scope-pill ${item.scope === 'project' ? 'proj' : 'user'}">
                  ${item.scope === 'project' ? 'Project skills (.agents/skills)' : item.scope === 'builtin' ? 'Built-in app skills (.agents/skills)' : 'Global user skills (~/.agents/skills)'}
                </span>
                <span class="pill">${categoryLabel(item)}</span>
                ${section === 'mcp' ? `<span class="pill ${item.enabled ? 'on' : 'off'}">${item.enabled ? 'Enabled' : 'Disabled'}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="cap-detail-head-actions">
            <button class="btn ghost cap-btn-sm" data-cap-preview="${e(item.id)}" title="Preview and edit in a dialog">Edit in a dialog</button>
          </div>
        </div>

        ${item.path ? `
        <div class="cap-detail-path-box">
          <span class="hint" style="font-weight:600;white-space:nowrap">File path: </span>
          <code id="cap-path-text" title="${e(item.path)}">${e(item.path)}</code>
          <button class="btn ghost cap-btn-sm" id="cap-copy-path">Copy path</button>
        </div>` : ''}
        ${item.installation ? `<p class="hint" style="overflow-wrap:anywhere">Source: ${e(item.installation.source)} · ${item.installation.files} files · ${e(item.installation.installed_at)}</p>` : ''}

        <div class="cap-detail-section">
          <h4 class="cap-section-title">What it does</h4>
          <div class="cap-detail-desc">${e(item.description || item.desc || "No description")}</div>
        </div>

        <div class="cap-detail-section">
          <div class="cap-section-head">
            <div>
              <h4 class="cap-section-title">Expert enablement grants</h4>
              <p class="hint" style="margin:2px 0 0">Choose which experts may use this in workflows and chats. Ticking saves at once.</p>
            </div>
            <div class="cap-bulk-btns">
              <button class="cap-btn-mini on" id="cap-detail-all-on">Enable all</button>
              <button class="cap-btn-mini off" id="cap-detail-all-off">Disable all</button>
            </div>
          </div>
          <div class="cap-detail-assistants-grid">
            ${assistants.map(a => `
              <label class="cap-detail-as-item ${checked(meta, a.id, kind, item.id) ? 'checked' : ''}">
                <input type="checkbox" data-detail-binding data-assistant="${e(a.id)}" data-item="${e(item.id)}" data-kind="${kind}" ${checked(meta, a.id, kind, item.id) ? 'checked' : ''}>
                <span class="cap-as-name">${e(a.name)}${a.id === '*' ? '(Default)' : ''}</span>
              </label>
            `).join("")}
          </div>
        </div>

        ${section === 'skills' ? `
        <div class="cap-detail-section">
          <div class="cap-section-head">
            <h4 class="cap-section-title">SKILL.md Rule definition</h4>
            <div class="cap-file-tabs">
              <button class="btn ghost cap-btn-sm ${detailTab === 'preview' ? 'active' : ''}" id="cap-tab-preview">Document preview</button>
              <button class="btn ghost cap-btn-sm ${detailTab === 'edit' ? 'active' : ''}" id="cap-tab-edit">Edit source</button>
            </div>
          </div>
          <div id="cap-file-container">
            <p class="hint">Loading SKILL.md Content...</p>
          </div>
        </div>` : ''}

        ${section === 'tools' ? `
        <div class="cap-detail-section">
          <div class="cap-section-head">
            <h4 class="cap-section-title">Argument definitions (JSON Schema)</h4>
          </div>
          <pre class="cap-code-view"><code>${e(JSON.stringify(item.parameters, null, 2))}</code></pre>
        </div>` : ''}

        ${section === 'mcp' ? `
        <div class="cap-detail-section">
          <div class="cap-section-head">
            <h4 class="cap-section-title">Tools found (${item.tools.length})</h4>
            <button class="btn cap-btn-sm" data-cap-connect="${e(item.id)}">Connect / Fetch tools</button>
          </div>
          <div class="cap-list" style="margin-top:8px">
            ${item.tools.length ? item.tools.map(t => `
              <div class="cap-list-row" style="cursor:default">
                <div class="cap-row-main">
                  <div class="cap-row-top"><strong>${e(t.name)}</strong></div>
                  <div class="cap-row-desc">${e(t.description || "No description")}</div>
                </div>
              </div>
            `).join("") : `<p class="hint">No tools found yet; click "Connect / fetch tools".</p>`}
          </div>
        </div>` : ''}
      </div>
    `;
  }

  function paint(host, meta) {
    const section = setSec;
    if (section !== currentSection) {
      currentSection = section;
      selectedId = null;
    }
    const selected = document.activeElement?.id === "cap-search";
    const position = selected ? document.activeElement.selectionStart : 0;
    const items = filtered(meta);

    // If an item is selected and we're in list view, render the detail view
    if (view === "list" && selectedId) {
      const selectedItem = (meta[section] || []).find(it => it.id === selectedId);
      if (selectedItem) {
        host.innerHTML = drawDetailView(meta, selectedItem, items) + `<p class="cap-error" data-error role="alert"></p>`;

        // Wire detail view events
        host.querySelector("#cap-back-list").onclick = () => {
          selectedId = null;
          paint(host, meta);
        };
        const prevBtn = host.querySelector("#cap-prev-item");
        if (prevBtn && prevBtn.dataset.target) {
          prevBtn.onclick = () => {
            selectedId = prevBtn.dataset.target;
            paint(host, meta);
          };
        }
        const nextBtn = host.querySelector("#cap-next-item");
        if (nextBtn && nextBtn.dataset.target) {
          nextBtn.onclick = () => {
            selectedId = nextBtn.dataset.target;
            paint(host, meta);
          };
        }
        const copyBtn = host.querySelector("#cap-copy-path");
        if (copyBtn && selectedItem.path) {
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(selectedItem.path).then(() => {
              notify("Path copied to clipboard");
            }).catch(() => {
              notify("Copy failed, copy it manually", "error");
            });
          };
        }
        host.querySelectorAll("[data-cap-preview]").forEach(button => button.onclick = () => {
          if (section === "skills") editSkill(selectedItem).catch(error => fail(host, error));
          else editTool(selectedItem);
        });

        // Assistant toggles
        host.querySelectorAll("[data-detail-binding]").forEach(input => input.onchange = async () => {
          const next = input.checked;
          const aid = input.dataset.assistant;
          const kind = input.dataset.kind;
          const itemId = input.dataset.item;
          input.disabled = true;
          try {
            const binding = {assistant_id: aid, kind, item_id: itemId, enabled: next};
            await api("/api/capabilities/binding", {...context(), ...binding});
            meta.bindings = meta.bindings.filter(x => !(x.assistant_id === aid && x.kind === kind && x.item_id === itemId));
            meta.bindings.push(binding);
            input.disabled = false;
            input.closest(".cap-detail-as-item")?.classList.toggle("checked", next);
            notify(next ? "Expert authorization enabled" : "Expert authorization disabled");
          } catch (err) {
            input.checked = !next;
            input.disabled = false;
            fail(host, err);
          }
        });

        const detailAllOn = host.querySelector("#cap-detail-all-on");
        if (detailAllOn) detailAllOn.onclick = async () => {
          const kind = kinds[section];
          const assistants = [{id: "*"}, ...meta.assistants];
          const updates = assistants.map(a => ({assistant_id: a.id, kind, item_id: selectedItem.id, enabled: true}));
          try {
            await api("/api/capabilities/bindings", {...context(), bindings: updates});
            updates.forEach(u => {
              meta.bindings = meta.bindings.filter(x => !(x.assistant_id === u.assistant_id && x.kind === u.kind && x.item_id === u.item_id));
              meta.bindings.push(u);
            });
            paint(host, meta);
            notify("Authorized for every expert");
          } catch (err) { fail(host, err); }
        };

        const detailAllOff = host.querySelector("#cap-detail-all-off");
        if (detailAllOff) detailAllOff.onclick = async () => {
          const kind = kinds[section];
          const assistants = [{id: "*"}, ...meta.assistants];
          const updates = assistants.map(a => ({assistant_id: a.id, kind, item_id: selectedItem.id, enabled: false}));
          try {
            await api("/api/capabilities/bindings", {...context(), bindings: updates});
            updates.forEach(u => {
              meta.bindings = meta.bindings.filter(x => !(x.assistant_id === u.assistant_id && x.kind === u.kind && x.item_id === u.item_id));
              meta.bindings.push(u);
            });
            paint(host, meta);
            notify("Authorization off for every expert");
          } catch (err) { fail(host, err); }
        };

        // File loader for SKILL.md
        if (section === "skills") {
          const container = host.querySelector("#cap-file-container");
          const tabPreview = host.querySelector("#cap-tab-preview");
          const tabEdit = host.querySelector("#cap-tab-edit");

          function renderFileBody(content) {
            if (!container) return;
            if (detailTab === "preview") {
              container.innerHTML = `<div class="cap-code-view"><pre><code>${e(content)}</code></pre></div>`;
            } else {
              container.innerHTML = `
                <textarea class="control cap-detail-editor" id="cap-edit-area" spellcheck="false" aria-label="Skill file content">${e(content)}</textarea>
                <div class="cap-card-actions" style="margin-top:10px">
                  <button class="btn btn-primary" id="cap-file-save">Save to the skill file</button>
                  <button class="btn ghost" id="cap-file-cancel">Discard changes</button>
                </div>
              `;
              const saveBtn = container.querySelector("#cap-file-save");
              const cancelBtn = container.querySelector("#cap-file-cancel");
              const editArea = container.querySelector("#cap-edit-area");
              if (saveBtn) {
                saveBtn.onclick = async () => {
                  saveBtn.disabled = true;
                  saveBtn.textContent = "Saving...";
                  try {
                    await api("/api/capabilities/skill", {...context(), id: selectedItem.id, content: editArea.value});
                    skillFileCache.set(projectId + ":" + selectedItem.id, editArea.value);
                    notify("Skill file saved");
                    detailTab = "preview";
                    tabPreview?.classList.add("active");
                    tabEdit?.classList.remove("active");
                    renderFileBody(editArea.value);
                    await update();
                  } catch (err) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = "Save to skill file";
                    fail(host, err);
                  }
                };
              }
              if (cancelBtn) {
                cancelBtn.onclick = () => {
                  detailTab = "preview";
                  tabPreview?.classList.add("active");
                  tabEdit?.classList.remove("active");
                  renderFileBody(content);
                };
              }
            }
          }

          if (tabPreview) tabPreview.onclick = () => {
            detailTab = "preview";
            tabPreview.classList.add("active");
            tabEdit?.classList.remove("active");
            const cacheKey = projectId + ":" + selectedItem.id;
            renderFileBody(skillFileCache.get(cacheKey) || "");
          };
          if (tabEdit) tabEdit.onclick = () => {
            detailTab = "edit";
            tabEdit.classList.add("active");
            tabPreview?.classList.remove("active");
            const cacheKey = projectId + ":" + selectedItem.id;
            renderFileBody(skillFileCache.get(cacheKey) || "");
          };

          const cacheKey = projectId + ":" + selectedItem.id;
          if (skillFileCache.has(cacheKey)) {
            renderFileBody(skillFileCache.get(cacheKey));
          } else {
            api("/api/capabilities/skill?" + new URLSearchParams({...context(), id: selectedItem.id})).then(result => {
              skillFileCache.set(cacheKey, result.content || "");
              renderFileBody(result.content || "");
            }).catch(err => {
              if (container) container.innerHTML = `<p class="cap-error">${e(err.message || String(err))}</p>`;
            });
          }
        }

        return;
      }
      // If item not found, reset selectedId
      selectedId = null;
    }

    // Default: List or Matrix view
    host.innerHTML = `
      <div class="card">
        <h3>${labels[section]} <span class="pill">${items.length} / ${(meta[section] || []).length}</span></h3>
        <div class="cap-toolbar">
          <select class="control" id="cap-project" aria-label="Project skill scope">
            <option value="">User skills (global)</option>
            ${(S.tasks || []).map(task => `<option value="${e(task.id)}" ${task.id === projectId ? "selected" : ""}>${e(task.title)}</option>`).join("")}
          </select>
          <input class="control" id="cap-search" value="${e(search)}" placeholder="Search names, descriptions" aria-label="Search capabilities">
          <button class="btn ${view === "list" ? "" : "ghost"}" data-cap-view="list">List</button>
          <button class="btn ${view === "matrix" ? "" : "ghost"}" data-cap-view="matrix">Expert enablement matrix</button>
          <button class="btn ghost" id="cap-refresh">Refresh</button>
          ${section === "skills" ? `<button class="btn" id="cap-install">Install skill</button>` : ""}
          ${section === "skills" ? `<button class="btn ghost" id="cap-skill-sources">Sources</button>` : ""}
          ${section === "mcp" ? `<button class="btn" id="cap-mcp-json">JSON Edit / Key</button>` : ""}
        </div>
        <p class="hint">
          ${section === "skills" ? "reads user defaults ~/.agents/skills, Project settings layer on once you pick a project .agents/skills; A project skill with the same name wins. Click a skill to open and edit it SKILL.md. " : section === "tools" ? "Tools and MCP managed separately. You can edit a built-in tool's display name and model description; the implementation and parameter schema are read-only." : "Save JSON Starts no process. A local command runs only when you click connect or an expert calls a discovered tool/network access; use only trusted MCP. "}
        </p>
        ${section === "skills" ? `
        <div class="cap-cats" style="margin-top:12px">
          ${CATEGORIES.map(c => `
            <button class="cap-cat-pill ${currentCategory === c.id ? "on" : ""}" data-cap-cat="${c.id}">
              ${c.icon} ${c.label} <span class="cap-cat-count">${categoryCount(meta, c.id)}</span>
            </button>
          `).join("")}
        </div>` : ""}
        ${section === "mcp" ? `<p class="hint">Credential protection: ${e(meta.storage_security)}. Environment variables, request headers, command arguments, and secrets are hidden by default.</p>` : ""}
      </div>
      ${view === "matrix" ? drawMatrix(meta, items) : drawListView(meta, items)}
      ${section === "skills" ? `
      <div class="card cap-hint" style="margin-top:14px">
        <h4 style="margin:0 0 8px">Skill search folders (the later one wins)</h4>
        ${meta.skill_roots.map(root => `<p class="hint" style="margin:4px 0"><code>${e(root.path)}</code> · ${e(root.scope)} · ${root.exists ? "exists" : "Not created yet"}</p>`).join("")}
      </div>` : ""}
      <p class="cap-error" data-error role="alert"></p>
    `;

    host.querySelector("#cap-project").onchange = event => { projectId = event.target.value; selectedId = null; load(); };
    host.querySelector("#cap-search").oninput = event => { search = event.target.value; paint(host, meta); };
    const installButton = host.querySelector("#cap-install");
    if (installButton) installButton.onclick = () => window.SkillInstaller.open({
      dialog, projectId, projects: S.tasks || [], onInstalled: update
    });
    const sourcesButton = host.querySelector("#cap-skill-sources");
    if (sourcesButton) sourcesButton.onclick = () => window.SkillInstaller.open({
      dialog, projectId, projects: S.tasks || [], onInstalled: update, initialTab: "sources"
    });
    host.querySelectorAll("[data-cap-view]").forEach(button => button.onclick = () => { view = button.dataset.capView; selectedId = null; paint(host, meta); });
    host.querySelectorAll("[data-cap-cat]").forEach(b => b.onclick = () => { currentCategory = b.dataset.capCat; paint(host, meta); });

    // List row click to enter detail view
    host.querySelectorAll("[data-cap-row]").forEach(row => {
      row.onclick = event => {
        if (event.target.closest("button") || event.target.closest("input")) return;
        selectedId = row.dataset.capRow;
        paint(host, meta);
      };
    });
    host.querySelectorAll("[data-cap-detail]").forEach(button => {
      button.onclick = event => {
        event.stopPropagation();
        selectedId = button.dataset.capDetail;
        paint(host, meta);
      };
    });

    const matAllOn = host.querySelector("#cap-mat-all-on");
    if (matAllOn) matAllOn.onclick = async () => {
      const list = filtered(meta);
      const kind = kinds[setSec];
      const assistants = [{id: "*"}, ...meta.assistants];
      const updates = [];
      list.forEach(item => { assistants.forEach(a => { updates.push({assistant_id: a.id, kind, item_id: item.id, enabled: true}); }); });
      try {
        await api("/api/capabilities/bindings", {...context(), bindings: updates});
        updates.forEach(u => {
          meta.bindings = meta.bindings.filter(x => !(x.assistant_id === u.assistant_id && x.kind === u.kind && x.item_id === u.item_id));
          meta.bindings.push(u);
        });
        paint(host, meta);
        notify("Enabled every current item");
      } catch (err) { fail(host, err); }
    };
    const matAllOff = host.querySelector("#cap-mat-all-off");
    if (matAllOff) matAllOff.onclick = async () => {
      const list = filtered(meta);
      const kind = kinds[setSec];
      const assistants = [{id: "*"}, ...meta.assistants];
      const updates = [];
      list.forEach(item => { assistants.forEach(a => { updates.push({assistant_id: a.id, kind, item_id: item.id, enabled: false}); }); });
      try {
        await api("/api/capabilities/bindings", {...context(), bindings: updates});
        updates.forEach(u => {
          meta.bindings = meta.bindings.filter(x => !(x.assistant_id === u.assistant_id && x.kind === u.kind && x.item_id === u.item_id));
          meta.bindings.push(u);
        });
        paint(host, meta);
        notify("Disabled every current item");
      } catch (err) { fail(host, err); }
    };
    host.querySelectorAll("[data-row-toggle]").forEach(b => b.onclick = async () => {
      const itemId = b.dataset.rowToggle;
      const enable = b.dataset.action === "1";
      const kind = kinds[setSec];
      const assistants = [{id: "*"}, ...meta.assistants];
      const updates = assistants.map(a => ({assistant_id: a.id, kind, item_id: itemId, enabled: enable}));
      try {
        await api("/api/capabilities/bindings", {...context(), bindings: updates});
        updates.forEach(u => {
          meta.bindings = meta.bindings.filter(x => !(x.assistant_id === u.assistant_id && x.kind === u.kind && x.item_id === u.item_id));
          meta.bindings.push(u);
        });
        paint(host, meta);
        notify(enable ? "Enabled all experts for this item" : "Turned this off for every expert");
      } catch (err) { fail(host, err); }
    });
    host.querySelectorAll("[data-col-toggle]").forEach(b => b.onclick = async () => {
      const aid = b.dataset.colToggle;
      const enable = b.dataset.action === "1";
      const kind = kinds[setSec];
      const list = filtered(meta);
      const updates = list.map(item => ({assistant_id: aid, kind, item_id: item.id, enabled: enable}));
      try {
        await api("/api/capabilities/bindings", {...context(), bindings: updates});
        updates.forEach(u => {
          meta.bindings = meta.bindings.filter(x => !(x.assistant_id === u.assistant_id && x.kind === u.kind && x.item_id === u.item_id));
          meta.bindings.push(u);
        });
        paint(host, meta);
        notify(enable ? "Enabled all for this expert" : "Disabled all for this expert");
      } catch (err) { fail(host, err); }
    });
    host.querySelector("#cap-refresh").onclick = () => update().catch(error => fail(host, error));
    host.querySelectorAll("[data-cap-binding]").forEach(input => input.onchange = async () => {
      const next = input.checked;
      input.disabled = true;
      try {
        const binding = {assistant_id: input.dataset.assistant, kind: input.dataset.kind, item_id: input.dataset.item, enabled: next};
        await api("/api/capabilities/binding", {...context(), ...binding});
        meta.bindings = meta.bindings.filter(item => !(item.assistant_id === binding.assistant_id && item.kind === binding.kind && item.item_id === binding.item_id));
        meta.bindings.push(binding);
        paint(host, meta);
      } catch (error) { input.checked = !next; input.disabled = false; fail(host, error); }
    });
    host.querySelectorAll("[data-cap-preview]").forEach(button => button.onclick = () => {
      const item = items.find(row => row.id === button.dataset.capPreview);
      if (section === "skills") editSkill(item).catch(error => fail(host, error));
      else editTool(item);
    });
    host.querySelector("#cap-mcp-json")?.addEventListener("click", () => editMcp(meta));
    host.querySelectorAll("[data-cap-connect]").forEach(button => button.onclick = async () => {
      if (!await uiConfirm("This runs a local command with your user's rights or reaches a remote MCP, and may read sensitive data. Trust this server and continue?")) return;
      button.disabled = true;
      button.textContent = "Connecting...";
      try {
        const result = await api("/api/capabilities/mcp/discover", {server: button.dataset.capConnect, confirm: true});
        notify(`Found ${result.tools.length} tools`);
        await update();
      } catch (error) { fail(host, error); button.disabled = false; button.textContent = "Retry connection"; }
    });
    host.querySelectorAll("[data-cap-mcp-preview]").forEach(button => button.onclick = () => {
      const item = items.find(row => row.id === button.dataset.capMcpPreview);
      dialog(item.name + " · MCP Tools", `<p class="hint">${item.tools.length ? "tools found; the server is reconnected when an expert actually calls one." : "No tools found yet; click“Connect / Fetch tools”. "}</p><pre>${e(JSON.stringify(item.tools, null, 2))}</pre>`);
    });
    if (selected) {
      const field = host.querySelector("#cap-search");
      field.focus(); field.setSelectionRange(position, position);
    }
  }
  async function load() {
    const host = document.getElementById("cap-settings");
    if (!host || !sections.has(setSec) || !S.loaded) return;
    const serial = ++request, scope = projectId;
    if (cache.has(scope)) { paint(host, cache.get(scope)); return; }
    host.innerHTML = `<div class="card"><h3>${labels[setSec]}</h3><p class="hint">LoadingLocal capability settings...</p></div>`;
    try {
      const meta = await api("/api/capabilities" + query());
      cache.set(scope, meta);
      if (serial === request && scope === projectId && host.isConnected && sections.has(setSec)) paint(host, meta);
    } catch (error) {
      if (serial !== request || !host.isConnected) return;
      host.innerHTML = `<div class="card"><h3>Read failed</h3><p class="cap-error">${e(error.message)}</p><button class="btn" id="cap-retry">Retry</button></div>`;
      host.querySelector("#cap-retry").onclick = load;
    }
  }
  async function editSkill(item) {
    const params = new URLSearchParams({...context(), id: item.id});
    const result = await api("/api/capabilities/skill?" + params);
    dialog(item.name, `<p class="hint">${e(result.path)}</p><div class="cap-toolbar"><button class="btn ghost" data-preview>Preview</button><button class="btn ghost" data-edit>Edit SKILL.md</button></div><div data-preview-body><pre>${e(result.content)}</pre></div><textarea class="control" data-content hidden aria-label="Skill file content">${e(result.content)}</textarea><div class="cap-card-actions"><button class="btn" data-save hidden>Save to the skill file</button></div>`, (host, close) => {
      const field = host.querySelector("[data-content]"), preview = host.querySelector("[data-preview-body]"), save = host.querySelector("[data-save]");
      host.querySelector("[data-edit]").onclick = () => { field.hidden = false; preview.hidden = true; save.hidden = false; };
      host.querySelector("[data-preview]").onclick = () => { preview.innerHTML = `<pre>${e(field.value)}</pre>`; field.hidden = true; preview.hidden = false; save.hidden = true; };
      save.onclick = async () => {
        save.disabled = true;
        try { await api("/api/capabilities/skill", {...context(), id: item.id, content: field.value}); close(); await update(); notify("Skill file saved"); }
        catch (error) { save.disabled = false; fail(host, error); }
      };
    });
  }
  function editTool(item) {
    dialog(item.name + "· tool metadata", `<p class="hint">Tools ID stays as is, the description is what the model receives. Changing parameters or the implementation needs an app update.</p><label class="cap-field">Display name<input class="control" data-label value="${e(item.label)}"></label><label class="cap-field">Tool description<textarea class="control" data-description style="min-height:150px">${e(item.description)}</textarea></label><details><summary>View arguments JSON Schema (read-only)</summary><pre>${e(JSON.stringify(item.parameters, null, 2))}</pre></details><div class="cap-card-actions"><button class="btn" data-save>Save description</button></div>`, (host, close) => {
      host.querySelector("[data-save]").onclick = async () => {
        try {
          await api("/api/capabilities/tool", {name: item.id, label: host.querySelector("[data-label]").value, description: host.querySelector("[data-description]").value});
          close(); await update(); notify("Tool description saved");
        } catch (error) { fail(host, error); }
      };
    });
  }
  function editMcp(meta) {
    const example = {mcpServers: {"trusted-server": {command: "python", args: ["-m", "your_mcp_server"], env: {API_KEY: "replace-me"}, enabled: true}}};
    dialog("MCP · JSON config", `<p class="hint">supports standard mcpServers JSON: stdio (command/args/env/cwd) or Streamable HTTP (url/headers). Existing keys are hidden by default; leave ******** does not overwrite the existing value; clearing the field deletes it. Saving runs no command.Windows under the current user DPAPI encrypted.</p><div class="cap-toolbar"><button class="btn ghost" data-reveal>Show the saved key</button><button class="btn ghost" data-hide>Hide the key / Discard the draft</button><button class="btn ghost" data-format>Validate / Format</button><button class="btn ghost" data-example>View a format example</button></div><textarea class="control" data-json spellcheck="false" aria-label="MCP JSON Settings">${e(JSON.stringify(meta.mcp_config, null, 2))}</textarea><div class="cap-card-actions"><button class="btn" data-save>Save JSON</button></div><details data-example-body hidden><summary>Format example (not written automatically)</summary><pre>${e(JSON.stringify(example, null, 2))}</pre></details>`, (host, close) => {
      const field = host.querySelector("[data-json]");
      host.querySelector("[data-reveal]").onclick = async () => {
        if (!await uiConfirm("All MCP keys and command parameters will be shown on this screen, replacing unsaved drafts. Make sure your surroundings are safe.")) return;
        try { const result = await api("/api/capabilities/mcp/reveal", {confirm: true}); field.value = JSON.stringify(result.config, null, 2); }
        catch (error) { fail(host, error); }
      };
      host.querySelector("[data-hide]").onclick = () => { field.value = JSON.stringify(meta.mcp_config, null, 2); };
      host.querySelector("[data-format]").onclick = () => {
        try { field.value = JSON.stringify(JSON.parse(field.value), null, 2); host.querySelector("[data-error]").textContent = "JSON syntax is valid; full field validation runs on save."; }
        catch (error) { fail(host, error); }
      };
      host.querySelector("[data-example]").onclick = () => { const block = host.querySelector("[data-example-body]"); block.hidden = !block.hidden; block.open = true; };
      host.querySelector("[data-save]").onclick = async () => {
        try { await api("/api/capabilities/mcp", {config: JSON.parse(field.value)}); close(); await update(); notify("MCP config saved; server not started"); }
        catch (error) { fail(host, error); }
      };
    });
  }

  document.addEventListener("rw:assistant-detail", event => {
    cache.clear();
    const assistant = event.detail?.assistant, container = event.detail?.container;
    if (!assistant || !container) return;
    container.querySelector("[data-cap-assistant]")?.remove();
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.capAssistant = assistant.id;
    card.innerHTML = `<h3>Expert capabilities</h3><p class="hint">View and configure ${e(assistant.name)}'s skills, tools, MCP enabled state. The server checks tool permissions on every run.</p><div class="cap-card-actions"><button class="btn ghost" data-open-cap>Configure capabilities</button></div>`;
    container.appendChild(card);
    card.querySelector("[data-open-cap]").onclick = async () => {
      try {
        const meta = await api("/api/capabilities");
        let active = "skill";
        const host = dialog(assistant.name + "· capability enabled", `<div class="cap-toolbar"><button class="btn ghost" data-kind="skill">Skills</button><button class="btn ghost" data-kind="tool">Tools</button><button class="btn ghost" data-kind="mcp">MCP</button></div><p class="hint">Showing user skills; for project-specific ones pick a project in settings and edit the matrix. Ticking saves at once.</p><div data-assistant-caps></div>`, overlay => {
          function redraw() {
            const section = {skill: "skills", tool: "tools", mcp: "mcp"}[active];
            const target = overlay.querySelector("[data-assistant-caps]");
            target.innerHTML = `<div class="cap-table"><table><thead><tr><th>Name</th><th>Enable</th></tr></thead><tbody>${meta[section].map(item => `<tr><td>${e(item.label || item.name)}<br><span class="hint">${e(item.description || item.desc || "")}</span></td><td><input type="checkbox" data-item="${e(item.id)}" aria-label="${e(item.name)}" ${checked(meta, assistant.id, active, item.id) ? "checked" : ""}></td></tr>`).join("")}</tbody></table></div>`;
            target.querySelectorAll("input").forEach(input => input.onchange = async () => {
              const next = input.checked, kind = active;
              input.disabled = true;
              try {
                const binding = {assistant_id: assistant.id, kind, item_id: input.dataset.item, enabled: next};
                await api("/api/capabilities/binding", binding);
                meta.bindings = meta.bindings.filter(item => !(item.assistant_id === binding.assistant_id && item.kind === binding.kind && item.item_id === binding.item_id));
                meta.bindings.push(binding);
                cache.clear();
                input.disabled = false;
              } catch (error) { input.checked = !next; input.disabled = false; fail(overlay, error); }
            });
          }
          overlay.querySelectorAll("[data-kind]").forEach(button => button.onclick = () => { active = button.dataset.kind; redraw(); });
          redraw();
        });
        host.querySelector("[data-error]").textContent = "";
      } catch (error) { notify(error.message || String(error), "error"); }
    };
  });

  const originalPanel = setPanel;
  setPanel = function () {
    return sections.has(setSec) ? `<div id="cap-settings"></div>` : originalPanel();
  };
  const originalSettings = renderSettings;
  renderSettings = function (host) {
    if (sections.has(setSec) && !setMeta) setMeta = {};
    originalSettings(host);
    if (sections.has(setSec)) load();
  };
  // Explicit refresh hook for assistant CRUD and project context changes.
  window.refreshCapabilities = () => { cache.clear(); return load(); };
})();
