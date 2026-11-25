/* Community discovery and installation. Assistant configuration stays in its existing view. */
(() => {
  "use strict";
  const e = value => esc(String(value ?? ""));
  const sourceLink = value => {
    try { const url = new URL(value); return url.protocol === "https:" ? url.href : "#"; }
    catch (_) { return "#"; }
  };
  const style = document.createElement("style");
  style.textContent = `
    .si-tabs,.si-search,.si-target,.si-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:12px 0}
    .si-search input,.si-source-input{flex:1;min-width:180px}
    .si-search select,.si-target select{max-width:290px}
    .si-results{display:grid;gap:9px;max-height:380px;overflow:auto;margin:12px 0}
    .si-result{padding:13px;border:1px solid var(--line);border-radius:9px;background:var(--panel2,var(--panel))}
    .si-result-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
    .si-result h4{margin:0;font-size:14px;overflow-wrap:anywhere}
    .si-desc{font-size:12.5px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}
    .si-meta{font-size:12px;color:var(--muted);overflow-wrap:anywhere}
    .si-preview{border-top:1px solid var(--line);padding-top:12px;margin-top:14px}
    .si-candidate{display:block;padding:12px;border:1px solid var(--line);border-radius:9px;margin:8px 0}
    .si-candidate summary{cursor:pointer;margin-top:8px;font-size:12px;color:var(--muted)}
    .si-candidate pre{max-height:250px;overflow:auto;white-space:pre-wrap;font-size:12px;line-height:1.6}
    .si-status{min-height:22px;overflow-wrap:anywhere}
    .si-source-list{display:grid;gap:9px;margin:12px 0}
    .si-source-row{padding:13px;border:1px solid var(--line);border-radius:9px}
    .si-source-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
    .si-source-buttons{display:flex;gap:7px;flex-wrap:wrap}
    .si-source-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}
    .si-source-fields label{display:grid;gap:5px;min-width:0;font-size:12.5px}
    .si-source-fields [hidden]{display:none}
    .si-source-fields .control{width:100%;box-sizing:border-box}
    .si-source-wide{grid-column:1/-1}
    .si-source-errors{white-space:pre-wrap;color:var(--warn,#d99a40);font-size:12.5px;line-height:1.6}
    .si-origin{font-size:11px;margin-right:7px}
    @media(max-width:600px){.si-source-fields{grid-template-columns:1fr}.si-source-buttons .btn{padding:5px 8px}}
    @media(max-width:600px){.si-search,.si-target{align-items:stretch;flex-direction:column}.si-search select,.si-target select{max-width:none;width:100%}.si-search input{min-width:0}.si-result-head{align-items:flex-start}}
  `;
  document.head.appendChild(style);

  function open({dialog, projectId = "", projects = [], onInstalled, initialTab = "community"}) {
    const initialProject = projects.find(project => project.id === projectId && project.base_dir);
    let sources = [], adapters = [], defaults = [], currentPreview = null, generation = 0, busy = false, sourcesLoaded = false;
    const host = dialog("Install skill", `
      <p class="hint">Built-in community sources are searchable. You can also import community links,GitHub a repository, a local skill folder, or an archive.</p>
      <div class="si-tabs">
        <button class="btn" data-si-tab="community" aria-pressed="true">Community search</button>
        <button class="btn ghost" data-si-tab="import" aria-pressed="false">Link / Local import</button>
        <button class="btn ghost" data-si-tab="sources" aria-pressed="false">Sources</button>
      </div>
      <section data-si-community>
        <form class="si-search" data-si-search-form>
          <select class="control" data-si-provider aria-label="Skill source" disabled><option>LoadingBuilt-in sources...</option></select>
          <input class="control" data-si-query aria-label="Search community skills" placeholder="Search skills, for example: papers,pdf, writing" minlength="2" maxlength="200" required>
          <button class="btn" type="submit" data-si-search disabled>Search</button>
        </form>
        <p class="hint" data-si-source-description></p>
        <p class="si-source-errors" data-si-source-errors role="status" aria-live="polite"></p>
        <div class="si-results" data-si-results></div>
      </section>
      <section data-si-sources hidden>
        <p class="hint">Searches every enabled source by default. Editing or deleting is saved locally and installed skills are kept.</p>
        <div class="si-actions">
          <button class="btn" data-si-source-add disabled>Add source</button>
          <button class="btn ghost" data-si-source-restore disabled>Restore built-in sources</button>
        </div>
        <div class="si-source-list" data-si-source-list></div>
        <section data-si-source-editor hidden></section>
      </section>
      <section data-si-import hidden>
        <form class="si-search" data-si-import-form>
          <input class="control si-source-input" data-si-source aria-label="Skill link or local path" placeholder="https:
          <button class="btn" type="submit" data-si-preview-button>Read skills</button>
        </form>
        <p class="hint">Supported skills.sh, SkillHub, SkillsMP detail link,GitHub Repository / skill folders,owner/repo@skill, as well as local folders,ZIP, .skill, tar.gz. </p>
      </section>
      <p class="hint si-status" data-si-status role="status" aria-live="polite"></p>
      <section class="si-preview" data-si-preview hidden></section>
    `, (overlay, close) => {
      const field = selector => overlay.querySelector(selector);
      const status = text => { field("[data-si-status]").textContent = text; };
      const error = value => { field("[data-error]").textContent = value?.message || String(value || ""); };
      function setBusy(value) {
        busy = value;
        overlay.querySelectorAll("[data-si-search],[data-si-preview-button],[data-si-result-preview],[data-si-install],[data-si-provider],[data-si-source-action],[data-si-source-add],[data-si-source-restore],[data-si-source-save]").forEach(button => {
          button.disabled = value || button.hasAttribute("data-si-unavailable");
        });
        field("[data-si-search]").disabled = value || !sourcesLoaded || !sources.some(source => source.enabled);
        field("[data-si-provider]").disabled = value || !sourcesLoaded;
      }
      function clearPreview() {
        currentPreview = null;
        field("[data-si-preview]").hidden = true;
        field("[data-si-preview]").innerHTML = "";
      }
      function sourceDescription() {
        if (field("[data-si-provider]").value === "all") {
          const count = sources.filter(source => source.enabled).length;
          field("[data-si-source-description]").textContent = count
            ? `Search all ${count} enabled sources, or pick a single source.`
            : "No enabled sources; enable or add one under ”Sources”.";
          return;
        }
        const source = sources.find(item => item.id === field("[data-si-provider]").value);
        field("[data-si-source-description]").innerHTML = source
          ? `${e(source.description)} <a href="${e(sourceLink(source.url))}" target="_blank" rel="noopener noreferrer">Access ${e(source.name)}</a>` : "";
      }
      function showSources(result, reset = false) {
        sources = result.sources;
        adapters = result.adapters || adapters;
        defaults = result.defaults || defaults;
        sourcesLoaded = true;
        const previous = field("[data-si-provider]").value;
        field("[data-si-provider]").innerHTML = '<option value="all">All sources</option>' +
          sources.filter(source => source.enabled).map(source => `<option value="${e(source.id)}">${e(source.name)}</option>`).join("");
        field("[data-si-provider]").value = sources.some(source => source.enabled && source.id === previous) ? previous : "all";
        sourceDescription(); renderSources(); setBusy(busy);
        if (reset) {
          ++generation; clearPreview();
          field("[data-si-results]").innerHTML = "";
          field("[data-si-source-errors]").textContent = "";
        }
      }
      async function changeSources(path, body, message) {
        if (busy) return;
        error(""); setBusy(true);
        try {
          const result = await api(path, body);
          if (!overlay.isConnected) return;
          showSources(result, true);
          field("[data-si-source-editor]").hidden = true;
          status(message);
        } catch (failure) { if (overlay.isConnected) error(failure); }
        finally { if (overlay.isConnected) setBusy(false); }
      }
      function renderSources() {
        field("[data-si-source-list]").innerHTML = sources.length ? sources.map(source => `
          <article class="si-source-row" data-si-source-id="${e(source.id)}">
            <div class="si-source-head">
              <strong>${e(source.name)} <span class="pill">${source.enabled ? "Enabled" : "Disabled"}</span> <span class="si-meta">${source.builtin ? "Built-in" : "Custom"}</span></strong>
              <div class="si-source-buttons">
                <button class="btn ghost" data-si-source-action="edit" data-id="${e(source.id)}">Edit</button>
                <button class="btn ghost" data-si-source-action="toggle" data-id="${e(source.id)}">${source.enabled ? "Disable" : "Enable"}</button>
                <button class="btn ghost" data-si-source-action="delete" data-id="${e(source.id)}">Delete</button>
              </div>
            </div>
            <p class="si-meta">${e(source.description)}</p>
            <p class="si-meta">${e(source.api_url)}</p>
          </article>`).join("") : '<p class="hint">No sources configured; add a source or restore the built-in ones.</p>';
        overlay.querySelectorAll("[data-si-source-action]").forEach(button => button.onclick = () => {
          const source = sources.find(item => item.id === button.dataset.id);
          if (button.dataset.siSourceAction === "edit") editSource(source);
          if (button.dataset.siSourceAction === "toggle") changeSources("/api/capabilities/skill-sources", {id: source.id, enabled: !source.enabled}, source.enabled ? "Source disabled." : "Source enabled.");
          if (button.dataset.siSourceAction === "delete") changeSources("/api/capabilities/skill-sources/delete", {id: source.id}, "Source deleted; installed skills were kept.");
        });
      }
      function editSource(source = {}) {
        if (busy || !sourcesLoaded) return;
        error(""); status("");
        const editor = field("[data-si-source-editor]");
        editor.hidden = false;
        editor.innerHTML = `<form data-si-source-form>
          <h4>${source.id ? "Edit source" : "Add source"}</h4>
          <div class="si-source-fields">
            <label>Source name<input class="control" data-si-config="name" maxlength="80" value="${e(source.name || "")}" required></label>
            <label>Source type<select class="control" data-si-config="adapter">${adapters.map(adapter => `<option value="${e(adapter.id)}" ${adapter.id === (source.adapter || "index") ? "selected" : ""}>${e(adapter.name)}</option>`).join("")}</select></label>
            <label class="si-source-wide">Site URL<input class="control" type="url" data-si-config="url" value="${e(source.url || "")}" placeholder="https://example.com" required></label>
            <label class="si-source-wide">Search endpoint / Skill index URL<input class="control" type="url" data-si-config="api_url" value="${e(source.api_url || "")}" placeholder="https://example.com/.well-known/skills/index.json" required></label>
            <label class="si-source-wide" data-si-download-field ${source.adapter === "skillhub" ? "" : "hidden"}>Download URL template<input class="control" data-si-config="download_url" value="${e(source.download_url || "")}" placeholder="https://example.com/api/v1/download?slug={slug}"></label>
            <label class="si-source-wide">Description<input class="control" data-si-config="description" maxlength="1000" value="${e(source.description || "")}"></label>
          </div>
          <label><input type="checkbox" data-si-config="enabled" ${source.enabled !== false ? "checked" : ""}> enabled, searched across every source</label>
          <div class="si-actions"><button class="btn" type="submit" data-si-source-save>Save source</button><button class="btn ghost" type="button" data-si-source-cancel>Cancel</button></div>
        </form>`;
        editor.querySelector("[data-si-source-cancel]").onclick = () => { editor.hidden = true; };
        const configField = key => editor.querySelector('[data-si-config="' + key + '"]');
        configField("adapter").onchange = event => {
          const preset = defaults.find(item => item.adapter === event.target.value);
          field("[data-si-download-field]").hidden = event.target.value !== "skillhub";
          if (!source.id && preset) {
            for (const key of ["url", "api_url", "download_url"]) configField(key).value = preset[key] || "";
          }
        };
        editor.querySelector("form").onsubmit = event => {
          event.preventDefault();
          const body = source.id ? {id: source.id} : {};
          for (const key of ["name", "adapter", "url", "api_url", "download_url", "description"]) body[key] = configField(key).value.trim();
          body.enabled = configField("enabled").checked;
          changeSources("/api/capabilities/skill-sources", body, "Source saved; searches will use the new config.");
        };
        configField("name").focus();
      }
      async function preview(source, provider = "", selection = null) {
        if (busy) return;
        const ticket = ++generation;
        error(""); clearPreview(); setBusy(true); status("Downloading and checking the skill catalog...");
        try {
          const result = await api("/api/capabilities/skill-preview", {source, provider, selection});
          if (!overlay.isConnected || ticket !== generation) return;
          currentPreview = result;
          const target = field("[data-si-preview]");
          target.hidden = false;
          target.innerHTML = `
            <h4>Choose the skills to install <span class="pill">${result.skills.length}</span></h4>
            <p class="si-meta">${e(result.source)}</p>
            <div class="si-target">
              <label>Install scope <select class="control" data-si-scope aria-label="Install scope">
                <option value="user" ${initialProject ? "" : "selected"}>User level; available in every project</option>
                <option value="project" ${initialProject ? "selected" : ""}>Project level; stored in the chosen project only</option>
              </select></label>
              <select class="control" data-si-project aria-label="Install into a project" ${initialProject ? "" : "hidden"}>
                <option value="">Choose a project</option>
                ${projects.filter(item => item.base_dir).map(item => `<option value="${e(item.id)}" ${item.id === initialProject?.id ? "selected" : ""}>${e(item.title)}</option>`).join("")}
              </select>
            </div>
            <div data-si-candidates>${result.skills.map(skill => `
              <div class="si-candidate">
                <label><input type="checkbox" data-si-skill value="${e(skill.name)}" ${result.skills.length === 1 ? "checked" : ""}> <strong>${e(skill.name)}</strong> <span class="si-meta">${skill.files} files</span></label>
                <p class="si-desc">${e(skill.description || "No description")}</p>
                <details><summary>View SKILL.md</summary><pre>${e(skill.content)}</pre></details>
              </div>`).join("")}</div>
            <div class="si-actions"><button class="btn" data-si-install>Install the selected skills</button><span class="hint">Installs the whole skill folder and its resources.</span></div>
          `;
          field("[data-si-scope]").onchange = event => { field("[data-si-project]").hidden = event.target.value !== "project"; };
          field("[data-si-install]").onclick = install;
          status("Skills are ready. Choose an install scope to install.");
        } catch (failure) { if (overlay.isConnected && ticket === generation) { error(failure); status(""); } }
        finally { if (overlay.isConnected && ticket === generation) setBusy(false); }
      }
      async function install() {
        if (busy || !currentPreview) return;
        const skills = [...overlay.querySelectorAll("[data-si-skill]:checked")].map(input => input.value);
        const scope = field("[data-si-scope]").value;
        const selectedProject = field("[data-si-project]").value;
        if (!skills.length) { error("Select at least one skill to install"); return; }
        if (scope === "project" && !selectedProject) { error("Pick a project that has a folder set"); return; }
        error(""); setBusy(true); status("Installing skill...");
        try {
          const result = await api("/api/capabilities/skill-install", {
            token: currentPreview.token, skills, scope, ...(scope === "project" ? {project_id: selectedProject} : {})
          });
          if (overlay.isConnected) {
            const target = field("[data-si-preview]");
            target.innerHTML = `<h4>Installed ${result.installed.length} skills</h4>${result.installed.map(item => `<p><strong>${e(item.name)}</strong><br><span class="si-meta">${e(item.path)}</span></p>`).join("")}<button class="btn" data-si-done>Done</button>`;
            field("[data-si-done]").onclick = close;
            status("Install complete; full skill catalog saved.");
          }
          try { await onInstalled?.(); }
          catch (_) { if (overlay.isConnected) status("Install complete. Refresh the skill list to see it."); }
        } catch (failure) { if (overlay.isConnected) { error(failure); status("Install did not finish; check the message and retry."); } }
        finally { if (overlay.isConnected) setBusy(false); }
      }
      field("[data-si-search-form]").onsubmit = async event => {
        event.preventDefault();
        if (busy) return;
        const query = field("[data-si-query]").value.trim(), provider = field("[data-si-provider]").value;
        if (query.length < 2) { error("Enter at least 2 characters"); return; }
        const ticket = ++generation;
        clearPreview(); error(""); setBusy(true); status("Searching community skills...");
        field("[data-si-results]").innerHTML = "";
        field("[data-si-source-errors]").textContent = "";
        try {
          const result = await api("/api/capabilities/skill-search?" + new URLSearchParams({provider, q: query}));
          if (!overlay.isConnected || ticket !== generation) return;
          field("[data-si-results]").innerHTML = result.skills.map((skill, index) => `
            <article class="si-result">
              <div class="si-result-head"><h4>${e(skill.name)}</h4><button class="btn ghost" data-si-result-preview="${index}" ${skill.source ? "" : "disabled data-si-unavailable"}>Preview install</button></div>
              <p class="si-desc">${e(skill.description)}</p>
              <div class="si-meta"><span class="pill si-origin">${e(skill.provider_name || sources.find(source => source.id === skill.provider)?.name || "")}</span>${e(skill.author)}${skill.downloads != null ? ` · ${Number(skill.downloads).toLocaleString()} installs / Download` : ""} · <a href="${e(sourceLink(skill.url))}" target="_blank" rel="noopener noreferrer">Source details</a></div>
            </article>`).join("");
          overlay.querySelectorAll("[data-si-result-preview]").forEach(button => {
            button.onclick = () => {
              const skill = result.skills[Number(button.dataset.siResultPreview)];
              preview(skill.source, skill.provider || provider, skill);
            };
          });
          const failures = result.errors || [];
          field("[data-si-source-errors]").textContent = failures.map(failure => failure.name + ": " + failure.error).join("\n");
          status(result.skills.length ? `Found ${result.skills.length} skills. Choose "Preview install" to see contents.${failures.length ? " Some sources failed; other results are shown." : ""}`
            : failures.length ? "Source search failed; check the source config or retry later." : result.message || "No matching skill; try other keywords or another source.");
        } catch (failure) { if (overlay.isConnected && ticket === generation) { error(failure); status(""); } }
        finally { if (overlay.isConnected && ticket === generation) setBusy(false); }
      };
      field("[data-si-import-form]").onsubmit = event => { event.preventDefault(); preview(field("[data-si-source]").value.trim()); };
      field("[data-si-provider]").onchange = () => {
        ++generation; busy = false; setBusy(false); clearPreview(); error(""); status("");
        field("[data-si-results]").innerHTML = ""; sourceDescription();
        field("[data-si-source-errors]").textContent = "";
      };
      function switchTab(tabName) {
        if (busy) return;
        for (const name of ["community", "import", "sources"]) field("[data-si-" + name + "]").hidden = name !== tabName;
        overlay.querySelectorAll("[data-si-tab]").forEach(tab => {
          const active = tab.dataset.siTab === tabName;
          tab.classList.toggle("ghost", !active); tab.setAttribute("aria-pressed", String(active));
        });
        const title = tabName === "sources" ? "Skill sources" : "Install skill";
        field(".cap-dialog-head h3").textContent = title;
        field(".cap-dialog").setAttribute("aria-label", title);
        error(""); status(""); clearPreview();
      }
      overlay.querySelectorAll("[data-si-tab]").forEach(button => button.onclick = () => switchTab(button.dataset.siTab));
      field("[data-si-source-add]").onclick = () => editSource();
      field("[data-si-source-restore]").onclick = () => changeSources("/api/capabilities/skill-sources/restore", {}, "Built-in sources were restored to their default configuration.");
      switchTab(initialTab);
      api("/api/capabilities/skill-sources").then(result => {
        if (!overlay.isConnected) return;
        showSources(result);
      }).catch(failure => { if (overlay.isConnected) error(failure); });
    });
    return host;
  }
  window.SkillInstaller = {open};
})();
