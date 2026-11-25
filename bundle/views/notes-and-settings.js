// delegated handler for opening a Zotero PDF
document.addEventListener("click", async (e)=>{
  const b = e.target.closest(".zot-open-pdf");
  if(!b) return;
  const key = b.dataset.zotPdf;
  const old = b.textContent;
  try {
    b.disabled = true; b.textContent = "Opening...";
    const r = await api(`/api/zotero/open_pdf?key=${encodeURIComponent(key)}`);
    if(r.error) throw new Error(r.error);
    if(typeof uiNotify === "function") uiNotify("PDF opened in the local reader");
  } catch(err) {
    if(typeof uiNotify === "function") uiNotify("Open failed:" + err.message);
  } finally {
    b.disabled = false; b.textContent = old;
  }
});
function markdownNoteClean(html){
  return (window.DOMPurify && window.marked)
    ? window.DOMPurify.sanitize(html, {ADD_TAGS:["mark","math","semantics","annotation","mrow","mi","mo","mn","msup","msub","mfrac","mspace","mtext"],
        ADD_ATTR:["align","style","target","rel","encoding","xmlns","aria-hidden"]})
    : html;
}
function renderMarkdown(value){
  const source = String(value||"");
  if(!window.marked || !window.marked.parse) return esc(source).replace(/\n/g,"<br />");
  const previousSlots=markdownMathSlots;
  markdownMathSlots=[];
  try{
    const root=document.createElement("div");
    root.innerHTML=markdownNoteClean(window.marked.parse(source));
    root.querySelectorAll('a[href]').forEach(anchor=>{
      const href=anchor.getAttribute('href');
      if(!URL.canParse(href,location.href))return;
      const url=new URL(href,location.href);
      if(['http:','https:'].includes(url.protocol)&&url.origin!==location.origin){
        anchor.target='_blank';anchor.relList.add('noopener','noreferrer');
      }
    });
    root.querySelectorAll("[data-rw-math]").forEach(node=>{
      const math=markdownMathSlots[Number(node.dataset.rwMath)];
      node.removeAttribute("data-rw-math");
      if(!math) return;
      if(!window.katex){ node.textContent=math.text; return; }
      window.katex.render(math.text,node,{displayMode:math.display,throwOnError:false,
        trust:false,maxExpand:1000,maxSize:20,output:"htmlAndMathml"});
    });
    return root.innerHTML;
  }
  catch(e){ return esc(source).replace(/\n/g,"<br />"); }
  finally{ markdownMathSlots=previousSlots; }
}
function mdActive(){ return mdNotes.find(n=>n.id===mdActiveId) || null; }
const mdTaskName = (id)=> (S.tasks||[]).find(t=>t.id===id)?.title || "";
function mdPaintList(){
  const box=$("mdNoteList"); if(!box) return;
  const q = ($("mdNoteSearch")?.value||"").trim().toLowerCase();
  const list = mdNotes.filter(n=>!q || `${n.title} ${n.content}`.toLowerCase().includes(q));
  box.innerHTML = list.length ? list.map(n=>`<div class="md-note-item${n.id===mdActiveId?" active":""}" data-md-note="${n.id}">
      <b>${esc(n.title||"Untitled note")}</b>${n.task_id?`<em class="md-bind">📁 ${esc(mdTaskName(n.task_id)||"Project bound")}</em>`:""}<span>${fmtDate(n.updated_at)}</span></div>`).join("")
    : `<div class="hint" style="padding:8px">No matching notes</div>`;
}
function mdPaintPreview(){ const p=$("mdPreview"); if(p) p.innerHTML = renderMarkdown($("mdSource")?.value||""); }
function mdPaint(){
  mdPaintList();
  const note = mdActive();
  [$("mdTask"), $("btnMdFocus"), $("btnMdNarrow"), $("btnMdFocusOut"), $("btnMdDelete")]
    .forEach(el => { if(el) el.style.display = ""; });   // Restore these when coming back from project notes (mdPaintProj hid them)
  $("mdEmpty").classList.toggle("hidden", !!note);
  $("mdEditorShell").classList.toggle("hidden", !note);
  if(!note) return;
  $("mdNoteTitle").readOnly = false;
  $("mdSource").readOnly = false;
  $("mdToolbar").querySelectorAll("[data-md-command]").forEach(el => { el.disabled = false; });
  $("mdNoteTitle").value = note.title || "Untitled note";
  $("mdSource").value = note.content || "";
  mdPaintTaskSel(note);                              // "bind project" dropdown (empty = none)
  $("mdSaveState").textContent = "";
  mdPaintPreview();
}
function mdPaintTaskSel(note){
  const sel = $("mdTask"); if(!sel) return;
  const html = `<option value="">No project</option>` +
    (S.tasks||[]).map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join("");
  if(sel.dataset.sig !== html){ sel.innerHTML = html; sel.dataset.sig = html; }   // Rebuild only when the project list changes so an open dropdown is not closed
  sel.value = note.task_id || "";
}
function mdFocus(on, silent){
  /* focus mode: left column and toolbar hidden, body becomes one centered column (quick notes while reading).
     Left nav collapses on entry; Esc / "Exit focus" brings it back. */
  mdFocusOn = !!on;
  const v = $("mdView"); if(!v) return;
  const ws = $("mdWorkspace");
  if(mdFocusOn){
    mdFocusPrev = (ws?.className||"").replace("md-workspace","").trim() || "split";
    if(ws) ws.className = "md-workspace write";
    if(!sidebarCollapsed){ sidebarCollapsed = true; localStorage.setItem("rw-sidebar","true"); renderSidebar(); }
  }else{
    if(ws) ws.className = "md-workspace " + mdFocusPrev;
    $("mdToolbar")?.querySelectorAll("[data-md-mode]").forEach(x=>x.classList.toggle("active", x.dataset.mdMode===mdFocusPrev));
  }
  v.classList.toggle("focus", mdFocusOn);
  if(!silent) localStorage.setItem("rw-md-focus", mdFocusOn ? "true" : "false");
}
async function mdNarrow(){
  /* Narrow pane = one blank sheet filling the window: the server pins the window to the right edge and the page keeps only the note name and exit. */
  mdNarrowOn = !mdNarrowOn;
  const b = $("btnMdNarrow");
  try{
    await winCommand(mdNarrowOn ? "narrow" : "wide");
    $("mdView")?.classList.toggle("narrow", mdNarrowOn);
    document.body.classList.toggle("md-narrow", mdNarrowOn);
    if(b) b.textContent = mdNarrowOn ? "▯ Fill" : "▯ Narrow column";
  }catch(e){ mdNarrowOn = !mdNarrowOn; mdFail(e, "Collapse"); }        // on failure put the status back, no lying
}
function mdFail(e, what){
  // most likely after an update with a stale server: say so, do not fail silently
  const hint = /not found|404/i.test(e?.message||"") ? "(the server is still on the old version; restart scholarOS once)" : "";
  console.error("Note action failed:", what, e);
  uiNotify(`${what} failed: ${e.message}${hint}`);
}
async function mdLoad(){
  try{
    const d = await api("/api/mdnotes");
    mdNotes = d.notes||[]; mdLoaded = true;
  }catch(e){ mdNotes = []; mdLoaded = true; mdFail(e, "Read note"); }
  if(mdActiveId && !mdActive()) mdActiveId = null;
  if(!mdActiveId && mdNotes.length) mdActiveId = mdNotes[0].id;
  mdPaint();
}
async function mdNew(title="Untitled note", content="", focusSource=false){
  try{
    if(mdActive()) await mdSave();
    const d = await api("/api/mdnotes/save",{title, content});
    mdNotes.unshift(d.note); mdActiveId = d.note.id;
    mdPaint();
    setTimeout(()=> (focusSource ? $("mdSource") : $("mdNoteTitle"))?.focus(), 30);
  }catch(e){ mdFail(e, "New note"); }
}
async function mdSave(){
  clearTimeout(mdSaveTimer);
  if(mdProj) return mdSaveProj();
  const note = mdActive(); if(!note) return;
  const title = $("mdNoteTitle").value.trim() || "Untitled note";
  const content = $("mdSource").value;
  const task_id = ($("mdTask")?.value) || "";
  $("mdSaveState").textContent = "Saving...";
  try{
    const d = await api("/api/mdnotes/save",{id:note.id, title, content, task_id});
    Object.assign(note, d.note);
    $("mdSaveState").textContent = "Saved";
    mdPaintList();
  }catch(e){ $("mdSaveState").textContent = "Save failed"; $("mdSaveState").title = e.message; console.error("Note autosave failed:", e); }
}
function mdScheduleSave(){
  if(mdProj?.read_only) return;
  if(mdProj){                                        // project notes: same 650 ms debounce, written to the project's .md
    mdProj.title = $("mdNoteTitle").value.trim();
    mdProj.content = $("mdSource").value;
    mdProj.editVersion = (mdProj.editVersion || 0) + 1;
    $("mdSaveState").textContent = "Unsaved";
    mdPaintPreview();
    const note = mdProj;
    clearTimeout(mdSaveTimer); mdSaveTimer = setTimeout(() => { if(mdProj === note) mdSaveProj(); }, 650);
    return;
  }
  const note = mdActive(); if(!note) return;
  note.title = $("mdNoteTitle").value.trim() || "Untitled note";
  note.content = $("mdSource").value;
  note.task_id = ($("mdTask")?.value) || "";         // bound project (empty = none)
  $("mdSaveState").textContent = "Unsaved";
  mdPaintPreview();
  clearTimeout(mdSaveTimer);
  mdSaveTimer = setTimeout(mdSave, 650);
}
function mdInsert(before, after="", placeholder=""){
  const ta=$("mdSource"), s=ta.selectionStart, e=ta.selectionEnd;
  ta.setRangeText(before + (ta.value.slice(s,e)||placeholder) + after, s, e, "end");
  ta.focus(); mdScheduleSave();
}
function mdPrefixLines(prefix, ordered=false){
  const ta=$("mdSource");
  const start = ta.value.lastIndexOf("\n", ta.selectionStart-1)+1;
  const nextNl = ta.value.indexOf("\n", ta.selectionEnd);
  const end = nextNl<0 ? ta.value.length : nextNl;
  const lines = ta.value.slice(start,end).split("\n");
  ta.setRangeText(lines.map((l,i)=>(ordered?`${i+1}. `:prefix)+l.replace(/^(?:#{1,6}|[-*>]|\d+[.])\s+/,"")).join("\n"), start, end, "select");
  ta.focus(); mdScheduleSave();
}
function mdCmd(command, value=""){
  if(!$("mdSource") || $("mdSource").readOnly) return;
  if(command==="heading") return mdPrefixLines(value?"#".repeat(Number(value))+" ":"");
  if(command==="bold") return mdInsert("**","**","Bold text");
  if(command==="italic") return mdInsert("*","*","Italic text");
  if(command==="highlight") return mdInsert("<mark>","</mark>","Highlight");
  if(command==="align"&&value) return mdInsert(`<div align="${value}">\n`,"\n</div>","Align");
  if(command==="font"&&value) return mdInsert(`<span style="font-family: ${value}">`,"</span>","Text");
  if(command==="size"&&value) return mdInsert(`<span style="font-size: ${value}">`,"</span>","Text");
  if(command==="ul") return mdPrefixLines("- ");
  if(command==="ol") return mdPrefixLines("", true);
  if(command==="quote") return mdPrefixLines("> ");
  if(command==="link") return mdInsert("[","](https://)","Link text");
  if(command==="code") return mdInsert("```text\n","\n```","Type code here");
  if(command==="formula") return mdInsert("$$\n","\n$$","E = mc^2");
  if(command==="table") return mdInsert("","","| Col 1 | Col 2 | Col 3 |\n| --- | --- | --- |\n| Content | Content | Content |");
}
async function mdImport(files){
  if(mdDashReadOnly && (uiRouteIs("space") || route()==="notes")) return;
  const input=[...(files||[])], list=input.filter(f=>/\.(?:md|markdown)$/i.test(f.name));
  if(!list.length) return uiNotify("Select .md or .markdown files (notes read only Markdown)");
  if(mdProj || spTab === "notes"){
    const targetFolder = (mdProj && mdProj.folder) || mdDashSelectedFolder || "Notes/Literature close-reading notes";
    let n = 0;
    for(const f of list.slice(0, 50)){
      if(f.size > 5*1024*1024) continue;
      try{
        const content = (await f.text()).replace(/^\uFEFF/,"");
        const title = f.name.replace(/\.(?:md|markdown)$/i,"") || "Import notes";
        const safe = title.replace(/[\\/:*?"<>|]/g,"_").slice(0,100);
        const rel = `${targetFolder}/${safe}.md`;
        await api("/api/project/note/save", {project_id: mdDashProject, path: rel, title, content, create:true,
          ...(!/^---\s*\r?\n/.test(content)&&window.Notebook&&!Notebook.fileMode?{metadata:Notebook.metadataForNew(targetFolder)}:{})});
        n++;
      }catch(e){ uiNotify(`Cannot import "${f.name}": ${e.message}`); }
    }
    if(n){
      uiNotify(`Imported ${n} notes into ${targetFolder}`);
      mdDashLoad();
    }
    return;
  }
  let n=0;
  for(const f of list.slice(0,50)){
    if(f.size > 5*1024*1024) continue;
    try{
      const content=(await f.text()).replace(/^\uFEFF/,"");
      await mdNew(f.name.replace(/\.(?:md|markdown)$/i,"")||"Import notes", content, true); n++;
    }catch(e){ uiNotify(`Cannot read "${f.name}": ${e.message}`); }
  }
  if(n) $("mdSaveState").textContent = `Imported ${n}`;
}
async function mdExport(fmt){
  const note = mdProj ? {title: $("mdNoteTitle").value.trim() || "Untitled note", content: $("mdSource").value}
                      : mdActive();
  if(!note) return;
  await mdSave();
  if(mdProj && fmt!=="pdf" && mdProj.saved_content) note.content=mdProj.saved_content;
  if(fmt==="pdf"){                                   // use browser print → save as PDF
    const w = window.open("", "_blank");
    if(!w) return uiNotify("The browser blocked the print window");
    w.document.write(`<title>${esc(note.title)}</title><link rel="stylesheet" href="../vendor/katex/katex.min.css">
<link rel="stylesheet" href="../vendor/starmap.css">`
      + `<style>body{font:14px/1.75 "Inter",sans-serif;padding:32px;max-width:860px;margin:auto}`
      + `pre{background:#202124;color:#f4f5f7;padding:12px;border-radius:6px;overflow:auto}`
      + `table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 9px}`
      + `blockquote{border-left:3px solid #888;margin:.8em 0;padding:.25em 1em;color:#444}</style>`
      + `<body>${renderMarkdown(note.content)}</body>`);
    w.document.close(); setTimeout(()=>{ w.focus(); w.print(); }, 350);
    return;
  }
  const blob = new Blob([note.content||""], {type:"text/markdown;charset=utf-8"});
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href=url; a.download = `${note.title||"note"}.md`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function mdBind(m){
  if(!$("mdNoteList")) return;
  $("btnMdNew").onclick = ()=>mdNew();
  $("btnMdImport").onclick = ()=>$("mdFileInput").click();
  $("mdFileInput").onchange = (e)=>{ mdImport(e.target.files); e.target.value=""; };
  $("mdNoteSearch").oninput = mdPaintList;
  $("btnMdZotero").onclick = zotOpen;
  $("mdNoteList").onclick = (e)=>{
    const it = e.target.closest("[data-md-note]");
    if(!it || it.dataset.mdNote===mdActiveId) return;
    mdSave().then(()=>{ mdActiveId = it.dataset.mdNote; mdPaint(); });
  };
  $("mdSource").oninput = mdScheduleSave;
  $("mdNoteTitle").oninput = mdScheduleSave;
  $("mdTask").onchange = ()=>{ const b=$("mdTask"); const n=mdActive(); if(!n) return;
    n.task_id = b.value; mdPaintList(); mdSave(); };      // Changing the binding persists immediately; the pills in the list follow
  $("mdToolbar").onclick = (e)=>{
    const b = e.target.closest("button[data-md-command]");
    if(b) mdCmd(b.dataset.mdCommand, b.value);
    const mode = e.target.closest("[data-md-mode]");
    if(mode){
      $("mdToolbar").querySelectorAll("[data-md-mode]").forEach(x=>x.classList.toggle("active", x===mode));
      $("mdWorkspace").className = "md-workspace " + mode.dataset.mdMode;
    }
  };
  $("mdToolbar").onchange = (e)=>{
    const sel = e.target.closest("select[data-md-command]"); if(!sel) return;
    mdCmd(sel.dataset.mdCommand, sel.value); sel.value = "";
  };
  $("btnMdExport").onclick = ()=>mdExport("md");
  $("btnMdPdf").onclick = ()=>mdExport("pdf");
  $("btnMdFocus").onclick = ()=>mdFocus(true);
  $("btnMdFocusOut").onclick = ()=>{ if(mdNarrowOn) mdNarrow(); mdFocus(false); };   // Exiting from the narrow column = leave focus + go back to fill
  $("btnMdNarrow").onclick = ()=>mdNarrow();
  $("btnMdDelete").onclick = async ()=>{
    const note = mdActive();
    if(!note || !await uiConfirm(`Delete note "${note.title}"?`)) return;
    await api("/api/mdnotes/delete",{id:note.id});
    mdNotes = mdNotes.filter(x=>x.id!==note.id);
    mdActiveId = mdNotes[0]?.id || null;
    mdPaint();
  };
  const zone = $("mdDropZone");
  ["dragenter","dragover"].forEach(t=>zone.addEventListener(t,(e)=>{ e.preventDefault(); e.stopPropagation(); zone.classList.add("dragging"); }));
  ["dragleave","drop"].forEach(t=>zone.addEventListener(t,(e)=>{ e.preventDefault(); e.stopPropagation(); zone.classList.remove("dragging"); }));
  zone.addEventListener("drop",(e)=>mdImport(e.dataTransfer.files));
  const root = $("mdView");
  ["dragenter","dragover"].forEach(t=>root.addEventListener(t,(e)=>{
    if(![...(e.dataTransfer?.files||[])].some(f=>/\.(?:md|markdown)$/i.test(f.name))) return;
    e.preventDefault(); e.stopPropagation(); root.classList.add("md-view-dragging");
  }));
  ["dragleave","drop"].forEach(t=>root.addEventListener(t,(e)=>{
    if(t==="drop"){ e.preventDefault(); e.stopPropagation(); mdImport(e.dataTransfer.files); }
    root.classList.remove("md-view-dragging");
  }));
}
/* ---------------- Zotero attached (read-only; local Local API 127.0.0.1:23119) ----------------
   does not read zotero.sqlite, No write-back, no background sync. Fetched entries go through the existing new-note flow, so nothing changes up front. */
let zotRows = [], zotStart = 0, zotMore = false, zotSelectedKeys = new Set();
const zotSub = (it)=>[ (it.creators||[]).slice(0,3).join(", "), it.year, it.venue ].filter(Boolean).join(" · ");
function zotRowHTML(it){
  const badge = it.type === "note" ? `<em class="md-bind" style="background:#4ade8022;color:#4ade80">📝 Notes</em>`
              : (it.doi ? `<em class="md-bind" style="background:#60a5fa22;color:#60a5fa" title="DOI: ${esc(it.doi)}">DOI</em>` : "");
  const venue = it.venue ? `<span style="font-size:11px;background:var(--bg-sub);color:var(--muted);padding:1px 6px;border-radius:4px">${esc(it.venue)}</span>` : "";
  const tags = (it.tags || []).slice(0, 4).map(t => `<span class="pill sm" style="font-size:10.5px">#${esc(t)}</span>`).join(" ");
  const checked = zotSelectedKeys.has(it.key) ? "checked" : "";
  return `<div class="zot-row-card" data-zot-key="${esc(it.key)}" style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--card)">
      <input type="checkbox" class="zot-cb" data-zot-cb="${esc(it.key)}" ${checked} style="margin-top:4px;cursor:pointer">
      <div style="flex:1;min-width:0;cursor:pointer" data-zot-select="${esc(it.key)}">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <b style="font-size:13.5px;color:var(--fg)">${esc(it.title || "(Untitled)")}</b>
          ${badge} ${venue}
        </div>
        <div style="color:var(--muted);font-size:12px;margin:3px 0">${esc(zotSub(it))}</div>
        ${it.abstract ? `<div style="color:var(--muted);font-size:11.5px;line-height:1.4;max-height:2.8em;overflow:hidden;opacity:0.85">${esc(it.abstract)}</div>` : ""}
        ${tags ? `<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${tags}</div>` : ""}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
        <button class="btn sm ghost zot-open-pdf" data-zot-pdf="${esc(it.key)}" title="Open the local copy in the system reader PDF" style="padding:2px 8px;font-size:11.5px;white-space:nowrap;color:var(--accent)">📄 OpenPDF</button>
        <button class="btn sm ghost zot-single-note" data-zot-note="${esc(it.key)}" title="Save the reference and its annotations as one local note" style="padding:2px 8px;font-size:11.5px;white-space:nowrap">Save as note</button>
      </div>
  </div>`;
}
function zotClose(){ uiCloseModal($("zoteroModal")); }
async function zotOpen(){
  const box = $("zoteroModal"); if(!box) return;
  uiOpenModal(box, $("zotQuery"));
  $("zotStatus").textContent = "Connecting to the local Zotero library...";
  $("zotList").innerHTML = ""; $("zotCount").textContent = ""; $("zotCollection").innerHTML = "";
  zotSelectedKeys.clear();
  if($("zotSelectAll")) $("zotSelectAll").checked = false;
  try{
    const st = await api("/api/zotero/status");
    $("zotStatus").textContent = st.message || "";
    if(!st.readable) return;                       // not running or too old: show the local status, do not fake a connection
    const cols = await api("/api/zotero/collections");
    $("zotCollection").innerHTML = `<option value="">Whole library (by modified)</option>` +
      (cols.collections || []).map(c=>`<option value="${esc(c.key)}">${esc(c.name)} (${c.count})</option>`).join("");
    await zotLoad(true);
  }catch(e){ $("zotStatus").textContent = "Zotero read failed:" + e.message; }
}
window.zotOpen = zotOpen;
async function zotLoad(reset){
  if(reset){
    zotStart = 0;
    if($("zotSelectAll")) $("zotSelectAll").checked = false;
  }
  const qs = new URLSearchParams({ collection: $("zotCollection").value,
    q: $("zotQuery").value.trim(), start: String(zotStart), limit: "30" });
  const d = await api("/api/zotero/items?" + qs.toString());
  zotRows = reset ? (d.items || []) : zotRows.concat(d.items || []);
  zotMore = !!d.hasMore; zotStart = zotRows.length;
  $("zotCount").textContent = (d.total != null) ? (zotRows.length + "/" + d.total + " items") : (zotRows.length + " items");
  $("zotList").innerHTML = zotRows.length
    ? zotRows.map(zotRowHTML).join("") + (zotMore ? `<button class="btn ghost" id="zotMore" style="margin:8px">Load more</button>` : "")
    : `<div class="hint" style="padding:8px">No matching entries</div>`;
  const more = $("zotMore"); if(more) more.onclick = ()=>zotLoad(false).catch(e=>mdFail(e,"Load more"));
}
async function zotImport(key){
  try{
    const d = await api("/api/zotero/note?key=" + encodeURIComponent(key));
    zotClose();
    await mdNew(d.title || "Zotero items", d.content || "", true);   // reuse the existing create flow
  }catch(e){ mdFail(e, "Import Zotero items"); }
}
function zotBind(){
  const box = $("zoteroModal"); if(!box) return;
  box.querySelector(".modal-mask").onclick = zotClose;
  $("btnZotClose").onclick = zotClose;
  function updateZotSelectCount(){
    const n = zotSelectedKeys.size;
    const btn = $("zotToProject");
    if(btn){
      btn.textContent = n > 0 ? `Add the ${n} selected to the project` : "Add selected literature to project";
      btn.disabled = !n;
    }
  }
  const selAll = $("zotSelectAll");
  if(selAll){
    selAll.onchange = (e)=>{
      const on = e.target.checked;
      zotRows.forEach(r => { if(on) zotSelectedKeys.add(r.key); else zotSelectedKeys.delete(r.key); });
      box.querySelectorAll(".zot-cb").forEach(cb => { cb.checked = on; });
      updateZotSelectCount();
    };
  }
  $("zotCollection").onchange = ()=>zotLoad(true).catch(e=>mdFail(e,"Read entry"));
  $("zotSearch").onclick = ()=>zotLoad(true).catch(e=>mdFail(e,"Search"));
  $("zotQuery").onkeydown = (e)=>{ if(e.key === "Enter") zotLoad(true).catch(err=>mdFail(err,"Search")); };
  $("zotToProject").onclick = async ()=>{
    if(!curTask) return uiNotify("Pick or create a project at the top before importing");
    const btn = $("zotToProject"); btn.disabled = true;
    $("zotStatus").textContent = "Importing references and resolving local PDF attachments...";
    const selKeys = Array.from(zotSelectedKeys);
    if(!selKeys.length) return updateZotSelectCount();
    const body = {task_id: curTask, keys: selKeys};
    try{
      const d = await api("/api/workflow/zotero", body);
      $("zotStatus").textContent = `✓ Imported ${d.total} records (${d.downloaded} papers ingested, PDFs ready). The knowledge star map has been updated!`;
      try{
        await api("/api/task/papergraph/build", {id: curTask});
        const fr = document.getElementById("kbFrame");
        if(fr) fr.src = "/kb.html?theme=" + (document.documentElement.dataset.theme||"dark") + "&rebuild=1";
      }catch(_){}
      await refreshState(false);
      if(uiRouteIs("space") || route() === "library") render();
    }catch(e){ $("zotStatus").textContent = "Import failed:" + e.message; }
    finally{ btn.disabled = false; updateZotSelectCount(); }
  };
  $("zotList").onclick = (e)=>{
    if(e.target.closest("#zotMore")) return;
    const noteBtn = e.target.closest("[data-zot-note]");
    if(noteBtn){
      e.stopPropagation();
      return zotImport(noteBtn.dataset.zotNote);
    }
    const cb = e.target.closest("[data-zot-cb]");
    if(cb){
      const k = cb.dataset.zotCb;
      if(cb.checked) zotSelectedKeys.add(k); else zotSelectedKeys.delete(k);
      updateZotSelectCount();
      return;
    }
    const itemRow = e.target.closest("[data-zot-select]");
    if(itemRow){
      const k = itemRow.dataset.zotSelect;
      const targetCb = itemRow.parentElement.querySelector(`[data-zot-cb="${k}"]`);
      if(targetCb){
        targetCb.checked = !targetCb.checked;
        if(targetCb.checked) zotSelectedKeys.add(k); else zotSelectedKeys.delete(k);
        updateZotSelectCount();
      }
    }
  };
}
zotBind();

/* ---------------- scheduled tasks: rules and runs, only while the app is open ---------------- */
let schRows = [], schRuns = [], schFreq = {}, schRunStatus = {}, schRetryable = [], schEdit = null, schFeedback = "";
const SCH_PRESETS = {manual:"", hourly:"0 * * * *", daily:"0 9 * * *", weekdays:"0 9 * * 1-5", weekly:"0 9 * * 1"};

function schFreqLabel(k){ return schFreq[k] || k; }
function schStatusPill(s){ return `<span class="pill ${s==="completed"?"ok":(s==="running"?"":"warn")}">${esc(schRunStatus[s]||s)}</span>`; }
function schWhen(iso){ return iso ? fmtDate(iso) : "-"; }
function schEditSeed(row){
  return { id: row?.id||"", name: row?.name||"Daily research digest", prompt: row?.prompt||"Write a verifiable research summary from the project's latest papers and notes.",
    project_id: row?.project_id||curTask||"", assistant_id: row?.assistant_id||"", workflow_id: row?.workflow_id||"", frequency: row?.frequency||"daily", cron: row?.cron||"0 9 * * *",
    output_dir: row?.output_dir||"Scheduled task", todo_id:row?.todo_id||"", enabled: row ? !!row.enabled : true };
}
function schEditorHTML(){
  if(!schEdit) return "";
  const e = schEdit;
  const projOpts = `<option value="">Unbound (runs are blocked)</option>` +
    (S.tasks||[]).map(t=>`<option value="${t.id}" ${t.id===e.project_id?"selected":""}>${esc(t.title)}</option>`).join("");
  const assistantOpts = `<option value="builtin-scheduler" ${!e.assistant_id||e.assistant_id==='builtin-scheduler'?"selected":""}>Scheduled-task expert (default)</option>` +
    (S.assistants||[]).filter(a=>a.enabled&&!(["builtin-steward","builtin-scheduler"].includes(a.id))).map(a=>`<option value="${esc(a.id)}" ${a.id===e.assistant_id?"selected":""}>${esc(a.name)}</option>`).join("");
  const freqOpts = Object.keys(schFreq).length ? Object.keys(schFreq) : Object.keys(SCH_PRESETS);
  return `<div class="card" style="margin-top:12px"><div class="sch-head">
    <div><p class="sch-eyebrow">${e.id?"EDIT SCHEDULE":"NEW SCHEDULE"}</p>
      <h3>${e.id?"Edit scheduled task":"New scheduled task"}</h3></div>
    <span class="pill">Built-in default 09:00 · Local time zone</span>
    <button class="btn ghost" id="schCancel">Cancel</button></div>
    <div class="sch-grid">
      <label><span>Task name</span><input id="schName" value="${esc(e.name)}"></label>
      <label><span>Frequency</span><select id="schFreq">${freqOpts.map(k=>`<option value="${k}" ${k===e.frequency?"selected":""}>${esc(schFreqLabel(k))}</option>`).join("")}</select></label>
      <label><span>Cron (min hour day month weeks)</span><input id="schCron" value="${esc(e.cron)}" style="font-family:ui-monospace,Consolas,monospace"></label>
      <label><span>Project</span><select id="schProj">${projOpts}</select></label>
       <label><span>Executing expert</span><select id="schAssistant">${assistantOpts}</select></label>
       <label><span>LangGraph flow (optional)</span><select id="schWorkflow"><option value="">Run the selected experts only</option></select></label>
       <label><span>Link a project to-do (optional)</span><select id="schTodo"><option value="">Loading...</option></select></label>
      <label><span>Output folder (relative to the project)</span><input id="schOut" value="${esc(e.output_dir)}"></label>
      <label><span>Enable</span><select id="schOn"><option value="1" ${e.enabled?"selected":""}>Enabled</option><option value="0" ${e.enabled?"":"selected"}>Paused</option></select></label>
      <label class="full"><span>Task goal (the workflow picks team, expert, tools, and skills per node)</span><textarea id="schPrompt">${esc(e.prompt)}</textarea></label>
    </div>
    <div class="hint" style="margin-top:10px">The output folder is relative to the project and checked again before each save and run: absolute paths, drive letters,<code>..</code>, hidden folders (e.g. <code>.obsidian</code>)are refused.</div>
    <div class="pf-actions" style="margin-top:12px"><button class="btn ghost" id="schCancel2">Cancel</button><button class="btn" id="schSave">${e.id?"Update task":"Save task"}</button></div></div>`;
}
function schCardHTML(r){
  const next = r.enabled ? (r.next_run_at ? fmtDate(r.next_run_at) : "Unscheduled") : "Paused";
  return `<div class="sch-card ${r.enabled?"":"off"}" data-schedule-id="${esc(r.id)}">
    <div class="ic">⏰</div>
    <div class="main"><div class="nmrow"><span class="nm">${esc(r.name)}</span>
      <span class="pill ${r.enabled?"ok":"warn"}">${r.enabled?"Enabled":"Paused"}</span>
      <span class="pill">${esc(schFreqLabel(r.frequency))} · ${esc(r.cron)}</span></div>
       <div class="ln">${r.project_id?esc(schTaskName(r.project_id)||"Project bound"):"No project bound"} · ${r.workflow_id?'LangGraph Flow':esc((S.assistants||[]).find(a=>a.id===r.assistant_id)?.name||"No expert bound")} · Output ${esc(r.output_dir)}</div>
      <div class="ln">${esc((r.prompt||"").replace(/\s+/g," ").slice(0,110))}</div>
      <div class="ln">Next ${esc(next)} · Recent ${esc(r.last_run_at?fmtDate(r.last_run_at):"Not run yet")}</div></div>
    <div class="acts">
      <button class="btn ghost" data-sch-run="${r.id}" title="Run once now">▶ Run now</button>
      <button class="btn ghost" data-sch-toggle="${r.id}" data-on="${r.enabled?1:0}">${r.enabled?"⏸ Pause":"✓ Enable"}</button>
      <button class="btn ghost" data-sch-edit="${r.id}">✎ Edit</button>
      <button class="btn ghost" data-sch-del="${r.id}" style="color:var(--err)">🗑 Archive</button></div></div>`;
}
function schRunHTML(e){
  const retry = schRetryable.includes(e.status);
  return `<div class="sch-run">
    <span class="nm">${esc(e.name)}</span>${schStatusPill(e.status)}
    <span class="pill">${e.trigger==="manual"?"Run manually":(e.trigger==="catchup"?"Catch-up on start":"Run on schedule")}</span>
    <span class="tm">${esc(schWhen(e.started_at))}${e.ended_at?` → ${esc(fmtDate(e.ended_at).slice(-5))}`:""}</span>
    <div class="acts">
      ${retry?`<button class="btn ghost" data-run-retry="${e.schedule_id}">Retry</button>`:""}
      ${e.project_task_id?`<button class="btn ghost" data-run-task="${esc(e.project_task_id)}" data-run-project="${esc(e.project_id)}">View tasks and reviews</button>`:e.workflow_run_id?`<button class="btn ghost" data-run-workflow="${esc(e.workflow_run_id)}" data-run-project="${esc(e.project_id||schRows.find(s=>s.id===e.schedule_id)?.project_id||'')}">View flow and reviews</button>`:''}
      ${e.note_id && e.note_path?`<button class="btn ghost" data-run-note="${esc(e.note_id)}" data-note-project="${esc(e.note_project_id)}" data-note-path="${esc(e.note_path)}">Open note</button>`:""}
      <button class="btn ghost" data-run-del="${e.id}">Delete</button></div>
    ${e.reason?`<div class="det">Blocked/Reason: ${esc(e.reason)}</div>`:""}
    ${e.summary?`<div class="det">Abstract: ${esc(e.summary)}</div>`:""}
    <div class="det">Output: ${e.output_path?esc(e.output_path):"Not generated"}</div></div>`;
}
async function schLoad(keepMsg){
  const d = await api("/api/schedules");
  schRows = d.schedules||[]; schRuns = d.runs||[]; schFreq = d.freq||{};
  schRunStatus = d.run_status||{}; schRetryable = d.retryable||[];
  if(!keepMsg) schFeedback = "";
}
async function renderSchedules(m, options={}){
  const live=()=>m.isConnected&&(options.live?options.live():route()==='schedules');
  const refresh=()=>{if(live())return renderSchedules(m,options);};
  m.style.padding = "";
  m.innerHTML = `<div class="muted">Reading scheduled tasks...</div>`;
  try{ await schLoad(true); }
  catch(e){ m.innerHTML = `<div class="msg error">Read failed: ${esc(e.message)}</div>`; return; }
  if(!live()) return;
  const visibleRows=schRows.filter(row=>!options.projectId||row.project_id===options.projectId);
  const visibleRuns=schRuns.filter(row=>!options.projectId||schRows.some(rule=>rule.id===row.schedule_id&&rule.project_id===options.projectId));
  if(options.projectId&&schEdit&&schEdit.project_id!==options.projectId)schEdit=null;
  m.innerHTML = `
    <div class="card"><div class="sch-head">
      <div><h3>Automation rules</h3>
        <p>Creates project tasks on schedule; the result and the manual review share one task record. Only runs while the app is open.</p></div>
      <button class="btn" id="schNew">+ New scheduled task</button></div></div>
    ${schFeedback?`<div class="card" style="margin-top:10px"><span class="hint">${esc(schFeedback)}</span></div>`:""}
    ${schEditorHTML()}
    <section data-schedule-list><div data-schedule-search-anchor></div><div class="card" style="margin-top:12px">
      <div class="sch-head"><div><p class="sch-eyebrow">RUNTIME SCHEDULE</p><h3>Configured tasks</h3></div>
        <span class="pill">${visibleRows.length} tasks</span></div>
      ${visibleRows.length? visibleRows.map(schCardHTML).join("") : `<div class="hint" style="margin-top:10px">No scheduled tasks yet. Create a daily digest, a literature search, or a progress reminder, run by this app Agent Runs while the app is open.</div>`}
      <div class="sch-note">🕒 <span>Schedules depend on the app process; nothing runs while scholarOS is closed. On reopen a missed daily slot runs once at most, the rest wait for the next slot (pause any time/enabled).</span></div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="sch-head"><div><p class="sch-eyebrow">RUN HISTORY</p><h3>Recent runs</h3></div>
        <span class="pill">${visibleRuns.length} items</span>
        ${visibleRuns.length?`<button class="btn ghost" id="schRunsClear">Clear records</button>`:""}</div>
      ${visibleRuns.length? visibleRuns.map(schRunHTML).join("") : `<div class="hint" style="margin-top:10px">No scheduled runs yet; every trigger, catch-up, or manual run records its status, reason, and output path here.</div>`}
    </div></section>`;

  const nm = () => esc($("schName").value.trim() || "Untitled task");
  const bindEditor = ()=>{
    if(!schEdit) return;
    api('/api/workflow/layouts').then(data=>{
      const select=$('schWorkflow'); if(!select) return;
      select.innerHTML='<option value="">Run selected experts only</option>'+(data.layouts||[]).map(l=>`<option value="${esc(l.id)}" ${l.id===schEdit?.workflow_id?'selected':''}>${esc(l.name)}</option>`).join('');
      select.onchange=()=>{ $('schAssistant').disabled=!!select.value; };
      select.onchange();
    }).catch(error=>uiNotify(error.message));
    const selected = schEdit.todo_id;
    const loadTodos = async ()=>{
      const project = $("schProj").value, select = $("schTodo");
      select.disabled = true;
      try{
        const data = project ? await api("/api/todos?task_id="+encodeURIComponent(project)) : {todos:[]};
        if(!select.isConnected || $("schProj").value !== project) return;
        const rows = (data.todos||[]).filter(t=>t.id===selected || !t.execution || !["queued","running","review"].includes(t.execution.status));
        select.innerHTML = '<option value="">No to-do</option>' + rows.map(t=>`<option value="${esc(t.id)}" ${t.id===selected?"selected":""}>${esc(t.title)}</option>`).join("");
        select.disabled = !!selected;
      }catch(e){ select.innerHTML='<option value="">Read failed, select the project again</option>'; uiNotify(e.message); }
    };
    $("schProj").onchange = loadTodos;
    if(options.projectId)$("schProj").disabled=true;
    loadTodos();
    $("schCancel") && ($("schCancel").onclick = ()=>{ schEdit=null; refresh(); });
    $("schCancel2") && ($("schCancel2").onclick = ()=>{ schEdit=null; refresh(); });
    $("schFreq").onchange = (e)=>{ const k=e.target.value; const c=SCH_PRESETS[k]; if(c) $("schCron").value=c;
      schEdit.frequency=k; if(c) schEdit.cron=c; };
    $("schSave").onclick = async ()=>{
      const body = { id: schEdit.id, name: nm(), prompt: $("schPrompt").value.trim(),
         project_id: $("schProj").value, assistant_id: $("schAssistant").value, workflow_id:$("schWorkflow").value, todo_id:$("schTodo").value, frequency: $("schFreq").value, cron: $("schCron").value.trim(),
        output_dir: $("schOut").value.trim() || "Scheduled task", enabled: $("schOn").value === "1" };
      if(!body.prompt) return uiNotify("Prompt is required");
      try{ await api("/api/schedule/save", body); schEdit=null; await schLoad();
           schFeedback = "Scheduled task saved; it runs only while the app is open."; refresh(); }
      catch(e){ uiNotify("Save failed:" + e.message); }
    };
  };
  $("schNew").onclick = ()=>{ schEdit = schEditSeed(null); if(options.projectId)schEdit.project_id=options.projectId; refresh(); setTimeout(()=>$("schName")?.focus(),30); };
  bindEditor();
  m.querySelectorAll("[data-sch-edit]").forEach(b=>b.onclick=()=>{
    const r = schRows.find(x=>x.id===b.dataset.schEdit); schEdit = schEditSeed(r); refresh(); });
  m.querySelectorAll("[data-sch-toggle]").forEach(b=>b.onclick=async ()=>{
    try{ await api("/api/schedule/toggle", { id:b.dataset.schToggle, enabled: b.dataset.on !== "1" });
         schFeedback = "Scheduled task updated."; await schLoad(); refresh(); }
    catch(e){ uiNotify("Status update failed:" + e.message); } });
  m.querySelectorAll("[data-sch-del]").forEach(b=>b.onclick=async ()=>{
    const r = schRows.find(x=>x.id===b.dataset.schDel);
    if(!await uiConfirm(`Archive "${r?r.name:""}"? It will not run again automatically.`)) return;
    try{ await api("/api/schedule/delete", { id:b.dataset.schDel }); schFeedback = "Scheduled task archived.";
         await schLoad(); refresh(); }
    catch(e){ uiNotify("Archive failed:" + e.message); } });
  m.querySelectorAll("[data-sch-run]").forEach(b=>b.onclick=async ()=>{
    try{ await api("/api/schedule/run", { id:b.dataset.schRun }); schFeedback = "Scheduled task triggered now; it will appear in Recent runs when done.";
         refresh(); setTimeout(()=>{ if(live()) refresh(); }, 6000); }
    catch(e){ uiNotify("Trigger failed:" + e.message); } });
  m.querySelectorAll("[data-run-retry]").forEach(b=>b.onclick=async ()=>{
    try{ await api("/api/schedule/run", { id:b.dataset.runRetry }); schFeedback = "Retriggered once under that rule.";
         refresh(); setTimeout(()=>{ if(live()) refresh(); }, 6000); }
    catch(e){ uiNotify("Retry failed:" + e.message); } });
  m.querySelectorAll("[data-run-del]").forEach(b=>b.onclick=async ()=>{
    try{ await api("/api/schedule/run/delete", { ids:[b.dataset.runDel] }); await schLoad(); refresh(); }
    catch(e){ uiNotify("Failed to delete run record:" + e.message); } });
  m.querySelectorAll("[data-run-note]").forEach(b=>b.onclick=async()=>{
    await ConnectedResearch.openNote(b.dataset.noteProject,b.dataset.notePath);
  });
  m.querySelectorAll('[data-run-workflow]').forEach(b=>b.onclick=()=>AppNavigation.follow(()=>ConnectedResearch.openRun(b.dataset.runProject,b.dataset.runWorkflow)));
  m.querySelectorAll('[data-run-task]').forEach(b=>b.onclick=()=>AppNavigation.follow(()=>ProjectWorkspace.openTask(b.dataset.runTask,b.dataset.runProject,{peek:false})));
  $("schRunsClear") && ($("schRunsClear").onclick = async ()=>{
    if(!await uiConfirm(`Delete all ${visibleRuns.length} run records? Schedules and output files are untouched.`)) return;
    try{ await api("/api/schedule/run/delete", { ids: visibleRuns.map(x=>x.id) }); await schLoad(); refresh(); }
    catch(e){ uiNotify("Clear failed:" + e.message); } });
}
const schTaskName = (id)=> (S.tasks||[]).find(t=>t.id===id)?.title || "";

let spTab = "overview", spId = null;
const SP_TABS = [["overview","Overview"],["plan","Progress and plan"],["papers","Literature"],["stars","Paper star map"],["notes","Notes"]];
let spActiveNoteId = null;
let spSelectedNoteIds = new Set();
const esBadgeCache = new Map();

function spWhen(iso){ return iso ? fmtDate(iso) : "-"; }

function spBodyHTML(d){
  const t = d.task||{}, sum = d.summary||{};

  // ---------- 2. Literature and easyScholar journal partitions ----------
  if(spTab === "papers"){
    return ProjectLiterature.html();
  }

  // ---------- 3. paper star map ----------
  if(spTab === "stars"){
    const g = d.paper_graph||{}, nodes = g.nodes||[], total = (d.paper_list||[]).length;
    const built = g.built_at ? spWhen(g.built_at) : "";
    const meta = built ? `${built} · ${nodes.length} notes · ${(g.edges||[]).length} relations · in ${g.took_ms < 1000 ? (g.took_ms||0) + "ms" : ((g.took_ms||0)/1000).toFixed(1) + "s"}`
                       : (total ? `Scans all ${total} PDFs in the library for citations; it does not run by itself` : "This project has no literature yet");
    const btn = built ? `<button class="btn ghost" id="spStarGen">Regenerate</button>` : `<button class="btn" id="spStarGen">Generate star map</button>`;
    return `<div class="card" style="margin-top:12px">
      <div class="sp-stbar"><span class="sp-sttl">Paper star map</span><span class="pill${built?" ok":""}">${built?"Generated":"Not generated"}</span>
        <span class="sp-smeta">${esc(meta)}</span><span style="flex:1"></span>
        ${total || built ? btn : ""}</div>
      ${nodes.length ? `<div id="spStars" style="height:clamp(420px,70vh,760px)"></div>`
        : `<div class="sp-empty"><b>No star map yet</b>
            <span>${total ? `This step scans all ${total} PDFs in the library for citations and does not run automatically` : "Add papers to this project under ”Literature” or in the workflow's search step"}</span>
            ${total ? `<span class="hint">Click "Build star map" at the top right; it refreshes when done</span>` : ""}</div>`}</div>`;
  }

  // ---------- 4. Notes (project note category board + full Markdown split/focus editor) ----------
  if(spTab === "notes"){
    return `<div id="mdDashboard" class="md-dashboard pn sp-notes-dash" style="background:var(--panel);border:1px solid var(--line);border-radius:10px;min-height:520px">
      <div class="md-dash-head" style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <input id="mdDashSearch" class="pn-search" type="search" placeholder="🔍 Search notes in the current project..." style="flex:1;max-width:320px">
        <span style="flex:1"></span>
      </div>
      <div id="mdDashboardBody"></div>
    </div>
    <div class="md-view" id="mdView" style="display:none;min-height:520px">
      <aside class="md-note-side">
        <button class="btn ghost md-back-dash" id="mdBackDash" title="Back to project notes">← Back to project notes</button>
        <div class="md-note-side-head">
          <button class="btn" id="btnMdNew">+ New</button>
          <button class="btn ghost" id="btnMdImport">Import .md</button>
          <button class="btn ghost" id="btnMdZotero" title="from this machine Zotero Take papers or notes and build a single note">Zotero</button>
        </div>
        <input id="mdNoteSearch" class="ws-field-input" type="search" placeholder="Search notes" style="background:var(--panel);border:1px solid var(--line);border-radius:7px;padding:7px 9px;font-size:12.5px;color:inherit;font-family:inherit;outline:none">
        <div id="mdNoteList" class="md-note-list"></div>
        <div id="mdDropZone" class="md-drop-zone">Drag in Markdown File</div>
        <input type="file" id="mdFileInput" accept=".md,.markdown" multiple hidden>
      </aside>
      <div class="md-note-main">
        <div id="mdEmpty" class="md-empty">Create or import one Markdown Notes</div>
        <div id="mdEditorShell" class="md-editor-shell hidden">
          <div class="md-title-row">
            <input id="mdNoteTitle" class="md-note-title" maxlength="160" placeholder="Untitled note">
            <select id="mdTask" class="md-task-select" title="Bind to a project" style="display:none"><option value="">Current project</option></select>
            <span id="mdSaveState" class="md-save-state"></span>
            <button class="btn ghost" id="btnMdFocus" title="Focus mode: one long notepad column (Esc exit)">⛶ Focus</button>
            <button class="btn ghost" id="btnMdNarrow" title="Shrink the window to a right-edge strip (click to restore)">▯ Narrow bar</button>
            <button class="btn ghost" id="btnMdFocusOut" title="Exit focus mode (Esc)">Exit focus</button>
            <button class="btn ghost" id="btnMdExport">Export MD</button>
            <button class="btn ghost" id="btnMdPdf">Export PDF</button>
            <button class="btn ghost" id="btnMdDelete" title="Delete note">🗑</button>
          </div>
          <div class="md-toolbar" id="mdToolbar">
            <p class="md-focus-hint">Focus mode · Read and jot · Esc Exit</p>
            <select class="md-tool-select" data-md-command="heading" title="Heading level"><option value="">Body</option><option value="1">Title 1</option><option value="2">Title 2</option><option value="3">Title 3</option><option value="4">Title 4</option></select>
            <button class="md-tool-btn" data-md-command="bold" title="Bold"><b>B</b></button>
            <button class="md-tool-btn" data-md-command="italic" title="Italic"><i>I</i></button>
            <button class="md-tool-btn" data-md-command="highlight" title="Highlight">Highlight</button>
            <select class="md-tool-select" data-md-command="align" title="Alignment"><option value="">Align</option><option value="left">Align left</option><option value="center">Centre</option><option value="right">Align right</option></select>
            <select class="md-tool-select" data-md-command="font" title="Font"><option value="">Font</option><option value="Inter">Inter</option><option value="Georgia">Georgia</option><option value="JetBrains Mono">JetBrains Mono</option><option value="Times New Roman">Times New Roman</option></select>
            <select class="md-tool-select" data-md-command="size" title="Size"><option value="">Size</option><option value="12px">12</option><option value="14px">14</option><option value="16px">16</option><option value="18px">18</option><option value="24px">24</option><option value="32px">32</option></select>
            <span class="md-tool-sep"></span>
            <button class="md-tool-btn" data-md-command="ul" title="Bulleted list">• List</button>
            <button class="md-tool-btn" data-md-command="ol" title="Numbered list">1. List</button>
            <button class="md-tool-btn" data-md-command="quote" title="Cite">Cite</button>
            <button class="md-tool-btn" data-md-command="link" title="Insert link">Link</button>
            <button class="md-tool-btn" data-md-command="code" title="Insert code block">Code block</button>
            <button class="md-tool-btn" data-md-command="formula" title="Insert formula block">Formula</button>
            <button class="md-tool-btn" data-md-command="table" title="Insert table">Table</button>
            <span class="md-tool-spacer"></span>
            <div class="seg-tabs md-mode-tabs">
              <button class="seg-tab active" data-md-mode="split">Split view</button>
              <button class="seg-tab" data-md-mode="write">Edit</button>
              <button class="seg-tab" data-md-mode="preview">Preview</button>
            </div>
          </div>
          <div id="mdWorkspace" class="md-workspace split">
            <textarea id="mdSource" class="md-source" spellcheck="true" aria-label="Markdown Editor"></textarea>
            <article id="mdPreview" class="md-render md-preview"></article>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ---------- 5. Overview ----------
  const stages = (d.workflow?.nodes||[]).map(s=>({key:s.key, label:s.label, st:s.status}));
  const recent = (d.steps||[]).slice(0,6);
  return `
    <div class="sp-grid2" style="margin-top:12px">
      <div class="card sp-kpi"><p class="inst-label">RESEARCH</p><strong>${sum.papers||0}</strong>
        <p class="sp-kpi-note">Project literature · Evidence ${sum.evidence||0} items</p></div>
      <div class="card sp-kpi sp-kpi-text"><p class="inst-label">QUESTION</p><strong>${esc(t.question||"Research question not set")}</strong></div></div>
    <div class="card" style="margin-top:12px"><div class="sch-head"><div><p class="inst-label">WORKFLOW PIPELINE</p><h3>Project research flow</h3></div>
        <button class="btn ghost" id="spToFlow">Go to research desk →</button></div>
        <div class="sp-pipe">
          ${stages.map((s,i)=>`<button class="sp-pipe-cell ${s.st==="delivered"?"on":(s.st==="running"?"run":"")}" data-sp-flow="${esc(s.key)}"
              title="${esc(s.label)}: ${esc(({delivered:"Delivery accepted",succeeded:"Delivery pending",stale:"Output changed, confirm again",running:"Running",failed:"Failed",cancelled:"Stopped",waiting:"Waiting for upstream delivery",ready:"Ready to start"})[s.st]||"Not started")}">
            <b>${String(i+1).padStart(2,"0")}</b><span>${esc(s.label)}</span></button>`).join("")}
        </div>
        <div class="hint" style="margin-top:8px">Recent steps: ${recent.length?esc(recent.map(r=>r.stage).join(" → ")):"-"}</div></div>
    <div class="sp-grid2" style="margin-top:12px">
      <div class="card"><p class="inst-label">RELATIONSHIPS</p><h3 style="margin:0 0 8px">Project boundaries</h3>
        <div class="sp-kv"><span>Project location</span><b>${esc(t.base_dir||"Not set (output goes to the workspace default)")}</b></div>
        <div class="sp-kv"><span>Keywords / System</span><b>${esc(t.material_system||"-")}</b></div>
        <div class="sp-kv"><span>Last updated</span><b>${esc(spWhen(t.updated_at))}</b></div>
        <div class="pf-actions" style="margin-top:10px"><button class="btn ghost" id="spDel" style="color:var(--err)">Delete project record</button></div></div>
      <div class="card"><div class="sch-head"><div><p class="inst-label">STEP LOG</p><h3>Step records</h3></div>
      <span class="pill">${(d.steps||[]).length} items</span></div>
      ${recent.length?recent.map(r=>`<div class="sp-row"><span class="sp-ic">•</span><div class="sp-main">
        <div class="sp-nm">${esc(r.stage)} · ${esc(r.status)}</div><div class="sp-meta">${esc(r.summary||"")} · ${esc(spWhen(r.created_at))}</div>
        </div></div>`).join(""):`<div class="hint" style="margin-top:10px">No step records yet.</div>`}</div>
    </div>`;
}
function spBind(d){
  const go = (id, route)=>{ const b=$(id); if(b) b.onclick = ()=>openTab(route); };
  go("spToFlow","workflow"); go("spToLib","library");
  document.querySelectorAll("[data-sp-flow]").forEach(b=>b.onclick=()=>openTab("workflow"));
  const sg = $("spStarGen");                 // the star map is compiled: it runs on demand and stores the result
  if(sg) sg.onclick = async ()=>{
    const t0 = Date.now();
    sg.disabled = true; sg.innerHTML = `<span class="spin"></span>Generating 0s`;
    const tick = setInterval(()=>{ sg.innerHTML = `<span class="spin"></span>Generating ${Math.round((Date.now()-t0)/1000)}s`; }, 500);
    try{ await api("/api/task/papergraph/build", {id: curTask}); }
    catch(e){ uiNotify("Generation failed:" + e.message); }
    finally{ clearInterval(tick); render(); }
  };
  const del = $("spDel");
  if(del) del.onclick = async ()=>{
    try { if (await ProjectManager.confirmDelete(d.task.id)) openTab("workspace"); }
    catch (error) { uiNotify(error.message); }
  };

  // ---------- easyScholar journal rank tags (literature page) ----------
  if(spTab === "papers"){
    ProjectLiterature.mount($('projectLiterature'),curTask,d.library_items||d.paper_list||[]);
  }

  // ---------- Notes: the full project dashboard + Editor ----------
  if(spTab === "notes"){
    mdBind(document.querySelector("#spBody"));
    mdDashProject = curTask;
    const loaded = mdDashLoad();
    let pnT = 0;
    const sInp = $("mdDashSearch");
    if(sInp) sInp.oninput = e => {
      mdDashQuery = e.target.value.trim().toLowerCase();
      clearTimeout(pnT);
      pnT = setTimeout(()=>{ mdDashLoad(); }, 180);
    };
    const backBtn = $("mdBackDash");
    if(backBtn) backBtn.onclick = pnBackToDash;
    return loaded;
  }
}

function spLoadPaperBadges(container){
    const badgeContainers = container.querySelectorAll(".es-badges[data-journal]");
    badgeContainers.forEach(async el => {
      const jname = el.dataset.journal;
      if(!jname) return;
      if(esBadgeCache.has(jname)){
        const cached = esBadgeCache.get(jname);
        if(cached.length) el.innerHTML = cached.map(b => `<span class="es-badge ${b.type}">${esc(b.label)}</span>`).join("");
        return;
      }
      try{
        const res = await api("/api/easyscholar/rank?journal=" + encodeURIComponent(jname));
        if(res && res.ok && res.badges){
          esBadgeCache.set(jname, res.badges);
          if(res.badges.length){
            el.innerHTML = res.badges.map(b => `<span class="es-badge ${b.type}">${esc(b.label)}</span>`).join("");
          }
        }
      }catch(_){}
    });
}

/* the overview tab reuses this page: KPIs, ten-step pipeline, scope, step records */
window.SpaceOverview = async function(projectId){
  spTab = "overview"; spId = projectId;
  const d = await api("/api/task?id=" + encodeURIComponent(projectId));
  return { html: spBodyHTML(d), bind: () => spBind(d) };
};

async function renderSpace(m){
  if(m.id==='main' && route()==='workspace') return ProjectWorkspace.render(m);
  m.style.padding = "";
  m.classList.remove("sp-fill");
  if(!curTask){ m.innerHTML = needTask(); return; }
  const project = curTask;
  if(spId !== curTask){ spId = curTask; spTab = "overview"; spActiveNoteId = null; spSelectedNoteIds.clear(); }
  m.innerHTML = `<div class="muted">Reading the project...</div>`;
  let d, lastErr;
  for(let attempt = 0; attempt < 3; attempt++){
    try{
      d = await api("/api/task?id=" + encodeURIComponent(project));
      lastErr = null;
      break;
    }catch(e){
      lastErr = e;
      if(/locked/i.test(e?.message||"") && attempt < 2){
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
      break;
    }
  }
  if(curTask !== project || !uiRouteIs("space") || !m.isConnected) return;
  if(!d || lastErr){ m.innerHTML = `<div class="msg error">Failed to read the project: ${esc(lastErr ? lastErr.message : "Unknown error")}</div>`; return; }
  const t = d.task||{};
  const opts = (S.tasks||[]).map(x=>`<option value="${x.id}" ${x.id===curTask?"selected":""}>${esc(x.title)}</option>`).join("");
  const isSpHeadCollapsed = localStorage.getItem("rw-sp-header-collapsed") === "true";
  m.innerHTML = `
    <div class="card sp-header-card ${isSpHeadCollapsed ? 'collapsed' : ''}" id="spHeaderCard">
      <div class="sp-hd1">
        <h3>${esc(t.title||"Project space")} <span class="pill ok" title="dedicated to this project agent">Partner Agent</span></h3>
        <span class="sp-step">Stage<b>${esc(t.stage_now||"Not started")}</b></span>
        <span class="sp-when">Update ${esc(spWhen(t.updated_at))}</span>
        <span class="sp-gap"></span>
        <button class="btn" id="spFlow">Open research desk →</button>
        <button class="btn ghost" id="spLeader">Ask the assistant →</button>
        <button class="btn ghost btn-sm" id="spRebuild" title="Register old notes, papers, and output in the unified asset index">Assets</button>
        <button type="button" class="btn ghost btn-sm sp-collapse-btn" id="spToggleHeader" title="Collapse the project card to free space">▲ Collapse overview</button>
        <span class="hint" id="spAssetStatus" aria-live="polite"></span>
      </div>
      <div class="sp-hd2">
        <p class="hint">Manages literature, notes, and progress in the current project; references stay consistent with the workflow.</p>
        <select id="spPick" class="control" style="max-width:200px" title="Choose a project space">${opts}</select>
      </div>
      <div class="sp-search-bar" style="margin-top:12px;position:relative;">
        <div style="position:relative;display:flex;gap:8px;align-items:center">
          <input id="spSearchInput" class="control" placeholder="Search literature, notes, evidence, and to-dos in the current project..." style="flex:1;padding-left:32px">
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);opacity:1;pointer-events:none">🔍</span>
          <button class="btn ghost" id="spSearchClear" style="display:none;padding:5px 10px;font-size:12px">Clear</button>
        </div>
        <div id="spSearchResults" class="card" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:90;max-height:460px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.18);border:1px solid var(--accent);background:var(--panel)"></div>
      </div>
    </div>
    <div class="sp-tabs" id="spTabs">
      ${SP_TABS.map(([k,l])=>`<button class="sp-tab ${k===spTab?"on":""}" data-sp-tab="${k}">${l}</button>`).join("")}
      <button type="button" class="sp-tab-header-toggle" id="spTabToggleHeader" title="${isSpHeadCollapsed ? 'Expand project overview' : 'Collapse project overview'}">
        ${isSpHeadCollapsed ? `▼ Expand project info · ${esc(t.title||"Project overview")}` : '▲ Collapse overview'}
      </button>
    </div>
    <div id="spBody"></div>`;

  $("spPick").onchange = (e)=>{ curTask = e.target.value; localStorage.setItem("rw-task", curTask); spId = spTab==='papers'?curTask:null; render(); };
  $("spFlow").onclick = ()=>openTab("workflow");
  const sl = $("spLeader"); if(sl) sl.onclick = ()=>openTab("agent");
  m.querySelectorAll("[data-sp-tab]").forEach(b=>b.onclick=()=>{ spTab = b.dataset.spTab; render(); });
  const toggleSpHeader = () => {
    const cur = localStorage.getItem("rw-sp-header-collapsed") === "true";
    localStorage.setItem("rw-sp-header-collapsed", (!cur).toString());
    render();
  };
  const btnToggleSpHead = $("spToggleHeader");
  if(btnToggleSpHead) btnToggleSpHead.onclick = toggleSpHeader;
  const btnTabToggle = $("spTabToggleHeader");
  if(btnTabToggle) btnTabToggle.onclick = toggleSpHeader;
  $("spBody").innerHTML = spBodyHTML(d);
  if(spTab === "notes") m.classList.add("sp-fill");
  spBind(d);

  const assetStatus = $("spAssetStatus");
  const rebuild = $("spRebuild");
  const refreshAssetStatus = async () => {
    try {
      const stats = await api(`/api/assets/diagnostics?project_id=${encodeURIComponent(curTask)}`);
      if(assetStatus) assetStatus.textContent = `Assets ${stats.assets || 0} · Conflicts ${stats.conflicts || 0}`;
    } catch(_) {}
  };
  refreshAssetStatus();
  // the stage follows the steps; swap the pill only, stop when the page changes
  clearInterval(renderSpace._stageTick);
  renderSpace._stageTick = setInterval(async () => {
    const pill = document.querySelector(".sp-step b");
    if(!pill){ clearInterval(renderSpace._stageTick); return; }
    try{
      const dd = await api(`/api/task?id=${encodeURIComponent(curTask)}`);
      const now = (dd.task || {}).stage_now;
      if(now && now !== pill.textContent) pill.textContent = now;
    }catch(_){}
  }, 8000);
  if(rebuild) rebuild.onclick = async () => {
    rebuild.disabled = true;
    try {
      await api("/api/assets/rebuild", {method:"POST", project_id:curTask, include_files:true});
      toast("Asset index rebuilt", "success");
      await refreshAssetStatus();
    } catch(err) { toast(`Asset tidy failed: ${err.message}`, "error"); }
    finally { rebuild.disabled = false; }
  };

  const sInp = $("spSearchInput"), sClear = $("spSearchClear"), sRes = $("spSearchResults");
  let sTimer = null;
  if(sInp){
    sInp.oninput = () => {
      const q = sInp.value.trim();
      if(sClear) sClear.style.display = q ? "block" : "none";
      if(!q){ if(sRes){ sRes.style.display = "none"; sRes.innerHTML = ""; } return; }
      clearTimeout(sTimer);
      sTimer = setTimeout(async () => {
        try {
          const res = await api(`/api/space/search?task_id=${encodeURIComponent(curTask)}&q=${encodeURIComponent(q)}`);
          if(!sRes) return;
          sRes.style.display = "block";
          if(!res.total){
            sRes.innerHTML = `<div class="hint" style="padding:12px 6px">No literature, notes, or tasks found for "${esc(q)}".</div>`;
            return;
          }
          let h = `<div style="display:flex;justify-content:space-between;align-items:center;padding:0 0 8px;border-bottom:1px solid var(--line);margin-bottom:8px">
            <span class="inst-label" style="margin:0">SEARCH RESULTS · ${res.total} hits</span>
            <span class="hint">Press Esc or click outside to close</span></div>`;
          if(res.results.todos && res.results.todos.length){
            h += `<div style="margin-bottom:10px"><div style="font-weight:600;font-size:12px;color:var(--muted);margin-bottom:4px">To-dos (${res.results.todos.length})</div>`;
            h += res.results.todos.map(t => `<div class="sp-row" style="cursor:pointer" data-go-tab="todos"><span class="sp-ic">${t.status==='DONE'?'✅':'⏳'}</span><div class="sp-main"><div class="sp-nm">${esc(t.title)}</div><div class="sp-meta">${esc(t.status)} · ${esc(t.priority)} · ${esc(t.due_date||'No deadline')}</div></div></div>`).join("");
            h += `</div>`;
          }
          if(res.results.papers && res.results.papers.length){
            h += `<div style="margin-bottom:10px"><div style="font-weight:600;font-size:12px;color:var(--muted);margin-bottom:4px">Literature (${res.results.papers.length})</div>`;
            h += res.results.papers.map(p => `<div class="sp-row" style="cursor:pointer" data-go-tab="papers"><span class="sp-ic">📄</span><div class="sp-main"><div class="sp-nm">${esc(p.title||p.filename||'Untitled')}</div><div class="sp-meta">${esc(p.authors||'')} · DOI: ${esc(p.doi||'-')} · ${esc(p.year||'')}</div></div></div>`).join("");
            h += `</div>`;
          }
          if(res.results.notes && res.results.notes.length){
            h += `<div style="margin-bottom:10px"><div style="font-weight:600;font-size:12px;color:var(--muted);margin-bottom:4px">Notes (${res.results.notes.length})</div>`;
            h += res.results.notes.map(n => `<div class="sp-row" style="cursor:pointer" data-go-note="${esc(n.id)}"><span class="sp-ic">📝</span><div class="sp-main"><div class="sp-nm">${esc(n.title||'Untitled note')}</div><div class="sp-meta">${esc(n.updated_at||'')} · ${n.word_count||0} chars · ${esc(n.snippet||'')}</div></div></div>`).join("");
            h += `</div>`;
          }
          if(res.results.evidence && res.results.evidence.length){
            h += `<div><div style="font-weight:600;font-size:12px;color:var(--muted);margin-bottom:4px">Evidence (${res.results.evidence.length})</div>`;
            h += res.results.evidence.map(e => `<div class="sp-row"><span class="sp-ic">🔬</span><div class="sp-main"><div class="sp-nm">${esc(e.claim||'Evidence records')}</div><div class="sp-meta">${esc(e.quote||'')}</div></div></div>`).join("");
            h += `</div>`;
          }
          sRes.innerHTML = h;
          sRes.querySelectorAll("[data-go-tab]").forEach(el => {
            el.onclick = () => { spTab = el.dataset.goTab; sRes.style.display = "none"; render(); };
          });
          sRes.querySelectorAll("[data-go-note]").forEach(el => {
            el.onclick = () => { spTab = "notes"; spActiveNoteId = el.dataset.goNote; sRes.style.display = "none"; render(); };
          });
        } catch(err) {
          if(sRes){ sRes.style.display = "block"; sRes.innerHTML = `<div class="msg error">Search error: ${esc(err.message)}</div>`; }
        }
      }, 250);
    };
  }
  if(sClear){
    sClear.onclick = () => {
      sInp.value = ""; sClear.style.display = "none";
      if(sRes){ sRes.style.display = "none"; sRes.innerHTML = ""; }
    };
  }
  document.addEventListener("click", (evt) => {
    if(sRes && !sRes.contains(evt.target) && evt.target !== sInp){
      sRes.style.display = "none";
    }
  });

  if(spTab === "stars"){
    const host = $("spStars");
    const g = d.paper_graph || { nodes: [], edges: [], stats: {} };
    if(host && window.StarMap){
      host.__api = api; host.__toast = toast;
      StarMap.mount(host, g);
    }
    else if(host) host.innerHTML = `<div class="hint">The star map script did not load (/vendor/starmap.js).</div>`;
  }
}

let mdDashProject = "", mdDashSelectedFolder = "Notes/Literature close-reading notes", mdDashPath = "", mdDashQuery = "", mdDashMap = null;
let mdProj = null, mdDraft = false;      // Project note edit state: {pid, path, folder, title, content}
let mdDashLoadId = 0;
let mdDashTree = null;
let mdDashReadOnly = false;
let pnSideCollapsed = localStorage.getItem("rw-pn-side-collapsed") === "true";
const pnExpandedFolders = new Set(["Notes", "Notes/Literature close-reading notes"]);

function pnCountFiles(node){
  if(!node) return 0;
  if(node.type === "file") return 1;
  let c = 0;
  for(const ch of (node.children || [])){
    c += pnCountFiles(ch);
  }
  return c;
}

function pnFindNode(node, p){
  if(!node) return null;
  if(node.path === p) return node;
  for(const ch of (node.children || [])){
    if(ch.path === p) return ch;
    if(ch.type === "dir"){
      const f = pnFindNode(ch, p);
      if(f) return f;
    }
  }
  return null;
}

function pnCollectFiles(node, q = ""){
  if(!node) return [];
  let files = [];
  if(node.type === "file"){
    if(!q || (node.title||"").toLowerCase().includes(q) || (node.name||"").toLowerCase().includes(q)){
      files.push(node);
    }
  }else if(node.type === "dir"){
    for(const ch of (node.children || [])){
      files = files.concat(pnCollectFiles(ch, q));
    }
  }
  return files;
}

function pnNodeMatches(node, q){
  if(!q) return true;
  if(node.type === "file"){
    return (node.title || "").toLowerCase().includes(q) || (node.name || "").toLowerCase().includes(q);
  }
  return (node.name || "").toLowerCase().includes(q) || (node.children || []).some(ch => pnNodeMatches(ch, q));
}

function pnMapHit(file){
  const g = mdDashMap; if(!g || !(g.nodes||[]).length) return null;
  const norm = s => String(s||"").replace(/[\s·:: ,, .. () ()\[\][]\--_]/g,"").toLowerCase();
  const stem = String(file.path||"").split("/").pop().replace(/\.md$/i,"");
  const title = norm(file.title), id = norm(stem);
  for(const n of g.nodes){
    if(n.type === "section") continue;
    const ref = norm(String(n.ref||"").split("/").pop().replace(/\.md$/i,""));
    const lbl = norm(n.label);
    if(!((ref && (ref === id || ref === title)) || (lbl.length >= 4 && title && (title.includes(lbl) || lbl.includes(title))))) continue;
    const sec = (g.edges||[]).find(e => e.to === n.id && (g.nodes.find(x => x.id === e.from) || {}).type === "section");
    const host = sec && g.nodes.find(x => x.id === sec.from);
    return { label: n.label, section: host ? host.label : "" };
  }
  return null;
}

function pnJumpMap(){
  ProjectWorkspace.openStage(mdDashProject || curTask, 'map').catch(error => uiNotify(error.message));
}

function pnRenderTreeNode(node, depth = 0, q = ""){
  if(!node) return "";
  if(q && !pnNodeMatches(node, q)) return "";
  const isDir = node.type === "dir";
  const isRoot = node.path === "Notes";
  const expanded = q ? true : pnExpandedFolders.has(node.path);
  const isCurFolder = mdDashSelectedFolder === node.path;
  const isCurFile = mdDashPath === node.path;
  const count = isDir ? pnCountFiles(node) : 0;
  const hit = (!isDir && node.path) ? pnMapHit(node) : null;
  const indent = depth * 14;

  let html = "";
  if(!isRoot){
    const rowClass = ["pn-tree-row", (isDir ? (isCurFolder ? "on" : "") : (isCurFile ? "on" : ""))].filter(Boolean).join(" ");
    html += `<div class="${rowClass}" style="padding-left:${indent}px" data-tree-path="${esc(node.path)}" data-tree-type="${node.type}">
      ${isDir ? `<button class="pn-tree-toggle" data-tree-toggle="${esc(node.path)}" title="${expanded?'Collapse':'Expand'}">${expanded?'▼':'▶'}</button>` : `<span style="width:16px;display:inline-block"></span>`}
      <span class="pn-tree-icon">${isDir ? (expanded ? "📂" : "📁") : "📝"}</span>
      <span class="pn-tree-text" title="${esc(isDir ? node.name : (node.title || node.name))}">${esc(isDir ? node.name : (node.title || node.name))}</span>
      ${isDir ? `<span class="pn-tree-badge">${count}</span>` : ""}
      ${hit ? `<span class="pn-badge on" style="font-size:10px;padding:0 4px" title="Evidence chain map attached">attached</span>` : ""}
      <div class="pn-tree-acts">
        ${isDir ? `
          <button class="pn-tree-act" data-act="new-file" data-path="${esc(node.path)}" title="New note in this folder">+</button>
          <button class="pn-tree-act" data-act="new-folder" data-path="${esc(node.path)}" title="New subfolder here">📁+</button>
          <button class="pn-tree-act del" data-act="del-folder" data-path="${esc(node.path)}" title="Delete folder">🗑</button>
        ` : `
          <button class="pn-tree-act del" data-act="del-file" data-path="${esc(node.path)}" title="Delete note">🗑</button>
        `}
      </div>
    </div>`;
  }
  if(isDir && (expanded || isRoot) && node.children && node.children.length){
    html += `<div class="pn-tree-children">`;
    for(const child of node.children){
      html += pnRenderTreeNode(child, isRoot ? 0 : depth + 1, q);
    }
    html += `</div>`;
  }
  return html;
}

function pnSideHTML(tree, q){
  if(pnSideCollapsed){
    return `<aside class="pn-side collapsed">
      <button class="pn-side-expand" id="pnBtnExpandSide" title="Expand note list">
        <span>▶</span>
        <span class="pn-side-expand-txt">Note list</span>
      </button>
    </aside>`;
  }
  return `<aside class="pn-side">
    <div class="pn-side-header">
      <div class="pn-side-head-row">
        <b class="pn-side-title">📁 Note list</b>
        <button class="pn-side-collapse" id="pnBtnCollapseSide" title="Collapse sidebar">◀</button>
      </div>
      <div class="pn-side-btns">
        <button class="btn sm" id="pnBtnSideNewFile" title="New note in this folder">+ Notes</button>
        <button class="btn sm ghost" id="pnBtnSideNewFolder" title="New subfolder in this folder">📁+ Folder</button>
        <button class="btn sm ghost" id="pnBtnSideImport" title="Import Markdown File">Import</button>
        <input type="file" id="pnSideFileInput" accept=".md,.markdown" multiple hidden>
      </div>
    </div>
    <div class="pn-tree" id="pnTreeContainer">
      ${pnRenderTreeNode(tree, 0, q) || `<div class="hint" style="padding:16px 10px;text-align:center">${q ? "No matching notes" : "None Markdown Notes"}</div>`}
    </div>
  </aside>`;
}

function pnBreadcrumbHTML(curPath, isFile = false){
  const parts = (curPath || "Notes").split("/").filter(Boolean);
  let accumulated = "";
  const crumbs = parts.map((part, idx) => {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    const isLast = idx === parts.length - 1;
    if(isLast){
      return `<span class="pn-crumb-item cur">${esc(part)}</span>`;
    }
    return `<span class="pn-crumb-item" data-crumb-path="${esc(accumulated)}">${esc(part)}</span>`;
  });
  return `<div class="pn-crumb"><span class="pn-crumb-icon">${isFile ? "📝" : "📁"}</span>${crumbs.join('<span class="pn-crumb-sep">/</span>')}</div>`;
}

function pnFolderViewHTML(folderNode, q){
  if(q){
    const allFiles = pnCollectFiles(folderNode, q);
    return `<div class="pn-rows" style="padding:12px 14px">
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Search results · ${allFiles.length} notes</div>
      ${allFiles.length ? allFiles.map(f => {
        const hit = pnMapHit(f);
        return `<div class="pn-row" data-pn-file="${esc(f.path)}">
          <div class="pn-rt" title="${esc(f.title || f.name)}">${esc(f.title || f.name)}</div>
          <div class="pn-rm">
            <span style="color:var(--muted)">${esc(f.path)}</span>
            <span>${new Date(f.updated_at*1000).toLocaleDateString()}</span>
            ${hit ? `<span class="pn-badge on" data-pn-map="1" title="Attached to the evidence chain map">attached ${esc(hit.section||hit.label)}</span>` : ""}
          </div>
        </div>`;
      }).join("") : `<div class="hint" style="padding:40px;text-align:center">Nothing found for ”${esc(q)}”Matching notes</div>`}
    </div>`;
  }

  const subDirs = (folderNode.children || []).filter(c => c.type === "dir");
  const files = (folderNode.children || []).filter(c => c.type === "file");

  if(!subDirs.length && !files.length){
    return `<div style="padding:48px 20px;text-align:center;color:var(--muted)">
      <div style="font-size:28px;margin-bottom:10px">📂</div>
      <div>This folder is empty</div>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:center">
        <button class="btn sm" id="pnEmptyNewNote">+ New note</button>
        <button class="btn sm ghost" id="pnEmptyNewFolder">📁+ New folder</button>
      </div>
    </div>`;
  }

  let html = `<div style="overflow-y:auto;padding:12px 14px;flex:1">`;
  if(subDirs.length){
    html += `<div style="font-size:11.5px;font-weight:600;color:var(--muted);margin-bottom:8px">Subfolder (${subDirs.length})</div>
    <div class="pn-grid" style="padding:0;margin-bottom:18px">
      ${subDirs.map(d => `<div class="pn-card" data-card-folder="${esc(d.path)}">
        <div class="pn-card-h"><span style="font-size:18px">📁</span><span class="pn-card-title">${esc(d.name)}</span></div>
        <div class="pn-card-meta"><span>${pnCountFiles(d)} notes</span></div>
      </div>`).join("")}
    </div>`;
  }
  if(files.length){
    html += `<div style="font-size:11.5px;font-weight:600;color:var(--muted);margin-bottom:8px">Note list (${files.length})</div>
    <div class="pn-rows" style="padding:0">
      ${files.map(f => {
        const hit = pnMapHit(f);
        return `<div class="pn-row" data-pn-file="${esc(f.path)}">
          <div class="pn-rt" title="${esc(f.title || f.name)}">${esc(f.title || f.name)}</div>
          <div class="pn-rm">
            <span>${new Date(f.updated_at*1000).toLocaleDateString()}</span>
            <span>${(f.size/1024).toFixed(1)} KB</span>
            ${hit ? `<span class="pn-badge on" data-pn-map="1" title="Attached to the evidence chain map">attached ${esc(hit.section||hit.label)}</span>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>`;
  }
  html += `</div>`;
  return html;
}

function pnBindSideEvents(host){
  const side = host.querySelector(".pn-side");
  if(!side) return;

  const btnCollapse = side.querySelector("#pnBtnCollapseSide");
  if(btnCollapse) btnCollapse.onclick = () => {
    pnSideCollapsed = true;
    localStorage.setItem("rw-pn-side-collapsed", "true");
    mdDashLoad();
  };
  const btnExpand = side.querySelector("#pnBtnExpandSide");
  if(btnExpand) btnExpand.onclick = () => {
    pnSideCollapsed = false;
    localStorage.setItem("rw-pn-side-collapsed", "false");
    mdDashLoad();
  };

  const btnNewFile = side.querySelector("#pnBtnSideNewFile");
  if(btnNewFile) btnNewFile.onclick = () => pnNewNote();

  const btnNewFolder = side.querySelector("#pnBtnSideNewFolder");
  if(btnNewFolder) btnNewFolder.onclick = async () => {
    const parentFolder = mdDashSelectedFolder || "Notes";
    const name = await uiPrompt(`Create a subfolder in ${parentFolder}, enter a name:`);
    if(!name || !name.trim()) return;
    const safe = name.trim().replace(/[\\/:*?"<>|]/g,"_");
    const targetPath = `${parentFolder}/${safe}`;
    try{
      await api("/api/project/folder/create", {project_id: mdDashProject, path: targetPath});
      pnExpandedFolders.add(parentFolder);
      pnExpandedFolders.add(targetPath);
      mdDashSelectedFolder = targetPath;
      mdDashLoad();
    }catch(err){ uiNotify("Failed to create folder:" + err.message); }
  };

  const btnImport = side.querySelector("#pnBtnSideImport");
  const fileInp = side.querySelector("#pnSideFileInput");
  if(btnImport && fileInp){
    btnImport.onclick = () => fileInp.click();
    fileInp.onchange = (e) => {
      mdImport(e.target.files);
      e.target.value = "";
    };
  }

  // Toggle folder
  side.querySelectorAll("[data-tree-toggle]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const p = btn.dataset.treeToggle;
      if(pnExpandedFolders.has(p)) pnExpandedFolders.delete(p);
      else pnExpandedFolders.add(p);
      mdDashLoad();
    };
  });

  // Click tree row (folder or file)
  side.querySelectorAll("[data-tree-path]").forEach(row => {
    row.onclick = async (e) => {
      if(e.target.closest(".pn-tree-acts") || e.target.closest("[data-tree-toggle]")) return;
      const p = row.dataset.treePath;
      const type = row.dataset.treeType;
      if(type === "dir"){
        if(!await pnSaveCurrent()) return;
        mdProj = null; mdDraft = false; mdDashPath = "";
        mdDashSelectedFolder = p;
        pnExpandedFolders.add(p);
        mdDashLoad();
      }else if(type === "file"){
        if(!await pnSaveCurrent()) return;
        mdDashPath = p;
        mdProj = null; mdDraft = false;
        mdDashLoad();
      }
    };
  });

  // Tree action buttons
  side.querySelectorAll("[data-act]").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const act = btn.dataset.act;
      const targetPath = btn.dataset.path;
      if(act === "new-file"){
        await pnNewNote(targetPath);
      }else if(act === "new-folder"){
        const name = await uiPrompt(`Enter a name for the new subfolder under ${targetPath}:`);
        if(!name || !name.trim()) return;
        const safe = name.trim().replace(/[\\/:*?"<>|]/g,"_");
        const newFolder = `${targetPath}/${safe}`;
        try{
          await api("/api/project/folder/create", {project_id: mdDashProject, path: newFolder});
          pnExpandedFolders.add(targetPath);
          pnExpandedFolders.add(newFolder);
          mdDashSelectedFolder = newFolder;
          mdDashLoad();
        }catch(err){ uiNotify("Failed to create folder:" + err.message); }
      }else if(act === "del-folder"){
        if(targetPath === "Notes") return uiNotify("The notes root cannot be deleted");
        if(!await uiConfirm(`Delete the folder "${targetPath}" and all its contents?`, {ok:"Delete folder"})) return;
        try{
          await api("/api/project/note/delete", {project_id: mdDashProject, path: targetPath});
          pnExpandedFolders.delete(targetPath);
          if(mdDashSelectedFolder === targetPath || mdDashSelectedFolder.startsWith(targetPath + "/")){
            mdDashSelectedFolder = "Notes";
          }
          mdDashLoad();
        }catch(err){ uiNotify("Delete folder failed:" + err.message); }
      }else if(act === "del-file"){
        if(!await uiConfirm(`Delete the note "${targetPath}"?`, {ok:"Delete note"})) return;
        try{
          await api("/api/project/note/delete", {project_id: mdDashProject, path: targetPath});
          if(mdDashPath === targetPath){
            mdDashPath = ""; mdProj = null; mdDraft = false;
          }
          mdDashLoad();
        }catch(err){ uiNotify("Delete note failed:" + err.message); }
      }
    };
  });
}

function mdMountEditor(host){ const sh = $("mdEditorShell"); if(sh && host && sh.parentElement !== host) host.appendChild(sh); }

async function pnSaveCurrent(){
  const note = mdProj;
  if(!note) return true;
  while(mdProj === note){
    const version = note.editVersion || 0;
    if(!await mdSaveProj() || mdProj !== note) return false;
    if((note.editVersion || 0) === version) return true;
  }
  return false;
}

async function pnNewNote(folder = mdDashSelectedFolder || "Notes"){
  if(mdDashReadOnly) return;
  const pid = mdDashProject;
  if(!await pnSaveCurrent() || mdDashProject !== pid) return;
  if(!folder || !folder.startsWith("Notes")) folder = "Notes";
  mdDashSelectedFolder = folder;
  pnExpandedFolders.add(folder);
  mdProj = {pid, path: "", folder, title: "", content: "", metadata:window.Notebook&&!Notebook.fileMode?Notebook.metadataForNew(folder):undefined};
  mdDraft = true; mdDashPath = "";
  await mdDashLoad();
}

async function pnBackToDash(){
  if(!await pnSaveCurrent()) return;
  mdMountEditor(document.querySelector("#mdView .md-note-main"));
  $("mdView").style.display = "none";
  $("mdDashboard").style.display = "";
  mdDashPath = ""; mdDraft = false; mdProj = null;
  mdDashLoad();
}

async function mdSaveProj(){
  clearTimeout(mdSaveTimer);
  const note = mdProj, titleInput = $("mdNoteTitle"), source = $("mdSource");
  if(!note) return true;
  if(note.read_only) return true;
  if(!titleInput || !source) return false;
  const rawTitle = titleInput.value.trim();
  if(!note.path && !rawTitle && !source.value.trim()) return true;
  const title = rawTitle || "Untitled note";
  let content = source.value;
  if(!note.path){
    const folder = note.folder || mdDashSelectedFolder || "Notes/Literature close-reading notes";
    note.path = `${folder}/${crypto.randomUUID().replace(/-/g, "")}.md`;
    note.newFile = true;
    note.content_hash = "";
    if(!/^#\s/.test(content) && !/^---\s*\r?\n/.test(content) && note.metadata?.note_type!=="prompt_template") content = `# ${title}\n\n` + content;
  }else if(/^#\s/.test(content)){
    content = content.replace(/^#\s.*$/m, `# ${title}`);
  }
  if(content !== source.value) source.value = content;
  note.title = title; note.content = content;
  $("mdSaveState").textContent = "Saving...";
  const version = note.editVersion || 0;
  const metadata = note.metadata ? JSON.parse(JSON.stringify(note.metadata)) : undefined;
  const pending = (note.savePromise || Promise.resolve(true)).then(async ok => {
    if(!ok) return false;
    try{
      const data = await api("/api/project/note/save", {project_id: note.pid, path: note.path, title, content,
        metadata, create: !!note.newFile, ...(note.content_hash !== undefined ? {expected_hash: note.content_hash} : {})});
      note.content_hash = data.content_hash;
      note.saved_content = data.content;
      note.saved_title = title;
      note.savedVersion = version;
      if(note.metadata && data.template_id) note.metadata.template_id = data.template_id;
      note.newFile = false;
      if(mdProj === note && mdDashProject === note.pid){
        mdDashPath = note.path;
        mdDraft = false;
        if((note.editVersion || 0) === version){
          $("mdSaveState").textContent = "Saved";
          $("mdSaveState").title = "";
        }
      }
      return true;
    }catch(e){
      if(mdProj === note && mdDashProject === note.pid && $("mdSaveState")){
        $("mdSaveState").textContent = "Save failed";
        $("mdSaveState").title = e.message;
      }
      return false;
    }
  });
  note.savePromise = pending;
  try{
    return await pending;
  }finally{
    if(note.savePromise === pending) delete note.savePromise;
  }
}

function mdPaintProj(){
  const sh = $("mdEditorShell"); if(!sh) return;
  sh.classList.remove("hidden");
  $("mdNoteTitle").value = mdProj.title || "";
  $("mdSource").value = mdProj.content || "";
  $("mdNoteTitle").readOnly = !!mdProj.read_only;
  $("mdSource").readOnly = !!mdProj.read_only;
  $("mdToolbar").querySelectorAll("[data-md-command]").forEach(el => { el.disabled = !!mdProj.read_only; });
  mdPaintPreview();
  $("mdSaveState").textContent = "";
  [$("mdTask"), $("btnMdFocus"), $("btnMdNarrow"), $("btnMdFocusOut")]
    .forEach(el => { if(el) el.style.display = "none"; });
  const del = $("btnMdDelete");
  if(del){
    del.style.display = mdProj.read_only ? "none" : "";
    del.onclick = async () => {
      if(!await uiConfirm(`Delete note "${mdProj.title || mdProj.path}"? This cannot be undone.`, {ok:"Delete note"})) return;
      try{
        if(mdProj.path){
          await api("/api/project/note/delete", {project_id: mdProj.pid, path: mdProj.path});
        }
        mdProj = null; mdDraft = false; mdDashPath = "";
        mdDashLoad();
      }catch(e){
        uiNotify("Delete note failed:" + e.message);
      }
    };
  }
}

function pnApplyReadOnly(host){
  if(!mdDashReadOnly) return;
  host.querySelectorAll('[data-act], #pnBtnSideNewFile, #pnBtnSideNewFolder, #pnBtnSideImport, #mdDashNew, #mdDashNewFolder, #mdDashDelFolder, #pnEmptyNewNote, #pnEmptyNewFolder, #mdDashSave')
    .forEach(el => { el.disabled = true; });
  const notice = document.createElement("div");
  notice.className = "hint pn-readonly-hint";
  notice.style.padding = "8px 12px";
  notice.textContent = "Read-only project: read and export notes; edit in a standalone project folder.";
  host.prepend(notice);
}

async function mdDashLoad(){
  if(window.Notebook && !Notebook.fileMode) return Notebook.render();
    document.querySelector('.nb-note-properties')?.remove();
  const host = $("mdDashboardBody"); if(!host) return;
  const loadId = ++mdDashLoadId, pid = mdDashProject;
  const current = () => loadId === mdDashLoadId && mdDashProject === pid && host.isConnected;
  if(!mdDashProject){ host.innerHTML = `<div class="hint">Pick a project to browse its Markdown notes.</div>`; return; }
  try{
    const data = await api(`/api/project/notes?project_id=${encodeURIComponent(pid)}`);
    if(!current()) return;
    mdDashReadOnly = !!data.read_only;
    mdDashTree = data.tree || {type: "dir", name: "Notes", path: "Notes", children: []};

    if(!mdDashMap || mdDashMap.pid !== mdDashProject){
      const map = mdDashMap = { pid, nodes: [], edges: [] };
      api(`/api/map/state?id=${encodeURIComponent(pid)}`)
        .then(d => { if(mdDashMap === map && mdDashProject === pid){ map.nodes = d.nodes||[]; map.edges = d.edges||[]; if(!mdProj) mdDashLoad(); } })
        .catch(()=>{});
    }

    if(!mdDashSelectedFolder || !pnFindNode(mdDashTree, mdDashSelectedFolder)){
      const defaultFolder = pnFindNode(mdDashTree, "Notes/Literature close-reading notes") ? "Notes/Literature close-reading notes" : "Notes";
      mdDashSelectedFolder = defaultFolder;
    }
    pnExpandedFolders.add(mdDashSelectedFolder);

    const q = mdDashQuery.trim().toLowerCase();

    // 1. If currently editing a note or creating draft
    if(mdDashPath || mdDraft){
      if(!mdProj || mdProj.pid !== mdDashProject || (!mdDraft && mdProj.path !== mdDashPath)){
        const file = mdDashPath
          ? await api(`/api/project/note?project_id=${encodeURIComponent(mdDashProject)}&path=${encodeURIComponent(mdDashPath)}`)
          : {title: "", content: ""};
        if(!current()) return;
        mdProj = {pid, path: mdDashPath, folder: mdDashSelectedFolder, title: file.title || "", content: file.content || "", content_hash: file.content_hash, read_only: !!file.read_only};
        mdDraft = !mdDashPath;
      }
      const hit = mdProj.path ? pnMapHit({path: mdProj.path, title: mdProj.title}) : null;
      mdMountEditor(document.querySelector("#mdView .md-note-main"));
      host.innerHTML = `<div class="pn-layout${pnSideCollapsed ? " side-collapsed" : ""}">
        ${pnSideHTML(mdDashTree, q)}
        <section class="pn-pane">
          <div class="pn-pane-h">
            <button class="btn ghost" id="mdDashBackFiles">← Back to folder</button>
            ${pnBreadcrumbHTML(mdProj.path || `${mdDashSelectedFolder}/${mdProj.title || 'New note.md'}`, true)}
            ${hit ? `<span class="pn-badge on">attached ${esc(hit.section||hit.label)}</span>` : ""}
            <span style="flex:1"></span>
            <button class="btn" id="mdDashSave">Save</button>
          </div>
          <div class="pn-editor-slot" id="pnEditorSlot"></div>
        </section>
      </div>`;

      pnBindSideEvents(host);
      $("mdDashBackFiles").onclick = async () => {
        if(!await pnSaveCurrent()) return;
        mdProj = null; mdDraft = false; mdDashPath = ""; mdDashLoad();
      };
      $("mdDashSave").onclick = () => mdSaveProj();
      mdMountEditor($("pnEditorSlot"));
      mdPaintProj();
      pnApplyReadOnly(host);
      if(!mdProj.path) setTimeout(()=> $("mdNoteTitle")?.focus(), 40);
      return;
    }

    // 2. Folder Browse Mode
    mdMountEditor(document.querySelector("#mdView .md-note-main"));
    const curFolderNode = pnFindNode(mdDashTree, mdDashSelectedFolder) || mdDashTree;
    const isRoot = curFolderNode.path === "Notes";
    const totalFiles = pnCountFiles(curFolderNode);
    const readGroup = curFolderNode.name === "Literature close-reading notes";

    host.innerHTML = `<div class="pn-layout${pnSideCollapsed ? " side-collapsed" : ""}">
      ${pnSideHTML(mdDashTree, q)}
      <section class="pn-pane">
        <div class="pn-pane-h">
          ${pnBreadcrumbHTML(curFolderNode.path, false)}
          <span class="pn-sub">· ${totalFiles} notes</span>
          ${readGroup ? `<span class="pn-auto">Finished close readings are filed here</span>` : ""}
          <span style="flex:1"></span>
          ${readGroup ? `<button class="btn ghost" id="pnGoMap">View lineage graph →</button>` : ""}
          <button class="btn" id="mdDashNew">+ New note</button>
          <button class="btn ghost" id="mdDashNewFolder">📁+ New folder</button>
          ${!isRoot ? `<button class="btn ghost" id="mdDashDelFolder" title="Delete this folder" style="color:var(--err,#e5484d)">🗑 Delete</button>` : ""}
        </div>
        ${pnFolderViewHTML(curFolderNode, q)}
        <div class="pn-pane-f">Current folder: ${esc(curFolderNode.path)} · includes ${totalFiles} Markdown Notes</div>
      </section>
    </div>`;

    pnBindSideEvents(host);

    host.querySelectorAll("[data-crumb-path]").forEach(el => {
      el.onclick = () => {
        mdDashSelectedFolder = el.dataset.crumbPath;
        pnExpandedFolders.add(mdDashSelectedFolder);
        mdDashLoad();
      };
    });

    host.querySelectorAll("[data-card-folder]").forEach(card => {
      card.onclick = () => {
        mdDashSelectedFolder = card.dataset.cardFolder;
        pnExpandedFolders.add(mdDashSelectedFolder);
        mdDashLoad();
      };
    });

    host.querySelectorAll("[data-pn-file]").forEach(b => {
      b.onclick = (e) => {
        if(e.target.closest("[data-pn-map]")) return pnJumpMap();
        mdDashPath = b.dataset.pnFile;
        const parts = mdDashPath.split("/");
        let curP = "";
        for(let i = 0; i < parts.length - 1; i++){
          curP = curP ? `${curP}/${parts[i]}` : parts[i];
          pnExpandedFolders.add(curP);
        }
        mdDashLoad();
      };
    });

    const gm = $("pnGoMap"); if(gm) gm.onclick = pnJumpMap;
    const nb = $("mdDashNew");
    if(nb) nb.onclick = () => pnNewNote();
    const nf = $("mdDashNewFolder");
    if(nf) nf.onclick = async () => {
      const name = await uiPrompt(`New subfolder in ${curFolderNode.path}, name:`);
      if(!name || !name.trim()) return;
      const safe = name.trim().replace(/[\\/:*?"<>|]/g,"_");
      const newFolder = `${curFolderNode.path}/${safe}`;
      try{
        await api("/api/project/folder/create", {project_id: mdDashProject, path: newFolder});
        pnExpandedFolders.add(curFolderNode.path);
        pnExpandedFolders.add(newFolder);
        mdDashSelectedFolder = newFolder;
        mdDashLoad();
      }catch(err){ uiNotify("Failed to create folder:" + err.message); }
    };
    const df = $("mdDashDelFolder");
    if(df) df.onclick = async () => {
      if(!await uiConfirm(`Delete folder "${curFolderNode.path}" and all its contents?`, {ok:"Delete folder"})) return;
      try{
        await api("/api/project/note/delete", {project_id: mdDashProject, path: curFolderNode.path});
        pnExpandedFolders.delete(curFolderNode.path);
        mdDashSelectedFolder = "Notes";
        mdDashLoad();
      }catch(err){ uiNotify("Delete folder failed:" + err.message); }
    };
    const empNew = $("pnEmptyNewNote");
    if(empNew) empNew.onclick = () => pnNewNote();
    const empFold = $("pnEmptyNewFolder");
    if(empFold) empFold.onclick = nf.onclick;
    pnApplyReadOnly(host);

  }catch(e){
    if(!current()) return;
    mdMountEditor(document.querySelector("#mdView .md-note-main"));
    host.innerHTML=`<div class="msg error">${esc(e.message)}</div>`;
  }
}
async function renderNotes(m){
  spTab = "notes";
  return renderSpace(m);
}
if(!window.__rwMdEsc){                     // Esc exits focus (register once; renderNotes is called repeatedly)
  window.__rwMdEsc = 1;
  document.addEventListener("keydown", (e)=>{
    if(e.key==="Escape" && mdFocusOn && (route()==="notes" || (uiRouteIs("space") && spTab==="notes"))){
      if(mdNarrowOn) mdNarrow();          // Esc leaves focus and restores the pane width, never stranding the user
      mdFocus(false);
    }
  });
}

let openProv = new Set();          // which providers' model lists are expanded, so a rerender does not collapse them
function renderModels(m){
  const def = S.default || null;
  const wires = S.wires || [];
  const all = S.providers || [];
  m.innerHTML = `<div class="card"><h3>Models and Agent</h3>
      <p class="hint" style="margin:0">Credentials stay on this machine <code>data/research.sqlite3</code>, The page only echoes "saved / not configured”,<b>never shown Key Source</b>. 
      in the folder ${all.filter(p=>p.source==="builtin").length} providers One card per provider; fill in the one you use Key; click an adopted model chip becomes the default (Agent the next round uses it).</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
        <input class="control" id="p-filter" placeholder="Filter: deepseek / Tongyi / anthropic..." style="max-width:280px">
        <label class="hint"><input type="checkbox" id="p-only"> Show configured only</label>
        <label class="hint"><input type="checkbox" id="p-usable"> show only what works locally</label>
        <span class="hint" id="p-count"></span>
        <span style="flex:1"></span>
        <button class="btn ghost" id="p-new">+ Custom Provider</button>
      </div></div>
    <div id="p-custom" hidden class="card"><h3>Custom Provider</h3>
      <div class="grid2"><input type="text" id="p-name" placeholder="Name"><input type="text" id="p-url" placeholder="API address, paste into /v1"></div>
      <div class="grid2" style="margin-top:8px"><select id="p-api">${wires.map(w=>`<option value="${w.id}">${esc(w.label)}</option>`).join("")}</select><input type="password" id="p-key" placeholder="API Key (you can fill it in later)"></div>
      <button class="btn" style="margin-top:8px" id="p-add">Add</button><div id="p-out"></div></div>
    <div id="p-grid"></div>`;

  const grid = $("p-grid");
  function card(p){
    const isDef = def && def.provider_id===p.id;
    const adopted = p.models || [];
    const builtin = (p.builtin_models||[]).filter(x=>!adopted.includes(x));
    return `<div class="card prov ${p.enabled?"on":""}" data-pid="${p.id}" data-name="${esc((p.name+" "+p.id+" "+(p.base_url||"")).toLowerCase())}" data-en="${p.enabled?1:0}" data-usable="${p.usable?1:0}">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <b>${esc(p.name)}</b>
        <span class="pill" title="Protocol">${esc(p.wire_label)}</span>
        ${p.source==="custom"?`<span class="pill">Custom</span>`:""}
        ${p.n_models?`<span class="pill">${p.n_models} models</span>`:""}
        ${isDef?`<span class="pill ok">Default · ${esc(def.model)}</span>`:""}
        ${p.usable?"":`<span class="pill warn" title="Only the OpenAI Chat Completions protocol is implemented locally">Protocol not connected</span>`}
        <span style="flex:1"></span>
        <button class="btn ghost" data-prov-del="${p.id}" title="${p.source==="custom"?"Delete":"Reset (clear Key and adopted models)"}">${p.source==="custom"?"Delete":"Reset"}</button>
      </div>
      <div class="muted" style="font-size:12px;margin-top:2px">${esc(p.base_url||"-")}</div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="hint">Credentials: </span>${p.key_present?`<span class="pill ok">Saved</span>`:`<span class="pill warn">Not configured</span>`}
        <input type="password" class="control" data-key-input="${p.id}" placeholder="Paste API Key" style="max-width:200px">
        <button class="btn ghost" data-key-save="${p.id}">${p.key_present?"Replace API Key":"Settings API Key"}</button>
        ${p.auth.includes("oauth")?`<button class="btn ghost" data-origin="${p.id}|${esc(p.console||"")}">OAuth Sign in</button>`:""}
        ${p.console?`<button class="btn ghost" data-origin="${p.id}|${esc(p.console)}" title="Open vendor console">Console ↗</button>`:""}
        ${p.key_present?`<button class="btn ghost" data-key-clear="${p.id}">Clear credentials</button>`:""}
      </div>
      <div style="margin-top:8px"><span class="hint">Adopted: </span>
        ${adopted.length?adopted.map(x=>`<span class="chip dflt" data-default="${p.id}|${esc(x)}" title="Set as default model">${esc(x)}<i class="x" data-unadopt="${p.id}|${esc(x)}">×</i></span>`).join(""):`<span class="hint">No models adopted yet</span>`}
      </div>
      ${builtin.length||adopted.length?`<details class="mods" data-mods="${p.id}" ${openProv.has(p.id)?"open":""}>
        <summary>Available models <b>${p.n_models||p.builtin_models.length}</b> items${builtin.length<p.n_models?` (listed here first ${builtin.length})`:""} · Open and pick; one click adopts it</summary>
        <div class="cand">${builtin.slice(0,40).map(x=>`<button class="btn ghost" data-adopt="${p.id}|${esc(x)}">${esc(x)}</button>`).join("")||`<span class="hint">Catalog models adopted; use "Discover models" or type one</span>`}</div>
      </details>`:""}
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn ghost" data-discover="${p.id}">discovered models</button>
        <input class="control" data-manual="${p.id}" placeholder="or type a model id" style="max-width:180px">
        <button class="btn ghost" data-adopt-manual="${p.id}">Adopt</button>
        <button class="btn ghost" data-prov-test="${p.id}">Test connection</button>
      </div>
      <div class="cand" data-cand="${p.id}"></div>
      <div class="provout" data-prov-out="${p.id}"></div>
    </div>`;
  }
  function draw(){
    const q = ($("p-filter").value||"").trim().toLowerCase();
    const only = $("p-only").checked, usable = $("p-usable").checked;
    const list = all.filter(p=>!q || (p.name+" "+p.id+" "+(p.base_url||"")).toLowerCase().includes(q))
      .filter(p=>!only || p.enabled).filter(p=>!usable || p.usable);
    grid.innerHTML = list.length?list.map(card).join(""):`<div class="card hint">No matching provider</div>`;
    $("p-count").textContent = `Showing ${list.length} / ${all.length} accounts`;
    bind();
  }
  function out(pid){ return grid.querySelector(`[data-prov-out="${pid}"]`); }
  function bail(pid,e){ const o=out(pid); if(o) o.innerHTML=`<div class="msg error">${esc(e.message)}</div>`; }
  function bind(){
    grid.querySelectorAll("details[data-mods]").forEach(d=>d.addEventListener("toggle",
      ()=>{ d.open ? openProv.add(d.dataset.mods) : openProv.delete(d.dataset.mods); }));
    grid.querySelectorAll("[data-key-save]").forEach(b=>b.onclick=async()=>{
      const id=b.dataset.keySave, inp=grid.querySelector(`[data-key-input="${id}"]`);
      try{ await api("/api/providers/key",{id,api_key:inp.value}); await refreshState(); }catch(e){ bail(id,e); } });
    grid.querySelectorAll("[data-key-clear]").forEach(b=>b.onclick=async()=>{
      if(!await uiConfirm("Clear this provider's credentials?")) return;
      try{ await api("/api/providers/key",{id:b.dataset.keyClear,api_key:""}); await refreshState(); }catch(e){ bail(b.dataset.keyClear,e); } });
    grid.querySelectorAll("[data-prov-del]").forEach(b=>b.onclick=async()=>{
      const id=b.dataset.provDel, p=all.find(x=>x.id===id)||{};
      if(!await uiConfirm(p.source==="custom"?"Delete this provider?":"Reset this provider? (clears the key and adopted models, keeps the card)")) return;
      try{ await api("/api/providers/delete",{id}); await refreshState(); }catch(e){ bail(id,e); } });
    grid.querySelectorAll("[data-origin]").forEach(b=>b.onclick=()=>{
      const [pid,url]=b.dataset.origin.split("|");
      if(url) window.open(url,"_blank");
      out(pid).innerHTML=`<div class="hint">${url?"Vendor console opened.":"This provider has no public console."}Subscription account (OAuth)cannot switch automatically yet token--Device codes come from each provider client_id, This does not pretend to auto-authorise: create it in the console Key or copy the subscription token, Paste it back into the field above and save.</div>`; });
    grid.querySelectorAll("[data-unadopt]").forEach(b=>b.onclick=async(e)=>{
      e.stopPropagation(); const [id,model]=b.dataset.unadopt.split("|");
      try{ await api("/api/providers/model",{id,model,on:false}); await refreshState(); }catch(err){ bail(id,err); } });
    grid.querySelectorAll("[data-adopt]").forEach(b=>b.onclick=async()=>{
      const [id,model]=b.dataset.adopt.split("|");
      try{ await api("/api/providers/model",{id,model,on:true}); await refreshState(); }catch(e){ bail(id,e); } });
    grid.querySelectorAll("[data-adopt-manual]").forEach(b=>b.onclick=async()=>{
      const id=b.dataset.adoptManual;
      try{ await api("/api/providers/model",{id,model:grid.querySelector(`[data-manual="${id}"]`).value,on:true}); await refreshState(); }catch(e){ bail(id,e); } });
    grid.querySelectorAll("[data-default]").forEach(c=>c.onclick=async(e)=>{
      if(e.target.classList.contains("x")) return;
      const [id,model]=c.dataset.default.split("|");
      try{ await api("/api/providers/default",{id,model}); await refreshState(); }catch(err){ bail(id,err); } });
    grid.querySelectorAll("[data-discover]").forEach(b=>b.onclick=async()=>{
      const id=b.dataset.discover, box=grid.querySelector(`[data-cand="${id}"]`);
      box.innerHTML=`<div class="hint">Fetching /models...</div>`;
      try{
        const {candidates}=await api("/api/providers/discover",{id});
        const have=new Set((all.find(x=>x.id===id)||{}).models||[]);
        box.innerHTML=`<div class="hint">Candidates ${candidates.length} : </div><div class="cand">${candidates.slice(0,80).map(c=>
          `<button class="btn ghost" data-adopt="${id}|${esc(c.id)}" ${have.has(c.id)?"disabled":""}>${have.has(c.id)?"✓ ":""}${esc(c.id)}</button>`).join("")}</div>`;
        bind();
      }catch(e){ box.innerHTML=`<div class="msg error">${esc(e.message)}</div>`; } });
    grid.querySelectorAll("[data-prov-test]").forEach(b=>b.onclick=async()=>{
      const id=b.dataset.provTest; out(id).innerHTML=`<div class="hint">Sending a minimal message...</div>`;
      try{ const r=await api("/api/providers/test",{id});
        out(id).innerHTML=`<div class="msg ok">${esc(r.model)} available: ${esc((r.reply||"").slice(0,120))}</div>`; }
      catch(e){ bail(id,e); } });
  }

  $("p-new").onclick = ()=>{ const box=$("p-custom"); box.hidden=!box.hidden; };
  $("p-add").onclick = async ()=>{
    try{ await api("/api/providers/add",{name:$("p-name").value,base_url:$("p-url").value,api:$("p-api").value,api_key:$("p-key").value});
      await refreshState(); }catch(e){ $("p-out").innerHTML=`<div class="msg error">${esc(e.message)}</div>`; } };
  ["input","change"].forEach(ev=>["p-filter","p-only","p-usable"].forEach(id=>$(id).addEventListener(ev,draw)));
  draw();
}


/* ---------------- Settings ---------------- */
/* ---- one accent derives the whole palette (8 presets plus custom) ---- */
const DEFAULT_THEME = "#176B87";
const THEME_PRESETS = [
  {name:"Research blue",primary:"#176B87"},{name:"Pine green",primary:"#28735D"},
  {name:"Ultramarine",primary:"#315F9B"},{name:"Coral",primary:"#C85C4A"},
  {name:"Amber",primary:"#A87518"},{name:"Berry",primary:"#A94762"},
  {name:"Rational violet",primary:"#70578F"},{name:"Graphite",primary:"#52625B"},
  {name:"Morandi gray",primary:"#BFBEBD"},{name:"Morandi camel",primary:"#D8D3C9"},
  {name:"Dusky blue",primary:"#99B9C6"},{name:"Sage",primary:"#A9B4A1"},
  {name:"Nude pink",primary:"#DAC5C3"},{name:"Dusky taro",primary:"#B7A9B3"},
];
function hexToHsl(hex){
  const m=String(hex||"").trim().match(/^#?([0-9a-f]{6})$/i); if(!m) return null;
  const n=parseInt(m[1],16), r=((n>>16)&255)/255, g=((n>>8)&255)/255, b=(n&255)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min, l=(max+min)/2;
  let h=0; const s=d===0?0:d/(1-Math.abs(2*l-1));
  if(d!==0){ if(max===r) h=60*(((g-b)/d)%6); else if(max===g) h=60*((b-r)/d+2); else h=60*((r-g)/d+4); }
  if(h<0) h+=360;
  return {h,s:s*100,l:l*100};
}
function hslToHex(h,s,l){
  s/=100; l/=100;
  const k=n=>(n+h/30)%12, a=s*Math.min(l,1-l),
    f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1))),
    to=x=>Math.round(255*x).toString(16).padStart(2,"0");
  return "#"+to(f(0))+to(f(8))+to(f(4));
}
function luminance(hex){
  const m=String(hex||"").match(/^#?([0-9a-f]{6})$/i); if(!m) return 0;
  const n=parseInt(m[1],16);
  const c=[(n>>16)&255,(n>>8)&255,n&255].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
function currentPrimary(){ return localStorage.getItem("rw-primary") || DEFAULT_THEME; }
function contrastOn(hex, bg){                       // WCAG contrast
  const a=luminance(hex), b=luminance(bg), hi=Math.max(a,b), lo=Math.min(a,b);
  return (hi+0.05)/(lo+0.05);
}
function applyTheme(primary){
  const c = hexToHsl(primary);
  if(!c){ uiNotify("Invalid colour; enter something like #176B87"); return; }
  const dark = document.documentElement.dataset.theme==="dark", root=document.documentElement;
  // Lighten on dark backgrounds; keep the native color on light ones, but a pale Morandi gray is invisible on white → step it darker until it reads
  const lightAccent = (()=>{ let l=c.l, x=primary;
    while(l>20 && contrastOn(x,"#ffffff")<3.2){ l-=3; x=hslToHex(c.h,c.s,l); } return x; })();
  const accent = dark ? hslToHex(c.h, Math.min(100, c.s*0.9+12), Math.max(58, Math.min(78, c.l+30))) : lightAccent;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-ink", luminance(accent) > 0.42 ? "#0d1218" : "#ffffff");
  root.style.setProperty("--side-bg", hslToHex(c.h, Math.min(100,c.s*0.3+8), dark ? 9 : 96));
  localStorage.setItem("rw-primary", primary);
}
function themeSwatches(compact){
  const cur=currentPrimary().toLowerCase();
  return THEME_PRESETS.map(t=>`<span class="sw ${compact?"doton":""} ${t.primary.toLowerCase()===cur?"sel":""}" data-p="${t.primary}"
    style="--c:${t.primary}" title="${t.name} (${t.primary})">${compact?"":`<em>${t.name}</em>`}</span>`).join("");
}
function bindSwatches(host){
  host.querySelectorAll("[data-p]").forEach(s=>s.onclick=()=>{ applyTheme(s.dataset.p); render(); });
}
let setSec = "theme";                    // settings left-column sections (like the workflow middle column)
let setMeta = null;                      // /api/settings/meta cache: tools in S.tools, skills and MCP here
let setUpdate = null;
const SET_SECS = [["theme", "🎨", "Accent color"], ["perm", "🛡", "Permissions"], ["models", "🔌", "Model list"], ["tools", "🧰", "Tool"], ["skills", "⚡", "Skill"], ["mcp", "🔗", "MCP"], ["data", "▤", "Data management"], ["about", "ⓘ", "Version and updates"]];
const formatUpdateSize = bytes => {
  const n = Number(bytes || 0);
  if (!(n > 0)) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
async function loadAppUpdate(force = false){
  if (setUpdate?.loading && !force) return;
  setUpdate = { ...(setUpdate || {}), loading: true, error: "", available: false };
  render();
  try {
    const local = await api("/api/app/version");
    setUpdate = { ...setUpdate, ...local, loading: true };
    setUpdate = await api("/api/app/update/check");
  } catch(e) {
    setUpdate = { ...(setUpdate || {}), loading: false, error: e.message };
  }
  render();
}
function setPanel(){
  if (setSec === 'data') return '<div data-storage-panel aria-live="polite">Reading storage location...</div>';
  if(setSec === "theme") return `<div class="card"><h3>Accent color</h3>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn" id="th">${document.documentElement.dataset.theme==="dark"?"Switch to light":"Switch to dark"}</button>
      <span class="hint">Accent colour: </span><div class="swatches" id="presets">${themeSwatches()}</div></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
      <span class="hint">Custom: </span>
      <input type="color" id="cpick" value="${currentPrimary()}" style="width:38px;height:30px;padding:2px">
      <input class="control" id="chex" value="${currentPrimary()}" style="max-width:120px" placeholder="#176B87">
      <button class="btn ghost" id="capply">Apply</button>
      <button class="btn ghost" id="creset">Restore default</button>
    </div>
    <div class="hint" style="margin-top:8px">Font size: </div>
    <div style="display:flex;gap:6px;margin-top:4px">${[["compact","Compact"],["comfortable","Standard"],["large","Large"]].map(([k,l])=>`<button class="btn ghost" data-f="${k}">${l}</button>`).join("")}</div></div>`;
  if(setSec === "perm") {
    const mode = (S.sec||{}).permission_mode || "";
    const opt = (k, t, d) => `<label class="perm-opt ${mode===k?"on":""}"><input type="radio" name="permmode" value="${k}" ${mode===k?"checked":""}><div><b>${t}</b><p>${d}</p></div></label>`;
    return `<div class="card"><h3>Permission mode</h3>
      <div class="hint">I can only read and write in the app's data folder and the project folders you picked; anything outside is refused and logged.</div>
      <div class="perm-opts">
        ${opt("all", "Allow everything", "Read, write, build, and export in allowed folders without asking each time.")}
        ${opt("ask", "Ask every time", "Ask before every build, write, and export.")}
      </div></div>
    <div class="card" style="margin-top:12px"><h3>Context budget</h3>
      <div class="hint">Word limit for past messages. The assistant and project chats keep recent messages first and pull relevant older passages for the current question. Actual token Trust the usage page.</div>
      <div class="ag-row" style="margin-top:8px">
        <input class="control" id="ctxchars" type="number" min="2000" max="400000" step="1000"
               value="${Number((S.sec||{}).history_chars) || 40000}" style="max-width:160px">
        <span class="hint">characters (2000–400000)</span>
        <button class="btn btn-primary" id="ctxsave">Save</button>
      </div></div>`;
  }
  if(setSec === "models") return `<div class="card"><h3>Model list</h3>
      <div class="hint">Available models, credentials, and the default model are set here (the old sidebar "Models" page).</div></div><div id="set-models"></div>`;
  if(setSec === "about") {
    const u = setUpdate || {};
    const status = u.loading ? "Checking for the official version..." : (u.error || u.message || "Click ”Check for updates” for the latest version");
    const available = !!u.available && !!u.supported && !u.installing;
    const updateLabel = u.installing ? "Starting installation..." : (u.available ? "Download and install update" : (u.error ? "Unavailable" : "Already up to date"));
    const notes = u.notes ? `<div class="hint" style="white-space:pre-wrap;line-height:1.7;margin-top:12px">${esc(u.notes)}</div>` : "";
    return `<div class="card"><div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap">
      <div><p class="inst-label">APPLICATION</p><h3>Version and updates</h3><p class="hint">The app checks the official release feed and downloads updates, without opening GitHub. </p></div>
      <button class="btn ghost" id="app-update-check" ${u.loading ? "disabled" : ""}>Check for updates</button></div>
      <div class="ag-row" style="margin-top:16px;align-items:center;flex-wrap:wrap"><span>Current version</span><strong>v${esc(u.current_version || "Loading")}</strong>${u.latest_version ? `<span class="hint">Latest version v${esc(u.latest_version)}</span>` : ""}</div>
      <p class="hint" role="status" aria-live="polite" style="margin-top:10px">${esc(status)}</p>
      ${u.published_at ? `<p class="hint">Published: ${esc(fmtDate(u.published_at))}${u.asset_size ? `· installer ${esc(formatUpdateSize(u.asset_size))}` : ""}</p>` : ""}
      ${notes}
      <div style="display:flex;gap:8px;align-items:center;margin-top:16px;flex-wrap:wrap"><button class="btn btn-primary" id="app-update-install" ${available ? "" : "disabled"}>${updateLabel}</button>${!u.supported && u.current_version ? `<span class="hint">A source checkout can check the version but cannot self-install.</span>` : ""}</div>
    </div>`;
  }
  if(setSec === "tools") return `<div class="card"><h3>Agent Available tools <span class="pill">${(S.tools||[]).length}</span></h3>
      <table><tr><th>Tools</th><th>Description</th></tr>${(S.tools||[]).map(t=>`<tr><td><code>${esc(t.name)}</code></td><td class="muted">${esc(t.description)}</td></tr>`).join("")}</table></div>
    <div class="card"><h3>Boundaries</h3><ul class="hint"><li>Downloads open-access full text only, no paywall workarounds.</li><li>Candidate evidence needs a page number and the original text; mismatches are rejected.</li><li>model output (review/writing) is a draft, not a conclusion.</li><li>Data stays local <code>data/research.sqlite3</code>. </li></ul></div>`;
  if(!setMeta) return `<div class="card"><h3>${setSec==="skills"?"Skill":"MCP"} Server</h3><div class="hint">Reading local config...</div></div>`;
  if(setMeta.__err) return `<div class="card"><h3>Cannot read</h3><div class="hint">${esc(setMeta.__err)}</div></div>`;
  if(setSec === "skills") return `<div class="card"><h3>Skill <span class="pill">${(setMeta.skills||[]).length}</span></h3>
      <div class="hint">Local skill pack (read-only):<code>${esc(setMeta.hermes_dir||"")}</code> -- Install/Updates happen in the skill catalog.</div>
      <table><tr><th>Skills</th><th>Description</th></tr>${(setMeta.skills||[]).map(x=>`<tr><td><code>${esc(x.name)}</code></td><td class="muted">${esc(x.desc)}</td></tr>`).join("")}</table></div>`;
  return `<div class="card"><h3>MCP <span class="pill">${(setMeta.mcp||[]).length}</span></h3>
      <div class="hint">from the local config MCP Server (read-only):<code>${esc(setMeta.mcp_cfg||"")}</code></div>
      <table><tr><th>Server</th><th>Start</th></tr>${(setMeta.mcp||[]).map(x=>`<tr><td><code>${esc(x.name)}</code></td><td class="muted">${esc(x.cmd)}</td></tr>`).join("")}</table></div>`;
}
function renderSettings(m){
  m.innerHTML = `<div class="page-head"><div><p class="inst-label">SETTINGS</p><h3>Settings</h3></div>
      <div class="ph-acts"><button class="btn ghost" id="to-assist">Manage experts →</button></div></div>
    <div class="set-wrap" style="margin-top:12px">
      <nav class="set-nav">${SET_SECS.map(([k,i,l])=>`<button class="set-row ${k===setSec?"on":""}" data-set="${k}"><span class="set-ico">${i}</span>${l}</button>`).join("")}</nav>
      <div class="set-body" id="set-body">${setPanel()}</div></div>`;
  m.querySelectorAll("[data-set]").forEach(b=>b.onclick=()=>{ setSec = b.dataset.set; render(); });
  const ta = $("to-assist"); if(ta) ta.onclick = ()=>openTab("assistants");
  if (setSec === 'data') renderStoragePanel(m.querySelector('[data-storage-panel]'));
  if(setSec === "perm"){
    m.querySelectorAll('input[name="permmode"]').forEach(r => r.onchange = async () => {
      await setPermissionMode(r.value); render();
    });
    const cs = $("ctxsave");
    if(cs) cs.onclick = async () => {
      const n = parseInt($("ctxchars").value, 10);
      if(!(n >= 2000 && n <= 400000)) return uiNotify("scope is 2000–400000 chars");
      try {
        S.sec = await api("/api/security", { history_chars: n });
        uiNotify("Context budget saved:" + n + " chars");
      } catch(e) { uiNotify("Save failed:" + e.message); }
    };
  }
  if(setSec === "theme"){
    $("th").onclick = ()=>setTheme(document.documentElement.dataset.theme==="dark"?"light":"dark");
    bindSwatches($("presets"));
    $("cpick").oninput = (e)=>{ $("chex").value = e.target.value; applyTheme(e.target.value); };
    $("chex").onkeydown = (e)=>{ if(e.key==="Enter"){ applyTheme(e.target.value.trim()); render(); } };
    $("capply").onclick = ()=>{ applyTheme($("chex").value.trim()); render(); };
    $("creset").onclick = ()=>{ applyTheme(DEFAULT_THEME); render(); };
    m.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>setFont(b.dataset.f));
  }
  if(setSec === "models"){
    $("set-models").innerHTML = `<div class="card"><h3>Model</h3><div class="hint">Available models, credentials, and the default model are set here (the old sidebar "Models" page).</div></div>`;
    renderModels($("set-models"));      // Reuse the original panel
  }
  if(setSec === "about"){
    if(!setUpdate) loadAppUpdate();
    const check = $("app-update-check");
    if(check) check.onclick = () => loadAppUpdate(true);
    const install = $("app-update-install");
    if(install) install.onclick = async () => {
      if(!setUpdate?.available || !setUpdate?.supported || !confirm("This downloads the official installer and restarts the app. Continue?")) return;
      setUpdate = {...setUpdate, installing:true}; render();
      try {
        const result = await api("/api/app/update/install", {});
        setUpdate = {...setUpdate, ...result, installing:false, message:result.message || "The installer started. The app will restart automatically."};
        render();
      } catch(e) {
        setUpdate = {...setUpdate, installing:false, error:e.message}; render();
      }
    };
  }
  if((setSec === "skills" || setSec === "mcp") && !setMeta){
    api("/api/settings/meta").then(r=>{ setMeta = r; render(); }).catch(e=>{ setMeta = {__err:e.message}; render(); });
  }
}

async function renderStoragePanel(panel) {
  const labels = {data:'App data directory', database:'Current database', projects:'Default project folder', backups:'Apply backup folder'};
  const row = (label, path, kind, id = '', historical = null) => `<li class="data-location">
    <div class="data-location-path"><strong>${esc(label)}</strong><code>${esc(path)}</code></div>
    <div class="data-location-actions">
      ${kind ? `<button class="btn ghost" data-location-open="${kind}" data-location-id="${esc(id)}">${kind === 'database' ? 'Open containing folder' : 'Open folder'}</button>` : ''}
      <button class="btn ghost" data-location-copy="${esc(path)}">Copy path</button>
      ${id ? `<button class="btn ghost" data-location-forget="${esc(id)}">Remove this record</button>` : ''}
      ${historical?.execution_records ? `<button class="btn ghost" data-history-clean="${esc(historical.project_id)}">Clear leftover run records (${historical.execution_records})</button>` : ''}
    </div>
  </li>`;
  let storage;
  try { storage = await api('/api/settings/data'); }
  catch (error) { panel.textContent = error.message; return; }
  if (!panel.isConnected) return;
  panel.innerHTML = `<div class="card"><h3>Storage location</h3>
      <ul class="data-locations">${Object.entries(labels).map(([kind, label]) => row(label, storage.paths[kind], kind)).join('')}</ul>
    </div><div class="card"><h3>Folders of deleted projects</h3>
      <p class="hint">Deleting a project record leaves the files in place. Open the folder to check and clean up in Explorer.</p>
      ${storage.retained_projects.length ? `<ul class="data-locations">${storage.retained_projects.map(item => row(item.title, item.base_dir, 'project', item.project_id)).join('')}</ul>` : '<p class="hint">No saved folder records.</p>'}
      <p class="hint" role="status"></p>
    </div><div class="card"><h3>Find a project folder in old backups</h3>
      <p class="hint">Deleted projects may still be listed in old backups; the search shows the path the backup recorded.</p>
      <button class="btn ghost" data-storage-history>Find an old project</button>
      <div data-storage-history-results aria-live="polite"></div>
    </div>`;
  const status = panel.querySelector('[role="status"]');
  panel.querySelectorAll('[data-location-open]').forEach(button => button.onclick = async () => {
    status.textContent = '';
    try { await api('/api/settings/data/open', {kind:button.dataset.locationOpen, id:button.dataset.locationId}); }
    catch (error) { status.textContent = error.message; }
  });
  panel.addEventListener('click', copyLocation);
  async function copyLocation(event) {
    const button = event.target.closest('[data-location-copy]');
    if (!button) return;
    try { await navigator.clipboard.writeText(button.dataset.locationCopy); status.textContent = 'Path copied.'; }
    catch { status.textContent = 'Copy failed, select the path and copy it manually.'; }
  }
  const historyButton = panel.querySelector('[data-storage-history]');
  historyButton.onclick = showHistory;
  async function showHistory() {
    const results = panel.querySelector('[data-storage-history-results]');
    historyButton.disabled = true;
    results.textContent = 'Searching...';
    try {
      const {projects} = await api('/api/settings/data/history');
      results.innerHTML = projects.length
        ? `<ul class="data-locations">${projects.map(item => row(item.title, item.base_dir, '', '', item)).join('')}</ul>`
        : '<p class="hint">No other deleted projects were found in recent backups.</p>';
      results.querySelectorAll('[data-history-clean]').forEach(button => button.onclick = async () => {
        const item = projects.find(project => project.project_id === button.dataset.historyClean);
        const confirmed = await uiConfirm(`Permanently delete the leftover sessions, workflow runs, board events, model requests, and audit records for "${item.title}" in this library? Local files and backups are kept.`,
          {title:'Clean up old projects', ok:'Clear run history'});
        if (!confirmed) return;
        button.disabled = true;
        try {
          await api('/api/settings/data/clean-history', {id:item.project_id});
          await showHistory();
          uiNotify('Stale run records from old projects cleared.');
        } catch (error) { button.disabled = false; uiNotify(error.message); }
      });
    } catch (error) { results.textContent = error.message; }
    finally { historyButton.disabled = false; }
  }
  panel.querySelectorAll('[data-location-forget]').forEach(button => button.onclick = async () => {
    if (!await uiConfirm('Remove this folder record? Local files stay where they are.', {title:'Remove folder record', ok:'Remove'})) return;
    try {
      await api('/api/settings/data/forget', {id:button.dataset.locationForget});
      panel.removeEventListener('click', copyLocation);
      await renderStoragePanel(panel);
    } catch (error) { status.textContent = error.message; }
  });
}
const FONTS={compact:"13px",comfortable:"14px",large:"16px"};
function setTheme(t){ document.documentElement.dataset.theme=t; localStorage.setItem("rw-theme",t);
  applyTheme(currentPrimary()); render(); }   // re-derive the accent when switching modes (lighten on dark)
function setFont(f){ document.documentElement.style.setProperty("--app-font-size",FONTS[f]||"14px"); localStorage.setItem("rw-font",f); }

/* ---------------- minimal markdown render ---------------- */
function md(t){
  return renderMarkdown(t);
}

/* ---------------- Startup ---------------- */
async function refreshState(rerender=true){
  const st = await api("/api/state");
  const seen = S.loaded ? new Set((S.events||[]).map(e=>e.id)) : null;          // the first screen is not "new", or you jump away on entry
  S.tasks=st.tasks; S.chats=st.chats||[]; S.assistants=st.assistants||[]; S.models=st.models; S.active=st.active; S.events=st.events; S.stages=st.stages||[];
  const fresh = seen ? (st.events||[]).filter(e=>!seen.has(e.id)) : [];
  if(fresh.length){                                                            // just-added schedule (agent or another window): the calendar jumps to that day
    const d = fresh[fresh.length-1].date || "";
    if(/^\d{4}-\d{2}-\d{2}$/.test(d)){ calSel = d; calY = +d.slice(0,4); calM = +d.slice(5,7)-1; }
  }
  { const pv = await api("/api/providers"); S.providers=pv.providers; S.wires=pv.wires; S.default=pv.default; }
  if(!S.tools.length) S.tools = (await api("/api/tools")).tools;
  S.loaded=true;
  await loadSecurity();
  if(curTask && !S.tasks.some(t=>t.id===curTask)) curTask=null;
  if(!curTask && S.tasks.length){ curTask=S.tasks[0].id; localStorage.setItem("rw-task",curTask); }
  if(curChat && !S.chats.some(c=>c.id===curChat)){ curChat=null; localStorage.removeItem("rw-chat"); }
  // first open (nothing selected yet) → newest chat; the seeded welcome chat opens here
  if(!curChat && S.chats.length){ curChat=S.chats[0].id; localStorage.setItem("rw-chat",curChat); }
  if(rerender) render();
}
function initTheme(){
  document.documentElement.dataset.theme = localStorage.getItem("rw-theme") || "dark";
  applyTheme(currentPrimary());
  setFont(localStorage.getItem("rw-font") || "comfortable");
}
initTheme();
const savedRoute = localStorage.getItem("rw-route");
if(savedRoute && (TITLES[savedRoute]||savedRoute==='workbench') && savedRoute !== "agent"){
  tabs.push({id:"restored",route:savedRoute,title:TITLES[savedRoute]||TITLES.workspace}); activeTab="restored";
}
setInterval(()=>{ const el=document.querySelector(".topbar .date"); if(el) el.textContent=clock();
  const g=$("calHelloText"); if(g) g.textContent=helloText(); }, 30000);   // top bar date/time ticks on its own; the greeting follows the time
const initialAppState = refreshState().catch(e=>{ $("main").innerHTML=`<div class="msg error">Load failed: ${esc(e.message)}</div>`; console.error('boot', e); window.__bootErr = String(e.stack||e); });
document.addEventListener('DOMContentLoaded', async()=>{
  await initialAppState;
  if(S.loaded)await AppNavigation.start();
},{once:true});

/* Intelligence discovery and imports share the project bibliography. */
async function renderIntel(container){return IntelligenceView.render(container);}
