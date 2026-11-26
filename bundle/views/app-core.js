let zenModeActive = false;
let statusCollapsed = localStorage.getItem("rw-status-collapsed") === "true";

function toggleZenMode(force){
  zenModeActive = typeof force === "boolean" ? force : !zenModeActive;
  document.body.classList.toggle("zen-mode", zenModeActive);
  let exitBtn = document.getElementById("zenExitPill");
  if(zenModeActive){
    if(!exitBtn){
      exitBtn = document.createElement("button");
      exitBtn.id = "zenExitPill";
      exitBtn.className = "zen-exit-pill";
      exitBtn.textContent = "⛶ Exit focus (Esc)";
      exitBtn.title = "Exit focus workspace mode";
      exitBtn.onclick = () => toggleZenMode(false);
      document.body.appendChild(exitBtn);
    }
  } else {
    if(exitBtn) exitBtn.remove();
  }
}

function toggleSidebarCollapse(){
  sidebarCollapsed = !sidebarCollapsed;
  localStorage.setItem("rw-sidebar", sidebarCollapsed);
  renderSidebar();
}

document.addEventListener("keydown", (e) => {
  if((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B") && !e.shiftKey && !e.altKey){
    const tag = (document.activeElement?.tagName || "").toLowerCase();
    if(tag !== "textarea" && tag !== "input"){
      e.preventDefault();
      toggleSidebarCollapse();
    }
  }
  if(e.key === "F10"){
    e.preventDefault();
    toggleZenMode();
  }
  if(e.key === "Escape" && zenModeActive){
    e.preventDefault();
    toggleZenMode(false);
  }
});

/* ============================== Status ============================== */
const S = { tasks:[], chats:[], models:[], active:null, events:[], stages:[], tools:[], chat:[], chatEvents:[], loaded:false };
let tabs = [{id:"agent",route:"agent",title:"Assistant"}];
let activeTab = tabs[0].id;
let curTask = localStorage.getItem("rw-task") || null;
let tDir = "";                                   // project location chosen at creation, used once, not persisted
let curChat = localStorage.getItem("rw-chat") || null;   // current chat on the agent page (independent of projects)


/* ---------------- profile: sidebar card and editor, avatar and name only ---------------- */
const profile = Object.assign({ name:"Graduate", avatar:"🎓", field:"", photo:"" },
  JSON.parse(localStorage.getItem("rw-profile") || "{}"));
/* avatar: use the photo if present (scaled to 128x128 locally in localStorage), otherwise fall back to Emoji; default 🎓 */
function avatarPhoto(){ const p = String(profile.photo || ""); return p.startsWith("data:image/") ? p : ""; }
function avatarInner(){                      // Used by template strings (sidebar / calendar greeting card)
  const p = avatarPhoto();
  return p ? `<img class="avatar-img" src="${p}" alt="">` : esc(profile.avatar || "🎓");
}
function paintAvatar(){
  const a=$("profileAvatar");
  if(a){
    const p = avatarPhoto();
    if(p){ a.innerHTML = `<img class="avatar-img" src="${p}" alt="">`; a.classList.add("has-photo"); }
    else { a.textContent = profile.avatar || "🎓"; a.classList.remove("has-photo"); }
  }
  const h=$("calHelloAvatar");
  if(h){
    const p = avatarPhoto();
    if(p){ h.innerHTML = `<img class="avatar-img" src="${p}" alt="">`; }
    else h.textContent = profile.avatar || "🎓";
  }
}
function paintProfilePreview(){
  const img = $("profPhotoPrev"); if(!img) return;
  const p = avatarPhoto();
  if(p){ img.src = p; img.classList.add("on"); } else { img.removeAttribute("src"); img.classList.remove("on"); }
}
function readAvatarFile(file, cb){
  if(!file) return;
  if(!/^image\//.test(file.type || "")){ uiNotify("This is not an image file"); return; }
  const fr = new FileReader();
  fr.onerror = ()=>uiNotify("Failed to read file");
  fr.onload = ()=>{
    const im = new Image();
    im.onerror = ()=>uiNotify("Cannot read this image (format may be unsupported)");
    im.onload = ()=>{
      try{
        const S = 128, side = Math.min(im.width, im.height);
        const c = document.createElement("canvas"); c.width = c.height = S;
        const g = c.getContext("2d");
        g.drawImage(im, (im.width-side)/2, (im.height-side)/2, side, side, 0, 0, S, S);
        cb(c.toDataURL("image/jpeg", 0.86));
      }catch(e){ uiNotify("This image failed:" + e.message); }
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function setAvatarPhoto(url){
  profile.photo = url || "";
  localStorage.setItem("rw-profile", JSON.stringify(profile));
  paintProfilePreview(); renderProfile();
}
function renderProfile(){
  const n=$("profileName");
  if(n) n.textContent = profile.name || "Graduate";
  paintAvatar();
}
function openProfileModal(){
  $("profName").value = profile.name || "";
  $("profAvatar").value = profile.avatar || "🎓";
  $("profField").value = profile.field || "";
  paintProfilePreview();
  uiOpenModal($("profileModal"), $("profName"));
}
function closeProfileModal(){ uiCloseModal($("profileModal")); }
function saveProfileModal(){
  profile.name = ($("profName").value || "").trim() || "Graduate";
  profile.avatar = ($("profAvatar").value || "").trim() || "🎓";
  profile.field = ($("profField").value || "").trim();
  localStorage.setItem("rw-profile", JSON.stringify(profile));
  renderProfile(); closeProfileModal();
}
function greetWord(){
  const h = new Date().getHours();
  return h<6 ? "Late night" : h<12 ? "Good morning" : h<14 ? "Good afternoon" : h<18 ? "Good afternoon" : "Good evening";
}
const helloText = ()=> `${greetWord()}, ${profile.name || "Graduate"}`;
let seq = 1;
const $ = (id)=>document.getElementById(id);
const esc = (s)=>String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ---- markdown pipeline (marked, KaTeX, DOMPurify allow-list) ---- */
let markdownMathSlots = null;
function mathSlot(text, display){
  if(!markdownMathSlots) return `<code>${esc(text)}</code>`;
  const id=markdownMathSlots.length;
  markdownMathSlots.push({text, display});
  const tag=display?"div":"span";
  return `<${tag} data-rw-math="${id}"></${tag}>`;
}
if(window.marked && window.marked.use){
  window.marked.use({gfm:true, breaks:true, extensions:[
    {name:"blockKatex", level:"block", start:(src)=>src.search(/\$\$|\\\[/),
     tokenizer(src){ const m=/^(?:\$\$\s*([\s\S]+?)\s*\$\$|\\\[\s*([\s\S]+?)\s*\\\])(?:\n|$)/.exec(src); return m?{type:"blockKatex",raw:m[0],text:m[1]||m[2]}:undefined; },
     renderer(tok){ return mathSlot(tok.text,true); }},
    {name:"inlineKatex", level:"inline", start:(src)=>src.search(/\$|\\[([]/),
     tokenizer(src){ const m=/^(?:\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\])/.exec(src); return m?{type:"inlineKatex",raw:m[0],text:m[1]||m[2]||m[3],display:!!m[3]}:undefined; },
     renderer(tok){ return mathSlot(tok.text,!!tok.display); }},
  ]});
}
if(window.DOMPurify && window.DOMPurify.addHook){
  window.DOMPurify.addHook("uponSanitizeAttribute", (_node, data)=>{   // Allow font/size/alignment/highlight styles written by the toolbar
    if(data.attrName === "style"){
      const ok = String(data.attrValue||"").split(";").map(s=>s.trim()).filter(s=>
        /^(?:font-family\s*:\s*[\w\s,"'-]+|font-size\s*:\s*\d{1,2}(?:\.\d+)?(?:px|pt|em|rem|%)|text-align\s*:\s*(?:left|center|right|justify)|background-color\s*:\s*(?:#[0-9a-f]{3,8}|[a-z]+)|color\s*:\s*(?:#[0-9a-f]{3,8}|[a-z]+))$/i.test(s));
      data.attrValue = ok.join("; "); data.keepAttr = ok.length > 0;
    }
    if(data.attrName === "href" && !/^(?:https?:|mailto:|#|\/)/i.test(String(data.attrValue||""))) data.keepAttr = false;
  });
}
const fmtDate = (iso)=>{ const d=new Date(iso||""); return isNaN(d) ? String(iso||"").slice(0,16).replace("T"," ") : d.toLocaleString("sv-SE",{hour12:false}).slice(0,16); };   // local time to the minute (the ISO string is UTC, 8 hours off)
const today = ()=>new Date().toLocaleDateString("sv-SE");
const clock = (d = new Date())=>{ const w = "Su Mo Tu We Th Fr Sa"[d.getDay()];   // 2026.10.4 Sunday 23:55
  return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} (${w}) ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };

// Anna shim: resolved once. null = still unknown, false = no shim (local backend).
let annaShim;
async function annApi(){
  if(annaShim !== undefined) return annaShim || null;
  try{
    const mod = await import('../api.js');
    await mod.connect();
    annaShim = mod.request;
  }catch(e){ annaShim = false; }
  return annaShim || null;
}

async function api(path, opts){
  let init = {};
  if(opts && (opts.method || opts.body || opts.headers)) init = {...opts};
  else if(opts) init = {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(opts)};
  const shim = await annApi();
  if(shim && String(path).startsWith('/api/')){
    let body;
    if(init.body && typeof init.body === 'string'){ try{ body = JSON.parse(init.body); }catch(e){ body = init.body; } }
    else if(init.body) body = init.body;
    const out = await shim(path, {method: init.method || 'GET', body});
    if(out === null || out === undefined) (window.__apiMiss = window.__apiMiss || []).push(String(path) + ' (empty)');
    return out;
  }
  const r = await fetch(path, init);
  const j = await r.json().catch(()=>({error:"Response is not JSON"}));
  if(!r.ok || (j && j.error)) throw new Error(j?.error || `Request failed (${r.status})`);
  if(init.method && init.method !== 'GET' && (/^\/api\/todos\//.test(path) || path === '/api/step/done'))
    window.dispatchEvent(new CustomEvent('todos-changed'));
  return j;
}

/* ============================== Routing ============================== */
async function exportBlob(blob, filename){
  if(window.pywebview?.api?.save_export&&blob.size>36*1024*1024)throw new Error('Export exceeds 36 MB');
  const name=filename.replace(/[<>:"/\|?*\\]/g,'_');
  const bridge=window.pywebview?.api;
  if(bridge?.save_export){
    const encoded=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result).split(',',2)[1]);
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const result=await bridge.save_export(name,encoded);
    if(result.error)throw new Error(result.error);
    if(result.cancelled)return null;
    return 'Saved to'+result.path;
  }
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  return 'Download started'+name;
}

const NAV = [
  {g:"primary",items:[
    {id:"agent",label:"Assistant",ico:"🤖"},
    {id:"assistants",label:"Expert",ico:"👨‍🔬"},
    {id:"team",label:"Team",ico:"👥"},
    {id:"workspace",label:"Project workspace",ico:"🧭"},
    {id:"toolbox",label:"Paper toolbox",ico:"🧰"},
    {id:"calendar",label:"Calendar",ico:"📅"}]},
  {g:"solo",items:[
    {id:"library",label:"Knowledge base",ico:"📚"},

    {id:"intel",label:"Daily digest",ico:"📡"}]},
  {g:"solo",items:[{id:"mail",label:"Mailbox",ico:"📧"}]},
  {g:"foot",items:[{id:"settings",label:"Settings",ico:"⚙️"}]}
];
const TITLES = {usage:"Usage stats","task-center":"Tasks and automation",toolbox:"Paper toolbox",assistants:"Expert",team:"Team",agent:"Assistant",workspace:"Project workspace",calendar:"Calendar",tasks:"Tasks and automation",workflow:"Project workspace",library:"Knowledge base",notes:"Notes",intel:"Daily digest",mail:"Mailbox",models:"Model",schedules:"Scheduled automation",space:"Project workspace",settings:"Settings"};
const route = ()=> tabs.find(t=>t.id===activeTab)?.route || "agent";
function uiRouteIs(kind){
  return route()===kind || (route()==="workspace" && !!window.ProjectWorkspace?.hasSurface(kind));
}

async function uiNavigate(action){
  const workspace=window.ProjectWorkspace?.active();
  if(workspace && !await ProjectWorkspace.flush()) return;
  if(!workspace && typeof mdProj !== "undefined" && mdProj && document.getElementById("mdSource")?.getClientRects().length){
    if(!await pnSaveCurrent()){ uiNotify("Note save failed; save again before leaving the page."); return; }
  }
  return action();
}

function openTab(r, title){
  if(r==="schedules"){TaskCenter.requestView('automation');r='task-center';title='Tasks and automation';}
  if(r==="tasks"){TaskCenter.requestView("board");r="task-center";title="Tasks and automation";}   // the old projects page is gone; its routes moved to tasks and automation
  if(["workspace","space","workflow","notes","workbench"].includes(r) && window.ProjectWorkspace){
    ProjectWorkspace.requestRoute(r);r="workspace";title="Project workspace";
  }
  if(window.ProjectWorkspace?.active() && r!=="workspace" && ProjectWorkspace.hasDirty()){
    ProjectWorkspace.leave(()=>openTab(r,title));return;
  }
  if(r === "notes"){
    if(spId !== curTask){ spActiveNoteId = null; spSelectedNoteIds.clear(); }
    spId = curTask; spTab = "notes"; r = "space"; title = "Project space";
  }
  const t = tabs.find(x=>x.route===r);
  if(t){ activeTab=t.id; return render(); }
  const id = "t"+(seq++); tabs.push({id,route:r,title:title||TITLES[r]||r}); activeTab=id;
  return render();
}
function closeTab(id){
  if(id===activeTab && window.ProjectWorkspace?.active() && ProjectWorkspace.hasDirty()){
    ProjectWorkspace.leave(()=>closeTab(id));return;
  }
  const i = tabs.findIndex(t=>t.id===id); if(i<0) return;
  tabs.splice(i,1);
  if(!tabs.length) tabs=[{id:"agent",route:"agent",title:"Assistant"}];
  if(activeTab===id) activeTab = tabs[Math.max(0,i-1)].id;
  render();
}

/* ============================== shell ============================== */
let navResearchOpen = false;   // kept only so old localStorage does not throw
let sidebarCollapsed = localStorage.getItem("rw-sidebar") === "true";

function renderSidebar(){
  const v = route();
  const item = (it,cls="")=>`<button class="nav-item ${v===it.id?"active":""} ${cls}" data-nav="${it.id}" title="${it.label}"><span class="nav-ico">${it.id==="agent"?`<img src="${Q_AV}" alt="" style="width:18px;height:18px;object-fit:contain;display:block;margin:0 auto">`:it.ico}</span><span class="lbl">${it.label}</span>${it.id==="mail"?`<span class="nav-badge hidden" id="navMailBadge">0</span>`:""}</button>`;
  const researchActive = NAV[1].items.some(i=>i.id===v);
  const open = navResearchOpen || researchActive;
  $("sidebar").className = "sidebar"+(sidebarCollapsed?" collapsed":"");
  $("sidebar").innerHTML = `
    <div class="brand"><img class="mark" src="../logo-mark.png" alt="">
      <div class="lbl" style="min-width:0"><b>scholarOS</b><small>Project research space</small></div>
      <button class="collapse" title="${sidebarCollapsed?"Expand sidebar":"Collapse sidebar"}">${sidebarCollapsed?"›":"‹"}</button></div>
    <button type="button" class="profile-card" id="profileCard" title="Click to edit your profile">
      <span class="profile-avatar" id="profileAvatar">🎓</span>
      <div class="profile-info"><b id="profileName">Graduate</b></div>
      <span class="profile-edit">✎</span></button>
    <nav class="nav">${NAV[0].items.map(i=>item(i)).join("")}
      ${NAV[1].items.map(i=>item(i)).join("")}${NAV[2].items.map(i=>item(i)).join("")}</nav>
    <div class="sidebar-foot">${item(NAV[NAV.length-1].items[0])}
      <div class="swatches" id="side-presets">${themeSwatches(true)}</div>
      <button class="nav-item" id="theme-toggle"><span class="nav-ico">${document.documentElement.dataset.theme==="dark"?"☀️":"🌙"}</span><span class="lbl">${document.documentElement.dataset.theme==="dark"?"Light theme":"Dark theme"}</span></button>
      <div class="online"><span class="dot"></span><span class="lbl">Local service Connected</span></div></div>`;
  $("sidebar").querySelectorAll("[data-nav]").forEach(b=>{
    b.setAttribute("aria-current", b.dataset.nav === v ? "page" : "false");
    b.onclick=()=>uiNavigate(()=>openTab(b.dataset.nav));
  });
  bindSwatches($("sidebar").querySelector("#side-presets"));
  $("sidebar").querySelector(".collapse").onclick=()=>{sidebarCollapsed=!sidebarCollapsed;localStorage.setItem("rw-sidebar",sidebarCollapsed);renderSidebar();};
  $("theme-toggle").onclick=()=>setTheme(document.documentElement.dataset.theme==="dark"?"light":"dark");
  $("profileCard").onclick = openProfileModal;
  $("btnProfClose").onclick = closeProfileModal;
  $("btnProfCancel").onclick = closeProfileModal;
  $("btnProfSave").onclick = saveProfileModal;
  document.querySelector("#profileModal .modal-mask").onclick = closeProfileModal;
  $("btnProfPhotoPick").onclick = ()=>$("profPhotoFile").click();
  $("profPhotoFile").onchange = (e)=>{
    const f = e.target.files && e.target.files[0];
    readAvatarFile(f, (url)=>setAvatarPhoto(url));       // applies at once and persists to localStorage
    e.target.value = "";
  };
  $("btnProfPhotoClear").onclick = ()=>setAvatarPhoto("");
  renderProfile();
}

// pw=1 means a frameless own window, so the title bar buttons are ours
const FRAMELESS = new URLSearchParams(location.search).has("pw");
let winZoom = true;                    // is the window filling the work area → maximise or restore icon
let winStateAsked = false;
if(FRAMELESS) mountResizeEdges();   // WebView2 fills the client area, so hit-testing never reaches the main window
function mountResizeEdges(){
  if(!FRAMELESS || document.getElementById("rz")) return;
  const EDGES = ["top","bottom","left","right","topleft","topright","bottomleft","bottomright"];
  const box = document.createElement("div");
  box.id = "rz";
  box.innerHTML = EDGES.map(e=>`<i data-e="${e}"></i>`).join("");
  document.body.append(box);
  box.querySelectorAll("i").forEach(el=>{
    el.addEventListener("mousedown", ev=>{
      ev.preventDefault(); ev.stopPropagation();
      const py = window.pywebview && window.pywebview.api;
      if(py && py.resize) py.resize(el.dataset.e).catch(()=>{});
    });
  });
}
function winCommand(action){
  // UIPI silently drops ShowWindow, SetWindowPos, and WM_CLOSE for medium-integrity windows -
  // the symptom is "click does nothing" while HTTP still returns 200 (measured 2026-11-15).
  // On close the page disappears at once and no receipt arrives, so close does not wait and counts as success.
  const py = window.pywebview && window.pywebview.api;
  if(py && py.win){
    if(action === "close"){
      try{ const r = py.win(action); if(r && r.catch) r.catch(()=>{}); }catch(e){}
      return Promise.resolve({ok:action});
    }
    return Promise.resolve(py.win(action)).catch(()=>api("/api/win/" + action, {}));
  }
  return api("/api/win/" + action, {});      // Fall back to HTTP only when the bridge is not up (very early clicks)
}
function renderTopbar(){
  $("topbar").innerHTML = `
    <button type="button" class="topbar-icon-btn" id="btnTopToggleSidebar" title="Collapse/Expand the main navigation (Ctrl+B)">☰</button>
    <span class="date">${clock()}</span>
    <span class="pill" title="Current model">${S.active?("Model "+esc(S.active.name)):"No model configured"}</span>
    <div class="topbar-actions">
      <button type="button" class="btn ghost" id="usageStats">Usage</button><button type="button" class="btn ghost" id="paperToolbox" title="translation both ways, polishing, citations, and format conversion">Paper toolbox</button>
      <button type="button" class="btn ghost btn-sm btn-zen" id="btnZenMode" title="Full-screen focus workspace (F10)">⛶ Focus</button>
      <button type="button" class="btn ghost" data-command="palette" title="Search commands and pages (Ctrl+K)">Search commands <kbd>Ctrl+K</kbd></button>
      <button type="button" class="btn ghost" data-command="help" title="Shortcuts and help (F1)" aria-label="Shortcuts and help">Shortcuts</button>
    </div>
    ${FRAMELESS?`<span class="wctl">
      <button title="Minimize" data-w="minimize">\uE921</button>
      <button title="${winZoom?"Restore":"Maximise"}" data-w="maximize">${winZoom?"\uE923":"\uE922"}</button>
      <button class="close" title="Close" data-w="close">\uE8BB</button>
    </span>`:""}`;
  $("topbar").querySelectorAll("[data-w]").forEach(b=>{
    b.setAttribute("aria-label", b.title);
    b.onmousedown = e => e.stopPropagation();          // Don't let title-bar dragging swallow the buttons
    b.onclick = () => winCommand(b.dataset.w)
      .then(r=>{ if(r && typeof r.zoomed === "boolean") winSet(r.zoomed); })
      .catch(()=>{});
  });
  $("topbar").querySelectorAll(".topbar-actions button").forEach(b=>b.onmousedown=e=>e.stopPropagation());
  const btnTopSide = $("btnTopToggleSidebar");
  $("usageStats").onclick=()=>openTab("usage");
  $("paperToolbox").onclick=()=>PaperToolbox.open();
  if(btnTopSide) btnTopSide.onclick = toggleSidebarCollapse;
  const btnZen = $("btnZenMode");
  if(btnZen) btnZen.onclick = () => toggleZenMode();
  if(FRAMELESS && !winStateAsked){                     // Ask the real state once on startup (a restored window may not be full screen)
    winStateAsked = true;
    winRefresh();
  }
}
function winRefresh(){
  api("/api/win/state").then(r=>{
    if(r && typeof r.zoomed === "boolean") winSet(r.zoomed);
  }).catch(()=>{});
}
window.addEventListener("focus", ()=>{ if(FRAMELESS) winRefresh(); });   // realign once when restored from the taskbar
function winSet(zoom){
  if(zoom === winZoom) return;
  winZoom = zoom;
  renderTopbar();
}

function renderTabs(){
  localStorage.setItem("rw-route", route());
  $("tabsbar").innerHTML = `<div class="app-tablist" role="tablist" aria-label="Open pages">` + tabs.map(t=>`<div class="tab-wrap ${t.id===activeTab?"active":""}" data-tab-id="${t.id}">
    <button class="tab" role="tab" aria-selected="${t.id===activeTab}" tabindex="${t.id===activeTab?0:-1}" aria-controls="main" data-t="${t.id}">${esc(t.title)}</button>
    ${tabs.length>1?`<button type="button" class="tab-close" data-x="${t.id}" aria-label="Close${esc(t.title)}" title="Close tab">✕</button>`:""}</div>`).join("")
    + `</div><button class="tab" id="newtab" title="Open the assistant" aria-label="Open the assistant">+</button><button class="tab" id="tabActions" title="Tab actions" aria-label="Tab actions" aria-haspopup="menu">⋯</button>`;
  $("tabsbar").querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>uiNavigate(()=>{
    activeTab=b.dataset.t; render(); document.querySelector(`[data-t="${activeTab}"]`)?.focus();
  }));
  $("tabsbar").querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>uiNavigate(()=>{
    closeTab(b.dataset.x); document.querySelector(`[data-t="${activeTab}"]`)?.focus();
  }));
  $("newtab").onclick=()=>uiNavigate(()=>openTab("agent"));
}

function renderStatus(){
  const t = S.tasks.find(x=>x.id===curTask);
  $("statusbar").className = "statusbar" + (statusCollapsed ? " collapsed" : "");
  $("statusbar").innerHTML = `
    <span><span class="led"></span>Local service Normal</span>
    <span><span class="led"></span>SQLite Normal</span>
    <span>Model ${S.active?esc(S.active.name):"Not configured"}</span>
    <span>Tools ${S.tools.length}</span>
    <span>Current project ${t?esc(t.title):"-"}</span>
    <span style="flex:1"></span>
    <button type="button" class="statusbar-toggle" id="btnToggleStatus" title="Collapse/Expand the status bar">${statusCollapsed ? "▲" : "▼"}</button>`;
  const btnSt = $("btnToggleStatus");
  if(btnSt){
    btnSt.onclick = () => {
      statusCollapsed = !statusCollapsed;
      localStorage.setItem("rw-status-collapsed", statusCollapsed);
      renderStatus();
    };
  }
}

function uiNotify(text, ms = 3400) {
  const t = String(text ?? "");
  const bad = /Failed|Error|Cannot|Not allowed|⚠|failed|Rejected/.test(t);
  let box = document.getElementById("uiToast");
  if (!box) {
    box = document.createElement("div");
    box.id = "uiToast";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    box.onclick = () => box.remove();
    document.body.appendChild(box);
  }
  box.className = "ui-toast" + (bad ? " bad" : "");
  box.textContent = t;
  clearTimeout(uiNotify._t);
  uiNotify._t = setTimeout(() => box.remove(), ms);
}
                     // route uiNotify through a centred card, synchronously

const uiModalOrigins = new WeakMap();
function uiOpenModal(modal, initial){
  if(!modal) return;
  if(modal.classList.contains("hidden")) uiModalOrigins.set(modal, document.activeElement);
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  if(!modal.hasAttribute("aria-label") && !modal.hasAttribute("aria-labelledby"))
    modal.setAttribute("aria-label", modal.querySelector("h3")?.textContent || "Actions");
  modal.classList.remove("hidden");
  (initial || modal.querySelector("button, input, [tabindex]"))?.focus();
}
function uiCloseModal(modal){
  if(!modal) return;
  modal.classList.add("hidden");
  const origin = uiModalOrigins.get(modal);
  uiModalOrigins.delete(modal);
  if(origin?.isConnected) origin.focus();
  else document.querySelector('#tabsbar [aria-selected="true"]')?.focus();
}

function uiConfirm(text, opts = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement("dialog");
    wrap.className = "modal";
    wrap.setAttribute("aria-label", opts.title || "Confirm action");
    wrap.innerHTML = `
      <div class="modal-mask"></div>
      <div class="modal-dialog" style="width:${opts.width || 400}px">
        <div class="modal-head"><h3>${esc(opts.title || "Confirm action")}</h3></div>
        <div class="modal-body"><p class="modal-text">${esc(text)}</p></div>
        <div class="modal-foot">
          <button class="btn ghost" data-no>${esc(opts.cancel || "Cancel")}</button>
          <button class="btn ${opts.danger === false ? "" : "danger"}" data-ok>${esc(opts.ok || "OK")}</button>
        </div>
      </div>`;
    const origin = document.activeElement;
    const done = v => { wrap.close(); wrap.remove(); if(origin?.isConnected) origin.focus(); resolve(v); };
    const key = e => {
      if(e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
    };
    wrap.querySelector("[data-ok]").onclick = () => done(true);
    wrap.querySelector("[data-no]").onclick = () => done(false);
    wrap.querySelector(".modal-mask").onclick = () => done(false);
    wrap.addEventListener("keydown", key);
    wrap.addEventListener("cancel", e=>{ e.preventDefault(); done(false); });
    document.body.appendChild(wrap);
    wrap.showModal();
    wrap.querySelector(opts.danger === false ? "[data-ok]" : "[data-no]").focus();
  });
}

function uiPrompt(text, def = "") {
  return new Promise(resolve => {
    const wrap = document.createElement("dialog");
    wrap.className = "modal";
    wrap.setAttribute("aria-label", text);
    wrap.innerHTML = `
      <div class="modal-mask"></div>
      <div class="modal-dialog" style="width:440px">
        <div class="modal-head"><h3>${esc(text)}</h3></div>
        <div class="modal-body"><input class="ui-input" id="uiPromptIn" aria-label="${esc(text)}" value="${esc(def)}"></div>
        <div class="modal-foot">
          <button class="btn ghost" data-no>Cancel</button>
          <button class="btn" data-ok>OK</button>
        </div>
      </div>`;
    const origin = document.activeElement;
    const done = v => { wrap.close(); wrap.remove(); if(origin?.isConnected) origin.focus(); resolve(v); };
    const inp = wrap.querySelector("#uiPromptIn");
    const key = e => {
      if(e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); }
      if (e.key === "Enter" && e.target === inp) { e.preventDefault(); done(inp.value); }
    };
    wrap.querySelector("[data-ok]").onclick = () => done(inp.value);
    wrap.querySelector("[data-no]").onclick = () => done(null);
    wrap.querySelector(".modal-mask").onclick = () => done(null);
    wrap.addEventListener("keydown", key);
    wrap.addEventListener("cancel", e=>{ e.preventDefault(); done(null); });
    document.body.appendChild(wrap);
    wrap.showModal();
    inp.focus(); inp.select();
  });
}

async function loadSecurity() {
  try { S.sec = await api("/api/security"); } catch (e) { S.sec = S.sec || {}; }
  return S.sec || {};
}
function uiChoice(title, text, okLabel, cancelLabel) {
  return uiConfirm(text, { title, ok: okLabel, cancel: cancelLabel, danger: false });
}
async function needPerm(what) {
  if (((S.sec || {}).permission_mode) === "all") return true;
  return await uiChoice("Needs your approval", `This wants to ${what}. Allow? (change it under settings → permissions to stop asking)`, "Allow once", "Not now");
}
async function setPermissionMode(mode) {
  try { S.sec = await api("/api/security", { permission_mode: mode }); } catch (e) { uiNotify("Save failed:" + e.message); }
  return S.sec;
}

function hasModelKey() {
  if((S.models||[]).some(model=>{
    if(['codex-cli','claude-code-cli','antigravity-cli'].includes(model.api))return true;
    try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(model.base_url).hostname);}catch{return false;}
  }))return true;
  if ((S.models || []).some(m => m.api_key)) return true;
  if (S.active && S.active.api_key) return true;
  return (S.providers || []).some(p => p.key_present);
}
async function requireModelKey() {
  if (hasModelKey()) return true;
  const go = await uiConfirm(
    "Configure a model under settings → models first. Cloud endpoints usually need an API key; local endpoints and account clients connect their own way.",
    { title: "Configure a model first", ok: "Open settings", cancel: "Got it", danger: false });
  if (go){setSec='models';openTab("settings");}
  return false;
}

/* ==================== UI zoom (Ctrl + wheel / shortcuts) ==================== */
let uiZoomLevel = parseFloat(localStorage.getItem("rw-ui-zoom") || "1");
if (isNaN(uiZoomLevel) || uiZoomLevel < 0.5 || uiZoomLevel > 3.0) uiZoomLevel = 1;

function setUiZoom(newZoom, showFeedback = true) {
  const clamped = Math.min(2.5, Math.max(0.6, Math.round(newZoom * 100) / 100));
  uiZoomLevel = clamped;
  document.documentElement.style.zoom = String(uiZoomLevel);
  localStorage.setItem("rw-ui-zoom", String(uiZoomLevel));
  if (showFeedback && typeof uiNotify === "function") {
    uiNotify(`Interface zoom: ${Math.round(uiZoomLevel * 100)}%`, { timeout: 1200 });
  }
}

if (uiZoomLevel !== 1) {
  document.documentElement.style.zoom = String(uiZoomLevel);
}

window.addEventListener("wheel", (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.05 : -0.05;
    setUiZoom(uiZoomLevel + step);
  }
}, { passive: false });

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "=" || e.key === "+" || e.code === "NumpadAdd" || e.code === "Equal") {
      e.preventDefault();
      setUiZoom(uiZoomLevel + 0.1);
    } else if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract" || e.code === "Minus") {
      e.preventDefault();
      setUiZoom(uiZoomLevel - 0.1);
    } else if (e.key === "0" || e.code === "Numpad0" || e.code === "Digit0") {
      e.preventDefault();
      setUiZoom(1.0);
    }
  }
});
