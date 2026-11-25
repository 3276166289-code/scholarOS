/* A conversation is the stable entry point for every execution and retry. */
const ExecutionConversation=(()=>{
  const labels={ready:'Pending',queued:'Queued',running:'In progress',awaiting_review:'Waiting for review',succeeded:'Completed',completed:'Completed',delivered:'Delivered',failed:'Failed',blocked:'Waiting',interrupted:'Interrupted, pending resume',cancelled:'Stopped'};
  const h=value=>esc(String(value??''));
  const messageKey=value=>String(value??'').replace(/\s+/g,' ').trim();
  const userInputKey=value=>{
    const normalized=messageKey(value);
    for(const marker of ['[materials explicitly cited by this project]','[@context]','[prompt template the user explicitly used:','[materials chosen by the user]','[context mentioned with @]']){
      const index=normalized.indexOf(marker);
      if(index>0)return normalized.slice(0,index).trim();
    }
    return normalized;
  };
  async function open(kind,id,project){
    const data=await api('/api/execution-conversations?kind='+encodeURIComponent(kind)+'&entity_id='+encodeURIComponent(id)+'&project_id='+encodeURIComponent(project));
    await ProjectWorkspace.openConversation(data.execution.chat_id,project);
  }
  function render(box,data,refresh){
    const execution=data.execution,project=execution.project_id,flow=execution.kind==='workflow';
    const header=box.closest('.pw-chat')?.querySelector('.pw-conversation-tabs');
    if(header){let indicator=header.querySelector('[data-execution-indicator]');if(!indicator){indicator=document.createElement('button');indicator.type='button';indicator.className='execution-chat-indicator';indicator.dataset.executionIndicator='';header.append(indicator);}indicator.textContent=(flow?'Workflow':'Task')+' · '+(labels[execution.status]||execution.status);indicator.title='View run progress and actions';indicator.onclick=()=>box.querySelector('.execution-chat-summary')?.scrollIntoView({block:'start'});}
    const opened=new Set([...box.querySelectorAll('details[open]')].map(node=>node.dataset.executionDetail).filter(Boolean));
    const oldScroll=box.scrollTop,atBottom=box.scrollHeight-box.clientHeight-oldScroll<70;
    box.innerHTML=`<section class="execution-chat-summary" data-execution-id="${h(execution.entity_id)}"><div><span class="execution-chat-kind">${flow?'Workflow chats':'Task chats'}</span><strong>${h(execution.title)}</strong><span class="pw-state">${h(labels[execution.status]||execution.status)}</span></div><div class="execution-chat-actions"><button type="button" class="btn ghost" data-execution-detail>${flow?'Workflow nodes and reviews':'Tasks and output'}</button>${(execution.prepared||['ready','failed','blocked','interrupted',...(flow?[]:['cancelled'])].includes(execution.status))?'<button type="button" class="btn" data-pw-start>Continue</button>':''}${['queued','running'].includes(execution.status)?'<button type="button" class="btn ghost" data-execution-stop>Stop</button>':''}<button type="button" class="pw-text-button" data-execution-refresh>Refresh progress</button></div><p class="pw-error" role="alert" data-execution-error></p></section>`;
    box.querySelector('[data-execution-detail]').onclick=()=>flow?ProjectWorkspace.openWorkflowRun(project,execution.workflow_run_id):ProjectWorkspace.openTask(execution.entity_id,project);
    box.querySelector('[data-execution-refresh]').onclick=refresh;
    box.querySelector('[data-execution-error]').textContent=execution.error||'';
    if(execution.executor){const who=execution.executor,label=document.createElement('p');label.className='execution-chat-executor';label.textContent='Executor ·'+who.sender+(who.team_name?' · '+who.team_name:'')+(who.member_name?' / '+who.member_name:'');box.querySelector('.execution-chat-summary').append(label);}
    const start=box.querySelector('[data-pw-start]');if(start)start.textContent=execution.prepared?'Start workflow':execution.status==='ready'?'Start task':'Continue';
    if(execution.node_result?.available){const button=document.createElement('button');button.type='button';button.className='btn btn-primary';button.dataset.executionNodeResult=execution.entity_id;button.textContent='Node finished · view output';button.onclick=()=>ProjectWorkspace.openNodeResult({task_id:execution.entity_id,project_id:project,task_run_id:execution.node_result.task_run_id,output_revision:execution.node_result.output_revision},project,{chatId:execution.chat_id});box.querySelector('.execution-chat-actions').append(button);}
    for(const [index,output] of ((!execution.workflow_run_id||execution.node_result?.available)?execution.outputs||[]:[]).entries()){
      const button=document.createElement('button');button.type='button';button.className='btn ghost';button.dataset.pwOutput=String(index);button.textContent='View output ·'+(output.name||output.relative||'Result');
      button.onclick=async event=>{event.stopPropagation();await ProjectWorkspace.openTask(execution.entity_id,project,{chatId:execution.chat_id});document.querySelector('#pwResource [data-pw-output="'+index+'"]')?.click();};
      box.querySelector('.execution-chat-actions').append(button);
    }
    for(const child of execution.children||[]){
      if(child.node_result?.available){const result=document.createElement('button');result.type='button';result.className='btn btn-primary';result.dataset.executionNodeResult=child.id;result.textContent=child.title+'Completed · View output';result.onclick=()=>ProjectWorkspace.openNodeResult({...child.node_result,task_id:child.id,project_id:project},project,{chatId:execution.chat_id});box.querySelector('.execution-chat-actions').append(result);}
      if(child.status!=='awaiting_review')continue;
      const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Review ·'+child.title;button.dataset.executionReview=child.id;
      button.onclick=()=>ProjectWorkspace.openTask(child.id,project,{chatId:execution.chat_id});box.querySelector('.execution-chat-actions').append(button);
    }
    for(const [selector,action] of [['[data-pw-start]','start'],['[data-execution-stop]','cancel']]){
      const button=box.querySelector(selector);if(!button)continue;
      button.onclick=async event=>{event.stopPropagation();button.disabled=true;try{
        if(action==='cancel'&&execution.active_run_kind==='conversation')await api('/api/execution-board/conversation-action',{project_id:project,run_id:execution.active_run_id,action:'stop'});
        else await api(flow?'/api/workflow/execution/'+(action==='start'?(execution.prepared?'start':'resume'):'cancel'):'/api/project-tasks/'+action,{id:execution.entity_id,project_id:project,request_key:crypto.randomUUID()});await refresh();
      }catch(error){box.querySelector('[data-execution-error]').textContent=error.message;button.disabled=false;}};
    }
    if(execution.children?.length){
      const nodes=document.createElement('details');nodes.className='execution-chat-nodes';nodes.dataset.executionDetail='nodes';nodes.open=opened.has('nodes');
      nodes.innerHTML=`<summary>${flow?'Workflow nodes':'Derived task'} · ${execution.children.length}</summary><div>${execution.children.map(child=>`<article><span><b>${h(child.title)}</b><small>${h(labels[child.status]||child.status)}</small></span><button type="button" class="pw-text-button" data-child-chat="${h(child.id)}">Open chat</button><button type="button" class="btn ghost" data-child-task="${h(child.id)}">${child.node_result?.available?'View node output':child.status==='awaiting_review'?'Review artifact':'Task details'}</button></article>`).join('')}</div>`;
      const openChild=id=>{const child=(execution.children||[]).find(item=>item.id===id);if(child?.node_result?.available)return ProjectWorkspace.openNodeResult({...child.node_result,task_id:child.id,project_id:project},project,{chatId:execution.chat_id});return ProjectWorkspace.openTask(id,project,{chatId:execution.chat_id});};
      nodes.querySelectorAll('[data-child-chat]').forEach(button=>button.onclick=async()=>{
        try{await open('task',button.dataset.childChat,project);}
        catch(error){box.querySelector('[data-execution-error]').textContent=error.message;}
      });
      nodes.querySelectorAll('[data-child-task]').forEach(button=>button.onclick=()=>openChild(button.dataset.childTask));box.append(nodes);
    }
    let canonicalGoalRendered=false;
    const renderedUsers=new Set();
    const goalKey=messageKey(execution.goal||'');
    for(const message of data.messages||[]){
      if(message.role==='user'){
        const inputKey=userInputKey(message.content);
        if(inputKey&&renderedUsers.has(inputKey))continue;
        if(inputKey)renderedUsers.add(inputKey);
      }
      if(message.role==='user'&&goalKey&&userInputKey(message.content)===userInputKey(goalKey)){
        if(canonicalGoalRendered)continue;
        canonicalGoalRendered=true;
      }
      const section=document.createElement('section');section.className='execution-chat-turn';section.dataset.executionMessage=message.id;
      if(message.attempt)section.innerHTML=`<div class="execution-chat-turn-meta">${h(message.task_title)} · attempt ${message.attempt} · ${h(labels[message.status]||message.status)}${message.team_name?' · '+h(message.team_name):''}${message.member_name?' · '+h(message.member_name):''}</div>`;
      appendOne(section,{...message,type:message.role,content:message.content||labels[message.status]||'',replay:true,at:message.created_at});
      section.querySelectorAll('details').forEach((node,index)=>{node.dataset.executionDetail=message.id+':'+index;node.open=opened.has(node.dataset.executionDetail);});box.append(section);
    }
    box.scrollTop=atBottom?box.scrollHeight:oldScroll;
  }
  return {open,render};
})();
