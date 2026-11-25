/* Project-bound workflow diagrams and the existing research step panels. */
(() => {
  "use strict";
  const root = document.createElement("style");
  root.textContent = `
    .wfl-choice{display:flex;flex-direction:column;gap:5px;width:100%;text-align:left;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:11px;margin:0 0 8px;cursor:pointer}
    .wfl-choice.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 9%,var(--panel))}
    .wfl-choice b{font-size:13px}.wfl-choice small{color:var(--muted);font-size:11px;line-height:1.5}
    .wfl-graph{border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden}
    .wfl-graph-scroll{overflow:auto;background-image:radial-gradient(var(--line) .8px,transparent .8px);background-size:16px 16px}
    .wfl-graph-svg{display:block}.wfl-edge{fill:none;stroke:var(--muted);stroke-width:1.4;opacity:.65}
    .wfl-node{cursor:pointer;outline:none;font-family:inherit}
    .wfl-row{display:flex;align-items:center;gap:10px;height:62px;padding:0 12px 0 0;position:relative;overflow:hidden;box-sizing:border-box;border-radius:9px;background:var(--panel);border:1px solid var(--line);color:var(--fg);cursor:pointer}
    .wfl-row-state{position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--line)}
    .wfl-row-no{width:30px;flex:none;text-align:center;font-size:9.5px;letter-spacing:.12em;color:var(--muted)}
    .wfl-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;padding-left:2px}
    .wfl-row-title{font-size:13px;font-weight:550;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .wfl-row-sub{font-size:10px;line-height:1.3;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .wfl-row-out{flex:none;font-size:10px;color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:2px 7px;white-space:nowrap}
    .wfl-row-pill{flex:none;font-size:9.5px;padding:3px 8px;border-radius:5px;white-space:nowrap;color:var(--muted);background:color-mix(in srgb,var(--muted) 10%,transparent);border:1px solid color-mix(in srgb,var(--muted) 22%,transparent)}
    .wfl-node.done .wfl-row-state{background:#388c68}
    .wfl-node.running .wfl-row-state,.wfl-node.ready .wfl-row-state{background:var(--accent)}
    .wfl-node.failed .wfl-row-state{background:var(--err)}
    .wfl-node.done .wfl-row{border-color:color-mix(in srgb,#388c68 34%,transparent)}
    .wfl-node.done .wfl-row-pill{color:#4f9d7e;background:color-mix(in srgb,#388c68 14%,transparent);border-color:color-mix(in srgb,#388c68 30%,transparent)}
    .wfl-node.running .wfl-row{border-color:color-mix(in srgb,var(--accent) 52%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 16%,transparent)}
    .wfl-node.running .wfl-row-pill{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);border-color:color-mix(in srgb,var(--accent) 32%,transparent)}
    .wfl-rail{stroke:var(--line);stroke-width:2}
    .wfl-rail-done{stroke:#388c68;stroke-width:2}
    .wfl-mark{fill:var(--panel);stroke:var(--line);stroke-width:1.6}
    .wfl-mark.done,.wfl-mark.delivered,.wfl-mark.succeeded{fill:color-mix(in srgb,#388c68 20%,var(--panel));stroke:#388c68}
    .wfl-mark.running,.wfl-mark.ready{fill:color-mix(in srgb,var(--accent) 18%,var(--panel));stroke:var(--accent);filter:drop-shadow(0 0 5px color-mix(in srgb,var(--accent) 50%,transparent))}
    .wfl-mark.failed{fill:color-mix(in srgb,var(--err) 18%,var(--panel));stroke:var(--err)}
    .wfl-check{fill:none;stroke:#57a985;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .wfl-mark-no{fill:var(--muted);font-size:9.5px;font-weight:700;font-family:inherit}
    .wfl-mark-no.running,.wfl-mark-no.ready{fill:var(--accent)}
    .wfl-node.selected .wfl-row,.wfl-node:focus-visible .wfl-row{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 22%,transparent)}
    .wfl-note{padding:7px 13px;border-top:1px solid var(--line);font-size:11px;color:var(--muted);line-height:1.5}
    .wfl-error{color:var(--err);font-size:12px;white-space:pre-wrap}.wfl-editor-grid{display:grid;grid-template-columns:185px minmax(0,1fr);gap:14px;margin-top:12px}
    .wfl-editor .field{display:block;margin:10px 0}.wfl-editor input,.wfl-editor textarea,.wfl-editor select{max-width:100%;width:100%;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:7px;font:inherit}
    .wfl-editor .field>span{display:block;font-size:12px;color:var(--muted);margin-bottom:5px}.wfl-editor-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}
    .wfl-editor-actions select{width:auto;min-width:140px}.wfl-node-table{overflow:auto}.wfl-node-table table{width:100%;font-size:12px}.wfl-node-table td{padding:6px;vertical-align:top}.wfl-node-table td:first-child{min-width:130px}.wfl-node-table td:nth-child(2){min-width:145px}.wfl-node-table td:nth-child(3){min-width:130px}.wfl-node-table code{display:block;font-size:10px;color:var(--muted);margin:4px 0}.wfl-node-table .btn{padding:4px 7px;font-size:11px}
    .wfl-json{min-height:180px;font-family:Consolas,monospace!important;font-size:12px!important;margin:8px 0}.wfl-editor details{margin:10px 0}
    .wfl-project-dialog{background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:16px;padding:18px;width:min(700px,calc(100vw - 32px));max-height:90vh;overflow:auto}
    .wfl-project-dialog::backdrop{background:#0009}.wfl-project-dialog .proj-new{position:static;margin:10px 0 0}.wfl-dialog-head{display:flex;justify-content:space-between;align-items:center}.wfl-project-dialog .proj-new h3{display:none}.wfl-project-notice{color:var(--accent);font-size:13px;margin:8px 0}
    @media(max-width:1000px){.wfl-editor-grid{grid-template-columns:1fr}.wfl-editor-list{display:flex;gap:8px;overflow:auto}.wfl-editor-list .wfl-choice{min-width:160px}}
    @media(max-width:700px){.wfl-project-dialog .row{grid-template-columns:1fr}}
  `;
  document.head.appendChild(root);
  const labels = {config:"Configured",awaiting_review:"Awaiting manual review",queued:"Ready",pending:"To start",ready:"Ready to start",waiting:"Waiting on dependencies",running:"Running",done:"Run complete",succeeded:"Awaiting review",delivered:"Delivered",stale:"Needs re-confirmation",failed:"Failed",cancelled:"Stopped",blocked:"Blocked"};
  let settingsData = null, draft = null, projectNotice = "", settingsRequest = 0;
  const byId = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const stageLabel = step => settingsData?.stages.find(stage=>stage.id===step)?.name || step;

  function graph(data, interactive = true, rowWidth = 720){
    const GAP = 12, RAIL = 46, NODE_X = 74, PAD_R = 16, H = 62;
    const lanes = new Map();
    for(const node of data.nodes || []){
      const level = Number.isFinite(node.level) ? node.level : 0;
      if(!lanes.has(level)) lanes.set(level, []);
      lanes.get(level).push(node);
    }
    // one row per step: a single node fills the width, siblings split it
    const laneWidth = Math.max(240, Math.round(rowWidth) - NODE_X - PAD_R);
    const positions = new Map();
    for(const [level, lane] of lanes){
      const w = Math.floor((laneWidth - (lane.length - 1) * GAP) / lane.length);
      lane.forEach((node, index) => positions.set(node.id, {x: NODE_X + index * (w + GAP), y: 18 + level * 88, w}));
    }
    const width = NODE_X + laneWidth + PAD_R;
    const height = Math.max(140, ...[...positions.values()].map(p => p.y + H + 18));
    const paths = (data.edges || []).map(edge => {
      const a = positions.get(edge.source), b = positions.get(edge.target);
      if(!a || !b) return "";
      const x = a.x + a.w / 2, y = a.y + H, end = b.x + b.w / 2, ey = b.y - 4;
      return `<path class="wfl-edge" d="M ${x} ${y} C ${x} ${y+26}, ${end} ${ey-26}, ${end} ${ey}" marker-end="url(#wfl-arrow)"/>`;
    }).join("");
    const nodeList = data.nodes || [];
    const ys = nodeList.map(node => positions.get(node.id).y);
    const railTop = Math.min(...ys) + H / 2, railBottom = Math.max(...ys) + H / 2;
    const doneYs = nodeList.filter(node => node.status === "done").map(node => positions.get(node.id).y + H / 2);
    const rail = `<line class="wfl-rail" x1="${RAIL}" y1="${railTop}" x2="${RAIL}" y2="${railBottom}"/>` +
      (doneYs.length ? `<line class="wfl-rail-done" x1="${RAIL}" y1="${railTop}" x2="${RAIL}" y2="${Math.max(...doneYs)}"/>` : "");
    const marksOf = {done: 1, delivered: 1, succeeded: 1};
    const marks = nodeList.map((node, index) => {
      const p = positions.get(node.id), key = node.status || "pending", cy = p.y + H / 2;
      const mark = `<circle class="wfl-mark ${esc(key)}" cx="${RAIL}" cy="${cy}" r="10"/>`;
      return mark + (marksOf[key]
        ? `<path class="wfl-check" d="M ${RAIL - 4.2} ${cy} l 3.1 3.1 l 6.2 -6.2"/>`
        : `<text class="wfl-mark-no ${esc(key)}" x="${RAIL}" y="${cy + 3.4}" text-anchor="middle">${index + 1}</text>`);
    }).join("");
    const nodes = (data.nodes || []).map((node, index) => {
      const p = positions.get(node.id);
      const key = node.status || "pending";
      const status = labels[key] || labels.pending;
      const sub = node.owner_name || "No executor bound";
      const pill = status;
      const label = node.label.length > 30 ? node.label.slice(0, 29) + "..." : node.label;
      return `<g class="wfl-node ${esc(key)} ${node.id === data.selected_node ? "selected" : ""}" transform="translate(${p.x},${p.y})" ${interactive ? `data-wfl-node="${esc(node.id)}" role="button" tabindex="0" aria-label="${esc(node.label + ": " + status)}"` : ""}>
        <title>${esc([node.label, status, node.review_required === false ? "" : "needs manual review"].filter(Boolean).join(" · "))}</title>
        <foreignObject width="${p.w}" height="${H}">
          <div xmlns="http://www.w3.org/1999/xhtml" class="wfl-row">
            <i class="wfl-row-state"></i>
            <span class="wfl-row-no">${String(index + 1).padStart(2, "0")}</span>
            <span class="wfl-row-main"><span class="wfl-row-title">${esc(label)}</span><span class="wfl-row-sub">${esc(sub)}</span></span>
            ${node.output_label ? `<span class="wfl-row-out">${esc(node.output_label)}</span>` : ""}
            <span class="wfl-row-pill">${esc(pill)}</span>
          </div>
        </foreignObject>
      </g>`;
    }).join("");
    return `<div class="wfl-graph-scroll"><svg class="wfl-graph-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Workflow nodes and dependency status graph"><defs><marker id="wfl-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7 z" fill="var(--muted)"/></marker></defs>${rail}${paths}${marks}${nodes}</svg></div>`;
  }
  window.WorkflowGraph={render:graph};
  if(!SET_SECS.some(section=>section[0]==="workflows")) SET_SECS.push(["workflows","🔀","Workflow"]);
  const originalSettings = renderSettings;
  renderSettings = function(m){
    originalSettings(m);
    if(setSec !== "workflows" || !S.loaded) return;
    const body = byId("set-body"); if(!body) return;
    if(settingsData) drawEditor(body);
    else body.innerHTML = '<div class="card"><h3>Workflow settings</h3><p class="hint">Loading workflow definition...</p></div>';
    const requestId=++settingsRequest;
    api("/api/workflow/layouts").then(result=>{
      if(requestId!==settingsRequest) return;
      const active=route()==="settings" && setSec==="workflows" && body.isConnected;
      if(active && body.querySelector("[data-wfl-name]")) captureEditor(body);
      const previous=settingsData?.layouts.find(layout=>layout.id===draft?.id);
      const dirty=draft && (!previous || ["name","description","nodes","edges","order"].some(key=>JSON.stringify(draft[key])!==JSON.stringify(previous[key])));
      settingsData=result;
      if(!active) return;
      if(!dirty) draft=clone(result.layouts.find(layout=>layout.id===draft?.id) || result.layouts[0] || freshDraft());
      else if(draft.id && !result.layouts.some(layout=>layout.id===draft.id)) draft.id="";
      drawEditor(body);
    }).catch(error=>{ if(body.isConnected) body.innerHTML=`<p class="wfl-error">${esc(error.message)}</p>`; });
  };

  function freshDraft(){
    return {id:"",name:"New workflow",description:"",nodes:[{id:"idea",step:"idea",label:stageLabel("idea")}],edges:[],order:["idea"]};
  }
  function draftNodes(){
    const nodes = new Map(draft.nodes.map(node=>[node.id,node]));
    return draft.order.map(id=>nodes.get(id)).filter(Boolean);
  }
  function captureEditor(body){
    draft.name = body.querySelector("[data-wfl-name]").value.trim();
    draft.description = body.querySelector("[data-wfl-description]").value.trim();
    const nodes=[],edges=[];
    body.querySelectorAll("[data-wfl-row]").forEach(row=>{
      const id=row.dataset.wflRow;
      const mode=row.querySelector("[data-wfl-mode]").value;
      nodes.push({...draft.nodes.find(node=>node.id===id),id,step:row.querySelector("[data-wfl-step]").value,label:row.querySelector("[data-wfl-label]").value.trim(),
        review_required:row.querySelector("[data-wfl-review]").checked,
        executor_role_id:row.querySelector("[data-wfl-role]").value.trim() || id,
        execution_mode:mode,
        assistant_id:mode==="team"?"":row.querySelector("[data-wfl-assistant]").value,team_id:mode==="assistant"?"":row.querySelector("[data-wfl-team]").value,
        member_id:mode==="assistant"?"":row.querySelector("[data-wfl-member]").value,prompt:row.querySelector("[data-wfl-prompt]").value,
        tools:row.querySelector("[data-wfl-limit-tools]").checked ? [...row.querySelector("[data-wfl-tools]").selectedOptions].map(o=>o.value) : null,
        skills:[...row.querySelector("[data-wfl-skills]").selectedOptions].map(o=>o.value)});
      const sources=row.querySelector("[data-wfl-parents]").value.split(/[,, \s]+/).filter(Boolean);
      sources.forEach(source=>edges.push(draft.edges.find(edge=>edge.source===source&&edge.target===id)||{source,target:id}));
    });
    draft.nodes=nodes; draft.edges=edges; draft.order=nodes.map(node=>node.id);
  }
  function previewDraft(body){
    const target=body.querySelector("[data-wfl-preview]"); if(!target) return;
    try{
      const nodes=clone(draftNodes()), levels=new Map();
      if(!nodes.length) throw new Error("Add at least one step");
      for(const node of nodes){
        const parents=draft.edges.filter(edge=>edge.target===node.id).map(edge=>edge.source);
        if(parents.some(id=>!levels.has(id))) throw new Error("A dependency must point to a valid node placed before this one; adjust the order or the upstream node");
        node.level=Math.max(0,...parents.map(id=>levels.get(id)+1)); node.status="pending"; levels.set(node.id,node.level);
      }
      target.innerHTML=graph({nodes,edges:draft.edges},false);
    }catch(error){ target.innerHTML=`<p class="wfl-error">${esc(error.message)}</p>`; }
    const json=body.querySelector("[data-wfl-json]");
    if(json && document.activeElement !== json) json.value=JSON.stringify({nodes:draft.nodes,edges:draft.edges,order:draft.order},null,2);
  }
  function drawEditor(body, notice=""){
    if(!draft) draft=clone(settingsData.layouts[0] || freshDraft());
    const stages=[...(settingsData.stages || [])];
    if(!stages.some(stage=>stage.id==="task")) stages.push({id:"task",name:"Custom project task"});
    const execution=settingsData.execution_options || {};
    const choices=(rows,current,empty)=>`<option value="">${empty}</option>${(rows || []).map(item=>`<option value="${esc(item.id)}" ${item.id===current?"selected":""}>${esc(item.name || item.label || item.id)}</option>`).join("")}`;
    const multi=(rows,selected)=> (rows || []).map(item=>`<option value="${esc(item.id)}" ${(selected || []).includes(item.id)?"selected":""}>${esc(item.name || item.label || item.id)}</option>`).join("");
    const nodeConfig=node=>`<details><summary>Run and review${node.review_required===false?" · Auto-deliver":" · needs manual review"}</summary>
      <label class="field"><input type="checkbox" style="width:auto" data-wfl-review ${node.review_required===false?"":"checked"}> Manual review once output exists</label>
      <label class="field"><span>Project executor roles ID</span><input data-wfl-role maxlength="120" value="${esc(node.executor_role_id || node.id)}" placeholder="e.g. literature_reviewer"><small class="hint">in the project task’s“Workflow role bindings”to pick an expert or team from this project for that role.</small></label>
      <label class="field"><span>Run mode</span><select data-wfl-mode aria-label="How the node runs">${[["","Uses this project’s role bindings"],["assistant","Run by expert"],["team","Run by team"]].map(([id,label])=>`<option value="${id}" ${id===(node.execution_mode || (node.team_id?"team":node.assistant_id?"assistant":""))?"selected":""}>${label}</option>`).join("")}</select></label>
      <label class="field"><span>Executing expert (expert mode)</span><select data-wfl-assistant aria-label="Node expert">${choices(execution.assistants,node.assistant_id,"Selectexperts; team mode uses member bindings")}</select></label>
      <label class="field"><span>Executing team (team mode)</span><select data-wfl-team aria-label="Node team">${choices(execution.teams,node.team_id,"SelectTeam")}</select></label>
      <label class="field"><span>Team members</span><select data-wfl-member aria-label="Node team members">${choices(execution.teams?.find(t=>t.id===node.team_id)?.members,node.member_id,"matched by stage, or use Leader")}</select></label>
      <label class="field"><span>Node task description</span><textarea data-wfl-prompt rows="3" placeholder="Leave empty to use the current stage; upstream results and human feedback are carried over">${esc(node.prompt || "")}</textarea></label>
      <label class="field"><input type="checkbox" style="width:auto" data-wfl-limit-tools ${node.tools!=null?"checked":""}> Only the selected tools may be used</label>
      <select data-wfl-tools multiple size="5" aria-label="Node tools">${multi(execution.tools,node.tools)}</select>
      <label class="field"><span>Skills to apply; pick as many as you like</span><select data-wfl-skills multiple size="5" aria-label="Node skills">${multi(execution.skills,node.skills)}</select></label>
      <p class="hint">Hold Ctrl or ⌘ Multi-select. A node inherits project memory, prior deliveries, and human feedback. Tools stay limited by expert permissions.</p></details>`;
    body.innerHTML=`<div class="card wfl-editor"><h3>Workflow definition</h3><p class="hint">Edit nodes, upstream dependencies, and order, then save to pick them on the workflow page. Add custom project tasks or reuse similar steps; project role bindings decide who runs them.</p>
      <div class="wfl-editor-actions"><button class="btn" data-wfl-new>New workflow</button><button class="btn ghost" data-wfl-copy>Copy the current</button><span class="hint" role="status" data-wfl-message>${esc(notice)}</span></div>
      <div class="wfl-editor-grid"><aside class="wfl-editor-list">${settingsData.layouts.map(layout=>`<button class="wfl-choice ${layout.id===draft.id?"on":""}" data-wfl-edit="${esc(layout.id)}"><b>${esc(layout.name)}</b><small>${layout.nodes.length} nodes</small></button>`).join("")}</aside>
      <section><label class="field"><span>Workflow name</span><input data-wfl-name maxlength="120" value="${esc(draft.name)}"></label><label class="field"><span>Description</span><textarea data-wfl-description rows="2">${esc(draft.description || "")}</textarea></label>
      <div class="wfl-node-table"><table><thead><tr><th>Steps / Node ID</th><th>Node name</th><th>Upstream nodes ID (comma separated)</th><th>Order</th></tr></thead><tbody>${draftNodes().map((node,index)=>`<tr data-wfl-row="${esc(node.id)}"><td><select data-wfl-step aria-label="Steps">${stages.map(stage=>`<option value="${esc(stage.id)}" ${stage.id===node.step?"selected":""}>${esc(stage.name)}</option>`).join("")}</select><code>${esc(node.id)}</code></td><td><input data-wfl-label aria-label="Node name" value="${esc(node.label)}" maxlength="120"></td><td><input data-wfl-parents aria-label="Upstream node" value="${esc(draft.edges.filter(edge=>edge.target===node.id).map(edge=>edge.source).join(", "))}" placeholder="No dependencies"></td><td><button class="btn ghost" data-wfl-up="${index}" ${index===0?"disabled":""} aria-label="Move node up">↑</button><button class="btn ghost" data-wfl-down="${index}" ${index===draft.order.length-1?"disabled":""} aria-label="Move node down">↓</button><button class="btn ghost" data-wfl-remove="${esc(node.id)}" aria-label="Remove node">Remove</button></td></tr>`).join("")}</tbody></table></div>
      <div class="wfl-editor-actions"><select data-wfl-add-step aria-label="Add step">${stages.map(stage=>`<option value="${esc(stage.id)}">${esc(stage.name)}</option>`).join("")}</select><button class="btn ghost" data-wfl-add>Add node</button><button class="btn ghost" data-wfl-chain>Chained in this order</button></div>
      <details><summary>Advanced JSON (nodes / edges / order)</summary><textarea data-wfl-json class="wfl-json" spellcheck="false" aria-label="Workflow JSON"></textarea><button class="btn ghost" data-wfl-apply-json>Apply JSON into the editor</button></details>
      <div class="wfl-graph"><div class="wfl-note">organisation preview (not a run state)</div><div data-wfl-preview></div></div>
      <div class="wfl-editor-actions"><button class="btn" data-wfl-save>Save workflow</button>${draft.id?'<button class="btn ghost" data-wfl-delete>Delete workflow</button>':""}</div></section></div></div>`;
    body.querySelectorAll("[data-wfl-row]").forEach(row=>{
      const node=draft.nodes.find(n=>n.id===row.dataset.wflRow);
      row.children[1].insertAdjacentHTML("beforeend",nodeConfig(node));
    });
    const message=text=>{ const el=body.querySelector("[data-wfl-message]"); if(el) el.textContent=text; };
    body.querySelectorAll("[data-wfl-name],[data-wfl-description]").forEach(input=>input.oninput=()=>captureEditor(body));
    body.querySelector("[data-wfl-new]").onclick=()=>{ draft=freshDraft(); drawEditor(body); };
    body.querySelector("[data-wfl-copy]").onclick=()=>{ captureEditor(body); draft.id=""; draft.name+="(copy)"; drawEditor(body); };
    body.querySelectorAll("[data-wfl-edit]").forEach(button=>button.onclick=()=>{ draft=clone(settingsData.layouts.find(layout=>layout.id===button.dataset.wflEdit)); drawEditor(body); });
    body.querySelectorAll("[data-wfl-row] input,[data-wfl-row] select").forEach(input=>input.onchange=()=>{
      const configRow=input.closest("[data-wfl-row]");
      if(input.hasAttribute("data-wfl-assistant") && input.value) configRow.querySelector("[data-wfl-mode]").value="assistant";
      if(input.hasAttribute("data-wfl-team")){
        if(input.value) configRow.querySelector("[data-wfl-mode]").value="team";
        input.closest("[data-wfl-row]").querySelector("[data-wfl-member]").innerHTML=choices(execution.teams?.find(t=>t.id===input.value)?.members,"","Match by stage, or use Leader");
      }
      if(input.hasAttribute("data-wfl-step")){
        const row=input.closest("[data-wfl-row]"), previous=draft.nodes.find(node=>node.id===row.dataset.wflRow);
        const label=row.querySelector("[data-wfl-label]");
        if(previous && label.value===stageLabel(previous.step)) label.value=stageLabel(input.value);
      }
      captureEditor(body); previewDraft(body);
    });
    body.querySelectorAll("[data-wfl-up],[data-wfl-down]").forEach(button=>button.onclick=()=>{
      captureEditor(body);
      const index=Number(button.dataset.wflUp ?? button.dataset.wflDown), next=index+(button.hasAttribute("data-wfl-up")?-1:1);
      [draft.order[index],draft.order[next]]=[draft.order[next],draft.order[index]]; drawEditor(body);
    });
    body.querySelectorAll("[data-wfl-remove]").forEach(button=>button.onclick=()=>{
      captureEditor(body); const id=button.dataset.wflRemove;
      draft.nodes=draft.nodes.filter(node=>node.id!==id); draft.order=draft.order.filter(nid=>nid!==id); draft.edges=draft.edges.filter(edge=>edge.source!==id && edge.target!==id); drawEditor(body);
    });
    body.querySelector("[data-wfl-add]").onclick=()=>{
      const step=body.querySelector("[data-wfl-add-step]").value; if(!step) return;
      captureEditor(body); let id=step;
      while(draft.nodes.some(node=>node.id===id)) id+="_";
      draft.nodes.push({id,step,label:step==="task"?"Custom project task":stageLabel(step),executor_role_id:id,review_required:true}); draft.order.push(id); drawEditor(body);
    };
    body.querySelector("[data-wfl-chain]").onclick=()=>{ captureEditor(body); draft.edges=draft.order.slice(1).map((target,index)=>{const source=draft.order[index];return draft.edges.find(edge=>edge.source===source&&edge.target===target)||{source,target};}); drawEditor(body); };
    body.querySelector("[data-wfl-apply-json]").onclick=()=>{
      try{
        const value=JSON.parse(body.querySelector("[data-wfl-json]").value);
        if(!Array.isArray(value.nodes) || !Array.isArray(value.edges) || !Array.isArray(value.order)) throw new Error("must include nodes, edges, order Array");
        if(value.nodes.some(node=>!node || typeof node.id!=="string" || typeof node.step!=="string" || typeof node.label!=="string")) throw new Error("nodes must include id, step and label string");
        if(value.edges.some(edge=>!edge || typeof edge.source!=="string" || typeof edge.target!=="string")) throw new Error("An edge needs source and target strings");
        if(value.order.length!==value.nodes.length || new Set(value.order).size!==value.nodes.length || value.order.some(id=>!value.nodes.some(node=>node.id===id))) throw new Error("order must list every node ID once");
        draft.name=body.querySelector("[data-wfl-name]").value.trim(); draft.description=body.querySelector("[data-wfl-description]").value.trim();
        Object.assign(draft,{nodes:value.nodes,edges:value.edges,order:value.order}); drawEditor(body,"JSON applied; save to commit");
      }catch(error){ message("Invalid JSON:"+error.message); }
    };
    body.querySelector("[data-wfl-save]").onclick=async event=>{
      captureEditor(body); event.target.disabled=true; settingsRequest++;
      try{
        const saved=await api("/api/workflow/layouts/save",draft); draft=clone(saved.layout);
        settingsData=await api("/api/workflow/layouts"); if(body.isConnected) drawEditor(body,"Saved");
      }catch(error){ message("Save failed:"+error.message); event.target.disabled=false; }
    };
    const del=body.querySelector("[data-wfl-delete]");
    if(del) del.onclick=async()=>{
      if(!await uiConfirm("Delete workflow ”"+draft.name+"”? Projects bound to it return the rest of the workflow; project data is kept.")) return;
      del.disabled=true; settingsRequest++;
      try{ await api("/api/workflow/layouts/delete",{id:draft.id}); settingsData=await api("/api/workflow/layouts"); draft=null; if(body.isConnected) drawEditor(body,"Workflow deleted"); }
      catch(error){ message("Delete failed:"+error.message); del.disabled=false; }
    };
    previewDraft(body);
  }

})();
