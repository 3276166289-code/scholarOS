/* Sequential workflow controls and shared project bibliography refresh. */
(() => {
  "use strict";
  const h = value => esc(String(value ?? ""));
  const statuses = {draft:"Ready",prepared:"Ready",queued:"Waiting to run",running:"Running",awaiting_review:"Awaiting manual review",delivered:"Delivered",succeeded:"All done",failed:"Failed",cancelled:"Stopped",blocked:"Waiting for revision",interrupted:"Interrupted, pending resume",rejected:"Returned"};
  let dialog = null, currentRun = null, currentProject = "", focusedRun = "", rendered = "", pollBusy = false, calendarRendered = "";
  const feedback = new Map(), goalDrafts = new Map(), modeDrafts = new Map(), manualDrafts = new Map();
  let nodeTasks=new Map();
  const modeOptions=mode=>`<option value="supervised" ${mode!=="full_access"?"selected":""}>Manual review mode</option><option value="full_access" ${mode==="full_access"?"selected":""}>Auto-accept per the rules</option>`;
  const style = document.createElement("style");
  style.textContent = `.connected-dialog{width:min(900px,calc(100vw - 28px));max-height:88vh;overflow:auto;border:1px solid var(--line);border-radius:14px;padding:22px;background:var(--bg);color:var(--fg)}.connected-dialog::backdrop{background:#0007}.connected-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.connected-dialog textarea{width:100%;min-height:80px}.connected-node{padding:12px 0;border-bottom:1px solid var(--line)}.connected-node pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;font-size:12px}.connected-node details{margin:8px 0}.connected-status{font-size:12px;color:var(--muted);margin:10px 0}.connected-error{color:var(--err);white-space:pre-wrap}.connected-library{font-size:12px;margin:10px 0;color:var(--muted)}`;
  document.head.append(style);

  function activeProject() { return (S.tasks || []).find(t=>t.id===currentProject); }
  function signature(run) { return JSON.stringify(run && [run.id,run.status,run.error,run.current_node,run.settings,run.nodes.map(n=>[n.id,n.status,n.ended_at,n.error,n.checkpoint])]); }
  async function fetchRun() {
    const project=currentProject;
    const [result,taskData]=await Promise.all([api("/api/workflow/execution?"+(dialog?.open && focusedRun?"id="+encodeURIComponent(focusedRun):"task_id="+encodeURIComponent(project))),api('/api/project-tasks?project_id='+encodeURIComponent(project))]);
    if(project!==currentProject) return;
    currentRun=result.run;
    nodeTasks=new Map((taskData.tasks||[]).map(task=>[task.id,task]));
    if(dialog?.open && rendered!==signature(currentRun)) drawRun();
  }
  function drawRun() {
    if(!dialog) return;
    const host=dialog.querySelector("[data-sequence-body]"), run=currentRun;
    rendered=signature(run);
    const active=run && !["succeeded","cancelled","failed"].includes(run.status);
    const prepared=run && (["draft","prepared"].includes(run.status) || run.status==="queued" && run.settings?.prepared && !run.nodes.length);
    const mode=modeDrafts.get(run?.id || currentProject) || run?.settings?.policy?.autonomy_mode || run?.settings?.autonomy_mode || "supervised";
    const manual=active && run.settings?.manual_pending;
    const manualDraft=manual ? (manualDrafts.get(run.id+':'+manual.node_id) || {}) : {};
    host.innerHTML=`<p class="hint">Each node takes its upstream delivery, project memory, and human feedback as a project task. Auto-accept continues once the output and version check pass; nodes marked for mandatory review still need confirmation.</p>
      ${!active?`<label class="field"><span>goal for this run, optional</span><textarea class="control" data-sequence-goal placeholder="e.g. take the current project from literature to finished draft">${h(goalDrafts.get(currentProject) || "")}</textarea></label><label class="field"><span>Run mode for this round</span><select class="control" data-sequence-mode>${modeOptions(modeDrafts.get(currentProject) || "supervised")}</select></label><div class="connected-row"><button class="btn" data-sequence-prepare>Prepare the workflow task</button><button class="btn btn-primary" data-sequence-start>Start sequential run</button></div>`:""}
      ${run?`<div class="connected-row" style="margin-top:12px"><b>${h(run.layout.name)}</b><span class="pill">${h(statuses[run.status] || run.status)}</span>
        ${["failed","blocked","interrupted"].includes(run.status)?'<button class="btn" data-sequence-resume>Resume from the saved progress</button><button class="btn ghost" data-sequence-restart>Rerun this node after checking</button>':""}
        ${prepared?'<button class="btn btn-primary" data-sequence-start-prepared>Start the prepared workflow</button>':""}
        <button class="btn" data-sequence-chat>Open LangGraph</button><button class="btn ghost" data-sequence-project-tasks>View task status</button>
        ${!["succeeded","cancelled"].includes(run.status)?'<button class="btn ghost" data-sequence-cancel>Stop this run</button>':""}</div>
        ${active?`<div class="connected-row" style="margin-top:12px"><label class="field"><span>Run mode for this round</span><select class="control" data-sequence-run-mode>${modeOptions(mode)}</select></label><button class="btn" data-sequence-mode-apply>App run mode</button></div><p class="hint">Mode changes apply to this run's project tasks; project scope and expert tool permissions keep their own grants.</p>`:""}
        ${run.error?`<p class="connected-error">${h(run.error)}</p>`:""}
        ${manual?`<article class="connected-node">
          <h4>Completed manually · ${h(manual.label)}</h4>
          <label class="field"><span>text or description</span><textarea class="control" data-manual-text>${h(manualDraft.text||'')}</textarea></label>
          <label class="field"><span>Project-relative output paths, one per line</span><textarea class="control" data-manual-paths>${h(manualDraft.paths||'')}</textarea></label>
          <button type="button" class="btn btn-primary" data-manual-submit>Submit a manual output</button>
        </article>`:''}
        <p class="connected-status">${h(run.settings.goal || "Run by the project's research question")} · Run ${h(run.id)}</p>
        ${prepared?`<details open><summary>Prepared node tasks</summary>${(run.layout.order || []).map(id=>{const node=run.layout.nodes.find(n=>n.id===id),taskId=run.settings.task_ids?.[id];return `<div class="connected-row" style="margin:8px 0"><span>${h(node?.label || id)}</span>${taskId?`<button class="btn ghost" data-sequence-task="${h(taskId)}">View task and executor</button>`:""}</div>`;}).join("")}</details>`:""}
        ${run.nodes.map(node=>{
          const config=node.acceptance?.config || {}, checkpoint=node.checkpoint || {}, input=checkpoint.input || {}, output=checkpoint.output || {};
          const task=nodeTasks.get(checkpoint.canonical_task_id||node.canonical_task_id),resultAvailable=WorkflowNodeWorkbench.eligible(task);
          const delivery=checkpoint.delivery || node.delivery || {}, source=delivery.source || checkpoint.delivery_source;
          const deliveryMode=delivery.policy_snapshot?.autonomy_mode || checkpoint.policy_snapshot?.autonomy_mode || run.settings?.policy?.autonomy_mode || run.settings?.autonomy_mode;
          const handoffs=task?.latest_run?.input_snapshot?.handoffs || [];
          return `<article class="connected-node"><div class="connected-row"><b>${h(config.label || node.stage)}</b><span class="pill">${h(statuses[node.status] || node.status)}</span><small>${h(input.member?.name || (S.assistants || []).find(a=>a.id===input.assistant_id)?.name || input.assistant_id || "")}</small></div>
            <details><summary>Input and memory · ${(input.history || []).length} prior results</summary><pre>${h(JSON.stringify({goal:input.goal,upstream:input.handoff,memory:input.memory,history:(input.history || []).map(n=>({step:n.step,delivery_id:n.delivery_id,reply:n.reply,feedback:n.feedback}))},null,2))}</pre></details>
            <details ${node.status==="awaiting_review"?"open":""}><summary>Run records</summary><pre>${h(checkpoint.reply || node.error || "Running")}</pre>${resultAvailable?`<pre>${h(typeof output.content==="string"?output.content:JSON.stringify(output.content || output.items || {},null,2))}</pre>`:''}</details>
            ${resultAvailable?`<button class="btn btn-primary" data-sequence-result="${h(task.id)}">View this node’s output</button>`:''}
            ${handoffs.length?`<details><summary>Pinned upstream output</summary><ul>${handoffs.map(item=>`<li>${h(item.source)} · ${h(item.artifact)} · Delivered version ${h(item.delivery_id)}${item.argument?' → '+h(item.argument):''}</li>`).join('')}</ul></details>`:''}
            ${checkpoint.feedback?`<p>Human feedback: ${h(checkpoint.feedback)}</p>`:""}
            ${source?`<p class="connected-status" data-sequence-decision-source>${source==="human"?(delivery.decision==="rejected"?"Returned by manual review":"Passed manual review"):source==="policy"?(deliveryMode==="full_access"?"Auto-reviewed per run policy":"Auto-accepted per node config"):h(source)}</p>`:""}
            ${checkpoint.canonical_task_id || node.canonical_task_id?`<button class="btn ghost" data-sequence-task="${h(checkpoint.canonical_task_id || node.canonical_task_id)}">Open the node’s project task and delivery</button>`:""}
            ${node.status==="awaiting_review" && run.status==="awaiting_review" && run.current_node===node.id?`<label class="field"><span>Review note; optional when passing, required when returning</span><textarea class="control" data-sequence-feedback="${h(node.id)}">${h(feedback.get(node.id) || "")}</textarea></label>
              <div class="connected-row"><button class="btn btn-primary" data-sequence-approve="${h(node.id)}" data-sequence-task-run="${h(checkpoint.canonical_run_id||task?.latest_run_id||'')}" data-sequence-output-version="${Number(checkpoint.output_revision??task?.latest_run?.checkpoint?.output_revision??0)}">Pass and continue</button><button class="btn ghost" data-sequence-reject="${h(node.id)}" data-sequence-task-run="${h(checkpoint.canonical_run_id||task?.latest_run_id||'')}" data-sequence-output-version="${Number(checkpoint.output_revision??task?.latest_run?.checkpoint?.output_revision??0)}">Return for revision</button></div>`:""}</article>`;
        }).join("")}`:"<p class='hint'>This project has no sequential runs yet. Choose each node's expert, team, tools, and skills in the workflow settings first.</p>"}`;
    host.querySelectorAll("[data-sequence-feedback]").forEach(input=>input.oninput=()=>feedback.set(input.dataset.sequenceFeedback,input.value));
    host.querySelector("[data-sequence-goal]")?.addEventListener("input",e=>goalDrafts.set(currentProject,e.target.value));
    host.querySelector("[data-sequence-mode]")?.addEventListener("change",e=>modeDrafts.set(currentProject,e.target.value));
    host.querySelector("[data-sequence-run-mode]")?.addEventListener("change",e=>modeDrafts.set(run.id,e.target.value));
    if(manual){
      for(const key of ['text','paths']) host.querySelector('[data-manual-'+key+']').oninput=event=>{
        manualDraft[key]=event.target.value;
        manualDrafts.set(run.id+':'+manual.node_id,manualDraft);
      };
    }
    const openNode=taskId=>{const task=nodeTasks.get(taskId);dialog.close();if(WorkflowNodeWorkbench.eligible(task))return ProjectWorkspace.openNodeResult(WorkflowNodeWorkbench.availableSelection(task),currentProject,{chatId:run.chat_id});return ProjectWorkspace.openTask(taskId,currentProject,{chatId:run.chat_id});};
    host.querySelectorAll("[data-sequence-task]").forEach(button=>button.onclick=()=>openNode(button.dataset.sequenceTask));
    host.querySelectorAll('[data-sequence-result]').forEach(button=>button.onclick=()=>{const task=nodeTasks.get(button.dataset.sequenceResult),project=currentProject;dialog.close();ProjectWorkspace.openNodeResult(WorkflowNodeWorkbench.availableSelection(task),project);});
    host.querySelector("[data-sequence-project-tasks]")?.addEventListener("click",()=>ProjectTasks.open(currentProject));
    host.querySelector('[data-sequence-chat]')?.addEventListener('click',async()=>{const project=currentProject,id=run.id;dialog.close();await ProjectWorkspace.openWorkflowRun(project,id,run.current_node||'');});
    const bind=(selector,action,extra=()=>({}))=>host.querySelectorAll(selector).forEach(button=>button.onclick=async()=>{
      button.disabled=true;
      try {
        if(button.hasAttribute('data-sequence-restart') && !await uiConfirm('Have you checked the interrupted node’s artifacts and external actions? Re-running may call write tools again.')) {button.disabled=false;return;}
        const result=await api("/api/workflow/execution/"+action,{id:currentRun?.id,task_id:currentProject,...extra(button)});
        currentRun=result.run || currentRun; if(currentRun) focusedRun=currentRun.id; rendered=""; drawRun();
      } catch(error) { dialog.querySelector("[data-sequence-error]").textContent=error.message; button.disabled=false; }
    });
    const newRun=()=>({id:"",goal:host.querySelector("[data-sequence-goal]").value,autonomy_mode:host.querySelector("[data-sequence-mode]").value});
    bind("[data-sequence-start]","start",newRun);
    bind("[data-sequence-prepare]","prepare",newRun);
    bind("[data-sequence-start-prepared]","start",()=>({autonomy_mode:host.querySelector("[data-sequence-run-mode]").value}));
    bind("[data-sequence-mode-apply]","mode",()=>({autonomy_mode:host.querySelector("[data-sequence-run-mode]").value}));
    bind("[data-sequence-resume]","resume");
    bind('[data-manual-submit]','submit-manual',()=>({
      node_id:manual.node_id,text:manualDraft.text||'',
      paths:(manualDraft.paths||'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean)
    }));
    bind('[data-sequence-restart]','resume',()=>({restart_node:true}));
    bind("[data-sequence-cancel]","cancel");
    bind("[data-sequence-approve]","review",button=>({node_id:button.dataset.sequenceApprove,approved:true,reviewed_run_id:button.dataset.sequenceTaskRun,reviewed_output_version:Number(button.dataset.sequenceOutputVersion||0),feedback:feedback.get(button.dataset.sequenceApprove) || ""}));
    bind("[data-sequence-reject]","review",button=>({node_id:button.dataset.sequenceReject,approved:false,reviewed_run_id:button.dataset.sequenceTaskRun,reviewed_output_version:Number(button.dataset.sequenceOutputVersion||0),feedback:feedback.get(button.dataset.sequenceReject) || ""}));
  }
  async function openRun(project,runId="") {
    currentProject=project;
    if(dialog) dialog.close();
    focusedRun=runId;
    dialog=document.createElement("dialog"); dialog.className="connected-dialog"; dialog.setAttribute("aria-label","Sequential workflow with manual review");
    dialog.innerHTML=`<div class="connected-row"><h3 style="flex:1">${h(activeProject()?.title || "Project")} · Sequential run</h3><button class="btn ghost" data-sequence-close>Close</button></div><div class="connected-error" role="status" data-sequence-error></div><div data-sequence-body>LoadingRun records...</div>`;
    document.body.append(dialog);
    const instance=dialog;
    instance.querySelector("[data-sequence-close]").onclick=()=>instance.close();
    instance.addEventListener("close",()=>{ instance.remove(); if(dialog===instance){dialog=null;focusedRun="";} },{once:true});
    instance.showModal(); rendered="";
    try {
      if(!modeDrafts.has(project)){
        const result=await api("/api/project-tasks/policy?project_id="+encodeURIComponent(project));
        if(!modeDrafts.has(project)) modeDrafts.set(project,(result.policy || result).autonomy_mode || "supervised");
      }
      await fetchRun();
    } catch(error) { instance.querySelector("[data-sequence-error]").textContent=error.message; }
  }

  async function refreshLibrary() {
    await ProjectLiterature.poll();
  }
  const originalCalendar=renderCalendar;
  renderCalendar=function(container){ originalCalendar(container); calendarRendered=JSON.stringify(S.events); };
  async function refreshCalendar(){
    if(route()!=="calendar") return;
    const data=await api('/api/calendar/linked');
    if(route()!=="calendar") return;
    S.events=data.events;
    if(calendarRendered===JSON.stringify(S.events) || document.querySelector('#todayInput')?.value || document.querySelector('#todayTime')?.value) return;
    if(document.activeElement?.closest('.quick-add, .cal-pop')) return;
    renderCalendar(document.getElementById('main'));
  }
  async function openNote(project,path){
    await ProjectWorkspace.openProject(project);
    if(curTask!==project) return;
    await ProjectWorkspace.showResource('notes');
    await Notebook.open(path);
  }
  function openCalendarSource(id,trigger){return AppNavigation.follow(()=>openCalendarTarget(id),{trigger});}
  async function openCalendarTarget(id){
    const event=S.events.find(e=>e.id===id);
    if(!event) throw new Error('Linked schedule updated. Refresh and try again.');
    const project=event.task_id;
    if(event.target_type==='workflow') return openRun(project,event.run_id || event.target_id);
    if(event.target_type==='project_task') return ProjectWorkspace.openTask(event.target_id,project);
    if(event.target_type==='note') return openNote(project,event.note_path);
    curTask=project; localStorage.setItem('rw-task',project);
    if(event.target_type==='schedule'){
      await ProjectWorkspace.openProject(project);await ProjectWorkspace.showResource('automation');
      document.querySelector(`[data-sch-edit="${CSS.escape(event.schedule_id || event.target_id)}"]`)?.closest('.sch-card')?.scrollIntoView({block:'center'});
    }else if(event.target_type==='todo'){
      await ProjectWorkspace.openProject(project);
      await ProjectWorkspace.showResource('plan');
      await TaskCenter.openPlan(event.source_id,project);
    }
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-cal-open]');
    if(button) openCalendarSource(button.dataset.calOpen,button);
  });
  let inbox=null;
  async function reviewInbox(){
    if(inbox?.open) {inbox.focus();return;}
    inbox=document.createElement('dialog'); inbox.className='connected-dialog'; inbox.setAttribute('aria-label','Tasks to review');
    inbox.innerHTML='<div class="connected-row"><h3 style="flex:1">Tasks awaiting review</h3><button class="btn ghost" data-review-close>Close</button></div><p class="hint">Snoozing only moves the reminder; open the project task, check the output, then pass or return it.</p><div role="status" data-review-error></div><div data-review-items>Loading...</div>';
    document.body.append(inbox); const instance=inbox;
    instance.querySelector('[data-review-close]').onclick=()=>instance.close();
    instance.onclose=()=>{instance.remove(); if(inbox===instance) inbox=null;};instance.showModal();
    async function draw(){
      const data=await api('/api/workflow/reviews');
      instance.querySelector('[data-review-items]').innerHTML=data.items.map(r=>`<article class="connected-node"><b>${h(r.project_title)} · ${h(r.label)}</b><p>${r.overdue?'Overdue · ':''}received ${h(new Date(r.received_at).toLocaleString())}${r.due_at?' · Due '+h(new Date(r.due_at).toLocaleString()):''}</p><p>${h(r.summary)}</p><div class="connected-row"><button class="btn" data-review-open="${h(r.node_id)}">Check the output and review it</button><button class="btn ghost" data-review-snooze="${h(r.node_id)}">Remind me in an hour</button><label>Deadline <input type="datetime-local" data-review-due="${h(r.node_id)}"></label><button class="btn ghost" data-review-save="${h(r.node_id)}">Retention</button></div></article>`).join('') || '<p>No nodes awaiting review.</p>';
      for(const r of data.items){
        const select=attr=>instance.querySelector(`[${attr}="${CSS.escape(r.node_id)}"]`);
        if(r.due_at){const d=new Date(r.due_at);select('data-review-due').value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
        select('data-review-open').onclick=()=>{instance.close();if(r.canonical_task_id) ProjectTasks.openTask(r.canonical_task_id,r.project_id);else openRun(r.project_id,r.run_id);};
        const update=async body=>{try{await api('/api/workflow/reviews',{node_id:r.node_id,...body});await draw();await refreshReviews();}catch(error){instance.querySelector('[data-review-error]').textContent=error.message;}};
        select('data-review-snooze').onclick=()=>update({snooze_minutes:60});
        select('data-review-save').onclick=()=>{const value=select('data-review-due').value;update({due_at:value?new Date(value).toISOString():''});};
      }
    }
    try{await draw();}catch(error){instance.querySelector('[data-review-error]').textContent=error.message;}
  }
  async function refreshReviews(){
    const data=await api('/api/workflow/reviews');
    const host=document.querySelector('.topbar-actions') || document.getElementById('topbar');
    if(!host) return;
    let button=document.getElementById('workflowReviewInbox');
    if(!button){button=document.createElement('button');button.id='workflowReviewInbox';button.className='btn ghost';button.style.webkitAppRegion='no-drag';button.onclick=reviewInbox;host.prepend(button);}
    button.textContent=`To verify ${data.count}`;button.classList.toggle('warn',data.notify_count>0);button.title=data.notify_count?`${data.notify_count} items need review`:'View project tasks to review';
  }
  setInterval(async()=>{
    if(pollBusy || document.hidden) return;
    pollBusy=true;
    try {
      if(dialog?.open || uiRouteIs("workflow")) await fetchRun();
      await refreshLibrary();
      await refreshCalendar();
      await refreshReviews();
    } catch(error) {
      if(dialog?.open) dialog.querySelector("[data-sequence-error]").textContent=error.message;
    } finally { pollBusy=false; }
  },3000);
  window.ConnectedResearch={openRun,openNote,refreshLibrary,refreshCalendar,openCalendarSource,reviewInbox,refreshReviews};
})();
