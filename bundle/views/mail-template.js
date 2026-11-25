const MAIL_HTML = `<div class="mail-page"><!-- ===== view: mail ===== -->
      <section id="viewMail" class="view">
        <div class="mail-wrap">
          <!-- left: accounts and folders -->
          <aside class="mail-side">
            <div class="mail-side-head">
              <b>📧 Mailbox</b>
              <button class="btn-ghost as-link" id="btnMailManage">+ Account management</button>
            </div>
            <div id="mailAccounts" class="mail-accounts"></div>
            <div class="mail-side-sep"></div>
            <div id="mailFolders" class="mail-folders"></div>
          </aside>

          <!-- Middle column: mail list -->
          <div class="mail-list-col">
            <div class="mail-list-head">
              <input id="mailSearch" class="tb-input mail-search" placeholder="Search subject / sender; press Enter..." />
              <button class="tb-btn" id="btnMailRefresh" title="RefreshFolder">⟳</button>
              <button class="tb-btn" id="btnMailMarkAllRead" title="the currentFolderMark all unread mail as read">✓ All read</button>
              <button class="tb-btn" id="btnMailCompose" title="Write mail">✎ Write mail</button>
            </div>
            <div id="mailListHead" class="mail-list-title"></div>
            <div id="mailList" class="mail-list"></div>
            <div id="mailPager" class="mail-pager"></div>
          </div>

          <!-- right column: mail detail -->
          <div class="mail-detail-col">
            <div id="mailDetail" class="mail-detail"></div>
          </div>
        </div>
      </section>

<div id="mailAccountModal" class="modal hidden">
    <div class="modal-mask"></div>
    <div class="modal-dialog modal-wide">
      <div class="modal-head"><h3>📧 Mailbox management</h3><button class="modal-close" id="btnMaClose">✕</button></div>
      <div class="modal-body">
        <p class="modal-desc">Add several mailboxes (for example a personal 163 Mailbox + a university mailbox), switching whenever you like. Leave it empty if you do not need mail; nothing else changes.<br />Account and app password are stored only<b>Local data folder</b> (mail.json), never uploaded to anyServer. </p>
        <div id="maList" class="ma-list"></div>

        <div class="field-sep"></div>
        <h4 class="ma-form-title" id="maFormTitle">Add a mailbox</h4>
        <div class="prof-grid">
          <label class="field"><span>Mail provider</span>
            <select id="maProvider" class="tb-select"></select>
          </label>
          <label class="field"><span>Label (optional)</span>
            <input id="maLabel" class="tb-input" placeholder="e.g. personal mail / university mailbox" />
          </label>
          <label class="field"><span>Mailbox address *</span>
            <input id="maEmail" class="tb-input" placeholder="xxx@163.com" autocomplete="off" />
          </label>
          <label class="field"><span>app password / Password *</span>
            <input id="maPassword" type="password" class="tb-input" placeholder="NetEase/QQ mailboxes use an app password" autocomplete="new-password" />
          </label>
        </div>
        <p class="modal-desc" id="maNote"></p>
        <div class="modal-desc" id="maHelpLinks"></div>

        <details class="ma-advanced">
          <summary>Advanced settings (Serverhost and port, rarely changed)</summary>
          <div class="prof-grid">
            <label class="field"><span>IMAP Server</span><input id="maImapHost" class="tb-input" placeholder="imap.163.com" /></label>
            <label class="field"><span>IMAP Port</span><input id="maImapPort" class="tb-input" placeholder="993" /></label>
            <label class="field"><span>SMTP Server</span><input id="maSmtpHost" class="tb-input" placeholder="smtp.163.com" /></label>
            <label class="field"><span>SMTP Port</span><input id="maSmtpPort" class="tb-input" placeholder="465" /></label>
          </div>
          <div class="ma-checks">
            <label><input type="checkbox" id="maImapSecure" checked /> IMAP Use SSL/TLS</label>
            <label><input type="checkbox" id="maSmtpSecure" checked /> SMTP Use SSL/TLS</label>
            <label><input type="checkbox" id="maSelfSigned" /> Skip certificate checks (school or/an enterprise mailbox)</label>
          </div>
        </details>
        <div id="maTestResult" class="ma-test-result hidden"></div>
      </div>
      <div class="modal-foot">
        <button id="btnMaTest" class="btn">🔌 Test connection</button>
        <span class="ob-spacer"></span>
        <button id="btnMaSave" class="btn btn-primary">Save account</button>
        <button id="btnMaCancel" class="btn">Cancel editing</button>
      </div>
    </div>
  </div>
<div id="mailComposeModal" class="modal hidden">
    <div class="modal-mask"></div>
    <div class="modal-dialog modal-wide">
      <div class="modal-head"><h3>✎ Write mail</h3><button class="modal-close" id="btnMcClose">✕</button></div>
      <div class="modal-body">
        <div class="prof-grid">
          <label class="field"><span>Sending account</span><select id="mcFrom" class="tb-select"></select></label>
          <label class="field"><span>Recipient *</span><input id="mcTo" class="tb-input" placeholder="Separate several recipients with commas" /></label>
          <label class="field"><span>Cc</span><input id="mcCc" class="tb-input" placeholder="may be blank" /></label>
          <label class="field"><span>Subject</span><input id="mcSubject" class="tb-input" placeholder="Subject" /></label>
        </div>
        <label class="field"><span>Body</span><textarea id="mcBody" rows="10" placeholder="Write the message here..."></textarea></label>
      </div>
      <div class="modal-foot">
        <button id="btnMcSend" class="btn btn-primary">Send</button>
        <button id="btnMcCancel" class="btn">Cancel</button>
      </div>
    </div>
  </div></div>`;

  /* ---- Small tools ---- */
  function toast(msg, type){
    let el = document.getElementById("toast");
    if(!el){ el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
    el.textContent = msg; el.className = "toast " + (type || "");
    requestAnimationFrame(()=>el.classList.add("show"));
    clearTimeout(el._t); el._t = setTimeout(()=>el.classList.remove("show"), 2800);
  }
  function stripHtml(html){ const d = document.createElement("div"); d.innerHTML = html || ""; return d.textContent || ""; }
