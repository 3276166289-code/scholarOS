/* RSS discovery, source reading and project bibliography share one list. */
const IntelligenceView=(()=>{
  const h=value=>esc(String(value??''));
  const filters={source:'',q:'',year:'',project_id:''};
  function renderRow(row,selected,expanded,recovering){
    const url=LiteratureImport.safeLink(row.link);
    const paragraphs=(row.summary||'').trim().split(/\n\s*\n/).filter(Boolean);
    return `<article class="it-row${selected?' sel':''}" data-intel-id="${h(row.id)}">
      <input type="checkbox" data-it-select aria-label="Select ${h(row.title)}" ${selected?'checked':''}>
      <div class="it-content">
        ${url?`<a class="it-t" href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(row.title)}</a>`:`<span class="it-t">${h(row.title)}</span>`}
        <div class="it-m">
          <div class="it-authors"><span class="it-meta-label">Author</span> ${h(row.authors||'Not provided')}</div>
          <div class="it-meta-line">
            <span><span class="it-meta-label">Published</span> ${h(row.published_at||'Not provided')}</span>
            <span><span class="it-meta-label">Source</span> ${h(row.source_title||'Not provided')}${row.source_deleted?' (removed)':''}</span>
          </div>
        </div>
        <details class="it-summary" ${expanded?'open':''}>
          <summary>Abstract and details</summary>
          <div class="it-summary-body">
            ${paragraphs.length?`<div class="it-abstract">${paragraphs.map(text=>`<p>${h(text)}</p>`).join('')}</div>`:'<p class="hint">The feed gave no abstract</p>'}
            ${url?`<a class="it-url" href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(url)}</a>`:'<p class="hint">No openable web link was provided</p>'}
            ${row.can_recover_arxiv?`<button type="button" class="btn ghost it-recover" data-it-recover ${recovering?'disabled':''}>${recovering?'Reading arXiv...':'Fill in the abstract from arXiv'}</button>`:''}
            <p class="hint it-recovery-status" data-it-recovery-status role="status">${h(row.recoveryMessage)}</p>
          </div>
        </details>
        <div class="it-actions">
          ${url?`<a class="btn ghost" data-it-original href="${h(url)}" target="_blank" rel="noopener noreferrer">View original ↗</a><button class="btn ghost" data-it-copy>Copy link</button>`:''}
          <button class="btn ghost" data-it-import>${row.imported_result_id?'already in the project · View':'Import project'}</button>
          ${row.imported_result_id?'<span class="pill it-imported">References imported</span>':''}
        </div>
      </div>
    </article>`;
  }
  async function render(container){
    if(!S.tasks?.some(p=>p.id===filters.project_id))filters.project_id=S.tasks?.some(p=>p.id===curTask)?curTask:'';
    const state={rows:[],selected:new Set(),recovering:new Set(),version:0,timer:0};
    container.innerHTML=`<section class="card intel intel-library"><div class="it-head"><div><h3>Daily digest <span class="pill" id="itCount">...</span></h3><p class="hint">Find papers, read the originals, then import the references you need into a project.</p></div><div class="rss-actions"><button class="btn ghost" id="itManualImport">Link / DOI Import</button><button class="btn ghost" id="itSourceSettings">Feed settings</button><button class="btn" id="itGo">Refresh</button></div></div><div class="it-bar"><select id="itSrc" class="control" aria-label="Filter digest sources"><option value="">All sources</option></select><input id="itQ" type="search" aria-label="Search the digest" placeholder="Keywords (Title / Abstract / authors)" value="${h(filters.q)}"><input id="itYear" aria-label="Filter by year" placeholder="Year" inputmode="numeric" value="${h(filters.year)}"></div><div class="it-import-bar"><label>Import project<select class="control" id="itProject" aria-label="Import digests into a project"><option value="">Choose the target project</option>${(S.tasks||[]).map(p=>`<option value="${h(p.id)}" ${p.id===filters.project_id?'selected':''}>${h(p.title)}</option>`).join('')}</select></label><button class="btn ghost" id="itOpenLibrary">OpenProject literature</button><span class="pw-spacer"></span><label><input type="checkbox" id="itSelectAll"> Choose from the current results</label><button class="btn" id="itImportSelected" disabled>Import selected (0)</button></div><p class="hint" id="itMsg" role="status" aria-live="polite"></p><div class="it-list" id="itList"></div></section>`;
    const el=id=>container.querySelector('#'+id),live=()=>container.isConnected&&!!el('itList');
    function selection(){const ids=state.rows.map(row=>row.id);el('itSelectAll').checked=!!ids.length&&ids.every(id=>state.selected.has(id));el('itSelectAll').indeterminate=ids.some(id=>state.selected.has(id))&&!el('itSelectAll').checked;el('itImportSelected').disabled=!state.selected.size;el('itImportSelected').textContent=`Import selected (${state.selected.size})`;el('itOpenLibrary').disabled=!filters.project_id;}
    function importItems(items){LiteratureImport.open({projectId:filters.project_id,items,onImported:async result=>{filters.project_id=result.project_id;el('itProject').value=result.project_id;await load();}});}
    async function recover(row,card){
      if(state.recovering.has(row.id))return;
      const button=card.querySelector('[data-it-recover]');
      const status=card.querySelector('[data-it-recovery-status]');
      state.recovering.add(row.id);
      button.disabled=true;
      button.textContent='Reading arXiv...';
      status.textContent='';
      try{
        const {item}=await api('/api/rss/recover-arxiv',{item_id:row.id});
        state.recovering.delete(row.id);
        if(!live())return;
        const ownsFocus=document.activeElement===button||document.activeElement===document.body;
        state.rows=state.rows.map(current=>current.id===item.id?{...current,...item,recoveryMessage:'arXiv info completed'}:current);
        paint();
        if(ownsFocus)el('itList').querySelector(`[data-intel-id="${CSS.escape(row.id)}"] summary`)?.focus({preventScroll:true});
      }catch(error){
        state.recovering.delete(row.id);
        if(!live())return;
        const current=el('itList').querySelector(`[data-intel-id="${CSS.escape(row.id)}"]`);
        if(!current)return;
        current.querySelector('[data-it-recovery-status]').textContent=error.message;
        const retry=current.querySelector('[data-it-recover]');
        if(retry){
          retry.disabled=false;
          retry.textContent='Fill in the abstract from arXiv';
        }
      }
    }
    function paint(){
      const expanded=new Set([...el('itList').querySelectorAll('.it-summary[open]')].map(details=>details.closest('[data-intel-id]').dataset.intelId));
      el('itList').innerHTML=state.rows.map(row=>renderRow(row,state.selected.has(row.id),expanded.has(row.id),state.recovering.has(row.id))).join('')||'<p class="hint">No intel yet. Refresh enabled feeds, or import literature manually by link / DOI.</p>';
      el('itList').querySelectorAll('[data-intel-id]').forEach(card=>{const row=state.rows.find(row=>row.id===card.dataset.intelId);card.querySelector('[data-it-select]').onchange=event=>{event.target.checked?state.selected.add(row.id):state.selected.delete(row.id);card.classList.toggle('sel',event.target.checked);selection();};card.querySelector('[data-it-import]').onclick=()=>row.imported_result_id?ProjectLiterature.open(filters.project_id):importItems([row]);
        const recoverButton=card.querySelector('[data-it-recover]');
        if(recoverButton)recoverButton.onclick=()=>recover(row,card);
        // the checkbox is off-screen, so the whole row toggles; links, buttons, and abstracts still work
        card.addEventListener('click',event=>{if(event.target.closest('a,button,input,details,summary'))return;const box=card.querySelector('[data-it-select]');box.checked=!box.checked;box.dispatchEvent(new Event('change',{bubbles:true}));card.classList.toggle('sel',box.checked);});const copy=card.querySelector('[data-it-copy]');if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(row.link);el('itMsg').textContent='Source link copied';}catch{el('itMsg').textContent='Copy failed; copy the link from "Summary and details".';}};});selection();
    }
    async function load(){const version=++state.version;const data=await api('/api/rss/items?'+new URLSearchParams(filters));if(!live()||version!==state.version)return;state.rows=data.items||[];state.selected=new Set([...state.selected].filter(id=>state.rows.some(row=>row.id===id)));el('itCount').textContent=`${data.total||0} items`;paint();}
    async function sources(){const data=await api('/api/rss/sources');if(!live())return;if(filters.source&&!data.sources.some(source=>source.id===filters.source))filters.source='';el('itSrc').innerHTML='<option value="">All sources</option>'+data.sources.map(source=>`<option value="${h(source.id)}" ${source.id===filters.source?'selected':''}>${h(source.title)} (${source.count})</option>`).join('');}
    async function reload(){try{await load();}catch(error){if(live())el('itMsg').textContent=error.message;}}
    el('itGo').onclick=async()=>{const button=el('itGo');if(button.disabled)return;button.disabled=true;button.textContent='Fetching...';el('itMsg').textContent='Fetching the enabled RSS Source...';try{const result=await api('/api/rss/refresh',{});if(!live())return;el('itMsg').textContent=`Fetched ${result.fetched}/${result.sources} sources, adding ${result.added} items${result.failures?.length?'; Failed '+result.failures.length+'  ('+result.failures.map(row=>row.title).join(', ')+')':''}`;await sources();await load();}catch(error){if(live())el('itMsg').textContent='Refresh failed:'+error.message;}finally{if(live()){button.disabled=false;button.textContent='Refresh';}}};
    el('itSourceSettings').onclick=()=>RSSSettings.open();el('itManualImport').onclick=()=>LiteratureImport.open({projectId:filters.project_id,onImported:reload});
    el('itOpenLibrary').onclick=()=>ProjectLiterature.open(filters.project_id);
    el('itImportSelected').onclick=()=>importItems(state.rows.filter(row=>state.selected.has(row.id)));
    el('itSelectAll').onchange=event=>{state.selected=event.target.checked?new Set(state.rows.map(row=>row.id)):new Set();paint();};
    el('itProject').onchange=event=>{filters.project_id=event.target.value;reload();};el('itSrc').onchange=event=>{filters.source=event.target.value;reload();};
    for(const [id,key] of [['itQ','q'],['itYear','year']])el(id).oninput=event=>{filters[key]=event.target.value.trim();clearTimeout(state.timer);state.timer=setTimeout(reload,300);};
    try{await sources();await load();}catch(error){if(live())el('itMsg').textContent='Read failed:'+error.message;}
  }
  return {render};
})();
