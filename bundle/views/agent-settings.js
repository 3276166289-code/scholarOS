/* Editable providers, assistants, team rosters and durable session selection. */
(() => {
  "use strict";
  const endpoint = "/api/agent-settings/";
  const request = (name, body) => api(endpoint + name, body);
  const eligible = a => a.source === "user" || !!a.enabled;
  const el = id => document.getElementById(id);
  const h = value => esc(String(value ?? ""));
  const options = (values, current, labels = {}) => values.map(v => `<option value="${h(v)}" ${v === current ? "selected" : ""}>${h(labels[v] || v)}</option>`).join("");
  const effortLabels = {auto:"Agent decision",none:"No reasoning",minimal:"Minimal",low:"Low",medium:"Medium",high:"High",xhigh:"Very high"};
  const permissionLabels = {auto:"Agent decision",read_only:"Read-only",workspace_write:"Write to workspace",full_access:"Full Access (dangerous)"};
  const efforts = Object.keys(effortLabels), permissions = Object.keys(permissionLabels);
  let registry = null, assistantFilter = "all", assistantId = null, teamSession = "";
  let viewEpoch = 0;
  let dialog = null;
  const css = document.createElement("style");
  css.textContent = `.ag-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.ag-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ag-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px;margin-top:14px}.ag-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.ag-form label,.ag-stack{display:flex;flex-direction:column;gap:6px}.ag-wide{grid-column:1/-1}.ag-modal{width:min(760px,calc(100vw - 32px));max-height:88vh;overflow:auto;background:var(--surface,var(--bg));color:var(--text);border:1px solid var(--line,var(--border));border-radius:16px;padding:24px;box-shadow:0 24px 90px #0006}.ag-modal::backdrop{background:#0008;backdrop-filter:blur(3px)}.ag-list{display:flex;flex-direction:column;gap:8px;max-height:270px;overflow:auto}.ag-model{display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--line,var(--border));overflow-wrap:anywhere}.ag-danger{padding:10px 12px;border-left:3px solid var(--err,#b54b45);background:color-mix(in srgb,var(--err,#b54b45) 9%,transparent);font-size:12px}.ag-meta{font-size:12px;color:var(--muted);overflow-wrap:anywhere}.ag-team{display:grid;grid-template-columns:220px minmax(0,1fr);gap:14px}.ag-team-nav{display:flex;flex-direction:column;gap:8px}.ag-team-nav button{text-align:left}.ag-transcript{max-height:52vh;min-height:180px;overflow:auto;display:flex;flex-direction:column;gap:10px;margin:14px 0}.ag-message{padding:12px;border:1px solid var(--line,var(--border));border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}.ag-message strong{font-size:12px;color:var(--brand)}.ag-member{cursor:pointer}.ag-status{min-height:20px;margin:10px 0}.ag-model-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:8px;max-height:320px;overflow:auto}@media(max-width:720px){.ag-form,.ag-team{grid-template-columns:1fr}.ag-team-nav{flex-direction:row;overflow:auto}.ag-team-nav button{min-width:160px}.ag-modal{padding:16px}.ag-head{align-items:flex-start}}`;
  document.head.append(css);

  async function load() {
    registry = await request("state");
    S.models = registry.models;
    S.assistants = registry.assistants;
    return registry;
  }
  function error(container, err) {
    container.textContent = err.message || String(err);
    container.className = "msg error ag-status";
  }
  function modal(title, body) {
    if (dialog) dialog.close();
    const d = document.createElement("dialog");
    d.className = "ag-modal";
    d.innerHTML = `<div class="ag-head"><h3>${h(title)}</h3><button class="btn ghost" data-close aria-label="Close">Close</button></div>${body}<div class="ag-status" role="status"></div>`;
    document.body.append(d);
    dialog = d;
    d.querySelector("[data-close]").onclick = () => d.close();
    d.addEventListener("close", () => { d.remove(); if (dialog === d) dialog = null; });
    d.showModal();
    return d;
  }
  async function saved() { await refreshState(false); await load(); window.refreshCapabilities?.(); }
  const modelOptions = current => `<option value="">Follows the current model</option>${(S.models || []).map(m => `<option value="${h(m.id)}" ${m.id === current ? "selected" : ""}>${h(m.name)}${m.name.includes(m.model) ? "" : " · " + h(m.model)}</option>`).join("")}`;
  function policyFields(a, prefix) {
    return `<label><span>Model</span><select class="control" id="${prefix}-model">${modelOptions(a.model_id)}</select></label>
      <label><span>Reasoning effort</span><select class="control" id="${prefix}-reasoning">${options(efforts,a.reasoning || "auto",effortLabels)}</select></label>
      <label><span>Permissions</span><select class="control" id="${prefix}-permission">${options(permissions,a.permission || "auto",permissionLabels)}</select></label>
      <div class="ag-danger ag-wide">Full Access Lets every enabled tool write and send without asking each time, which can change or leak data. Enable only for a trusted expert. Disabled rules in the skill and tool matrix still apply.</div>`;
  }
  function policies(prefix) {
    return {model_id:el(prefix + "-model").value,reasoning:el(prefix + "-reasoning").value,permission:el(prefix + "-permission").value};
  }
  async function risk(oldValue, nextValue) {
    return nextValue !== "full_access" || oldValue === "full_access" || await uiConfirm("Danger: full access allows file and database changes, outgoing mail, and third-party writes without asking each time. Enable only for a trusted expert?");
  }

  async function providerEditor(provider = null) {
    const p = provider || {id:"",name:"",base_url:"",api:"openai-completions",models:[]};
    if (["codex-cli","claude-code-cli","antigravity-cli"].includes(p.api)) return accountProviderEditor(p);
    let selected = new Set(p.models || []), candidates = [...selected].map(id => ({id,name:id})), pid = p.id;
    const d = modal(pid ? "Configure provider" : "Add provider", `<div class="ag-form">
      <label><span>Name</span><input class="control" id="ag-p-name" value="${h(p.name)}"></label>
      <label><span>Protocol</span><select class="control" id="ag-p-api">${(registry.wires || []).map(w => `<option value="${h(w.id)}" ${w.id === p.api ? "selected" : ""}>${h(w.label)}</option>`).join("")}</select></label>
      <label class="ag-wide"><span>Endpoint URL (includes /v1 and other API prefixes)</span><input class="control" id="ag-p-url" value="${h(p.base_url)}" placeholder="https://api.example.com/v1"></label>
      <label class="ag-wide"><span>API Key${p.key_present ? " (saved; leave blank to keep it)" : " (the local endpoint may be blank)"}</span><div class="ag-row"><input class="control" id="ag-p-key" type="password" autocomplete="off" style="flex:1" placeholder="${p.key_present ? "Saved; leave blank to keep it" : "API Key"}"><button class="btn" id="ag-p-show">Show</button><button class="btn ghost" id="ag-p-clear">Clear Key</button></div></label>
      <div class="ag-wide ag-row"><button class="btn btn-primary" id="ag-p-save">Save settings</button><button class="btn" id="ag-p-discover">Save and fetch models</button></div>
      <div class="ag-wide ag-stack"><span>models (ticked ones are available to every expert,Leader and team members)</span><input class="control" id="ag-p-filter" placeholder="Search every model without truncating the list"><div class="ag-list" id="ag-p-candidates"></div>
      <div class="ag-row"><input class="control" id="ag-p-manual" style="flex:1" placeholder="Type a model manually ID"><button class="btn" id="ag-p-add">Add model</button></div>
      <div class="ag-row"><button class="btn" id="ag-p-apply">Save the selected model</button><button class="btn" id="ag-p-auto">Select everything and set a default</button></div></div></div>`);
    let keyDirty = false;
    const status = d.querySelector("[role=status]");
    el("ag-p-key").oninput = () => { keyDirty = true; };
    el("ag-p-clear").onclick = () => { el("ag-p-key").value = ""; keyDirty = true; status.textContent = "Saving will clear the key."; };
    el("ag-p-show").onclick = async () => {
      try {
        const input = el("ag-p-key");
        if (input.type === "password") {
          if (pid && !keyDirty && !input.value) input.value = (await api(endpoint + "provider-secret?id=" + encodeURIComponent(pid))).api_key;
          input.type = "text";
        } else input.type = "password";
      } catch (e) { error(status,e); }
    };
    const save = async () => {
      const data = {id:pid,name:el("ag-p-name").value,base_url:el("ag-p-url").value,api:el("ag-p-api").value,api_key: keyDirty || !pid ? el("ag-p-key").value : null};
      pid = (await request("provider-save",data)).provider.id;
      keyDirty = false;
      await saved();
      status.className = "ag-status"; status.textContent = "Config saved.";
    };
    const draw = () => {
      const search = el("ag-p-filter").value.toLowerCase();
      el("ag-p-candidates").innerHTML = candidates.filter(c => (c.id + " " + c.name).toLowerCase().includes(search)).map(c => `<label class="ag-model"><input type="checkbox" value="${h(c.id)}" ${selected.has(c.id) ? "checked" : ""}><span>${h(c.name || c.id)}${c.name !== c.id ? `<br><small>${h(c.id)}</small>` : ""}</span></label>`).join("") || `<p class="hint">No models yet; fetch them or add one by hand.</p>`;
      el("ag-p-candidates").querySelectorAll("input").forEach(i => i.onchange = () => i.checked ? selected.add(i.value) : selected.delete(i.value));
    };
    el("ag-p-filter").oninput = draw;
    draw();
    el("ag-p-save").onclick = async () => { try { await save(); renderModels(el("set-models") || el("main")); } catch (e) { error(status,e); } };
    el("ag-p-discover").onclick = async () => {
      try {
        await save(); status.textContent = "Fetching models...";
        const r = await request("provider-discover",{id:pid});
        candidates = [...new Map([...candidates,...r.candidates].map(c => [c.id,c])).values()];
        draw(); status.textContent = `Fetched ${r.candidates.length} models; pick by hand or let it choose.`;
      } catch (e) { error(status,e); }
    };
    el("ag-p-add").onclick = () => {
      const id = el("ag-p-manual").value.trim(); if (!id) return;
      selected.add(id); if (!candidates.some(c => c.id === id)) candidates.push({id,name:id});
      el("ag-p-manual").value = ""; draw();
    };
    const apply = async auto => {
      try {
        await save();
        if (auto) {
          if (!candidates.length) candidates = (await request("provider-discover",{id:pid})).candidates;
          selected = new Set(candidates.map(c => c.id));
        }
        await request("provider-models",{id:pid,models:[...selected],auto});
        await saved(); d.close(); render();
      } catch (e) { error(status,e); }
    };
    el("ag-p-apply").onclick = () => apply(false);
    el("ag-p-auto").onclick = () => apply(true);
  }

  async function accountProviderEditor(p) {
    p = {...registry.catalog.find(c=>c.api===p.api),...p};
    const d = modal(p.name, `<p>Reuses the local account of the official client. Sign in, then pick the model for experts, teams, and workflows.</p>
      <div class="ag-row"><button class="btn btn-primary" data-account-login>Open the official sign-in</button><button class="btn" data-account-check>Check again</button></div>
      <p class="ag-meta" data-account-state>Checking CLI...</p>
      <p class="ag-meta">The default follows the official client; you can also type a model this account offers ID. </p>
      <label class="ag-stack">Model ID<input class="control" data-account-model value="${h((p.models || [])[0] || "auto")}"></label>
      <div class="ag-row" style="margin-top:14px"><button class="btn btn-primary" data-account-save>Adopt model</button>${p.docs ? `<a class="btn ghost" href="${h(p.docs)}" target="_blank" rel="noopener">Official install and sign-in docs</a>` : ""}</div>`);
    const status = d.querySelector("[role=status]"), state = d.querySelector("[data-account-state]");
    const check = async () => { try { const r = await request("provider-account-status",{id:p.id}); if (d.isConnected) state.textContent = r.message + (r.login_command ? `Terminal command: ${r.login_command}` : ""); } catch(e) { error(status,e); } };
    d.querySelector("[data-account-check]").onclick = check;
    d.querySelector("[data-account-login]").onclick = async () => { try { const r = await request("provider-account-login",{id:p.id}); status.textContent = r.message; } catch(e) { error(status,e); } };
    d.querySelector("[data-account-save]").onclick = async () => {
      try {
        const model = d.querySelector("[data-account-model]").value.trim() || "auto";
        await request("provider-save",{id:p.id,name:p.name,api:p.api,base_url:p.base_url});
        await request("provider-models",{id:p.id,models:[...new Set([...(p.models || []),model])]});
        await saved(); d.close(); render();
      } catch(e) { error(status,e); }
    };
    await check();
  }

  renderModels = async function(container) {
    if (!S.loaded || !container) return;
    const expectedRoute = route(), epoch = ++viewEpoch;
    try {
      await load();
      if (!container.isConnected || route() !== expectedRoute || epoch !== viewEpoch) return;
      container.innerHTML = `<div class="ag-head"><div><h3>Models and Provider</h3><p class="hint">Choose Provider configure it, then fetch or add models. Configured models can be picked for experts and teams.</p></div></div>
        <div class="card ag-row"><label style="flex:1">supported Provider <select class="control" id="ag-provider-select"><option value="">Select Provider...</option>${registry.catalog.map(p => `<option value="${h(p.id)}">${h(p.name)}${p.supported ? "" : "(pick a compatible protocol)"}</option>`).join("")}<option value="custom">CustomCompatible endpoint</option></select></label><button class="btn btn-primary" id="ag-provider-add">Settings</button></div>
        <h4 style="margin-top:20px">Available models · ${S.models.length}</h4><div class="ag-model-grid">${S.models.map(mm => `<div class="card"><b>${h(mm.name)}</b><p class="ag-meta">${h(mm.api || "openai-completions")}</p><button class="btn ghost" data-ag-active="${h(mm.id)}">${S.active?.id === mm.id ? "Current default" : "Set as default"}</button></div>`).join("") || `<p class="hint">No model configured yet. Add one first Provider. </p>`}</div>
        <h4 style="margin-top:24px">configured Provider · ${registry.providers.length}</h4><div class="ag-grid">${registry.providers.map(p => `<article class="card"><div class="ag-head"><b>${h(p.name)}</b><span class="pill">${p.models.length} Model</span></div><p class="ag-meta">${h(p.base_url)}<br>${h(p.api)} · ${["codex-cli","claude-code-cli","antigravity-cli"].includes(p.api) ? "Account sessions are managed by the official client" : `Key ${p.key_invalid ? '<span style="color:var(--err,#bd3f34);font-weight:600">Decryption failed; enter it again</span>' : (p.key_present ? "Saved" : "Not set")}`}</p><div class="ag-row"><button class="btn" data-ag-provider="${h(p.id)}">View / Edit</button><button class="btn ghost" data-ag-provider-del="${h(p.id)}">Remove</button></div></article>`).join("")}</div>`;
      el("ag-provider-add").onclick = () => {
        const id = el("ag-provider-select").value;
        if (!id) return uiNotify("Select a provider first.");
        const configured = registry.providers.find(p => p.id === id);
        const c = registry.catalog.find(p => p.id === id);
        providerEditor(configured || (c ? {...c,api:c.supported ? c.api : "openai-completions",models:[]} : null));
      };
      container.querySelectorAll("[data-ag-provider]").forEach(b => b.onclick = () => providerEditor(registry.providers.find(p => p.id === b.dataset.agProvider)));
      container.querySelectorAll("[data-ag-provider-del]").forEach(b => b.onclick = async () => { if (!await uiConfirm("Remove this provider and its adopted models? Experts bound to those models will need reselecting.")) return; try { await request("provider-delete",{id:b.dataset.agProviderDel}); await saved(); render(); } catch(e) { uiNotify(e.message); } });
      container.querySelectorAll("[data-ag-active]").forEach(b => b.onclick = async () => { try { await api("/api/models/active",{id:b.dataset.agActive}); await saved(); render(); } catch(e) { uiNotify(e.message); } });
    } catch(e) { error(container,e); }
  };

  function assistantEditor(a) {
    let prompts = [];
    try { prompts = Array.isArray(a.prompts) ? a.prompts : JSON.parse(a.prompts || "[]"); } catch (_) { /* Legacy malformed prompts remain editable. */ }
    const d = modal(a.id ? "Edit expert" : "New expert", `<div class="ag-form"><label><span>Name</span><input class="control" id="ag-a-name" value="${h(a.name)}"></label><label><span>Avatar</span><input class="control" id="ag-a-avatar" value="${h(a.avatar)}"></label><label class="ag-wide"><span>Description</span><input class="control" id="ag-a-desc" value="${h(a.description)}"></label>${policyFields(a,"ag-a")}<label class="ag-wide"><span>rules (go into the system prompt)</span><textarea class="control" rows="7" id="ag-a-rules">${h(a.rules)}</textarea></label><label class="ag-wide"><span>Suggested questions (one per line)</span><textarea class="control" rows="3" id="ag-a-prompts">${h(prompts.join("\n"))}</textarea></label><label class="ag-wide ag-row"><span><input type="checkbox" id="ag-a-enabled" ${a.enabled !== 0 ? "checked" : ""}>Enable public experts (your own are always available)</span></label><button class="btn btn-primary" id="ag-a-save">Save expert</button></div>`);
    el("ag-a-save").onclick = async () => {
      try {
        const policy = policies("ag-a"); if (!(await risk(a.permission,policy.permission))) return;
        const r = await request("assistant-save",{id:a.id,name:el("ag-a-name").value.trim() || "New expert",avatar:el("ag-a-avatar").value,description:el("ag-a-desc").value,rules:el("ag-a-rules").value,prompts:el("ag-a-prompts").value.split("\n").filter(Boolean),enabled:el("ag-a-enabled").checked,...policy});
        assistantId = r.assistant.id; await saved(); d.close(); render();
      } catch(e) { error(d.querySelector("[role=status]"),e); }
    };
  }
  renderAssistants = async function(container) {
    if (!S.loaded || !container) return;
    const expectedRoute = route(), epoch = ++viewEpoch;
    try {
      await load(); if (!container.isConnected || route() !== expectedRoute || epoch !== viewEpoch) return;
      const a = S.assistants.find(x => x.id === assistantId);
      if (a) {
        const hist = await api(endpoint + "assistant-history?id=" + encodeURIComponent(a.id));
        if (!container.isConnected || route() !== expectedRoute || epoch !== viewEpoch) return;
        container.innerHTML = `<div class="ag-head"><div><p class="inst-label">ASSISTANT</p><h3>${h(a.avatar)} ${h(a.name)}</h3><p class="hint">${h(a.description)}</p></div><div class="ag-row"><button class="btn" id="ag-a-back">Back</button><button class="btn" id="ag-a-edit">Edit</button><button class="btn btn-primary" id="ag-a-chat" ${eligible(a) ? "" : "disabled"}>New chat</button></div></div><div class="ag-grid"><div class="card"><h4>Run settings</h4><p>Model: ${h(S.models.find(m => m.id === a.model_id)?.name || "Auto-select / Current model")}</p><p>Reasoning: ${h(effortLabels[a.reasoning] || "Agent Decision")} · Permissions: ${h(permissionLabels[a.permission] || "Agent Decision")}</p><p>${a.source === "user" ? "My experts · Always available" : "Public experts · " + (a.enabled ? "Enabled" : "Off")}</p>${a.source !== "user" ? `<button class="btn" id="ag-a-toggle">${a.enabled ? "Disable" : "Enable"}</button>` : ""}</div><div class="card"><h4>Rule preview</h4><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${h(a.rules || "No rule set")}</pre></div></div><div class="card" style="margin-top:14px"><h4>Past chats · ${hist.sessions.length}</h4><p class="hint">Sessions and messages live in a local database and survive a restart.</p><div class="ag-list">${hist.sessions.map(c => `<button class="btn" data-ag-history="${h(c.id)}">${h(c.title)} · ${h(fmtDate(c.updated_at))}</button>`).join("") || `<p class="hint">No chats yet. Click“New chat”to start.</p>`}</div></div><div class="ag-row" id="ag-assistant-integrations" style="margin-top:14px"></div>`;
        el("ag-a-back").onclick = () => { assistantId = null; render(); };
        el("ag-a-edit").onclick = () => assistantEditor(a);
        const actions = container.querySelector(".ag-head .ag-row");
        const duplicate = document.createElement("button"); duplicate.className = "btn"; duplicate.textContent = "Copy as mine";
        duplicate.onclick = () => assistantEditor({...a,id:"",source:"user",name:a.name + " (mine)",enabled:1}); actions.append(duplicate);
        if (a.source === "user") {
          const remove = document.createElement("button"); remove.className = "btn ghost"; remove.textContent = "Delete expert";
          remove.onclick = async () => { if (!await uiConfirm("Delete this expert? Existing chats and messages are kept.")) return; try { await api("/api/assistant/delete",{id:a.id}); assistantId = null; await saved(); render(); } catch(e) { uiNotify(e.message); } }; actions.append(remove);
        }
        el("ag-a-chat").onclick = async () => { try { await useAssistant(a.id === "builtin-steward" ? "" : a.id, a.name); } catch(e) { uiNotify(e.message); } };
        if (el("ag-a-toggle")) el("ag-a-toggle").onclick = async () => { try { await request("assistant-save",{id:a.id,enabled:!a.enabled}); await saved(); render(); } catch(e) { uiNotify(e.message); } };
        container.querySelectorAll("[data-ag-history]").forEach(b => b.onclick = async () => { curChat = b.dataset.agHistory; localStorage.setItem("rw-chat",curChat); await refreshState(false); openTab("agent"); });
        document.dispatchEvent(new CustomEvent("rw:assistant-detail",{detail:{assistant:a,container}}));
        return;
        }
      const list = S.assistants
        .filter(a => assistantFilter === "all" || (assistantFilter === "user" ? a.source === "user" : (assistantFilter === "public" ? a.source !== "user" : true)))
        .sort((x, y) => {
          if (x.id === "builtin-steward") return -1;
          if (y.id === "builtin-steward") return 1;
          return (x.sort_order ?? 0) - (y.sort_order ?? 0);
        });
      container.innerHTML = `<div class="ag-head"><div><p class="inst-label">EXPERTS</p><h3>Expert</h3><p class="hint">Any of your experts and the enabled system experts can be chosen, with no cap. Use the switch on a card to enable one/disabled.</p></div><div class="ag-row"><button class="btn btn-sm" id="ag-as-all-on">Enable all</button><button class="btn btn-sm ghost" id="ag-as-all-off">Disable all</button><button class="btn btn-primary" id="ag-assistant-new">+ New expert</button></div></div><div class="ag-row">${[["all","All experts"],["public","System experts"],["user","My experts"]].map(([id,label]) => `<button class="btn ${assistantFilter === id ? "btn-primary" : ""}" data-ag-as-filter="${id}">${label}</button>`).join("")}</div><div class="ag-grid">${list.map(a => `<article class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><h4>${a.id === "builtin-steward" ? `<img src="${Q_AV}" alt="Assistant" style="width:22px;height:22px;object-fit:contain;vertical-align:-4px;margin-right:2px">` : h(a.avatar || "👨‍🔬")} ${h(a.name)}</h4><button class="as-toggle ${a.enabled !== 0 ? "on" : "off"}" data-ag-as-toggle="${h(a.id)}" title="${a.enabled !== 0 ? "Enabled (click to disable)" : "Disabled (click to enable)"}"><span class="as-knob"></span><span class="as-toggle-txt">${a.enabled !== 0 ? "Enabled" : "Off"}</span></button></div><p class="ag-meta">${h(a.description || "(No expertise description)")}</p><p class="ag-meta">${a.source === "user" ? "Custom · Always selectable" : (a.enabled ? "System · Enabled" : "System · Off")} · ${h(S.models.find(m => m.id === a.model_id)?.name || "Auto model")}</p><div class="ag-row" style="margin-top:8px;gap:8px"><button class="btn btn-primary as-go" data-ag-chat-as="${h(a.id)}">💬 Go to chat</button><button class="btn" data-ag-assistant="${h(a.id)}">View / Edit</button></div></article>`).join("") || `<p class="hint">No experts yet; click“New expert”. </p>`}</div>`;
      el("ag-assistant-new").onclick = () => assistantEditor({id:"",name:"",rules:"",enabled:1});
      const bOn = el("ag-as-all-on"), bOff = el("ag-as-all-off");
      if (bOn) bOn.onclick = async () => {
        const ids = list.map(x => x.id);
        if (!ids.length) return;
        try {
          await api("/api/assistant/batch-toggle", {ids, enabled: 1});
          await saved();
          render();
        } catch(err) { uiNotify("Batch enable failed:" + err.message); }
      };
      if (bOff) bOff.onclick = async () => {
        const ids = list.map(x => x.id);
        if (!ids.length) return;
        try {
          await api("/api/assistant/batch-toggle", {ids, enabled: 0});
          await saved();
          render();
        } catch(err) { uiNotify("Bulk disable failed:" + err.message); }
      };
      container.querySelectorAll("[data-ag-as-filter]").forEach(b => b.onclick = () => { assistantFilter = b.dataset.agAsFilter; render(); });
      container.querySelectorAll("[data-ag-assistant]").forEach(b => b.onclick = () => { assistantId = b.dataset.agAssistant; render(); });
      container.querySelectorAll("[data-ag-as-toggle]").forEach(b => b.onclick = async (e) => {
        e.stopPropagation();
        const aid = b.dataset.agAsToggle;
        const a = S.assistants.find(x => x.id === aid);
        if (!a) return;
        const next = a.enabled === 0 ? 1 : 0;
        try {
          await api("/api/assistant/toggle", {id: aid, enabled: next});
          a.enabled = next;
          await saved();
          render();
        } catch(err) { uiNotify("Failed to change status:" + err.message); }
      });
      container.querySelectorAll("[data-ag-chat-as]").forEach(b => b.onclick = async (e) => {
        e.stopPropagation();
        const aid = b.dataset.agChatAs;
        const targetAid = aid === "builtin-steward" ? "" : aid;
        if (typeof useAssistant === "function") {
          await useAssistant(targetAid);
        } else {
          try {
            const r = await api("/api/chat/create", {});
            const cid = r.id || r.chat?.id;
            await api("/api/chat/assistant", {id: cid, assistant_id: targetAid});
            curChat = cid; localStorage.setItem("rw-chat", cid);
            await refreshState(false);
            openTab("agent");
          } catch(err) { uiNotify("Failed to start conversation:" + err.message); }
        }
      });
    } catch(e) { error(container,e); }
  };

  async function memberEditor(tid, member = {}) {
    const pool = (registry.selectable || []).filter(a=>a.id!=="builtin-steward");
    const d = modal(member.id ? "Edit team roles" : "Add team member", `<div class="ag-form"><label><span>Expert</span><select class="control" id="ag-m-assistant"><option value="">UseCustomRole</option>${pool.map(a => `<option value="${h(a.id)}" ${a.id === member.assistant_id ? "selected" : ""}>${h(a.name)}</option>`).join("")}</select></label><label><span>Role name</span><input class="control" id="ag-m-name" value="${h(member.name)}"></label>${policyFields(member,"ag-m")}<label class="ag-wide"><span>Duties in the team (on top of the expert’s rules)</span><textarea class="control" id="ag-m-prompt" rows="5">${h(member.prompt)}</textarea></label><button class="btn btn-primary" id="ag-m-save">Save role</button>${member.id && member.role !== "leader" ? `<button class="btn" id="ag-m-leader">Set as Leader</button><button class="btn ghost" id="ag-m-remove">Remove from team</button>` : ""}</div>`);
    el("ag-m-assistant").onchange = () => { const a = pool.find(x => x.id === el("ag-m-assistant").value); if (a) { el("ag-m-name").value = a.name; el("ag-m-prompt").value = a.rules || ""; } };
    el("ag-m-save").onclick = async () => {
      try { const policy = policies("ag-m"); if (!(await risk(member.permission,policy.permission))) return; await request("member-save",{team_id:tid,member_id:member.id,assistant_id:el("ag-m-assistant").value,name:el("ag-m-name").value,prompt:el("ag-m-prompt").value,...policy}); d.close(); teamList = null; render(); } catch(e) { error(d.querySelector("[role=status]"),e); }
    };
    if (el("ag-m-leader")) el("ag-m-leader").onclick = async () => { try { await request("leader",{team_id:tid,member_id:member.id}); d.close(); render(); } catch(e) { error(d.querySelector("[role=status]"),e); } };
    if (el("ag-m-remove")) el("ag-m-remove").onclick = async () => { try { await api("/api/team/chat/remove",{member_id:member.id}); d.close(); render(); } catch(e) { error(d.querySelector("[role=status]"),e); } };
  }
  function teamEditor(t = {}) {
    const d = modal(t.id ? "Edit team" : "New standing team", `<div class="ag-stack"><label>Team name<input class="control" id="ag-t-name" value="${h(t.name)}"></label><label>Team description<textarea class="control" id="ag-t-desc" rows="4">${h(t.description)}</textarea></label><button class="btn btn-primary" id="ag-t-save">Save team</button></div>`);
    el("ag-t-save").onclick = async () => { try { const r = await request("team-save",{id:t.id,name:el("ag-t-name").value,description:el("ag-t-desc").value,project:curTask||""}); teamScope = r.team.id; localStorage.setItem("rw-team-chat",teamScope); teamSession = ""; teamList = null; d.close(); render(); } catch(e) { error(d.querySelector("[role=status]"),e); } };
  }
  const renderTeamSettings = async function(container) {
    if (!S.loaded || !container) return;
    const expectedRoute = route(), epoch = ++viewEpoch;
    clearTimeout(teamTick);
    try {
      await load();
      const all = (await api("/api/teams?project=" + encodeURIComponent(curTask || ""))).teams || [];
      if (!all.some(t => t.id === teamScope)) teamScope = all[0]?.id || "";
      if (!teamScope) { container.innerHTML = `<div class="card"><h3>Team settings</h3><button class="btn" id="ag-team-new">New team</button></div>`; el("ag-team-new").onclick = () => teamEditor(); return; }
      const data = await api(endpoint + "team-detail?id=" + encodeURIComponent(teamScope) + (teamSession ? "&session_id=" + encodeURIComponent(teamSession) : ""));
      if (!container.isConnected || route() !== expectedRoute || epoch !== viewEpoch) return;
      const t = data.team || all.find(x => x.id === teamScope) || {}, running = data.running;
      const selected = data.session || {};
      container.innerHTML = `<div class="ag-head"><div><p class="inst-label">TEAMS · ${all.length}</p><h3>Team management and roles</h3><p class="hint">Create and orchestrate teams here. Set Leader, member roles, assigned models, reasoning effort, and Full Access permissions. For everyday team talk, go to the team room on the main screen.</p></div><div class="ag-row"><button class="btn ghost" id="ag-team-back">← Back to the floor</button><button class="btn btn-primary" id="ag-team-new">New team</button><button class="btn" id="ag-team-go-chat">Open the team chat 💬</button></div></div><div class="ag-team"><nav class="ag-team-nav">${all.map(t => `<button class="btn ${t.id === teamScope ? "btn-primary" : ""}" data-ag-team="${h(t.id)}">${h(t.name)}<br><small>${t.kind === "custom" ? "Persistent team" : t.kind === "fixed" ? "Preset team" : "Mobile team"}</small></button>`).join("")}</nav><section><div class="card"><div class="ag-head"><div><h3>${h(t.name)}</h3><p class="hint">${h(t.description)}</p></div><div class="ag-row"><button class="btn" id="ag-team-edit">Edit team</button>${t.kind === "temp" ? `<button class="btn ghost" id="ag-team-dissolve" style="color:var(--err)">Dismiss</button>` : ""}</div></div><div class="ag-grid">${data.members.map(m => `<button class="card ag-member" data-ag-member="${h(m.id)}" style="text-align:left"><b>${m.role === "leader" ? "Leader · " : "Members · "}${h(m.name)}</b><p class="ag-meta">${h(m.model_id ? S.models.find(x => x.id === m.model_id)?.name || "Model removed" : "Follow expert / current model")}</p><span class="ag-meta">${h(effortLabels[m.reasoning] || "Agent decision")} · ${h(permissionLabels[m.permission] || "Agent decision")}</span></button>`).join("")}</div><button class="btn" id="ag-member-new" style="margin-top:12px">Add member (any available expert)</button></div><div class="card" style="margin-top:12px"><div class="ag-row"><label style="flex:1">Chat history<select class="control" id="ag-team-session">${(data.sessions || []).map(s => `<option value="${h(s.id)}" ${s.id === selected.id ? "selected" : ""}>${h(s.title)} · ${h(fmtDate(s.updated_at))}${s.active ? "· current" : ""}</option>`).join("")}</select></label><button class="btn" id="ag-session-new">New chat</button></div><p class="hint">Team conversations happen full screen in the team room on the main screen.</p></div></section></div>`;
      el("ag-team-back").onclick = () => { window.__teamMode = ""; render(); };
      el("ag-team-new").onclick = () => teamEditor();
      el("ag-team-edit").onclick = () => teamEditor(t);
      if (el("ag-team-dissolve")) el("ag-team-dissolve").onclick = async () => { if (!await uiConfirm("Disband this ad-hoc team?")) return; try { await api("/api/teams/dissolve",{id:teamScope}); teamScope = ""; render(); } catch(e) { uiNotify(e.message); } };
      el("ag-team-go-chat").onclick = () => { window.__teamMode = "chat"; render(); };
      el("ag-member-new").onclick = () => memberEditor(teamScope);
      container.querySelectorAll("[data-ag-team]").forEach(b => b.onclick = () => { teamScope = b.dataset.agTeam; teamSession = ""; localStorage.setItem("rw-team-chat",teamScope); render(); });
      container.querySelectorAll("[data-ag-member]").forEach(b => b.onclick = () => memberEditor(teamScope,data.members.find(m => m.id === b.dataset.agMember)));
      el("ag-team-session").onchange = async e => { try { teamSession = e.target.value; await request("team-session",{team_id:teamScope,session_id:teamSession}); render(); } catch(e) { uiNotify(e.message); } };
      el("ag-session-new").onclick = async () => { try { const r = await request("team-session",{team_id:teamScope,create:true}); teamSession = r.session.id; render(); } catch(e) { uiNotify(e.message); } };
    } catch(e) { error(container,e); }
  };

  const originalRenderTeam = typeof renderTeam === "function" ? renderTeam : null;
  renderTeam = function(container) {
    if (window.__teamMode === "manage") return renderTeamSettings(container);     // edit headcount
    if (window.__teamMode === "chat" && originalRenderTeam) return originalRenderTeam(container);
    return renderTeamOffice(container);                                          // ground-floor layout
  };

  const originalSettings = renderSettings;
  renderSettings = function(container) {
    if (setSec === "teams") {
      container.innerHTML = `<div class="page-head"><h3>Settings / Team</h3><button class="btn" id="ag-settings-back">Back to settings</button></div><div id="ag-settings-teams"></div>`;
      el("ag-settings-back").onclick = () => { setSec = "theme"; render(); };
      renderTeamSettings(el("ag-settings-teams"));
      return;
    }
    originalSettings(container);
    const nav = container.querySelector(".set-nav");
    if (nav && !nav.querySelector("[data-ag-set-team]")) {
      const b = document.createElement("button"); b.className = "set-row"; b.dataset.agSetTeam = "1"; b.textContent = "Team settings";
      b.onclick = () => { setSec = "teams"; render(); }; nav.append(b);
    }
  };
  window.renderTeamSettings = renderTeamSettings;
  window.AgentSettings = {eligible,openAssistant(id) { assistantId = id; openTab("assistants"); },openProvider:providerEditor};
})();
