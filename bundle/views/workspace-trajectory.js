/* Durable tool activity is a read-only view of a conversation's actual runs. */
const WorkspaceTrajectory=(()=>{
  const h=value=>esc(String(value??''));
  const statusLabels={running:'Running',pending:'Waiting for result',done:'Done',failed:'Failed',cancelled:'Stopped',interrupted:'Interrupted',error:'Failed',success:'Success'};
  function records(events,status){
    const rows=[],pending=[];
    for(const event of events){const data=event.payload||{},kind=data.type||event.kind;
      if(kind==='model_request'){rows.push({key:'model:'+data.id,kind:'model',name:data.model||'Model request',status:'pending',input:{permission:data.permission},round:data.round,at:event.created_at});}
      else if(kind==='tool_call'){const row={key:'tool:'+event.event_id,callId:data.id,kind:'tool',name:data.name,status:'pending',input:data.args,round:data.round,at:event.created_at};rows.push(row);pending.push(row);}
      else if(kind==='model_response'){const row=rows.find(row=>row.key==='model:'+data.id);if(row)Object.assign(row,{status:'success',duration:data.duration_ms,output:data.usage});}
      else if(kind==='tool_result'){const row=pending.find(row=>row.status==='pending'&&(data.id?row.callId===data.id:row.name===data.name));if(row)Object.assign(row,{status:data.ok?'success':'failed',duration:data.duration_ms,output:data.result??data.summary,summary:data.summary,path:data.path});else rows.push({key:'result:'+event.event_id,kind:'tool',name:data.name,status:data.ok?'success':'failed',output:data.result??data.summary,duration:data.duration_ms,at:event.created_at});}
      else if(kind==='reasoning_done'&&data.content){rows.push({key:'reasoning:'+event.event_id,kind:'reasoning',name:'Reasoning summary',status:'done',output:data.content,duration:data.duration_ms,at:event.created_at});}
      else if(kind==='assistant'){rows.push({key:'assistant:'+event.event_id,kind:'assistant',name:'Expert reply',status:'done',output:data.content,at:event.created_at});}
      else if(['error','cancelled','sub','team','template_used','done'].includes(kind)){const detail=kind==='error'?(data.message||data.detail||data.error||data.summary||data.output?.message||data.result?.message||'Run failed'):'';rows.push({key:kind+':'+event.event_id,kind,name:kind==='error'?'Run error ·'+detail:({cancelled:'Stop run',done:'End of round',sub:'Sub-dispatch',team:'Team',template_used:'Apply template'}[kind]||kind),status:kind==='error'?'failed':kind==='cancelled'?'cancelled':'done',summary:detail||data.summary||'',output:data,at:event.created_at});}
    }
    if(['done','failed','cancelled','interrupted'].includes(status))rows.filter(row=>row.status==='pending').forEach(row=>row.status='interrupted');
    return rows;
  }
  function mount(host,options){
    if(host.__trajectoryKey===options.projectId+':'+options.chatId)return;
    host.__trajectoryDispose?.();host.__trajectoryKey=options.projectId+':'+options.chatId;
    let runs=[],runId='',events=[],after=0,hasMore=false,busy=false,selected='',request=0,signature='',olderCursor=null;
    host.innerHTML=`<header class="wt-heading"><div><span class="pw-eyebrow">AGENT ACTIVITY</span><h3>Execution timeline</h3></div><span class="wt-live" data-wt-live></span></header><div class="wt-toolbar"><label>Run<select class="control" data-wt-runs aria-label="Choose a run"></select></label><input class="control" type="search" data-wt-search aria-label="Filter the execution trace" placeholder="Search tools, arguments, or results"><label class="wt-errors"><input type="checkbox" data-wt-errors>Failures only</label><button class="pw-text-button" data-wt-refresh>Refresh</button></div><p class="wt-summary" data-wt-summary></p><div class="wt-error" data-wt-error role="status"></div><div class="wt-body"><div class="wt-timeline" data-wt-list role="list" aria-label="Execution event timeline"></div></div><button type="button" class="pw-text-button" data-wt-more hidden>Load more records</button>`;
    host.querySelector('.wt-toolbar').insertAdjacentHTML('beforeend','<button type="button" class="pw-text-button" data-wt-older hidden>Earlier rounds</button>');
    const el=name=>host.querySelector('[data-wt-'+name+']');
    const current=()=>host.isConnected&&options.live();
    const serialize=value=>typeof value==='string'?value:JSON.stringify(value,null,2);
    const atTime=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'Time not recorded':date.toLocaleTimeString('zh-CN',{hour12:false});};
    const kinds={model:['◈','Model request'],tool:['⌘','Tool call'],reasoning:['◌','Reasoning summary'],assistant:['↗','Expert reply'],error:['!','Run error'],cancelled:['■','Stopped'],done:['✓','Round complete'],team:['⑂','Team'],sub:['⑂','Sub-call'],template_used:['▤','Template']};
    function render(){
      const run=runs.find(row=>row.id===runId),all=records(events,run?.status),query=el('search').value.toLowerCase();
      const shown=all.filter(row=>(!el('errors').checked||['failed','cancelled','interrupted'].includes(row.status))&&(!query||JSON.stringify(row).toLowerCase().includes(query)));
      const scroll=el('list').scrollTop;
      el('live').textContent=run?statusLabels[run.status]||run.status:'Waiting to run';el('live').classList.toggle('is-running',run?.status==='running');
      el('summary').textContent=run?`${run.model_name||'Model not recorded'} · ${all.filter(row=>row.kind==='tool').length} tool calls · ${all.filter(row=>row.status==='failed').length} failures`:'After you send a message, model requests, tool calls, and artifacts appear here in order.';
      el('list').innerHTML=shown.map((row,index)=>{
        const [glyph,label]=kinds[row.kind]||['·','Event'],expanded=row.key===selected;
        const preview=serialize(row.summary||row.output||row.input||'Waiting for result')||'';
        return `<article class="wt-event ${h(row.status)} ${expanded?'is-expanded':''}" role="listitem"><time class="wt-time" datetime="${h(row.at||'')}">${h(atTime(row.at))}</time><div class="wt-track"><span class="wt-dot" aria-hidden="true">${glyph}</span></div><div class="wt-entry"><button type="button" class="wt-row" data-wt-record="${h(row.key)}" aria-expanded="${expanded}"><span class="wt-row-top"><span class="wt-kind">${label}${row.round===undefined?'':' · round '+(row.round+1)}</span><span class="wt-state">${h(statusLabels[row.status]||row.status)}</span><span class="wt-duration">${row.duration===undefined?'Duration not recorded':(row.duration/1000).toFixed(2)+' s'}</span><span class="wt-chevron">${expanded?'−':'+'}</span></span><strong class="wt-name">${h(row.name)}</strong><span class="wt-preview">${h(preview.replace(/\s+/g,' ').slice(0,180))}</span></button>${expanded?`<section class="wt-inspector" data-wt-inspector aria-label="Call details"><div class="wt-inspector-head"><span>Call details</span><button type="button" class="pw-text-button" data-wt-copy>Copy details</button></div><div class="wt-detail-grid"><div><h4>Input arguments</h4><pre>${h(serialize(row.input??'This event has no input parameters'))}</pre></div><div><h4>Output</h4><pre>${h(serialize(row.output??'Waiting for result'))}</pre></div></div>${row.output?.truncated?'<p class="hint">This is a result preview; see the task artifacts for the full content.</p>':''}<details><summary>Run info</summary><pre>${h(JSON.stringify({run_id:runId,call_id:row.callId,round:row.round,started_at:row.at,duration_ms:row.duration,path:row.path},null,2))}</pre></details></section>`:''}</div></article>`;
      }).join('')||'<div class="wt-empty"><span aria-hidden="true">◌</span><h4>Every step is recorded here</h4><p>After one chat run you can expand a node to see its input, result, and timing.</p></div>';
      el('list').scrollTop=scroll;el('more').hidden=!hasMore;
      el('list').querySelectorAll('[data-wt-record]').forEach(button=>button.onclick=()=>{selected=selected===button.dataset.wtRecord?'':button.dataset.wtRecord;render();el('list').querySelectorAll('[data-wt-record]').forEach(item=>{if(item.dataset.wtRecord===button.dataset.wtRecord)item.focus({preventScroll:true});});});
      const row=all.find(row=>row.key===selected);if(row&&el('copy'))el('copy').onclick=()=>navigator.clipboard.writeText(JSON.stringify(row,null,2)).then(()=>uiNotify('Call details copied'),()=>uiNotify('Copy failed'));
    }
    async function loadEvents(reset=false){
      if(!runId||!current())return;const ticket=++request,id=runId;
      const data=await api('/api/agent-settings/trajectory/events?chat_id='+encodeURIComponent(options.chatId)+'&project_id='+encodeURIComponent(options.projectId)+'&run_id='+encodeURIComponent(id)+'&after='+(reset?0:after));
      if(!current()||ticket!==request||id!==runId)return;
      events=reset?data.events:[...events,...data.events.filter(row=>!events.some(old=>old.event_id===row.event_id))];after=data.next_after;hasMore=data.has_more;
      if(!selected){const firstError=records(events,data.status).find(row=>row.kind==='error');if(firstError)selected=firstError.key;}
      const mark=JSON.stringify([id,data.status,events]);if(mark!==signature){signature=mark;render();}
    }
    async function refresh(){
      if(busy||!current()||!options.chatId)return;busy=true;
      try{const data=await api('/api/agent-settings/trajectory?chat_id='+encodeURIComponent(options.chatId)+'&project_id='+encodeURIComponent(options.projectId));if(!current())return;if(!runs.length)olderCursor=data.next_before;runs=[...data.runs,...runs.filter(old=>!data.runs.some(row=>row.id===old.id))];el('older').hidden=!olderCursor;
        if(!runs.some(row=>row.id===runId)){runId=runs[0]?.id||'';events=[];after=0;selected='';}
        if(document.activeElement!==el('runs')){el('runs').innerHTML=runs.map(row=>`<option value="${h(row.id)}">${h(fmtDate(row.created_at))} · ${h(statusLabels[row.status]||row.status)} · ${h(row.message.slice(0,32))}</option>`).join('');el('runs').value=runId;}
        if(runId)await loadEvents(!events.length);else render();el('error').textContent='';
      }catch(error){if(current())el('error').textContent='Failed to read trace:'+error.message;}finally{busy=false;}
    }
    el('runs').onchange=()=>{runId=el('runs').value;events=[];after=0;selected='';loadEvents(true).catch(error=>el('error').textContent=error.message);};
    el('older').onclick=async()=>{if(!olderCursor)return;try{const data=await api('/api/agent-settings/trajectory?chat_id='+encodeURIComponent(options.chatId)+'&project_id='+encodeURIComponent(options.projectId)+'&before='+olderCursor);if(!current())return;runs.push(...data.runs.filter(row=>!runs.some(old=>old.id===row.id)));olderCursor=data.next_before;await refresh();}catch(error){if(current())el('error').textContent=error.message;}};
    el('search').oninput=render;el('errors').onchange=render;el('refresh').onclick=refresh;el('more').onclick=()=>loadEvents().catch(error=>el('error').textContent=error.message);
    const timer=setInterval(()=>{if(!host.isConnected){clearInterval(timer);return;}if(!document.hidden&&!host.hidden)refresh();},1500);
    host.__trajectoryDispose=()=>{clearInterval(timer);request++;};refresh();render();
  }
  return {mount};
})();
