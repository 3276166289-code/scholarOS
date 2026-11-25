/* Explicit connector configuration and previews; external writes are never implicit. */
(() => {
  "use strict";
  const e = value => esc(String(value ?? ""));
  let assistantId = "", projectId = "", generation = 0;
  // Device authorization sessions are keyed by assistant so switching assistants can
  // never display or poll another assistant's QR/session.
  const registrationSessions = new Map();
  const style = document.createElement("style");
  style.textContent = `
    .integration-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .integration-grid .field{display:grid;gap:6px}
    .integration-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:14px 0}
    .integration-result{white-space:pre-wrap;overflow-wrap:anywhere;max-height:380px;overflow:auto}
    .integration-docs{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}
    .integration-json{min-height:190px;width:100%;font-family:Consolas,monospace}
    .integration-error{color:var(--err);white-space:pre-wrap}
    .integration-status{padding:12px;border:1px solid var(--line);border-radius:9px;margin:12px 0}
    .feishu-registration{margin:14px 0;padding:14px;border:1px solid var(--line);border-radius:10px;background:color-mix(in srgb,var(--panel) 88%,var(--accent) 12%)}
    .feishu-registration-grid{display:grid;grid-template-columns:minmax(150px,220px) 1fr;gap:14px;align-items:start}
    .feishu-qr{min-height:170px;display:grid;place-items:center;padding:10px;border:1px dashed var(--line);border-radius:8px;background:var(--panel);text-align:center}
    .feishu-qr img,.feishu-qr canvas{display:block;max-width:100%;width:220px;height:220px;object-fit:contain;background:#fff}
    .feishu-qr a{overflow-wrap:anywhere}
    .feishu-countdown{font-variant-numeric:tabular-nums;font-weight:600}
    .sc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
    .sc-title-group{display:flex;gap:12px;align-items:center}
    .sc-icon{font-size:24px;display:grid;place-items:center;width:40px;height:40px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);flex:none}
    .es-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:6px;font-size:11.5px;font-weight:600;line-height:1.4;margin:2px 4px 2px 0}
    .es-badge.sci{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);border:1px solid var(--accent)}
    .es-badge.top{background:#f59e0b26;color:#d97706;border:1px solid #d97706}
    .es-badge.warn{background:#ef444422;color:#ef4444;border:1px solid #ef4444;font-weight:700}
    .es-badge.jcr{background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok);border:1px solid var(--ok)}
    .es-badge.if{background:var(--panel2);color:var(--fg);border:1px solid var(--line)}
    .es-badge.ccf{background:#8b5cf622;color:#8b5cf6;border:1px solid #8b5cf6}
    .es-badge.domestic{background:var(--panel2);color:var(--muted);border:1px solid var(--line)}
    @media(max-width:760px){
      .integration-grid{grid-template-columns:1fr}
      .feishu-registration-grid{grid-template-columns:1fr}
      .feishu-qr img,.feishu-qr canvas{width:190px;height:190px}
      .sc-head{flex-direction:column;align-items:stretch}
    }
  `;
  document.head.appendChild(style);

  for (const item of [["easyscholar", "🎓", "easyScholar quartile"], ["zotero", "Z", "Zotero write and sync"], ["channels", "↗", "Message channel"]]) {
    if (!SET_SECS.some(section => section[0] === item[0])) SET_SECS.push(item);
  }

  function host() { return document.getElementById("integration-settings"); }
  function field(id) { return document.getElementById(id); }
  function error(message) { const box = field("integration-error"); if (box) box.textContent = String(message?.message || message || ""); }
  async function action(button, work) {
    button.disabled = true; error("");
    try { await work(); } catch (err) { if (button.isConnected) error(err); }
    finally { button.disabled = false; }
  }
  function docs(links) {
    return `<div class="integration-docs">${Object.entries(links).map(([label, url]) => `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>`).join("")}</div>`;
  }
  function optionRows(rows, selected, label) {
    return rows.map(row => `<option value="${e(row.id)}" ${row.id === selected ? "selected" : ""}>${e(row[label])}</option>`).join("");
  }

  // ==================== easyScholar Settings ====================
  async function loadEasyScholar() {
    const ticket = ++generation;
    const cfg = await api("/api/easyscholar/config");
    if (ticket !== generation || setSec !== "easyscholar" || !host()) return;

    host().innerHTML = `
      <div class="card">
        <div class="sc-head">
          <div class="sc-title-group">
            <span class="sc-icon">🎓</span>
            <div>
              <p class="inst-label" style="margin:0 0 2px">JOURNAL TIERS & PARTITIONS</p>
              <h3 style="margin:0">easyScholar Journal tier and SCI Quartile</h3>
              <p class="hint" style="margin:4px 0 0">Look up journal quartiles without a key (CAS upgraded major categories/Subcategory/Top/alerts,JCR quartiles, impact factor,CCF tier, domestic core).</p>
            </div>
          </div>
          <button class="as-toggle ${cfg.enabled ? "on" : "off"}" id="es-toggle" type="button">
            <span class="as-knob"></span><span class="as-toggle-txt">${cfg.enabled ? "Enabled" : "Disabled"}</span>
          </button>
        </div>

        <div class="integration-status">
          Endpoint: <code>https:
        </div>

        <div class="integration-grid">
          <label class="field" style="grid-column: 1 / -1">
            <span>easyScholar Key (SecretKey)${cfg.key_present ? " (saved; leave blank to keep the old value)" : ""}</span>
            <div style="display:flex;gap:8px">
              <input class="control" type="password" id="es-key" placeholder="in easyScholar ConsoleCopy SecretKey" style="flex:1" autocomplete="new-password">
              <button class="btn ghost" type="button" id="es-key-eye" title="Show plain text">👁</button>
            </div>
            <span class="hint">Key usage Windows DPAPI (securestore) Encrypted on this machine; the front end never returns plain text.</span>
          </label>
        </div>

        <div class="integration-actions">
          <button class="btn" id="es-save">Save settings</button>
          <button class="btn ghost" id="es-test">Test connectionand authentication</button>
          <a class="btn ghost" href="https://www.easyscholar.cc/console/user/open" target="_blank" rel="noopener noreferrer">Get SecretKey ↗</a>
        </div>

        <hr style="margin:16px 0;border:none;border-top:1px solid var(--line)">

        <h4 style="margin:0 0 8px">🧪 Quick journal tier lookup</h4>
        <div class="integration-actions" style="margin:0 0 10px">
          <input class="control" id="es-probe-input" value="Nature" placeholder="Enter the full journal name or its standard abbreviation" style="max-width:320px">
          <button class="btn ghost" id="es-probe-btn">Look up the quartile</button>
        </div>
        <div id="es-probe-badges" style="display:flex;gap:6px;flex-wrap:wrap;min-height:30px;align-items:center">
          <span class="hint">Click check quartile to see this journal’s quartile labels.</span>
        </div>

        <div id="integration-error" class="integration-error"></div>
        <div id="integration-result" class="integration-result"></div>
      </div>
    `;

    let isEnabled = !!cfg.enabled;
    field("es-toggle").onclick = () => {
      isEnabled = !isEnabled;
      field("es-toggle").className = `as-toggle ${isEnabled ? "on" : "off"}`;
      field("es-toggle").querySelector(".as-toggle-txt").textContent = isEnabled ? "Enabled" : "Disabled";
      field("es-st-txt").textContent = isEnabled ? "Enabled" : "Disabled";
    };

    field("es-key-eye").onclick = () => {
      const inp = field("es-key");
      inp.type = inp.type === "password" ? "text" : "password";
    };

    field("es-save").onclick = event => action(event.target, async () => {
      const keyVal = field("es-key").value.trim();
      const res = await api("/api/easyscholar/config", {enabled: isEnabled, secret_key: keyVal});
      if (res.ok) {
        field("integration-result").textContent = "Config saved. The key is stored encrypted.";
        await loadEasyScholar();
      }
    });

    field("es-test").onclick = event => action(event.target, async () => {
      const keyVal = field("es-key").value.trim();
      field("integration-result").textContent = "Starting easyScholar auth probe...";
      const res = await api("/api/easyscholar/test", {secret_key: keyVal});
      if (res.ok) {
        field("integration-result").textContent = `${res.msg} (Time taken ${res.cost_ms}ms)\nsample journal Nature Matched tags: ${(res.sample_badges || []).join(" · ")}`;
      } else {
        throw new Error(res.msg || "Auth failed");
      }
    });

    field("es-probe-btn").onclick = event => action(event.target, async () => {
      const jname = field("es-probe-input").value.trim();
      if (!jname) return;
      field("es-probe-badges").innerHTML = `<span class="hint">Querying...</span>`;
      const res = await api("/api/easyscholar/rank?journal=" + encodeURIComponent(jname));
      if (!res.ok) {
        field("es-probe-badges").innerHTML = `<span class="integration-error">${e(res.msg || "Query failed")}</span>`;
        return;
      }
      const badges = res.badges || [];
      if (!badges.length) {
        field("es-probe-badges").innerHTML = `<span class="hint">No quartile data for this journal.</span>`;
        return;
      }
      field("es-probe-badges").innerHTML = badges.map(b => `<span class="es-badge ${b.type}">${e(b.label)}</span>`).join("");
    });
  }

  // ==================== Lark settings ====================
  function registrationMarkup(cfg) {
    const session = registrationSessions.get(assistantId);
    const region = session?.region || cfg.registration_region || cfg.region || "feishu";
    const active = session && session.status === "pending";
    const qr = active ? (session.qrUrl || session.verificationUriComplete || "") : "";
    const qrImage = active && session.qrDataUri && /^data:image\/(?:svg\+xml|png);/i.test(session.qrDataUri) ? `<img src="${e(session.qrDataUri)}" alt="Lark QR code">` : "";
    const statusText = active ? "Waiting for phone approval..." : session?.status === "success" ? "Bound" : session ? e(session.message || "Scan binding not started") : "Scan binding not started";
    return `<div class="feishu-registration" data-feishu-registration>
      <h4 style="margin:0 0 6px">Bind an expert by phone scan</h4>
      <p class="hint" style="margin-top:0">Use Lark/Lark Official Device Authorization: Pick a region to get a one-time QR code; scan it in Lark on your phone to bind that account to this expert. The authorisation session stays on this machine.</p>
      <div class="integration-grid">
        <label class="field"><span>Region</span><select class="control" id="fs-region"><option value="feishu" ${region === "feishu" ? "selected" : ""}>Lark (mainland China)</option><option value="lark" ${region === "lark" ? "selected" : ""}>Lark (international)</option></select></label>
        <div class="integration-actions" style="margin:0;align-items:end"><button class="btn" id="fs-device-begin">${active ? "Regenerate the QR code" : "Bind by phone scan"}</button><button class="btn ghost" id="fs-device-cancel" ${active ? "" : "hidden"}>Cancel chat</button></div>
      </div>
      <div class="feishu-registration-grid" style="margin-top:12px">
        <div class="feishu-qr" id="fs-device-qr">${qrImage || (qr ? `<div><div class="hint">Open or scan the official link on your phone</div><a href="${e(qr)}" target="_blank" rel="noopener noreferrer">Open the Lark authorisation link</a></div>` : `<span class="hint">Click“Bind by phone scan”Generate a QR code</span>`)}</div>
        <div><div class="integration-status" id="fs-device-status" style="margin:0">${statusText}</div>
          <div class="hint" id="fs-device-countdown" style="margin-top:8px">${active && session.expiresAt ? "Calculating QR expiry..." : ""}</div>
          <div class="hint" style="margin-top:8px">If this client cannot show a QR code, use the official link above and confirm in your phone browser or Lark.</div></div>
      </div>
    </div>`;
  }
  function registrationStatus(text, kind) {
    const box = field("fs-device-status");
    if (box) { box.textContent = text; box.dataset.state = kind || ""; }
  }
  function renderRegistrationSession(session) {
    if (!session || assistantId !== session.assistantId || setSec !== "feishu") return;
    const qr = session.status === "pending" ? (session.qrUrl || session.verificationUriComplete || "") : "";
    const qrBox = field("fs-device-qr");
    if (qrBox) {
      const qrImage = session.status === "pending" && session.qrDataUri && /^data:image\/(?:svg\+xml|png);/i.test(session.qrDataUri) ? `<img src="${e(session.qrDataUri)}" alt="Lark QR code">` : "";
      qrBox.innerHTML = qrImage || (qr ? `<div><div class="hint">Scan the QR code in Lark on your phone, or open the official link</div><a href="${e(qr)}" target="_blank" rel="noopener noreferrer">Open the Lark authorisation link</a></div>` : `<span class="hint">QR code address is empty, please retry</span>`);
    }
    const cancel = field("fs-device-cancel"); if (cancel) cancel.hidden = session.status !== "pending";
    const begin = field("fs-device-begin"); if (begin) begin.textContent = session.status === "pending" ? "Regenerate QR code" : "Scan with phone";
    registrationStatus(session.status === "pending" ? "Waiting for phone approval..." : session.status === "success" ? "Bound" : session.message || "Authorization failed", session.status);
    if (session.status === "success" && session.openId) registrationStatus(`Bound (open_id: ${session.openId})`, "success");
  }
  function updateRegistrationCountdown(session) {
    if (!session || assistantId !== session.assistantId || setSec !== "feishu") return;
    const box = field("fs-device-countdown");
    if (!box || !session.expiresAt) return;
    const seconds = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000));
    box.textContent = seconds ? `QR code valid for: ${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s` : "The QR code expired. Generate a new one.";
    if (!seconds && session.status === "pending") {
      session.status = "error"; session.message = "QR code expired";
      if (session.timer) { clearTimeout(session.timer); session.timer = null; }
      renderRegistrationSession(session);
    }
  }
  function startRegistrationCountdown(session) {
    if (session.countdownTimer) clearInterval(session.countdownTimer);
    if (!session.expiresAt) return;
    updateRegistrationCountdown(session);
    session.countdownTimer = setInterval(() => {
      if (!registrationSessions.has(session.assistantId) || registrationSessions.get(session.assistantId) !== session || session.status !== "pending") {
        clearInterval(session.countdownTimer); session.countdownTimer = null; return;
      }
      if (assistantId !== session.assistantId || setSec !== "feishu") {
        clearInterval(session.countdownTimer); session.countdownTimer = null; return;
      }
      updateRegistrationCountdown(session);
    }, 1000);
  }
  function scheduleRegistrationPoll(session, delay) {
    if (!session || session.status !== "pending") return;
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => { session.timer = null; pollRegistration(session); }, Math.max(1000, Number(delay || session.intervalMs || 5000)));
  }
  function registrationIntervalMs(result, fallback = 5000) {
    const intervalMs = Number(result?.interval_ms);
    if (Number.isFinite(intervalMs) && intervalMs > 0) return intervalMs;
    const intervalSeconds = Number(result?.interval);
    if (Number.isFinite(intervalSeconds) && intervalSeconds > 0) return intervalSeconds * 1000;
    return fallback;
  }
  function registrationPollDelay(result, session) {
    return registrationIntervalMs(result, session.intervalMs || 5000);
  }
  async function pollRegistration(session) {
    if (!session || registrationSessions.get(session.assistantId) !== session || session.status !== "pending") return;
    try {
      // Poll is state-changing; send the assistant/session in the JSON body so
      // the server enforces assistant-scoped sessions.
      const result = await api("/api/feishu/registration/poll", {
        assistant_id: session.assistantId,
        session_id: session.sessionId
      });
      const status = String(result.status || "pending").toLowerCase();
      if (status === "pending" || status === "slow_down") {
        registrationStatus(result.message || "Waiting for phone approval...", "pending");
        scheduleRegistrationPoll(session, registrationPollDelay(result, session));
      } else if (status === "success") {
        session.status = "success"; session.openId = result.open_id || "";
        session.message = "Bound"; if (session.timer) clearTimeout(session.timer);
        if (session.countdownTimer) clearInterval(session.countdownTimer);
        renderRegistrationSession(session);
        const resultBox = field("integration-result"); if (resultBox) resultBox.textContent = `Phone binding succeeded${session.openId ? ` (open_id: ${session.openId})` : ""}. `;
        await loadFeishu();
      } else {
        session.status = "error"; session.message = result.message || result.error || `Authorisation failed (${status})`;
        if (session.countdownTimer) clearInterval(session.countdownTimer);
        renderRegistrationSession(session);
      }
    } catch (err) {
      if (registrationSessions.get(session.assistantId) !== session) return;
      session.status = "error"; session.message = err?.message || String(err);
      if (session.countdownTimer) clearInterval(session.countdownTimer);
      renderRegistrationSession(session);
    }
  }

  async function loadFeishu() {
    const ticket = ++generation;
    if (!assistantId && S.assistants.length) assistantId = S.assistants[0].id;
    const aid = assistantId;
    const current = () => ticket === generation && setSec === "feishu" && !!host();
    const result = await api("/api/feishu/config?assistant_id=" + encodeURIComponent(aid));
    if (ticket !== generation || setSec !== "feishu" || !host()) return;
    const cfg = result.config || {};
    host().innerHTML = `<div class="card"><p class="inst-label">ASSISTANT CONNECTION</p><h3>Lark bot</h3>
      <p class="hint">Configured per expert. Use an enterprise app bot or a group-chat custom bot Webhook. Binding happens on Lark's official authorisation page; nothing creates, publishes, or grants app permissions by itself.</p>
      <label class="field"><span>which expert this configures</span><select class="control" id="int-assistant">${optionRows(S.assistants || [], assistantId, "name")}</select></label>
      ${docs({"Create / Manage the Lark app": result.docs.console, "Official OAuth Authorisation notes": result.docs.oauth, "Bot message permissions": result.docs.bot, "CustomBot description": result.docs.webhook})}
       <div class="integration-status">Scan to authorise: <b>${cfg.authorized ? "Completed" : "Unfinished"}</b>${cfg.expires_at ? ` · User token${cfg.expires_at * 1000 > Date.now() ? "Valid" : "Expired, scan again"}` : ""} · Webhook: ${cfg.webhook_present ? "Configured" : "Not configured"} · Incoming connection: ${e(result.bridge?.status||"stopped")}<br><span class="hint">The app bot must be enabled, published, and allowed to send and receive messages; events arrive over a Lark long connection.</span></div>
      ${registrationMarkup(cfg)}
      <div class="integration-grid">
        <label class="field"><span>App ID</span><input class="control" id="fs-app" value="${e(cfg.app_id)}" placeholder="cli_..."></label>
        <label class="field"><span>App Secret${cfg.app_secret_present ? " (saved; leave blank to keep it)" : ""}</span><input class="control" type="password" id="fs-secret" autocomplete="new-password"></label>
        <label class="field"><span>OAuth Callback URL (must be registered in Lark security settings)</span><input class="control" id="fs-redirect" value="${e(cfg.redirect_uri || location.origin + "/api/feishu/callback")}"></label>
        <label class="field"><span>OAuth Scopes (separated by spaces; the app must be approved)</span><input class="control" id="fs-scopes" value="${e(cfg.scopes || "contact:user.base:readonly offline_access")}"></label>
        <label class="field"><span>Default recipient / Group chat ID (Scanning binds it automatically open_id)</span><input class="control" id="fs-recipient" value="${e(cfg.receive_id)}"></label>
        <label class="field"><span>Recipient type</span><select class="control" id="fs-type">${["open_id", "chat_id", "user_id", "union_id", "email"].map(kind => `<option ${kind === (cfg.receive_id_type || "open_id") ? "selected" : ""}>${kind}</option>`).join("")}</select></label>
         <label class="field"><span>Project receiving the task</span><select class="control" id="fs-project"><option value="">SelectProject</option>${optionRows(S.tasks||[],cfg.project_id||"","title")}</select></label>
         <label class="field"><span>Users allowed to send tasks open_id</span><input class="control" id="fs-sender" value="${e(cfg.allowed_sender||"")}" placeholder="When blank, the scan-bound open_id"></label>
      </div>
       <label class="field"><input type="checkbox" id="fs-inbound" ${cfg.inbound_enabled?"checked":""}> Receives Lark messages and hands project tasks to this expert</label>
      <details style="margin-top:15px"><summary>Optional: a group custom bot (no QR needed; used first once configured)</summary><div class="integration-grid" style="margin-top:12px">
        <label class="field"><span>Webhook${cfg.webhook_present ? " (saved; leave blank to keep it)" : ""}</span><input class="control" id="fs-webhook" type="password" autocomplete="off" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."></label>
        <label class="field"><span>Signature Secret (if signature checks are on)</span><input class="control" id="fs-sign" type="password" autocomplete="new-password"></label>
        <label><input type="checkbox" id="fs-clear-webhook"> Clear the saved Webhook, Use the app bot instead</label></div></details>
      <div class="integration-actions"><label><input type="checkbox" id="fs-enabled" ${cfg.enabled ? "checked" : ""}> Let this expert use the bot</label><button class="btn" id="fs-save">Save settings</button><button class="btn ghost" id="fs-auth">Open the official scan page</button><button class="btn ghost" id="fs-refresh">Refresh authorisation</button></div>
      <div class="integration-actions"><input class="control" id="fs-message" value="scholarOS Lark bot connection test" style="flex:1"><button class="btn ghost" id="fs-test">Send a test message</button></div>
      <div id="integration-error" class="integration-error"></div><div id="integration-result" class="integration-result"></div></div>`;
    field("int-assistant").onchange = async event => { assistantId = event.target.value; await loadFeishu(); };
    field("fs-device-begin").onclick = event => action(event.target, async () => {
      const previous = registrationSessions.get(aid);
      if (previous?.timer) clearTimeout(previous.timer);
      if (previous?.countdownTimer) clearInterval(previous.countdownTimer);
      const region = field("fs-region").value;
      const started = await api("/api/feishu/registration/begin", {assistant_id: aid, region});
      const session = {assistantId: aid, sessionId: started.session_id || started.sessionId, region: started.region || region,
        qrUrl: started.qr_url || started.qrUrl || started.verification_uri_complete || started.verificationUriComplete || started.verification_uri || "",
        qrDataUri: started.qr_svg || started.qr_data_uri || started.qr_image || "",
        verificationUriComplete: started.verification_uri_complete || started.verificationUriComplete || "", intervalMs: registrationIntervalMs(started),
        expiresAt: Date.now() + Math.max(1, Number(started.expires_in || 600)) * 1000, status: String(started.status || "pending").toLowerCase()};
      registrationSessions.set(aid, session);
      renderRegistrationSession(session);
      startRegistrationCountdown(session);
      scheduleRegistrationPoll(session, registrationPollDelay(started, session));
    });
    field("fs-device-cancel").onclick = event => action(event.target, async () => {
      const session = registrationSessions.get(aid);
      if (!session) return;
      if (session.timer) clearTimeout(session.timer);
      if (session.countdownTimer) clearInterval(session.countdownTimer);
      try {
        await api("/api/feishu/registration/cancel", {assistant_id: aid, session_id: session.sessionId});
      } finally {
        session.status = "cancelled";
        session.message = "Scan session cancelled";
        if (current()) registrationStatus("Scan session cancelled", "");
        renderRegistrationSession(session);
      }
    });
    field("fs-save").onclick = event => action(event.target, async () => {
      await api("/api/feishu/config", {assistant_id: aid, app_id: field("fs-app").value.trim(), app_secret: field("fs-secret").value.trim(),
        redirect_uri: field("fs-redirect").value.trim(), scopes: field("fs-scopes").value.trim(), receive_id: field("fs-recipient").value.trim(),
         receive_id_type: field("fs-type").value, project_id: field("fs-project").value,
         allowed_sender: field("fs-sender").value.trim(), inbound_enabled: field("fs-inbound").checked,
         webhook: field("fs-clear-webhook").checked ? "" : field("fs-webhook").value.trim(),
         signing_secret: field("fs-sign").value.trim(), enabled: field("fs-enabled").checked, clear_webhook: field("fs-clear-webhook").checked});
      if (!current()) return;
      await loadFeishu();
      if (generation === ticket + 1 && setSec === "feishu" && field("integration-result")) field("integration-result").textContent = "Config saved.";
    });
    field("fs-auth").onclick = event => action(event.target, async () => {
      const popup = window.open("about:blank", "_blank");
      if (popup) popup.opener = null;
      try {
        const authorization = await api("/api/feishu/authorize", {assistant_id: aid});
        if (!current()) { if (popup) popup.close(); return; }
        if (popup) popup.location = authorization.url;
        field("integration-result").textContent = authorization.hint;
        if (!popup) {
          const link = document.createElement("a"); link.href = authorization.url; link.target = "_blank"; link.rel = "noopener noreferrer";
          link.textContent = "The browser blocked the popup; click to open the official Lark QR page"; field("integration-result").append(document.createElement("br"), link);
        }
      } catch (err) { if (popup) popup.close(); throw err; }
    });
    field("fs-refresh").onclick = event => action(event.target, loadFeishu);
    field("fs-test").onclick = event => action(event.target, async () => {
      const text = field("fs-message").value;
      if (!await uiConfirm("A real test message will be sent to the configured Feishu recipient / group chat. Continue?")) return;
      if (!current()) return;
      const sent = await api("/api/feishu/test", {assistant_id: aid, text});
      if (current()) field("integration-result").textContent = "Sent:" + (sent.message_id || sent.mode || "Confirmed");
    });
  }

  async function loadZotero() {
    const ticket = ++generation;
    if (!projectId || !S.tasks.some(t => t.id === projectId)) projectId = curTask || S.tasks[0]?.id || "";
    const [result, mcpRes] = await Promise.all([
      api("/api/zotero/web/config"),
      api("/api/zotero/mcp/status").catch(() => ({registered: false, enabled: false}))
    ]);
    if (ticket !== generation || setSec !== "zotero" || !host()) return;
    const cfg = result.config || {}, bound = {};
    host().innerHTML = `
      <div class="card switch-card" style="margin-bottom:14px">
        <div class="sc-head">
          <div class="sc-title-group">
            <span class="sc-icon">⚡</span>
            <div>
              <p class="inst-label" style="margin:0 0 2px">MCP PROTOCOL / AGENT CAPABILITY</p>
              <h3 style="margin:0">Zotero stdio MCP Service</h3>
              <p class="hint" style="margin:4px 0 0">Let experts search, read, and edit local Zotero literature and attach notes. Sync and MCP share the local write permission.</p>
            </div>
          </div>
          <span class="pill ${mcpRes.enabled ? "ok" : ""}" id="zm-pill">${mcpRes.enabled ? "MCP Enabled" : "Off"}</span>
        </div>
        <div class="integration-actions" style="margin-top:12px">
          <button class="btn" id="zm-enable">${mcpRes.registered ? "Reactivate / Register MCP" : "Register and enable in one click Zotero MCP"}</button>
          <button class="btn ghost" id="zm-open-mcp">Go to MCP matrix permissions →</button>
        </div>
        <div class="hint" style="margin-top:8px">Tools included: <code>zotero_status</code> · <code>zotero_search</code> · <code>zotero_item</code> · <code>zotero_pdf</code> · <code>zotero_create_item</code> · <code>zotero_update_item</code> · <code>zotero_create_note</code></div>
      </div>

      <div class="card"><p class="inst-label">LIBRARY CONSISTENCY</p><h3>Zotero Connection and authorisation</h3><p class="hint">Set up the local connection and write permissions. Source, references, and sync for project literature live in the project space.</p>
        <p class="hint">Connection: ${cfg.transport==='local'?'Local Zotero, No cloud needed Key':'Web API (compatibility mode)'} · ${result.local?.readable?'readable locally':'Not connected on this machine'} · ${result.local?.authorized?'Local write access granted':'on the first write, Zotero Authorise'}</p>
        <div class="integration-actions"><button class="btn" id="zs-local">Use the local Zotero</button><button class="btn ghost" id="zs-authorize">Check / Grant local write access</button></div>
        <details><summary>Optional: connect a cloud or group Library</summary>
        ${docs({"Create API Key / Get User ID": result.docs.key, "official write API": result.docs.api})}
        <div class="integration-grid"><label class="field"><span>Library Type</span><select class="control" id="zs-type"><option value="users" ${cfg.library_type !== "groups" ? "selected" : ""}>personal user</option><option value="groups" ${cfg.library_type === "groups" ? "selected" : ""}>Group</option></select></label>
        <label class="field"><span>User ID / Group ID (number)</span><input class="control" id="zs-id" value="${e(cfg.library_id)}"></label>
        <label class="field"><span>API Key${cfg.api_key_present ? " (saved; leave blank to keep it)" : ""}</span><input class="control" id="zs-key" type="password" autocomplete="new-password"></label>
        <div class="hint">Grant only the access you need Library read and write access. Group writes also depend on your member role; the desktop Zotero Cloud changes arrive once auto-sync is on.</div></div>
        <div class="integration-actions"><button class="btn" id="zs-save">Switch and save Web API Settings</button></div></details><hr>
        <label class="field"><span>Project</span><select class="control" id="zs-project">${optionRows(S.tasks || [], projectId, "title")}</select></label>
        <p class="hint">In the project space, “Literature”pages, choose several Collection, Add papers one by one, edit references, sync, and remove or restore links.</p>
        <button class="btn" id="zs-manage" ${projectId?'':'disabled'}>OpenProject literatureManage</button>
        <details><summary>Advanced: preview / write a single Zotero Entries JSON</summary><p class="hint">Editing an existing item needs key and version; fields follow Zotero official item format. Writing asks for confirmation again.</p><textarea class="control integration-json" id="zs-item">${e(JSON.stringify({itemType: "journalArticle", title: "", creators: [], tags: [], collections: bound.collection ? [bound.collection] : []}, null, 2))}</textarea><div class="integration-actions"><button class="btn ghost" id="zs-item-preview">format check / Preview</button><button class="btn ghost" id="zs-item-write">Confirm writing the item</button></div></details>
        <div id="integration-error" class="integration-error"></div><pre id="integration-result" class="integration-result"></pre></div>`;

    field("zm-enable").onclick = event => action(event.target, async () => {
      const res = await api("/api/zotero/mcp/enable", {});
      if (res.ok) {
        field("integration-result").textContent = "Zotero MCP registered and enabled!\nThe agent can now call Zotero read/write tools in chat.";
        await loadZotero();
      }
    });

    field("zm-open-mcp").onclick = () => { setSec = "mcp"; render(); };
    field('zs-local').onclick = event => action(event.target, async()=>{ await api('/api/zotero/web/config',{transport:'local'}); await loadZotero(); });
    field('zs-authorize').onclick = event => action(event.target, async()=>{ const data=await api('/api/zotero/web/authorize',{}); field('integration-result').textContent=data.message; });

    field("zs-project").onchange = async event => { projectId = event.target.value; await loadZotero(); };
    field('zs-manage').onclick = () => ProjectLiterature.open(projectId, true);
    field("zs-save").onclick = event => action(event.target, async () => {
      await api("/api/zotero/web/config", {library_type: field("zs-type").value, library_id: field("zs-id").value.trim(), api_key: field("zs-key").value.trim()});
      await loadZotero(); field("integration-result").textContent = "Config saved; read Collections under the project's literature page.";
    });
    field("zs-item-preview").onclick = event => action(event.target, async () => {
      const item = JSON.parse(field("zs-item").value);
      if (!item.itemType) throw new Error("Item must include itemType");
      field("zs-item").value = JSON.stringify(item, null, 2);
      field("integration-result").textContent = "JSON is valid, not sent yet. Field validity is checked by the Zotero API.\n" + field("zs-item").value;
    });
    field("zs-item-write").onclick = event => action(event.target, async () => {
      const item = JSON.parse(field("zs-item").value);
      if (!await uiConfirm("This writes the item JSON to the connected Zotero. Fields and target library checked?")) return;
      const result = await api("/api/zotero/web/write", {item, confirm: true});
      field("integration-result").textContent = JSON.stringify(result, null, 2);
    });
  }

  const originalPanel = setPanel;
  setPanel = function () {
    if (["easyscholar", "feishu", "zotero", "channels"].includes(setSec)) return `<div id="integration-settings"><div class="card">Reading local config...</div></div>`;
    return originalPanel();
  };
  const originalSettings = renderSettings;
  renderSettings = function (container) {
    originalSettings(container);
    if (setSec === "easyscholar") loadEasyScholar().catch(error);
    if (setSec === "feishu") loadFeishu().then(()=>{if(host()){const back=document.createElement("button");back.className="btn ghost";back.textContent="← Channels";back.onclick=()=>{setSec="channels";render();};host().prepend(back);}}).catch(error);
    if (setSec === "channels") MessageChannels.mount(host());
    if (setSec === "zotero") loadZotero().catch(error);
  };
  document.addEventListener("rw:assistant-detail", event => {
    const {assistant, container} = event.detail || {};
    if (!assistant || !container || container.querySelector("[data-feishu-assistant]")) return;
    const box = document.createElement("div"); box.className = "card"; box.style.marginTop = "14px";
    box.innerHTML = '<h3>Lark bot</h3><p class="hint">Give this expert its own bot: open Lark’s official QR page and bind the recipient.</p><button class="btn ghost" data-feishu-assistant>Settings / View the Lark bot</button>';
    box.querySelector("button").onclick = () => { assistantId = assistant.id; setSec = "feishu"; openTab("settings"); render(); };
    container.appendChild(box);
  });
  window.IntegrationSettings = {
    openFeishu(id) { assistantId = id || ""; setSec = "feishu"; openTab("settings"); render(); },
    openZotero(id) { projectId = id || curTask || ""; setSec = "zotero"; openTab("settings"); render(); }
  };
})();
