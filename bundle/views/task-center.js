/* Plans describe goals; this board projects actual runtime state. */
const TaskCenter=(()=>{
  const h=value=>esc(String(value??''));
  const labels={draft:'Ready',ready:'Pending',queued:'Queued',running:'In progress',waiting_input:'Waiting for input',awaiting_review:'To verify',delivered:'Delivered',completed:'Completed',blocked:'Waiting',failed:'Failed',cancelled:'Stopped',interrupted:'Interrupted, pending resume'};
  const activities={not_started:'Not started',conversation_running:'An expert in this chat is working',organize:'Task updated',delete:'Moved to Recently deleted',restore:'Task restored',created:'Task ready',queued:'Task queued',claimed:'Start run',running:'In progress',output_ready:'Artifacts generated, awaiting review',delivered:'Delivered',reviewed:'Review recorded',approved:'Verified',rejected:'Sent back for revision',failed:'Failed',cancelled:'Stopped',interrupted:'Run interrupted',blocked:'Waiting on prerequisites',model_request:'Request model',model_response:'Model responded',tool_call:'Call tool',tool_result:'Tool returned',error:'Failed',board_delete:'Removed from board',board_restore:'Restored to board',done:'Run finished',run_started:'Begin run',plan_linked:'Research plan linked',mode_changed:'Run mode updated'};
  const activity=value=>value==='start_blocked'?'Start failed':activities[value]||value;
  const planLabels={TODO:'To schedule',IN_PROGRESS:'In progress',REVIEW:'Awaiting review',DONE:'Completed'};
  const planTones={TODO:'sky',IN_PROGRESS:'violet',REVIEW:'amber',DONE:'green'};
  const lanes=[
    {id:'pending',label:'Pending',tone:'sky',statuses:['draft','ready','queued']},
    {id:'running',label:'In progress',tone:'violet',statuses:['running']},
    {id:'review',label:'To confirm',tone:'amber',statuses:['awaiting_review','waiting_input']},
    {id:'done',label:'Completed',tone:'green',statuses:['delivered','completed']},
    {id:'attention',label:'Needs action',tone:'rose',statuses:['blocked','failed','interrupted'],optional:true},
    {id:'stopped',label:'Stopped',tone:'slate',statuses:['cancelled'],optional:true}
  ];
  const tone=status=>planTones[status]||lanes.find(lane=>lane.statuses.includes(status))?.tone||'slate';
  const views=new Map();let mounted=null,globalProject='',globalView='board';
  const owner=row=>row.project_id||row.task_id;
  function requestView(view){globalView=view;}
  function renderGlobal(container){if(globalProject&&!S.tasks.some(row=>row.id===globalProject))globalProject='';return render(container,{global:true,projectId:globalProject,view:globalView,live:()=>route()==='task-center'});}
  function dispose(){mounted?.source?.close();clearInterval(mounted?.fallback);clearInterval(mounted?.guard);if(mounted?.onVisible)document.removeEventListener('visibilitychange',mounted.onVisible);if(mounted?.todoChanged)window.removeEventListener('todos-changed',mounted.todoChanged);if(mounted?.menuClosed)window.removeEventListener('rw:context-menu-closed',mounted.menuClosed);mounted=null;}
  async function render(container,options={}){
    dispose();const project=options.projectId||'';if(!project&&!options.global)throw new Error('Select a project first');
    const scope=project?'project_id='+encodeURIComponent(project):'all_projects=1';
    const live=()=>mounted===state&&container.isConnected&&(options.live?options.live():route()==='workspace'&&curTask===project);
    const state={view:options.view==='reviews'?'board':options.view==='tasks'?'board':options.view||views.get(project)||'plans',filter:options.view==='reviews'?'awaiting_review':options.filter||'',query:'',projects:S.tasks||[],items:[],plans:[],selected:'',cursor:0,source:null,guard:null,fallback:null,loading:false,version:0,layout:'list',planHistory:false,boardLayout:'status',laneFilter:'',trash:false};mounted=state;
    if(lanes.some(lane=>lane.id===state.filter)){state.laneFilter=state.filter;state.filter='';}
    container.innerHTML=`<section class="execution-center ec-workspace"><header class="ec-heading"><div><span class="pw-eyebrow">${options.global?'Global research and execution':'Project research and execution'}</span><h2>Tasks and automation</h2><p class="hint">Set research goals, follow real execution, and manage recurring triggers.</p></div><div class="ec-head-actions">${options.global?'<label class="ec-project-scope">Project scope<select class="control" data-ec-project aria-label="Filter projects"></select></label>':''}<span class="ec-connection" data-ec-connection role="status">Connecting to the runtime</span><button type="button" class="pw-text-button" data-ec-refresh>Refresh</button></div></header><nav class="ec-tabs" aria-label="How tasks are shown">${[['plans','To-do Plan'],['board','Live task board'],['automation','Automation rules']].map(([id,label])=>`<button type="button" data-ec-view="${id}" aria-pressed="${state.view===id}">${label}</button>`).join('')}</nav><div class="ec-filters" data-ec-filters><input type="search" class="control" data-ec-search placeholder="Search goals or running tasks" aria-label="Search research tasks"><select class="control" data-ec-status aria-label="Task status"></select><select class="control" data-ec-layout aria-label="How plans are shown"><option value="list">List</option><option value="kanban">Board</option><option value="timeline">Timeline</option></select><button type="button" class="pw-text-button" data-ec-trash>Recently deleted</button><button type="button" class="btn" data-ec-new></button></div><div class="ec-kpi-grid" data-ec-summary role="group" aria-label="Task status overview"></div><p class="hint" data-ec-total></p><p class="pw-error" data-ec-error role="alert"></p><div data-ec-content></div></section>`;
    const el=name=>container.querySelector('[data-ec-'+name+']');
    function projectOptions(){return state.projects.map(row=>`<option value="${h(row.id)}">${h(row.title)}</option>`).join('');}
    function paintProjects(){if(!options.global)return;const html='<option value="">All projects</option>'+projectOptions();if(state.projectOptions===html)return;state.projectOptions=html;el('project').innerHTML=html;el('project').value=project;}
    paintProjects();
    if(options.global)el('project').onchange=()=>{globalProject=el('project').value;globalView=state.view;renderGlobal(container);};
    async function chooseProject(){
      if(project)return project;
      if(!state.projects.length){uiNotify('Create a project in the workspace first');return '';}
      return new Promise(resolve=>{
        const dialog=document.createElement('dialog');dialog.className='pt-dialog ec-project-dialog';dialog.setAttribute('aria-label','Select the task project');
        dialog.innerHTML=`<form><h3>Choose its project</h3><p class="hint">Tasks, chats, and output are saved to the chosen project.</p><label>Project<select class="control" name="project_id" required><option value="">SelectProject</option>${projectOptions()}</select></label><footer><button class="btn ghost" type="button">Cancel</button><button class="btn" type="submit">Continue</button></footer></form>`;
        document.body.append(dialog);dialog.querySelector('[type=button]').onclick=()=>dialog.close();
        dialog.querySelector('form').onsubmit=event=>{event.preventDefault();dialog.close(event.currentTarget.elements.project_id.value);};
        dialog.addEventListener('close',()=>{resolve(dialog.returnValue||'');dialog.remove();el('new')?.focus();},{once:true});dialog.showModal();
      });
    }
    async function createTask(){const target=await chooseProject();if(target)await ProjectTasks.compose(target,{});}
    const projectLabel=row=>options.global?`<span class="ec-project-label" title="Project">${h(row.project_name||state.projects.find(p=>p.id===owner(row))?.title||'Untitled project')}</span>`:'';
    el('trash').onclick=()=>{state.trash=!state.trash;state.filter='';state.laneFilter='';paint();};
    state.live=live;state.newPlan=async defaults=>{if(state.view!=='plans')await switchView('plans');editPlan(null,defaults);};state.openPlan=id=>{const plan=state.plans.find(row=>row.id===id);if(!plan)throw new Error('Linked plan deleted');editPlan(plan);};
    function error(message){if(live())el('error').textContent=message||'';}
    const pendingPlan=plan=>plan.status==='TODO'&&!(plan.tasks||[]).length;
    function paint(){
      if(!live()||state.view==='automation')return;
      if(container.querySelector('.context-active')){state.pendingPaint=true;return;}
      state.pendingPaint=false;
      const isPlan=state.view==='plans',dict=isPlan?planLabels:labels;el('trash').hidden=isPlan;el('trash').textContent=state.trash?'Back to task':'Recently deleted';
      el('status').innerHTML=isPlan?'<option value="pending">To schedule</option><option value="history">Dispatched and past</option>':'<option value="">All statuses</option>'+Object.entries(dict).map(([id,label])=>`<option value="${id}">${label}</option>`).join('');el('status').value=isPlan?(state.planHistory?'history':'pending'):state.filter;
      el('status').setAttribute('aria-label',isPlan?'Plan scope':'Task status');
      el('layout').innerHTML=isPlan?'<option value=list>List</option><option value=timeline>By due date</option>':'<option value=status>Columns by status</option><option value=workflow>Grouped by workflow</option>';el('layout').value=isPlan?state.layout:state.boardLayout;el('layout').setAttribute('aria-label',isPlan?'Plan view':'Execution board grouping');el('new').textContent=isPlan?'+ New plan':'+ Run task';
      const rows=(isPlan?state.plans:state.items).filter(row=>(isPlan||!!row.deleted_at===state.trash)&&(isPlan?(state.planHistory?!pendingPlan(row):pendingPlan(row)):!state.filter||row.status===state.filter)&&(!state.laneFilter||lanes.find(lane=>lane.id===state.laneFilter)?.statuses.includes(row.status))&&(!state.query||(row.title+' '+(row.description||'')+' '+(row.acceptance||'')+' '+(row.activity||'')+' '+(row.assistant_name||'')+' '+(row.project_name||state.projects.find(p=>p.id===owner(row))?.title||'')).toLowerCase().includes(state.query)));
      el('total').textContent=isPlan?`${rows.length} items${state.planHistory?'Dispatched or past plans':'Plans awaiting scheduling'} · Follow execution and review status on the live task board`:`${rows.length} runs · ${state.items.filter(row=>!row.deleted_at&&row.status==='running').length} running · Status is updated by the runtime`;
      const summary=isPlan?[{id:'pending',label:'To schedule',tone:'sky',count:state.plans.filter(pendingPlan).length},{id:'history',label:'Dispatched and history',tone:'slate',count:state.plans.filter(plan=>!pendingPlan(plan)).length}]:lanes.map(lane=>({...lane,count:state.items.filter(item=>!!item.deleted_at===state.trash&&lane.statuses.includes(item.status)).length})).filter(lane=>!lane.optional||lane.count);
      el('summary').hidden=isPlan;el('summary').style.setProperty('--ec-kpi-count',summary.length);el('summary').innerHTML=summary.map(item=>`<div class="ec-kpi-wrap"><button type="button" class="ec-kpi" data-ec-summary-filter="${item.id}" data-tone="${item.tone}" aria-pressed="${isPlan?(state.planHistory?'history':'pending')===item.id:state.laneFilter===item.id}"><span class="ec-kpi-label"><i aria-hidden="true"></i>${h(item.label)}</span><strong>${item.count}</strong><span class="ec-kpi-caption">${isPlan?'Research plan':'Actual tasks'}</span></button>${!isPlan&&!state.trash?`<button type="button" class="ec-kpi-clear pw-text-button" data-ec-clear="${item.id}" aria-label="Clear ${h(item.label)} log" title="Clear this column" ${item.count?'':'disabled'}>Clear</button>`:''}</div>`).join('');
      el('summary').querySelectorAll('[data-ec-summary-filter]').forEach(button=>button.onclick=()=>{const id=button.dataset.ecSummaryFilter;if(isPlan)state.planHistory=id==='history';else{state.filter='';state.laneFilter=state.laneFilter===id?'':id;}paint();});
      if(isPlan){
        if(state.layout==='timeline')rows.sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')||a.priority.localeCompare(b.priority));
        el('content').innerHTML=`<div class="ec-plans ec-plan-${state.layout}">${rows.map(planCard).join('')}</div>`;
        el('content').querySelectorAll('[data-plan-id]').forEach(card=>{const plan=state.plans.find(row=>row.id===card.dataset.planId);card.__ecActions=[{text:'Edit research plan...',run:()=>editPlan(plan)},{text:'Priority...',run:()=>editPlan(plan,{},'priority')},{text:'Due date...',run:()=>editPlan(plan,{},'due_date')},{separator:true},{text:'Give to Agent / Team',run:()=>ProjectTasks.compose(owner(plan),{plan_id:plan.id,title:plan.title,goal:plan.description||plan.title})},{text:plan.status==='DONE'?'Restore to unscheduled':'Archive plan',disabled:!!plan.stage||!!(plan.tasks||[]).length,run:async()=>{await api('/api/plans/save',{project_id:owner(plan),id:plan.id,status:plan.status==='DONE'?'TODO':'DONE'});window.dispatchEvent(new Event('todos-changed'));await load();}},{text:'Copy plan',run:()=>TaskActions.copy(plan.title+'\n'+(plan.description||''))},{separator:true},{text:'Delete plan...',danger:true,run:()=>removePlan(plan)}];});
        if(!rows.length)el('content').innerHTML='<div class="pw-empty"><h3>No plans waiting to be scheduled</h3><p>you can add a new goal. Track dispatched tasks on the live board; the original plan stays in“Dispatched and past”in progress.</p></div>';
        el('content').querySelectorAll('[data-plan-edit]').forEach(button=>button.onclick=()=>editPlan(state.plans.find(row=>row.id===button.dataset.planEdit)));
        el('content').querySelectorAll('[data-plan-dispatch]').forEach(button=>button.onclick=()=>{const plan=state.plans.find(row=>row.id===button.dataset.planDispatch);ProjectTasks.compose(owner(plan),{plan_id:plan.id,title:plan.title,goal:plan.description||plan.title});});
        el('content').querySelectorAll('[data-plan-task]').forEach(button=>button.onclick=()=>AppNavigation.follow(()=>ProjectWorkspace.openTask(button.dataset.planTask,owner(state.plans.find(row=>row.id===button.closest('[data-plan-id]').dataset.planId)),{peek:false})));
        return;
      }
      if(!rows.some(row=>row.id===state.selected))state.selected='';
      const shownLanes=lanes.filter(lane=>state.laneFilter?lane.id===state.laneFilter:state.filter?lane.statuses.includes(state.filter):!lane.optional||rows.some(row=>lane.statuses.includes(row.status)));
      let board;
      if(state.boardLayout==='workflow'){
        const grouped=new Map();for(const row of rows){const key=row.workflow_run_id||row.parent_task_id||'standalone';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
        board=[...grouped].map(([key,items])=>`<section class="ec-run-group"><h3>${key==='standalone'?'Standalone tasks and chats':key.startsWith('wrun')?'LangGraph Workflow':'Team'}<span class="ec-count">${items.length}</span></h3><div class="ec-run-grid">${items.map(runCard).join('')}</div></section>`).join('')||'<div class="pw-empty"><h3>No runs yet</h3><p>Track progress here after dispatching from a plan, running from a conversation, or triggering automation.</p></div>';
      }else{
        board=`<div class="ec-lanes" data-lane-count="${shownLanes.length}">${shownLanes.map(lane=>{const tasks=rows.filter(row=>lane.statuses.includes(row.status));return `<section class="ec-status-lane" data-ec-lane="${lane.id}" data-tone="${lane.tone}"><header class="ec-lane-head"><h3><span class="ec-lane-dot" aria-hidden="true"></span>${lane.label}</h3><div class="ec-lane-actions"><span class="ec-count">${tasks.length}</span>${!state.trash?`<button type="button" class="pw-text-button" data-ec-clear="${lane.id}" aria-label="Clear${h(lane.label)}records in this column" ${tasks.length?'':'disabled'}>Clear this column</button>`:''}</div></header><div class="ec-lane-body">${tasks.map(runCard).join('')||'<p class="ec-lane-empty">None'+lane.label+'’s tasks</p>'}</div></section>`;}).join('')}</div>`;
      }
      el('content').innerHTML=`<div class="ec-live-layout"><div class="ec-live-groups">${board}</div><aside class="ec-run-inspector" data-ec-inspector ${state.selected&&state.inspectorOpen?'':'hidden'} aria-label="Run details"></aside></div>`;
      el('content').querySelectorAll('[data-ec-task]').forEach(card=>{
        const row=state.items.find(item=>item.id===card.dataset.ecTask);
        const open=()=>{if(row.deleted_at){state.selected=row.id;return inspect();}return openExecutionConversation(row);};
        card.onclick=event=>{if(event.target.closest('button,a,input,select'))return;state.selected=row.id;container.querySelectorAll('[data-ec-task]').forEach(item=>{item.classList.toggle('is-selected',item===card);item.setAttribute('aria-pressed',String(item===card));});if(row.deleted_at)inspect();};
        card.ondblclick=event=>{if(!event.target.closest('button,a,input,select'))open();};
        card.onkeydown=event=>{if(event.target===card&&['Enter',' '].includes(event.key)){event.preventDefault();open();}};
        bindExecutionActions(card,row);
      });
      el('content').querySelectorAll('[data-ec-task]').forEach(card=>{const row=state.items.find(item=>item.id===card.dataset.ecTask),actions=TaskActions.actions(row,load),detail={text:'View run details',run:()=>{state.selected=card.dataset.ecTask;state.inspectorOpen=true;inspect();}};card.__ecActions=row.deleted_at?[detail,...actions]:[actions[0],detail,...actions.slice(1)];});
      container.querySelectorAll('[data-ec-clear]').forEach(button=>button.onclick=async()=>{
        const lane=lanes.find(item=>item.id===button.dataset.ecClear),items=state.items.filter(row=>!row.deleted_at&&lane.statuses.includes(row.status));
        button.disabled=true;try{await TaskActions.visibility(items,load,'delete',lane.label);}catch(err){error(err.message);}finally{if(button.isConnected)button.disabled=!items.length;}
      });
      if(state.selected&&state.inspectorOpen)inspect();
    }
    function planCard(plan){return `<article class="ec-plan-card" data-plan-id="${h(plan.id)}" data-status="${h(plan.status)}" data-tone="${tone(plan.status)}"><div class="ec-plan-title"><span class="ec-priority">${h(plan.priority)}</span><strong>${h(plan.title)}</strong><span class="ec-status" data-tone="${tone(plan.status)}">${pendingPlan(plan)?'To schedule':plan.tasks?.length?'Dispatched':'Past plans'}</span></div><p>${h(plan.description||'No research requirements added yet')}</p>${plan.acceptance?`<small>Acceptance: ${h(plan.acceptance)}</small>`:''}<div class="ec-plan-meta">${projectLabel(plan)}<time>${h(plan.due_date||'No deadline set')}</time><span>${plan.tasks?.length||0} linked runs</span></div><div class="ec-plan-actions"><button type="button" class="pw-text-button" data-plan-edit="${h(plan.id)}">Edit plan</button><button type="button" class="btn ghost" data-plan-dispatch="${h(plan.id)}">Give to Agent / Team</button></div>${(plan.tasks||[]).map(task=>`<button class="ec-plan-linked" type="button" data-plan-task="${h(task.id)}">${h(task.title)} <span>${labels[task.status]}</span></button>`).join('')}</article>`;}
    const artifactNodes=row=>row.workflow_nodes|| (row.node_result?.available?[row.node_result]:[]);
    async function openExecutionConversation(row){
      if(state.opening)return;
      state.opening=true;
      try{
        if(row.channel==='toolbox')await PaperToolbox.openResult(row.run_id,row.project_id);
        else await AppNavigation.follow(()=>row.execution_kind==='workflow'?ExecutionConversation.open('workflow',row.workflow_run_id,row.project_id)
          :row.kind==='task'?ExecutionConversation.open('task',row.id,row.project_id):ProjectWorkspace.openConversation(row.chat_id,row.project_id));
      }catch(err){error(err.message);}
      finally{state.opening=false;}
    }
    function workflowArtifactActions(row){
      const nodes=artifactNodes(row);
      if(!nodes.length&&row.execution_kind==='workflow')return '<button type="button" class="pw-text-button" data-ec-open-workflow>View workflow runs</button>';
      return nodes.map((node,index)=>`<button type="button" class="pw-text-button ec-open-artifact" data-ec-open-artifact="${index}">Node output · ${h(node.title||node.workflow_node_id||'View output')}</button>`).join('');
    }
    function bindExecutionActions(host,row){
      host.querySelector('[data-ec-open-chat], [data-ec-open]')?.addEventListener('click',()=>openExecutionConversation(row));
      host.querySelector('[data-ec-open-workflow]')?.addEventListener('click',()=>AppNavigation.follow(()=>ProjectWorkspace.openWorkflowRun(row.project_id,row.workflow_run_id)));
      const nodes=artifactNodes(row);
      host.querySelectorAll('[data-ec-open-artifact]').forEach(button=>button.onclick=()=>AppNavigation.follow(()=>ProjectWorkspace.openNodeResult(nodes[Number(button.dataset.ecOpenArtifact)],row.project_id)));
    }
    function runCard(row){
      const kind=row.execution_kind==='workflow'?'Workflow':row.workflow_node_id?'Flow node':row.channel==='toolbox'?'Paper tools':row.kind==='conversation'?'Chat run':row.executor_kind==='team'?'Team':'Expert task';
      const targetLabel='Open chat';
      const actionLabel=row.deleted_at?'View run details':targetLabel;
      return `<article role="button" tabindex="0" class="ec-run-card ${state.selected===row.id?'is-selected':''}" data-ec-task="${h(row.id)}" data-ec-owner="${h(row.project_id)}" data-status="${h(row.status)}" data-tone="${tone(row.status)}" aria-pressed="${state.selected===row.id}" title="double-click or press Enter ${actionLabel}"><div class="ec-run-title"><strong class="ec-card-title">${row.pinned?'<span class="ec-pin" title="Pinned">Pin</span>':''}${h(row.title)}</strong><span class="ec-status" data-tone="${tone(row.status)}"><i aria-hidden="true"></i>${labels[row.status]||h(row.status)}</span></div>${projectLabel(row)}<p class="ec-card-activity">${h(activity(row.activity)||'Waiting for run events')}</p><div class="ec-run-actor"><span class="ec-actor-mark" aria-hidden="true">${h((row.assistant_name||'A').slice(0,1))}</span><span>${h(row.assistant_name||'Waiting for an executor')}</span>${row.attempt?'<span class="ec-attempt">attempt '+row.attempt+'</span>':''}</div><footer><span class="ec-card-type">${kind}${row.priority?' · '+h(row.priority):''}</span>${row.due_date?`<span>Due ${h(row.due_date)}</span>`:''}<time>${h(fmtDate(row.updated_at))}</time></footer>${row.deleted_at?'':`<div class="ec-card-actions"><button type="button" class="pw-text-button ec-open-chat" data-ec-open-chat aria-label="${targetLabel}: ${h(row.title)}">${targetLabel}</button>${workflowArtifactActions(row)}</div>`}${row.error?`<small class="ec-card-error">${h(row.error)}</small>`:''}</article>`;
    }
    async function inspect(){
      const row=state.items.find(item=>item.id===state.selected),box=el('inspector');if(!row||!box)return;
      const targetLabel='Open chat';
      state.inspectorOpen=true;box.hidden=false;box.dataset.tone=tone(row.status);container.querySelectorAll('[data-ec-task]').forEach(card=>{const selected=card.dataset.ecTask===row.id;card.classList.toggle('is-selected',selected);card.setAttribute('aria-pressed',String(selected));});box.innerHTML=`<header><strong>${h(row.title)}</strong><button type="button" class="pw-text-button" data-ec-inspector-close aria-label="Close the run details">×</button></header><p class="ec-status" data-tone="${tone(row.status)}">${labels[row.status]||h(row.status)}</p><p>${h(row.assistant_name)}${row.model_id?' · '+h(S.models?.find(model=>model.id===row.model_id)?.model||row.model_id):''}</p><div class="ec-inspector-actions">${row.deleted_at?'':`<button type="button" class="btn" data-ec-open>${targetLabel}</button>`}${['running','queued','waiting_input'].includes(row.status)?'<button type="button" class="btn ghost" data-ec-stop>Stop</button>':''}${row.kind==='conversation'&&['failed','interrupted'].includes(row.status)?'<button type="button" class="btn ghost" data-ec-resume>Continue</button>':''}</div><ol class="ec-event-rail" data-ec-events></ol>`;
      if(!row.deleted_at){
        box.querySelector('.ec-inspector-actions').insertAdjacentHTML('afterend',`<div class="ec-node-artifacts">${workflowArtifactActions(row)}</div>`);
        bindExecutionActions(box,row);
      }
      const visibility=document.createElement('button');visibility.type='button';visibility.className='btn ghost';visibility.dataset.ecVisibility='';visibility.textContent=row.deleted_at?'Restore to board':'Remove from board';
      box.querySelector('.ec-inspector-actions').append(visibility);visibility.onclick=async()=>{visibility.disabled=true;try{await TaskActions.visibility([row],load,row.deleted_at?'restore':'delete');}catch(err){error(err.message);}finally{if(visibility.isConnected)visibility.disabled=false;}};
      box.querySelector('[data-ec-inspector-close]').onclick=()=>{state.selected='';state.inspectorOpen=false;box.hidden=true;container.querySelectorAll('[data-ec-task]').forEach(card=>{card.classList.remove('is-selected');card.setAttribute('aria-pressed','false');});};
      for(const action of ['stop','resume']){const button=box.querySelector('[data-ec-'+action+']');if(button)button.onclick=async()=>{button.disabled=true;try{if(action==='stop')await TaskActions.stop(row);else await api(row.execution_kind==='workflow'?'/api/workflow/execution/resume':'/api/execution-board/conversation-action',{project_id:row.project_id,id:row.run_id,run_id:row.run_id,action});await load();}catch(err){error(err.message);if(button.isConnected)button.disabled=false;}};}
      try{const data=await api('/api/execution-board/events?project_id='+encodeURIComponent(row.project_id)+'&task_id='+encodeURIComponent(row.active_run_kind==='conversation'||row.kind==='conversation'?row.chat_id:row.id)+'&run_id='+encodeURIComponent(row.active_run_id||row.run_id||'')+'&after=0&limit=200&latest=1');if(!live()||!box.isConnected||state.selected!==row.id)return;box.querySelector('[data-ec-events]').innerHTML=data.events.slice(-40).map(event=>`<li><time>${h(fmtDate(event.created_at))}</time><strong>${h(activity(event.activity||event.kind))}</strong></li>`).join('')||'<li>No run events recorded</li>';}catch(err){error(err.message);}
    }
    async function removePlan(plan){
      if(!await uiConfirm('Delete this research plan? Its runs and output stay on the board.'))return false;
      await api('/api/plans/delete',{project_id:owner(plan),id:plan.id});window.dispatchEvent(new Event('todos-changed'));await load();return true;
    }
    async function editPlan(plan,defaults={},focus='title'){
      const target=plan?owner(plan):await chooseProject();if(!target)return;
      const origin=document.activeElement;
      const dialog=document.createElement('dialog');dialog.className='pt-dialog';dialog.setAttribute('aria-label',plan?'Edit research plan':'New research plan');
      dialog.innerHTML=`<form class="ec-plan-form"><header><h3>${plan?'Edit the research plan':'New research plan'}</h3><button type="button" class="pw-text-button" data-plan-close aria-label="Close">×</button></header><label>Research goal<input class="control" name="title" required maxlength="500" value="${h(plan?.title||'')}"></label><label>Research requirements<textarea class="control" name="description" rows="4">${h(plan?.description||'')}</textarea></label><label>Acceptance criteria<textarea class="control" name="acceptance" rows="3">${h(plan?.acceptance||'')}</textarea></label><div class="ec-plan-fields"><label>Priority<select class="control" name="priority">${['P0','P1','P2'].map(id=>`<option ${(plan?.priority||'P1')===id?'selected':''}>${id}</option>`).join('')}</select></label><label>Deadline<input type="date" class="control" name="due_date" value="${h(plan?.due_date||'')}"></label></div><label>Upstream plan<select class="control" name="dependencies" multiple>${state.plans.filter(row=>owner(row)===target&&row.id!==plan?.id).map(row=>`<option value="${h(row.id)}" ${plan?.dependencies?.includes(row.id)?'selected':''}>${h(row.title)}</option>`).join('')}</select></label><p class="pw-error" data-plan-error role="alert"></p><footer>${plan?'<button type="button" class="pw-text-button" data-plan-delete>Delete plan</button>':''}<span class="pw-spacer"></span><button class="btn" type="submit">Save plan</button></footer></form>`;
      document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();if(origin?.isConnected)origin.focus();else el('new')?.focus();},{once:true});dialog.querySelector('[data-plan-close]').onclick=()=>dialog.close();
      const remove=dialog.querySelector('[data-plan-delete]');if(remove)remove.onclick=async()=>{if(!await uiConfirm('Delete this research plan? Its runs and output stay on the board.'))return;try{await api('/api/plans/delete',{project_id:owner(plan),id:plan.id});dialog.close();window.dispatchEvent(new Event('todos-changed'));await load();}catch(err){dialog.querySelector('[data-plan-error]').textContent=err.message;}};
      dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;try{const data=Object.fromEntries(new FormData(form));data.dependencies=[...form.elements.dependencies.selectedOptions].map(option=>option.value);await api('/api/plans/save',{...data,project_id:target,id:plan?.id||''});if(!plan)state.planHistory=false;dialog.close();window.dispatchEvent(new Event('todos-changed'));await load();}catch(err){dialog.querySelector('[data-plan-error]').textContent=err.message;button.disabled=false;}};
      dialog.showModal();dialog.querySelector('[name='+focus+']').focus();
    }
    async function load(){
      if(!live()||state.view==='automation')return;
      if(state.loading){state.reload=true;return;}
      state.loading=true;const view=state.view;
      try{
        // Keep hidden rows in the projection and apply the active/trash filter
        // locally. This makes switching views immediate and lets a refresh
        // restore deleted task cards without a second race-prone load.
        const data=await api((view==='plans'?'/api/plans?':'/api/execution-board?')+scope+(view!=='plans'?'&include_deleted=1':''));
        if(!live())return;if(state.view!==view){state.reload=true;return;}
        if(data.projects){state.projects=data.projects;paintProjects();}
        const rows=view==='plans'?data.plans:data.items,signature=JSON.stringify(rows),changed=state.loadedView!==view||state.signature!==signature;
        if(view==='plans')state.plans=rows;else{state.items=rows;state.cursor=Math.max(state.cursor,data.cursor);options.onSnapshot?.(rows);}
        state.loadedView=view;state.signature=signature;if(changed)paint();error('');
      }catch(err){error(err.message);}finally{state.loading=false;if(state.reload){state.reload=false;queueMicrotask(load);}}
    }
    async function switchView(view,initial=false){
      container.scrollTop=0;state.loadedView='';state.view=view;if(!initial){state.filter='';state.laneFilter='';}state.selected='';views.set(project,view);if(options.global)globalView=view;
      container.querySelectorAll('[data-ec-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.ecView===view)));
      el('filters').hidden=el('summary').hidden=el('total').hidden=view==='automation';el('content').replaceChildren();
      if(view==='automation'){await renderSchedules(el('content'),{projectId:project,live:()=>live()&&state.view==='automation'});return;}
      await load();
    }
    state.navigationContext=()=>{
      const {view,query,filter,laneFilter,trash,layout,boardLayout,planHistory,selected,inspectorOpen}=state;
      const search=el('search').value;
      return {
        restoreScope(){if(options.global){globalView=view;globalProject=project;}},
        async restoreFilters(){
          const next=mounted;
          if(!next?.live()||next.scope!==scope)return;
          if(next.view!==view)await next.switchView(view);
          if(!next.live())return;
          Object.assign(next,{query,filter,laneFilter,trash,layout,boardLayout,planHistory,selected,inspectorOpen});
          next.paintFilters(search);
        }
      };
    };
    state.scope=scope;state.switchView=switchView;state.paintFilters=value=>{el('search').value=value;paint();};
    let refreshTimer;
    function connect(){if(!live())return;state.source?.close();const source=new EventSource('/api/execution-board/stream?'+scope+'&include_deleted=1&after='+state.cursor);state.source=source;source.onopen=()=>{if(live()){el('connection').textContent='● Live connection';load();}};source.onmessage=event=>{if(!live())return;state.cursor=Math.max(state.cursor,Number(event.lastEventId)||0);if(!refreshTimer)refreshTimer=setTimeout(()=>{refreshTimer=null;load();},100);};source.onerror=()=>{if(live())el('connection').textContent='Reconnecting · log saved';};}
    container.querySelectorAll('[data-ec-view]').forEach(button=>button.onclick=()=>switchView(button.dataset.ecView));
    el('search').oninput=()=>{state.query=el('search').value.toLowerCase();paint();};el('status').onchange=()=>{if(state.view==='plans')state.planHistory=el('status').value==='history';else state.filter=el('status').value;state.laneFilter='';paint();};el('layout').onchange=()=>{if(state.view==='plans')state.layout=el('layout').value;else state.boardLayout=el('layout').value;paint();};el('new').onclick=()=>state.view==='plans'?editPlan():createTask();el('refresh').onclick=()=>state.view==='automation'?renderSchedules(el('content'),{projectId:project,live:()=>live()&&state.view==='automation'}):load();
    state.guard=setInterval(()=>{if(!live()&&mounted===state)dispose();},1000);state.fallback=setInterval(()=>{if(live()&&!document.hidden)load();},3000);
    state.menuClosed=()=>setTimeout(()=>{if(live()&&state.pendingPaint)paint();},0);window.addEventListener('rw:context-menu-closed',state.menuClosed);
    state.todoChanged=()=>{if(live()&&state.view==='plans')load();};window.addEventListener('todos-changed',state.todoChanged);container.__taskCenterRefresh=load;state.onVisible=()=>{if(!document.hidden)load();};document.addEventListener('visibilitychange',state.onVisible);await switchView(state.view,true);connect();
  }
  async function newPlan(){if(mounted?.live?.())return mounted.newPlan();await ProjectWorkspace.openProject(curTask);await ProjectWorkspace.showResource('plan');return mounted.newPlan();}
  async function openPlan(id,project){await ProjectWorkspace.openProject(project);await ProjectWorkspace.showResource('plan');return mounted.openPlan(id);}
  return {render,renderGlobal,requestView,dispose,newPlan,openPlan,navigationContext:()=>mounted?.live()?mounted.navigationContext():null,contextActions:row=>row.__ecActions||[]};
})();
