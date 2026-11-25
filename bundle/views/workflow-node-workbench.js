/* A completed node result keeps one identity through preview, revision and review. */
const WorkflowNodeWorkbench=(()=>{
  'use strict';
  const h=value=>esc(String(value??''));
  const copy=value=>{
    if(value===null||typeof value!=='object')return value;
    if(Array.isArray(value))return value.map(item=>typeof item==='object'&&item!==null?{...item}:item);
    return JSON.parse(JSON.stringify(value));
  };
  const textOf=value=>typeof value==='string'?value:JSON.stringify(value??{},null,2);
  const statuses={draft:'Not started',ready:'Executable',pending:'Not started',awaiting_review:'Awaiting manual review',delivered:'Delivered',blocked:'To handle',running:'Running',queued:'Queued',succeeded:'Completed',failed:'Failed',interrupted:'Interrupted, pending resume',cancelled:'Stopped'};
  let current=null;
  let windowId;
  try{windowId=sessionStorage.getItem('rw-node-window');if(!windowId){windowId=crypto.randomUUID();sessionStorage.setItem('rw-node-window',windowId);}}catch{windowId=crypto.randomUUID();}

  function query(selection,artifactId){
    const params=new URLSearchParams({project_id:selection.project_id,id:selection.task_id||selection.id,window_id:windowId});
    if(selection.task_run_id)params.set('task_run_id',selection.task_run_id);
    if(selection.output_revision!==undefined&&selection.output_revision!==null)params.set('output_revision',selection.output_revision);
    if(artifactId)params.set('artifact_id',artifactId);
    return params.toString();
  }
  const eligible=task=>!!task?.node_result?.available;
  function availableSelection(task){return {task_id:task.id,project_id:task.project_id,task_run_id:task.node_result?.task_run_id,output_revision:task.node_result?.output_revision};}
  function dirty(){return !!current?.alive()&&current.draftDirty;}
  async function flush(){return !current?.alive()||await current.saveDraft();}
  function dispose(){current?.dispose();current=null;}

  async function mount(host,options){
    dispose();
    const state={host,options,result:null,artifact:null,preview:null,value:'',baseline:'',reason:'',feedback:'',draftVersion:0,draftDirty:false,busy:false,mode:'preview',rendererView:{},request:0,autosave:null,savePromise:null,disposed:false};
    const el=name=>host.querySelector('[data-wnw-'+name+']');
    state.alive=()=>!state.disposed&&host.isConnected&&options.live();
    state.dispose=()=>{state.disposed=true;clearTimeout(state.autosave);clearInterval(state.poll);if(state.onFsChange)document.removeEventListener('fullscreenchange',state.onFsChange);document.body.classList.remove('has-wnw-fullscreen');};
    host.__nodeDispose=state.dispose;current=state;
    const changed=()=>state.value!==state.baseline;
    const editable=()=>!!state.result?.editable&&state.artifact?.editable!==false&&state.preview?.editable!==false;
    const message=(text,error=false)=>{if(state.alive()){el(error?'error':'notice').textContent=text||'';}};
    const command=(action,payload={})=>api('/api/project-tasks/node-command',{project_id:state.result.identity.project_id,id:state.result.identity.task_id,action,identity:copy(state.result.identity),request_key:crypto.randomUUID(),...payload});

    function skeleton(){
      host.innerHTML=`<article class="wnw" aria-label="Node output workbench">
        <header class="wnw-heading"><div><span class="pw-eyebrow">Workflow output · Preview and edit</span><h3 data-wnw-title>LoadingNode output...</h3><p class="hint" data-wnw-meta></p></div><div class="wnw-heading-actions"><button class="btn ghost" type="button" data-wnw-fullscreen title="View and edit the output full screen">Full screen</button><button class="btn ghost" type="button" data-wnw-origin>Back to the originating chat</button><button class="btn ghost" type="button" data-wnw-locate>Locate the node in the flow</button></div></header>
        <p class="pw-error" data-wnw-error role="alert"></p><p class="wnw-notice" data-wnw-notice role="status"></p>
        <div class="wnw-versionbar"><button class="btn btn-primary" type="button" data-wnw-collect hidden>Pins the saved output and opens it for editing and review</button><button class="btn ghost" type="button" data-wnw-stop hidden>Stop this node</button><button class="btn" type="button" data-wnw-start hidden>Continue this node</button><label>View versions<select class="control" data-wnw-version aria-label="Node output versions"></select></label><span class="wnw-status" data-wnw-status></span><button class="pw-text-button" type="button" data-wnw-latest hidden>has updates; viewLatest version</button></div>
        <div class="wnw-grid">
          <aside class="wnw-context" aria-label="Workflow and stage output">
            <section><h4>Workflow stage</h4><nav class="wnw-steps" data-wnw-steps aria-label="Workflow stage"></nav></section>
            <section><h4>This stage’s output</h4><nav class="wnw-artifacts" data-wnw-files aria-label="Node output list"></nav></section>
            <section class="wnw-requirements"><h4>Node requirements</h4><p data-wnw-goal></p><div data-wnw-guide hidden></div><details><summary>Input and upstream delivery</summary><div data-wnw-inputs></div></details><details><summary>Review checklist</summary><div data-wnw-checks></div></details><div data-wnw-next hidden></div></section>
          </aside>
          <section class="wnw-document" aria-label="Preview and edit output"><header class="wnw-document-heading"><div><strong data-wnw-file-title></strong><small data-wnw-file-meta></small></div><button type="button" class="btn" data-wnw-export-edit hidden>Edit the source and regenerate</button><div class="wnw-modes" role="group" aria-label="How output is shown"><button type="button" data-wnw-mode="preview" aria-pressed="true">Preview</button><button type="button" data-wnw-mode="edit" aria-pressed="false">Edit</button><button type="button" data-wnw-mode="diff" aria-pressed="false">Version differences</button><button type="button" class="btn ghost" data-pw-output-edit data-wnw-file-edit hidden>Manual revision</button></div></header><div data-wnw-content class="wnw-content"><p class="hint">LoadingOutput...</p></div><label class="wnw-reason">Revision note<input class="control" data-wnw-reason placeholder="Record why this change was made"></label></section>
          <aside class="wnw-agent"><h4>Node expert</h4><p data-wnw-executor></p><p class="hint">Discussing keeps the current review target; handing it to an expert redoes this node from the version on screen.</p><button class="pw-text-button" type="button" data-wnw-quote>Quote the selection</button><blockquote data-wnw-selection hidden></blockquote><label>Discuss or request changes<textarea class="control" data-wnw-instruction rows="6" placeholder="Point out what needs checking or changing"></textarea></label><div class="wnw-agent-buttons"><button type="button" class="btn ghost" data-wnw-discuss>Discuss this</button><button type="button" class="btn" data-wnw-rework>Hand to an expert to revise</button></div><details data-wnw-tool-fields hidden><summary>Pin tool arguments</summary><p class="hint">Change the arguments and rerun; the previous tool output is kept.</p><textarea class="control wnw-code" data-wnw-tool-args rows="7" aria-label="Pin tool arguments"></textarea></details><details><summary>Create a linked task</summary><p class="hint">Handles the new request separately; decide whether to adopt it afterwards.</p><button type="button" class="btn ghost" data-wnw-duplicate>Create a task from the request</button></details><details><summary>the original reply</summary><pre data-wnw-original></pre></details></aside>
        </div>
        <footer class="wnw-footer"><label>Review note<textarea class="control" data-wnw-feedback rows="2" placeholder="State the required changes when returning"></textarea></label><div class="wnw-footer-actions"><span class="hint" data-wnw-draft-state></span><button type="button" class="btn ghost" data-wnw-draft>Save draft</button><button type="button" class="btn" data-wnw-save>Save revision</button><button type="button" class="btn ghost" data-wnw-reject>Return for revision</button><button type="button" class="btn btn-primary" data-wnw-approve>Pass and deliver</button></div></footer>
      </article>`;
      const toggleFullscreen=()=>{
        const article=host.querySelector('.wnw')||host;
        const isFs=article.classList.contains('wnw-fullscreen')||!!document.fullscreenElement;
        if(isFs){
          article.classList.remove('wnw-fullscreen');
          document.body.classList.remove('has-wnw-fullscreen');
          if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
          const btn=el('fullscreen');if(btn)btn.textContent='Fullscreen';
        }else{
          article.classList.add('wnw-fullscreen');
          document.body.classList.add('has-wnw-fullscreen');
          if(article.requestFullscreen)article.requestFullscreen().catch(()=>{});
          const btn=el('fullscreen');if(btn)btn.textContent='Exit full screen';
        }
      };
      const fsBtn=el('fullscreen');if(fsBtn)fsBtn.onclick=toggleFullscreen;
      state.onFsChange=()=>{
        const article=host.querySelector('.wnw')||host;
        const btn=el('fullscreen');
        if(!document.fullscreenElement&&article&&!article.classList.contains('wnw-fullscreen')){
          document.body.classList.remove('has-wnw-fullscreen');
          if(btn)btn.textContent='Fullscreen';
        }
      };
      document.addEventListener('fullscreenchange',state.onFsChange);
      el('origin').onclick=()=>options.openConversation(state.result?.origin_chat_id||options.selection.chat_id||state.result?.chat_id);
      el('locate').onclick=()=>options.locate(state.result.identity);
      el('draft').onclick=()=>state.saveDraft();
      el('save').onclick=saveRevision;
      el('approve').onclick=()=>review(true);
      el('reject').onclick=()=>review(false);
      el('rework').onclick=rework;
      el('discuss').onclick=discuss;
      el('duplicate').onclick=duplicate;
      el('latest').onclick=()=>options.select({task_id:state.result.identity.task_id,project_id:state.result.identity.project_id});
      el('reason').oninput=()=>{state.reason=el('reason').value;scheduleDraft();};
      el('feedback').oninput=()=>{state.feedback=el('feedback').value;scheduleDraft();};
      el('instruction').oninput=scheduleDraft;
      el('quote').onclick=captureSelection;
      el('export-edit').onclick=async()=>{if(!await state.saveDraft())return;state.mode='edit';await selectArtifact(state.result.artifacts.find(item=>item.id==='export-source'));};
      el('file-edit').onclick=()=>{const artifact=state.artifact,index=artifact?.id?.startsWith('file:')?Number(artifact.id.slice(5)):-1;if(index>=0)ProjectOutputReview.open(state.result.identity.project_id,state.result.identity.task_id,index,async()=>{options.changed?.();await options.openTask(state.result.identity.task_id);});};
      host.querySelectorAll('[data-wnw-mode]').forEach(button=>button.onclick=async()=>{state.mode=button.dataset.wnwMode;await drawContent();updateButtons();});
      host.addEventListener('keydown',event=>{
        if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();saveRevision();}
        if(event.key==='Escape'){const article=host.querySelector('.wnw')||host;if(article.classList.contains('wnw-fullscreen')||document.fullscreenElement){event.preventDefault();event.stopPropagation();toggleFullscreen();}}
        if(event.key==='F11'){event.preventDefault();event.stopPropagation();toggleFullscreen();}
      });
    }
    function updateButtons(){
      if(!state.result||!state.alive())return;
      const conflict=!!state.result.fileop_conflicts?.length,canEdit=editable()&&!conflict,canReview=state.result.editable&&state.result.task.status==='awaiting_review'&&!conflict;
      el('save').disabled=state.busy||!canEdit||!changed();
      el('approve').disabled=state.busy||!canReview||changed();
      el('reject').disabled=state.busy||!canReview;
      el('rework').disabled=state.busy||!(state.result.can_rework??state.result.editable)||changed()||conflict;
      el('draft').disabled=state.busy||!(state.result.editable||state.result.can_rework);
      el('duplicate').disabled=state.busy||state.result.provisional;
      el('discuss').disabled=state.busy||state.result.provisional;
      el('draft-state').textContent=state.result.provisional?'Saved intermediate artifacts · Pin to edit and deliver':state.draftDirty?'Draft not saved yet':changed()?'Draft saved, not yet an output revision':'Output pinned';
      const canCompare = state.preview?.text !== undefined || state.preview?.data !== undefined;
      host.querySelectorAll('[data-wnw-mode]').forEach(button=>{
        const mode = button.dataset.wnwMode;
        button.setAttribute('aria-pressed', String(state.mode === mode));
        button.disabled = state.busy || (mode === 'edit' && !canEdit) || (mode === 'diff' && !canCompare);
      });
    }
    function scheduleDraft(){
      if(!(state.result?.editable||state.result?.can_rework))return;
      state.draftDirty=true;clearTimeout(state.autosave);state.autosave=setTimeout(()=>state.saveDraft(),650);updateButtons();
    }
    state.saveDraft=async()=>{
      clearTimeout(state.autosave);
      if(!state.alive()||!(state.result?.editable||state.result?.can_rework)||!state.draftDirty)return true;
      if(state.savePromise){await state.savePromise;if(!state.draftDirty)return true;}
      const saved={text:state.value,reason:state.reason,feedback:state.feedback,instruction:el('instruction').value};
      const artifactId=state.artifact?.id||'structured';
      state.savePromise=(async()=>{
        try{
          const response=await command('draft',{artifact_id:artifactId,window_id:windowId,expected_draft_version:state.draftVersion,...saved});
          if(!state.alive())return true;
          state.draftVersion=response.draft?.version??response.draft?.draft_version??state.draftVersion+1;
          if(response.draft){state.result.drafts=[{...response.draft,artifact_id:artifactId,window_id:windowId,base_revision:state.result.identity.output_revision},...(state.result.drafts||[]).filter(item=>!(item.artifact_id===artifactId&&item.window_id===windowId&&(item.base_revision??item.revision??item.output_revision)===state.result.identity.output_revision))];}
          state.draftDirty=JSON.stringify(saved)!==JSON.stringify({text:state.value,reason:state.reason,feedback:state.feedback,instruction:el('instruction').value});
          updateButtons();if(state.draftDirty)scheduleDraft();return true;
        }catch(error){message('Draft save failed. Your current edits are kept.'+error.message,true);return false;}
      })();
      try{return await state.savePromise;}finally{state.savePromise=null;}
    };
    async function load(selection,keepArtifact=true){
      const seq=++state.request;
      const response=await api('/api/project-tasks/node-workspace?'+query(selection));
      if(!state.alive()||seq!==state.request)return;
      if(keepArtifact&&state.result?.provisional&&response.result.provisional&&state.result.identity.output_digest===response.result.identity.output_digest&&state.result.task.status===response.result.task.status&&state.result.identity.task_run_id===response.result.identity.task_run_id)return;
      const previousArtifact=state.artifact,previousRun=state.result?.identity?.task_run_id;
      state.result=response.result;
      state.selection={...selection,...state.result.identity,task_id:state.result.identity.task_id};
      options.selected(state.selection);
      const result=state.result,task=result.task,node=result.node||{},identity=result.identity;
      el('title').textContent=node.label||task.title||'Node output';
      el('meta').textContent='Page'+(result.run.attempt||1)+'runs · Revision v'+identity.output_revision+' · '+(task.workflow_node_id||identity.workflow_node_id)+(result.scheduling?' · '+result.scheduling:'');
      const decision=task.deliveries?.findLast(item=>item.task_run_id===identity.task_run_id);
      el('status').textContent=task.status==='blocked'&&decision?.decision==='rejected'
        ? 'Sent back for revision'
        : statuses[task.status]||task.status;
      el('steps').innerHTML=(result.steps||[]).map((step,index)=>`<button type="button" data-wnw-step="${h(step.task_id)}" aria-current="${step.task_id===task.id?'step':'false'}"><small>${index+1}</small><span>${h(step.title)}<em>${h(statuses[step.status]||step.status)}</em></span></button>`).join('');
      el('steps').querySelectorAll('[data-wnw-step]').forEach(button=>button.onclick=async()=>{if(await state.saveDraft())options.select({project_id:task.project_id,task_id:button.dataset.wnwStep});});
      el('collect').hidden=!result.can_collect;
      el('stop').hidden=!['running','queued'].includes(task.status);
      const waiting=(result.upstream||[]).filter(item=>item.status!=='delivered');
      el('start').hidden=!result.provisional||node.manual_execution||!!waiting.length||!['ready','draft','failed','interrupted','blocked'].includes(task.status);
      const lifecycle=async(action,payload={})=>{if(state.busy)return;state.busy=true;updateButtons();try{await api('/api/project-tasks/'+action,{project_id:task.project_id,id:task.id,...payload});await load({project_id:task.project_id,task_id:task.id},false);options.changed?.();}catch(error){message(error.message,true);}finally{state.busy=false;updateButtons();}};
      el('collect').onclick=()=>lifecycle('collect-output',{task_run_id:identity.task_run_id,expected_version:identity.task_version,request_key:crypto.randomUUID()});
      el('stop').onclick=()=>lifecycle('cancel');
      el('start').onclick=()=>lifecycle('start',{request_key:crypto.randomUUID()});
      if(result.provisional)message(result.artifacts.length?'This shows the artifacts actually saved for this node. After the run ends you can pin a version, edit the content, and deliver it to the next stage.':'No artifacts saved for this node yet. Once execution starts, saved content appears here.');
      if(result.provisional&&waiting.length)message('Waiting for upstream node delivery:'+waiting.map(item=>item.title).join(', '));
      else if(result.provisional&&node.manual_execution)message('This node is done by hand. Submit the output under "Prepare / view run".');
      if(result.provisional&&['failed','blocked','interrupted'].includes(task.status)&&result.run.error)message(result.run.error,true);
      else if(el('notice').textContent.startsWith('Shown here')||el('notice').textContent.startsWith('This node has not yet'))message('');
      el('version').disabled=!!result.provisional;
      host.querySelector('.wnw-reason').hidden=!!result.provisional;
      host.querySelector('.wnw-footer').hidden=!!result.provisional;
      host.querySelector('.wnw-agent').hidden=!!result.provisional;
      host.querySelector('.wnw').classList.toggle('wnw-provisional',!!result.provisional);
      let sync=host.querySelector('[data-wnw-sync]');if(!sync){sync=document.createElement('section');sync.dataset.wnwSync='';sync.className='wnw-notice';el('notice').after(sync);}
      const syncErrors=result.sync_errors||[],fileConflicts=result.fileop_conflicts||[];sync.hidden=!syncErrors.length&&!fileConflicts.length;
      if(!sync.hidden){sync.innerHTML=`<p>${fileConflicts.length?'Restoring the file write found a conflict; check the working file. Output and drafts are kept.':'The delivery decision is saved; some page states have not synced yet.'}</p>${syncErrors.map(error=>`<p>${h(error.adapter||'Status sync')}: ${h(error.error||error.message||'Sync failed')}</p>`).join('')}<button class="btn ghost" type="button" data-wnw-reconcile>Resync status</button>`;sync.querySelector('button').onclick=async()=>{if(!await state.saveDraft())return;const response=await mutate('reconcile');if(response)await load(state.selection);};}
      let quality=el('quality');
      if(!quality){quality=document.createElement('section');quality.dataset.wnwQuality='';el('notice').after(quality);}
      const audit=result.claim_audit,targets=result.rework_targets||[];
      const labels={supported:'Supported',partial:'Partial support',conflicting:'Conflict',missing:'No locatable evidence'};
      quality.hidden=!audit&&!targets.length;
      const claimRows=(audit?.claims||[]).map(item=>`<li><b>${h(labels[item.status]||item.status)}</b> · ${h(item.text)}
        <p class="hint">${h(item.reason)}</p>${item.sources.map(source=>`<div>
          <a href="/api/pdf?id=${encodeURIComponent(source.paper_id)}#page=${Number(source.page)}" target="_blank" rel="noopener">
            ${h(source.filename)} · p.${h(source.page)}</a>${source.doi?' · DOI '+h(source.doi):''}
          ${source.anchored?'':'· Citation not verified on that page'}<blockquote>${h(source.excerpt)}</blockquote></div>`).join('')}</li>`).join('');
      quality.innerHTML=(audit?`<details ${audit.requires_review?'open':''}><summary>Check conclusions against evidence · ${audit.claims.length} items</summary>
        ${audit.warnings.map(item=>`<p class="hint">${h(item)}</p>`).join('')}
        <ol>${claimRows}</ol></details>`:'')+(targets.length?`<div class="pw-view-head"><label>Send back to an upstream node <select class="control" data-wnw-return-target>
        <option value="">Select</option>${targets.map(item=>`<option value="${h(item.node_id)}">${h(item.title)}</option>`).join('')}</select></label>
        <button type="button" class="btn ghost" data-wnw-return>Return it and rerun the affected nodes</button></div>`:'');
      const returnButton=el('return');
      if(returnButton)returnButton.onclick=async()=>{
        const target=el('return-target').value;
        if(!target||!state.feedback.trim()){message('Select a rework node and enter the changes in the manual review notes.',true);return;}
        if(!await state.saveDraft())return;
        const response=await mutate('return-to-stage',{target_node_id:target,feedback:state.feedback});
        if(response?.target_task_id){
          options.changed?.();
          await options.select({project_id:task.project_id,task_id:response.target_task_id});
        }
      };
      el('goal').textContent=node.prompt||task.goal||'';
      el('guide').hidden=!result.guide;
      el('guide').innerHTML=result.guide?`<dl><dt>the required input</dt><dd>${h(result.guide.input)}</dd><dt>This step’s delivery</dt><dd>${h(result.guide.output)}</dd></dl>`:'';
      const downstream=result.downstream||[];
      el('next').hidden=!downstream.length;
      el('next').innerHTML=downstream.length?`<h4>Deliver to</h4><nav class="wnw-steps">${downstream.map(step=>`<button type="button" data-wnw-next-task="${h(step.task_id)}"><span>${h(step.title)}<em>${h(statuses[step.status]||step.status)}</em></span></button>`).join('')}</nav>`:'';
      el('next').querySelectorAll('button').forEach(button=>button.onclick=async()=>{
        if(await state.saveDraft())options.select({project_id:task.project_id,task_id:button.dataset.wnwNextTask});
      });
      el('inputs').innerHTML=inputMarkup(result);
      el('original').textContent=result.run.checkpoint?.reply||result.original_reply||'This run recorded no separate text reply.';
      const executor=result.run.executor_snapshot||result.executor||{};
      el('executor').textContent=executor.member?.name||executor.assistant?.name||executor.assistant_name||'This node’s previous executor';
      el('tool-fields').hidden=node.node_kind!=='tool';
      el('tool-args').value=JSON.stringify(node.tool_args||{},null,2);
      const history=result.history||[];
      const entries=history.some(item=>sameVersion(item,identity))?history:[{...identity,label:'Viewing version'},...history];
      state.history=entries;
      el('version').innerHTML=entries.map((item,index)=>`<option value="${index}" ${sameVersion(item,identity)?'selected':''}>${h(item.label||'Run '+(item.attempt||'')+' · Revision v'+item.output_revision)}</option>`).join('');
      el('version').onchange=()=>{const selected=entries[Number(el('version').value)];options.select({...state.selection,task_run_id:selected.task_run_id||selected.identity?.task_run_id,output_revision:selected.output_revision??selected.identity?.output_revision});};
      el('files').innerHTML=(result.artifacts||[]).map((artifact,index)=>`<button type="button" class="wnw-file" data-wnw-file="${index}"><span>${h(artifact.name||artifact.id)}</span><small>${h(artifact.kind||'File')}</small></button>`).join('');
      el('files').querySelectorAll('[data-wnw-file]').forEach(button=>button.onclick=()=>openArtifact(result.artifacts[Number(button.dataset.wnwFile)]));
      let checks=Array.isArray(result.checks)?result.checks:Object.entries(result.checks||{}).map(([name,value])=>({label:(({format:'Output format',min_chars:'Minimum words',sections:'Required sections',required_files:'Required files'})[name]||name)+' '+textOf(value)}));
      checks=[...(result.guide?.checks||[]),...checks];
      if(!checks.length)checks=[{label:'Check actual artifacts and evidence sources'},{label:'Check the input, version, and change request'}];
      el('checks').innerHTML=checks.map(item=>`<label class="wnw-check"><input type="checkbox" ${item.passed||item.checked?'checked':''}>${h(typeof item==='string'?item:item.label||item.name||item.message)}</label>`).join('');
      const next=(result.artifacts||[]).find(item=>item.id===(keepArtifact?state.artifact?.id:selection.artifact_id))||(result.artifacts||[])[0];
      if(!next){state.artifact=null;state.preview=null;state.value='';state.baseline='';el('file-title').textContent='Stage artifacts';el('file-meta').textContent='';el('content').innerHTML='<div class="wnw-empty"><h4>This node has no saved output yet</h4><p>Generated reference tables, evidence graphs, body text, or files preview here; a reviewed version can be edited and delivered directly.</p></div>';updateButtons();return;}
      if(!(keepArtifact&&result.provisional&&state.preview&&previousRun===identity.task_run_id&&previousArtifact?.id===next.id&&previousArtifact?.content_hash===next.content_hash))await selectArtifact(next);
      updateButtons();
    }
    function sameVersion(item,identity){return (item.task_run_id||item.identity?.task_run_id)===identity.task_run_id&&(item.output_revision??item.identity?.output_revision)===identity.output_revision;}
    function inputMarkup(result){
      const inputs=result.run.input_snapshot||result.inputs||{};
      const dependencies=inputs.dependencies||[];
      const bound=inputs.handoffs||[];
      const links=bound.map(item=>`<li><b>${h(item.artifact)}</b><small>${h(item.source)} · Delivery ${h(item.delivery_id)}${item.argument?' → '+h(item.argument):''}</small></li>`).join('');
      return `<ul class="wnw-input-list">${links}${dependencies.map((item,index)=>`<li><b>${h(item.title||item.label||'Prerequisite deliverable'+(index+1))}</b><small>The accepted pinned version${item.outputs?.length?' · '+item.outputs.length+'files':''}</small></li>`).join('')}${(inputs.assets||[]).map((item,index)=>`<li>${h(item.name||item.relative||'Input material'+(index+1))}<small>${h((item.content_hash||'').slice(0,12))}</small></li>`).join('')}</ul>${!dependencies.length&&!inputs.assets?.length?'<p class="hint">This node has no extra material and works from the pinned task requirements.</p>':''}`;
    }
    async function openArtifact(artifact){
      if(artifact&&await state.saveDraft())await selectArtifact(artifact);
    }
    async function selectArtifact(artifact){
      const seq=++state.previewRequest||1;state.previewRequest=seq;
      if(state.artifact?.id!==artifact.id)state.rendererView={};
      state.artifact=artifact;
      const response=await api('/api/project-tasks/node-workspace-preview?'+query(state.selection,artifact.id));
      if(!state.alive()||state.previewRequest!==seq)return;
      state.preview=response.preview;
      state.rawDraft=false;
      state.structuredData=copy(state.preview.data??null);
      state.baseline=state.preview.text??(state.preview.data==null?'':textOf(state.preview.data));
      state.value=state.baseline;state.reason='';state.draftVersion=0;state.draftDirty=false;
      const saved=(state.result.drafts||[]).find(item=>item.artifact_id===artifact.id&&item.window_id===windowId&&(item.base_revision??item.output_revision??state.result.identity.output_revision)===state.result.identity.output_revision);
      if(saved&&(state.result.editable||state.result.can_rework)){state.value=saved.text??state.value;state.reason=saved.reason||'';state.feedback=saved.feedback||state.feedback;state.draftVersion=saved.version??saved.draft_version??0;if(saved.instruction)el('instruction').value=saved.instruction;message('Restored this window’s draft edits on the current version.');}
      el('reason').value=state.reason;el('feedback').value=state.feedback;
      el('file-title').textContent=artifact.name||artifact.id;
      el('export-edit').hidden=artifact.id==='export-source'||!state.result.artifacts.some(item=>item.id==='export-source'&&item.editable);
      const legacyEdit=el('file-edit');
      if(legacyEdit){legacyEdit.hidden=!String(artifact.id||'').startsWith('file:');legacyEdit.disabled=!editable();}
      el('file-meta').textContent=(artifact.kind||state.preview.kind||'File')+' · '+((artifact.content_hash||artifact.hash||'').slice(0,16));
      let previewNote=host.querySelector('[data-wnw-preview-note]');if(!previewNote){previewNote=document.createElement('p');previewNote.dataset.wnwPreviewNote='';previewNote.className='hint wnw-preview-note';el('content').before(previewNote);}previewNote.hidden=!state.preview.preview_note;previewNote.textContent=state.preview.preview_note||'';
      el('files').querySelectorAll('[data-wnw-file]').forEach(button=>button.setAttribute('aria-current',String(state.result.artifacts[Number(button.dataset.wnwFile)].id===artifact.id)));
      if(state.mode==='edit'&&!editable())state.mode='preview';
      await drawContent();updateButtons();
      drawStaleDrafts();
      options.selected({...state.selection,artifact_id:artifact.id});
    }
    function drawStaleDrafts(){
      let panel=host.querySelector('[data-wnw-stale-drafts]');
      if(!panel){panel=document.createElement('section');panel.dataset.wnwStaleDrafts='';panel.className='wnw-stale-drafts';el('content').before(panel);}
      const identity=state.result.identity;
      const drafts=(state.result.drafts||[]).filter(item=>item.artifact_id===state.artifact.id&&item.window_id===windowId&&item.text!==state.baseline&&(item.stale||(item.base_revision??item.revision??item.output_revision)!==identity.output_revision));
      panel.hidden=!drafts.length;if(!drafts.length)return;
      panel.innerHTML=`<p>kept ${drafts.length} drafts based on older versions. Open or copy one to compare it with the current version; the output does not change by itself.</p>${drafts.map((draft,index)=>`<details data-wnw-stale-draft="${index}"><summary>View revision v${Number(draft.base_revision??draft.revision??draft.output_revision)} draft on${draft.updated_at?' · '+h(fmtDate(draft.updated_at)):''}</summary><pre>${h(draft.text||'Empty draft')}</pre>${draft.reason?`<p>${h(draft.reason)}</p>`:''}<button class="btn ghost" type="button" data-wnw-restore-draft="${index}" ${editable()?'':'disabled'}>Copy into the editor</button></details>`).join('')}`;
      panel.querySelectorAll('[data-wnw-restore-draft]').forEach(button=>button.onclick=async()=>{
        if(!editable()||!await state.saveDraft())return;
        const draft=drafts[Number(button.dataset.wnwRestoreDraft)];
        state.value=draft.text??'';state.reason=draft.reason||'';state.feedback=draft.feedback||state.feedback;
        if(draft.instruction)el('instruction').value=draft.instruction;
        if(state.artifact.kind==='table'&&/\.csv$/i.test(state.artifact.name||''))state.rawDraft=true;
        el('reason').value=state.reason;el('feedback').value=state.feedback;state.mode='edit';
        scheduleDraft();await drawContent();updateButtons();message('Old draft copied into the editor. Compare and save a revision; the current artifact version stays unchanged.');
      });
    }
    function change(value){state.value=value;scheduleDraft();}
    function parsed(){
      try{return JSON.parse(state.value);}catch{return state.structuredData??state.preview.data??state.preview.content;}
    }
    function changeData(data){
      state.structuredData=data;
      if(state.artifact.id.startsWith('file:')&&/\.csv$/i.test(state.artifact.name||'')&&Array.isArray(data)){
        const keys=[...new Set(data.flatMap(item=>Object.keys(item)))];
        const cell=value=>{const text=String(value??'');return /[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;};
        change([keys,...data.map(item=>keys.map(key=>item[key]))].map(row=>row.map(cell).join(',')).join('\n'));
      }else change(textOf(data));
    }
    function kind(){return state.artifact.kind||state.preview.kind||'text';}
    async function loadPdf(artifact){
      const {preview}=await api('/api/project-tasks/node-workspace-preview?'+query(state.selection,artifact.id));
      const media=preview.preview||preview;
      if(media.kind!=='pdf'||!media.url)throw new Error('This PDF cannot be previewed');
      const url=new URL(media.url,location.href);
      if(url.origin!==location.origin)throw new Error('File preview URL is not on the local service');
      return url.href;
    }
    async function drawContent(){
      const target=el('content');if(!state.preview)return;
      host.querySelectorAll('[data-wnw-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.wnwMode===state.mode)));
      if(state.mode==='diff'){await drawDiff(target);return;}
      const type=kind(),edit=state.mode==='edit'&&editable();
      if(edit&&state.rawDraft){target.innerHTML=`<textarea class="wnw-editor" data-wnw-editor aria-label="Revised output text" spellcheck="false">${h(state.value)}</textarea>`;target.querySelector('textarea').oninput=event=>change(event.target.value);return;}
      if(type==='export'){drawExport(target,parsed(),edit);return;}
      if(WorkflowNodeRenderers.render(state.result.node?.step,target,{
        artifact:state.artifact,data:parsed(),text:state.value,editable:edit,view:state.rendererView,onChange:changeData,
        files:state.result.artifacts,openArtifact,loadPdf,
      }))return;
      if(type==='idea'&&typeof parsed()==='object'){drawIdea(target,parsed(),edit);return;}
      if(type==='bilingual'&&!Array.isArray(parsed())&&parsed()&&('source' in parsed()||'source_text' in parsed())&&!parsed().segments){drawBilingual(target,parsed(),edit);return;}
      if(['table','papers','bilingual','checklist'].includes(type)&&typeof parsed()==='object'){drawStructured(target,parsed(),edit,type==='papers'?'table':type);return;}
      if(edit){
        target.innerHTML=`<textarea class="wnw-editor" data-wnw-editor aria-label="Revised output text" spellcheck="false">${h(state.value)}</textarea>`;
        target.querySelector('textarea').oninput=event=>change(event.target.value);return;
      }
      const media=state.preview.preview||state.preview;
      if(['pdf','image','html'].includes(type)||['pdf','image','html'].includes(media.kind)){
        const raw=media.url||media.preview_url||state.preview.url;
        if(raw){const url=new URL(raw,location.href);if(url.origin!==location.origin)throw new Error('The artifact preview address is not a local service.');target.innerHTML=(media.kind||type)==='image'?`<img class="wnw-image" src="${h(url.href)}" alt="${h(state.artifact.name)}">`:`<iframe class="wnw-frame" title="${h(state.artifact.name)}" ${(media.kind||type)==='html'?'sandbox="allow-same-origin"':''} src="${h(url.href)}"></iframe>`;return;}
      }
      const download = state.preview.download_url;
      if (download && media.kind === 'other') {
        target.innerHTML = `<a class="btn" href="${h(download)}" download>Download ${h(state.artifact.name)}</a>`;
        return;
      }
      if(['markdown','text','checklist'].includes(type)&&typeof parsed()!=='object'||state.preview.text!==undefined){target.innerHTML=/\.(md|markdown)$/i.test(state.artifact.name||'')||type==='markdown'||type==='checklist'?`<div class="md-render wnw-prose">${renderMarkdown(state.value)}</div>`:`<pre class="wnw-text">${h(state.value)}</pre>`;return;}
      target.innerHTML=`<pre class="wnw-text">${h(state.value||'Open this output in its own viewer.')}</pre>`;
    }
    function drawExport(target,data,edit){
      if(!edit){target.innerHTML=`<div class="md-render wnw-prose">${renderMarkdown(data.markdown||'')}</div>`;return;}
      target.innerHTML=`<label>Output format<select class="control" data-wnw-export-format>${[['docx','Word'],['pdf','PDF'],['html','HTML'],['md','Markdown']].map(([value,label])=>`<option value="${value}" ${data.format===value?'selected':''}>${label}</option>`).join('')}</select></label><p class="hint">Saving a revision builds a new deliverable from the source; the old one stays in version history.</p><textarea class="wnw-editor" data-wnw-export-source aria-label="Lay out the source">${h(data.markdown||'')}</textarea>`;
      target.querySelector('[data-wnw-export-source]').oninput=event=>{data.markdown=event.target.value;changeData(data);};
      target.querySelector('[data-wnw-export-format]').onchange=event=>{data.format=event.target.value;changeData(data);};
    }
    function drawIdea(target,data,edit){
      const report=typeof data.report==='object'&&data.report?data.report:{markdown:typeof data.report==='string'?data.report:''};
      target.innerHTML=`<h4>Research question</h4><div class="wnw-prose">${h(data.input||'')}</div><h4>Novelty review conclusion</h4>${edit?'<textarea class="wnw-editor" data-wnw-idea-report aria-label="Novelty review conclusion"></textarea>':`<div class="md-render wnw-prose">${renderMarkdown(report.markdown||'')}</div>`}`;
      const editor=target.querySelector('textarea');if(editor){editor.value=report.markdown||'';editor.oninput=()=>{report.markdown=editor.value;data.report=report;change(textOf(data));};}
    }
    function drawBilingual(target,data,edit){
      const sourceKey='source' in data?'source':'source_text',targetKey='result' in data?'result':'target_text' in data?'target_text':'translation';
      target.innerHTML=`<div class="wnw-bilingual"><section><h4>Source</h4><div class="md-render wnw-prose">${renderMarkdown(data[sourceKey]||'')}</div></section><section><h4>Translation</h4>${edit?'<textarea class="wnw-editor" data-wnw-translation aria-label="Translation revision"></textarea>':`<div class="md-render wnw-prose">${renderMarkdown(data[targetKey]||'')}</div>`}</section></div>`;
      const editor=target.querySelector('textarea');if(editor){editor.value=data[targetKey]||'';editor.oninput=()=>{data[targetKey]=editor.value;change(textOf(data));};}
    }
    function drawStructured(target,data,edit,type){
      const key=Array.isArray(data)?null:['rows','items','results','segments','paragraphs','issues'].find(name=>Array.isArray(data?.[name]));
      const rows=key?data[key]:Array.isArray(data)?data:[];
      if(!rows.length){target.innerHTML=`<pre class="wnw-text">${h(textOf(data))}</pre>${edit?'<p class="hint">Edit fields with the structured content editor.</p><textarea class="wnw-editor" data-wnw-editor aria-label="Structured output content"></textarea>':''}`;if(edit){target.querySelector('textarea').value=state.value;target.querySelector('textarea').oninput=event=>change(event.target.value);}return;}
      if(type==='bilingual'&&rows.some(row=>Array.isArray(row.segments))){drawSegments(target,data,rows,edit);return;}
      const present=[...new Set(rows.flatMap(row=>typeof row==='object'&&row?Object.keys(row).filter(field=>!['embedding','raw','html'].includes(field)):['content']))];
      const preferred=type==='table'?['title','authors','doi','year','abstract','included','reason','annotation']:type==='checklist'?['title','detail','text','severity','resolved','comment']:['source','translation','target','annotation'];
      const columns=[...new Set([...preferred.filter(field=>present.includes(field)||['included','reason','annotation','resolved','comment','translation'].includes(field)),...present])].slice(0,10);
      const labels={title:'Title',authors:'Author',doi:'DOI',year:'Year',abstract:'Abstract',annotation:'Review annotations',source:type==='table'?'Source':'Source',source_text:'Source',target:'Translation',translation:'Translation',target_text:'Translation',text:'Content',content:'Content',included:'Include',reason:'Reason',severity:'Severity',resolved:'Handled',page:'Pages',comment:'Review comments'};
      function cellMarkup(row,index,field){
        const value=typeof row==='object'&&row?row[field]:row;
        const boolean=typeof value==='boolean'||['included','resolved'].includes(field),canEdit=edit&&!['id','source','created_at','task_id','sha256','files','source_path'].includes(field);
        if(!canEdit)return `<td>${h(boolean?(value===false?'No':'Yes'):typeof value==='object'?textOf(value):value??'')}</td>`;
        return `<td>${boolean?`<input type="checkbox" data-wnw-cell="${index}" data-field="${h(field)}" aria-label="Row ${index+1} ${h(labels[field]||field)}" ${value!==false&&field==='included'||value===true?'checked':''}>`:`<textarea class="control" rows="${type==='bilingual'?5:2}" data-wnw-cell="${index}" data-field="${h(field)}" aria-label="Row ${index+1} ${h(labels[field]||field)}">${h(typeof value==='object'?textOf(value):value??'')}</textarea>`}</td>`;
      }
      function orderMarkup(index){return `<td class="wnw-order"><span>${index+1}</span>${edit?`<button type="button" class="pw-text-button" data-wnw-row-move="${index}:-1" aria-label="Move line ${index+1} up" ${index===0?'disabled':''}>Move up</button><button type="button" class="pw-text-button" data-wnw-row-move="${index}:1" aria-label="Move row ${index+1} down" ${index===rows.length-1?'disabled':''}>Move down</button>`:''}</td>`;}
      target.innerHTML=`<div class="wnw-table-wrap"><table class="wnw-table"><thead><tr><th scope="col">Order</th>${columns.map(field=>`<th scope="col">${h(labels[field]||field)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,index)=>`<tr>${orderMarkup(index)}${columns.map(field=>cellMarkup(row,index,field)).join('')}</tr>`).join('')}</tbody></table></div>`;
      target.querySelectorAll('[data-wnw-row-move]').forEach(button=>button.onclick=()=>{
        const [index,direction]=button.dataset.wnwRowMove.split(':').map(Number),next=index+direction;if(next<0||next>=rows.length)return;
        [rows[index],rows[next]]=[rows[next],rows[index]];changeData(data);drawStructured(target,data,edit,type);
        target.querySelector('[data-wnw-row-move="'+next+':'+direction+'"]')?.focus();
      });
      target.querySelectorAll('[data-wnw-cell]').forEach(input=>input.oninput=()=>{
        const index=Number(input.dataset.wnwCell),field=input.dataset.field;
        if(typeof rows[index]!=='object'||rows[index]===null)rows[index]={content:rows[index]};
        const prior=rows[index][field];let value=input.type==='checkbox'?input.checked:typeof prior==='number'&&input.value.trim()!==''?Number(input.value):input.value;
        if(prior&&typeof prior==='object'){try{value=JSON.parse(input.value);}catch{}}
        rows[index][field]=value;
        changeData(data);
      });
    }
    function drawSegments(target,data,rows,edit){
      target.innerHTML=rows.map((row,rowIndex)=>`<section class="wnw-segment-group"><h4>${h(row.title||row.id||'Bilingual view')}</h4>${(row.segments||[]).map((segment,index)=>`<div class="wnw-bilingual"><section><small>Source · ${index+1}</small><p>${h(segment.source||'')}</p></section><section><label>Translation · ${index+1}${edit?`<textarea class="control" rows="5" data-wnw-segment="${rowIndex}:${index}" aria-label="row ${rowIndex + 1}, no. ${index+1} translated passages">${h(segment.target??segment.translation??'')}</textarea>`:`<p>${h(segment.target??segment.translation??'')}</p>`}</label></section></div>`).join('')}</section>`).join('');
      target.querySelectorAll('[data-wnw-segment]').forEach(input=>input.oninput=()=>{const [row,index]=input.dataset.wnwSegment.split(':').map(Number),segment=rows[row].segments[index];segment['target' in segment?'target':'translation']=input.value;changeData(data);});
    }
    async function drawDiff(target){
      const history=state.history.filter(item=>!sameVersion(item,state.result.identity));
      target.innerHTML=`<label class="wnw-compare">Compare versions<select class="control" data-wnw-compare>${history.map((item,index)=>`<option value="${index}">${h(item.label||'Revision v'+item.output_revision)}</option>`).join('')}</select></label><div data-wnw-diff-body></div>`;
      const draw=async()=>{
        let previous=state.preview.previous_content??state.artifact.previous_content??state.result.previous_content;
        if(history.length){const item=history[Number(target.querySelector('select').value)];try{const response=await api('/api/project-tasks/node-workspace-preview?'+query({...state.selection,task_run_id:item.task_run_id||item.identity?.task_run_id,output_revision:item.output_revision??item.identity?.output_revision},state.artifact.id));previous=response.preview.text??response.preview.data??response.preview.content;}catch(error){message(error.message,true);}}
        if(!state.alive()||state.mode!=='diff')return;
        const before=previous===undefined?state.baseline:textOf(previous);
        target.querySelector('[data-wnw-diff-body]').innerHTML=diffMarkup(before,state.value);
      };
      target.querySelector('select').disabled=!history.length;target.querySelector('select').onchange=draw;await draw();
    }
    function diffMarkup(before,after){
      const a=before.split('\n'),b=after.split('\n');let prefix=0,suffix=0;
      while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
      while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
      const line=(value,index,changed,before)=>`<div class="wnw-diff-line ${changed?before?'wnw-removed':'wnw-added':''}"><span>${index+1}</span><code>${h(value)||' '}</code></div>`;
      return `<div class="wnw-diff"><section><h4>Compare versions</h4>${a.map((value,index)=>line(value,index,index>=prefix&&index<a.length-suffix,true)).join('')}</section><section><h4>Current content${changed()?' · with drafts':''}</h4>${b.map((value,index)=>line(value,index,index>=prefix&&index<b.length-suffix,false)).join('')}</section></div>`;
    }
    function captureSelection(){
      const editor=el('content').querySelector('textarea[data-wnw-editor]');
      let text='',start,end;
      if(editor){start=editor.selectionStart;end=editor.selectionEnd;text=editor.value.slice(start,end);}else{const selection=window.getSelection();if(selection&&el('content').contains(selection.anchorNode))text=selection.toString();}
      if(!text.trim()){message('Select the text to cite in the current artifact first.',true);return;}
      state.quote={artifact_id:state.artifact.id,text,start,end};el('selection').textContent=text;el('selection').hidden=false;message('Selection bound to this output version.');
    }
    async function mutate(action,payload){
      if(state.busy)return;
      state.busy=true;message('',true);updateButtons();
      const editableFields=[...host.querySelectorAll('input,textarea,select')];editableFields.forEach(input=>{input.dataset.wnwWasDisabled=String(input.disabled);input.disabled=true;});
      try{return await command(action,payload);}
      catch(error){message(error.message+'Current content kept.',true);return null;}
      finally{state.busy=false;if(state.alive()){editableFields.forEach(input=>input.disabled=input.dataset.wnwWasDisabled==='true');updateButtons();}}
    }
    async function saveRevision(){
      if(!editable()||!changed()||state.busy)return;
      if(!await state.saveDraft())return;
      const type=kind();let action='revise',payload={artifact_id:state.artifact.id,text:state.value,reason:state.reason};
      if(state.artifact.id==='export-source'){action='revise-export';payload={...payload,content:parsed()};}
      if(state.artifact.id==='structured'){
        let content=state.value;
        if(['graph','table','papers','idea','json'].includes(type)||state.preview.data!==null&&typeof state.preview.data==='object'){
          try{content=JSON.parse(state.value);}catch{message('Structured content must be valid JSON; keep the draft, fix it, then save.',true);return;}
        }
        action=type==='graph'?'revise-graph':'revise-structured';payload={...payload,...(type==='graph'?{graph:content}:{content})};
      }
      const response=await mutate(action,payload);
      if(response){state.draftDirty=false;await load({task_id:state.result.identity.task_id,project_id:state.result.identity.project_id},true);message('Saved as a new output revision; review it, then deliver.');}
    }
    async function review(approved){
      if(approved&&changed()){message('There are unsaved artifact changes. Save the revision first.',true);return;}
      if(!approved&&!state.feedback.trim()){message('Add your review notes before returning.',true);return;}
      if(!await state.saveDraft())return;
      const response=await mutate('review',{approved,feedback:state.feedback});
      if(response){await load(state.selection);message(approved?'This version was manually reviewed and delivered. The workflow continues.':'Returned with your revision notes recorded.');options.changed?.();}
    }
    async function rework(){
      const instruction=el('instruction').value.trim();if(!instruction){message('Describe what the expert should change.',true);return;}
      if(changed()){message('Save the output revision before sending that version to an expert.',true);return;}
      if(!await state.saveDraft())return;
      const payload={instruction,selection:state.quote||null};
      if(state.result.node?.node_kind==='tool'){try{payload.tool_args=JSON.parse(el('tool-args').value||'{}');}catch{message('Fixed tool params must be a valid JSON object.',true);return;}}
      const response=await mutate('rework',payload);
      if(response){state.draftDirty=false;options.changed?.();await options.openTask(state.result.identity.task_id);}
    }
    async function discuss(){
      const text=el('instruction').value.trim();if(!text){message('Enter the question to discuss.',true);return;}
      if(!await state.saveDraft())return;
      const response=await mutate('discuss',{message:text,selection:state.quote||null});
      if(response){message('Question and current version sent to the node expert chat.');if(response.chat_id)await options.openConversation(response.chat_id);}
    }
    async function duplicate(){
      const goal=el('instruction').value.trim();if(!goal){message('Describe the new task.',true);return;}
      if(!await state.saveDraft())return;
      const response=await mutate('duplicate',{goal});if(response?.task)await options.openTask(response.task.id);
    }
    skeleton();
    const grid=host.querySelector('.wnw-grid');
    const contextPane=grid?.querySelector('.wnw-context');
    const documentPane=grid?.querySelector('.wnw-document');
    const agentPane=grid?.querySelector('.wnw-agent');
    if(grid&&documentPane&&contextPane&&agentPane){
      grid.replaceChildren(contextPane,documentPane,agentPane);
    }
    try{await load(options.selection,false);}catch(error){if(state.alive()){el('content').innerHTML='<p class="hint">Cannot read this node’s output; refresh and try again.</p>';message(error.message,true);host.querySelectorAll('button,input,select,textarea').forEach(input=>input.disabled=true);el('origin').disabled=false;}}
    state.poll=setInterval(async()=>{
      if(!state.alive()||!state.result||document.hidden||state.pollBusy||state.busy)return;
      if(state.result.provisional){state.pollBusy=true;try{await load({project_id:state.result.identity.project_id,task_id:state.result.identity.task_id});}catch(error){message(error.message,true);}finally{state.pollBusy=false;}return;}
      try{const data=await api('/api/project-tasks/detail?project_id='+encodeURIComponent(state.result.identity.project_id)+'&id='+encodeURIComponent(state.result.identity.task_id));if(state.alive())el('latest').hidden=data.task.version===state.result.identity.task_version&&data.task.latest_run_id===state.result.identity.task_run_id&&(data.task.latest_run?.checkpoint?.output_revision||0)===state.result.identity.output_revision;}catch{}
    },4000);
  }
  return {mount,dirty,flush,dispose,eligible,availableSelection};
})();
