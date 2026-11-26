/* Project work, executor grants and acceptance use the same task records. */
const ProjectTasks = (() => {
  "use strict";
  const h=value=>esc(String(value ?? ""));
  const names={draft:"Ready",ready:"Executable",queued:"Queued",running:"Running",awaiting_review:"Awaiting manual review",delivered:"Delivered",blocked:"Waiting for dependencies or setup",failed:"Failed",cancelled:"Stopped",interrupted:"Interrupted, pending resume",succeeded:"Run complete"};
  const modeName=mode=>mode==="full_access"?"Full access · auto-advance":"Manual review mode";
  const modes=(mode)=>`<option value="supervised" ${mode!=="full_access"?"selected":""}>Manual review mode</option><option value="full_access" ${mode==="full_access"?"selected":""}>Full access · Auto-advance</option>`;
  const json=value=>{if(value && typeof value==="object") return value;try{return JSON.parse(value || "{}");}catch{return {};}};
  const label=b=>b.display_name || b.name || b.assistant_name || b.team_name || b.target_id || b.id;
  const savedModes=new Map();
  const style=document.createElement("style");
  style.textContent=`.pt-dialog{width:min(860px,calc(100vw - 28px));max-height:88vh;overflow:auto;border:1px solid var(--line);border-radius:14px;padding:20px;background:var(--bg);color:var(--fg);font-size:13px}.pt-dialog::backdrop{background:#0008}.pt-row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.pt-row h3{flex:1;margin:0}.pt-dialog label{display:block;margin:12px 0}.pt-dialog label>span{display:block;margin-bottom:5px}.pt-dialog input:not([type=checkbox]),.pt-dialog select,.pt-dialog textarea{width:100%;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:9px;font:inherit}.pt-dialog textarea{min-height:90px;resize:vertical}.pt-muted{color:var(--muted);font-size:12px;line-height:1.65}.pt-error{color:var(--err);white-space:pre-wrap;margin:10px 0}.pt-box{padding:12px;margin:12px 0;background:var(--panel);border:1px solid var(--line);border-radius:9px;overflow-wrap:anywhere}.pt-list{display:grid;gap:8px;margin-top:12px}.pt-item{padding:11px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}.pt-item b{overflow-wrap:anywhere}.pt-actions{margin-top:16px;justify-content:flex-end}.pt-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:270px;overflow:auto;font-size:12px}.pt-dialog .btn{color:var(--fg)}.pt-dialog .btn-primary{color:var(--accent-ink)}.pt-dialog :focus-visible{outline:2px solid var(--accent);outline-offset:2px}.pt-split{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pt-dialog details{margin:10px 0}.pt-role{display:grid;grid-template-columns:minmax(120px,1fr) minmax(170px,2fr) auto;gap:10px;align-items:center;margin:10px 0}@media(max-width:650px){.pt-split,.pt-role{grid-template-columns:1fr}.pt-dialog{padding:14px}}`;
  document.head.append(style);

  function modal(title){
    const el=document.createElement("dialog"), origin=document.activeElement;
    el.className="pt-dialog";el.setAttribute("aria-label",title);
    el.innerHTML=`<div class="pt-row"><h3>${h(title)}</h3><button class="btn ghost" data-close>Close</button></div><div data-pt-body></div><div class="pt-error" role="status" data-pt-error></div>`;
    el.querySelector("[data-close]").onclick=()=>el.close();
    el.addEventListener("close",()=>{el.remove();if(origin?.isConnected) origin.focus();},{once:true});
    document.body.append(el);el.showModal();return el;
  }
  const problem=(el,error)=>{if(el.isConnected) el.querySelector("[data-pt-error]").textContent=error?.message || String(error);};
  const url=(suffix,project)=>"/api/project-tasks"+suffix+(suffix.includes("?")?"&":"?")+"project_id="+encodeURIComponent(project);
  const projectName=pid=>(S.tasks || []).find(t=>t.id===pid)?.title || "Project";
  function outputPath(output){return typeof output==="string"?output:output?.path || output?.canonical_uri || output?.file || "";}
  async function openOutput(output,el){
    const path=outputPath(output);if(!path) return;
    try{await api("/api/conv/open",{path});}catch(e){problem(el,e);}
  }
  function tasksOf(result){return result.tasks || result.items || [];}
  function bindingsOf(result){return result.bindings || result.executors || [];}
  function usableBinding(binding){return binding.enabled!==false && binding.enabled!==0 && !binding.disabled_reason;}
  function choiceOptions(bindings,current=""){
    current=ExecutorChoices.find(bindings,current)?.id||current;
    return '<option value="">Select an executor...</option>'+ExecutorChoices.unique(bindings,current).map(b=>`<option value="${h(b.id)}" ${b.id===current?"selected":""} ${usableBinding(b)?"":"disabled"}>${h((b.kind==="team"?"Team · ":"Expert · ")+label(b))}${b.disabled_reason?" · "+h(b.disabled_reason):""}</option>`).join("");
  }

  async function open(projectId=curTask){
    if(!projectId){uiNotify("Select a project first");return;}
    const el=modal(projectName(projectId)+"· Project task"), body=el.querySelector("[data-pt-body]");
    let tasks=[],request=0;
    body.innerHTML=`<p class="pt-muted">Hand a single job to an expert or team in the project; use a workflow when it takes several steps.</p><div class="pt-row"><button class="btn btn-primary" data-pt-new>New project task</button><button class="btn" data-pt-executors>Executor and default mode</button><button class="btn" data-pt-roles>Workflow role bindings</button><button class="btn ghost" data-pt-refresh>Refresh</button></div><div class="pt-split"><label><span>Find a task</span><input type="search" data-pt-search placeholder="Search by title or task description"></label><label><span>Task status</span><select data-pt-filter><option value="">All states</option>${Object.entries(names).filter(([k])=>k!=="succeeded").map(([k,v])=>`<option value="${k}">${h(v)}</option>`).join("")}</select></label></div><div class="pt-list" data-pt-tasks>Loading tasks...</div>`;
    function draw(){
      const q=body.querySelector("[data-pt-search]").value.toLowerCase(),status=body.querySelector("[data-pt-filter]").value;
      const shown=tasks.filter(t=>(!status || t.status===status) && [t.title,t.goal,t.id].join(" ").toLowerCase().includes(q));
      body.querySelector("[data-pt-tasks]").innerHTML=shown.map(t=>`<article class="pt-item"><div class="pt-row"><b style="flex:1">${h(t.title || t.goal || "Project tasks")}</b><span>${h(names[t.status] || t.status)}</span><button class="btn" data-pt-open="${h(t.id)}">Open task</button></div><div class="pt-muted">${h(t.workflow_run_id?"Workflow node tasks":"Project tasks")}${t.parent_task_id?" · Subtask":""} · ${h(t.updated_at?fmtDate(t.updated_at):"")}</div>${t.goal && t.goal!==t.title?`<div class="pt-muted">${h(t.goal.slice(0,180))}</div>`:""}</article>`).join("") || '<div class="pt-box pt-muted">No tasks match right now. Click“New project task”to start; the executor can“Executor and default mode”into this project.</div>';
      body.querySelectorAll("[data-pt-open]").forEach(button=>button.onclick=()=>openTask(button.dataset.ptOpen,projectId));
    }
    async function refresh(){
      const seq=++request;
      try{const result=await api(url("",projectId));if(el.open && seq===request){tasks=tasksOf(result);draw();}}
      catch(error){problem(el,error);}
    }
    body.querySelector("[data-pt-new]").onclick=()=>compose(projectId).then(child=>child?.addEventListener("close",refresh,{once:true}));
    body.querySelector("[data-pt-executors]").onclick=()=>openBindings(projectId);
    body.querySelector("[data-pt-roles]").onclick=()=>openRoles(projectId);
    body.querySelector("[data-pt-refresh]").onclick=refresh;
    body.querySelector("[data-pt-search]").oninput=draw;body.querySelector("[data-pt-filter]").onchange=draw;
    await refresh();
    const timer=setInterval(()=>{if(el.open && document.querySelector("dialog:last-of-type")===el) refresh();},6000);
    el.addEventListener("close",()=>clearInterval(timer),{once:true});return el;
  }

  async function openBindings(projectId){
    const el=modal(projectName(projectId)+"· executors and default mode"),body=el.querySelector("[data-pt-body]");
    let data={bindings:[],available_assistants:[],teams:[]},policyTouched=false;
    body.innerHTML=`<p class="pt-muted">Every enabled expert and team is available in this project. Anything disabled or limited here applies to this project only.</p><div class="pt-box"><div data-pt-bindings>Loading...</div></div><div class="pt-split"><label><span>Add type</span><select data-pt-grant-kind><option value="assistant">Expert</option><option value="team">Global teams</option></select></label><label><span>Choose the executor</span><select data-pt-grant-target></select></label></div><button class="btn" data-pt-grant>Save project settings</button><hr><label><span>Default mode for new tasks in this project</span><select data-pt-policy>${modes("supervised")}</select></label><p class="pt-muted">Key nodes wait for a human by default.Full access Advances automatically once the output and dependency checks pass, recording what auto-accepted it. Tool access is granted separately.</p><button class="btn" data-pt-policy-save>Save the default mode</button>`;
    body.querySelector("[data-pt-policy]").disabled=true;
    body.querySelector("[data-pt-policy-save]").disabled=true;
    body.querySelector("[data-pt-policy]").onchange=()=>policyTouched=true;
    function choices(){
      const kind=body.querySelector("[data-pt-grant-kind]").value,rows=kind==="team"?data.teams || []:data.available_assistants || data.assistants || [];
      body.querySelector("[data-pt-grant-target]").innerHTML='<option value="">Choose...</option>'+rows.map(row=>`<option value="${h(row.id)}" ${row.enabled===0 || row.enabled===false?"disabled":""}>${h(row.name || row.title || row.id)}${row.enabled===0 || row.enabled===false?" · Disabled":""}</option>`).join("");
    }
    async function refresh(){
      try{
        const [executors,policy]=await Promise.all([api(url("/executors",projectId)),api(url("/policy",projectId))]);
        if(!el.open) return;data=executors;
        body.querySelector("[data-pt-bindings]").innerHTML=bindingsOf(data).map(b=>`<div class="pt-row" style="margin:8px 0"><span style="flex:1">${h((b.kind==="team"?"Team · ":"Expert · ")+label(b))}</span><span class="pt-muted">${h(b.disabled_reason || (usableBinding(b)?"Available for project tasks":"Disabled"))}</span><button class="btn ghost" data-pt-binding-toggle="${h(b.id)}">${b.enabled?"Disable":"Re-enable"}</button></div>`).join("") || '<p class="pt-muted">No executor authorized for the project yet.</p>';
        body.querySelectorAll("[data-pt-binding-toggle]").forEach(button=>button.onclick=async()=>{
          const binding=bindingsOf(data).find(b=>b.id===button.dataset.ptBindingToggle);button.disabled=true;
          try{await api("/api/project-tasks/bindings",{project_id:projectId,kind:binding.kind,target_id:binding.target_id,tools:binding.tools,enabled:!binding.enabled});await refresh();}
          catch(error){problem(el,error);button.disabled=false;}
        });
        if(!policyTouched) body.querySelector("[data-pt-policy]").value=(policy.policy || policy.settings || policy).autonomy_mode || "supervised";
        body.querySelector("[data-pt-policy]").disabled=false;body.querySelector("[data-pt-policy-save]").disabled=false;choices();
      }catch(error){problem(el,error);}
    }
    body.querySelector("[data-pt-grant-kind]").onchange=choices;
    body.querySelector("[data-pt-grant]").onclick=async event=>{
      const target=body.querySelector("[data-pt-grant-target]").value;if(!target){problem(el,"Select an executor first");return;}
      event.target.disabled=true;
      try{await api("/api/project-tasks/bindings",{project_id:projectId,kind:body.querySelector("[data-pt-grant-kind]").value,target_id:target});await refresh();}
      catch(error){problem(el,error);}finally{event.target.disabled=false;}
    };
    body.querySelector("[data-pt-policy-save]").onclick=async event=>{
      event.target.disabled=true;
      try{await api("/api/project-tasks/policy",{project_id:projectId,autonomy_mode:body.querySelector("[data-pt-policy]").value});uiNotify("Default mode saved for future runs");}
      catch(error){problem(el,error);}finally{event.target.disabled=false;}
    };
    await refresh();return el;
  }

  async function openRoles(projectId,templateId=''){
    const el=modal(projectName(projectId)+"· workflow role bindings"),body=el.querySelector("[data-pt-body]");
    body.innerHTML='<p class="pt-muted">Pick executors for this project’s node roles. An executor chosen on the node beats the role binding; other projects keep their own settings.</p><label><span>Workflow template</span><select data-pt-role-template></select></label><div data-pt-role-list>Loading...</div>';
    let layouts=[],request=0;
    async function showRoles(){
      const templateId=body.querySelector("[data-pt-role-template]").value, seq=++request;
      if(!templateId) return;
      try{
        const [result,executors]=await Promise.all([api(url("/workflow-roles?template_id="+encodeURIComponent(templateId),projectId)),api(url("/executors",projectId))]);
        if(!el.open || seq!==request) return;
        const roles=result.roles || [],layout=result.template||layouts.find(item=>item.id===templateId),bindings=result.bindings || bindingsOf(executors);
        const needed=new Map((layout?.nodes || []).map(node=>[node.executor_role_id || node.id,node.label || node.id]));
        for(const role of roles) if(!needed.has(role.role_id)) needed.set(role.role_id,role.role_id);
        const host=body.querySelector("[data-pt-role-list]");
        host.innerHTML=[...needed].map(([id,name])=>`<div class="pt-role" data-pt-role="${h(id)}"><div><b>${h(name)}</b><div class="pt-muted">${h(id)}</div></div><select aria-label="${h(name)}this project’s executors">${choiceOptions(bindings,roles.find(r=>r.role_id===id)?.executor_binding_id || roles.find(r=>r.role_id===id)?.binding_id)}</select><button class="btn">Save binding</button></div>`).join("") || '<p class="pt-muted">This template has no nodes yet.</p>';
        host.querySelectorAll("[data-pt-role]").forEach(row=>row.querySelector("button").onclick=async event=>{
          const binding=row.querySelector("select").value;if(!binding){problem(el,"Select an executor for this project");return;}
          event.target.disabled=true;
          try{await api("/api/project-tasks/workflow-roles",{project_id:projectId,template_id:templateId,role_id:row.dataset.ptRole,executor_binding_id:binding});uiNotify("Project role bindings saved");}
          catch(error){problem(el,error);}finally{event.target.disabled=false;}
        });
      }catch(error){problem(el,error);}
    }
    try{
      const data=await api("/api/workflow/layouts");layouts=data.layouts || [];
      if(!el.open) return el;
      body.querySelector("[data-pt-role-template]").innerHTML=layouts.map(layout=>`<option value="${h(layout.id)}">${h(layout.name)}</option>`).join("");
      if(templateId&&layouts.some(layout=>layout.id===templateId))body.querySelector('[data-pt-role-template]').value=templateId;
      body.querySelector("[data-pt-role-template]").onchange=showRoles;await showRoles();
    }catch(error){problem(el,error);}
    return el;
  }

  async function compose(projectId,options={}){
    if(!projectId){uiNotify("Select a project first");return;}
    const quick=options.quick===true;
    const el=modal(quick?"\u4ea4\u7ed9\u4e13\u5bb6/\u56e2\u961f":"\u65b0\u5efa\u9879\u76ee\u4efb\u52a1"),body=el.querySelector("[data-pt-body]"), inputs=options.inputs || [];
    const draftKey="rw-project-task-draft:"+projectId+":"+JSON.stringify(inputs)+':'+(options.plan_id || ''), saved=json(localStorage.getItem(draftKey));
    const defaultKey="rw-project-task-default-executor:"+projectId, remembered=json(localStorage.getItem(defaultKey));
    let requestKey=crypto.randomUUID(),prepared=null,bindings=[],teams=[],modeTouched=Boolean(saved.autonomy_mode);
    body.innerHTML=`<div class="pt-box"><b>${h(projectName(projectId))}</b><div class="pt-muted">A standalone project task; no workflow node needed.</div>${inputs.map(input=>`<div>${h(input.relative || input.name || input.asset_id || "Project materials")}</div>`).join("")}</div><label><span>Task title</span><input data-pt-title maxlength="200" value="${h(saved.title || options.title || "")}" placeholder="For example: extract the experimental conditions from this paper"></label><label><span>Task description</span><textarea data-pt-goal maxlength="20000" placeholder="State the problem, the evidence to check, and the expected output">${h(saved.goal || options.goal || "")}</textarea></label><label><span>Project executors</span><select data-pt-executor disabled><option value="">Loading...</option></select></label><button class="btn ghost" data-pt-compose-bindings>Executor and project permissions</button><label><input type="checkbox" data-pt-review ${saved.review_required===false?"":"checked"}> This task needs manual review</label><label><span>Run mode for this round</span><select data-pt-mode>${modes(saved.autonomy_mode)}</select></label><div class="pt-muted">Full access Delivers automatically once the output and dependency checks pass, recorded as auto-accepted. It grants no extra project or tool permissions.</div><details><summary>Delivery requirements</summary><label><span>Minimum output characters</span><input type="number" min="1" max="1000000" data-pt-min-chars value="${h(saved.min_chars || 1)}"></label><label><span>Project files that must be produced, one relative path per line</span><textarea data-pt-required placeholder="Notes/Analysis result.md">${h(saved.required_files || "")}</textarea></label></details><div class="pt-row pt-actions"><button class="btn" data-pt-prepare>Prepare task</button><button class="btn btn-primary" data-pt-create-start>Create and start</button></div>`;
    body.querySelector("[data-pt-executor]").closest("label").insertAdjacentHTML("afterend",'<label data-pt-member-label hidden><span>Team executors</span><select data-pt-member><option value="">Taken on by the team lead</option></select></label><label><span>Task relations</span><select data-pt-parent><option value="">Standalone project task</option></select></label>');
    if(quick){
      const titleField=body.querySelector("[data-pt-title]")?.closest("label");
      if(titleField){titleField.hidden=true;titleField.style.display="none";}
      const intro=body.querySelector(".pt-box .pt-muted");
      if(intro) intro.textContent="\u6587\u4ef6\u5df2\u7ecf\u5e26\u5165\uff0c\u5199\u4e00\u53e5\u8bdd\u8bf4\u660e\u5e0c\u671b\u4e13\u5bb6\u6216\u56e2\u961f\u600e\u4e48\u5904\u7406\uff0c\u7136\u540e\u7acb\u5373\u5f00\u59cb\u3002";
      const goal=body.querySelector("[data-pt-goal]"),goalLabel=goal?.closest("label");
      if(goalLabel?.querySelector("span")) goalLabel.querySelector("span").textContent="\u5904\u7406\u8bf4\u660e";
      goal?.setAttribute("placeholder","\u4f8b\u5982\uff1a\u63d0\u53d6\u8fd9\u7bc7\u6587\u732e\u7684\u5b9e\u9a8c\u65b9\u6cd5\u5e76\u6574\u7406\u6210\u8981\u70b9\u3002");
      const advanced=document.createElement("details");advanced.className="pt-advanced";
      advanced.innerHTML="<summary>\u66f4\u591a\u8bbe\u7f6e</summary>";
      const fields=[
        body.querySelector("[data-pt-compose-bindings]"),
        body.querySelector("[data-pt-member-label]"),
        body.querySelector("[data-pt-parent]")?.closest("label"),
        body.querySelector("[data-pt-review]")?.closest("label"),
        body.querySelector("[data-pt-mode]")?.closest("label"),
        body.querySelector("[data-pt-mode]")?.closest("label")?.nextElementSibling,
        body.querySelector("[data-pt-min-chars]")?.closest("details")
      ];
      fields.forEach(field=>{if(field){field.remove();advanced.append(field);}});
      body.querySelector("[data-pt-executor]").closest("label").after(advanced);
      const prepare=body.querySelector("[data-pt-prepare]");if(prepare){prepare.hidden=true;prepare.style.display="none";}
      const startButton=body.querySelector("[data-pt-create-start]");if(startButton)startButton.textContent="\u7acb\u5373\u5904\u7406";
    }
    const value=selector=>body.querySelector(selector).value;
    const remember=()=>{
      const draft={title:value("[data-pt-title]"),goal:value("[data-pt-goal]"),binding_id:value("[data-pt-executor]"),member_id:value("[data-pt-member]"),parent_task_id:value("[data-pt-parent]"),review_required:body.querySelector("[data-pt-review]").checked,autonomy_mode:value("[data-pt-mode]"),min_chars:value("[data-pt-min-chars]"),required_files:value("[data-pt-required]")};
      try{localStorage.setItem(draftKey,JSON.stringify(draft));}catch{}
    };
    const invalidate=()=>{prepared=null;requestKey=crypto.randomUUID();remember();};
    body.querySelectorAll("input,textarea,select").forEach(field=>{field.addEventListener("input",invalidate);field.addEventListener("change",invalidate);});
    body.querySelector("[data-pt-mode]").addEventListener("change",()=>modeTouched=true);
    el.addEventListener("close",remember,{once:true});
    function members(current=""){
      const binding=bindings.find(item=>item.id===value("[data-pt-executor]")),team=teams.find(item=>item.id===binding?.target_id);
      const select=body.querySelector("[data-pt-member]");
      body.querySelector("[data-pt-member-label]").hidden=binding?.kind!=="team";
      const members=ExecutorChoices.members(team?.members,current);
      select.innerHTML='<option value="">Handled by the team lead</option>'+members.map(member=>`<option value="${h(member.id)}" ${member.id===current?"selected":""}>${h(member.name || member.id)}${member.role==="leader"?" · Lead":""}</option>`).join("");
      if(current&&!members.some(member=>member.id===current))select.insertAdjacentHTML('beforeend',`<option value="${h(current)}" selected disabled>The original member is gone; pick another</option>`);
    }
    body.querySelector("[data-pt-executor]").addEventListener("change",()=>members());
    async function loadExecutors(){
      try{
        const result=await api(url("/executors",projectId));if(!el.open) return;
        const current=value("[data-pt-executor]") || saved.binding_id || options.executor_binding_id || remembered.binding_id || "";
        const rememberedMember=remembered.binding_id===current?remembered.member_id:"";
        const currentMember=value("[data-pt-member]") || saved.member_id || options.member_id || rememberedMember || "";
        bindings=bindingsOf(result);teams=result.teams || [];const select=body.querySelector("[data-pt-executor]");select.innerHTML=choiceOptions(bindings,current);select.disabled=false;members(currentMember);
        if(!bindings.some(usableBinding)) problem(el,"This project has no executor; add an expert or team first.");
      }catch(error){problem(el,error);}
    }
    body.querySelector("[data-pt-compose-bindings]").onclick=async()=>{const child=await openBindings(projectId);child.addEventListener("close",loadExecutors,{once:true});};
    async function submit(start){
      const goal=value("[data-pt-goal]").trim() || value("[data-pt-title]").trim(),binding=value("[data-pt-executor]");
      if(!goal || !binding){problem(el,"Describe the task and pick a project executor.");return;}
      el.querySelector("[data-pt-error]").textContent="";
      body.querySelectorAll("button,input,textarea,select").forEach(field=>field.disabled=true);
      try{
        await options.beforeSubmit?.();
        const mode=value("[data-pt-mode]");
        if(!prepared){
          prepared=(await api("/api/project-tasks/create",{project_id:projectId,plan_id:options.plan_id||'',title:value("[data-pt-title]").trim() || goal.slice(0,80),goal,inputs,executor_binding_id:binding,
            member_id:value("[data-pt-member]"),review_required:body.querySelector("[data-pt-review]").checked,parent_task_id:value("[data-pt-parent]"),metadata:options.metadata || {},
            output_contract:{min_chars:Math.max(1,Number(value("[data-pt-min-chars]")) || 1),required_files:value("[data-pt-required]").split(/\r?\n/).map(s=>s.trim()).filter(Boolean)},request_key:requestKey})).task;
        }
        savedModes.set(prepared.id,mode);
        try{localStorage.setItem(defaultKey,JSON.stringify({binding_id:binding,member_id:value("[data-pt-member]")}));}catch{}
        if(start) prepared=(await api("/api/project-tasks/start",{id:prepared.id,project_id:projectId,request_key:requestKey+":start",autonomy_mode:mode})).task;
        const task=prepared;el.close();await ProjectWorkspace.openConversation(task.chat_id,projectId);
      }catch(error){problem(el,error);body.querySelectorAll("button,input,textarea,select").forEach(field=>field.disabled=false);}
    }
    body.querySelector("[data-pt-prepare]").onclick=()=>submit(false);body.querySelector("[data-pt-create-start]").onclick=()=>submit(true);
    try{
      const result=await api(url("",projectId)),parents=tasksOf(result).filter(task=>!task.workflow_run_id);
      const selected=options.parent_task_id || saved.parent_task_id || "",select=body.querySelector("[data-pt-parent]");
      select.innerHTML='<option value="">Standalone project task</option>'+parents.map(task=>`<option value="${h(task.id)}" ${task.id===selected?"selected":""}>Additional task: ${h(task.title || task.goal || task.id)}</option>`).join("");
      if(options.parent_task_id){select.value=options.parent_task_id;select.disabled=true;}
    }catch(error){problem(el,error);}
    await loadExecutors();
    if(!modeTouched){try{const result=await api(url("/policy",projectId));if(el.open && !modeTouched) body.querySelector("[data-pt-mode]").value=(result.policy || result.settings || result).autonomy_mode || "supervised";}catch(error){problem(el,error);}}
    return el;
  }

  async function openTask(taskId,projectId=curTask){
    const el=modal("Project tasks and delivery"),body=el.querySelector("[data-pt-body]");
    let task=null,signature="",feedback="",busy=false,mode=savedModes.get(taskId) || "",request=0,reviewIdentity=null;
    body.textContent="Reading task...";
    async function fetchTask(){
      const seq=++request;
      try{const result=await api(url("/detail?id="+encodeURIComponent(taskId),projectId));if(el.open && seq===request){task=result.task || result;draw();}}
      catch(error){problem(el,error);}
    }
    function draw(){
      if(!task) return;const next=JSON.stringify(task);if(signature===next) return;signature=next;
      const run=task.latest_run || {},policy={...json(run.policy_snapshot),...task.metadata?._autonomy_override},output=json(run.output_snapshot),outputs=!task.workflow_run_id||WorkflowNodeWorkbench.eligible(task)?task.outputs || output.files || output.assets || []:[];
      const outputRevision=json(run.checkpoint).output_revision||0;
      if(!reviewIdentity&&run.status==='succeeded')reviewIdentity={run_id:run.id,output_revision:outputRevision};
      const reviewStale=!!reviewIdentity&&(reviewIdentity.run_id!==run.id||reviewIdentity.output_revision!==outputRevision);
      const uncertainTool=["failed","blocked"].includes(task.status) && json(run.checkpoint).phase==="tool";
      if(!mode) mode=policy.autonomy_mode || task.autonomy_mode || "supervised";
      body.innerHTML=`<div class="pt-box"><b>${h(task.title || task.goal)}</b><div class="pt-muted">${h(projectName(task.project_id || projectId))} · ${h(task.workflow_run_id?"Workflow node tasks":"Project tasks")} · ${h(task.id)}</div><p>${h(task.goal || "")}</p></div><div class="pt-row"><b data-pt-status>${h(names[task.status] || task.status)}</b>${run.id?`<span class="pt-muted">${h(modeName(policy.autonomy_mode))}</span>`:""}</div>
        ${task.blocked_reason || task.error || run.error?`<p class="pt-error">${h(task.blocked_reason || task.error || run.error)}</p>`:""}
        ${uncertainTool?`<div class="pt-box"><b>The last tool call has not been confirmed</b><p class="pt-muted">Check the generated files and external actions. A normal retry keeps this checkpoint; once you are sure, choose“Check, then rerun”. </p><details><summary>View the last tool call</summary><pre>${h(JSON.stringify(json(run.checkpoint).inflight || {},null,2))}</pre></details><button class="btn" data-pt-action="restart">Check, then rerun</button></div>`:""}
        ${run.id?`<details open><summary>Results</summary><pre>${h(output.reply || output.text || json(run.checkpoint).reply || "Waiting for result")}</pre></details>`:""}
        ${outputs.length?`<div class="pt-list">${outputs.map((item,i)=>`<div class="pt-item pt-row"><span style="flex:1">${h(typeof item==="string"?item:item.title || item.name || outputPath(item) || item.asset_id || "Output")}</span>${outputPath(item)?`<button class="btn ghost" data-pt-output="${i}">Open output</button>${ProjectOutputReview.canEdit(task,item)?`<button class="btn ghost" data-pt-output-edit="${i}">Revise by hand</button>`:""}`:""}</div>`).join("")}</div>`:""}
        ${(task.deliveries || []).map(delivery=>{const p=json(delivery.policy_snapshot),source=delivery.source==="human"?"Manual review":delivery.source==="policy"?(p.autonomy_mode==="full_access"?"Full access auto-accept":"Auto-accept per node settings"):"Past deliveries";return `<div class="pt-box" data-pt-decision-source><b>${h(source)} · ${delivery.decision==="rejected"?"Return":"Pass"}</b>${delivery.feedback?`<p>${h(delivery.feedback)}</p>`:""}<div class="pt-muted">${h(delivery.created_at?fmtDate(delivery.created_at):"")}</div></div>`;}).join("")}
        ${(task.children || []).length?`<details open><summary>Subtask</summary>${task.children.map(child=>{const item=typeof child==="string"?{id:child}:child;return `<div class="pt-row"><span>${h(item.title || item.id)} · ${h(names[item.status] || item.status || "")}</span><button class="btn ghost" data-pt-child="${h(item.id)}">Open</button></div>`;}).join("")}</details>`:""}
        ${task.status==="awaiting_review"?`<label><span>Review note</span><textarea data-pt-feedback placeholder="Optional on approval; explain what needs changing when returning">${h(feedback)}</textarea></label><div class="pt-row"><button class="btn btn-primary" data-pt-action="approve">Manual review passed</button><button class="btn" data-pt-action="reject">Return for revision</button></div>`:""}
        ${task.status!=="delivered"?`<label><span>Run mode for this task</span><select data-pt-task-mode>${modes(mode)}</select></label><p class="pt-muted">Auto-accept still checks the real output, dependencies, and version; tool access is controlled separately.</p><div class="pt-row pt-actions">${["draft","ready","failed","blocked","cancelled","interrupted"].includes(task.status)?`<button class="btn btn-primary" data-pt-action="start">${["failed","cancelled","interrupted"].includes(task.status)?"Retry task":"Start"}</button>`:""}${["queued","running","awaiting_review"].includes(task.status)?'<button class="btn" data-pt-action="mode">Apply mode and continue</button>':""}${task.status!=="cancelled"?'<button class="btn ghost" data-pt-action="cancel">Stop task</button>':""}</div>`:""}
        <details><summary>Run tracking</summary><pre>${h(JSON.stringify({task_id:task.id,run_id:run.id,parent_task_id:task.parent_task_id,workflow_run_id:task.workflow_run_id,node_id:task.workflow_node_id,policy:run.policy_snapshot,executor:run.executor_snapshot},null,2))}</pre></details>`;
      body.querySelector("[data-pt-feedback]")?.addEventListener("input",e=>feedback=e.target.value);
      if(WorkflowNodeWorkbench.eligible(task)){
        const resultButton=document.createElement('button');resultButton.type='button';resultButton.className='btn btn-primary';resultButton.dataset.ptNodeResult=task.id;resultButton.textContent='View this node’s output';resultButton.onclick=()=>{el.close();ProjectWorkspace.openNodeResult(WorkflowNodeWorkbench.availableSelection(task),projectId);};body.firstElementChild.after(resultButton);
      }
      if(reviewStale){
        const warning=document.createElement('div');warning.className='pt-box';warning.setAttribute('role','status');warning.innerHTML='<p>The output has a newer run or revision. This window still shows the original; open the latest output and review that.</p><button type="button" class="btn" data-pt-review-reload>View the latest output</button>';body.prepend(warning);
        warning.querySelector('button').onclick=()=>{if(WorkflowNodeWorkbench.eligible(task)){el.close();ProjectWorkspace.openNodeResult(WorkflowNodeWorkbench.availableSelection(task),projectId);}else{reviewIdentity=null;signature='';draw();}};
        body.querySelectorAll('[data-pt-action="approve"],[data-pt-action="reject"]').forEach(button=>button.disabled=true);
      }
      body.querySelector("[data-pt-task-mode]")?.addEventListener("change",e=>{mode=e.target.value;savedModes.set(task.id,mode);});
      body.querySelectorAll("[data-pt-output]").forEach(button=>button.onclick=()=>openOutput(outputs[Number(button.dataset.ptOutput)],el));
      body.querySelectorAll('[data-pt-output-edit]').forEach(button=>button.onclick=()=>ProjectOutputReview.open(projectId,task.id,Number(button.dataset.ptOutputEdit),async()=>{signature='';await fetchTask();}));
      body.querySelectorAll("[data-pt-child]").forEach(button=>button.onclick=()=>openTask(button.dataset.ptChild,projectId));
      body.querySelectorAll("[data-pt-action]").forEach(button=>button.onclick=async()=>{
        if(busy) return;const action=button.dataset.ptAction;
        if(action==="reject" && !feedback.trim()){problem(el,"Add review notes when returning.");return;}
        if(action==="restart" && !await uiConfirm("Have you checked the artifacts and external effects of the last tool call? Running again may call write tools again.")) return;
        el.querySelector("[data-pt-error]").textContent="";
        busy=true;++request;body.querySelectorAll("[data-pt-action]").forEach(b=>b.disabled=true);
        try{
          const route=action==="approve" || action==="reject"?"review":action==="restart"?"start":action;
          const result=await api("/api/project-tasks/"+route,{id:task.id,project_id:projectId,request_key:crypto.randomUUID(),version:task.version,reviewed_run_id:reviewIdentity?.run_id||task.latest_run?.id||'',reviewed_output_version:reviewIdentity?.output_revision??task.latest_run?.checkpoint?.output_revision??0,approved:action==="approve",feedback,autonomy_mode:mode,restart:action==="restart"});
          if(result.task) task=result.task;signature="";draw();
        }catch(error){problem(el,error);body.querySelectorAll("[data-pt-action]").forEach(b=>b.disabled=reviewStale&&['approve','reject'].includes(b.dataset.ptAction));}finally{busy=false;}
      });
    }
    await fetchTask();
    const timer=setInterval(()=>{if(el.open && !busy && task && !["delivered","cancelled"].includes(task.status)) fetchTask();},1800);
    el.addEventListener("close",()=>clearInterval(timer),{once:true});return el;
  }
  const originalSpace=renderSpace;
  renderSpace=async function(container){
    await originalSpace(container);
    const tabs=container.querySelector("#spTabs"),projectId=curTask;
    if(!tabs || !projectId || !container.isConnected || tabs.querySelector("[data-pt-project-open]")) return;
    tabs.insertAdjacentHTML("beforeend",'<span style="flex:1"></span><button type="button" class="btn btn-sm" data-pt-project-open title="Create, run, and reviewCurrent projecttasks">Project tasks</button><button type="button" class="btn ghost btn-sm" data-pt-project-config title="ManageCurrent projectexpert, team authorisation, and default run mode">Executor and mode</button>');
    tabs.querySelector("[data-pt-project-open]").onclick=()=>open(projectId);
    tabs.querySelector("[data-pt-project-config]").onclick=()=>openBindings(projectId);
  };
  return {open,openTask,compose,openBindings,openRoles};
})();
window.ProjectTasks=ProjectTasks;
