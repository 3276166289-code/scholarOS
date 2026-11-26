/* ============================== Page ============================== */
const chatMessageKey=value=>String(value??'').replace(/\s+/g,' ').trim();
const chatUserInputKey=value=>{
  const normalized=chatMessageKey(value);
  for(const marker of ['[materials explicitly cited by this project]','[@context]','[prompt template the user explicitly used:','[materials chosen by the user]','[context mentioned with @]']){
    const index=normalized.indexOf(marker);
    if(index>0)return normalized.slice(0,index).trim();
  }
  return normalized;
};
function render(){
  const retired=tabs.find(tab=>tab.id===activeTab);
  if(retired?.route==='schedules'){
    TaskCenter.requestView('automation');
    retired.route='task-center';retired.title='Tasks and automation';
  }
  if(retired?.route==='workbench'&&window.ProjectWorkspace){
    ProjectWorkspace.requestRoute('workbench');
    retired.route='workspace';
    retired.title=TITLES.workspace;
  }
  renderSidebar(); renderTopbar(); renderTabs(); renderStatus(); AppNavigation.sync();
  if(typeof GlobalTodos !== 'undefined') GlobalTodos.syncProjects();
  const r = route(); const m = $("main");
  m.classList.remove("sp-fill", "tof-fill");m.classList.toggle("agent-fill",r==="agent");
  m.classList.toggle("pw-fill", r==="workspace");
  m.classList.toggle('toolbox-fill',r==='toolbox');
  m.classList.toggle('ec-global-fill',r==='task-center');
  if(!S.loaded) m.innerHTML = `<div class="muted">Loading...</div>`;
  else if(r==="agent") return renderAgent(m);
  else if(r==="workspace") return ProjectWorkspace.render(m);
  else if(r==='task-center') return TaskCenter.renderGlobal(m);
  else if(r==='usage') return UsageView.render(m);
  else if(r==='toolbox') return PaperToolbox.render(m);
  else if(r==="workflow") { ProjectWorkspace.requestRoute("workflow"); return ProjectWorkspace.render(m); }
  else if(r==="tasks") ProjectManager.open();
  else if(r==="space" || r==="notes") { if(window.ProjectWorkspace) { ProjectWorkspace.requestRoute("notes"); return ProjectWorkspace.render(m); } else return renderSpace(m); }
  else if(r==="calendar") return renderCalendar(m);
  else if(r==="mail") return renderMail(m);
  else if(r==="library") return renderStar(m);
  else if(r==="intel") return renderIntel(m);
  else if(r==="assistants") renderAssistants(m);
  else if(r==="team") return renderTeam(m);
  else if(r==="models") renderModels(m);
  else renderSettings(m);
}

function needTask(){
  if(S.tasks && S.tasks.length){
    const exists = S.tasks.some(t => t.id === curTask);
    if(!exists){
      curTask = S.tasks[0].id;
      localStorage.setItem("rw-task", curTask);
    }
  } else {
    curTask = null;
    localStorage.removeItem("rw-task");
  }
  if(!curTask) return `<div class="card"><h3>No project yet</h3><div class="hint">Workflows and literature can both bind to a standalone project. Create one with the button below, or manage them on the projects page.</div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-primary" onclick="openTab('tasks')">+ New project</button></div></div>`;
  return "";
}

let asView = "all";                       // all | official | mine | edit
let asEdit = { id:"", source:"user", name:"", avatar:"", description:"", rules:"", prompts:[], model_id:"" };

function asSource(a){ return a.source === "builtin" ? "official" : "mine"; }
function asOf(kind){
  if(kind === "all") return S.assistants || [];
  return (S.assistants||[]).filter(a=>asSource(a)===kind);
}
function asCur(){ return (S.assistants||[]).find(a=>a.id===asEdit.id) || null; }
function asChat(){ return (S.chats||[]).find(c=>c.id===curChat) || null; }
function asBound(){ const c=asChat(); return c ? (c.assistant_id||"") : ""; }
const Q_AV = "/vendor/img/agent-q.png";                                        // Assistant main avatar (chibi figure, transparent background)
const AH_AV = Array.from({length: 7}, (_, i)=>`/vendor/img/av${i + 1}.png`);   // the assistant's pose in the chat list
function asAvatarOf(a, size){
  const px = size||42;
  return `<span class="as-av" style="width:${px}px;height:${px}px;font-size:${Math.round(px*0.55)}px">${esc(a&&a.avatar || "👨‍🔬")}</span>`;
}
/* the chat title uses the bound expert's avatar, else the assistant. */
function faceOf(a, px){
  if(a && a.id !== 'builtin-steward') return asAvatarOf(a, px);
  return `<span class="as-av" style="width:${px}px;height:${px}px"><img src="${Q_AV}" alt="Assistant"
    style="width:100%;height:100%;object-fit:contain" loading="lazy"></span>`;
}
/* Conversation header subtitle: assistant = global; expert = project scope (hint when unbound). Shared by renderAgent and loadAgentMeta; do not duplicate */
function atSubHTML(room){
  const a = (S.assistants||[]).find(x=>x.id===((room&&room.assistant_id)||"")) || null;
  const out = `Output ${esc(room?outName(room.out_dir):"default output folder")}`;
  if(room&&room.task_id) return `${esc(a?a.name:"Assistant")} · Bind ”${esc(projName(room.task_id)||"Project")}"· Output stays in the project folder`;
  if(!a) return `Assistant · Global (any project)· ${out}`;
  return `${esc(a.name)} · ${room&&room.task_id ? `Partner · Bind ”${esc(projName(room.task_id)||"Project")}”` : "Experts work by project · No project bound"} · ${out}`;
}
function asCard(a){
  const on = a.enabled !== 0, mine = asSource(a)==="mine";
  return `<div class="as-card ${on?"":"off"}" data-as-open="${a.id}">
    <div class="as-card-top">
      <div style="display:flex;align-items:center;gap:8px">
        ${asAvatarOf(a)}
        <span class="as-src-badge" style="font-size:11px;padding:2px 7px;border-radius:6px;background:var(--panel2);color:var(--muted);border:1px solid var(--line)">${mine?"My":"System"}</span>
      </div>
      <button class="as-toggle ${on?"on":"off"}" data-as-toggle="${a.id}" title="${on?"Enabled (click to disable)":"Disabled (click to enable)"}">
        <span class="as-knob"></span><span class="as-toggle-txt">${on?"Enabled":"Off"}</span>
      </button>
    </div>
    <b>${esc(a.name)}</b>
    <i class="as-mdl">${a.model_id?("🔌 "+esc(modelName(a.model_id)||" (model deleted)")):"🔌 Use the active model"}</i>
    <p>${esc(a.description||" (no description)")}</p>
    <div class="as-card-foot">
      <button class="btn btn-primary as-go" data-as-chat="${a.id}" title="Start a chat as this expert">💬 Go to chat</button>
      ${mine?`<button class="btn ghost as-act-btn" data-as-del="${a.id}" style="color:var(--err)">Delete</button>`
            :`<button class="btn ghost as-act-btn" data-as-dup="${a.id}">Copy to mine</button>`}
    </div></div>`;
}

/* ---------------- team: members are expert instances, leader first ---------------- */
let teamScope = localStorage.getItem("rw-team-chat") || "";
let teamData = null, teamBusy = false, teamTick = null, teamList = null;
const teamDrafts=new Map(),teamSending=new Set();
function rememberTeamDraft(key,value){teamDrafts.set(key,value);try{localStorage.setItem(key,value);}catch{}}
function tcColor(i){ const P=["var(--brand)","#5c9ea4","#b58a5e","#8f7fb5","#7fa06a","#b57f92"]; return P[(i||0)%P.length]; }
const modelName = (id)=>((S.models||[]).find(x=>x.id===id)||{}).name||"";
let teamChatRenderSequence=0;
async function renderTeam(m){
  const ticket=++teamChatRenderSequence;
  if(!teamList){ try{ teamList = await api("/api/teams"); }catch(e){ teamList = {teams:[], error:e.message}; } }
  if(ticket!==teamChatRenderSequence || route()!=='team' || !m.isConnected)return;
  const TL = (teamList.teams||[]);
  const curT = TL.find(t=>t.id===teamScope) || null;
  if(!curT){                                            // Invalid scope (legacy data/disbanded) → fall back to the first fixed team
    const first = TL.find(t=>t.kind==="fixed") || TL[0] || null;
    teamScope = first ? first.id : "";
    if(teamScope) localStorage.setItem("rw-team-chat", teamScope); else localStorage.removeItem("rw-team-chat");
  }
  if(!teamScope){
    m.innerHTML = `<div class="page-head"><div><p class="inst-label">TEAM</p><h3>Team</h3>
      <p class="hint">Opening a team group...</p></div></div>`;
    try{ const r = await api("/api/chat/create", {title:"Team"}); teamScope = r.id || (r.chat&&r.chat.id) || "";
         localStorage.setItem("rw-team-chat", teamScope); await refreshState(false); }
    catch(e){ m.innerHTML = `<div class="page-head"><div><p class="inst-label">TEAM</p><h3>Team</h3>
      <p class="hint">Failed to open the team group: ${esc(e.message)}</p></div></div>`; return; }
  }
  const scope=teamScope;
  try{ teamData = await api("/api/team/chat?scope=" + encodeURIComponent(scope)); }
  catch(e){ teamData = {error:e.message, members:[], transcript:[]}; }
  if(ticket!==teamChatRenderSequence || route()!=='team' || teamScope!==scope || !m.isConnected)return;
  const D = teamData || {}, all = D.members||[], leader = all.find(x=>x.role==="leader")||null;
  const draftKey=`rw-team-draft:${scope}:${D.session?.id||'default'}`;
  let savedDraft=teamDrafts.get(draftKey);if(savedDraft===undefined){try{savedDraft=localStorage.getItem(draftKey)||'';}catch{savedDraft='';}}
  const ms = all.filter(x=>x.role!=="member"?false:true), picks = all.filter(x=>x.role==="member");
  const inTeam = new Set(picks.map(x=>x.assistant_id));
  const pool = (S.assistants||[]).filter(a=>a.enabled!==0 && !inTeam.has(a.id));
  const run = D.running;
  const orchestration = D.orchestration;
  const coordination = D.coordination || {};
  const tr = D.transcript||[];
  let lastUser = -1; tr.forEach((r,i)=>{ if(r.role==="user") lastUser = i; });
  const spoken = new Set(tr.slice(lastUser+1).map(r=>r.sender).filter(Boolean));   // members who already spoke this round
  let seq = 0;
  const bubble = (r)=>{
    const who = r.sender || (r.role==="user" ? "you" : "Members");
    const mm = all.find(x=>x.name===who);
    const expert=(S.assistants||[]).find(item=>item.id===mm?.assistant_id);
    const displayName=r.role==="user"||who==="System"?who:(r.assistant_name||expert?.name||who);
    const at = esc((r.at||"").replace("T"," ").slice(5,16));
    if(who==="System") return `<div class="tc-sys"><span class="tc-av">!</span><div class="tc-body"><div class="tc-who"><b>System</b><span class="tc-at">${at}</span></div><div class="tc-text">${esc(r.content||"")}</div></div></div>`;
    const mine = r.role==="user";
    const n = mine ? 0 : ++seq;
    return `<div class="tc-msg ${mine?"me":"them"}" style="--mc:${mine?"var(--accent)":tcColor(mm&&mm.color)}">
      <span class="tc-av">${mine?"🙋":esc((mm&&mm.name||"?").slice(0,1))}</span>
      <div class="tc-body"><div class="tc-who"><b>${esc(displayName)}</b>${displayName!==who?`<span class="tc-at">${esc(who)}</span>`:""}${n?`<span class="tc-idx">#${n}</span>`:""}<span class="tc-at">${at}</span></div>
        <div class="tc-text">${esc(r.content||"")}</div></div></div>`;
  };
  const sessions = D.sessions || [];
  const curSess = D.session || sessions.find(s=>s.active) || sessions[0] || {};
  m.innerHTML = `<div class="tc-page">
  <!-- left: chat history sidebar -->
  <aside class="tc-side-hist">
    <div class="tc-hist-head">
      <span>💬 Chat history</span>
      <button class="btn btn-primary" id="tcNewSession" title="New team chat">+ New</button>
    </div>
    <div class="tc-hist-list">
      ${sessions.length ? sessions.map(s => `
        <button class="tc-hist-item ${s.id === curSess.id ? "on" : ""}" data-tc-sess="${esc(s.id)}" title="${esc(s.title || "New session")}">
          <span class="tc-hist-title">${esc(s.title || "New session")}</span>
          <span class="tc-hist-time">${esc(fmtAgo(s.updated_at))}</span>
        </button>
      `).join("") : `<p class="hint" style="padding:12px;font-size:11.5px">No chat history yet; create one above.</p>`}
    </div>
  </aside>

  <!-- Right: main discussion area -->
  <div class="tc-stage">
    <!-- top bar: team picker, project folder, status and settings -->
    <div class="tc-top-bar">
      <div class="tc-top-picks">
        <label class="at-sel" title="Choose a collaborating team">
          <span class="tc-sel-lbl">👥 Team</span>
          <select class="control" id="tcTeamSelect">
            ${TL.map(x=>`<option value="${x.id}" ${x.id===teamScope?"selected":""}>${x.kind==="fixed"?"📌 ":"⏳ "}${esc(x.name)} (${x.picks||0} people)</option>`).join("")}
          </select>
        </label>
        <label class="at-sel" title="Pick a project folder (material, output, and context line up with the project)">
          <span class="tc-sel-lbl">📁 Workspace</span>
          <select class="control" id="tcWorkspaceSelect">
            <option value="">Global workspace (all projects)</option>
            ${(S.tasks||[]).map(t=>`<option value="${t.id}" ${t.id===curTask?"selected":""}>${esc(t.title)}${t.base_dir?(" · "+esc(outName(t.base_dir))):""}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="tc-top-acts">
        <span class="pill ${run?'ok':''}">${esc(orchestration?.phase || run?.phase || 'Lead scheduling · Team ready')}</span>${run?'<button class="btn ghost" id="tcStop">Stop</button>':''}
        ${orchestration?'<button class="btn" id="tcExecution">Tasks and output</button>':''}
        ${orchestration?.workflow?'<button class="btn" id="tcWorkflow">View workflow</button>':''}
        <button class="btn ghost" id="tcRefresh" title="Refresh status">Refresh</button>
        <button class="btn ghost" id="tcConfig" title="Manage teams and experts in settings">⚙️ Team settings</button>
      </div>
    </div>

    <!-- strip showing expert members and the current handoff -->
    <div class="tc-members-strip">
      <span class="tc-strip-lbl">Expert members: </span>
      ${leader ? `<span class="tc-member-pill leader" title="Team coordinator Leader"><span class="tc-av-mini">🧭</span><b>${esc(leader.name)}</b><span class="tc-pill-sub">${esc(OFFICE_CN[leader.status]||leader.status)}</span></span>` : ""}
      ${picks.map(x => {
        const now = x.status === "running";
        const done = spoken.has(x.name);
        return `<span class="tc-member-pill ${now ? "now" : (done ? "done" : "")}" style="--mc:${tcColor(x.color)}" title="${esc(x.name)} · ${esc(x.model || "Follow settings")}">
          <span class="tc-av-mini" style="background:var(--mc)">${esc((x.name||"?").slice(0,1))}</span>
          <b>${esc(x.name)}</b>
          <span class="tc-pill-sub">${esc(OFFICE_CN[x.status]||x.status)}</span>
        </span>`;
      }).join("")}
      ${!picks.length ? `<span class="hint" style="margin:0 4px">This team has no experts yet; use the button at the top right⚙️ team settings” to add expert members</span>` : ""}
      ${orchestration ? `<span class="tc-strip-phase">Members running ${orchestration.counts.running||0} · Delivered ${orchestration.counts.delivered||0} / ${orchestration.children.length}</span>` : ''}
    </div>

    <!-- main chat area: full width, no sidebar -->
    <section class="tc-panel tc-chat-main tc-chat-full">
      <div class="tc-tl" id="tcChat">
        ${tr.length ? tr.map(bubble).join("")
          : `<div class="tc-empty">Team collaboration is ready.<br>Enter a research goal; the lead splits it, runs experts in parallel for search and analysis, then gathers the evidence and output.<br><small class="hint">up to per team ${coordination.max_parallel||3} member tasks run at once, and the final output is reviewed per the project mode. Adjust members and models under team settings.</small></div>`}
      </div>
      <details class="usage-card"><summary>Team messaging and delivery · ${(D.communications||[]).length} items</summary>${(D.communications||[]).map(item=>`<article><small>${esc(item.at||"")} · ${esc(item.sender||item.kind||"")}</small><pre style="white-space:pre-wrap">${esc(item.text||"")}</pre></article>`).join("")||"No messages yet"}</details>
      ${orchestration?.children.length?`<details class="usage-card" open><summary>Expert tasks and handover · ${orchestration.children.length} items</summary>${orchestration.children.map(child=>`<article><span>${esc(child.title)} · ${esc(OFFICE_CN[child.status]||({ready:'Waiting on dependencies',delivered:'Delivered',cancelled:'Stopped',interrupted:'Interrupted'})[child.status]||child.status)}</span> <button class="btn ghost" data-tc-task="${esc(child.id)}">View tasks and evidence</button></article>`).join('')}</details>`:''}
      ${orchestration?.handoffs?.length?`<details class="usage-card"><summary>Agent Handover of control · ${orchestration.handoffs.length} runs</summary>${orchestration.handoffs.map(item=>`<article><span>${esc(item.source_member_id)} → ${esc(item.target_member_id)} · ${esc(item.status)}</span><pre style="white-space:pre-wrap">${esc(item.reason||"")}</pre></article>`).join("")}</details>`:""}
      <div class="tc-composer">
        <textarea class="control" id="tcSay" data-draft-key="${esc(draftKey)}" rows="3" placeholder="Give the team a goal or ask a follow-up... (Enter to send,Shift+Enter newline)">${esc(savedDraft)}</textarea>
        <div class="tc-composer-actions">
          <span class="hint">${run ? 'A task is running; you can edit the next goal now and send it once this one finishes or stops' : 'Enter Send / Shift+Enter newline · The lead splits, experts work in parallel, results are gathered'}</span>
          <button class="btn btn-primary" id="tcSend">${run ? 'A task is running' : 'Send and let the team proceed'}</button>
        </div>
      </div>
    </section>
  </div>
  </div>`;
  const box = $("tcChat"); if(box) box.scrollTop = box.scrollHeight;
  const ts = $("tcTeamSelect");
  if(ts) ts.onchange = (e)=>{
    teamScope = e.target.value;
    localStorage.setItem("rw-team-chat", teamScope);
    teamData = null; render();
  };
  const ws = $("tcWorkspaceSelect");
  if(ws) ws.onchange = (e)=>{
    curTask = e.target.value || null;
    if(curTask) localStorage.setItem("rw-task", curTask);
    else localStorage.removeItem("rw-task");
    render();
  };
  const ns = $("tcNewSession");
  if(ns) ns.onclick = async ()=>{
    try {
      await api("/api/team/chat/session", {scope: teamScope, create: true});
    } catch(err) {
      try { await api("/api/agent-settings/team-session", {team_id: teamScope, create: true}); } catch(e2) { uiNotify(e2.message); }
    }
    teamData = null; render();
  };
  m.querySelectorAll("[data-tc-sess]").forEach(b => b.onclick = async ()=>{
    const sid = b.dataset.tcSess;
    try {
      await api("/api/team/chat/session", {scope: teamScope, session_id: sid});
    } catch(err) {
      try { await api("/api/agent-settings/team-session", {team_id: teamScope, session_id: sid}); } catch(e2) { uiNotify(e2.message); }
    }
    teamData = null; render();
  });
  ConversationHistory.mount(m.querySelector('.tc-hist-list'),{kind:'team',teamId:teamScope,selected:()=>curSess.id,onSelect:async id=>{await api('/api/agent-settings/team-session',{team_id:teamScope,session_id:id});teamData=null;render();},onChanged:()=>{teamData=null;render();}});
  const cfg = $("tcConfig");
  if(cfg) cfg.onclick = ()=>{
    window.__teamMode = "manage";
    render();
  };
  const st = $("tcStop");
  if(st) st.onclick = async ()=>{ try{ await api("/api/team/chat/stop", {scope:teamScope}); }catch(e){ uiNotify(e.message); } setTimeout(()=>{ teamData=null; render(); }, 600); };
  const rf = $("tcRefresh"); if(rf) rf.onclick = ()=>{ teamData=null; render(); };
  if($('tcExecution'))$('tcExecution').onclick=()=>ProjectWorkspace.openTask(orchestration.task_id, D.team?.project_id||curTask);
  if($('tcWorkflow')&&orchestration.workflow.chat_id)$('tcWorkflow').onclick=()=>ProjectWorkspace.openConversation(orchestration.workflow.chat_id,D.team?.project_id||curTask);
  m.querySelectorAll('[data-tc-task]').forEach(button=>button.onclick=()=>ProjectWorkspace.openTask(button.dataset.tcTask,D.team?.project_id||curTask));
  const say = async ()=>{
    const t = $("tcSay"); const text = (t.value||"").trim();
    if(!text||run||teamSending.has(draftKey)) return;
    if(!leader) return uiNotify("Assign an owner in Team Config first.");
    const submitted=t.value;rememberTeamDraft(draftKey,submitted);teamSending.add(draftKey);$("tcSend").disabled=true;
    try{
      await api("/api/team/chat/say", {scope, text});
      if(teamDrafts.get(draftKey)===submitted)rememberTeamDraft(draftKey,'');
      if(route()==='team'&&teamScope===scope){teamData=null;render();}
    }catch(e){uiNotify("Send failed:"+e.message);}
    finally{teamSending.delete(draftKey);if($("tcSay")?.dataset.draftKey===draftKey&&$("tcSend"))$("tcSend").disabled=false;}
  };
  if($("tcSend")){$("tcSend").onclick = say;$("tcSend").disabled=!!run||teamSending.has(draftKey);}
  if($("tcSay"))$("tcSay").oninput=()=>rememberTeamDraft(draftKey,$("tcSay").value);
  if($("tcSay")) $("tcSay").onkeydown = (e)=>{ if(e.key==="Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && e.keyCode!==229 && !e.repeat){ e.preventDefault(); say(); } };
  clearTimeout(teamTick);                                   // poll every 2 s while a turn is running
  if(run) teamTick = setTimeout(()=>{ if(route()==="team"){ teamData=null; render(); } }, 2000);
}
function renderAssistants(m){
  const bound = asBound();
  if(asView === "edit"){
    const a = asCur(), ro = asEdit.source === "builtin";
    m.innerHTML = `<div class="page-head">
      <div><p class="inst-label">EXPERTS</p><h3>${a?"Edit expert":"New expert"}</h3>
        <p class="hint">${ro?"public experts are read-only -- Click copy to mine to make your own.":"The prompt and rules apply to chats this expert starts (when system). "}</p></div>
      <div class="ph-acts"><button class="btn" id="as-back">← Back</button>
        ${a&&!ro?`<button class="btn ghost" id="as-del" style="color:var(--err)">Delete</button>`:""}</div></div>
    <div class="card" style="margin-top:12px">
      <p class="inst-label">Identity</p>
      <div class="as-form">
        <label class="field"><span>Name</span><input class="control" id="as-name" ${ro?"disabled":""} value="${esc(asEdit.name)}" placeholder="e.g. literature search expert"></label>
        <label class="field"><span>Avatar Emoji</span><input class="control" id="as-av" ${ro?"disabled":""} value="${esc(asEdit.avatar)}" placeholder="👨‍🔬" maxlength="4"></label>
        <label class="field"><span>Description</span><input class="control" id="as-desc" ${ro?"disabled":""} value="${esc(asEdit.description)}" placeholder="One line on this expert’s strengths and duties"></label>
        <label class="field"><span>Default model (may be left blank = with the current model)</span>
          <select class="control" id="as-model" ${ro?"disabled":""}>
            <option value="">Follows the current model</option>
            ${(S.models||[]).map(mm=>`<option value="${mm.id}" ${mm.id===asEdit.model_id?"selected":""}>${esc(mm.name)}</option>`).join("")}</select></label>
      </div></div>
    <div class="card" style="margin-top:12px">
      <p class="inst-label">Prompt / Suggested questions (one per line; shown as buttons when empty)</p>
      <textarea class="control" id="as-prompts" rows="4" ${ro?"readonly":""} placeholder="Search O3 papers on doping modification of sodium-ion cathodes in the last three years">${esc((asEdit.prompts||[]).join("\n"))}</textarea>
      <p class="inst-label" style="margin-top:12px">rules (written into system, how the expert must work)</p>
      <textarea class="control" id="as-rules" rows="5" ${ro?"readonly":""} placeholder="Open-access search only; if the full text is not available it says so, never fabricates.">${esc(asEdit.rules||"")}</textarea>
    </div>
    ${ro?`<div style="margin-top:12px"><button class="btn" id="as-dup">Copy to mine</button></div>`
        :`<div style="margin-top:12px"><button class="btn btn-primary" id="as-save">Save</button></div>`}`;
    $("as-back").onclick = ()=>{ asView = "mine"; render(); };
    const dupBtn = $("as-dup");
    if(dupBtn) dupBtn.onclick = ()=> duplicateAssistant(a);
    const delBtn = $("as-del");
    if(delBtn) delBtn.onclick = ()=> deleteAssistant(a.id, a.name);
    const saveBtn = $("as-save");
    if(saveBtn) saveBtn.onclick = async ()=>{
      const body = { id: asEdit.id||"", name: $("as-name").value.trim() || "New expert",
        avatar: $("as-av").value.trim(), description: $("as-desc").value.trim(),
        model_id: $("as-model").value,
        prompts: $("as-prompts").value.split("\n").map(x=>x.trim()).filter(Boolean),
        rules: $("as-rules").value.trim() };
      let r;
      try{ r = await api("/api/assistant/save", body); }
      catch(e){ return uiNotify("Save failed:" + e.message); }
      await refreshState(false);
      asEdit.id = r.assistant.id;            // server assigns the id on create
      asView = "all"; render();
    };
    return;
  }
  const list = asOf(asView);
  const totalCount = (S.assistants||[]).length;
  const officialCount = asOf("official").length;
  const mineCount = asOf("mine").length;
  m.innerHTML = `<div class="page-head">
    <div><p class="inst-label">EXPERTS</p><h3>Expert</h3>
      <p class="hint">System and custom experts. Use the switch on a card to enable or disable it. Expert in this chat: <b>${esc(((S.assistants||[]).find(a=>a.id===bound)||{}).name || "Default research expert")}</b></p></div>
    <div class="ph-acts" style="display:flex;gap:8px;align-items:center">
      <button class="btn btn-sm" id="as-all-on" title="Enable every expert in this list">Enable all</button>
      <button class="btn btn-sm ghost" id="as-all-off" title="Disable every expert in this list">Disable all</button>
      <button class="btn btn-primary btn-sm" id="as-new">+ New expert</button>
    </div></div>
  <div class="at-tabs" style="margin-top:10px">
    <button class="at-tab ${asView==="all"?"on":""}" data-as-v="all">All experts ${totalCount}</button>
    <button class="at-tab ${asView==="official"?"on":""}" data-as-v="official">System experts ${officialCount}</button>
    <button class="at-tab ${asView==="mine"?"on":""}" data-as-v="mine">My experts ${mineCount}</button></div>
  <div class="as-grid">${list.length?list.map(asCard).join(""):`<p class="hint">This column is still empty.</p>`}</div>`;
  $("as-new").onclick = ()=>{ asEdit = {id:"",source:"user",name:"",avatar:"",description:"",rules:"",prompts:[],model_id:""}; asView="edit"; render(); };
  const btnAllOn = $("as-all-on"), btnAllOff = $("as-all-off");
  if(btnAllOn) btnAllOn.onclick = async ()=>{
    const targetIds = list.map(x=>x.id);
    if(!targetIds.length) return;
    try{
      await api("/api/assistant/batch-toggle", {ids: targetIds, enabled: 1});
      await refreshState(false);
      render();
    }catch(err){ uiNotify("Batch enable failed:" + err.message); }
  };
  if(btnAllOff) btnAllOff.onclick = async ()=>{
    const targetIds = list.map(x=>x.id);
    if(!targetIds.length) return;
    try{
      await api("/api/assistant/batch-toggle", {ids: targetIds, enabled: 0});
      await refreshState(false);
      render();
    }catch(err){ uiNotify("Bulk disable failed:" + err.message); }
  };
  m.querySelectorAll("[data-as-v]").forEach(b=>b.onclick=()=>{ asView=b.dataset.asV; render(); });
  m.querySelectorAll("[data-as-open]").forEach(b=>b.onclick=(e)=>{
    if(e.target.closest("[data-as-chat],[data-as-del],[data-as-dup],[data-as-toggle]")) return;
    const a = (S.assistants||[]).find(x=>x.id===b.dataset.asOpen); if(!a) return;
    asEdit = { id:a.id, source:a.source, name:a.name, avatar:a.avatar||"", description:a.description||"", rules:a.rules||"",
               prompts: JSON.parse(a.prompts||"[]"), model_id:a.model_id||"" };
    asView = "edit"; render();
  });
  m.querySelectorAll("[data-as-toggle]").forEach(b=>b.onclick=async (e)=>{
    e.stopPropagation();
    const aid = b.dataset.asToggle;
    const a = (S.assistants||[]).find(x=>x.id===aid);
    if(!a) return;
    const next = a.enabled === 0 ? 1 : 0;
    try{
      await api("/api/assistant/toggle", {id: aid, enabled: next});
      a.enabled = next;
      await refreshState(false);
      render();
    }catch(err){ uiNotify("Failed to change status:" + err.message); }
  });
  m.querySelectorAll("[data-as-chat]").forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); useAssistant(b.dataset.asChat); });
  m.querySelectorAll("[data-as-dup]").forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); duplicateAssistant((S.assistants||[]).find(x=>x.id===b.dataset.asDup)); });
  m.querySelectorAll("[data-as-del]").forEach(b=>b.onclick=(e)=>{
    e.stopPropagation(); const a=(S.assistants||[]).find(x=>x.id===b.dataset.asDel); deleteAssistant(b.dataset.asDel, a?a.name:""); });
}
async function duplicateAssistant(a){
  if(!a) return;
  const r = await api("/api/assistant/save", { name: a.name + " (mine)", avatar: a.avatar, description: a.description,
    rules: a.rules, prompts: JSON.parse(a.prompts||"[]"), model_id: a.model_id||"" });
  await refreshState(false);
  asEdit = { id:r.assistant.id, source:"user", name:r.assistant.name, avatar:r.assistant.avatar,
             description:r.assistant.description, rules:r.assistant.rules, prompts:JSON.parse(r.assistant.prompts||"[]"), model_id:r.assistant.model_id||"" };
  asView = "mine"; render();          // back to the list: the new card is there, click it to edit
}
async function deleteAssistant(id, name){
  const a = (S.assistants||[]).find(x=>x.id===id);
  if(a && a.source === "builtin") return uiNotify("Public experts cannot be deleted - use Copy as mine and edit that.");
  if(!await uiConfirm(`Delete expert "${name}"? (Conversations already using it are unaffected)`)) return;
  try{ await api("/api/assistant/delete", {id}); }catch(e){ return uiNotify("Delete failed:" + e.message); }
  await refreshState(false); asView = "mine"; render();
}
async function useAssistant(id, title = ""){           // Each use opens a new chat (never reusing this one) and switches to Agent pages
  const a = (S.assistants||[]).find(x=>x.id===id);
  if(a && a.enabled === 0){
    try{ await api("/api/assistant/toggle", {id, enabled: 1}); a.enabled = 1; }catch(_){}
  }
  const r = await api("/api/chat/create", {title});
  const cid = r.id || (r.chat && r.chat.id);
  try{ await api("/api/chat/assistant", {id: cid, assistant_id: id}); }catch(e){ return uiNotify("Bind failed:" + e.message); }
  curChat = cid; localStorage.setItem("rw-chat", cid);
  await refreshState(false); openTab("agent");
}

let agentView = "conversation";         // chat | trace
const ahSel = new Set();                // ids of chats checked in history
const outName = (p)=> (p||"").replace(/[\\/]+$/,"").split(/[\\/]/).pop() || "Default (workspace out)";
const assistantKey = ()=> localStorage.getItem("rw-assist") || "researcher";
const emptyState = (icon,title,text)=>`<div class="at-empty"><div class="at-empty-ico">${icon}</div><h2>${title}</h2><p>${text}</p></div>`;

function historyGroups(pool){
  const g = {"Today":[],"Yesterday":[],"Earlier":[]};
  const list = pool || S.chats || [];
  for(const t of list){
    const d = new Date(t.updated_at || t.created_at || ""); const n = new Date();
    const dist = Math.floor((Date.UTC(n.getFullYear(),n.getMonth(),n.getDate()) - Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);
    (isNaN(dist) ? g["Earlier"] : g[dist<=0?"Today":dist===1?"Yesterday":"Earlier"]).push(t);
  }
  return g;
}
function fmtAgo(iso){                        // relative time in the subtitle, full time in the title attribute
  if(!iso) return "";
  const d = new Date(iso); if(isNaN(d.getTime())) return "";
  const s = (Date.now() - d.getTime()) / 1000;
  const hm = x => String(x.getHours()).padStart(2,"0") + ":" + String(x.getMinutes()).padStart(2,"0");
  if(s < 60) return "Just now";
  if(s < 3600) return Math.floor(s / 60) + "min ago";
  if(s < 86400) return Math.floor(s / 3600) + "hours ago";
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  if(d.toDateString() === yd.toDateString()) return "Yesterday " + hm(d);
  if(s < 86400 * 7) return Math.floor(s / 86400) + " days ago";
  return fmtDate(iso).slice(0, 10);
}
function projName(id){ return ((S.tasks||[]).find(x=>x.id===id)||{}).title || ""; }
let ahCollapsed = localStorage.getItem("rw-ah-collapsed") === "true";

function renderHistory(){
  if(ahCollapsed){
    return `<aside class="ah collapsed" aria-label="Chat history">
      <button class="ah-expand-btn" id="ah-expand" title="Expand chat history">
        <span>▶</span>
        <span class="ah-expand-txt">Chat history</span>
      </button>
    </aside>`;
  }
  const all = (S.chats||[]).slice();
  const groups = historyGroups(all);
  const byBorn = [...all].sort((a, b)=> String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const av = (t)=>{                                          // bound expert → its avatar; otherwise the assistant poses in creation order
    const a = (S.assistants||[]).find(x=>x.id === (t.assistant_id||""));
    if(a) return `<span class="ah-av ah-av-emoji" title="${esc(a.name)}">${esc(a.avatar||"👨‍🔬")}</span>`;
    const i = Math.max(0, byBorn.findIndex(c=>c.id === t.id));
    return `<span class="ah-av"><img src="${AH_AV[i % AH_AV.length]}" alt="" loading="lazy"
      onerror="this.src='${Q_AV}'"></span>`;                 // Fall back to the main avatar if the file is missing
  };
  const item = (t)=>`<div class="ah-item-wrap ${t.id===curChat?"on":""}" title="${esc(outName(t.out_dir))} · ${esc(fmtDate(t.updated_at))}">
      <label class="ah-check" title="Select"><input type="checkbox" data-sel="${t.id}" ${ahSel.has(t.id)?"checked":""}></label>
      <button class="ah-item" data-open="${t.id}">
        ${av(t)}
        <span class="ah-copy"><strong>${esc(t.title)}</strong>
          <span>${t.task_id?`<em class="ah-pill">${esc(projName(t.task_id)||"Project")}</em>`:""}<i>${esc(fmtAgo(t.updated_at))}</i></span></span></button>
      <button class="ah-del" data-del="${t.id}" title="Delete chat">🗑</button></div>`;
  const list = Object.entries(groups).map(([k,v])=> v.length
      ? `<div class="ah-group"><p class="ah-group-label">${k}<span class="ln"></span><i>${v.length}</i></p>${v.map(item).join("")}</div>` : "").join("");
  return `<aside class="ah" aria-label="Chat history">
    <div class="ah-head"><div><p class="eyebrow">WORKSPACE</p><h2>Chat</h2></div>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="ah-new" id="ah-new" title="New chat">+</button>
        <button class="ah-collapse" id="ah-collapse" title="Collapse the chat list">◀</button>
      </div></div>
    <div class="ah-list">
      <div class="ah-bar"><label><input type="checkbox" id="ah-all" ${ahSel.size&&ahSel.size===(S.chats||[]).length?"checked":""}>Select all ${all.length} chats</label>
        <button class="ah-del-sel" id="ah-del-sel" ${ahSel.size?"":"disabled"}>Delete selected ${ahSel.size}</button></div>
      ${list || `<p class="hint" style="margin:14px 5px">No chats yet; use the top right + create one.</p>`}</div>
    <div class="ah-foot">🕒 One chat, one memory · Each keeps its own output folder</div></aside>`;
}

function asEmpty(){                       // Empty state: no expert bound = Assistant Q placeholder centred; once bound = Expert avatar
  const a = (S.assistants||[]).find(x=>x.id === (((S.chats||[]).find(c=>c.id===curChat)||{}).assistant_id||"")) || null;
  const project = ((S.chats||[]).find(c=>c.id===curChat)||{}).task_id;
  let ps = []; try{ ps = JSON.parse((a&&a.prompts)||"[]"); }catch(e){ ps = []; }
  const chips = document.getElementById("msgs");
  const face = faceOf(a, 72);          // unbound experts keep the same 72px box, no enlargement
  return `<div class="at-empty-wrap" style="display:flex;flex-direction:column;align-items:center;gap:20px;padding:0 24px;text-align:center;max-width:560px;margin:auto">
    ${face}
    <div style="display:flex;flex-direction:column;gap:6px">
      <span style="font-size:16px;font-weight:600">${esc(a?a.name:"Assistant")}</span>
      <span style="font-size:13px;color:var(--muted)">${esc(project ? `Bound to ”${projName(project)||"Project"}"· Uses that project’s material and memory; output is saved in the project folder.` : (a&&a.description ? a.description : "Global research hub · No project bound; governs global modules and the expert team, and can set up and orchestrate projects from natural language."))}</span></div>
    ${!project && (!a || a.id === "builtin-steward") ? `
      <div class="steward-hub-card" style="text-align:left;width:100%;margin-top:6px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:20px;">⚡</span>
          <div>
            <strong style="font-size:13px;color:var(--fg);">Global research hub · Set up projects from natural language and steer every module</strong>
            <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">With no project bound at the top, state a research idea and the assistant creates the project, assembles a team, and starts LangGraph Status graph: </p>
          </div>
        </div>
        <div class="steward-hub-chips" style="margin-top:10px;">
          <div class="steward-hub-chip" data-chip="Topic: interface transport in all-solid-state lithium batteries (assembles a team and starts the proposal flow)">
            <strong>🔬 all-solid-state battery proposal</strong>
            <span>Set up a project in plain language + Team assembly + Start StateGraph</span>
          </div>
          <div class="steward-hub-chip" data-chip="Topic: long-context reasoning in large language models (read the latest work and write a comparative review)">
            <strong>📚 reading on LLM inference acceleration</strong>
            <span>Close reading + Evidence extraction + Comparative review graph</span>
          </div>
          <div class="steward-hub-chip" data-chip="Topic: degradation mechanisms in perovskite solar cells (weekly tracking plus manual review)">
            <strong>⏰ Perovskite degradation tracking</strong>
            <span>Automated tracking + Manual review checkpoint</span>
          </div>
        </div>
      </div>` : ''}
    ${ps.length?`<div class="as-chips">${ps.map(p=>`<button class="as-chip" data-chip="${esc(p)}">${esc(p)}</button>`).join("")}</div>`:""}</div>`;
}
function bindChips(){
  document.querySelectorAll("[data-chip]").forEach(b=>b.onclick=()=>{
    const t=$("ask"); if(!t) return; t.value = b.dataset.chip; t.focus();
    if(typeof grow === "function") grow();
  });
}
function renderAgent(m){
  m.style.padding = "10px";
  const cur = (S.chats||[]).find(t=>t.id===curChat);
  const boundA = (S.assistants||[]).find(a=>a.id === ((cur&&cur.assistant_id)||"")) || null;
  const recs = (S.chatEvents||[]).length;
  m.innerHTML = `<div class="agent${ahCollapsed ? " ah-collapsed" : ""}">
    ${renderHistory()}
    <section class="at" aria-label="Chat thread">
      <header class="at-head">
        <div class="at-heading"><span class="at-idwrap" id="at-who" title="The expert bound to this chat (manage on the experts page)">${faceOf(boundA, 32)}</span>
          <div><h1 id="at-title" class="at-title" title="Click to rename">${esc(cur?cur.title:"Hi, What is planned today?")}</h1>
          <p id="at-sub">${atSubHTML(cur)}</p></div></div>
        <button class="at-profile" id="at-profile" title="Manage model providers">
          <span>⚙</span><b>${esc(S.active? (S.active.name+" · "+S.active.model) : "No model selected")}</b><em>Model settings</em></button>
      </header>
      <div class="at-tabs">
        <button class="at-tab ${agentView==="conversation"?"on":""}" data-v="conversation">Chat</button>
        <button class="at-tab ${agentView==="trajectory"?"on":""}" data-v="trajectory">Trace ${recs}</button></div>
      <div class="at-msgs" id="msgs" role="log" aria-label="Messages in this chat"></div>
      <div class="at-dock">
        <div class="at-panel" id="at-panel">
          <div class="st-box st-counts">
            <div class="st-row"><span>Turns</span><b id="st-turns">0</b></div>
            <div class="st-row"><span>Tool calls</span><b id="st-calls">0</b></div>
            <div class="st-row"><span>Used token</span><b id="st-tok">0</b></div>
          </div>
          <div class="st-box"><p>Tool name</p><div class="st-log" id="st-tools"></div></div>
          <div class="st-box"><p>Output folder</p><div class="st-log" id="st-outs"></div></div>
        </div>
        <div class="atts" id="atts"></div>
        <div class="composer" id="composer">
          <textarea id="ask" rows="1" placeholder="Send a message to ${esc(boundA?boundA.name:"Assistant")}... (Enter to send, Shift+Enter for a newline)"></textarea>
          ${AgentRuntime.markup('at',cur||{},'modpick')}
          <div class="at-tools">
            <div class="at-tools-l">
              <div class="plus-wrap">
                <button class="icon-btn" id="plus" title="Add context" aria-label="Add context">+</button>
                <div class="att-menu" id="attmenu" style="display:none">
                  <div class="lbl">Attach</div>
                  <button data-a="files">📄 File...</button>
                  <button data-a="folder">📁 Folder...</button>
                  <button data-a="images">🖼 Image...</button>
                  <button data-a="paste">📋 Paste image</button>
                  <button data-a="url">🔗 URL...</button>
                  <div class="sep"></div>
                  <div class="tip">Tip: dropping a file on the composer also attaches it.</div>
                </div>
              </div>
              <label class="at-sel" title="Pick an added project; once bound, file work and output stay in its folder">🧭<select id="projbind" aria-label="Choose an existing project">
                <option value="">Choose an existing project (none bound)</option>
                ${(S.tasks||[]).map(t=>`<option value="${t.id}" ${cur&&cur.task_id===t.id?"selected":""}>${esc(t.title)}</option>`).join("")}</select></label>
               <button class="at-sel at-outbtn" id="outpick" ${cur&&cur.task_id?"disabled":""} title="${cur&&cur.task_id?"Once a project is bound, writes stay in its folder":"Choose this chat’s outputFolder"}">📁
                 <span id="outdir-txt">${cur&&cur.task_id?"Project folder / the rest":esc(cur?outName(cur.out_dir):"Default output folder")}</span></button>

            </div>
            <div class="at-tools-r">
              <label class="at-sel" title="Which expert runs this chat (add, edit, remove on the experts page)">${boundA?esc(boundA.avatar||"👨‍🔬"):`<img src="${Q_AV}" alt="" width="16" height="16" style="object-fit:contain;vertical-align:-3px">`}<select id="assist">
                <option value="">Assistant${cur&&cur.task_id?" (Current project)":" (global)"}</option>
                ${(S.assistants||[]).filter(a=>a.enabled!==0 && a.id!=="builtin-steward").map(a=>`<option value="${a.id}" ${cur&&cur.assistant_id===a.id?"selected":""}>${esc(a.name)}</option>`).join("")}</select></label>
               <button class="send-btn" id="send" title="to send; click to interrupt while running" aria-label="Send">↑</button>
            </div>
          </div>
          <input type="file" id="filepick" multiple style="display:none">
        </div>
          ${cur&&cur.task_id?`<p class="at-hint at-project-scope" title="${esc(((S.tasks||[]).find(t=>t.id===cur.task_id)||{}).base_dir||"")}">📁 Current project: ${esc(projName(cur.task_id)||"Project")} · Files and output stay in the project folder · Zotero Attachments are copied then processed</p>`:""}
          <p class="at-hint">Enter Send · Shift + Enter newline · ↑↓ Browse input history · while running, click ■ or press Esc Interrupt</p>
      </div>
    </section></div>`;
  const tEl = $("at-title");
  if(tEl && cur) tEl.onclick = ()=>{          // click the title to rename in place
    const inp = document.createElement("input");
    inp.className = "control"; inp.value = cur.title; inp.style.cssText = "font-size:16px;font-weight:700;max-width:320px";
    tEl.replaceWith(inp); inp.focus(); inp.select();
    const commit = async ()=>{
      const v = (inp.value||"").trim();
      if(v && v !== cur.title){
        try{ await api("/api/chat/rename", {id:cur.id, title:v}); }catch(e){ uiNotify("Rename failed: "+e.message); }
        await refreshState(false);
      }
      render();
    };
    inp.onblur = commit;
    inp.onkeydown = (e)=>{ if(e.key==="Enter"){ e.preventDefault(); commit(); } if(e.key==="Escape") render(); };
  };
  const whoEl = $("at-who"); if(whoEl) whoEl.onclick = ()=>openTab("assistants");
  // left panel
  m.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{ curChat=b.dataset.open; localStorage.setItem("rw-chat",curChat); render(); });
  m.querySelectorAll("[data-sel]").forEach(b=>b.onchange=()=>{ b.checked?ahSel.add(b.dataset.sel):ahSel.delete(b.dataset.sel); render(); });
  m.querySelectorAll("[data-del]").forEach(b=>b.onclick=async(e)=>{
    e.stopPropagation(); const t=(S.chats||[]).find(x=>x.id===b.dataset.del);
    if(!await uiConfirm(`Delete chat ”${t?t.title:""}”?this chat’s memory and messages are deleted too, and cannot be undone.`)) return;
    try{ await api("/api/chat/delete",{id:b.dataset.del}); }catch(err){ return uiNotify("Delete failed: "+err.message); }
    ahSel.delete(b.dataset.del);
    if(curChat===b.dataset.del){ curChat=null; localStorage.removeItem("rw-chat"); }
    await refreshState(false); render();
  });
  const colBtn = $("ah-collapse");
  if(colBtn) colBtn.onclick = () => {
    ahCollapsed = true;
    localStorage.setItem("rw-ah-collapsed", "true");
    render();
  };
  const expBtn = $("ah-expand");
  if(expBtn) expBtn.onclick = () => {
    ahCollapsed = false;
    localStorage.setItem("rw-ah-collapsed", "false");
    render();
  };
  if($("ah-new")) $("ah-new").onclick = async ()=>{
    const button=$("ah-new"),panel=document.querySelector('.at');button.disabled=true;
    panel.querySelectorAll('select,textarea,button').forEach(control=>control.disabled=true);
    try{const r = await api("/api/chat/create",{title:""});
      curChat = r.chat.id; localStorage.setItem("rw-chat",curChat);
      await refreshState(false);if(route()==='agent')render();
    }catch(error){uiNotify('Failed to create a chat: '+error.message);}
    finally{if(button.isConnected)button.disabled=false;if(panel.isConnected)panel.querySelectorAll('select,textarea,button').forEach(control=>control.disabled=false);}
  };
  const allBox = $("ah-all");
  if(allBox) allBox.onchange = ()=>{ ahSel.clear(); if(allBox.checked) (S.chats||[]).forEach(t=>ahSel.add(t.id)); render(); };
  const delSel = $("ah-del-sel");
  if(delSel) delSel.onclick = async ()=>{
    if(!await uiConfirm(`Delete the selected ${ahSel.size} chats? Their memory is deleted with them and cannot be undone.`)) return;
    for(const id of [...ahSel]){ try{ await api("/api/chat/delete",{id}); }catch(e){} if(curChat===id){ curChat=null; localStorage.removeItem("rw-chat"); } }
    ahSel.clear(); await refreshState(false); render();
  };
  // Right column header + view switch
  m.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{ agentView=b.dataset.v; renderAgent(m); });
  $("at-profile").onclick = ()=> openTab("settings");      // model config now lives in Settings
  $("outpick").onclick = async ()=>{                        // Empty dir = the server opens its native pickerFolder”
    if(!curChat) return uiNotify("Create a chat first");
    const btn=$("outpick"), txt=$("outdir-txt"), old=txt.textContent;
    btn.disabled=true; txt.textContent="selecting...";
    try{
      const r = await api("/api/chat/outdir",{id:curChat});
      if(r.cancelled){ txt.textContent = old; }
      else{
        S.chats = (S.chats||[]).map(c=> c.id===r.chat.id ? r.chat : c);
        txt.textContent = outName(r.chat.out_dir);
        await refreshState(false); paintStats(); render();
      }
    }catch(e){ txt.textContent = old; uiNotify("Folder selection failed: "+e.message); }
    btn.disabled=false;
  };
  for(const [id,key] of [['modpick','model_id'],['atReasoning','reasoning'],['atPermission','permission']])$(id).onchange=async event=>{
    const value=event.target.value;document.querySelectorAll('#atRuntime select').forEach(select=>select.disabled=true);
    try{if(!curChat){const result=await api('/api/chat/create',{});curChat=result.chat.id;localStorage.setItem('rw-chat',curChat);await refreshState(false);}
      const chatId=curChat;await AgentRuntime.save(chatId,key,value);if(route()==='agent'&&curChat===chatId)$('atRuntimeHint').textContent='Saved; applies from the next send';
    }catch(error){uiNotify('Failed to save chat settings: '+error.message);}
    finally{if(route()==='agent')document.querySelectorAll('#atRuntime select').forEach(select=>select.disabled=false);}
  };
     $("assist").onchange = async (e)=>{
       if(!curChat){ uiNotify("Create a chat before picking an expert."); return; }
       try{ await api("/api/chat/assistant", {id:curChat, assistant_id:e.target.value}); }catch(err){ return uiNotify("Binding failed: "+err.message); }
       await refreshState(false); render();
     };
  const pb = $("projbind");
  if(pb) pb.onchange = async ()=>{
    const projectId=pb.value;
    pb.disabled=true;
    try{
      if(!curChat){ const r = await api("/api/chat/create", {task_id:projectId}); curChat = r.id || (r.chat&&r.chat.id); localStorage.setItem("rw-chat", curChat); }
      else await api("/api/chat/bind", {id:curChat, task_id:projectId});
    }catch(e){ pb.value=cur?.task_id||""; uiNotify("Binding failed: "+e.message); return; }
    finally{ pb.disabled=!!activeAgentRun; }
    await refreshState(false); render();
  };
  // composer (ours: + menu / drop / paste / auto-grow)
   PromptUI.mount($("ask"),`chat:${curChat}`,cur?.task_id||'');
   $("send").onclick = ()=>activeAgentRun ? cancelAgentRun() : send();
   $("send").classList.toggle("stop", !!activeAgentRun);
   $("send").textContent = activeAgentRun ? "■" : "↑";
   if(pb) pb.disabled = !!activeAgentRun;
   $("ask").onkeydown = (e)=>{
     if(e.isComposing || e.keyCode===229 || e.repeat) return;
     if(e.key==="Escape" && activeAgentRun){ e.preventDefault(); e.stopPropagation(); cancelAgentRun(); return; }
     if(e.key==="Enter"&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();send();return;}
     if((e.key==="ArrowUp" || e.key==="ArrowDown") && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.isComposing){
       const ta=e.target, atEdge=e.key==="ArrowUp" ? ta.selectionStart===0 : ta.selectionStart===ta.value.length;
       if(!atEdge && agentHistoryIndex<0) return;
       const history=(S.chat||[]).filter(m=>m.role==="user").map(m=>m.content);
       if(!history.length) return;
       if(agentHistoryIndex<0) agentHistoryDraft=ta.value;
       agentHistoryIndex=e.key==="ArrowUp" ? Math.min(history.length-1,agentHistoryIndex+1) : Math.max(-1,agentHistoryIndex-1);
       ta.value=agentHistoryIndex<0 ? agentHistoryDraft : history[history.length-1-agentHistoryIndex];
       ta.setSelectionRange(ta.value.length,ta.value.length); grow(); e.preventDefault();
     }
   };
  $("ask").oninput = ()=>{ agentHistoryIndex=-1; agentHistoryDraft=""; grow(); };
  $("ask").onpaste = (e)=>{ const fs=[...(e.clipboardData?.files||[])]; if(fs.length){ e.preventDefault(); addFiles(fs); } };
  $("plus").onclick = (e)=>{ e.stopPropagation(); const mm=$("attmenu"); mm.style.display = mm.style.display==="none" ? "block" : "none"; };
  $("attmenu").querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>pick(b.dataset.a));
  $("filepick").onchange = (e)=>{ const fs=[...e.target.files]; e.target.value=""; addFiles(fs); };
  wireDrop($("composer"));
  ConversationHistory.mount(m.querySelector('.ah-list'),{selected:()=>curChat,onSelect:id=>{curChat=id;localStorage.setItem('rw-chat',id);render();},onChanged:()=>{
    if(curChat&&!(S.chats||[]).some(chat=>chat.id===curChat)){curChat=null;localStorage.removeItem('rw-chat');render();}
    else{const title=document.getElementById('at-title');if(title)title.textContent=curChatRow()?.title||'Assistant';}
  }});
  setAtts(); grow();
  if(!curChat){
    $("msgs").innerHTML = asEmpty(); bindChips();
    loadAgentMeta();
  } else {
    loadChat().then(maybeAskPermission);          // Ask for permission after the greeting renders (only once)
  }
}

/* first visit: ask once, allow all or ask every time; stored server-side */
async function maybeAskPermission(){
  if(((S.sec||{}).permission_mode)) return;
   await setPermissionMode("ask");
}
async function loadChat(){
  restoreAgentRun();
  const requestedChat = curChat;
  try{
    const {messages} = await api(`/api/chat?id=${encodeURIComponent(curChat)}`);
    if(curChat!==requestedChat) return;
    if(agentView==='trajectory'){renderTrajectory($('msgs'));loadAgentMeta();return;}
    if(activeAgentRun && activeAgentChat===curChat){
      const box=$("msgs");
      if(box){
        box.innerHTML="";
        const seenUsers=new Set(activeAgentBase.filter(item=>item.role==='user').map(item=>chatUserInputKey(item.content)).filter(Boolean));
        activeAgentBase.forEach(m=>{
          const events=Array.isArray(m.events)?m.events.filter(ev=>{
            if(ev.type!=='user')return true;
            const key=chatUserInputKey(ev.content);if(!key)return true;
            if(seenUsers.has(key))return false;
            seenUsers.add(key);return true;
          }):m.events;
          appendOne(box,{...m,events,type:m.role,replay:true,at:m.created_at});
        });
        activeAgentEvents.forEach(ev=>{const normalized=chatUserInputKey(ev.content);if(ev.type==='user'&&seenUsers.has(normalized))return;if(ev.type==='user'&&normalized)seenUsers.add(normalized);appendOne(box,ev);});
      }
      return;
    }
    S.chat = messages || [];
    S.chatEvents = S.chat.flatMap(m=> m.events || []);
    const tb = document.querySelector('[data-v="trajectory"]');
    if(tb) tb.textContent = `Trace ${S.chatEvents.length}`;
    const box=$("msgs"); if(!box) return;
    poseN = 0;                                              // the assistant posture restarts each chat turn
    if(agentView==="trajectory"){ renderTrajectory(box); }
    else if(!S.chat.length){
      box.innerHTML = asEmpty(); bindChips();
    } else {
      box.innerHTML="";
      const seenUsers=new Set();S.chat.forEach(m=>{
        const normalized=chatUserInputKey(m.content);if(m.role==='user'&&normalized&&seenUsers.has(normalized))return;if(m.role==='user'&&normalized)seenUsers.add(normalized);
        const events=Array.isArray(m.events)?m.events.filter(ev=>{
          if(ev.type!=='user')return true;
          const key=chatUserInputKey(ev.content);if(!key)return true;
          if(seenUsers.has(key))return false;
          seenUsers.add(key);return true;
        }):m.events;
        appendOne(box,{...m,events,type:m.role,replay:true,at:m.created_at});
      });
    }
    box.scrollTop = box.scrollHeight;
    loadAgentMeta();
  }catch(e){}
}
function renderTrajectory(box){
  box.classList.add('at-trajectory');const chat=(S.chats||[]).find(row=>row.id===curChat),id=curChat;
  WorkspaceTrajectory.mount(box,{chatId:id,projectId:chat?.task_id||'',live:()=>route()==='agent'&&curChat===id&&agentView==='trajectory'});
}
const chatActivityLabels = {
  chat_waiting: "Preparing context...",
  chat_reconnecting: "The chat connection dropped; reconnecting...",
  reasoning_start: "Waiting for the model...",
  reasoning_delta: "The model is thinking...",
  tool_call: "Running a tool...",
  tool_result: "Processing the tool result...",
};

function assistantSpeaker(box, event, fallback){
  const experts = S.assistants || [];
  const sender = event.sender || event.assistant_name || (event.type==='team' ? event.name : '') || '';
  const displayName = name => name.replace(/^\u52a9\u624b?$/, 'Expert');
  let id = event.assistant_id || '';
  let expert = id ? experts.find(item=>item.id===id) : null;
  if(!id && sender){
    expert = experts.find(item=>item.name===sender) || experts.find(item=>displayName(item.name)===displayName(sender));
  }
  if(!id && !sender && fallback) return fallback;
  if(!id && !sender){
    const chatId = box.closest('[data-chat-id]')?.dataset.chatId || (box.id==='msgs' ? curChat : '');
    id = (S.chats||[]).find(chat=>chat.id===chatId)?.assistant_id || 'builtin-steward';
    expert = experts.find(item=>item.id===id);
  }
  const name = displayName(sender || expert?.name || (id==='builtin-steward'?'Assistant':'Executing expert'));
  return {id:expert?.id || id, name, avatar:expert?.avatar || event.assistant_avatar || event.emoji || [...name][0]};
}

function speakerAvatar(who, className='msg-ava'){
  return `<span class="${className}" aria-hidden="true">${who.id==='builtin-steward'?`<img src="${Q_AV}" alt="">`:esc(who.avatar)}</span>`;
}

function updateChatActivity(box, type, who){
  let status = box.querySelector(".chat-activity");
  if(!status && type === "chat_waiting"){
    status = document.createElement("div");
    status.className = "chat-activity";
    status.setAttribute("role","status");
    status.innerHTML = '<span class="chat-activity-speaker"></span><span class="chat-activity-dots" aria-hidden="true"><i></i><i></i><i></i></span><span></span>';
  }
  if(!status) return;
  if(["done","error","cancelled"].includes(type)){ status.remove(); return; }
  if(["assistant_delta","assistant","team"].includes(type)){ status.hidden = true; return; }
  const label = chatActivityLabels[type];
  if(!label) return;
  if(who){
    const speaker = status.firstElementChild;
    const avatar = speakerAvatar(who);
    if(speaker.__avatar !== avatar){speaker.innerHTML=avatar;speaker.__avatar=avatar;}
    speaker.title=who.name;
  }
  const text = status.lastElementChild;
  if(text.textContent !== label) text.textContent = label;
  status.hidden = false;
  if(status !== box.lastElementChild) box.appendChild(status);
  box.scrollTop = box.scrollHeight;
}

function appendOne(box,ev,who){
  who = assistantSpeaker(box,ev,who);
  updateChatActivity(box,ev.type,who);
  if(ev.type === "chat_waiting") return;
  if(ev.type==='template_used'){PromptUI.event(box,ev);return;}
  if(ev.type.startsWith("reasoning_")){
    if(ev.type === "reasoning_start" && box.querySelector(".chat-activity")) return;
    let card=[...box.querySelectorAll(".reasoning-card")].find(n=>n.dataset.reasoningId===ev.id);
    if(ev.type==="reasoning_done" && !ev.content){ if(card) card.remove(); return; }
    if(!card){
      card=document.createElement("details"); card.className="reasoning-card";
      card.dataset.reasoningId=ev.id||"";
      card.innerHTML='<summary><span class="reasoning-icon">◌</span><span class="reasoning-label">Waiting for the model...</span><span class="disclosure-arrow">›</span></summary><div class="md reasoning-body"></div>';
      box.appendChild(card);
    }
    card.classList.toggle("running",ev.type!=="reasoning_done");
    card.__content=ev.type==="reasoning_delta" ? (card.__content||"")+(ev.content||"") : (ev.content||card.__content||"");
    card.querySelector(".reasoning-label").textContent=ev.type==="reasoning_done" ? `Reasoning summary · ${(Number(ev.duration_ms||0)/1000).toFixed(1)} s` : (card.__content?"Summarising the reasoning...":"Waiting for the model...");
    card.querySelector(".reasoning-body").innerHTML=md(card.__content);
    box.scrollTop=box.scrollHeight; return;
  }
  if(ev.type==="assistant_delta"){
    let row=[...box.querySelectorAll('.msg-assistant.streaming')].findLast(node=>ev.message_id?node.dataset.messageId===ev.message_id:node.dataset.subId===(ev.sub||''));
    if(!row){
      row=document.createElement("div"); row.className="msg-row msg-assistant streaming";
      row.dataset.messageId=ev.message_id||'';row.dataset.subId=ev.sub||'';
      row.innerHTML=`<div class="msg-meta">${speakerAvatar(who)}<strong>${esc(who.name)}</strong><span class="msg-chip">outputting...</span><button class="msg-copy" title="Copy reply">Copy</button></div><div class="md"></div>`;
      box.appendChild(row);
    }
    row.__content=(row.__content||"")+(ev.content||"");
    row.querySelector(".md").innerHTML=md(row.__content);
    row.querySelector(".msg-copy").onclick=()=>navigator.clipboard.writeText(row.__content||"");
    box.scrollTop=box.scrollHeight; return;
  }
  if(ev.replay && ev.type==="assistant" && (ev.events||[]).length){
    // the event stream already carries this reply's assistant text, so skip the outer row
    // old messages without an assistant event still render whole; nothing is lost.
    const before = box.querySelectorAll(".msg-row.msg-assistant").length;
    ev.events.forEach(e=>appendOne(box,e,who));
    if((ev.events||[]).some(e=>e.type==="assistant" && String(e.content||'').trim()===String(ev.content||'').trim()) && box.querySelectorAll(".msg-row.msg-assistant").length > before) return;
  }
  const el=document.createElement("div");
  if(ev.sub) el.style.marginLeft="14px";                 // indent subagent rows by one level
  if(ev.type==="user"){
    el.className="msg-row msg-user";
     el.innerHTML=`<div class="msg-meta"><span class="msg-ava">👤</span><strong>you</strong><time>${esc(ev.at?fmtDate(ev.at):clock())}</time><button class="msg-copy" title="Copy message">Copy</button></div><p>${esc(ev.content)}</p>`;
  }
  else if(ev.type==="assistant"){
    if(ev.message_id&&[...box.querySelectorAll('.msg-assistant:not(.streaming)')].some(node=>node.dataset.messageId===ev.message_id))return;
    const statusName={queued:'Queued',running:'Running',failed:'Failed',interrupted:'Interrupted, resumable',cancelled:'Stopped'}[ev.status]||'Done';
     const streaming=[...box.querySelectorAll('.msg-assistant.streaming')].findLast(node=>ev.message_id?node.dataset.messageId===ev.message_id:node.dataset.subId===(ev.sub||''));
     if(streaming) streaming.remove();
     el.className="msg-row msg-assistant";
      el.dataset.messageId=ev.message_id||'';el.dataset.subId=ev.sub||'';
     el.innerHTML=`<div class="msg-meta">${speakerAvatar(who)}<strong>${esc(who.name)}</strong>${ev.sub?`<span class="sub-tag">⤷ ${esc(ev.sub_title||"")}</span>`:""}<span class="msg-chip">${esc(statusName)}</span><button class="msg-copy" title="Copy reply">Copy</button></div><div class="md">${md(ev.content||"...")}</div>`;
  }
  else if(ev.type==="error"){ el.className="msg-err"; el.textContent="⚠ "+(ev.message||"Something went wrong"); }
  else if(ev.type==="team"){
    // multi-agent: one row = one agent turn, header reads "who → who"; role only picks colors (same as the team page), text labels come from the backend.
    el.className="team-blk"; el.dataset.role=ev.role||"";
    el.innerHTML=`<div class="team-hd">${speakerAvatar(who,'team-av')}<b>${esc(who.name)}</b>`
      + (ev.to?`<span class="team-to">→ ${esc(ev.to)}</span>`:"")
      + (ev.tag?`<span class="team-tag">${esc(ev.tag)}</span>`:"") + `</div>`
      + `<div class="team-bub md">${md(ev.content||"")}</div>`;
  }
  else if(ev.type==="sub"){
    if(ev.phase==="start"){
      el.className="sub-row"; el.id="sub-"+ev.sub;
      const roleLabel={literature:"Literature search",evidence:"Source verification",analysis:"Data analysis",review:"Independent review"}[ev.role]||"Independent subtask";
      el.innerHTML=`<span class="sub-ico">⤷</span><span class="sub-title">${esc(ev.sub_title||"Subtask")}</span>
        <span class="sub-note">${esc(roleLabel)} · Independent context</span><span class="sub-state">Running...</span>`;
      box.appendChild(el); box.scrollTop=box.scrollHeight; return;
    }
    const row=$("sub-"+ev.sub);
    if(row){
      row.classList.add(ev.ok===false?"bad":"done");
      const st=row.querySelector(".sub-state"); if(st) st.textContent=ev.ok===false?"Failed":"Done";
      const nt=row.querySelector(".sub-note"); if(nt) nt.textContent=ev.summary||" (summary sent)";
    }
    box.scrollTop=box.scrollHeight; return;
  }
  else if(ev.type==="tool_call"){
    const toolKey=[ev.id,ev.round,ev.sub].join(':');
    if(ev.id&&[...box.querySelectorAll('.tool-card')].some(node=>node.dataset.toolKey===toolKey&&!node.dataset.complete))return;
    el.className="tool-card"; el.id="tc"+(seq++); el.dataset.callId=ev.id||"";el.dataset.toolKey=toolKey;el.dataset.toolName=ev.name||'';el.dataset.round=String(ev.round??'');
    const inputContent=JSON.stringify(ev.args||{},null,2);
    el.innerHTML=`<details><summary><span class="disclosure-arrow">›</span><span class="tool-name">Tool calls · ${esc(ev.name)}</span>${ev.sub?`<span class="sub-tag">⤷ ${esc(ev.sub_title||"")}</span>`:""}
      <span class="tool-detail">calling...</span><span class="tool-dur">In progress</span></summary>
      <div class="tool-body"><div class="tool-blk-row"><span class="tool-blk">Input arguments</span><button type="button" class="tool-copy-btn" title="Copy the input">Copy</button></div><pre>${esc(inputContent)}</pre><div class="tool-output"></div></div></details>`;
    const copyIn=el.querySelector(".tool-copy-btn");
    if(copyIn) copyIn.onclick=e=>{e.stopPropagation();navigator.clipboard.writeText(inputContent).then(()=>{copyIn.textContent='Copied';setTimeout(()=>copyIn.textContent='Copy',1500);});};
    box.appendChild(el); box.scrollTop=box.scrollHeight; return;
  }
  else if(ev.type==="tool_result"){
    const cards=box.querySelectorAll(".tool-card");
    const card=[...cards].findLast(c=>(ev.id?c.dataset.callId===ev.id:c.dataset.toolName===ev.name)&&(ev.round==null||c.dataset.round===String(ev.round)));
    if(card){
      card.dataset.complete='true';card.classList.toggle("bad",ev.ok===false);
      const d=card.querySelector(".tool-detail"); if(d) d.textContent=ev.summary||"";
      const u=card.querySelector(".tool-dur"); if(u) u.textContent=(ev.ok?"Done":"Failed")+(ev.duration_ms!=null?' · '+(ev.duration_ms/1000).toFixed(1)+' s':'');
      const b=card.querySelector(".tool-output");
      const outputContent=ev.result==null?ev.summary||'':typeof ev.result==='string'?ev.result:JSON.stringify(ev.result,null,2);
      if(b){
        b.innerHTML=`<div class="tool-blk-row"><span class="tool-blk">Results</span><button type="button" class="tool-copy-btn" title="Copy the result">Copy</button></div><pre>${esc(outputContent)}</pre>`;
        const copyOut=b.querySelector(".tool-copy-btn");
        if(copyOut) copyOut.onclick=e=>{e.stopPropagation();navigator.clipboard.writeText(outputContent).then(()=>{copyOut.textContent='Copied';setTimeout(()=>copyOut.textContent='Copy',1500);});};
      }
      if(ev.ok&&ev.navigation)WorkflowReview.mount(card,ev.navigation);
      if(ev.ok&&ev.name==='zotero_staged_import'&&ev.result?.plan_token&&ev.result.actions?.length&&!ev.result.conflicts?.length){
        const preview=ev.result;
        const button=document.createElement('button');button.type='button';button.className='btn ghost';
        button.textContent=`Check and save ${preview.actions.length} to Zotero`;
        button.onclick=async()=>{
          if(!await uiConfirm(`Save to ”${preview.collection_name}”?\n${preview.actions.map(row=>`${row.title} · ${row.kind==='create'?'New':row.add_collection?'Reuse and add to a category':'already in the category'}${row.pdf?' · PDF':''}`).join('\n')}`))return;
          button.disabled=true;
          try{
            const out=await api('/api/zotero/web/staged/apply',{task_id:preview.task_id,plan_token:preview.plan_token,confirm:true});
            button.textContent=`Saved ${out.applied.length} papers`;
            if(out.failed.length)uiNotify(out.failed.map(row=>row.error).join('; '));
          }catch(err){button.disabled=false;uiNotify(err.message);}
        };
        card.append(button);
      }
      if(ev.ok&&ev.name==='project_create_from_idea'&&ev.result?.workspace?.project_id){
        const button=document.createElement('button');button.type='button';button.className='btn ghost';button.dataset.stewardProject=ev.result.workspace.project_id;button.textContent='Open the project workspace ↗';
        button.onclick=async()=>{await refreshState(false);await ProjectWorkspace.openProject(button.dataset.stewardProject);await ProjectWorkspace.showResource('workflow');};
        card.append(button);
      }
    }
    box.scrollTop=box.scrollHeight; return;
  }
  else return;
  const copy=el.querySelector(".msg-copy");
  if(copy) copy.onclick=()=>navigator.clipboard.writeText(ev.content||"").then(()=>uiNotify("Copied"),()=>uiNotify("Copy failed"));
  box.appendChild(el); box.scrollTop=box.scrollHeight;
}
/* ---------------- attachments: one entry point for +, drop, paste ---------------- */
const atts = [];                                  // Pending attachments; kept across tab re-renders
const fmtSize = (n)=> !n ? "" : n>=1048576 ? (n/1048576).toFixed(1)+"MB" : Math.max(1,Math.round(n/1024))+"KB";

function setAtts(){
  const host=$("atts"); if(!host) return;
  host.innerHTML = atts.map((a,i)=>`<span class="att"><b>${esc(a.name)}</b><span>${a.url?"Link":a.paper_id?"In the library "+a.pages+" pages":fmtSize(a.size)}</span><span class="x" data-rm="${i}" title="Remove">✕</span></span>`).join("");
  host.querySelectorAll("[data-rm]").forEach(x=>x.onclick=()=>{ atts.splice(+x.dataset.rm,1); setAtts(); });
}

async function addFiles(files){
  if(!files || !files.length) return;
  for(const f of files){
    if(!curTask && /\.pdf$/i.test(f.name)){ uiNotify("Pick or create a project first -- PDF to enterCurrent projectlibrary,Agent can read it"); return; }
    try{
      const r = await fetch(`/api/upload?name=${encodeURIComponent(f.name)}&task_id=${encodeURIComponent(curTask||"")}`,
                            {method:"POST", headers:{"Content-Type":"application/octet-stream"}, body:f});
      const a = await r.json(); if(a.error) throw new Error(a.error);
      atts.push(a);
    }catch(e){ uiNotify("Attach failed: "+e.message); }
  }
  setAtts();
}

async function pick(mode){
  const mm=$("attmenu"); if(mm) mm.style.display="none";
  if(mode==="url"){
    const u = await uiPrompt("Links to attach (http / https): ");
    if(!u) return;
    if(!/^https?:\/\//i.test(u)) return uiNotify("accepts only http / https Link");
    atts.push({name:u.replace(/^https?:\/\//i,"").slice(0,60), url:u, size:0}); setAtts(); return;
  }
  if(mode==="paste") return void pasteImage();
  const inp=$("filepick"); if(!inp) return;
  inp.accept = mode==="images" ? "image/*" : "";
  if(mode==="folder") inp.setAttribute("webkitdirectory",""); else inp.removeAttribute("webkitdirectory");
  inp.click();
}

async function pasteImage(){
  try{
    const items = await navigator.clipboard.read(); const blobs = [];
    for(const it of items) for(const t of it.types) if(t.startsWith("image/"))
      blobs.push(new File([await it.getType(t)], `Paste image.${t.split("/")[1]}`, {type:t}));
    if(!blobs.length) return uiNotify("No image on the clipboard");
    await addFiles(blobs);
  }catch(e){ uiNotify("No clipboard access (the browser did not grant it) - paste into the field Ctrl+V Just paste an image"); }
}

function wireDrop(el){                            // see use-composer-drop: in and out counts + dropEffect=copy
  if(!el) return;
  let depth = 0;
  const has = (dt)=> !!dt && Array.from(dt.types||[]).includes("Files");
  el.ondragenter = (e)=>{ if(!has(e.dataTransfer)) return; e.preventDefault(); depth++; el.classList.add("drop-on"); };
  el.ondragover  = (e)=>{ if(!has(e.dataTransfer)) return; e.preventDefault(); e.dataTransfer.dropEffect="copy"; };
  el.ondragleave = (e)=>{ if(!has(e.dataTransfer)) return; e.preventDefault(); depth=Math.max(0,depth-1); if(!depth) el.classList.remove("drop-on"); };
  el.ondrop      = (e)=>{ if(!has(e.dataTransfer)) return; e.preventDefault(); depth=0; el.classList.remove("drop-on"); addFiles([...e.dataTransfer.files]); };
}

const TA_MIN = 42, TA_MAX = 200;                 // row height follows the composer textarea's padding and line height
let taMirror = null;
function measureAsk(ta){
  if(!taMirror){
    taMirror = document.createElement("textarea");
    taMirror.className = "ta-mirror"; taMirror.setAttribute("aria-hidden","true");
    taMirror.rows = 1;                             // no rows given: assume 2 by default
    document.body.appendChild(taMirror);
  }
  const cs = getComputedStyle(ta);
  taMirror.style.width = ta.clientWidth + "px";
  taMirror.style.font = cs.font;
  taMirror.style.lineHeight = cs.lineHeight;
  taMirror.style.padding = cs.padding;
  taMirror.style.letterSpacing = cs.letterSpacing;
  taMirror.style.whiteSpace = "pre-wrap";
  taMirror.style.wordBreak = cs.wordBreak;
  taMirror.value = ta.value;
  taMirror.style.height = "auto";
  return taMirror.scrollHeight;
}

function grow(){                                  // start at one row, grow only on real wrap
  const ta=$("ask"); if(!ta) return;
  ta.style.height = Math.min(TA_MAX, Math.max(TA_MIN, measureAsk(ta))) + "px";
}
addEventListener("resize", ()=>{ if($("ask")) grow(); });

document.addEventListener("click",(e)=>{          // close on outside click (listener registered once)
  const mm=$("attmenu");
  if(mm && mm.style.display!=="none" && !mm.contains(e.target) && e.target.id!=="plus") mm.style.display="none";
});

let activeAgentRun = "", activeAgentChat = "", activeAgentBase = [], activeAgentEvents = [];
let agentHistoryIndex = -1, agentHistoryDraft = "";

async function observeAgentRun(run, onEvent, remember, disconnected){
  let delay = 300;
  while(run.status === "running"){
    try{
      const res = run.runId
        ? await fetch(`/api/runs/${encodeURIComponent(run.runId)}/stream?after=${run.cursor}`)
        : await fetch(run.api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(run.request)});
      if(!res.ok || !res.body){
        if(res.status >= 400 && res.status < 500){
          run.status = "failed";
          const body = await res.json().catch(()=>({}));
          onEvent({type:"error",message:body.error || "This run request expired; start again."});
          break;
        }
        throw new Error("HTTP " + res.status);
      }
      const reader = res.body.getReader(), decoder = new TextDecoder();
      let buffer = "";
      try{
        while(run.status === "running"){
          const {value,done} = await reader.read(); if(done) break;
          buffer += decoder.decode(value,{stream:true}).replace(/\r\n/g,"\n");
          let i;
          while((i = buffer.indexOf("\n\n")) >= 0){
            const block = buffer.slice(0,i); buffer = buffer.slice(i+2);
            const line = block.split("\n").find(l=>l.startsWith("data: ")); if(!line) continue;
            const id = Number((block.split("\n").find(l=>l.startsWith("id: ")) || "id: 0").slice(4));
            if(id && id <= run.cursor) continue;
            const wire = JSON.parse(line.slice(6)), ev = wire.payload || wire;
            run.cursor = id || run.cursor;
            if(ev.type === "run_started"){
              run.runId = ev.run_id; remember(run); continue;
            }
            if(["done","error","cancelled"].includes(ev.type)) run.status = ev.type;
            onEvent(ev);
          }
        }
      }finally{ await reader.cancel().catch(()=>{}); }
      if(run.status === "running" && run.runId){
        const state = await api(`/api/runs/${encodeURIComponent(run.runId)}`);
        if(["done","failed","cancelled","interrupted"].includes(state.status)){
          run.status = state.status;
          if(state.status === "interrupted") onEvent({type:"error",message:"The task was interrupted; checkGeneratedthe output before continuing."});
        }
      }
      delay = 300;
    }catch(e){ if(disconnected) disconnected(e); }
    if(run.status === "running"){
      await new Promise(resolve=>setTimeout(resolve,delay)); delay = Math.min(delay*2,5000);
    }
  }
}

function rememberAgentRun(run){ localStorage.setItem("rw-agent-run",JSON.stringify(run)); }
function restoreAgentRun(){
  if(activeAgentRun) return;
  let run;
  try{ run = JSON.parse(localStorage.getItem("rw-agent-run") || "null"); }catch(e){}
  if(!run) return;
  activeAgentRun = run.key; activeAgentChat = run.request.task_id;
  activeAgentBase = run.base || [];
  activeAgentEvents = [{type:"user",content:run.request.message},{type:"chat_waiting"}];
  run.status = "running"; run.cursor = 0;
  followChatRun(run);
}
async function followChatRun(run){
  let error = "";
  rememberAgentRun(run);
  await observeAgentRun(run, ev=>{
    if(ev.type === "error") error = ev.message || "Failed";
    if(!["done","user"].includes(ev.type)){
      activeAgentEvents.push(ev);
      const box = route() === "agent" && agentView === "conversation" && curChat === activeAgentChat ? $("msgs") : null;
      if(box) appendOne(box,ev);
    }
    stEvent(ev);
  },rememberAgentRun,()=>{
    if($("send")) $("send").title = "Connection lost, reconnecting; press Esc Stop";
    if(route() === "agent" && agentView === "conversation" && curChat === activeAgentChat && $("msgs")){
      updateChatActivity($("msgs"),"chat_reconnecting");
    }
  });
  if(route() === "agent" && agentView === "conversation" && curChat === activeAgentChat && $("msgs")){
    updateChatActivity($("msgs"),"done");
  }
  localStorage.removeItem("rw-agent-run");
  activeAgentRun = ""; activeAgentEvents = []; activeAgentBase = [];
  const button = $("send");
  if(button){ button.classList.remove("stop"); button.textContent = "↑"; button.title = "Send"; }
  if($("projbind")) $("projbind").disabled = false;
  await refreshState(false);
  if(route() === "agent"){
    await loadChat();
    const persistedFailure=(S.chat||[]).some(message=>message.role==="assistant" &&
      (message.run_id===run.runId || ["failed","interrupted"].includes(message.status) ||
       (String(message.content||"").startsWith("\u6267\u884c\u5931\u8d25\uff1a") || String(message.content||"").startsWith("Execution failed:"))));
    if(error && !persistedFailure && agentView === "conversation" && curChat === run.request.task_id && $("msgs")){
      appendOne($("msgs"),{type:"error",message:error});
    }
  }
}
async function cancelAgentRun(){
  if(!activeAgentRun) return;
  const key=activeAgentRun;
  try{ await api("/api/agent/cancel",{idempotency_key:key}); }
  catch(e){ uiNotify("Interrupt failed: "+e.message); }
}
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && activeAgentRun && route()==="agent"){
  e.preventDefault(); cancelAgentRun();
} });
async function send(){
  if(activeAgentRun) return cancelAgentRun();
  if(!(await requireModelKey())) return;          // No key configured: prompt to open settings, do not send a request
  const ta=$("ask"); const text=ta.value.trim(); if(!text && !atts.length) return;
  // no chat (or the localStorage one was deleted): send straight away → auto-create an unbound chat, no blocking dialog
  if(!curChat || !(S.chats||[]).some(c=>c.id===curChat)){
    try{
      const r = await api("/api/chat/create", {title:""});
      curChat = r.chat.id; localStorage.setItem("rw-chat", curChat);
      await refreshState(false); render();        // swap the sidebar and header to this chat at once
    }catch(e){ return uiNotify("Failed to create a chat: " + e.message); }
  }
  const msg = atts.length ? (text?text+"\n\n":"") + "[Attachments]\n" + atts.map(a=> a.url ? `- ${a.url}`
      : `- ${a.name}${a.paper_id?` (In the library PDF, paper_id=${a.paper_id}, ${a.pages} pages)`:` (Local file: ${a.path})`}`).join("\n") : text;
   ta.value=""; grow(); atts.length=0; setAtts(); agentHistoryIndex=-1; agentHistoryDraft="";
  const box=$("msgs"); if(box.querySelector(".muted,.at-empty-wrap")) box.innerHTML="";
  activeAgentChat=curChat; activeAgentBase=[...(S.chat||[])];
  activeAgentEvents=[{type:"user",content:msg},{type:"chat_waiting"}];
  appendOne(box,{type:"user",content:msg});
  appendOne(box,{type:"chat_waiting"});
   const btn=$("send"); activeAgentRun=crypto.randomUUID(); btn.classList.add("stop"); btn.textContent="■";
  if($("projbind")) $("projbind").disabled=true;
  await followChatRun({key:activeAgentRun,api:"/api/agent",runId:"",cursor:0,status:"running",base:activeAgentBase,
    request:{task_id:curChat,message:msg,idempotency_key:activeAgentRun,template_ref:PromptUI.ref(`chat:${curChat}`,curChatRow()?.task_id)}});
}
/* stage: turns, tool calls, tokens, plus tool names and output folder */
const st = { turns:0, calls:0, tokBase:0, tok:0, tools:[], outs:[] };
const ST_KEEP = 40;                                  // how many rows to keep in the scroll window
function curChatRow(){ return (S.chats||[]).find(c=>c.id===curChat) || null; }
function stPaint(){
  const room = curChatRow();
  const folder = room ? (room.out_dir || "Default output folder (workspace out)") : "";
  const t=$("st-turns"), c=$("st-calls"), k=$("st-tok");
  if(t) t.textContent = st.turns;
  if(c) c.textContent = st.calls;
  if(k) k.textContent = (st.tokBase+st.tok).toLocaleString();
  const log=(id,rows,empty)=>{ const box=$(id); if(!box) return;
    box.innerHTML = rows.length ? rows.map(r=>`<div class="${r.k||""}" title="${esc(r.t)}">${esc(r.t)}</div>`).join("")
                                : `<div class="none" title="${esc(empty)}">${esc(empty)}</div>`;
    box.scrollTop = box.scrollHeight; };
  log("st-tools", st.tools.slice(-ST_KEEP).map(n=>({t:n})), "No tool calls yet");
  log("st-outs", st.outs.slice(-ST_KEEP), folder? "No output yet" : "No output yet");
}
function stReset(){ Object.assign(st,{turns:0,calls:0,tokBase:0,tok:0,tools:[],outs:[]}); }
function loadAgentMeta(){                            // Replay from a saved chat
  stReset();
  const evs = (S.chat||[]).flatMap(m=>m.events||[]);
  st.turns = (S.chat||[]).filter(m=>m.role==="user").length;
  st.calls = evs.filter(e=>e.type==="tool_call").length;
  st.tokBase = evs.filter(e=>e.type==="usage").reduce((n,e)=>n+(e.total||0),0);
  st.tools = evs.filter(e=>e.type==="tool_call").map(e=>e.name);
  st.outs = evs.filter(e=>e.type==="tool_result"&&e.path).map(e=>({t:e.path,k:"dir"}));
  const room = curChatRow();
  if(room && (room.out_dir||"").trim()) st.outs.unshift({t:room.out_dir, k:"dir"});   // keep the list on the first row
  if(room){                                            // Title changes after the first question; sync the header too
    const h=$("at-title"), s=$("at-sub");
    if(h) h.textContent = room.title;
    if(s) s.innerHTML = atSubHTML(room);
  }
  stPaint();
}
function stEvent(ev){                                // refresh live during SSE
  if(!ev || ev.type==="done") return;
  if(ev.type==="user") st.turns++;
  else if(ev.type==="usage") st.tok += ev.total || 0;   // each response carries usage that can be summed
  else if(ev.type==="tool_call"){ st.calls++; st.tools.push(ev.name); }
  else if(ev.type==="tool_result"){ if(ev.path) st.outs.push({t:ev.path,k:"dir"}); }
  else return;
  stPaint();
}
