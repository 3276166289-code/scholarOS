function renderStar(m){
  m.innerHTML = `<div class="sm-wrap">
      <div class="sm-bar">
      <b>Knowledge star map</b>
      <button class="btn ghost sm-back" type="button" hidden>Back to all projects</button>
      <span class="hint">Click a project for its branches → Click a cluster for its entries → click an entry for the analysis,Esc Return level by level</span>
      <button class="btn ghost" id="smZotero" type="button" style="margin-left:auto" title="from this machine Zotero Import papers intoCurrent project">Import papers from Zotero</button>
      <button class="btn ghost" id="smRebuild" type="button" style="margin-left:8px" title="Rescan and rebuild once (normally it reads the last build and never recomputes)">Rebuild the star map</button>
    </div>
    <div class="sm-search"><input class="control" type="search" aria-label="Search knowledge-base projects" placeholder="Search knowledge-base projects by name or research question"><div data-sm-results hidden></div></div>
    <iframe id="kbFrame" class="sm-frame" src="/kb.html?theme=dark" title="Knowledge star map"></iframe>
  </div>`;
  const rb = m.querySelector("#smRebuild"), fr = m.querySelector("#kbFrame"), zb = m.querySelector("#smZotero");
  const search=m.querySelector('.sm-search input'),results=m.querySelector('[data-sm-results]');
  const back=m.querySelector('.sm-back');
  const selectProject=id=>{curTask=id;localStorage.setItem('rw-task',id);fr.src='/kb.html?theme=dark&task='+encodeURIComponent(id);back.hidden=false;results.hidden=true;search.value='';renderStatus();};
  back.onclick=()=>{back.hidden=true;search.value='';search.oninput();fr.src='/kb.html?theme=dark';};
  search.oninput=()=>{
    const q=search.value.trim().toLocaleLowerCase();results.hidden=!q;
    const projects=(S.tasks||[]).filter(project=>(project.title+' '+(project.question||'')).toLocaleLowerCase().includes(q));
    results.innerHTML=projects.map(project=>`<button type="button" data-sm-project="${esc(project.id)}">${esc(project.title)}</button>`).join('')||'<p role="status">No matching projects</p>';
    results.querySelectorAll('[data-sm-project]').forEach(button=>button.onclick=()=>selectProject(button.dataset.smProject));
  };
  search.onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();search.value='';search.oninput();}else if(event.key==='Enter'){event.preventDefault();results.querySelector('button')?.click();}else if(event.key==='ArrowDown'){event.preventDefault();if(!results.hidden)results.querySelector('button')?.focus();}};
  if(zb) zb.onclick = () => { if(typeof window.zotOpen === "function") window.zotOpen(); else if(typeof zotOpen === "function") zotOpen(); };
  if(rb && fr) rb.onclick = ()=>{                    // the star map is compiled: rebuild here or on first entering the library
    rb.disabled = true; rb.textContent = "Recalculating...";
    fr.onload = ()=>{ rb.disabled = false; rb.textContent = "Rebuild star map"; fr.onload = null; };
    fr.src = "/kb.html?theme=dark&rebuild=1";
  };
}

// "Open in app" in the star map: papers open the PDF, notes jump to the notes page (other types stay in the star map)
window.addEventListener("message", e => {
  const d = e.data || {};
  if(d.rw === "theme"){ setTheme(d.theme || "dark"); return; }   // the star map only draws in dark: the button in the hint switches directly
  if(d.rw === "openZotero"){ if(typeof window.zotOpen === "function") window.zotOpen(); else if(typeof zotOpen === "function") zotOpen(); return; }
  if(d.rw === "openZoteroSelect"){
    if(d.key) api("/api/zotero/select?key=" + encodeURIComponent(d.key)).catch(err => console.log(err));
    return;
  }
  if(d.rw === "openPath"){
    if(d.path) api("/api/paper/open?path=" + encodeURIComponent(d.path)).catch(err => uiNotify("Open failed:" + err.message));
    return;
  }
  if(d.rw === "saveNoteFromZotero"){
    if(d.key){
      const project=curTask;
      if(!project){uiNotify('Select a project to save the notes to.');return;}
      api("/api/zotero/note?key=" + encodeURIComponent(d.key))
        .then(res => {
          if(res && res.title){
            return api("/api/project/note/save", {project_id:project,path:'',title:res.title,content:res.content||''});
          }
          throw new Error('Zotero item has no note content to save');
        })
        .then(() => {
          if(typeof loadMdNotes === "function") loadMdNotes();
          if(typeof toast === "function") toast("Saved as a long note!"); else uiNotify("Saved to notes!");
        })
        .catch(err => uiNotify("Failed to save as note:" + err.message));
    }
    return;
  }
  if(d.rw === "selectProject"){
    if(d.id){
      curTask = d.id;
      localStorage.setItem("rw-task", curTask);
      if(d.view === "workflow") openTab("workflow");
      else if(d.view === "space") openTab("space");
      else {
        renderSidebar();
        renderStatus();
      }
    }
    return;
  }
  if(d.rw !== "open") return;
  if(d.kind === "post" || d.kind === "paper"){
    const param = d.ref ? "?id=" + encodeURIComponent(d.ref) : (d.path ? "?path=" + encodeURIComponent(d.path) : "");
    if(param) api("/api/paper/open" + param).catch(err => uiNotify("Open failed:" + err.message));
  } else if(d.kind === "note") { spTab = "notes"; openTab("space"); }
  else if(d.kind === "draft") {
    ProjectWorkspace.openStage(curTask, d.step).catch(error => uiNotify(error.message));
  }
});

/* ---------------- notes: markdown editor, not bound to a project ---------------- */
let mdNotes=[], mdActiveId=null, mdSaveTimer=null, mdLoaded=false, mdFocusOn=false, mdNarrowOn=false, mdFocusPrev="split";
