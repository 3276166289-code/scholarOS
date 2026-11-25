/* The project bibliography owns selection, editing and Zotero membership management. */
(() => {
  'use strict';
  const h = value => esc(String(value ?? ''));
  const fields = [['title','Title'],['authors','Authors (separated by semicolons)'],['year','Year'],['doi','DOI'],['url','Link'],['abstract','Abstract']];
  let current = null, openManagerFor = '';
  function html() {
    return `<section class="card project-literature" id="projectLiterature" aria-label="Project literature">
      <header class="pl-header">
        <div class="pl-tools"><button class="btn btn-primary" id="spZoteroBtn">From Zotero selection</button><button class="btn ghost" id="plLinkImport">Link / DOI Import</button><button class="btn ghost" id="plIntelligence">Pick from the digest</button></div>
        <span class="pill" id="plCount"></span></header>
      <details id="plManagement"><summary>Manage Zotero</summary><div class="pl-manager-settings"><button class="btn ghost" id="plConnection">Zotero Connection</button></div><div id="plZotero"><p class="hint">LoadingSync settings...</p></div></details>
      <div class="pl-tools"><input class="control" type="search" id="plSearch" aria-label="SearchProject literature" placeholder="Search title, authors, DOI, or Zotero key"><select class="control" id="plFilter" aria-label="FilterProject literature"><option value="all">All literature</option><option value="zotero">Linked Zotero</option><option value="pdf">Has PDF</option><option value="metadata">references only</option></select><button class="btn ghost" id="plRefresh">Refresh</button></div>
      <div class="pl-tools pl-selection" id="plSelection" hidden><label><input type="checkbox" id="plSelectAll"> Select all in this list</label><span class="hint" id="plSelected">Selected 0 papers</span><button class="btn" id="plSaveZotero" disabled>Save the selected to Zotero</button><button class="btn ghost" id="plRemove" disabled>Remove the selected project links</button></div>
      <section id="plZoteroSave" class="pl-editor" hidden aria-label="Save to Zotero"></section>
      <div id="plMessage" role="status" aria-live="polite"></div><div id="plError" class="pl-error" role="alert"></div>
      <section id="plEditor" class="pl-editor" hidden aria-label="Edit the reference"></section>
      <div id="plList" class="pl-list"></div></section>`;
  }

  function mount(container, project, initialRows, isActive=()=>uiRouteIs('space')&&spTab==='papers') {
    const selected = new Set();
    let rows = initialRows || [], editorRow = null, managerPromise = null, saving = false;
    let revision, request = 0, inFlight = null;
    const $ = id => container.querySelector('#'+id);
    const live = () => current?.container === container && container.isConnected && curTask === project && isActive();
    const message = (text, error=false) => { if(live()) $(error?'plError':'plMessage').textContent=text; };
    const filtered = () => {
      const query=$('plSearch').value.trim().toLocaleLowerCase(), filter=$('plFilter').value;
      return rows.filter(r=>[r.title,r.authors,r.doi,r.zotero_key].join(' ').toLocaleLowerCase().includes(query)
        && (filter==='all'||filter==='zotero'&&r.zotero_key||filter==='pdf'&&r.has_pdf||filter==='metadata'&&!r.has_pdf));
    };
    async function run(button, work) {
      if(!live()) return;
      button.disabled=true;message('',true);
      try { await work(); } catch(err) { message(err.message,true); }
      finally { if(live()){button.disabled=false;updateSelection();} }
    }
    function updateSelection() {
      const keys=filtered().filter(r=>r.result_id).map(r=>r.result_id);
      $('plSelection').hidden=!keys.length&&!selected.size;
      $('plSelected').textContent=`${selected.size} selected`;
      $('plRemove').disabled=!rows.some(r=>selected.has(r.result_id)&&r.zotero_key);
      $('plSaveZotero').disabled=!selected.size;
      $('plSaveZotero').textContent=`Save the ${selected.size} selected to Zotero`;
      $('plSelectAll').disabled=!keys.length;
      $('plSelectAll').checked=!!keys.length&&keys.every(k=>selected.has(k));
      $('plSelectAll').indeterminate=keys.some(k=>selected.has(k))&&!$('plSelectAll').checked;
    }
    function paint() {
      if(!live()) return;
      const visible=filtered(), available=new Set(rows.map(r=>r.result_id).filter(Boolean));
      for(const key of selected) if(!available.has(key)) selected.delete(key);
      $('plCount').textContent=`${rows.length} papers`;
      $('plList').innerHTML=visible.map(r=>{
        const zoteroStatus=r.zotero_status==='imported'?'<span class="pill">Written to Zotero</span>':r.zotero_status==='failed'?`<span class="pill">Zotero Awaiting retry${r.zotero_error?`: ${h(r.zotero_error)}`:''}</span>`:(r.has_pdf&&r.result_id&&r.zotero_status==='staged'&&!r.zotero_key?'<span class="pill">Staged for Zotero</span>':'');
        const canImport=!!r.result_id;
        return `<article class="pl-row" data-pl-id="${h(r.id)}"><input type="checkbox" data-pl-key="${h(r.result_id)}" aria-label="Select ${h(r.title||r.filename)}" ${r.result_id?'':'disabled'} ${selected.has(r.result_id)?'checked':''}><div class="pl-main"><h4>${h(r.title||r.filename||'Untitled')}</h4><p>${h(r.authors||'Authors not recognised')}${r.year?' · '+h(r.year):''}${r.doi?' · DOI '+h(r.doi):''}</p><span class="pill">${r.zotero_reference?'Zotero PDF Cite':r.has_pdf?'Has PDF':'References'}</span> ${r.zotero_key?`<span class="pill">Zotero · ${h(r.zotero_key)}</span>`:''}${zoteroStatus}<div class="es-badges" data-journal="${h(r.journal||r.title||'')}" style="margin-top:6px"></div></div><div class="pl-actions">${LiteratureImport.safeLink(r.url||r.doi&&"https://doi.org/"+r.doi)?`<a class="btn ghost" href="${h(LiteratureImport.safeLink(r.url||"https://doi.org/"+r.doi))}" target="_blank" rel="noopener noreferrer">View original ↗</a>`:""}${r.result_id?'<button class="btn ghost" data-pl-edit>Edit reference</button>':''}${r.has_pdf&&r.paper_id?'<button class="btn ghost" data-pl-read>Read PDF</button>':''}${r.zotero_key?'<button class="btn ghost" data-pl-open-zotero>Open in Zotero</button>':''}${canImport?'<button class="btn ghost" data-pl-stage-import>Save to Zotero</button>':''}</div></article>`;}).join('') || `<p class="hint">${rows.length?'No matching literature. Adjust the filters.':'No literature in this project yet. Add references from the intelligence briefing, a link / DOI, or Zotero.'}</p>`;
      $('plList').querySelectorAll('[data-pl-key]').forEach(el=>el.onchange=()=>{el.checked?selected.add(el.dataset.plKey):selected.delete(el.dataset.plKey);updateSelection();});
      $('plList').querySelectorAll('[data-pl-edit]').forEach(el=>el.onclick=()=>{
        if(saving) return;
        const row=rows.find(r=>r.id===el.closest('[data-pl-id]').dataset.plId);
        if(editorRow && editorRow.id!==row.id) {message('Save or cancel the current reference edit.',true);return;}
        if(!editorRow) edit(row);
      });
      $('plList').querySelectorAll('[data-pl-read]').forEach(el=>el.onclick=()=>run(el,async()=>{
        const row=rows.find(r=>r.id===el.closest('[data-pl-id]').dataset.plId);
        if(window.ProjectWorkspace?.active()) await ProjectWorkspace.openPaper(row);
        else await api('/api/paper/open?id='+encodeURIComponent(row.paper_id));
        message('PDF opened in the local reader.');
      }));
      $('plList').querySelectorAll('[data-pl-stage-import]').forEach(el=>el.onclick=()=>run(el,async()=>{
        const row=rows.find(r=>r.id===el.closest('[data-pl-id]').dataset.plId);
        await openSave([row.result_id]);
      }));
      $('plList').querySelectorAll('[data-pl-open-zotero]').forEach(el=>el.onclick=()=>run(el,async()=>{
        const row=rows.find(r=>r.id===el.closest('[data-pl-id]').dataset.plId);
        await api('/api/zotero/select?key='+encodeURIComponent(row.zotero_key));
      }));
      $('plList').querySelectorAll('[data-pl-id]').forEach(el=>{
        const row=rows.find(r=>r.id===el.dataset.plId);
        if(!row.zotero_key||row.zotero_reference) return;
        if(row.has_pdf&&row.paper_id){
          const button=document.createElement('button');button.className='btn ghost';button.textContent='Use the Zotero original';
          button.onclick=()=>run(button,async()=>{
            if(!await uiConfirm('Use the identical PDF from Zotero? The file in this project is kept.')||!live())return;
            await api('/api/zotero/web/reference',{task_id:project,paper_id:row.paper_id,confirm:true});
            message('Switched to the Zotero original.');await refresh();
          });
          el.querySelector('.pl-actions').append(button);
          return;
        }
        const button=document.createElement('button');button.className='btn ghost';button.dataset.plImportPdf='';button.textContent='Reference a local PDF';
        button.onclick=()=>run(button,async()=>{
          const result=await api('/api/workflow/zotero',{task_id:project,keys:[row.zotero_key]});
          if(!live())return;
          message(result.downloaded?'Zotero PDF linked.':'Zotero attachment is unreadable on this machine.');
          await refresh();
        });
        el.querySelector('.pl-actions').append(button);
      });
      if(typeof spLoadPaperBadges==='function') spLoadPaperBadges($('plList'));
      updateSelection();
    }
    async function openSave(resultIds){
      if(!resultIds.length)return;
      const [settings,list]=await Promise.all([api('/api/zotero/web/config?task_id='+encodeURIComponent(project)),api('/api/zotero/web/collections')]);
      if(!live())return;
      if(settings.config?.transport!=='local')throw new Error('Switch to local Zotero to save project literature');
      const panel=$('plZoteroSave'); let batch, matches={}, busy=false;
      panel.hidden=false;
      panel.innerHTML=`<h4>Save ${resultIds.length} to Zotero</h4><div class="pl-tools"><label>Target category <select class="control" data-save-target><option value="">SelectCategory</option>${(list.collections||[]).map(row=>`<option value="${h(row.key)}">${h(row.data?.name||row.key)} · ${h(row.key)}</option>`).join('')}</select></label><button class="btn ghost" data-save-download>Download the selected open-access PDF</button><button class="btn" data-save-preview>Preview</button><button class="btn" data-save-apply disabled>Confirm save</button><button class="btn ghost" data-save-close>Cancel</button></div><div data-save-result aria-live="polite"></div>`;
      const get=key=>panel.querySelector(`[data-save-${key}]`), target=get('target'), details=get('result');
      target.value=settings.binding?.collection||'';
      if(target.selectedIndex<0)target.value='';
      const invalidate=()=>{batch=null;get('apply').disabled=true;};
      const operate=async work=>{
        if(busy||!live())return;
        busy=true;panel.querySelectorAll('button,select').forEach(node=>node.disabled=true);
        try{await work();}catch(err){details.textContent=err.message;invalidate();}
        finally{busy=false;panel.querySelectorAll('button,select').forEach(node=>node.disabled=false);get('apply').disabled=!batch||!!batch.conflicts.length;}
      };
      target.onchange=()=>{invalidate();details.replaceChildren();};
      get('close').onclick=()=>{invalidate();panel.hidden=true;};
      get('download').onclick=()=>operate(async()=>{
        invalidate();
        const eligible=rows.filter(row=>resultIds.includes(row.result_id)&&!row.has_pdf&&row.pdf_url).map(row=>row.result_id);
        if(!eligible.length){details.textContent='The selected papers have no open-access PDF to download.';return;}
        const out=await api('/api/zotero/web/staged/download',{task_id:project,result_ids:eligible});
        details.textContent=`Staged ${out.result_ids.length} PDFs. ${out.failed.map(row=>row.error).join('; ')}`;
        await refresh();
      });
      get('preview').onclick=()=>operate(async()=>{
        invalidate();
        if(!target.value)throw new Error('Select a target category');
        batch=await api('/api/zotero/web/staged/plan',{task_id:project,result_ids:resultIds,collection:target.value,matches});
        details.innerHTML=`<p>${h(batch.collection_name)} · ${batch.actions.length} papers can be saved${batch.conflicts.length?` · ${batch.conflicts.length} items to check`:''}</p><ul>${batch.actions.map(row=>`<li>${h(row.title)} · ${row.kind==='create'?'New reference':row.add_collection?'Reuse and add to category':'Already in category'}${row.pdf?'· import or reuse a PDF':''}</li>`).join('')}${batch.conflicts.map(row=>`<li>${h(row.title)} · ${h(row.reason)}${row.candidates.length?` <select class="control" data-save-match="${h(row.result_id)}" aria-label="Pick the matching entry"><option value="">Select</option>${row.candidates.map(item=>`<option value="${h(item.key)}" ${matches[row.result_id]===item.key?'selected':''}>${h(item.title||item.key)} · ${h(item.key)}</option>`).join('')}</select>`:''}</li>`).join('')}</ul>`;
        details.querySelectorAll('[data-save-match]').forEach(el=>el.onchange=()=>{matches[el.dataset.saveMatch]=el.value;invalidate();});
      });
      get('apply').onclick=()=>operate(async()=>{
        if(!batch)return;
        const token=batch.plan_token;invalidate();
        const out=await api('/api/zotero/web/staged/apply',{task_id:project,plan_token:token,confirm:true});
        const done=new Set(out.applied.map(row=>row.result_id));
        done.forEach(id=>selected.delete(id));
        resultIds=resultIds.filter(id=>!done.has(id));
        panel.querySelector('h4').textContent=`Save ${resultIds.length} to Zotero`;
        if(!resultIds.length)panel.hidden=true;
        message(`Saved ${done.size} to Zotero. `);
        details.textContent=out.failed.map(row=>row.error).join('; ');
        await refresh();
      });
      target.focus();panel.scrollIntoView({block:'nearest'});
    }
    function refresh({poll=false}={}) {
      if(!live())return;
      if(poll&&inFlight)return inFlight;
      const ticket=++request;
      inFlight=api('/api/library/project?task_id='+encodeURIComponent(project)).then(data=>{
        if(!live()||ticket!==request||revision===data.version)return;
        revision=data.version;rows=data.items;paint();
      }).finally(()=>{if(ticket===request)inFlight=null;});
      return inFlight;
    }
    $('plLinkImport').onclick=()=>LiteratureImport.open({projectId:project,onImported:refresh});
    $('plIntelligence').onclick=()=>AppNavigation.follow(()=>openTab('intel'));
    async function management(target='sources') {
      $('plManagement').open=true;
      if(!managerPromise) {
        managerPromise=ProjectZotero.mount($('plZotero'),project,refresh,live).catch(err=>{managerPromise=null;throw err;});
      }
      await managerPromise;
      if(live()){
        ProjectZotero.show($('plZotero'),target);
        $('plManagement').scrollIntoView({block:'nearest'});
      }
    }
    function edit(row) {
      editorRow={...row};$('plEditor').hidden=false;
      $('plEditor').innerHTML=`<form id="plEditForm"><h4>Edit reference</h4><div class="integration-grid">${fields.map(([key,label])=>`<label><span>${label}</span>${key==='abstract'?`<textarea class="control" name="${key}">${h(row[key])}</textarea>`:`<input class="control" name="${key}" value="${h(row[key])}" ${key==='title'?'required':''}>`}</label>`).join('')}</div><p class="hint">after saving, the workflow andProject spacesync updates. Linked Zotero papers are handled by the project’s sync settings.</p><div class="pl-tools"><button class="btn" type="submit">Save reference</button><button class="btn ghost" type="button" id="plEditCancel">Cancel</button><button class="btn ghost" type="button" id="plEditLatest">Reload the latest references</button></div></form>`;
      $('plEditForm').onsubmit=event=>{event.preventDefault();if(saving)return;run(event.submitter||$('plEditForm').querySelector('[type=submit]'),async()=>{
        const body=Object.fromEntries(new FormData($('plEditForm'))), expected=Object.fromEntries(fields.map(([key])=>[key,String(editorRow[key]||'')]));
        saving=true;
        $('plEditForm').querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);
        try {
          await api('/api/library/project',{task_id:project,result_id:editorRow.result_id,fields:body,expected});
          if(!live()) return;
          editorRow=null;$('plEditor').hidden=true;message('Record saved.');await refresh();
        } finally {
          saving=false;
          if(live()&&editorRow) $('plEditForm').querySelectorAll('input,textarea,button').forEach(el=>el.disabled=false);
        }
      });};
      $('plEditCancel').onclick=()=>{if(saving)return;editorRow=null;$('plEditor').hidden=true;message('',true);};
      $('plEditLatest').onclick=async()=>{
        if(saving||!await uiConfirm('Reloading replaces unsaved edits. Continue?')||!live())return;
        await run($('plEditLatest'),async()=>{await refresh();if(live()) {const latest=rows.find(r=>r.id===row.id);if(latest)edit(latest);else message('This paper left the project; keep any edits you still need, then cancel.',true);}});
      };
      $('plEditForm').querySelector('[name=title]').focus();
      $('plEditor').scrollIntoView({block:'nearest'});
    }
    current={container,project,refresh,live,management,
      refreshStatus(){if(live()&&$('plManagement').open)return ProjectZotero.refreshStatus($('plZotero'));}};
    $('plSearch').oninput=paint;$('plFilter').onchange=paint;
    $('plSelectAll').onchange=event=>{filtered().filter(r=>r.result_id).forEach(r=>event.target.checked?selected.add(r.result_id):selected.delete(r.result_id));paint();};
    $('plSaveZotero').onclick=event=>run(event.target,()=>openSave([...selected]));
    $('plRefresh').onclick=event=>run(event.target,refresh);
    $('spZoteroBtn').onclick=event=>run(event.target,()=>management('sources'));
    $('plManagement').ontoggle=()=>{if($('plManagement').open&&!managerPromise)management().catch(err=>message(err.message,true));};
    $('plRemove').onclick=event=>run(event.target,async()=>{const keys=rows.filter(r=>selected.has(r.result_id)&&r.zotero_key).map(r=>r.zotero_key);await management('history');if(live())await ProjectZotero.previewRemoval($('plZotero'),keys);});
    $('plConnection').onclick=()=>AppNavigation.follow(()=>IntegrationSettings.openZotero(project));
    paint();
    if(openManagerFor===project){openManagerFor='';management().catch(err=>message(err.message,true));}
    return refresh().catch(err=>message(err.message,true));
  }
  async function open(project, manage=false) {
    if(!project)return;
    if(current?.project===project&&current.live())return manage?current.management():current.refresh();
    return AppNavigation.follow(async()=>{
      await ProjectWorkspace.openProject(project);
      if(curTask!==project)return;
      openManagerFor=manage?project:'';
      await ProjectWorkspace.showResource('papers');
    });
  }
  window.ProjectLiterature={html,mount,open,async poll(){
    const panel=current;
    if(!panel?.live())return;
    await panel.refresh({poll:true});
    await panel.refreshStatus();
  }};
})();
