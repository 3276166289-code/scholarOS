const TR = { pid: "", task: "", meta: null, view: "read", scale: 1.15, noteScale: 1, noteZen: false, hlOn: false, hlColor: "#FFE066", hlWidth: 14,
             pdf: null, pages: 0, sel: new Set(), hl: [], job: null, poll: 0, note: null, dual: false,
             scaleB: 0, active: "a", split: 50, splitBound: 0, syncBound: 0 };
const TR_MAX = 3.0, TR_MIN = 0.5;
const trTask = () => TR.task || curTask;   // toolbox project wins, then the global current project


function trPanelHTML(active){
  return `<div class="tr" id="panel-notes"${active?"":' style="display:none"'}>
    <div class="tr-bar">
      <button class="btn btn-teal" id="trAdd">+ Add paper</button>
      <span class="tr-seg" id="trSeg">
        <button class="tr-seg-b active" id="trBtnEn" title="English original PDF">English</button>
        <button class="tr-seg-b" id="trBtnDual" title="original left translation right Compare">Compare</button>
        <button class="tr-seg-b" id="trBtnZh" title="Chinese only (BabelDOC translation)">Chinese</button>
      </span>
      <button class="tr-info-b" id="trInfoBtn" aria-haspopup="true" aria-expanded="false" title="Paper details">Paper details ▾</button>
      <span class="tr-spacer"></span>
      <span class="tr-grp">
        <button class="tr-ib" id="trPenTop" title="Highlighter" aria-label="Highlighter">🖍</button>
        <button class="tr-ib" id="trZenTop" title="Read full screen (Esc exit)" aria-label="Focus mode">⛶</button>
      </span>
      <span class="tr-zoom"><button id="trOut" title="Zoom out" aria-label="Zoom out">−</button><span class="tr-zoomv" id="trZoomV">115%</span><button id="trIn" title="Zoom in" aria-label="Zoom in">+</button></span>
      <span class="tr-pageno" id="trPageNo">0 / 0</span>
    </div>
    <div class="tr-strip" id="trStrip">
      <span class="tr-strip-t" id="trStripTitle">No paper open yet</span>
      <span class="tr-strip-m" id="trStripMeta"></span>
      <button class="tr-strip-x hidden" id="trStripMore" title="See the full metadata">Details ▾</button>
      <span class="tr-spacer"></span>
      <span class="tr-msg" id="trMsg"></span>
    </div>
    <div class="tr-detail hidden" id="trDetail">
      <div><b>Title: </b><span id="trTitle">No information yet</span></div>
      <div><b>DOI: </b><span id="trDoi">No information yet</span></div>
      <div><b>Published: </b><span id="trDate">No information yet</span></div>
      <div><b>Keywords: </b><span id="trKw">No information yet</span></div>
    </div>
    <div class="tr-info hidden" id="trInfo" role="dialog" aria-label="Paper details">
      <div class="tr-info-cover" id="trInfoCover"><span>page 1 preview</span></div>
      <b class="tr-info-t" id="trInfoTitle">-</b>
      <dl class="tr-info-list">
        <div><dt>Add to project</dt><dd id="trInfoAdded">-</dd></div>
        <div><dt>DOI</dt><dd id="trInfoDoi">-</dd></div>
        <div><dt>Keywords</dt><dd id="trInfoKw">-</dd></div>
        <div><dt>Total pages</dt><dd id="trInfoPages">-</dd></div>
        <div><dt>Translated</dt><dd id="trInfoProg">-</dd></div>
      </dl>
      <div class="tr-info-bar"><i id="trInfoBar"></i></div>
    </div>
    <div class="tr-stage" id="trStage">
      <button class="tr-zen-exit" id="trZenExit" title="Exit focus mode (Esc)">✕ Exit focus</button>
      <span class="tr-zen-zoom" id="trZenZoom"><button class="tr-ib" id="trZenOut" title="Zoom out" aria-label="Zoom out">−</button><button class="tr-ib" id="trZenIn" title="Zoom in" aria-label="Zoom in">+</button><span class="tr-zoomv" id="trZenZoomV">100%</span></span>
      <div class="tr-drop" id="trDrop">
        <div class="tr-drop-in">
          <div class="tr-drop-ico">📄</div>
          <b>Drop the PDF here, or click + at the top left Add paper”</b>
          <span>Parsed automatically once chosen DOI / Title / Published / Keywords</span>
        </div>
      </div>
      <div class="tr-pane" id="trPaneA" data-pane="a"><div class="tr-scroll"></div></div>
      <div class="tr-split" id="trSplit" title="Drag to resize the two panes"></div>
      <div class="tr-pane" id="trPaneB" data-pane="b"><div class="tr-scroll"></div></div>
    </div>
    <div class="tr-pen hidden" id="trPen">
      <b>Colour</b>
      <div class="tr-colors" id="trColors"></div>
      <b>Width <i title="Highlighter width; thicker covers more">ⓘ</i></b>
      <input type="range" id="trWidth" min="6" max="34" value="14">
    </div>
    <input type="file" id="trFile" accept="application/pdf" hidden>
  </div>`;
}

/* ---------------- pick or drop a file ---------------- */
async function trUpload(files){
  const f = [...(files||[])].find(x=>/\.pdf$/i.test(x.name));
  if(!f) return trMsg("accepts only PDF File");
  if(!trTask()) return trMsg("Select a project first - the PDF goes into the current project's literature library");
  trMsg("Uploading..." + f.name);
  try{
    const r = await fetch(`/api/upload?name=${encodeURIComponent(f.name)}&task_id=${encodeURIComponent(trTask())}`,
                          {method:"POST", headers:{"Content-Type":"application/octet-stream"}, body:f});
    const a = await r.json(); if(a.error) throw new Error(a.error);
    if(!a.paper_id) return trMsg("Ingest failed:" + (a.ingest_error || "Not a valid PDF"));
    await trOpen(a.paper_id);
  }catch(e){ trMsg("Upload failed:" + e.message); }
}
function trMsg(t){ const el=$("trMsg"); if(el) el.textContent = t || ""; }

async function trOpen(pid){
  TR.pid = pid;
  trView("read");
  trSegActive("read");
  trInfoToggle(false);
  $("trPen")?.classList.add("hidden"); TR.hlOn = false;
  TR.job = null; TR.prog = 0; trStopPoll();
  trMeta();
  await trReader(pid);
  trHlLoad();
}

/* ---------------- metadata ---------------- */
async function trMeta(){
  const set = (id, v)=> { const el = $(id); if(el) el.textContent = (v && String(v).trim()) ? v : "No information"; };
  if(!TR.pid) return;
  try{
    const d = await api(`/api/papermeta?id=${encodeURIComponent(TR.pid)}`);
    if(d.error) throw new Error(d.error);
    TR.meta = d;
    set("trDoi", d.doi); set("trTitle", d.title); set("trDate", d.published); set("trKw", d.keywords);
    $("trTitle").title = d.title || "";
    trStrip();
  }catch(e){ trMsg("Metadata read failed:" + e.message); }
}
function trStrip(){
  /* top strip: title, date, DOI, keywords; expand via "Details ▾" */
  const m = TR.meta || {}, t = $("trStripTitle"), c = $("trStripMeta"), more = $("trStripMore");
  if(!t) return;
  t.textContent = m.title || (TR.pid ? "(no title parsed from this paper)" : "No paper open yet");
  t.title = m.title || "";
  const kw = String(m.keywords || "").split(/[;,, ]/).filter(x => x.trim()).length;
  c.textContent = [m.published, m.doi ? "DOI " + m.doi : "", kw ? `Keyword ${kw}` : ""].filter(Boolean).join(" · ");
  more.classList.toggle("hidden", !TR.pid);
}

/* ---------------- paper info chip: the rail's content as a popover ---------------- */
function trInfoFill(){
  const m = TR.meta || {};
  const t = $("trInfoTitle");
  if(t) t.textContent = m.title || (TR.pid ? "(no title parsed from this paper)" : "No paper open yet");
  const kw = String(m.keywords || "").split(/[;,, , ]/).filter(x => x.trim()).length;
  const set = (id, v)=>{ const el = $(id); if(el) el.textContent = v || "-"; };
  set("trInfoAdded", m.added);
  set("trInfoDoi", m.doi || (TR.pid ? "Not resolved" : ""));
  set("trInfoKw", kw ? kw + " items" : "");
  set("trInfoPages", TR.pages ? TR.pages + " pages" : "");
  const s = TR.job || {}, done = +s.pages_done || 0, total = +s.total_pages || TR.pages || 0;
  let prog = "Not started";
  if(s.state === "done" || (total && done >= total)) prog = `Translation complete ${total} pages`;
  else if(s.state === "running" || s.state === "partial" || done) prog = `Translating ${done}/${total || "?"} pages`;
  set("trInfoProg", TR.pid ? prog : "");
  const bar = $("trInfoBar");
  if(bar) bar.style.width = total ? Math.round(done / total * 100) + "%" : (s.state === "done" ? "100%" : "0%");
}
async function trInfoThumb(){
  const box = $("trInfoCover"); if(!box) return;
  const cv0 = document.querySelector('#trPaneA .tr-page[data-page="1"] canvas');   // screenshot the already-rendered first page, skip a render
  if(cv0){
    try{ box.innerHTML = `<img src="${cv0.toDataURL("image/jpeg", 0.7)}" alt="">`; return; }catch(_){}
  }
  const pdf = TR.pdfs?.a; if(!pdf) return;
  try{
    const page = await pdf.getPage(1);
    const vp = page.getViewport({scale: 0.45});
    const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
    await page.render({canvasContext: cv.getContext("2d"), viewport: vp}).promise;
    if(box.isConnected) box.innerHTML = `<img src="${cv.toDataURL("image/jpeg", 0.75)}" alt="">`;
  }catch(_){}
}
async function trInfoLoad(){
  trInfoFill();
  if(TR.pid && !TR.meta) await trMeta();
  if(TR.pid){
    try{ TR.job = await api(`/api/trans/status?id=${encodeURIComponent(TR.pid)}&task=${encodeURIComponent(trTask() || "")}`); }catch(_){}
  }
  trInfoFill(); trInfoThumb();
}
function trInfoToggle(on){
  const p = $("trInfo"); if(!p) return;
  const show = on === undefined ? p.classList.contains("hidden") : !!on;
  p.classList.toggle("hidden", !show);
  $("trInfoBtn")?.setAttribute("aria-expanded", String(show));
  if(show) trInfoLoad();
}

/* ---------------- reader (pdf.js, one per pane) ---------------- */
function trWorker(){
  if(window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc)
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
}
function trPaneEl(key){ return $(key === "b" ? "trPaneB" : "trPaneA"); }
function trScrollEl(key){ return trPaneEl(key)?.querySelector(".tr-scroll"); }

async function trReader(pid){
  if(!window.pdfjsLib){ trMsg("pdf.js did not load"); return; }
  trWorker();
  trView("read");
  const box = trScrollEl("a"); if(box) box.innerHTML = "";
  await trMount("a", `/api/pdf?id=${encodeURIComponent(pid)}`);
}
async function trShowZh(v){
  /* single column: translation only, keeping the reading position */
  if(!TR.pid) return trMsg("Add a PDF first");
  if(!window.pdfjsLib){ trMsg("pdf.js did not load"); return; }
  trWorker();
  const box = trScrollEl("a"), y = box ? box.scrollTop : 0;
  trView("zh");
  TR.monoUrl = trMonoUrl(v);
  await trMount("a", TR.monoUrl);
  if(box) box.scrollTop = y;
}
function trSc(key){ return key === "b" ? (TR.scaleB || TR.scale) : TR.scale; }
function trFocus(k){
  /* Compare mode: the clicked column highlights; zoom buttons affect only that column */
  TR.active = k;
  $("trPaneA")?.classList.toggle("tr-focus", k === "a");
  $("trPaneB")?.classList.toggle("tr-focus", k === "b");
  trZoomLabel();
}
async function trFitBoth(){
  const pdf = TR.pdfs?.a; if(!pdf) return;
  try{
    const vp = (await pdf.getPage(1)).getViewport({scale: 1});
    const fit = k => Math.min(TR_MAX, Math.max(TR_MIN, Math.round(((trPaneEl(k)?.clientWidth || 380) - 26) / vp.width * 100) / 100));
    TR.scale = fit("a"); TR.scaleB = fit("b");
    trZoomLabel();
  }catch(_){ return; }
  await trMount("a", `/api/pdf?id=${encodeURIComponent(TR.pid)}`);
  if(TR.pdfs?.b) await trMount("b", TR.monoUrl);
}
function trSplitBind(){
  const sp = $("trSplit"), st = $("trStage");
  if(!sp || !st || TR.splitBound) return;
  TR.splitBound = 1;
  let drag = false;
  sp.addEventListener("pointerdown", (e)=>{ drag = true; try{ sp.setPointerCapture(e.pointerId); }catch(_){} e.preventDefault(); });
  sp.addEventListener("pointermove", (e)=>{
    if(!drag) return;
    const r = st.getBoundingClientRect();
    const pct = Math.min(76, Math.max(24, (e.clientX - r.left) / r.width * 100));
    TR.split = pct;
    st.style.setProperty("--split", pct.toFixed(2) + "%");
  });
  const end = (e)=>{
    if(!drag) return;
    drag = false;
    try{ sp.releasePointerCapture(e.pointerId); }catch(_){}
    trFitBoth();                                        // reorder on release so dragging stays smooth
  };
  sp.addEventListener("pointerup", end);
  sp.addEventListener("pointercancel", end);
}
async function trShowDual(v){
  /* two columns with proportional scroll sync; prompt for a translation when missing */
  if(!TR.pid) return trMsg("Add a PDF first");
  if(!window.pdfjsLib){ trMsg("pdf.js did not load"); return; }
  trWorker();
  const entering = TR.view !== "dual";
  trView("dual");
  TR.monoUrl = trMonoUrl(v);
  if(!TR.pdfs?.a) await trMount("a", `/api/pdf?id=${encodeURIComponent(TR.pid)}`);
  const pdf = TR.pdfs?.a;
  if(entering && pdf){
    try{
      const vp = (await pdf.getPage(1)).getViewport({scale: 1});
      const fit = k => Math.min(TR_MAX, Math.max(TR_MIN, Math.round(((trPaneEl(k)?.clientWidth || 380) - 26) / vp.width * 100) / 100));
      TR.scale = fit("a"); TR.scaleB = fit("b");
      trZoomLabel();
    }catch(_){}
  }
  let ready = !!(v > 0);                               // ask for status, do not infer from an error message
  try{
    const st = await api(`/api/trans/status?id=${encodeURIComponent(TR.pid)}&task=${encodeURIComponent(trTask() || "")}`);
    TR.job = st; ready = st.state === "done" || (+st.pages_done || 0) > 0;
    if(!$("trInfo")?.classList.contains("hidden")) trInfoFill();
  }catch(_){}
  if(!ready){
    const box = trScrollEl("b");
    if(box) box.innerHTML = `<div class="tr-load">No translation yet - click "Chinese" above to start (it runs in batches)</div>`;
    TR.pdfs && (TR.pdfs.b = null);
    await trMount("a", `/api/pdf?id=${encodeURIComponent(TR.pid)}`);   // Re-lay the left column at half width; do not let the original size push out sideways
    trSyncScroll();
    return;
  }
  await Promise.all([
    trMount("a", `/api/pdf?id=${encodeURIComponent(TR.pid)}`),
    trMount("b", TR.monoUrl),
  ]);
  trSyncScroll();
}
function trSyncScroll(){
  /* two columns sync by scroll ratio, whoever scrolls wins; same-frame echo swallowed by a lock */
  if(TR.syncBound) return;
  TR.syncBound = 1;
  const a = trScrollEl("a"), b = trScrollEl("b"); if(!a || !b) return;
  let lock = 0;
  const link = (src, dst)=> src.addEventListener("scroll", ()=>{
    if(lock) return;
    lock = 1;
    const maxS = Math.max(1, src.scrollHeight - src.clientHeight);
    const maxD = Math.max(0, dst.scrollHeight - dst.clientHeight);
    dst.scrollTop = Math.round(src.scrollTop / maxS * maxD);
    requestAnimationFrame(()=>{ lock = 0; });
  });
  link(a, b); link(b, a);
}
async function trMount(key, url){
  const box = trScrollEl(key); if(!box) return;
  box.innerHTML = `<div class="tr-load">Rendering...</div>`;
  try{
    const pdf = await window.pdfjsLib.getDocument({url}).promise;
    TR.pdfs = TR.pdfs || {}; TR.pdfs[key] = pdf;
    if(key === "a") TR.pages = pdf.numPages;   // Translated page count may differ from the source: "x / N" always counts source pages
    box.innerHTML = "";
    const sc = trSc(key);
    for(let n = 1; n <= pdf.numPages; n++){
      const page = await pdf.getPage(n);
      const vp = page.getViewport({scale: sc});
      const el = document.createElement("div");
      el.className = "tr-page"; el.dataset.page = n;
      el.style.width = Math.round(vp.width) + "px";
      el.style.height = Math.round(vp.height) + "px";
      el.innerHTML = `<span class="tr-ph">page ${n}</span>`;
      box.appendChild(el);
    }
    box.onscroll = ()=>{ if(!TR.raf){ TR.raf = requestAnimationFrame(()=>{ TR.raf = 0; trPaintNear(key); trPageNo(key); }); } };
    box.scrollTop = 0;
    trPaintNear(key);
    trPageNo(key);
  }catch(e){
    const noMono = key === "b" && /404|not found/i.test(String(e.message));
    box.innerHTML = noMono
      ? `<div class="tr-load">No translation yet - click "Chinese" above to start (it runs in batches)</div>`
      : `<div class="tr-load err">Cannot open PDF: ${esc(e.message)}</div>`;
    if(/404|not found/i.test(String(e.message))) trMsg("No translation yet - click ”Translation” and it runs once per paper");
  }
}
function trPaintNear(key){
  /* render pages near the viewport only; IntersectionObserver does not fire in this WebView2 */
  const box = trScrollEl(key); if(!box) return;
  const top = box.scrollTop - 400, bot = box.scrollTop + box.clientHeight + 900;
  box.querySelectorAll(".tr-page").forEach(el=>{
    if(el.offsetTop + el.offsetHeight > top && el.offsetTop < bot) trPaint(key, +el.dataset.page, el);
  });
}
async function trBuildText(n, tl, page, vp){
  let tc;
  try{ tc = await page.getTextContent(); }catch(_){ return; }
  const s = vp.scale;
  tl.innerHTML = tc.items.map(it=>{
    if(!it.str || !it.str.trim()) return "";
    const m = window.pdfjsLib.Util.transform(vp.transform, it.transform);
    const h = Math.hypot(m[2], m[3]) || 10;
    return `<span style="left:${m[4].toFixed(1)}px;top:${(m[5] - h * 0.82).toFixed(1)}px;`
      + `width:${(it.width * s).toFixed(1)}px;height:${h.toFixed(1)}px;`
      + `font-size:${h.toFixed(1)}px;line-height:${h.toFixed(1)}px">${esc(it.str)}</span>`;
  }).join("");
}
async function trPaint(key, n, el){
  if(el.dataset.painted === "1" && el.querySelector("canvas")) return;
  el.dataset.painted = "1";
  const pdf = (TR.pdfs||{})[key]; if(!pdf) return;
  try{
    const page = await pdf.getPage(n);
    const vp = page.getViewport({scale: trSc(key)});
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cv = document.createElement("canvas");
    cv.width = Math.round(vp.width * dpr); cv.height = Math.round(vp.height * dpr);
    cv.style.width = "100%"; cv.style.height = "100%";
    el.innerHTML = "";
    el.appendChild(cv);
    const tl = document.createElement("div"); tl.className = "tr-text"; el.appendChild(tl);
    const renderP = page.render({canvasContext: cv.getContext("2d"), viewport: vp, transform: [dpr,0,0,dpr,0,0]}).promise;
    const textP = trBuildText(n, tl, page, vp);
    await Promise.all([renderP, textP]);
    const hl = document.createElement("div"); hl.className = "tr-hls"; el.appendChild(hl);
    if(key === "a") trPaintHls(n, el);   // annotations are placed on the source page, not the translation pane
  }catch(e){ el.dataset.painted = ""; el.dataset.err = String(e && e.message || e);
             const ph = el.querySelector(".tr-ph"); if(ph) ph.textContent = "This page failed to render:" + el.dataset.err.slice(0, 80); }
}
function trPageNo(key){
  const box = trScrollEl(key); if(!box) return;
  const mid = box.scrollTop + box.clientHeight * 0.35;
  let best = 1;
  box.querySelectorAll(".tr-page").forEach(el=>{ if(el.offsetTop <= mid) best = +el.dataset.page; });
  if(key === "a"){ $("trPageNo").textContent = `${best} / ${TR.pages || 0}`; TR.cur = best; }
}
function trZen(on){
  /* Focus mode: just take the reading area full screen; everything else (pdf.js columns, draggable divider, per-column controls) is reused as is */
  const st = $("trStage"); if(!st) return;
  const show = on === undefined ? !st.classList.contains("zen") : !!on;
  st.classList.toggle("zen", show);
  TR.zen = show;
  $("trZenTop")?.classList.toggle("active", show);
  trMsg(show ? "Focus mode: zoom with the +/− pair at the top left, Esc to exit" : "");
  if(show){ trPaintNear("a"); if(TR.view === "dual") trPaintNear("b"); trZoomLabel(); }
}
function trZoom(d){
  const key = (TR.view === "dual" && TR.active === "b") ? "b" : "a";   // In compare view only the highlighted column zooms
  const next = Math.min(TR_MAX, Math.max(TR_MIN, Math.round((trSc(key) + d) * 100) / 100));
  if(key === "b") TR.scaleB = next; else TR.scale = next;
  const where = TR.view === "dual" ? (key === "b" ? "(right column)" : "(left panel)") : "";
  trMsg(`Zoom ${Math.round(next*100)}%${where}`);
  if(TR.pid){
    if(TR.view === "dual") trMount(key, key === "b" ? TR.monoUrl : `/api/pdf?id=${encodeURIComponent(TR.pid)}`);
    else if(TR.view === "zh") trShowZh();
    else trReader(TR.pid);
  }
  trZoomLabel();
}
function trZoomLabel(){
  const t = Math.round(trSc(TR.view === "dual" ? (TR.active || "a") : "a") * 100) + "%";
  const v = $("trZenZoomV"); if(v) v.textContent = t;      // the top-left one in focus mode
  const w = $("trZoomV");    if(w) w.textContent = t;      // the one in the toolbar zoom group
}
function trExitFull(){
  /* single exit for ✕ / Esc: drop fullscreen first */
  trZen(false);
}

/* ---------------- highlighter ---------------- */
const TR_COLORS = ["#FFE066", "#8BD498", "#7FC4F0", "#F0A9C0", "#F07C7C"];
let trHlT = 0;
function trHlSave(){
  /* Write a local copy immediately (renderable offline); server debounces at 400ms - experts read the server copy */
  try{ localStorage.setItem("rw-hl-" + TR.pid, JSON.stringify({v: 2, list: TR.hl})); }catch(_){}
  clearTimeout(trHlT);
  trHlT = setTimeout(()=>{ api("/api/tr/hl", {id: TR.pid, task_id: trTask() || "", list: TR.hl}).catch(()=>{}); }, 400);
}
async function trHlLoad(){
  /* ask the server first (experts need it), then the local copy so offline still renders */
  let list = null;
  try{
    const d = await api(`/api/tr/hl?id=${encodeURIComponent(TR.pid)}&task=${encodeURIComponent(trTask()||"")}`);
    if(Array.isArray(d.list)) list = d.list;
  }catch(_){}
  if(!list || !list.length){
    let raw = null;
    try{ raw = JSON.parse(localStorage.getItem("rw-hl-" + TR.pid) || "null"); }catch(_){ raw = null; }
    list = (raw && raw.v === 2) ? (raw.list || []) : [];
  }
  TR.hl = list || [];
  trPaintAllHls();
  trMsg(TR.hl.length ? `${TR.hl.length} annotations on this PDF` : "");
}
function trPaintHls(n, el){
  const box = el.querySelector(".tr-hls"); if(!box) return;
  box.innerHTML = "";
  const k0 = el.clientWidth ? el.clientWidth : 0;     // current page width
  TR.hl.filter(h=>h.p === n).forEach((h, i)=>{
    const k = h.sw && k0 ? k0 / h.sw : 1;             // scale by the page width at markup time so annotations track the text
    const d = document.createElement("div");
    d.className = "tr-hl"; d.dataset.i = TR.hl.indexOf(h);
    d.style.cssText = `left:${(h.x*k).toFixed(1)}px;top:${(h.y*k).toFixed(1)}px;width:${(h.w*k).toFixed(1)}px;height:${(h.th*k).toFixed(1)}px;background:${h.c}`
      + ";position:absolute;border-radius:3px;opacity:.5;mix-blend-mode:multiply;cursor:pointer";
    d.title = "Click to remove this annotation";
    d.onclick = ()=>{ TR.hl.splice(+d.dataset.i, 1); trHlSave(); trPaintAllHls(); };
    box.appendChild(d);
  });
}
function trPaintAllHls(){
  document.querySelectorAll(".tr-page").forEach(el=>{ if(el.dataset.painted) trPaintHls(+el.dataset.page, el); });
}
function trPenPanel(on){
  const p = $("trPen"); if(!p) return;
  const show = on === undefined ? p.classList.contains("hidden") : !!on;
  p.classList.toggle("hidden", !show);
  TR.hlOn = show;
  $("trPenTop")?.classList.toggle("active", show);
  if(show) trMsg("Select text and release to highlight; click a highlight to delete it");
}
function trPenInit(){
  $("trColors").innerHTML = TR_COLORS.map((c,i)=>`<i data-c="${c}" class="${i===0?"on":""}" style="background:${c}"></i>`).join("");
  $("trColors").onclick = (e)=>{ const i = e.target.closest("i[data-c]"); if(!i) return;
    TR.hlColor = i.dataset.c;
    $("trColors").querySelectorAll("i").forEach(x=>x.classList.toggle("on", x===i)); };
  const w = $("trWidth"); w.value = TR.hlWidth;
  w.oninput = ()=>{ TR.hlWidth = +w.value; };
}
function trHlOnMouseUp(e){
  if(!TR.hlOn) return;
  const sel = window.getSelection();
  if(!sel || sel.isCollapsed) return;
  const pageEl = e.target.closest?.(".tr-page")
    || (sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest?.(".tr-page"))
    || (sel.focusNode && (sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement)?.closest?.(".tr-page"));
  if(!pageEl || !pageEl.dataset.painted) return;
  const pr = pageEl.getBoundingClientRect();
  const rects = [...sel.getRangeAt(0).getClientRects()].filter(r=>r.width > 3 && r.height > 3)
    .sort((a, b)=> a.top - b.top || a.left - b.left);
  if(!rects.length) return;
  /* the text layer is per-word spans, so one line yields many rects: merge by line */
  const rows = [];
  rects.forEach(r=>{
    const last = rows[rows.length - 1];
    if(last && Math.abs(r.top - last.top) < last.height * 0.6){
      last.left = Math.min(last.left, r.left);
      last.right = Math.max(last.right, r.right);
    } else rows.push({left: r.left, top: r.top, right: r.right, height: r.height});
  });
  const n = +pageEl.dataset.page;
  const th = TR.hlWidth;
  const txt = (sel.toString() || "").replace(/\s+/g, " ").trim().slice(0, 400);   // Which characters were circled -> the expert uses them
  rows.forEach((r, i)=>{
    TR.hl.push({p:n, x:Math.round(r.left - pr.left), y:Math.round(r.top - pr.top + r.height/2 - th/2),
                w:Math.round(r.right - r.left), th, c:TR.hlColor, sw:Math.round(pr.width),
                t: i === 0 ? txt : ""});   // text records on the first line only; sw = page width at markup time
  });
  trHlSave(); trPaintHls(n, pageEl); sel.removeAllRanges();
  trMsg(`${TR.hl.length} annotations - the expert on the right can see them, so just ask`);
}

/* ---------------- Chinese-English translation (BabelDOC background task) ---------------- */
async function trTranslate(){
  if(!TR.pid) return trMsg("Add a PDF first");
  if(TR.job && TR.job.state === "running") return;
  const b = $("trBtnZh");
  trSegActive("zh");
  if(b){ b.disabled = true; }
  trMsg("Starting translation... (each paper is translated once, then opens instantly)");
  TR.busyOff = 0;
  trBusy(true, "Translating", "Detecting layout, the first paper takes about ten seconds...");
  try{
    const r = await api("/api/trans/start", {id: TR.pid, task_id: trTask(), pages: TR.testPages || ""});
    if(r.error) throw new Error(r.error);
    TR.job = r;
    if(r.state === "done" || r.cached){ if(b) b.disabled = false; trBusy(false); trMsg("Chinese translation opened (already translated, using it)"); return trShowZh(r.pages_done || 0); }
    trStartPoll();
  }catch(e){ trBusy(false); trMsg("Translation start failed:" + e.message); if(b) b.disabled = false; }
}
function trStartPoll(){
  trStopPoll();
  const lbl = (t, off)=>{ const zb = $("trBtnZh"); if(zb){ zb.textContent = t || "Chinese"; zb.disabled = !!off; } };
  TR.poll = setInterval(async ()=>{
    try{
      const s = await api(`/api/trans/status?id=${encodeURIComponent(TR.pid)}&task=${encodeURIComponent(trTask() || "")}`);
      TR.job = s;
      if(!$("trInfo")?.classList.contains("hidden")) trInfoFill();   // refresh progress while the info panel is open
      if(s.state === "running" || s.state === "partial"){
        const el = Math.round((Date.now() - (TR.t0 || (TR.t0 = Date.now()))) / 1000);
        lbl("Translating...", true);
        const done = s.pages_done || 0;
        trMsg(`${s.msg || "Translating"} Used ${Math.floor(el/60)}m ${el%60}s (${TR.pages||"Whole paper"} pages take about ten minutes; do something else meanwhile)`);
        trBusy(true, "Translating", `${s.msg || "Translating"} translated ${done}/${s.total_pages || TR.pages || "?"} pages · Used ${Math.floor(el/60)}m ${el%60}s`);
        if(done > 0 && done !== TR.prog){          // read each finished batch in the translation pane first
          TR.prog = done;
          if(TR.view === "dual") trShowDual(done); else trShowZh(done);   // fill the right pane in place, do not yank the user back
          trMsg(`Pages 1-${done} of ${s.total_pages||TR.pages||"?"} done, still going...`);
        }
        if(s.state === "partial"){                 // if later steps fail, keep what was already translated
          trStopPoll(); TR.t0 = 0; lbl("Chinese", false);
          trMsg(`Go to page ${done} page interrupted: ${s.msg || ""} (Finished pages are kept. Log: ${s.log || ""})`);
          trBusy(true, "Translation interrupted", `Failed at page ${done}: ${s.msg || ""}` + (s.log ? `\nLog: ${s.log}` : ""), true);
        }
      }
      if(s.state === "done"){ trStopPoll(); TR.t0 = 0; lbl("Chinese", false); trBusy(false); if(TR.view === "dual") trShowDual(s.pages_done || 0); else trShowZh(s.pages_done || 0); }
      if(s.state === "error"){ trStopPoll(); TR.t0 = 0; lbl("Chinese", false);
                              trMsg("Translation failed:" + (s.msg||"") + (s.log ? ` (Log: ${s.log})` : ""));
                              trBusy(true, "Translation failed", (s.msg || "") + (s.log ? `\nLog: ${s.log}` : ""), true); }
    }catch(_){}
  }, 2500);
}
function trStopPoll(){ if(TR.poll){ clearInterval(TR.poll); TR.poll = 0; } }

function trMonoUrl(v){
  return `/api/trans/file?id=${encodeURIComponent(TR.pid)}&task=${encodeURIComponent(trTask()||"")}&kind=mono&v=${v||0}`;
}
/* ---------------- view switch: English / side-by-side / Chinese ---------------- */
function trSegActive(v){
  /* one place decides the three-button selected state */
  $("trBtnEn")?.classList.toggle("active", v === "read");
  $("trBtnDual")?.classList.toggle("active", v === "dual");
  $("trBtnZh")?.classList.toggle("active", v === "zh");
}
function trView(v){
  /* the view only tracks empty/non-empty, single/double column, and control visibility */
  TR.view = v;
  $("trDrop")?.classList.toggle("hidden", v !== "empty");
  $("trSeg")?.classList.toggle("hidden", v === "empty");
  const st = $("trStage");
  st?.classList.toggle("dual", v === "dual");
  if(v === "dual"){
    TR.active = TR.active || "a";
    st?.style.setProperty("--split", (TR.split || 50).toFixed(2) + "%");
    trSplitBind(); trFocus(TR.active);
  }else{
    TR.active = "a";
    $("trPaneA")?.classList.remove("tr-focus");
    $("trPaneB")?.classList.remove("tr-focus");
    const b = trScrollEl("b"); if(b) b.innerHTML = "";
  }
}

/* ---------------- Top-left +: jump straight into this project's literature to pick a paper ---------------- */
async function trOpenPicker(){
  if(!trTask()) return trMsg("Select a project first - papers live in the project's literature library");
  const d = document.createElement("dialog");
  d.className = "modal";
  d.innerHTML = `
    <div class="modal-mask"></div>
    <div class="modal-dialog" style="width:540px">
      <div class="modal-head"><h3>Project literature</h3><button class="modal-close" data-x>✕</button></div>
      <div class="modal-body"><p class="modal-text">Reading the library...</p></div>
      <div class="modal-foot">
        <span class="tr-phint" data-n></span>
        <button class="btn ghost" data-up>+ Add PDF...</button>
      </div>
    </div>`;
  const close = ()=>{ d.close(); d.remove(); };
  d.querySelector("[data-x]").onclick = close;
  d.querySelector(".modal-mask").onclick = close;
  d.querySelector("[data-up]").onclick = ()=>{ close(); $("trFile").click(); };
  document.body.appendChild(d); d.showModal();      // Draw the frame first so a slow list does not look unresponsive
  let list = [], err = "";
  try{ list = (await api(`/api/task?id=${encodeURIComponent(trTask())}`)).paper_list || []; }
  catch(e){ err = e.message; }
  if(!d.isConnected) return;                        // it was closed while waiting
  const rows = list.map(p=>`
    <button class="tr-prow${p.id === TR.pid ? " on" : ""}" data-id="${esc(p.id)}" title="${esc(p.filename)}">
      <span class="tr-pn">${esc(p.filename)}</span>
      <span class="tr-pm">${p.pages ? p.pages + " pages" : ""}</span>
    </button>`).join("");
  d.querySelector(".modal-body").innerHTML = err ? `<p class="modal-text">Failed to read the literature library: ${esc(err)}</p>`
    : rows ? `<div class="tr-plist">${rows}</div>`
           : `<p class="modal-text">This project's literature library is empty - click "Add PDF" below and it ingests once picked.</p>`;
  d.querySelector("[data-n]").textContent = `${list.length} papers`;
  d.querySelectorAll("[data-id]").forEach(b => b.onclick = ()=>{ close(); trOpen(b.dataset.id); });
}

/* ---------------- translating: one layer in the middle of the screen (vanishes when done) ---------------- */
function trBusy(show, title, sub, closable){
  let d = $("trBusy");
  if(!show){ if(d){ d.close(); d.remove(); } return; }
  if(!closable && TR.busyOff) return;                 // Once "run in background" is clicked, stop popping up on screen
  if(!d){
    d = document.createElement("dialog");
    d.className = "modal"; d.id = "trBusy";
    d.innerHTML = `<div class="modal-mask tr-mask-soft"></div>
      <div class="modal-dialog tr-busy-card" style="width:340px">
        <div class="tr-busy"><span class="tr-ring" id="trBusyRing"></span><b id="trBusyT">Translating</b></div>
        <div class="tr-busy-s" id="trBusyS"></div>
        <button class="btn" id="trBusyX">Run in background</button>
      </div>`;
    document.body.appendChild(d); d.showModal();
  }
  $("trBusyT").textContent = title || "Translating";
  $("trBusyS").textContent = sub || "";
  $("trBusyRing").classList.toggle("hidden", !!closable);      // Failure state: stop spinning
  $("trBusyX").textContent = closable ? "Got it" : "Run in background";
  $("trBusyX").onclick = ()=>{ if(!closable) TR.busyOff = 1; trBusy(false); };
}

function trBind(){
  const inFile = $("trFile");
  $("trAdd").onclick = trOpenPicker;
  inFile.onchange = (e)=>{ trUpload(e.target.files); e.target.value = ""; };
  $("trIn").onclick = ()=>trZoom(+0.15);
  $("trOut").onclick = ()=>trZoom(-0.15);
  $("trPenTop").onclick = ()=>trPenPanel();
  $("trBtnEn").onclick = ()=>{ if(!TR.pid) return trMsg("Add a PDF first"); trSegActive("read"); trReader(TR.pid); };
  $("trBtnZh").onclick = ()=>trTranslate();
  $("trBtnDual").onclick = ()=>{ if(!TR.pid) return trMsg("Add a PDF first"); trSegActive("dual"); trShowDual(); };
  $("trStripMore").onclick = ()=>$("trDetail")?.classList.toggle("hidden");
  $("trInfoBtn").onclick = (e)=>{ e.stopPropagation(); trInfoToggle(); };
  trPenInit(); trZoomLabel();
  if(!TR.hlBound){ TR.hlBound = 1;
    document.addEventListener("mouseup", (e)=>{ if($("trStage")?.contains(e.target)) trHlOnMouseUp(e); });
    document.addEventListener("keydown", (e)=>{ if(e.key === "Escape"){ trPenPanel(false); trInfoToggle(false); trExitFull(); } });
    document.addEventListener("pointerdown", (e)=>{
      if(!e.target.closest?.("#trInfo") && !e.target.closest?.("#trInfoBtn")) trInfoToggle(false);
      if(TR.view !== "dual") return;
      if(e.target.closest?.("#trPaneB")) trFocus("b");
      else if(e.target.closest?.("#trPaneA")) trFocus("a");
    }, true);
  }
  // drop anywhere on the page
  const st = $("trStage"); let depth = 0;
  ["dragenter","dragover"].forEach(t=>st.addEventListener(t,(e)=>{ e.preventDefault(); e.stopPropagation();
    if(t==="dragenter") depth++; st.classList.add("dragging"); }));
  ["dragleave","drop"].forEach(t=>st.addEventListener(t,(e)=>{ e.preventDefault(); e.stopPropagation();
    if(t==="drop"){ depth = 0; st.classList.remove("dragging"); trUpload(e.dataTransfer?.files); }
    else if(--depth <= 0){ depth = 0; st.classList.remove("dragging"); } }));
  st.addEventListener("drop",(e)=>{ e.preventDefault(); trUpload(e.dataTransfer?.files); });
  $("trZenTop").onclick = () => trZen();
  $("trZenExit").onclick = () => trExitFull();
  $("trZenIn").onclick = () => trZoom(0.15);
  $("trZenOut").onclick = () => trZoom(-0.15);
  // otherwise browser zoom skews the PDF text layer, which is absolutely positioned
  $("trStage").addEventListener("wheel",(e)=>{ if(e.ctrlKey) e.preventDefault(); },{passive:false});
}



/* ---------------- embedded toolbox: mounts into a container, project from the toolbox ---------------- */
function trMountPanel(host, project){
  if(!host) return;
  TR.task = project || "";
  host.innerHTML = trPanelHTML(true);
  trBind();
  if(!TR.pid || TR.mountProject !== (TR.task || "")){
    /* Switching projects switches the literature library: old papers must not carry over */
    TR.mountProject = TR.task || "";
    TR.pid = ""; TR.meta = null; TR.job = null;
    trStopPoll(); trBusy(false); trView("empty"); trSegActive("read"); trStrip();
    const m = $("trMsg"); if(m) m.textContent = trTask() ? "" : "Pick a project at the top left - the PDF goes into that project's library";
  }else{
    trOpen(TR.pid);                                 // switch away and back: same paper
  }
}
function trUnmount(){
  trStopPoll(); trBusy(false); trInfoToggle(false);
}
window.PaperTranslation = { mount: trMountPanel, unmount: trUnmount };
