/* Project-scoped Zotero membership controls, backed by the shared sync APIs. */
(() => {
  "use strict";
  const e = value => esc(String(value ?? ""));
  const mounts = new WeakMap();
  const controls = new WeakMap();
  const pending = new WeakMap();
  function mount(container, projectId, onChange = async () => {}, active=()=>uiRouteIs('space')&&spTab==='papers') {
    const ticket = {};
    mounts.set(container, ticket);
    const promise = render(container, projectId, onChange, ticket, active).catch(err => {
      if (mounts.get(container) === ticket && container.isConnected && curTask === projectId) {
        container.innerHTML = `<p class="integration-error" role="alert">Failed to read the literature config: ${e(err.message)}</p><button class="btn ghost" data-zs-reload>Reload</button>`;
        container.querySelector('[data-zs-reload]').onclick = () => mount(container, projectId, onChange, active).catch(()=>{});
      }
      throw err;
    });
    pending.set(container,promise);
    return promise;
  }
  async function render(container, projectId, onChange, ticket, active) {
    const field = id => container.querySelector('#' + id);
    const isCurrent = () => mounts.get(container) === ticket && container.isConnected && curTask === projectId && active();
    const error = message => { if (isCurrent() && field('integration-error')) field('integration-error').textContent = String(message?.message || message || ''); };
    async function call(path, body) {
      if (!isCurrent()) throw new Error('Project changed; redo this in the current project');
      return api(path, body);
    }
    async function action(button, work) {
      if (!isCurrent()) return;
      button.disabled = true; error('');
      try { await work(); } catch (err) { error(err); }
      finally {
        button.disabled = false;
        if (isCurrent()) {
          if (field('zs-select')) field('zs-select').disabled = !chosenKeys.size;
          if (field('zs-apply')) field('zs-apply').disabled = !preview || !!preview.conflicts.length || !preview.actions.length;
        }
      }
    }
    const [result, automatic] = await Promise.all([
      call('/api/zotero/web/config?task_id=' + encodeURIComponent(projectId)),
      call('/api/zotero/web/auto?task_id=' + encodeURIComponent(projectId))
    ]);
    if (!isCurrent()) return;
    const bound = result.binding || {}, autoSync = automatic.auto_sync || {};
    const activeProject = projectId;
    let sourceDraft = (bound.sources || []).map(source => ({...source}));
    let collectionNames = new Map(), preview = null;
    const loadZotero = () => isCurrent() ? mount(container, projectId, onChange, active) : undefined;
    container.innerHTML = `<div class="zs-views" role="group" aria-label="Zotero Manage">
          <button type="button" class="btn ghost" data-zs-view="sources">Sources and selection</button>
          <button type="button" class="btn ghost" data-zs-view="sync">Sync settings</button>
          <button type="button" class="btn ghost" data-zs-view="history">Remove and restore</button>
        </div><p class="hint">${result.config?.transport === 'local' ? 'Local Zotero' : 'Zotero Web API'} · ${result.local?.readable ? 'Connected on this machine' : 'Not connected on this machine'} · ${result.local?.authorized ? 'Write access already granted' : 'on the first write, Zotero Authorise'}</p>
        <div class="integration-status">Current library: ${bound.library ? `<code>${e(bound.library)}</code>` : "Not set"}<span id="zs-last-sync">${bound.last_sync ? ` · Last sync ${e(new Date(Number(bound.last_sync) * 1000).toLocaleString())}` : ""}</span></div>
        <section data-zs-panel="sources" aria-label="Sources and selection"><fieldset class="zs-section"><legend>Project literatureSource</legend>
          <p class="hint">You can add several Collection, Papers join the project one by one by default. Sources can be shared across projects; removing one keeps the papers already added. With no source, pick from the whole library.</p>
          <div class="integration-actions"><button class="btn ghost" id="zs-load">Read Collections</button><select class="control" id="zs-collection" aria-label="Literature source Collection"><option value="">Read first Collections</option></select><button class="btn ghost" id="zs-add-source">Add source</button></div>
          <div id="zs-sources"></div><button class="btn" id="zs-save-sources">Save project sources</button>
          <p class="hint">“Follow everything”only include this Collection direct papers; to follow sub- Collection, add them one at a time.</p>
          <div class="integration-actions"><button class="btn ghost" id="zs-browse">Browse Zotero Literature</button><input class="control" id="zs-filter" aria-label="Filter source papers" placeholder="Filter by title, authors, or DOI"></div>
          <div class="integration-actions"><select class="control" id="zs-browse-collection" aria-label="Filter Collection"><option value="">All candidates</option></select><label><input type="checkbox" id="zs-chosen-only"> Selected only</label><button class="btn ghost" id="zs-visible">Select this page</button><button class="btn ghost" id="zs-whole">Add a whole Collection</button><button class="btn ghost" id="zs-clear">Clear selection</button></div>
          <p class="hint" id="zs-candidate-count" role="status"></p><div id="zs-candidates"></div><button class="btn ghost" id="zs-prev">Previous</button><button class="btn ghost" id="zs-next">Next</button><button class="btn" id="zs-select" disabled>Add the selected papers</button>
        </fieldset><fieldset class="zs-section"><legend>Saved by default to</legend>
          <div class="integration-actions"><select class="control" id="zs-target" aria-label="Write by default Collection"><option value="${e(bound.collection||'')}">${e(bound.collection||'Not set')}</option></select><button class="btn ghost" id="zs-target-load">Read categories</button><button class="btn" id="zs-target-save">Save the default category</button><button class="btn ghost" id="zs-target-create">Create a project category of the same name</button></div>
        </fieldset></section>
        <section data-zs-panel="sync" aria-label="Sync settings" hidden><fieldset class="zs-section"><legend>Auto-sync to the workflow andProject space</legend>
          <label><input type="checkbox" id="zs-auto-enabled" ${autoSync.enabled ? "checked" : ""}> Auto-sync while the app is open</label>
          <div class="integration-actions"><select class="control" id="zs-auto-mode" aria-label="Auto-sync direction"><option value="merge" ${autoSync.mode==="merge"?"selected":""}>Merge both ways</option><option value="pull" ${autoSync.mode==="pull"?"selected":""}>Fetch only Zotero</option><option value="push" ${autoSync.mode==="push"?"selected":""}>Push project only</option></select>
          <label>Interval <input class="control" type="number" min="10" max="3600" id="zs-auto-interval" value="${Number(autoSync.interval_seconds)||15}" style="width:90px"> s</label><button class="btn" id="zs-auto-save">Save auto-sync</button></div>
          <p class="hint" role="status" id="zs-auto-state">${e({disabled:"Off",waiting:"Waiting for the next check",synced:"Synced",conflict:"Conflicts need resolving",error:"Sync failed"}[autoSync.status] || autoSync.status || "Off")}${autoSync.last_sync?" · "+e(new Date(Number(autoSync.last_sync)*1000).toLocaleString()):""}${autoSync.error?" · "+e(autoSync.error):""}</p>
          <p class="hint">Local changes sync incrementally; the workflow and project space share references. Conflicting entries wait for you while the rest keep syncing;PDF The project copy is kept.</p></fieldset>
        <div class="integration-actions"><select class="control" id="zs-mode" aria-label="Sync direction this time"><option value="merge">Merge metadata both ways</option><option value="pull">Fetch Zotero into the project</option><option value="push">Push the project to Zotero</option></select><button class="btn" id="zs-preview">Preview sync</button><button class="btn ghost" id="zs-apply" disabled>Confirm the run preview</button></div>
        <div id="zs-plan" aria-live="polite"></div>
        <div id="zs-conflicts"></div>
        </section><section data-zs-panel="history" aria-label="Remove and restore" hidden><fieldset class="zs-section"><legend>Remove links in bulk by project tag</legend><p class="hint">added to project members on merge or push <code>rw:project:${e(projectId)}</code>. Removing clears only this project's tag and link and hides the paper here; everything else is kept Collection link, other project links, files, and past notes. You can undo this removal.</p><button class="btn ghost" id="zs-unlink-preview" ${bound.library?'':'disabled'}>PreviewCurrent projectTag links</button><div id="zs-unlink"></div><div id="zs-batches"></div></fieldset></section>
        <p class="hint">The workflow and project space share member references; existing entries keep their original Collection ownership; moving Collection It does not touch project links. Fetching alone writes no project tags. Concurrent edits or a remote delete show as conflicts.${bound.collection?'New Zotero Items go into '+e(bound.collection)+'. ':'New Zotero Entries go to the library root and get the project tag.'}</p>

      <div id="integration-error" class="integration-error" role="alert"></div>
      <div id="integration-result" class="integration-result" aria-live="polite"></div>`;
    function show(view){
      container.dataset.zsActive=view;
      container.querySelectorAll('[data-zs-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.zsView===view)));
      container.querySelectorAll('[data-zs-panel]').forEach(panel=>panel.hidden=panel.dataset.zsPanel!==view);
    }
    show(container.dataset.zsActive||'sources');
    container.querySelectorAll('[data-zs-view]').forEach(button=>button.onclick=()=>show(button.dataset.zsView));
    field("zs-auto-save").onclick = event => action(event.target, async () => {
      await call("/api/zotero/web/auto",{task_id:projectId,enabled:field("zs-auto-enabled").checked,
        mode:field("zs-auto-mode").value,interval_seconds:Number(field("zs-auto-interval").value)});
      await loadZotero();
    });
    async function loadCollections() {
      const data = await call("/api/zotero/web/collections");
      if (!isCurrent()) return;
      return showCollections(data.collections);
    }
    function showCollections(collections) {
      collectionNames = new Map(collections.map(item => [item.key, item.data?.name || item.key]));
      const source = field('zs-collection'), target = field('zs-target');
      const sourceChoice = source.value, targetChoice = target.value;
      field("zs-collection").innerHTML = collections.map(item => `<option value="${e(item.key)}">${e(item.data?.name || item.key)} · ${e(item.key)}</option>`).join("");
      if(collectionNames.has(sourceChoice)) source.value=sourceChoice;
      target.innerHTML='<option value="">Not set</option>'+source.innerHTML;
      target.value=collectionNames.has(targetChoice)?targetChoice:'';
      const filter=field('zs-browse-collection'), previous=filter.value;
      filter.innerHTML='<option value="">All candidates</option>'+field('zs-collection').innerHTML;
      filter.value=collectionNames.has(previous)?previous:'';
      renderSources();
      return collections.length;
    }
    field("zs-load").onclick = event => action(event.target, async () => {
      const count = await loadCollections();
      if (isCurrent()) field("integration-result").textContent = `Fetched ${count} collections.`;
    });
    field('zs-target-load').onclick=event=>action(event.target,loadCollections);
    field('zs-target-save').onclick=event=>action(event.target,async()=>{
      await call('/api/zotero/web/target',{task_id:projectId,library:result.library,collection:field('zs-target').value});
      await loadZotero();
    });
    field('zs-target-create').onclick=event=>action(event.target,async()=>{
      if(!await uiConfirm(`Create a category named after the project in ${result.library} and make it the default target?`))return;
      await call('/api/zotero/web/target',{task_id:projectId,library:result.library,create:true,confirm:true});
      await loadZotero();
    });
    function renderSources() {
      field('zs-sources').innerHTML = sourceDraft.map((s,i)=>`<div class="integration-actions"><span>${e(collectionNames.get(s.collection)||s.collection)}</span><select class="control" data-zs-source-mode="${i}" aria-label="${e(s.collection)} Sync scope"><option value="selected" ${s.mode==='selected'?'selected':''}>Pick one by one (default)</option><option value="all" ${s.mode==='all'?'selected':''}>Follow everything, including new papers</option></select><button class="btn ghost" data-zs-remove-source="${i}">Remove source</button></div>`).join('');
      field('zs-sources').querySelectorAll('[data-zs-source-mode]').forEach(el=>el.onchange=()=>{sourceDraft[Number(el.dataset.zsSourceMode)].mode=el.value;});
      field('zs-sources').querySelectorAll('[data-zs-remove-source]').forEach(el=>el.onclick=()=>{sourceDraft.splice(Number(el.dataset.zsRemoveSource),1);renderSources();});
    }
    renderSources();
    field('zs-add-source').onclick=()=>{
      const collection=field('zs-collection').value;
      if(collection && !sourceDraft.some(s=>s.collection===collection)){sourceDraft.push({collection,mode:'selected'});renderSources();}
    };
    field('zs-save-sources').onclick=event=>action(event.target,async()=>{
      if(sourceDraft.some(s=>s.mode==='all') && !await uiConfirm('Every paper in the "follow all" sources, and anything new, joins the project on sync. Save these sources?')) return;
      if(!isCurrent()) return;
      await call('/api/zotero/web/sources',{task_id:activeProject,sources:sourceDraft,export_collection:bound.collection||''});
      if(isCurrent()) await loadZotero();
    });
    let candidateRows = [], chosenKeys = new Set(), page=0, displayed=[], candidateState='idle';
    const pageSize=30;
    const canSelect=row=>!row.selected&&row.status!=='removing';
    const directCandidates=collection=>candidateRows.filter(row=>row.collections.includes(collection)&&canSelect(row));
    function renderCandidates(){
      const query=field('zs-filter').value.trim().toLocaleLowerCase();
      const collection=field('zs-browse-collection').value;
      const chosenOnly=field('zs-chosen-only').checked;
      const visible=candidateRows.filter(r=>chosenOnly?chosenKeys.has(r.key):(!collection||r.browse_collections.includes(collection))&&[r.title,r.authors,r.doi,r.key].join(' ').toLocaleLowerCase().includes(query));
      page=Math.min(page,Math.max(0,Math.ceil(visible.length/pageSize)-1));
      displayed=visible.slice(page*pageSize,(page+1)*pageSize);
      field('zs-prev').disabled=page===0;
      field('zs-next').disabled=(page+1)*pageSize>=visible.length;
      field('zs-visible').disabled=chosenOnly||!displayed.some(canSelect);
      field('zs-whole').disabled=chosenOnly||!collection||!directCandidates(collection).length;
      field('zs-filter').disabled=field('zs-browse-collection').disabled=chosenOnly;
      function updateCount(){
        const state={idle:'Candidates not read yet',loading:'Loading Zotero Literature...',error:'Read failed, try again',ready:`${visible.length} candidates · Ticked ${chosenKeys.size} items`};
        field('zs-candidate-count').textContent=state[candidateState];
        field('zs-select').disabled=!chosenKeys.size;
        field('zs-select').textContent=`Add ${chosenKeys.size} selected`;
      }
      field('zs-candidates').innerHTML=displayed.map(row=>{
        const status={selected:'Selected, to sync',excluded:'Removed, can be re-checked',removing:'Removing'}[row.status]||(row.selected?'Added to project':'');
        const collections=(row.collections||[]).map(key=>collectionNames.get(key)||key).join(', ');
        return `<label class="zs-candidate"><input type="checkbox" data-zs-member="${e(row.key)}" ${chosenKeys.has(row.key)?'checked':''} ${row.selected||row.status==='removing'?'disabled':''}><span><strong>${e(row.title)}</strong><small>${[row.doi||row.key,collections,status].filter(Boolean).map(e).join(' · ')}</small></span></label>`;
      }).join('');
      updateCount();
      field('zs-candidates').querySelectorAll('[data-zs-member]').forEach(input=>input.onchange=()=>{
        if(input.checked)chosenKeys.add(input.dataset.zsMember);else chosenKeys.delete(input.dataset.zsMember);
        if(chosenOnly)renderCandidates();else updateCount();
      });
    }
    field('zs-filter').oninput=field('zs-browse-collection').onchange=()=>{page=0;renderCandidates();};
    field('zs-chosen-only').onchange=()=>{page=0;renderCandidates();};
    field('zs-prev').onclick=()=>{page--;renderCandidates();};
    field('zs-next').onclick=()=>{page++;renderCandidates();};
    field('zs-clear').onclick=()=>{chosenKeys.clear();field('zs-chosen-only').checked=false;renderCandidates();};
    field('zs-visible').onclick=()=>{displayed.filter(canSelect).forEach(r=>chosenKeys.add(r.key));renderCandidates();};
    field('zs-browse').onclick=event=>action(event.target,async()=>{
      candidateState='loading';renderCandidates();
      try {
        const data=await call('/api/zotero/web/candidates?task_id='+encodeURIComponent(activeProject));
        if(!isCurrent()) return;
        showCollections(data.collections);
        candidateRows=data.items;
        const available=new Set(candidateRows.filter(canSelect).map(row=>row.key));
        for(const key of chosenKeys)if(!available.has(key))chosenKeys.delete(key);
        candidateState='ready';renderCandidates();
      } catch(err) {
        if(isCurrent()) { candidateState='error';renderCandidates(); }
        throw err;
      }
    });
    async function join(keys){
      const out=await call('/api/zotero/web/join',{task_id:activeProject,library:result.library,keys});
      if(!isCurrent())return;
      const joined=new Set(keys);
      candidateRows.forEach(row=>{if(joined.has(row.key)){row.status='active';row.selected=true;chosenKeys.delete(row.key);}});
      if(!chosenKeys.size)field('zs-chosen-only').checked=false;
      renderCandidates();
      field('integration-result').textContent=`Added ${out.total} papers, ${out.downloaded} with a local PDF.`;
      await onChange();
    }
    field('zs-select').onclick=event=>action(event.target,()=>join([...chosenKeys]));
    field('zs-whole').onclick=event=>action(event.target,async()=>{
      const collection=field('zs-browse-collection').value;
      const rows=directCandidates(collection);
      if(!rows.length)return;
      if(await uiConfirm(`Add the whole ”${collectionNames.get(collection)||collection}”: ${rows.length} papers?\n${rows.map(row=>row.title).join('\n')}`))await join(rows.map(row=>row.key));
    });
    renderCandidates();
    field("zs-mode").onchange = () => { preview = null; field("zs-apply").disabled = true; };
    field("zs-preview").onclick = event => action(event.target, async () => {
      const plan = await call("/api/zotero/web/sync", {task_id: projectId, mode: field("zs-mode").value, dry_run: true});
      if (!isCurrent()) return;
      preview = plan; renderPlan(plan);
      field("zs-apply").disabled = !!preview.conflicts.length || !preview.actions.length;
      showConflicts(preview.conflicts);
    });
    field("zs-apply").onclick = event => action(event.target, async () => {
      if (!preview || !await uiConfirm(`Apply the ${preview.actions.length} sync actions in the preview? This may change the project or the connected Zotero.`)) return;
      const result = await call("/api/zotero/web/sync", {task_id: projectId, mode: preview.mode, dry_run: false, plan_token: preview.plan_token, confirm: true});
      if (!isCurrent()) return;
      field("integration-result").textContent = result.ok ? `Sync complete; handled ${(result.applied || []).length} items.` : `Sync partially complete: ${result.error || 'preview again and retry'}`;
      preview = null; field('zs-plan').innerHTML = '';
      field("zs-apply").disabled = true;
      await onChange();
    });
    function renderPlan(plan) {
      field('zs-plan').innerHTML = `<p>Pending sync ${plan.actions.length} items · Conflicts ${plan.conflicts.length} items</p><ul>${plan.actions.map(a=>`<li>${e({pull:'Update project references',push:'Update Zotero',link:'Confirm link'}[a.kind] || a.kind)} · ${e(a.payload?.title || a.key || 'Literature')}${a.membership?'· Sync project tags':''}</li>`).join('')}</ul>`;
    }
    async function batchAction(batch, restore=false) {
      const data=await call('/api/zotero/web/links/'+(restore?'restore':'apply'),{task_id:projectId,batch_id:batch.id,confirm:true});
      if(!isCurrent()) return;
      const result=data.batch;
      field('integration-result').textContent=(result.status==='partial'?'Some items incomplete; retry or restore.':restore?'Project link restored.':'Project link removed.')+'\n'+result.data.items.filter(r=>r.error).map(r=>r.title+': '+r.error).join('\n');
      await loadBatches();
      preview=null;field('zs-apply').disabled=true;field('zs-plan').innerHTML='';
      await onChange();
    }
    async function loadBatches(){
      if(!bound.library) return;
      const data=await call('/api/zotero/web/links?task_id='+encodeURIComponent(projectId));
      if(!isCurrent()||!field('zs-batches')) return;
      field('zs-batches').innerHTML=(data.batches||[]).map(b=>`<div class="integration-actions"><span>${e(new Date(Number(b.created_at)*1000).toLocaleString())} · ${e({applied:"Removed",partial:"Partly done",restored:"Restored",preview:"To confirm",applying:"Processing",restoring:"Restoring"}[b.status]||b.status)} · ${(b.data.items||[]).length} items</span>${b.status!=='preview'?`<button class="btn ghost" data-zs-restore="${e(b.id)}">Restore this link</button>`:''}${b.status==='partial'?`<button class="btn ghost" data-zs-retry="${e(b.id)}">Retry unfinished items</button>`:''}</div>`).join('');
      for(const b of data.batches||[]){
        field('zs-batches').querySelector(`[data-zs-restore="${CSS.escape(b.id)}"]`)?.addEventListener('click',event=>action(event.target,()=>batchAction(b,true)));
        field('zs-batches').querySelector(`[data-zs-retry="${CSS.escape(b.id)}"]`)?.addEventListener('click',event=>action(event.target,()=>batchAction(b,b.data.operation==='restore')));
      }
    }
    field('zs-unlink-preview').onclick=event=>action(event.target,()=>previewRemoval());
    async function previewRemoval(keys) {
      const data=await call('/api/zotero/web/links/preview',{task_id:projectId,...(keys ? {keys} : {})});
      if(!isCurrent()) return;
      const batch=data.batch;
      show('history');
      field('zs-unlink').innerHTML=`<p>${batch.data.items.length} links. Unticking keeps the matching papers.</p>${batch.data.items.map((r,i)=>`<label style="display:block;margin:6px 0"><input type="checkbox" data-zs-unlink-key="${e(r.key)}" checked> ${e(r.title)} <small>Other projects: ${e((r.shared_projects||[]).join(', ')||'None')} · Notes ${r.references?.notes||0} · Workflow ${(r.references?.runs||[]).length}</small></label>`).join('')}<button class="btn" id="zs-unlink-apply" ${batch.data.items.length?'':'disabled'}>Remove the selected project links</button>`;
      field('zs-unlink-apply').onclick=event=>action(event.target,async()=>{
        const keys=[...field('zs-unlink').querySelectorAll('[data-zs-unlink-key]:checked')].map(el=>el.dataset.zsUnlinkKey);
        if(!keys.length) throw new Error('Select at least one link');
        const selected=keys.length===batch.data.items.length?batch:(await call('/api/zotero/web/links/preview',{task_id:projectId,keys})).batch;
        if(!await uiConfirm(`Remove ${keys.length} papers from this project? Zotero items and other projects are kept; undo from the log.`)) return;
        await batchAction(selected); if(isCurrent()) field('zs-unlink').innerHTML='';
      });
      field('zs-unlink').scrollIntoView({block:'nearest'});
    }
    function showConflicts(rows){
      field('zs-conflicts').innerHTML=rows.map((r,i)=>`<div class="integration-actions"><span>${e(r.title||r.key||'Literature conflicts')} · ${e(r.reason)}</span>${r.candidates?.length?`<select class="control" data-zs-candidate="${i}" aria-label="Pick the matching Zotero item">${r.candidates.map(c=>`<option value="${e(c.key)}">${e(c.title)} · ${e(c.doi)} · ${e(c.key)}</option>`).join('')}</select>`:''}${r.result_id?`<button class="btn ghost" data-zs-compare="${i}">Compare and resolve</button>`:''}${r.key?`<button class="btn ghost" data-zs-unlink-conflict="${i}">ReleaseCurrent projectLinks</button>`:''}</div>`).join('');
      field('zs-conflicts').querySelectorAll('[data-zs-unlink-conflict]').forEach(button=>button.onclick=event=>action(event.target,async()=>{
        const r=rows[Number(button.dataset.zsUnlinkConflict)];
        const data=await call('/api/zotero/web/links/preview',{task_id:projectId,keys:[r.key]});
        if(!await uiConfirm(`Unlink "${r.title||r.key}" from the current project? The original record and history are kept.`)) return;
        await batchAction(data.batch);button.parentElement.textContent='Unlinked; preview the sync again.';preview=null;field('zs-apply').disabled=true;
      }));
      field('zs-conflicts').querySelectorAll('[data-zs-compare]').forEach(button=>button.onclick=event=>action(event.target,async()=>{
        const r={...rows[Number(button.dataset.zsCompare)]};
        r.key=button.parentElement.querySelector('[data-zs-candidate]')?.value || r.key;
        const params=new URLSearchParams({task_id:projectId,result_id:r.result_id||'',key:r.key||r.item_key||''});
        const data=await call('/api/zotero/web/links/compare?'+params);
        if(!isCurrent()) return;
        const panel=document.createElement('div');
        panel.innerHTML=`<table style="width:100%;table-layout:fixed"><thead><tr><th>Fields</th><th>Project</th><th>Zotero</th></tr></thead><tbody>${[['title','Title'],['authors','Author'],['year','Year'],['doi','DOI'],['url','Link'],['abstract','Abstract']].map(([key,label])=>`<tr><th>${label}${data.local[key]!==data.remote[key]?'· differs':''}</th><td style="overflow-wrap:anywhere">${e(data.local[key])}</td><td style="overflow-wrap:anywhere">${e(data.remote[key])}</td></tr>`).join('')}</tbody></table><div class="integration-actions"><button class="btn" data-zs-decision="local">Use the project version</button><button class="btn" data-zs-decision="zotero">Adopt Zotero Version</button><button class="btn ghost" data-zs-detach>ReleaseCurrent projectLinks</button></div>`;
        button.parentElement.replaceWith(panel);
        panel.querySelectorAll('[data-zs-decision]').forEach(b=>b.onclick=event=>action(event.target,async()=>{
          await call('/api/zotero/web/links/resolve',{version:data.version,local_hash:data.local_hash,task_id:projectId,result_id:r.result_id,key:r.key||r.item_key,decision:b.dataset.zsDecision,confirm:true});
          if(!isCurrent()) return;
          panel.textContent='Done. Please preview the sync again.'; preview=null; field('zs-apply').disabled=true;
          await onChange();
        }));
        panel.querySelector('[data-zs-detach]').onclick=event=>action(event.target,async()=>{const p=await call('/api/zotero/web/links/preview',{task_id:projectId,keys:[r.key||r.item_key]});await batchAction(p.batch);panel.textContent='Unlinked';});
      }));
    }
    let statusBusy=false;
    async function refreshStatus(){
      if(!isCurrent()||statusBusy)return;
      statusBusy=true;
      try {
        const data=await call('/api/zotero/web/auto?task_id='+encodeURIComponent(projectId));
        if(!isCurrent())return;
        const state=data.auto_sync||{}, last=data.binding?.last_sync;
        field('zs-auto-state').textContent=({disabled:'Off',waiting:'Waiting for next check',synced:'Synced',conflict:'Resolve conflict',error:'Sync failed'}[state.status]||state.status||'Off')+(state.error?' · '+state.error:'');
        field('zs-last-sync').textContent=last?'· last synced'+new Date(Number(last)*1000).toLocaleString():'';
      } finally {statusBusy=false;}
    }
    controls.set(container, {previewRemoval,refreshStatus,show});
    await loadBatches();
    if (sourceDraft.length && isCurrent()) {
      try { await loadCollections(); } catch (err) { if (isCurrent()) error(err); }
    }
    return { previewRemoval };
  }
  window.ProjectZotero = { mount, show: (container,view) => controls.get(container)?.show(view), refreshStatus: container => controls.get(container)?.refreshStatus(), async previewRemoval(container, keys) {
    await pending.get(container);
    if(!controls.has(container)) throw new Error('Read the project source config first');
    return controls.get(container).previewRemoval(keys);
  } };
})();
