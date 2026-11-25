/* File work can be a project task or belong to a specific workflow node. */
const FileHandoff = (() => {
  "use strict";
  const h = value => esc(String(value ?? ""));
  const statuses = {draft:"Ready, not started",queued:"Waiting to run",running:"Running",awaiting_review:"Awaiting node review",succeeded:"Delivered",failed:"Failed",blocked:"To revise",interrupted:"Interrupted, pending resume",cancelled:"Stopped",delivered:"Delivered",rejected:"Returned"};
  const css = document.createElement("style");
  css.textContent = `.handoff-dialog{width:min(820px,calc(100vw - 32px));max-height:88vh;overflow:auto;padding:22px;border:1px solid var(--line);border-radius:14px;background:var(--bg);color:var(--fg)}.handoff-dialog::backdrop{background:#0008}.handoff-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.handoff-row h3{flex:1;margin:0}.handoff-context{padding:12px;background:var(--panel);border:1px solid var(--line);border-radius:8px;margin:14px 0;overflow-wrap:anywhere}.handoff-muted{font-size:12px;color:var(--muted);line-height:1.7}.handoff-dialog input,.handoff-dialog select,.handoff-dialog textarea{width:100%;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:9px;font:inherit}.handoff-dialog textarea{min-height:90px;resize:vertical}.handoff-dialog label{display:block;margin:12px 0}.handoff-targets{display:grid;gap:8px;max-height:230px;overflow:auto;margin:12px 0}.handoff-target{display:block;width:100%;text-align:left;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--fg);cursor:pointer}.handoff-target[aria-pressed=true],.handoff-row [aria-pressed=true]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--panel))}.handoff-target:disabled{opacity:.65;cursor:default}.handoff-target small{display:block;margin-top:4px}.handoff-error{color:var(--err);white-space:pre-wrap;margin:10px 0}.handoff-actions{margin-top:16px;justify-content:flex-end}.handoff-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto}.handoff-history-item{padding:12px 0;border-bottom:1px solid var(--line)}.handoff-dialog :focus-visible{outline:2px solid var(--accent);outline-offset:2px}`;
  document.head.append(css);
  css.textContent += `.handoff-dialog{font-size:13px}.handoff-dialog h3{font-size:17px}.handoff-context{padding:10px;margin:10px 0}.handoff-context p{margin:7px 0}.handoff-dialog label{margin:8px 0}.handoff-dialog textarea{min-height:70px}.handoff-targets{max-height:180px;margin:10px 0}.handoff-dialog [data-view]{background:var(--panel);color:var(--fg)}.handoff-dialog [data-view][aria-pressed=true]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,var(--panel))}.handoff-actions{position:sticky;bottom:-22px;padding:12px 0;background:var(--bg);border-top:1px solid var(--line);z-index:1}`;
  let active = null;
  let previewRequest=0;
  const keyOf = (node,actor) => [node.id,actor.team_id,actor.member_id,actor.assistant_id].join("|");
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
  const write = (key,value) => { try { localStorage.setItem(key,JSON.stringify(value)); } catch {} };
  function dialog(title){
    active?.close();
    const origin=document.activeElement, el=document.createElement("dialog");
    el.className="handoff-dialog"; el.setAttribute("aria-label",title);
    el.innerHTML=`<div class="handoff-row"><h3>${h(title)}</h3><button class="btn ghost" data-close>Close</button></div><div data-body></div><p class="handoff-error" role="status" data-error></p>`;
    el.querySelector("[data-close]").onclick=()=>el.close();
    el.addEventListener("close",()=>{ el.remove(); if(active===el) active=null; if(origin?.isConnected) origin.focus(); },{once:true});
    document.body.append(el); el.showModal(); active=el;
    return el;
  }
  function focused(){
    const element=document.activeElement;
    const row=element?.closest('.fl-tree-row, [data-tree-path], .nb-note-row');
    if(row && row.dataset.dir!=="1" && row.dataset.treeType!=="dir"){
      const flow=row.matches('.fl-tree-row');
      const relative=flow?row.dataset.rel:row.dataset.treePath || row.querySelector('[data-pn-file]')?.dataset.pnFile;
      if(relative) return {project_id:flow?(row.dataset.projectId || curTask):mdDashProject,relative};
    }
    if(element?.closest('.fl-col') && flSel && document.getElementById("flHand")?.disabled===false) return {project_id:curTask,relative:flSel};
    return null;
  }
  function dirty(ref){
    return flCurrentFile?.projectId===ref.project_id && flCurrentFile.row.rel===ref.relative && flCurrentFile.text!==flCurrentFile.originalText;
  }
  async function saveInput(ref){
    if(dirty(ref) && !await flSaveCurrent()) throw new Error("File unsaved; the handoff stopped. Fix the editor's save error first.");
    if(mdDashProject===ref.project_id && mdDashPath===ref.relative && !await pnSaveCurrent()) throw new Error("Note save failed; the handoff was stopped.");
  }
  async function open(ref, preferred=""){
    if(!ref?.project_id || !ref.relative){ uiNotify("Select a file in the project first"); return; }
    if(uiRouteIs("workflow") && ref.project_id!==curTask){uiNotify("Project changed; pick the file again.");return;}
    ref={project_id:ref.project_id,relative:ref.relative};
    const workspace=document.querySelector('.project-workspace');
    if(preferred==='project' && workspace && workspace.dataset.surface!=='flow' && window.ProjectTasks){
      try{
        await saveInput(ref);
        return ProjectTasks.compose(ref.project_id,{title:ref.relative.split(/[\\/]/).at(-1),goal:'',inputs:[{relative:ref.relative}],metadata:{source:'file_handoff'},quick:true});
      }catch(error){uiNotify(error.message);return;}
    }
    const activeProject=curTask;
    const el=dialog("Hand to current workflow"), body=el.querySelector("[data-body]"), error=el.querySelector("[data-error]");
    const draftKey="rw-handoff-draft:"+ref.project_id+":"+ref.relative;
    let data=null, view="node", selection=null, group=[], related=[], requestKey=crypto.randomUUID(), prepared=null;
    const saved=read(draftKey) || {};
    body.innerHTML=`<div class="handoff-row" role="group" aria-label="Task scope"><button class="btn" data-handoff-project aria-pressed="false">Project tasks · No workflow needed</button><button class="btn" data-handoff-workflow aria-pressed="true">Current workflow node</button></div>
      <div class="handoff-context"><b>${h((S.tasks || []).find(t=>t.id===ref.project_id)?.title || "Current project")}</b><div>${h(ref.relative)}</div><div class="handoff-muted" data-workflow>Reading the current workflow...</div><div class="handoff-muted">${dirty(ref)?"Unsaved changes; they are saved before preparing or sending.":"Uses the saved file and pins the input version when it runs."}</div></div>
      <div class="handoff-context" data-configuration hidden role="status"></div>
      <div class="handoff-row" role="group" aria-label="How targets are found">${[["node","By node"],["team","By team"],["assistant","By expert"]].map(([id,label])=>`<button class="btn" data-view="${id}" aria-pressed="${id==="node"}">${label}</button>`).join("")}<button class="btn ghost" data-refresh>Refresh goals</button><button class="btn ghost" data-configure>Configure the workflow</button></div>
      <label>Find a goal<input type="search" data-search placeholder="Search names in this workflow"></label>
      <label><span data-target-label>Choose a node</span><select data-target-select aria-label="Choose a node" disabled><option value="">Loading...</option></select></label>
      <div class="handoff-targets" data-targets>Loading...</div>
      <div class="handoff-context" data-selection>Pick a target; a team or expert must belong to a specific node.</div>
      <label>Delivery method<select data-parent><option value="">New node task</option></select></label><div class="handoff-muted">Adding to an existing task creates a linked record and keeps the original task and run input.</div>
      <label>Task description<textarea data-instruction maxlength="20000" placeholder="What should this file achieve?">${h(saved.instruction || "")}</textarea></label>
      <p class="handoff-muted">Runs the selected nodes only. If an upstream delivery is unreviewed or a run is active, the material waits as a pending task.</p>
      <div class="handoff-row handoff-actions"><button class="btn" data-prepare disabled>Prepare task</button><button class="btn btn-primary" data-start disabled>Send and start</button></div>`;
    const instruction=body.querySelector("[data-instruction]"), search=body.querySelector("[data-search]");
    const remember=()=>write(draftKey,{instruction:instruction.value,layout_id:data?.layout_id,selection:selection?keyOf(selection.node,selection.actor):""});
    body.querySelector("[data-handoff-project]").onclick=async()=>{
      remember();
      const goal=instruction.value;
      el.close();
      await ProjectTasks.compose(ref.project_id,{title:ref.relative.split(/[\\/]/).at(-1),goal,inputs:[{relative:ref.relative}],metadata:{source:"file_handoff"},beforeSubmit:async()=>{
        if(curTask!==activeProject) throw new Error("Project switched; task instructions kept. Reopen the file task from the current project.");
        await saveInput(ref);
      }});
    };
    body.querySelector("[data-handoff-workflow]").onclick=()=>instruction.focus();
    const invalidate=()=>{prepared=null;requestKey=crypto.randomUUID();remember();};
    const preferences=()=>read("rw-handoff-targets:"+ref.project_id+":"+data.layout_id) || {pins:[],recent:[]};
    function choose(node,actor,focus=true){ selection={node,actor}; invalidate(); drawSelection(); drawTargets(); if(focus) body.querySelector('[data-target][aria-pressed="true"]')?.focus(); }
    function drawSelection(){
      const host=body.querySelector("[data-selection]");
      const parent=body.querySelector("[data-parent]"), previous=parent.value;
      const eligible=selection?related.filter(item=>item.layout_id===data.layout_id && item.revision===data.revision && item.node_id===selection.node.id &&
        ["assistant_id","team_id","member_id"].every(k=>item.payload[k]===selection.actor[k])):[];
      parent.innerHTML='<option value="">New node task</option>'+eligible.map(item=>`<option value="${h(item.id)}">Also: ${h(item.payload.relative)} · ${h(statuses[item.status] || item.status)} · ${h(item.created_at)}</option>`).join("");
      if(eligible.some(item=>item.id===previous)) parent.value=previous;
      body.querySelectorAll("[data-prepare],[data-start]").forEach(b=>b.disabled=!selection);
      if(!selection){
        if(group.length>1){
          host.innerHTML=`<label>This executor serves several nodes,SelectNode<select data-handoff-node><option value="">SelectNode...</option>${group.map((r,i)=>`<option value="${i}">${h(r.node.label+(r.actor.team_name?" · "+r.actor.team_name+" / "+r.actor.member_name:""))}</option>`).join("")}</select></label>`;
          host.querySelector("select").onchange=e=>{if(e.target.value!==""){const row=group[Number(e.target.value)];choose(row.node,row.actor);}};
        }else host.textContent="Select a target; teams and experts must both belong to a specific node.";
        return;
      }
      const {node,actor}=selection;
      host.innerHTML=`<b>${h(node.label)}</b><p>${h(actor.team_name?actor.team_name+" → "+actor.member_name+" ("+actor.assistant_name+")":actor.assistant_name)}</p><div class="handoff-muted">${node.dependencies.length?"Upstream nodes: "+h(node.dependencies.map(id=>data.nodes.find(n=>n.id===id)?.label || id).join(", ")):"No upstream dependency"} · ${node.review_required===false?"Uses the node’s auto-delivery setting":"Waits for node review once output exists"}</div>
        ${actor.binding_source==="project_team"?'<div class="handoff-muted">Uses the project’s standing team from the built-in workflow</div>':""}
        ${view!=="assistant" && node.actors.length>1?`<label>Executing expert<select data-actor-select aria-label="Executing expert">${node.actors.map(a=>`<option value="${h(keyOf(node,a))}" ${keyOf(node,a)===keyOf(node,actor)?"selected":""}>${h((a.member_name?a.member_name+" · ":"")+a.assistant_name)}</option>`).join("")}</select></label>`:""}
        <button class="btn ghost" data-pin>${preferences().pins.includes(keyOf(node,actor))?"Unpin":"Pin"}</button>`;
      const executor=host.querySelector("[data-actor-select]");
      if(executor) executor.onchange=e=>{
        const chosen=node.actors.find(a=>keyOf(node,a)===e.target.value);
        if(chosen){choose(node,chosen,false);host.querySelector("[data-actor-select]")?.focus();}
      };
      host.querySelector("[data-pin]").onclick=()=>{
        const prefs=preferences(), key=keyOf(node,actor);
        if(prefs.pins.includes(key)) prefs.pins=prefs.pins.filter(k=>k!==key);
        else if(prefs.pins.length<2) prefs.pins.push(key);
        else {error.textContent="Up to two common targets; unpin one first.";return;}
        write("rw-handoff-targets:"+ref.project_id+":"+data.layout_id,prefs);drawSelection();drawTargets();
      };
    }
    function drawTargets(){
      if(!data) return;
      const host=body.querySelector("[data-targets]"), q=search.value.toLowerCase(), prefs=preferences();
      const rows=[];
      for(const node of data.nodes){
        const list=view==="assistant"?node.actors:view==="team"?node.actors.filter(a=>a.team_id).filter((a,i,all)=>all.findIndex(b=>b.team_id===a.team_id)===i):node.actors.slice(0,1);
        if(view==="team" && !node.team_id && !list.length) continue;
        if(!list.length && view!=="assistant") rows.push({node,actor:null});
        for(const actor of list) rows.push({node,actor});
      }
      const valid=new Set(data.nodes.flatMap(n=>n.actors.map(a=>keyOf(n,a))));
      prefs.pins=prefs.pins.filter(k=>valid.has(k));prefs.recent=prefs.recent.filter(k=>valid.has(k));
      write("rw-handoff-targets:"+ref.project_id+":"+data.layout_id,prefs);
      const rank=r=>{
        if(!r.actor) return 3;
        const key=keyOf(r.node,r.actor), pin=prefs.pins.indexOf(key), recent=prefs.recent.indexOf(key);
        return pin>=0?pin/10:recent>=0?1+recent/10:2;
      };
      const matches=rows.filter(r=>JSON.stringify([r.node.label,r.actor]).toLowerCase().includes(q)).sort((a,b)=>rank(a)-rank(b));
      const groups=new Map();
      for(const row of matches){
        const key=view==="node" || !row.actor?row.node.id:view==="team"?row.actor.team_id:row.actor.assistant_id;
        if(!groups.has(key)) groups.set(key,[]);groups.get(key).push(row);
      }
      const filtered=[...groups.values()];
      const targetSelect=body.querySelector("[data-target-select]"), label={node:"Select node",team:"Select team",assistant:"Select expert"}[view];
      body.querySelector("[data-target-label]").textContent=label;
      targetSelect.setAttribute("aria-label",label);
      const groupId=row=>view==="node" || !row.actor?row.node.id:view==="team"?row.actor.team_id:row.actor.assistant_id;
      const groupTitle=row=>view==="node"?row.node.label:view==="team"?row.actor?.team_name || "Team config needs repair":row.actor.assistant_name;
      targetSelect.innerHTML=`<option value="">${label}...</option>`+[...groups].map(([key,options])=>`<option value="${h(key)}" ${options[0].actor?"":"disabled"}>${h(groupTitle(options[0]))}${options.length>1?" · "+options.length+" linked nodes":""}${options[0].actor?"":" · "+h(options[0].node.disabled_reason)}</option>`).join("");
      targetSelect.disabled=!filtered.some(options=>options[0].actor);
      const selected=selection?groupId(selection):group[0]?groupId(group[0]):"";
      if(groups.has(selected)) targetSelect.value=selected;
      function selectGroup(options,fromSelect=false){
        group=options || [];
        if(group.length===1) choose(group[0].node,group[0].actor,!fromSelect);
        else {selection=null;invalidate();drawSelection();drawTargets();if(group.length>1) body.querySelector("[data-handoff-node]").focus();}
      }
      targetSelect.onchange=e=>selectGroup(groups.get(e.target.value),true);
      host.innerHTML=filtered.map((options,i)=>{
        const {node,actor}=options[0];
        const title=view==="team"?actor?.team_name || "Team config needs repair":view==="assistant"?actor.assistant_name:node.label;
        const key=actor?keyOf(node,actor):"";
        return `<button class="handoff-target" data-target="${i}" ${actor?"":"disabled"} aria-pressed="${!!selection && options.some(r=>r.actor && keyOf(r.node,r.actor)===keyOf(selection.node,selection.actor))}"><b>${h(title)}</b>${prefs.pins.includes(key)?" · Pinned":prefs.recent.includes(key)?" · Recently used":""}<small class="handoff-muted">${options.length>1?h(options.map(r=>r.node.label).join(", "))+" · SelectNode":actor?h((view==="node"?"":node.label+" · ")+(actor.team_name?actor.team_name+" / "+actor.member_name+" / ":"")+actor.assistant_name):h(node.disabled_reason)}</small></button>`;
      }).join("") || (q?'<p class="handoff-muted">No matching target, change your search.</p>':`<div class="handoff-muted">Nothing available right now${view==="team"?"Team":view==="assistant"?"Expert":"Node"}. ${data.nodes.some(n=>n.disabled_reason)?`<details open><summary>See why a node is configured this way</summary>${data.nodes.filter(n=>n.disabled_reason).map(n=>`<div>${h(n.label)}: ${h(n.disabled_reason)}</div>`).join("")}</details>`:"This workflow only has directly executing experts and no team bound."}</div>`);
      host.querySelectorAll("[data-target]").forEach(button=>button.onclick=()=>{
        selectGroup(filtered[Number(button.dataset.target)]);
      });
      host.onkeydown=event=>{
        if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key)) return;
        const buttons=[...host.querySelectorAll("button:not(:disabled)")], index=buttons.indexOf(document.activeElement);
        if(index<0) return;event.preventDefault();
        const next=event.key==="Home"?0:event.key==="End"?buttons.length-1:(index+(event.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length;
        buttons[next].focus();
      };
    }
    async function refresh(){
      error.textContent=""; selection=null;group=[]; drawSelection();
      try{
        const [next,history]=await Promise.all([api("/api/handoff/targets?project_id="+encodeURIComponent(ref.project_id)),api("/api/handoff/history?project_id="+encodeURIComponent(ref.project_id)+"&summary=1")]);
        if(!el.open) return;
        const first=!data;data=next;related=history.items;invalidate();
        body.querySelector("[data-workflow]").textContent="Workflow:"+data.layout_name+"· only targets in this workflow";
        const notice=body.querySelector("[data-configuration]"), config=data.configuration || {};
        notice.hidden=true;notice.innerHTML="";
        if(config.legacy_leaders>0){
          notice.hidden=false;
          notice.innerHTML=`<p>This project’s team still has ${config.legacy_leaders} old leads have no expert bound. Fix them to pick a team and expert in this workflow.</p><button class="btn" data-repair>Repair this project’s team bindings</button>`;
          notice.querySelector("[data-repair]").onclick=async event=>{
            event.target.disabled=true;error.textContent="";
            try{
              if(curTask!==activeProject) throw new Error("The project changed. Reopen the handoff panel from the current project.");
              await api("/api/handoff/repair-configuration",{project_id:ref.project_id,layout_id:data.layout_id});
              await refresh();
            }catch(e){error.textContent=e.message;event.target.disabled=false;}
          };
        }else if(config.team_count===0 && !data.nodes.some(node=>node.actors.length)){
          notice.hidden=false;
          notice.innerHTML='<p>This project has no workflow team yet. Open its team settings, initialise a team, then come back and refresh the targets.</p><button class="btn" data-project-teams>Open this project’s team settings</button>';
          notice.querySelector("[data-project-teams]").onclick=()=>navigateConfiguration("team");
        }
        if(first && (preferred || saved.layout_id===data.layout_id)){
          for(const node of data.nodes) for(const actor of node.actors) if(keyOf(node,actor)===(preferred || saved.selection)) selection={node,actor};
        }
        drawTargets();drawSelection();
      }catch(e){error.textContent=e.message;body.querySelector("[data-targets]").textContent="Target unavailable. The task description was kept.";}
    }
    body.querySelectorAll("[data-view]").forEach(button=>button.onclick=()=>{view=button.dataset.view;group=[];body.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));drawTargets();drawSelection();});
    body.querySelector("[data-refresh]").onclick=refresh;
    async function navigateConfiguration(tab){
      if(curTask!==activeProject){error.textContent="The project changed. Reopen the handoff panel from the current project.";return;}
      if(flCurrentFile && flCurrentFile.text!==flCurrentFile.originalText && !await flSaveCurrent()){error.textContent="Save failed; your edits were kept.";return;}
      uiNavigate(()=>{el.close();if(tab==="settings") setSec="workflows";openTab(tab);});
    }
    body.querySelector("[data-configure]").onclick=()=>navigateConfiguration("settings");
    search.oninput=drawTargets;instruction.oninput=invalidate;
    body.querySelector("[data-parent]").onchange=invalidate;
    el.addEventListener("close",()=>{remember();preview(ref);},{once:true});
    async function submit(start){
      if(!selection) return;
      error.textContent="";body.querySelectorAll("button,input,textarea,select").forEach(b=>b.disabled=true);
      try{
        if(curTask!==activeProject) throw new Error("Project switched. The task description was kept; reopen the handoff panel from the current project.");
        await saveInput(ref);
        if(!prepared){
          const {node,actor}=selection;
          prepared=(await api("/api/handoff/prepare",{...ref,layout_id:data.layout_id,revision:data.revision,node_id:node.id,
            assistant_id:actor.assistant_id,team_id:actor.team_id,member_id:actor.member_id,instruction:instruction.value,parent_id:body.querySelector("[data-parent]").value,request_key:requestKey})).handoff;
        }
        if(start) prepared=(await api("/api/handoff/start",{id:prepared.id})).handoff;
        const prefs=preferences(), key=keyOf(selection.node,selection.actor);
        prefs.recent=[key,...prefs.recent.filter(k=>k!==key)].slice(0,3);
        write("rw-handoff-targets:"+ref.project_id+":"+data.layout_id,prefs);
        const result=prepared;el.close();showRecord(result);
      }catch(e){error.textContent=e.message;body.querySelectorAll("button,input,textarea,select").forEach(b=>b.disabled=false);drawTargets();drawSelection();}
    }
    body.querySelector("[data-prepare]").onclick=()=>submit(false);
    body.querySelector("[data-start]").onclick=()=>submit(true);
    await refresh();
  }
  async function showRecord(initial){
    if(initial.canonical_task_id && window.ProjectTasks){
      try{const data=await api('/api/project-tasks/detail?project_id='+encodeURIComponent(initial.project_id)+'&id='+encodeURIComponent(initial.canonical_task_id));if(WorkflowNodeWorkbench.eligible(data.task))return ProjectWorkspace.openNodeResult(WorkflowNodeWorkbench.availableSelection(data.task),initial.project_id);}catch{}
      return ProjectTasks.openTask(initial.canonical_task_id,initial.project_id);
    }
    const el=dialog("Node file tasks and receipts"), body=el.querySelector("[data-body]"), error=el.querySelector("[data-error]");
    let record=initial, signature="", busy=false, feedback="";
    function draw(){
      const next=JSON.stringify(record); if(signature===next) return;signature=next;
      const p=record.payload, run=record.run, node=run?.nodes.at(-1), output=node?.checkpoint?.output;
      body.innerHTML=`<div class="handoff-context"><b>${h(p.node_label)}</b><div>${h(p.relative)}</div><div class="handoff-muted">${h(p.actor.team_name?p.actor.team_name+" / "+p.actor.member_name+" / ":"")}${h(p.actor.assistant_name)}</div></div><div class="handoff-row"><b>${h(statuses[record.status] || record.status)}</b><small>${h(record.id)}</small></div>
        ${record.waiting_reason?`<p role="status">${h(record.waiting_reason)}</p>`:""}<p>${h(p.instruction || "Handle this file per the node task description")}</p>
        ${p.parent_id?`<p class="handoff-muted">Additional task: ${h(p.parent_id)} · includes ${(p.related_ids || []).length} linked material items</p>`:""}
        ${run?.error?`<p class="handoff-error">${h(run.error)}</p>`:""}
        ${node?`<details open><summary>Results</summary><pre>${h(node.checkpoint.reply || node.error || "Waiting for result")}</pre></details>`:""}
        ${(output?.files || []).map((path,i)=>`<div class="handoff-row handoff-muted"><span>${h(path)}</span><button class="btn ghost" data-output="${i}">Open output</button></div>`).join("")}
        ${run?`<details><summary>Run tracking</summary><pre>${h(JSON.stringify({workflow:run.layout.name,node_id:record.node_id,run_id:run.id,team_task_id:node?.checkpoint.team_task_id,agent_run_id:node?.checkpoint.agent_run_id,delivery_id:node?.checkpoint.delivery_id,input:run.settings.file_input},null,2))}</pre></details>`:""}
        ${record.status==="awaiting_review"?`<label>Node review note<textarea data-feedback placeholder="Add revision notes when returning">${h(feedback)}</textarea></label>`:""}
        <div class="handoff-row handoff-actions">${!run?'<button class="btn btn-primary" data-action="start">Start this node’s task</button><button class="btn" data-action="reprepare">Pick a target and file version again</button>':""}
        ${record.status==="awaiting_review"?'<button class="btn btn-primary" data-action="approve">Accept and deliver the node</button><button class="btn" data-action="reject">Return for revision</button>':""}
        ${["failed","blocked","interrupted"].includes(record.status)?'<button class="btn" data-action="resume">Check the output and retry</button>':""}
        ${run && !["succeeded","cancelled"].includes(record.status)?'<button class="btn ghost" data-action="cancel">Stop this task</button>':""}</div>`;
      body.querySelector("[data-feedback]")?.addEventListener("input",e=>feedback=e.target.value);
      body.querySelectorAll("[data-output]").forEach(b=>b.onclick=()=>api("/api/conv/open",{path:output.files[Number(b.dataset.output)]}).catch(e=>error.textContent=e.message));
      body.querySelectorAll("[data-action]").forEach(b=>b.onclick=async()=>{
        if(busy) return;
        const action=b.dataset.action;
        if(action==="reprepare"){el.close();open({project_id:record.project_id,relative:p.relative});return;}
        busy=true;b.disabled=true;error.textContent="";
        try{
          if(action==="start") record=(await api("/api/handoff/start",{id:record.id})).handoff;
          else {
            await api("/api/workflow/execution/"+(["approve","reject"].includes(action)?"review":action),{id:run.id,node_id:node?.id,approved:action==="approve",feedback,reviewed_run_id:node?.checkpoint?.canonical_run_id||'',reviewed_output_version:node?.checkpoint?.output_revision||0});
            record=(await api("/api/handoff/detail?id="+encodeURIComponent(record.id))).handoff;
          }
          signature="";draw();
        }catch(e){error.textContent=e.message;b.disabled=false;}finally{busy=false;}
      });
    }
    draw();
    el.addEventListener("close",()=>preview({project_id:record.project_id,relative:record.payload.relative}),{once:true});
    const timer=setInterval(async()=>{
      if(busy || !el.open || !record.run_id || ["succeeded","cancelled"].includes(record.status)) return;
      busy=true;
      try{const result=await api("/api/handoff/detail?id="+encodeURIComponent(record.id));if(el.open){record=result.handoff;draw();}}catch(e){error.textContent=e.message;}finally{busy=false;}
    },2000);
    el.addEventListener("close",()=>clearInterval(timer),{once:true});
  }
  async function history(ref){
    if(!ref?.project_id) return;
    const el=dialog("File handoff log"), body=el.querySelector("[data-body]");
    body.textContent="Reading handoff log...";
    try{
      const result=await api("/api/handoff/history?project_id="+encodeURIComponent(ref.project_id)+"&relative="+encodeURIComponent(ref.relative || "")+"&summary=1");
      if(!el.open) return;
      body.innerHTML=result.items.map((item,i)=>`<div class="handoff-history-item"><b>${h(item.payload.node_label)}</b> · ${h(statuses[item.status] || item.status)}<div class="handoff-muted">${h(item.payload.actor.assistant_name)} · ${h(fmtDate(item.created_at))}</div><button class="btn" data-record="${i}">View tasks and receipts</button></div>`).join("") || '<p class="handoff-muted">This file has no handoff log yet.</p>';
      body.querySelectorAll("[data-record]").forEach(b=>b.onclick=async()=>{
        try{const detail=await api("/api/handoff/detail?id="+encodeURIComponent(result.items[Number(b.dataset.record)].id));if(el.open){el.close();showRecord(detail.handoff);}}
        catch(e){el.querySelector("[data-error]").textContent=e.message;}
      });
    }catch(e){el.querySelector("[data-error]").textContent=e.message;}
  }
  async function preview(ref){
    const button=document.getElementById("flHandoffHistory"), pins=document.getElementById("flHandoffPins");
    if(!button || curTask!==ref.project_id || flSel!==ref.relative) return;
    button.textContent="Handoff log";
    const request=++previewRequest;
    const stillCurrent=()=>request===previewRequest && button.isConnected && curTask===ref.project_id && flSel===ref.relative;
    const results=await Promise.allSettled([
      api("/api/handoff/history?project_id="+encodeURIComponent(ref.project_id)+"&relative="+encodeURIComponent(ref.relative)+"&limit=1&summary=1"),
      api("/api/handoff/targets?project_id="+encodeURIComponent(ref.project_id))
    ]);
    if(!stillCurrent()) return;
    if(results[0].status==="fulfilled"){
      const item=results[0].value.items[0];
      if(item){button.textContent=item.payload.node_label+" · "+(statuses[item.status] || item.status);button.title="Recent handoffs:"+item.payload.actor.assistant_name+"; click for log and receipts";}
    }
    if(pins && results[1].status==="fulfilled"){
      const data=results[1].value, prefs=read("rw-handoff-targets:"+ref.project_id+":"+data.layout_id) || {pins:[]};
      const choices=data.nodes.flatMap(node=>node.actors.map(actor=>({node,actor,key:keyOf(node,actor)}))).filter(x=>prefs.pins.includes(x.key)).slice(0,2);
      const signature=JSON.stringify([ref.project_id,ref.relative,choices]);
      if(pins.dataset.signature===signature) return;
      const restore=pins.contains(document.activeElement);
      pins.innerHTML="";pins.dataset.signature=signature;
      choices.forEach(choice=>{
        const b=document.createElement("button");b.className="btn btn-sm";b.textContent=choice.node.label+" · "+choice.actor.assistant_name;
        b.style.cssText="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        b.title="Hand to this common target (view the task first)";b.onclick=()=>open(ref,choice.key);pins.append(b);
      });
      if(restore) (pins.querySelector("button") || document.getElementById("flHand"))?.focus();
    }else if(pins){
      pins.innerHTML="";delete pins.dataset.signature;
    }
  }
  setInterval(()=>{
    const button=document.getElementById("flHand");
    if(!active && document.visibilityState!=="hidden" && flSel && button?.disabled===false && button.getClientRects().length) preview({project_id:curTask,relative:flSel});
  },6000);
  return {open,history,focused,preview};
})();
