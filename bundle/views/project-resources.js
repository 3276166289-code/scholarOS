/* One catalog; categories refer to the original files and canonical assets. */
const ProjectResources=(()=>{
  const labels={all:'All',literature:'Literature',note:'Research notes',manuscript:'Paper manuscript',experiment:'Experiment log',output:'Delivered output',file:'Other files'};
  const reviewLabels={source:'Source material',delivered:'Delivered',awaiting_review:'To verify',rejected:'Returned',superseded:'Version history',modified:'Revision to confirm',blocked:'Waiting on dependencies',unverified:'Source to confirm',queued:'Queued',running:'Running',failed:'Failed',interrupted:'Interrupted',cancelled:'Stopped'};
  const h=value=>esc(String(value??''));

  function renderItem(row,index){
    const title=row.title||'Untitled material';
    const location=row.relative||row.metadata?.doi||row.path||(row.kind==='literature'?'Literature record · No PDF yet':'Project material record');
    const status=reviewLabels[row.review_status];
    const canUse=row.exists&&row.relative&&!row.controlled&&!row.node_result&&!row.metadata?.project_task_id;
    return `<li class="pr-item-row">
      <span class="pr-kind" data-kind="${h(row.kind)}">${labels[row.kind]||'File'}</span>
      <button type="button" class="pr-item" data-pr-item="${index}" title="${h(location)}">
        <strong>${h(title)}</strong><small>${h(location)}</small>
      </button>
      ${status?`<span class="pr-review-state" data-status="${h(row.review_status)}">${status}</span>`:''}
      <div class="pr-item-actions">
        ${canUse?`<button type="button" class="pw-text-button" data-pr-action="reference" data-pr-row="${index}" title="Quote in chat">Cite</button><button type="button" class="pw-text-button" data-pr-action="handoff" data-pr-row="${index}" title="Assign to default executor">Hand to processing</button>`:''}
        <button type="button" class="btn ghost" data-pr-item="${index}" aria-label="${row.exists?'Open':'View records'}: ${h(title)}">${row.exists?'Open':'View records'}</button>
      </div>
    </li>`;
  }

  async function openItem(row,projectId){
    if(row.node_result&&row.node_result.available!==false){
      const taskId=row.node_result.task_id||row.node_result.id||row.task_id||row.metadata?.project_task_id;
      return ProjectWorkspace.openNodeResult({...row.node_result,project_id:projectId,task_id:taskId},projectId);
    }
    if(row.controlled||row.metadata?.project_task_id){
      const taskId=row.task_id||row.metadata?.project_task_id;
      if(!taskId)throw new Error('This output’s source is unconfirmed; check the task run log.');
      return ProjectWorkspace.openTask(taskId,projectId);
    }
    if(row.paper_id)return ProjectWorkspace.openPaper(row);
    if(row.exists&&row.relative)return ProjectWorkspace.openFile({path:row.path,rel:row.relative,name:row.title,read_only:!!row.read_only},projectId,{peek:false});
    if(row.kind==='literature')return ProjectWorkspace.showResource('papers');
    throw new Error('Project file not found; check the path under "Folders and files".');
  }

  async function mount(host,projectId,{kind='',live=()=>host.isConnected}={}){
    let filter=kind,query='',request=0,defaultOutputStatus=kind==='output';
    host.innerHTML=`<section class="pr-catalog" aria-label="Project material folder">
      <header class="pr-heading">
        <p class="pr-summary" role="status"></p>
        <button class="btn ghost" type="button" data-pr-index>Organise the index</button>
      </header>
      <div class="pr-toolbar">
        <div class="pr-query">
          <form class="pr-search" role="search">
            <input class="control" type="search" aria-label="Search the unified library" placeholder="Search titles, paths, or tags">
            <button class="btn" type="submit">Search</button>
            <button class="pw-text-button" type="button" data-pr-clear hidden>Clear search</button>
          </form>
          <label class="pr-review-filter">Review state<select class="control" aria-label="Filter by review state">
            <option value="all">All states</option>${Object.entries(reviewLabels).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}
          </select></label>
        </div>
        <nav class="pr-filters" aria-label="Filter by material type">${Object.entries(labels).map(([key,label])=>`<button type="button" data-pr-kind="${key==='all'?'':key}" aria-pressed="false">${label}<span aria-hidden="true"></span></button>`).join('')}</nav>
      </div>
      <p class="pw-error" data-pr-error role="alert"></p>
      <div class="pr-items" aria-busy="true"></div>
    </section>`;
    const list=host.querySelector('.pr-items');
    const summary=host.querySelector('.pr-summary');
    const err=host.querySelector('[data-pr-error]');
    const search=host.querySelector('input[type=search]');
    const status=host.querySelector('select');
    const clear=host.querySelector('[data-pr-clear]');
    const categories=[...host.querySelectorAll('[data-pr-kind]')];
    status.value=kind==='output'?'delivered':'all';

    async function load(){
      const version=++request;
      categories.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.prKind===filter)));
      list.setAttribute('aria-busy','true');
      list.innerHTML='<p class="hint pr-loading">Reading project material...</p>';
      try{
        const params=new URLSearchParams({project_id:projectId,kind:filter,q:query,review_status:status.value});
        const data=await api('/api/project/resources?'+params);
        if(!live()||version!==request)return;
        summary.innerHTML=`<span>All material <strong>${data.catalog_total}</strong></span><span>Current results <strong>${data.total}</strong></span>`;
        categories.forEach(button=>{
          const kind=button.dataset.prKind;
          button.querySelector('span').textContent=kind?data.counts[kind]:Object.values(data.counts).reduce((sum,count)=>sum+count,0);
        });
        const filtered=query||filter||status.value!=='all';
        if(data.items.length){
          list.innerHTML=`<ul class="pr-result-list" aria-label="Source list">${data.items.map(renderItem).join('')}</ul>`;
        }else if(filtered){
          list.innerHTML='<div class="pw-empty"><h3>No material matches</h3><p>AdjustKeywords, material type or review state.</p><button class="btn ghost" type="button" data-pr-reset>Reset filters</button></div>';
        }else{
          list.innerHTML='<div class="pw-empty"><h3>No project material to browse yet</h3><p>Upload files or import literature. Existing project files can be registered with "Rebuild index".</p></div>';
        }
        list.querySelector('[data-pr-reset]')?.addEventListener('click',()=>{
          filter='';status.value='all';defaultOutputStatus=false;search.value='';applySearch();search.focus();
        });
        list.querySelectorAll('[data-pr-item], [data-pr-action]').forEach(button=>button.onclick=async()=>{
          const row=data.items[Number(button.dataset.prItem??button.dataset.prRow)];
          button.disabled=true;err.textContent='';
          try{
            if(button.dataset.prAction==='reference')await ProjectWorkspace.referenceResource(row,projectId);
            else if(button.dataset.prAction==='handoff')await ProjectWorkspace.handoffResource(row,projectId);
            else await openItem(row,projectId);
          }catch(error){if(live())err.textContent=error.message;}
          finally{if(button.isConnected)button.disabled=false;}
        });
      }catch(error){
        if(live()&&version===request){err.textContent=error.message;list.replaceChildren();}
      }finally{
        if(live()&&version===request)list.setAttribute('aria-busy','false');
      }
    }

    function applySearch(){
      query=search.value.trim();
      clear.hidden=!query;
      err.textContent='';
      return load();
    }
    host.querySelector('form').onsubmit=event=>{event.preventDefault();applySearch();};
    search.oninput=()=>{
      clear.hidden=!(search.value||query);
      if(!search.value&&query)applySearch();
    };
    clear.onclick=()=>{search.value='';applySearch();search.focus();};
    status.onchange=()=>{defaultOutputStatus=false;err.textContent='';load();};
    categories.forEach(button=>button.onclick=()=>{
      const next=button.dataset.prKind;
      if(filter!==next){
        if(defaultOutputStatus)status.value='all';
        defaultOutputStatus=next==='output'&&status.value==='all';
        if(defaultOutputStatus)status.value='delivered';
        filter=next;
      }
      err.textContent='';load();
    });
    host.querySelector('[data-pr-index]').onclick=async event=>{
      const button=event.currentTarget;
      button.disabled=true;button.textContent='Tidying...';err.textContent='';
      try{
        const result=await api('/api/project/resources/index',{project_id:projectId});
        if(live()){
          if(result.truncated)err.textContent='The index reached 10000 files. See the rest under "Folders and files".';
          await load();
        }
      }catch(error){if(live())err.textContent=error.message;}
      finally{if(button.isConnected){button.disabled=false;button.textContent='Rebuild index';}}
    };
    await load();
  }
  return {mount};
})();
