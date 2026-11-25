  let mailAccounts = [];
  let mailProviders = null;
  let mailCur = { accountId: '', folder: 'INBOX', folderName: 'Inbox', page: 1, pageSize: 25, search: '' };
  let mailFolders = [];
  let mailFoldersOwner = '';
  let mailMessages = [];
  let mailTotal = 0;
  let mailDetail = null;
  let mailMaEditId = null;
  let mailInited = false;
  let mailInitPromise = null;
  let mailViewGeneration = 0, mailAccountSequence = 0, mailFolderSequence = 0, mailListSequence = 0, mailDetailSequence = 0;
  let mailComposeSequence = 0;
  const mailVisible = () => route() === 'mail' && !!$('mailList');
  const mailScopeMatches = (scope) => mailCur.accountId === scope.accountId && mailCur.folder === scope.folder;

  const FOLDER_ICONS = { '\\Inbox': '📥', '\\Sent': '📤', '\\Drafts': '📝', '\\Trash': '🗑', '\\Junk': '🚫', '\\Archive': '📦' };

  // Mail badge: use the domain's first letter; numeric domains (e.g. 163.com) use 📧
  function mailBadge(email) {
    const d = String(email || '').split('@')[1] || '';
    const c = (d[0] || '').toUpperCase();
    return /[A-Z]/.test(c) ? c : '📧';
  }

  async function ensureMailProviders() {
    if (mailProviders) return mailProviders;
    mailProviders = await api('/api/mail/providers');
    return mailProviders;
  }

  async function loadMailAccounts() {
    mailAccounts = await api('/api/mail/accounts');
    return mailAccounts;
  }

  // ============ new-mail alerts (poll, desktop notice, unread badge) ============
  // Store the highest seen uid per account as the baseline (localStorage, so it survives restarts); on first run only record the baseline without notifying, so old mail does not all pop up
  // a higher uid that is unread is new mail: toast once per uid, no repeats on every poll.
  const MAIL_SINCE_KEY = 'sci_mail_seen_uids';
  const NOTIFY_INTERVAL = 60 * 1000;
  let mailNotifyTimer = null;
  let mailNotifyBusy = false;
  let mailNotifyEnabled = true;
  const notifiedUids = new Set(); // `${accountId}:${uid}` emails already notified

  function readMailSince() {
    try { return JSON.parse(localStorage.getItem(MAIL_SINCE_KEY) || '{}') || {}; } catch { return {}; }
  }
  function writeMailSince(map) {
    try { localStorage.setItem(MAIL_SINCE_KEY, JSON.stringify(map)); } catch (_) { /* ignore */ }
  }

  // sidebar "Mail" unread badge
  function renderNavMailBadge(totalUnread) {
    const n = parseInt(totalUnread, 10) || 0;
    const badge = $('navMailBadge');
    if (!badge) return;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.toggle('hidden', n <= 0);
  }

  // in-app new-mail toast (click to open)
  function showMailNotification(acc, msg) {
    const stack = $('mailNotifStack');
    if (!stack) return;
    const el2 = document.createElement('div');
    el2.className = 'mail-notif';
    el2.innerHTML = `
      <div class="mail-notif-ico">📬</div>
      <div class="mail-notif-body">
        <div class="mail-notif-title">New mail · ${esc(acc.label || acc.email)}</div>
        <div class="mail-notif-subject">${esc(String(msg.subject || '(No subject)').slice(0, 80))}</div>
        <div class="mail-notif-from">${esc(msg.fromName || msg.fromAddress || 'Unknown sender')}</div>
      </div>
      <button class="mail-notif-close" title="Close">✕</button>`;
    const close = () => { el2.classList.add('out'); setTimeout(() => el2.remove(), 220); };
    el2.querySelector('.mail-notif-close').addEventListener('click', (e) => { e.stopPropagation(); close(); });
    // click the overlay: switch to mail view and open this email
    el2.addEventListener('click', async () => {
      close();
      try {
        await openTab("mail");
        await selectMailAccount(acc.id);
        if (mailCur.folder !== 'INBOX') await openMailFolder(acc.id, 'INBOX', 'Inbox');
        await openMailMessage(msg.uid);
      } catch (e) { toast('Open mail failed:' + e.message, 'error'); }
    });
    stack.appendChild(el2);
    // auto-collapse after 12 s (clicking or closing still works)
    setTimeout(close, 12000);
  }

  // system notifications (Electron / browser native)
  function showDesktopNotification(acc, msg) {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission !== 'granted') return;
      const n = new Notification('📬 New mail ·' + (acc.label || acc.email), {
        body: `${msg.fromName || msg.fromAddress || 'Unknown sender'}\n${msg.subject || '(no subject)'}`,
        tag: `mail-${acc.id}-${msg.uid}`,
      });
      n.onclick = () => { try { window.focus(); } catch (_) {} n.close(); };
    } catch (_) { /* a failed notification does not break anything */ }
  }

  function requestNotifyPermission() {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    } catch (_) { /* ignore */ }
  }

  async function checkNewMail() {
    if (mailNotifyBusy || !mailNotifyEnabled) return;
    mailNotifyBusy = true;
    try {
      const since = readMailSince();
      const data = await api('/api/mail/notify?since=' + encodeURIComponent(JSON.stringify(since)));
      renderNavMailBadge(data.totalUnread || 0);

      const nextSince = { ...since };
      let changed = false;
      for (const a of data.accounts || []) {
        if (a.error) continue;
        const prev = parseInt(since[a.id], 10);
        const hadBaseline = Number.isFinite(prev);
        // advance the baseline to the highest uid
        if (!hadBaseline || (a.newestUid || 0) > prev) { nextSince[a.id] = a.newestUid || 0; changed = true; }
        if (!hadBaseline) continue; // Skip historical email alerts on first run
        for (const m of a.fresh || []) {
          const key = a.id + ':' + m.uid;
          if (notifiedUids.has(key)) continue;
          notifiedUids.add(key);
          showMailNotification(a, m);
          showDesktopNotification(a, m);
        }
      }
      if (changed) writeMailSince(nextSince);
    } catch (_) {
      // Stay quiet on network/offline/account errors; retry next round
    } finally {
      mailNotifyBusy = false;
    }
  }

  function startMailNotify() {
    if (mailNotifyTimer) return;
    requestNotifyPermission();
    checkNewMail();
    mailNotifyTimer = setInterval(checkNewMail, NOTIFY_INTERVAL);
  }
  function stopMailNotify() {
    if (mailNotifyTimer) { clearInterval(mailNotifyTimer); mailNotifyTimer = null; }
  }
  // Debug/automation hook: trigger a check round or change the interval manually
  window.__mailNotifyTick = () => checkNewMail();
  window.__mailNotifySetInterval = (ms) => {
    stopMailNotify();
    mailNotifyTimer = setInterval(checkNewMail, Math.max(3000, parseInt(ms, 10) || NOTIFY_INTERVAL));
  };
  // Debug/automation hook: open a paper's PDF reader directly, switch the right tab, read the current model
  window.__openReader = (id) => openPdfReader(id);
  window.__setPrTab = (t) => switchPrTab(t);
  window.__activeModel = () => ({
    activeProfileId, active: activeModelInfo,
    profiles: profiles.map((p) => ({ id: p.id, label: p.label, provider: p.provider, model: p.model })),
  });

  function fmtMailDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }
  function fmtMailFullDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtMailSize(n) {
    const b = Number(n) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  // ---------- three-pane render ----------
  function renderMailView() {
    renderMailSide();
    if (mailCur.accountId) {
      renderMailMessages();
      renderMailDetail();
    } else {
      renderMailListHead();
      $('mailList').innerHTML = mailAccounts.length
        ? '<div class="mail-empty">Pick a mailbox on the left to start</div>'
        : mailGuideHtml();
      $('mailPager').innerHTML = '';
      renderMailDetail();
    }
  }
  function mailGuideHtml() {
    return `<div class="mail-guide">
      <div class="mail-guide-ico">📧</div>
      <b>No mailbox signed in yet</b>
      <p>Once a mailbox is signed in you can read and send mail here, and manage several at once (for example a personal 163 Mailbox + a university mailbox).</p>
      <p class="mail-guide-dim">Signing in later is fine; nothing else breaks. Use the + at the left any time account settings”.</p>
      <button class="btn btn-primary" id="btnMailGuideAdd">+ Add a mailbox</button>
    </div>`;
  }

  function renderMailSide() {
    const accBox = $('mailAccounts');
    accBox.innerHTML = mailAccounts.length
      ? mailAccounts.map((a) => `
        <div class="mail-acc${a.id === mailCur.accountId ? ' active' : ''}" data-acc="${a.id}" title="${esc(a.email)}">
          <span class="mail-badge">${mailBadge(a.email)}</span>
          <div class="mail-acc-info">
            <b>${esc(a.label || a.email)}</b>
            <span>${esc(a.email)}</span>
          </div>
        </div>`).join('')
      : '<div class="mail-empty-side">No mail accounts yet</div>';

    const fBox = $('mailFolders');
    if (!mailCur.accountId) { fBox.innerHTML = ''; return; }
    fBox.innerHTML = mailFolders.length
      ? mailFolders.map((f) => `
        <div class="mail-folder${f.path === mailCur.folder ? ' active' : ''}" data-folder="${esc(f.path)}" data-foldername="${esc(f.name)}">
          <span class="mail-folder-ico">${FOLDER_ICONS[f.specialUse] || '📁'}</span><span class="mail-folder-name">${esc(f.name)}</span>
        </div>`).join('')
      : '<div class="mail-empty-side">No folders</div>';
  }

  function renderMailListHead() {
    const box = $('mailListHead');
    if (!mailCur.accountId) { box.innerHTML = ''; return; }
    const acc = mailAccounts.find((a) => a.id === mailCur.accountId);
    const scope = mailCur.search ? `Search ”${esc(mailCur.search)}"` : esc(mailCur.folderName || mailCur.folder);
    box.innerHTML = `<span class="mail-title-main">${scope}</span>
      <span class="mail-title-sub">${esc(acc ? (acc.label || acc.email) : '')} · ${mailTotal} messages</span>`;
  }

  function renderMailMessages() {
    const box = $('mailList');
    if (!mailMessages.length) {
      box.innerHTML = `<div class="mail-empty">${mailCur.search ? 'No matching mail' : 'No mail in this folder yet'}</div>`;
    } else {
      box.innerHTML = mailMessages.map((m) => `
        <div class="mail-item${m.seen ? '' : ' unread'}${mailDetail && mailDetail.uid === m.uid ? ' active' : ''}" data-mail="${m.uid}">
          <span class="mail-dot"></span>
          <div class="mail-item-main">
            <div class="mail-item-row1">
              <span class="mail-from" title="${esc(m.fromAddress)}">${esc(m.fromName || m.fromAddress || '(Unknown sender)')}</span>
              <span class="mail-date">${esc(fmtMailDate(m.date))}</span>
            </div>
            <div class="mail-item-row2">
              <span class="mail-subject" title="${esc(m.subject)}">${esc(m.subject)}</span>
              ${m.hasAttachments ? '<span class="mail-attach-ico" title="with attachments">📎</span>' : ''}
            </div>
          </div>
        </div>`).join('');
    }
    renderMailPager();
    renderMailListHead();
  }

  function renderMailPager() {
    const box = $('mailPager');
    if (!mailCur.accountId) { box.innerHTML = ''; return; }
    const pages = Math.max(1, Math.ceil(mailTotal / mailCur.pageSize));
    const p = Math.min(mailCur.page, pages);
    box.innerHTML = `
      <button class="tb-btn" data-mail-page="prev"${p <= 1 ? ' disabled' : ''}>‹ Previous</button>
      <span class="mail-page-info">${p} / ${pages}</span>
      <button class="tb-btn" data-mail-page="next"${p >= pages ? ' disabled' : ''}>Next ›</button>
      <span class="mail-page-size">
        <select class="tb-select" id="mailPageSize">
          ${[25, 50, 100].map((n) => `<option value="${n}"${n === mailCur.pageSize ? ' selected' : ''}>per page ${n} messages</option>`).join('')}
        </select>
      </span>`;
  }

  // mail HTML: inject base styles (fluid width, contained images, one font) and drop unresolved inline images
  function mailFrameDoc(html) {
    let s = String(html || '');
    s = s.replace(/(src|href)\s*=\s*(["'])cid:[^"']*\2/gi, '$1=$2data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7$2');
    const inject = `<base target="_blank">
<style>
html, body { margin: 0; padding: 12px 16px; font-size: 14px; line-height: 1.75; word-break: break-word;
  font-family: "Times New Roman", "Inter", "Inter", sans-serif; color: #17231f; background: #fff; }
img { max-width: 100%; height: auto; }
table { max-width: 100% !important; }
pre { white-space: pre-wrap; }
a { color: #176b87; }
</style>`;
    if (/<head[^>]*>/i.test(s)) return s.replace(/<head[^>]*>/i, (m) => m + inject);
    if (/<html[^>]*>/i.test(s)) return s.replace(/<html[^>]*>/i, (m) => m + inject);
    return inject + s;
  }

  function renderMailDetail() {
    const box = $('mailDetail');
    if (!mailDetail) {
      box.innerHTML = '<div class="mail-placeholder">📬 Select a mail to read it here</div>';
      return;
    }
    const d = mailDetail;
    const accId = mailCur.accountId;
    const folderQ = encodeURIComponent(mailCur.folder);
    const atts = (d.attachments || []).filter((a) => !a.inline);
    // the translation applies to the open mail only
    const trans = mailTrans && mailTrans.uid === d.uid ? mailTrans : null;
    const transBlock = trans ? `
      <div class="mail-trans" id="mailTrans">
        <div class="mail-trans-head">
          <b>🈯 Chinese translation</b>
          <button class="tb-btn" data-mail-trans-copy="1" title="Copy translation">📋 Copy</button>
          <button class="tb-btn" data-mail-trans-close="1" title="Close translation">✕</button>
        </div>
        <div class="mail-trans-body">${trans.pending
          ? '<div class="mail-loading">Translating...Please wait</div>'
          : (trans.error ? `<div class="mail-trans-err">⚠ ${esc(trans.error)}</div>` : esc(trans.text || ''))}</div>
        ${trans.truncated ? '<div class="mail-trans-note">The text is long, so only the first part was translated.</div>' : ''}
      </div>` : '';
    box.innerHTML = `
      <div class="mail-detail-head">
        <div class="mail-detail-subject">${esc(d.subject)}</div>
        <div class="mail-detail-meta">
          <span class="mail-detail-from">${esc(d.fromName || d.fromAddress)}</span>
          <span class="mail-detail-addr">&lt;${esc(d.fromAddress)}&gt;</span>
          <span class="ob-spacer"></span>
          <span class="mail-detail-date">${esc(fmtMailFullDate(d.date))}</span>
        </div>
        <div class="mail-detail-to">To: ${esc(d.to || '')}${d.cc ? ` Cc: ${esc(d.cc)}` : ''}</div>
        <div class="mail-detail-ops">
          <button class="tb-btn" data-mail-reply="1">↩ Reply</button>
          <button class="tb-btn accent" data-mail-translate="1" ${trans && trans.pending ? 'disabled' : ''}>🈯 ${trans ? 'Translate again' : 'Translate'}</button>
          <button class="tb-btn" data-mail-unread="1">Mark unread</button>
          <button class="tb-btn" data-mail-del="1">🗑 Delete</button>
        </div>
        ${atts.length ? `<div class="mail-atts">${atts.map((a) => `
          <a class="mail-att" href="/api/mail/accounts/${accId}/messages/${d.uid}/attachments/${a.index}?folder=${folderQ}" title="${esc(a.filename)}">
            <span class="mail-att-ico">📎</span>
            <span class="mail-att-name">${esc(a.filename)}</span>
            <span class="mail-att-size">${fmtMailSize(a.size)}</span>
          </a>`).join('')}</div>` : ''}
      </div>
      ${transBlock}
      <div class="mail-body">${d.html
        ? `<iframe class="mail-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(mailFrameDoc(d.html))}"></iframe>`
        : `<pre class="mail-text">${esc(d.text || '(no text)')}</pre>`}</div>`;
  }

  // ---------- one-click mail translation ----------

  let mailTrans = null;
  /** per-call character cap so a huge email cannot stall the translate API */
  const MAIL_TRANS_MAX = 6000;

  /**
   */
  function mailPlainBody(d) {
    const text = String(d?.text || '').trim();
    if (text) return text;
    const html = String(d?.html || '');
    if (!html) return '';
    const cleaned = html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');
    return String(stripHtml(cleaned) || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** translate the current mail body */
  async function mailTranslateBody() {
    if (!mailDetail) return;
    const uid = mailDetail.uid;
    const plain = mailPlainBody(mailDetail);
    if (!plain) { toast('This mail has no body to translate', 'error'); return; }

    const truncated = plain.length > MAIL_TRANS_MAX;
    const text = truncated ? plain.slice(0, MAIL_TRANS_MAX) : plain;
    const translation = { uid, pending: true, text: '', truncated };
    mailTrans = translation;
    renderMailDetail();

    const target = $('prLangTo')?.value || 'zh';
    let provider;
    let profileId;
    const src = $('prTranslateSource')?.value || 'auto';
    if (src.startsWith('llm:')) { provider = 'siliconflow'; profileId = src.slice(4); }
    else if (src !== 'auto') provider = src;

    try {
      const data = await api('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, target, provider, profileId }),
      });
      // The user may have switched to another email; do not write results into the wrong one
      if (mailTrans !== translation) return;
      mailTrans = { uid, text: data.translation || '(no translation returned)', truncated };
      toast('Email translation complete', 'success');
    } catch (e) {
      if (mailTrans !== translation) return;
      mailTrans = { uid, error: e.message, truncated };
    }
    if (mailVisible()) renderMailDetail();
  }

  // ---------- data loading ----------
  async function ensureMailFolders(accountId, force = false) {
    if (!force && mailFoldersOwner === accountId && mailFolders.length) { renderMailSide(); return; }
    const ticket = ++mailFolderSequence, generation = mailViewGeneration;
    try {
      const folders = await api(`/api/mail/accounts/${accountId}/folders`);
      if (ticket !== mailFolderSequence || generation !== mailViewGeneration || mailCur.accountId !== accountId || !mailVisible()) return;
      mailFolders = folders;
      mailFoldersOwner = accountId;
    } catch (e) {
      if (ticket !== mailFolderSequence || generation !== mailViewGeneration || mailCur.accountId !== accountId || !mailVisible()) return;
      mailFolders = [];
      mailFoldersOwner = '';
      toast('Read folder failed:' + e.message, 'error');
    }
    renderMailSide();
  }

  async function openMailFolder(accountId, folder, name, page = 1) {
    if (!accountId) return;
    mailCur.accountId = accountId;
    mailCur.folder = folder || 'INBOX';
    mailCur.folderName = name || folder || 'Inbox';
    mailCur.page = page;
    mailDetail = null;
    mailTrans = null;
    ++mailDetailSequence;
    renderMailSide();
    renderMailDetail();
    await loadMailMessages();
  }

  async function selectMailAccount(id) {
    if (!id || (mailCur.accountId === id && mailMessages.length)) return;
    const ticket = ++mailAccountSequence, generation = mailViewGeneration;
    mailMessages = []; mailTotal = 0; mailDetail = null;
    mailTrans = null;
    ++mailListSequence; ++mailDetailSequence;
    mailFolders = []; mailFoldersOwner = '';
    $('mailSearch').value = '';
    mailCur = { accountId: id, folder: 'INBOX', folderName: 'Inbox', page: 1, pageSize: mailCur.pageSize, search: '' };
    await ensureMailFolders(id, true);
    if (ticket !== mailAccountSequence || generation !== mailViewGeneration || mailCur.accountId !== id || !mailVisible()) return;
    // Prefer the real inbox folder (names vary by mailbox)
    const inbox = mailFolders.find((f) => f.specialUse === '\\Inbox') || mailFolders.find((f) => f.path === 'INBOX');
    await openMailFolder(id, inbox ? inbox.path : 'INBOX', inbox ? inbox.name : 'Inbox', 1);
  }

  async function loadMailMessages(showLoading = true) {
    if (!mailCur.accountId || !mailVisible()) return;
    const scope = {...mailCur}, ticket = ++mailListSequence, generation = mailViewGeneration;
    const current = () => ticket === mailListSequence && generation === mailViewGeneration && mailVisible() && mailScopeMatches(scope) && mailCur.page === scope.page && mailCur.pageSize === scope.pageSize && mailCur.search === scope.search;
    if (showLoading) $('mailList').innerHTML = '<div class="mail-loading">Fetching mail...</div>';
    renderMailListHead();
    const q = new URLSearchParams({ folder: scope.folder, page: String(scope.page), pageSize: String(scope.pageSize) });
    if (scope.search) q.set('search', scope.search);
    try {
      const data = await api(`/api/mail/accounts/${scope.accountId}/messages?${q.toString()}`);
      if (!current()) return;
      mailMessages = data.messages || [];
      mailTotal = data.total || 0;
      renderMailMessages();
    } catch (e) {
      if (!current()) return;
      mailMessages = []; mailTotal = 0;
      $('mailList').innerHTML = `<div class="mail-error">Fetch failed: ${esc(e.message)}<div><button class="btn" data-mail-retry="1">Retry</button></div></div>`;
      renderMailPager();
    }
  }

  async function openMailMessage(uid) {
    const scope = {...mailCur}, id = scope.accountId, ticket = ++mailDetailSequence, generation = mailViewGeneration;
    const current = () => ticket === mailDetailSequence && generation === mailViewGeneration && mailVisible() && mailScopeMatches(scope);
    mailDetail = null; mailTrans = null;
    $('mailDetail').innerHTML = '<div class="mail-loading">Opening mail...</div>';
    try {
      const d = await api(`/api/mail/accounts/${id}/messages/${uid}?folder=${encodeURIComponent(scope.folder)}`);
      if (!current()) return;
      mailDetail = d;
      renderMailDetail();
      const item = mailMessages.find((m) => m.uid === Number(uid));
      if (item && !item.seen) {
        item.seen = true;
        api(`/api/mail/accounts/${id}/messages/${uid}/seen`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seen: true, folder: scope.folder }),
        }).catch(() => { /* a failed mark does not block reading */ });
      }
      renderMailMessages();
    } catch (e) {
      if (!current()) return;
      mailDetail = null;
      $('mailDetail').innerHTML = `<div class="mail-error">Open failed: ${esc(e.message)}</div>`;
    }
  }

  async function markAllMailSeen() {
    if (!mailCur.accountId) return toast('Select a mailbox first', 'error');
    const target = {...mailCur};
    const scope = mailCur.search ? `Current folder (search results do not affect the batch scope)` : (mailCur.folderName || mailCur.folder);
    if (!await uiConfirm(`Mark every unread mail in "${scope}" as read?`)) return;
    const button = $('btnMailMarkAllRead');
    if (button) button.disabled = true;
    try {
      const result = await api(`/api/mail/accounts/${target.accountId}/messages/seen-all`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: target.folder }),
      });
      if (!mailVisible() || !mailScopeMatches(target)) return;
      mailMessages.forEach((item) => { item.seen = true; });
      renderMailMessages();
      toast(result.markedCount ? `Marked ${result.markedCount} emails as read` : 'No unread mail in this folder', 'success');
      // sync the unread badge so bulk actions do not leave a stale count.
      checkNewMail().catch(() => {});
    } catch (e) { toast('Bulk mark failed:' + e.message, 'error'); }
    finally { if (button) button.disabled = false; }
  }

  async function markMailUnread() {
    if (!mailDetail) return;
    const target = {...mailCur};
    const uid = mailDetail.uid;
    try {
      await api(`/api/mail/accounts/${target.accountId}/messages/${uid}/seen`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seen: false, folder: target.folder }),
      });
      if (!mailVisible() || !mailScopeMatches(target)) return;
      const it = mailMessages.find((m) => m.uid === uid);
      if (it) it.seen = false;
      renderMailMessages();
      toast('Marked unread', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function removeMailMessage() {
    if (!mailDetail) return;
    const target = {...mailCur}, uid = mailDetail.uid;
    if (!await uiConfirm('Delete this mail? This cannot be undone.')) return;
    try {
      await api(`/api/mail/accounts/${target.accountId}/messages/${uid}?folder=${encodeURIComponent(target.folder)}`, { method: 'DELETE' });
      if (!mailVisible() || !mailScopeMatches(target)) return;
      if (mailDetail?.uid === uid) { mailDetail = null; renderMailDetail(); }
      await loadMailMessages();
      toast('Email deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  // ---------- Account management ----------
  function renderMaProviderOptions() {
    const sel = $('maProvider');
    if (sel.dataset.ready) return;
    sel.innerHTML = Object.entries(mailProviders || {})
      .map(([key, p]) => `<option value="${esc(key)}">${esc(p.label || key)}</option>`).join('');
    sel.dataset.ready = '1';
    sel.value = '163';
    applyMailProviderPreset();
  }

  function applyMailProviderPreset() {
    const p = (mailProviders || {})[$('maProvider').value] || {};
    $('maNote').textContent = p.note || '';
    renderMailHelp(p);
    $('maImapHost').value = p.imapHost || '';
    $('maImapPort').value = p.imapPort || 993;
    $('maImapSecure').checked = p.imapSecure !== false;
    $('maSmtpHost').value = p.smtpHost || '';
    $('maSmtpPort').value = p.smtpPort || 465;
    $('maSmtpSecure').checked = p.smtpSecure !== false;
    $('maSelfSigned').checked = false;
  }

  function resetMailAccountForm() {
    mailMaEditId = null;
    $('maFormTitle').textContent = 'Add email account';
    $('maLabel').value = '';
    $('maEmail').value = '';
    $('maPassword').value = '';
    $('maTestResult').classList.add('hidden');
    $('maProvider').value = '163';
    applyMailProviderPreset();
  }

  function fillMailAccountForm(acc) {
    if (!acc) return;
    mailMaEditId = acc.id;
    $('maFormTitle').textContent = `Edit account: ${acc.label || acc.email}`;
    $('maProvider').value = acc.provider || 'custom';
    if (!mailProviders || !mailProviders[acc.provider]) $('maProvider').value = 'custom';
    $('maLabel').value = acc.label || '';
    $('maEmail').value = acc.email || '';
    $('maPassword').value = '';
    $('maPassword').placeholder = acc.hasPassword ? 'Leave blank to keep the licence key' : 'Enter the authorization code';
    $('maImapHost').value = acc.imapHost || '';
    $('maImapPort').value = acc.imapPort || 993;
    $('maImapSecure').checked = acc.imapSecure !== false;
    $('maSmtpHost').value = acc.smtpHost || '';
    $('maSmtpPort').value = acc.smtpPort || 465;
    $('maSmtpSecure').checked = acc.smtpSecure !== false;
    $('maSelfSigned').checked = !!acc.allowSelfSigned;
    $('maNote').textContent = (mailProviders[acc.provider] || {}).note || '';
    renderMailHelp(mailProviders[acc.provider] || {});
    $('maTestResult').classList.add('hidden');
  }

  function renderMaList() {
    const box = $('maList');
    if (!mailAccounts.length) {
      box.innerHTML = '<div class="ma-empty">No mailboxes yet. Fill in the form below to sign in; several can be added.</div>';
      return;
    }
    box.innerHTML = mailAccounts.map((a) => `
      <div class="ma-item${a.id === mailMaEditId ? ' active' : ''}">
        <span class="mail-badge">${mailBadge(a.email)}</span>
        <div class="ma-item-info">
          <b>${esc(a.label || a.email)}</b>
          <span>${esc(a.email)}${a.imapHost ? ' · ' + esc(a.imapHost) : ''}${a.lastSyncAt ? ' · Recent mail ' + esc(fmtMailFullDate(a.lastSyncAt)) : ''}</span>
        </div>
        <div class="ma-item-ops">
          <button class="tb-btn" data-ma-test="${a.id}">Test</button>
          <button class="tb-btn" data-ma-edit="${a.id}">Edit</button>
          <button class="tb-btn danger" data-ma-del="${a.id}">Delete</button>
        </div>
      </div>`).join('');
  }

  function renderMailHelp(provider) {
    const host = $('maHelpLinks');
    if (host) host.innerHTML = (provider.helpLinks || []).map(link =>
      `<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" style="margin-right:14px">${esc(link.label)} ↗</a>`).join('') +
      '<p class="hint">For a custom mailbox, ask your IT service for the server, port, and client auth. The code stays on this machine; never share it.</p>';
  }

  async function openMailAccountModal(id) {
    await ensureMailProviders();
    renderMaProviderOptions();
    mailMaEditId = id || null;
    renderMaList();
    if (id) fillMailAccountForm(mailAccounts.find((a) => a.id === id));
    else resetMailAccountForm();
    renderMaList();
    $('maTestResult').classList.add('hidden');
    $('mailAccountModal').classList.remove('hidden');
  }

  function mailAccFormData() {
    return {
      provider: $('maProvider').value,
      label: $('maLabel').value.trim(),
      email: $('maEmail').value.trim(),
      password: $('maPassword').value,
      imapHost: $('maImapHost').value.trim(),
      imapPort: $('maImapPort').value.trim(),
      imapSecure: $('maImapSecure').checked,
      smtpHost: $('maSmtpHost').value.trim(),
      smtpPort: $('maSmtpPort').value.trim(),
      smtpSecure: $('maSmtpSecure').checked,
      allowSelfSigned: $('maSelfSigned').checked,
    };
  }

  async function testMailAccountForm() {
    const box = $('maTestResult');
    box.className = 'ma-test-result';
    box.classList.remove('hidden');
    box.textContent = 'Connecting to mail server...';
    const btn = $('btnMaTest');
    btn.disabled = true;
    try {
      const r = await api('/api/mail/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({...mailAccFormData(), id: mailMaEditId || undefined}),
      });
      showMailTestResult(box, r);
    } catch (e) {
      box.classList.add('err');
      box.textContent = '❌ ' + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  function showMailTestResult(box, result) {
    const smtp = result.smtp;
    box.classList.add(!smtp || smtp.ok ? 'ok' : 'err');
    box.textContent = `Mail fetched: ${result.inboxMessages} in the inbox across ${result.folderCount} folders.` +
      (smtp ? (smtp.ok ? 'Outgoing connection works; no mail sent.' : 'Outgoing connection failed:' + smtp.message) : 'The sending connection has not been checked yet.');
  }

  async function saveMailAccountForm() {
    const data = mailAccFormData();
    const btn = $('btnMaSave');
    btn.disabled = true;
    const editingId = mailMaEditId;
    try {
      if (editingId) {
        await api('/api/mail/accounts/' + editingId, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        });
      } else {
        const created = await api('/api/mail/accounts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        });
        mailMaEditId = created.id;
      }
      await loadMailAccounts();
      const targetId = editingId || mailMaEditId;
      resetMailAccountForm();
      renderMaList();
      renderMailSide();
      toast(editingId ? 'Account updated' : 'Account added, connecting to the mailbox...', 'success');
      await selectMailAccount(targetId);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Compose mail ----------
  function openMailCompose(to = '', subject = '') {
    ++mailComposeSequence;
    if (!mailAccounts.length) {
      toast('Add an email account first', 'error');
      openMailAccountModal(null);
      return;
    }
    $('mcFrom').innerHTML = mailAccounts
      .map((a) => `<option value="${a.id}">${esc(a.label || a.email)}</option>`).join('');
    if (mailCur.accountId) $('mcFrom').value = mailCur.accountId;
    $('mcTo').value = to || '';
    $('mcCc').value = '';
    $('mcSubject').value = subject || '';
    $('mcBody').value = '';
    $('mailComposeModal').classList.remove('hidden');
    (to ? $('mcBody') : $('mcTo')).focus();
  }

  async function sendMailCompose() {
    const id = $('mcFrom').value;
    const to = $('mcTo').value.trim();
    if (!to) return toast('Enter a recipient', 'error');
    const btn = $('btnMcSend');
    if (btn.disabled) return;
    const sequence = mailComposeSequence, generation = mailViewGeneration;
    const payload = {to, cc: $('mcCc').value.trim(), subject: $('mcSubject').value.trim(), text: $('mcBody').value};
    const current = () => generation === mailViewGeneration && sequence === mailComposeSequence && mailVisible();
    const sameDraft = () => current() && $('mcFrom').value === id && $('mcTo').value.trim() === payload.to && $('mcCc').value.trim() === payload.cc && $('mcSubject').value.trim() === payload.subject && $('mcBody').value === payload.text;
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Sending...';
    try {
      const result = await api(`/api/mail/accounts/${id}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (result.partial) {
        if (sameDraft()) { $('mcTo').value = result.refusedRecipients.join(', '); $('mcCc').value = ''; }
        toast(`Partially sent: ${result.acceptedCount} recipients accepted, the rest were rejected. The draft keeps only the rejected addresses; check them and send again.`, 'error');
        return;
      }
      if (sameDraft()) $('mailComposeModal').classList.add('hidden');
      toast('Email sent', 'success');
    } catch (e) {
      toast('Send failed:' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  // ---------- mailbox event bindings ----------
  function bindMailEvents() {
    $('btnMailManage').addEventListener('click', () => openMailAccountModal(null));
    $('btnMailCompose').addEventListener('click', () => openMailCompose());
    $('btnMailRefresh').addEventListener('click', async () => {
      if (!mailCur.accountId) { toast('Add a mailbox first', 'error'); return; }
      await ensureMailFolders(mailCur.accountId, true);
      await loadMailMessages();
      toast('Refreshed', 'success');
    });
    $('btnMailMarkAllRead').addEventListener('click', markAllMailSeen);

    $('mailSearch').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (!mailCur.accountId) return;
      mailCur.search = $('mailSearch').value.trim();
      mailCur.page = 1;
      loadMailMessages();
    });
    $('mailSearch').addEventListener('input', (e) => {
      if (!e.target.value && mailCur.search && mailCur.accountId) {
        mailCur.search = '';
        mailCur.page = 1;
        loadMailMessages();
      }
    });

    $('mailAccounts').addEventListener('click', (e) => {
      const a = e.target.closest('[data-acc]');
      if (a) selectMailAccount(a.dataset.acc);
    });
    $('mailFolders').addEventListener('click', (e) => {
      const f = e.target.closest('[data-folder]');
      if (f) openMailFolder(mailCur.accountId, f.dataset.folder, f.dataset.foldername, 1);
    });
    $('mailList').addEventListener('click', (e) => {
      if (e.target.closest('[data-mail-retry]')) { loadMailMessages(); return; }
      if (e.target.closest('#btnMailGuideAdd')) { openMailAccountModal(null); return; }
      const item = e.target.closest('[data-mail]');
      if (item) openMailMessage(Number(item.dataset.mail));
    });
    $('mailPager').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mail-page]');
      if (!b) return;
      const pages = Math.max(1, Math.ceil(mailTotal / mailCur.pageSize));
      if (b.dataset.mailPage === 'prev' && mailCur.page > 1) { mailCur.page--; loadMailMessages(); }
      if (b.dataset.mailPage === 'next' && mailCur.page < pages) { mailCur.page++; loadMailMessages(); }
    });
    $('mailPager').addEventListener('change', (e) => {
      if (e.target.id === 'mailPageSize') {
        mailCur.pageSize = parseInt(e.target.value, 10) || 25;
        mailCur.page = 1;
        loadMailMessages();
      }
    });
    $('mailDetail').addEventListener('click', (e) => {
      if (!mailDetail) return;
      if (e.target.closest('[data-mail-translate]')) return mailTranslateBody();
      if (e.target.closest('[data-mail-trans-close]')) { mailTrans = null; renderMailDetail(); return; }
      if (e.target.closest('[data-mail-trans-copy]')) {
        const txt = mailTrans?.text || '';
        if (!txt) { toast('No translation to copy yet', 'error'); return; }
        navigator.clipboard.writeText(txt).then(() => toast('Translation copied', 'success')).catch(() => toast('Copy failed', 'error'));
        return;
      }
      if (e.target.closest('[data-mail-reply]')) {
        const subj = /^re:/i.test(mailDetail.subject) ? mailDetail.subject : 'Re: ' + mailDetail.subject;
        openMailCompose(mailDetail.fromAddress, subj);
      } else if (e.target.closest('[data-mail-unread]')) markMailUnread();
      else if (e.target.closest('[data-mail-del]')) removeMailMessage();
    });

    $('btnMaClose').addEventListener('click', () => $('mailAccountModal').classList.add('hidden'));
    $('btnMaCancel').addEventListener('click', () => { resetMailAccountForm(); renderMaList(); });
    $('btnMaSave').addEventListener('click', saveMailAccountForm);
    $('btnMaTest').addEventListener('click', testMailAccountForm);
    $('maProvider').addEventListener('change', () => {
      $('maTestResult').classList.add('hidden');
      applyMailProviderPreset();
    });
    $('maList').addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-ma-edit]');
      const del = e.target.closest('[data-ma-del]');
      const ts = e.target.closest('[data-ma-test]');
      if (ed) { fillMailAccountForm(mailAccounts.find((a) => a.id === ed.dataset.maEdit)); renderMaList(); return; }
      if (ts) {
        const box = $('maTestResult');
        box.className = 'ma-test-result';
        box.classList.remove('hidden');
        box.textContent = 'Connecting to mail server...';
        try {
          const r = await api(`/api/mail/accounts/${ts.dataset.maTest}/test`, { method: 'POST' });
          showMailTestResult(box, r);
        } catch (err) {
          box.classList.add('err');
          box.textContent = '❌ ' + err.message;
        }
        return;
      }
      if (del) {
        const acc = mailAccounts.find((a) => a.id === del.dataset.maDel);
        if (!acc) return;
        if (!await uiConfirm(`Delete the mailbox account "${acc.label || acc.email}"? (Removed from this app only; mail in the mailbox is untouched)`)) return;
        try {
          await api('/api/mail/accounts/' + acc.id, { method: 'DELETE' });
          await loadMailAccounts();
          if (mailCur.accountId === acc.id) {
            mailCur = { accountId: '', folder: 'INBOX', folderName: 'Inbox', page: 1, pageSize: mailCur.pageSize, search: '' };
            mailFolders = []; mailFoldersOwner = ''; mailMessages = []; mailTotal = 0; mailDetail = null;
            renderMailView();
          }
          if (mailMaEditId === acc.id) resetMailAccountForm();
          renderMaList();
          renderMailSide();
          toast('Account removed', 'success');
        } catch (err) { toast(err.message, 'error'); }
      }
    });

    $('btnMcClose').addEventListener('click', () => $('mailComposeModal').classList.add('hidden'));
    $('btnMcCancel').addEventListener('click', () => $('mailComposeModal').classList.add('hidden'));
    $('btnMcSend').addEventListener('click', sendMailCompose);
  }

  // enter mail view (lazy-load accounts on first entry so startup stays fast)
  async function enterMailView(generation) {
    renderMailView();
    try {
      if (!mailInited) {
        if (!mailInitPromise) mailInitPromise = (async () => { await ensureMailProviders(); await loadMailAccounts(); mailInited = true; })().finally(() => { mailInitPromise = null; });
        await mailInitPromise;
      }
      if (generation !== mailViewGeneration || !mailVisible()) return;
      renderMaProviderOptions();
    } catch (e) {
      if (generation === mailViewGeneration && mailVisible()) toast('Failed to load mail accounts:' + e.message, 'error');
      return;
    }
    renderMailView();
    if (mailAccounts.length && !mailCur.accountId) await selectMailAccount(mailAccounts[0].id);
    else if (mailCur.accountId) await loadMailMessages(false);
  }


  /* ---- Entry point: render page → bind events → load accounts ---- */
  async function renderMail(m){
    const generation = ++mailViewGeneration;
    m.innerHTML = MAIL_HTML;
    bindMailEvents();
    await enterMailView(generation);
    if (generation === mailViewGeneration && mailVisible()) startMailNotify();
  }

