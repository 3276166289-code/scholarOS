/* Project-owned discussions, task execution and document review share one surface. */
const ProjectWorkspace = (() => {
  "use strict";
  const labels={ready:"Executable",draft:"Ready",pending:"Not started",queued:"Queued",running:"Running",awaiting_review:"Awaiting manual review",succeeded:"Completed",delivered:"Delivered",blocked:"Waiting",failed:"Failed",interrupted:"Interrupted",cancelled:"Stopped",waiting:"Waiting for prior delivery"};
  const resources={catalog:'Unified library',manuscripts:'Paper manuscript',experiments:'Experiment log',outputs:'Delivered output',files:"File",papers:"Literature",notes:"Notes and results",tasks:"Tasks and automation",automation:"Automation",workflow:"LangGraph Workflow",plan:"Progress and plan",stars:"Paper star map",overview:"Project overview",search:"Search project files",'node-result':'Node output'};
  const surfaces={chat:'Target chat',library:'Unified library',workbench:'Artifact workbench',tasks:'Tasks and automation',flow:'LangGraph flow',overview:'Overview'};
  const resourceSurface={catalog:'library',manuscripts:'library',experiments:'library',outputs:'library',files:'library',papers:'library',notes:'library',stars:'library',search:'library',tasks:'tasks',automation:'tasks',plan:'tasks',workflow:'flow',overview:'overview','task-detail':'tasks','node-result':'workbench','run-artifacts':'workbench'};
  const states=new Map(), chats=new Map();
  resources['run-artifacts']='Output of this run';
  let mounted=null, intent=null, generation=0, navigation=0, timer=null, restored=false;
  const h=value=>esc(String(value??""));
  const messageKey=value=>String(value??'').replace(/\s+/g,' ').trim();
  const userInputKey=value=>{
    const normalized=messageKey(value);
    for(const marker of ['[materials explicitly cited by this project]','[@context]','[prompt template the user explicitly used:','[materials chosen by the user]','[context mentioned with @]']){
      const index=normalized.indexOf(marker);
      if(index>0)return normalized.slice(0,index).trim();
    }
    return normalized;
  };
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
  const root=()=>document.getElementById("projectWorkspace");
  const active=()=>route()==="workspace" && !!root();
  const live=state=>active() && mounted===state && curTask===state.id && root()?.dataset.projectId===state.id;
  const get=id=>{
    if(!states.has(id)){
      const saved=read("rw-workspace:"+id,{});if(saved.section==='tools')saved.section='workflow';if(saved.sections?.flow==='tools')saved.sections.flow='workflow';if(saved.surface==='workbench'&&saved.section==='files'){saved.surface='library';saved.section='files';saved.sections={...saved.sections,library:'files',workbench:'run-artifacts'};}
      const nodePeek=saved.surface==='chat'&&saved.section==='node-result'&&!!saved.nodeResultSelection&&saved.nodePeek===true;
      states.set(id,{id,chatId:saved.chatId||"",section:saved.section||"overview",surface:surfaces[saved.surface]?saved.surface:'chat',sections:{library:'catalog',tasks:'tasks',flow:'workflow',workbench:'run-artifacts',...saved.sections},peek:nodePeek,navOpen:false,inspection:null,mode:saved.mode||"supervised",modeTouched:!!saved.modeTouched,scope:saved.scope||"project",target:saved.target||"",reading:false,
        searchQuery:saved.searchQuery||"",navHidden:!!saved.navHidden,treeHidden:!!saved.treeHidden,drafts:read("rw-workspace-drafts:"+id,{}),fileDirectory:saved.fileDirectory||'',fileRow:saved.fileRow||null,libraryFile:saved.libraryFile||saved.fileRow||null,nodeResultSelection:saved.nodeResultSelection||null,artifactRunId:saved.artifactRunId||'',tasks:[],bindings:[],teams:[],targets:null,layout:null,project:null,review:null,filter:"",epoch:0,resourceEpoch:0,refreshing:false});
    }
    return states.get(id);
  };
  function persist(state){write("rw-workspace:"+state.id,{chatId:state.chatId,section:state.section,surface:state.surface,sections:state.sections,searchQuery:state.searchQuery,mode:state.mode,modeTouched:state.modeTouched,scope:state.scope,target:state.target,navHidden:state.navHidden,treeHidden:state.treeHidden,fileDirectory:state.fileDirectory,fileRow:state.fileRow,libraryFile:state.libraryFile,nodeResultSelection:state.nodeResultSelection,artifactRunId:state.artifactRunId,nodePeek:state.surface==='chat'&&state.section==='node-result'&&state.peek});write("rw-workspace-drafts:"+state.id,state.drafts);}
  function draft(state){const key=state.chatId||"new";return state.drafts[key]||(state.drafts[key]={text:"",refs:[]});}
  function currentChat(state){return (S.chats||[]).find(c=>c.id===state.chatId && c.task_id===state.id);}
  function chatRecord(id){if(!chats.has(id))chats.set(id,{messages:[],events:[],run:null,loaded:false,request:0});return chats.get(id);}
  function error(message,state=mounted){if(live(state)){const box=document.getElementById("pwError");if(box)box.textContent=message||"";}}
  function notice(message,state=mounted){if(live(state)){const box=document.getElementById("pwNotice");if(box)box.textContent=message||"";}}
  function hasSurface(kind){return active() && (mounted.surface!=='chat'||mounted.peek) && ((kind==="space"&&["papers","notes","plan","stars","overview"].includes(mounted.section)) || (kind==="workflow"&&["files","tools"].includes(mounted.section)));}
  function hasDirty(){
    if(!active())return false;
    if(typeof WorkflowNodeWorkbench!=='undefined'&&WorkflowNodeWorkbench.dirty())return true;
    if(window.ProjectWorkflowGraph?.dirty())return true;
    const file=typeof flCurrentFile!=="undefined"?flCurrentFile:null;
    if(file?.projectId===mounted.id && file.text!==file.originalText)return true;
    if(typeof mdProj!=="undefined"&&mdProj&&document.getElementById("mdSource")?.getClientRects().length){
      return !mdProj.read_only && (!!mdProj.savePromise || (mdProj.editVersion||0)!==(mdProj.savedVersion||0) || (!mdProj.path&&!!(document.getElementById('mdSource').value.trim()||document.getElementById('mdNoteTitle')?.value.trim())));
    }
    return false;
  }
  async function flush(){
    const state=mounted;if(!state || !root())return true;
    if(typeof WorkflowNodeWorkbench!=='undefined'&&!await WorkflowNodeWorkbench.flush()){error('Node output draft unsaved; your edits were kept.',state);return false;}
    if(window.ProjectWorkflowGraph&&!await ProjectWorkflowGraph.flush()){error('Node config is unsaved. Resolve the prompt before switching.',state);return false;}
    const ask=document.getElementById("pwAsk");if(ask){draft(state).text=ask.value;persist(state);}
    if(typeof flCurrentFile!=="undefined"&&flCurrentFile?.projectId===state.id){
      const editor=document.getElementById("flEditText");if(editor)flCurrentFile.text=editor.value;
      if(flCurrentFile.text!==flCurrentFile.originalText && !await flSaveCurrent()){error("Save failed; the current content is kept. Save successfully before switching.",state);return false;}
    }
    if(typeof mdProj!=="undefined"&&mdProj&&document.getElementById("mdSource")?.getClientRects().length){
      if(!await pnSaveCurrent()){error("Note save failed. The current note is kept. Retry the save before switching.",state);return false;}
    }
    return true;
  }
  async function leave(action){const token=++navigation;if(await flush()&&token===navigation)return action();}
  function requestRoute(value){
    if(value==="workflow")intent={section:"workflow"};
    else if(value==='workbench')intent={section:'run-artifacts'};
    else if(value==='tasks'||value==='automation')intent={section:value};
    else if(value==="notes")intent={section:"notes"};
    else if(value==="space")intent={section:typeof spTab!=="undefined"?spTab:"overview"};
  }
  function projectOptions(id){return (S.tasks||[]).map(p=>`<option value="${h(p.id)}" ${p.id===id?"selected":""}>${h(p.title)}</option>`).join("");}
  function icon(name){
    const paths={chat:'M4 4h16v11H9l-5 5V4Z',library:'M3 7h7l2-3h9v16H3V7Z',workbench:'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Zm0 4h20M8 11v8',tasks:'m4 6 2 2 4-4M13 6h7M4 13l2 2 4-4M13 13h7M4 20h16',flow:'M8 3h8v5H8V3ZM3 16h6v5H3v-5Zm12 0h6v5h-6v-5ZM12 8v4M6 16v-4h12v4',overview:'M4 4h16v6H4V4Zm0 8h7v8H4v-8Zm9 0h7v8h-7v-8Z',menu:'M4 6h16M4 12h16M4 18h16',back:'m10 5-7 7 7 7M3 12h18'};
    return `<svg class="pw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.library}"/></svg>`;
  }
  function shell(state){
    return `<section class="project-workspace" id="projectWorkspace" data-project-id="${h(state.id)}" data-surface="${state.surface}" aria-label="Project workspace">
      <header class="pw-top">
        <button type="button" class="pw-nav-toggle" id="pwToggleNav" aria-label="Project navigation" title="Expand or collapse the navigation for this view" aria-controls="pwProjectNav" aria-expanded="true">${icon('menu')}</button>
        <div class="pw-project-heading"><span>Project workspace</span><select class="control" id="pwProject" aria-label="Current project">${projectOptions(state.id)}</select></div>
        <span class="pw-spacer"></span><div class="pw-counts" aria-label="Project task status"><button type="button" data-pw-filter="running" id="pwRunning">Running 0</button><button type="button" data-pw-filter="review" id="pwPending">To confirm 0</button><button type="button" data-pw-filter="attention" id="pwFailed">Needs action 0</button></div>
        <button type="button" class="pw-project-manage pw-text-button" id="pwProjectCreate" title="New project" aria-label="New project">+<span>New project</span></button><details class="pw-settings" id="pwProjectSettings"><summary>Project settings</summary><div class="pw-settings-menu"><button type="button" id="pwProjectEdit">Edit project info</button><button type="button" data-pw-view="overview">Project overview</button><button type="button" id="pwRebuildAssets">Organise the material index</button><button type="button" id="pwBindings">Project executors and modes</button><button type="button" id="pwMembers">Teams and members</button><button type="button" id="pwExperts">Manage experts</button><label>New task mode<select class="control" id="pwMode" aria-label="Run mode for new tasks"><option value="supervised">Manual review</option><option value="full_access">Full access</option></select></label><p>Affects new tasks only; existing runs keep their mode.</p></div></details>
      </header>
      <nav class="pw-primary" role="tablist" aria-label="Project work view">${Object.entries(surfaces).map(([id,label])=>`<button type="button" role="tab" id="pwTab-${id}" data-pw-surface="${id}" aria-selected="${state.surface===id}" aria-controls="pwWorkArea" tabindex="${state.surface===id?'0':'-1'}">${icon(id)}<span>${label}</span></button>`).join('')}</nav>
      <div class="pw-notice" id="pwNotice" role="status" aria-live="polite"></div><div class="pw-error" id="pwError" role="alert"></div>
      <div class="pw-layout">
        <button type="button" id="pwNavShade" class="pw-nav-shade" aria-label="Close project navigation" hidden></button>
        <nav id="pwProjectNav" class="pw-sidebar" aria-label="Project view navigation">
          <div class="pw-nav-heading"><strong id="pwNavTitle">Project chats</strong><button type="button" id="pwNavClose" class="pw-text-button" aria-label="Collapse project navigation">×</button></div>
          <section data-pw-nav-group="chat" class="pw-nav-section"><button type="button" class="pw-new-chat" id="pwNewChat">+ New chat</button><div class="pw-sessions" id="pwSessions"></div></section>
          <section data-pw-nav-group="library" class="pw-nav-section"><form id="pwSearchForm" class="pw-search-form" role="search"><input type="search" class="control" id="pwSearchInput" aria-label="SearchCurrent projectMaterial" placeholder="Search literature, notes, and progress..."><button type="submit" class="pw-text-button">Search</button></form><button type="button" class="btn ghost" id="pwUploadFile">Upload a file (or drop it in)</button><div class="pw-resource-links"><button type="button" data-pw-view="catalog">All material</button><button type="button" data-pw-view="files">Folders and files</button><button type="button" data-pw-view="papers" title="Literature (PDF)">Literature (PDF)</button><button type="button" data-pw-view="notes" title="Reading notes (Markdown)">Research notes (Markdown)</button><button type="button" data-pw-view="stars" title="Literature knowledge star map">Paper star map</button></div></section>
          <div id="pwSidebarTreeSlot"><div class="pw-file-tree" id="pwFileTree"></div></div>



          <div class="pw-nav-project" id="pwNavProject">Current projectinternal collaboration</div>
        </nav>
        <section class="pw-main" id="pwWorkArea" role="tabpanel" aria-labelledby="pwTab-${state.surface}">
          <section class="pw-chat" aria-label="Project AI Chat"><header class="pw-chat-head"><div><span class="pw-eyebrow">Project chats</span><strong id="pwChatTitle">${h(currentChat(state)?.title||'New topic discussion')}</strong></div><span class="pw-spacer"></span><button type="button" class="pw-text-button" id="pwRenameChat">Rename</button><button type="button" class="btn ghost" id="pwTopLanggraph" title="View or start LangGraph Research graph flow and manual review">⚡ LangGraph Graph</button><button type="button" class="btn ghost" id="pwCreateTask">New task</button><button type="button" class="btn ghost" id="pwShowDoc">Browse material</button></header><nav class="pw-conversation-tabs" role="tablist" aria-label="How chats are shown"><button type="button" role="tab" id="pwChatView" data-pw-chat-view="chat" aria-controls="pwMessages">Chat</button><button type="button" role="tab" id="pwTraceView" data-pw-chat-view="trajectory" aria-controls="pwTrajectory">Execution trace</button></nav><div id="pwMessages" class="pw-discussion" role="log" aria-label="Current projectChat"></div><section class="workspace-trajectory" id="pwTrajectory" aria-label="This chat’s execution trace" hidden></section>
            <div class="pw-compose composer"><div class="pw-context-bar" id="pwRefs"></div><textarea id="pwAsk" rows="3" aria-label="Give the project experts a goal" placeholder="Describe the goal, or @ Project experts and teams..."></textarea><div class="pw-mention-menu" id="pwMentionMenu" role="listbox" aria-label="@Citation suggestion" hidden></div><div class="pw-compose-options">${AgentRuntime.markup('pw',currentChat(state)||{})}<label class="pw-target-detail" id="pwRecipientDetailControl" hidden><span id="pwRecipientDetailLabel">Team members</span><select class="control" id="pwRecipientDetail" aria-label="Team members"></select></label></div><div class="pw-send-row"><button type="button" class="pw-text-button" id="pwAddReference" title="Add project material">+ Materials</button><button type="button" class="pw-text-button" id="pwAddFile">+ Upload</button><input type="file" id="pwFileInput" multiple hidden><button type="button" class="pw-text-button" id="pwAddImage">+ Image</button><input type="file" id="pwImageInput" multiple hidden accept=".png,.jpg,.jpeg,.webp,.pdf"><select class="control pw-compose-project" id="pwComposeProject" aria-label="The chat’s project" title="Switch project; drafts and runs are kept per project">${projectOptions(state.id)}</select><select class="control pw-scope" id="pwScope" aria-label="Send scope"><option value="project">Current project</option><option value="workflow">Current workflow</option></select><select class="control" id="pwRecipient" aria-label="Send target"><option value="">Project experts</option></select><span class="pw-spacer"></span><button type="button" class="pw-text-button" id="pwPrepareTask" hidden>Prepare task</button><button type="button" class="pw-send-button" id="pwSend" aria-label="Send" title="Enter Send">↑</button></div><span id="pwScopeLabel" class="pw-compose-caption">Current project · Authorised executors</span></div>

          </section>
          <aside class="pw-doc" id="pwDocumentPane" aria-label="Project material and task content"><header class="pw-doc-head"><div class="pw-doc-heading"><div class="pw-trail"><button type="button" id="pwBack" class="pw-text-button" hidden>${icon('back')}<span>Back</span></button><span id="pwTrail">Materials</span></div><strong id="pwResourceTitle">Project files</strong></div><div class="pw-doc-actions"><button type="button" class="btn ghost" id="pwToggleTree" aria-controls="pwFileTree" aria-expanded="true">Collapse the folder tree</button><button type="button" class="btn ghost" id="pwQuote">Quote selection</button><button type="button" class="btn" id="pwUseMaterial">Quote into the chat</button><button type="button" class="btn ghost" id="pwMaterialTask">Create task</button><button type="button" class="pw-text-button" id="pwFocus">Focus reading</button><button type="button" class="pw-text-button" id="pwCloseDoc" aria-label="Back to the chat">Back to the chat</button></div><div class="pw-file-tools" id="pwFileToolbar" hidden></div></header><div class="pw-resource" id="pwResource"></div><section id="pwReview" class="pw-review" aria-label="Manual review" hidden></section></aside>
        </section>
      </div>
      <footer class="pw-footer"><span id="pwFooter">Current projectinternal collaboration</span><span class="pw-spacer"></span><span id="pwBackground"></span></footer>
    </section>`;
  }
  function narrow(){return root()?.clientWidth<900;}
  function layoutPanels(state){
    if(!live(state))return;
    const node=root(),small=narrow(),chat=document.querySelector('.pw-chat'),doc=document.getElementById('pwDocumentPane');
    node.dataset.surface=state.surface;node.dataset.section=state.section;node.dataset.fileMode=typeof flCurrentMode!=='undefined'?flCurrentMode:'preview';
    node.classList.toggle('pw-reading',state.reading);
    const hasSidebar=state.surface==='library'||(state.surface==='chat'&&!state.peek);
    node.dataset.pwSidebar=hasSidebar?'on':'off';
    if(!hasSidebar)state.navOpen=false;
    node.classList.toggle('pw-nav-closed',state.navHidden);node.classList.toggle('pw-nav-open',state.navOpen);node.classList.toggle('pw-peek',state.surface==='chat'&&state.peek);node.classList.toggle('pw-narrow',small);
    chat.hidden=state.surface!=='chat';chat.inert=small&&state.surface==='chat'&&state.peek;
    document.getElementById('pwWorkArea').inert=small&&state.navOpen;
    doc.hidden=state.surface==='chat'&&!state.peek;
    if(small&&state.surface==='chat'&&state.peek){doc.setAttribute('role','dialog');doc.setAttribute('aria-modal','true');}else{doc.removeAttribute('role');doc.removeAttribute('aria-modal');}
    document.getElementById('pwWorkArea').setAttribute('aria-labelledby','pwTab-'+state.surface);
    node.querySelectorAll('[data-pw-surface]').forEach(b=>{const on=b.dataset.pwSurface===state.surface;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
    node.querySelectorAll('[data-pw-nav-group]').forEach(group=>group.hidden=group.dataset.pwNavGroup!==state.surface);
    node.querySelectorAll('[data-pw-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.pwView===state.section&&state.surface===resourceSurface[state.section]?'page':'false'));
    document.getElementById('pwNavTitle').textContent={chat:'Project chat',overview:'Project overview',library:'Project materials',workbench:'Artifact workbench',tasks:'Run and deliver',flow:'LangGraph Workflow'}[state.surface]||'Project materials';
    document.getElementById('pwNavShade').hidden=!small||!state.navOpen;
    document.getElementById('pwToggleNav').setAttribute('aria-expanded',String(small?state.navOpen:!state.navHidden&&!state.reading));
    const nav=document.getElementById('pwProjectNav');nav.inert=small?!state.navOpen:state.navHidden||state.reading;
    if(small&&state.navOpen){nav.setAttribute('role','dialog');nav.setAttribute('aria-modal','true');doc.removeAttribute('aria-modal');}else{nav.removeAttribute('role');nav.removeAttribute('aria-modal');}
    const tree=document.getElementById('pwFileTree'),inline=document.getElementById('pwInlineTree'),slot=document.getElementById('pwSidebarTreeSlot');
    const inPeek=state.surface==='chat'&&state.peek;
    const fileBrowser=state.section==='files'&&state.surface==='library';
    if(tree&&slot){
      const target=state.section==='files'&&(fileBrowser||inPeek)&&inline?inline:slot;
      if(tree.parentElement!==target)target.append(tree);
      slot.hidden=true;
      const showTree=fileBrowser?!state.treeHidden&&!state.reading:inPeek&&!!state.peekTree;
      tree.hidden=!showTree;
      if(inline)inline.hidden=!showTree;
    }
    const material=['files','notes'].includes(state.section)&&!!currentFile(),output=state.inspection?.origin==='task';
    const treeVisible=inPeek?!!state.peekTree:!state.treeHidden&&!state.reading;
    const toggle=document.getElementById('pwToggleTree');toggle.hidden=state.section!=='files'||output;toggle.textContent=treeVisible?'Collapse contents':'Show contents';toggle.setAttribute('aria-expanded',String(treeVisible));
    document.getElementById('pwFileToolbar').hidden=state.section!=='files'||!state.fileRow;
    document.querySelector('[data-pw-root-folder]')?.setAttribute('aria-current',String(!state.fileRow&&!state.fileDirectory));
    document.getElementById('pwUseMaterial').hidden=!material;
    document.getElementById('pwQuote').hidden=!material;
    document.getElementById('pwMaterialTask').hidden=!material||state.section==='files'||output;
    document.getElementById('pwFocus').hidden=state.section!=='notes'&&!material;document.getElementById('pwFocus').textContent=state.reading?'Exit focus':'Focused reading';
    const back=document.getElementById('pwBack');
    const returnToRun=state.section==='node-result';
    back.hidden=!output&&!returnToRun&&state.section!=='task-detail'&&!inPeek&&!(fileBrowser&&state.fileRow)&&state.inspection?.origin!=='chat';
    back.querySelector('span').textContent=inPeek?'Back to chat':returnToRun?'Back to run artifacts':output?'Back to task':fileBrowser?'Back to file list':state.section==='task-detail'?'Task list':'Back to chat';
    document.getElementById('pwCloseDoc').hidden=state.surface!=='chat';
    document.getElementById('pwTrail').textContent=state.section==='node-result'?'Output workbench · node output':output?'Task output · pinned version':state.section==='task-detail'?'Tasks and review':(surfaces[resourceSurface[state.section]]||'Materials')+(state.fileRow&&state.section==='files'?' / '+state.fileRow.rel.split('/').slice(0,-1).join('/'):'');
    if(state.review)paintReview(state,state.review);else document.getElementById('pwReview').hidden=true;
  }
  async function switchSurface(surface,state=mounted){
    if(!live(state)||!surfaces[surface]||!await flush())return;
    if(state.section==='node-result'){
      state.navHidden=false;
      state.treeHidden=false;
    }
    if(state.inspection?.origin==='task')state.fileRow=state.libraryFile;
    state.navOpen=false;state.reading=false;state.peek=false;state.inspection=null;
    if(surface==='chat'){state.resourceEpoch++;document.getElementById('pwResource').firstElementChild?.__nodeDispose?.();state.surface='chat';state.chatView='chat';persist(state);layoutPanels(state);paintChatView(state);document.getElementById('pwAsk').focus();return;}
    await showResource((surface==='workbench'?'run-artifacts':state.sections[surface])||{overview:'overview',library:'files',workbench:'run-artifacts',tasks:'tasks',flow:'workflow'}[surface],state);
  }
  function closeNavigator(state){state.navOpen=false;persist(state);layoutPanels(state);document.getElementById('pwToggleNav').focus();}

  async function render(container){
    if(!curTask)needTask();
    if(!curTask){container.innerHTML=`<section class="card"><h2>Project workspace</h2><p class="hint">Create a project first, then add material, experts, and research tasks.</p><button class="btn btn-primary" id="pwFirstProject">New project</button></section>`;document.getElementById("pwFirstProject").onclick=()=>ProjectManager.open();return;}
    if(mounted&&root()&&mounted.id!==curTask){const previous=mounted;if(!await flush()){curTask=previous.id;localStorage.setItem("rw-task",curTask);document.getElementById("pwProject").value=curTask;renderStatus();return;}}
    const state=get(curTask);const requested=intent;intent=null;
    if(root()&&mounted===state){
      document.getElementById("pwProject").innerHTML=projectOptions(state.id);document.getElementById("pwComposeProject").innerHTML=projectOptions(state.id);paintSessions(state);refresh(state);
      if(requested)await showResource(requested.section,state);else if(state.surface==='flow'&&state.section==='workflow')await showResource('workflow',state);return;
    }
    generation++;mounted=state;state.epoch=++generation;
    const pool=(S.chats||[]).filter(c=>c.task_id===state.id&&!String(c.id||'').startsWith('execution-'));if(!pool.some(c=>c.id===state.chatId)&&!String(state.chatId||'').startsWith('execution-'))state.chatId=pool[0]?.id||"";
    container.innerHTML=shell(state);bind(state);layoutPanels(state);paintSessions(state);paintDraft(state);paintChat(state);
    if(requested)await showResource(requested.section,state,{initial:true});
    else if(state.surface!=='chat'||state.peek)await showResource(resources[state.section]?state.section:state.sections[state.surface],state,{initial:true,peek:state.peek,surface:state.surface});
    if(live(state))refresh(state);
    if(!restored){restored=true;restoreRuns();}
    clearInterval(timer);timer=setInterval(()=>{if(live(state)&&!document.hidden)refresh(state);else if(!active())clearInterval(timer);},4000);
  }
  async function uploadFiles(state,files,{imagesOnly=false,libraryOnly=false}={}){
    if(state.sending)return error('Busy uploading or submitting, please wait',state);
    if(files.length>20)return error('Up to 20 files per batch',state);
    const targetDraft=draft(state),imageCount=libraryOnly?0:files.filter(file=>imagesOnly||FileDrop.image(file)).length;
    if((targetDraft.images||[]).length+imageCount>5)return error('Up to 5 image files per chat; use the paper toolbox for image batches',state);
    state.sending=true;error('',state);const errors=[];let done=0;
    try{for(const file of files){try{
      notice(`Uploading ${done+1}/${files.length}: ${file.name}`,state);
      if(!libraryOnly&&(imagesOnly||FileDrop.image(file))){
        if(file.size>20*1024*1024)throw new Error('Images up to 20 MB');
        const asset=await api('/api/paper-toolbox/upload',{project_id:state.id,name:file.name,data:await FileDrop.dataURL(file)});
        (targetDraft.images||=[]).push(asset);
      }else{
        const asset=await FileDrop.project(file,state.id,percent=>notice(`Uploading: ${file.name} · ${percent}%`,state));
        if(!libraryOnly)(targetDraft.refs||=[]).push({name:asset.name,relative:asset.relative,asset_id:asset.asset_id});
      }
      done++;persist(state);paintRefs(state);
    }catch(err){errors.push(file.name+': '+err.message);}}
    if(live(state)&&state.section==='files'&&state.surface!=='chat')await refreshFiles(state.id,'');
    notice(`Uploaded ${done}/${files.length} files`+(libraryOnly?', saved under "Other / Uploaded files"':', you can keep typing'),state);
    if(errors.length)error(errors.join('; '),state);
    }finally{state.sending=false;paintSend(state);}
  }
  function bind(state){
    document.getElementById('pwAddImage').onclick=()=>document.getElementById('pwImageInput').click();
    document.getElementById('pwImageInput').onchange=event=>{const files=[...event.target.files];event.target.value='';uploadFiles(state,files,{imagesOnly:true});};
    let uploadToLibrary=false;
    document.getElementById('pwAddFile').onclick=()=>{uploadToLibrary=false;document.getElementById('pwFileInput').click();};
    document.getElementById('pwUploadFile').onclick=()=>{uploadToLibrary=true;document.getElementById('pwFileInput').click();};
    document.getElementById('pwFileInput').onchange=event=>{const files=[...event.target.files];event.target.value='';uploadFiles(state,files,{libraryOnly:uploadToLibrary});};
    FileDrop.bind(root(),{label:'Release to upload to this project',busy:()=>state.sending,onError:message=>error(message,state),onFiles:(files,event)=>uploadFiles(state,files,{libraryOnly:!event.target.closest('.pw-chat')})});
    document.getElementById("pwPrepareTask").onclick=()=>send(state,true);
    root().querySelectorAll('[data-pw-chat-view]').forEach(button=>button.onclick=()=>{state.chatView=button.dataset.pwChatView;paintChatView(state);});
    for(const [id,key] of [['pwModel','model_id'],['pwPermission','permission'],['pwReasoning','reasoning']])document.getElementById(id).onchange=e=>saveChatOption(state,key,e.target.value);
    document.getElementById('pwSearchInput').value=state.searchQuery||'';
    document.getElementById('pwSearchForm').onsubmit=e=>{e.preventDefault();state.searchQuery=document.getElementById('pwSearchInput').value.trim();showResource('search',state);};
    document.getElementById('pwRebuildAssets').onclick=async()=>{try{await api('/api/project/resources/index',{project_id:state.id});const result=await api('/api/assets/diagnostics?project_id='+encodeURIComponent(state.id));notice(`Material index rebuilt: ${result.assets||0} items, ${result.conflicts||0} conflicts.`,state);}catch(err){error('Failed to organize material index:'+err.message,state);}};
    for(const selectorId of ['pwProject','pwComposeProject'])document.getElementById(selectorId).onchange=async event=>{
      const id=event.target.value;event.target.disabled=true;
      try{await switchProject(id);}finally{for(const key of ['pwProject','pwComposeProject']){const select=document.getElementById(key);if(select){select.value=curTask;select.disabled=false;}}}
    };
    document.getElementById("pwProjectCreate").onclick=()=>ProjectManager.open();
    document.getElementById("pwProjectEdit").onclick=()=>ProjectManager.open({edit:true});
    root().querySelectorAll("[data-pw-view]").forEach(b=>b.onclick=()=>showResource(b.dataset.pwView,state));
    root().querySelectorAll('[data-pw-surface]').forEach(b=>b.onclick=()=>switchSurface(b.dataset.pwSurface,state));
    root().querySelector('.pw-primary').onkeydown=e=>{const buttons=[...root().querySelectorAll('[data-pw-surface]')],i=buttons.indexOf(document.activeElement);if(i<0)return;let next;if(e.key==='ArrowRight')next=(i+1)%buttons.length;else if(e.key==='ArrowLeft')next=(i+buttons.length-1)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;e.preventDefault();buttons[next].focus();};
    root().querySelectorAll("[data-pw-filter]").forEach(b=>b.onclick=()=>{state.filter=b.dataset.pwFilter;showResource("tasks",state);});
    document.getElementById("pwMode").value=state.mode;
    document.getElementById("pwMode").onchange=e=>{state.mode=e.target.value;state.modeTouched=true;persist(state);notice("New task mode selected. Running tasks continue under their own run mode.",state);};
    document.getElementById("pwScope").value=state.scope;
    document.getElementById("pwScope").onchange=async e=>{state.scope=e.target.value;state.target="";persist(state);paintTargets(state);if(state.scope==='workflow'){try{state.targets=await api('/api/handoff/targets?project_id='+encodeURIComponent(state.id));if(live(state))paintTargets(state);}catch(err){notice(err.message,state);}}};
    document.getElementById("pwRecipient").onchange=e=>{state.target=e.target.value;persist(state);paintTargets(state);paintChatOptions(state);};
    document.getElementById('pwRecipientDetail').onchange=e=>{state.target=e.target.value;persist(state);paintTargets(state);paintChatOptions(state);};
    document.getElementById("pwAsk").oninput=()=>handleMentionInput(state);
    document.getElementById("pwAsk").onkeydown=e=>{if(e.isComposing||e.keyCode===229)return;const menu=document.getElementById("pwMentionMenu");if(!menu?.hidden){if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();state.mentionIndex=(state.mentionIndex+(e.key==="ArrowDown"?1:-1)+state.mentionItems.length)%state.mentionItems.length;menu.querySelectorAll("[data-pw-mention]").forEach((b,i)=>b.setAttribute("aria-selected",String(i===state.mentionIndex)));return;}if(e.key==="Enter"){e.preventDefault();insertMention(state,state.mentionIndex);return;}if(e.key==="Escape"){e.preventDefault();closeMentionMenu(state);return;}}if(e.key==="Enter"&&!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey){e.preventDefault();send(state);}};
    document.getElementById("pwSend").onclick=()=>send(state);
    document.getElementById("pwNewChat").onclick=()=>newChat(state);
    document.getElementById("pwRenameChat").onclick=async()=>{const row=currentChat(state);if(!row)return notice("You can rename the chat after the first message.",state);const title=await uiPrompt("Conversation name",row.title);if(title===null)return;await api("/api/chat/rename",{id:row.id,title});await refreshState(false);if(live(state)){paintSessions(state);document.getElementById("pwChatTitle").textContent=currentChat(state)?.title||"Topic discussion";}};
    document.getElementById('pwToggleNav').onclick=()=>{if(narrow())state.navOpen=!state.navOpen;else{state.navHidden=state.reading?false:!state.navHidden;state.reading=false;}persist(state);layoutPanels(state);if(state.navOpen)document.getElementById('pwNavClose').focus();};
    document.getElementById('pwNavShade').onclick=()=>closeNavigator(state);document.getElementById('pwNavClose').onclick=()=>{if(narrow())closeNavigator(state);else{state.navHidden=true;persist(state);layoutPanels(state);}};
    document.getElementById('pwToggleTree').onclick=()=>{if(state.surface==='chat')state.peekTree=!state.peekTree;else{state.treeHidden=state.reading?false:!state.treeHidden;state.reading=false;}persist(state);layoutPanels(state);};
    document.getElementById('pwShowDoc').onclick=()=>switchSurface('library',state);
    document.getElementById('pwCloseDoc').onclick=()=>switchSurface('chat',state);
    document.getElementById('pwBack').onclick=()=>{
      if(state.peek)return switchSurface('chat',state);
      if(state.section==='node-result')return showResource('run-artifacts',state,{runId:state.nodeResultSelection?.workflow_run_id});
      if(state.inspection?.origin==='task')return openTask(state.inspection.taskId,state.id);
      if(state.surface==='library'&&state.section==='files')return browseDirectory(state,state.fileRow?.rel.split('/').slice(0,-1).join('/')||'');
      if(state.section==='task-detail')return showResource('tasks',state);
      return switchSurface('chat',state);
    };
    document.getElementById('pwFocus').onclick=async()=>{if(!await flush()||!live(state))return;if(state.surface==='chat'){state.surface='library';state.peek=false;state.inspection={origin:'chat'};state.sections.library=state.section;}state.reading=!state.reading;state.navOpen=false;persist(state);layoutPanels(state);};
    document.getElementById("pwBindings").onclick=()=>ProjectTasks.openBindings(state.id).then(d=>d?.addEventListener("close",()=>refresh(state),{once:true}));
    document.getElementById("pwMembers").onclick=()=>uiNavigate(()=>openTab("team"));
    document.getElementById("pwExperts").onclick=()=>uiNavigate(()=>openTab("assistants"));
    const compose=async data=>{if(!await flush())return;const dialog=await ProjectTasks.compose(state.id,data);dialog?.addEventListener('close',()=>refresh(state),{once:true});};
    document.getElementById('pwTopLanggraph').onclick=()=>showResource('workflow',state);
    document.getElementById('pwCreateTask').onclick=()=>compose({goal:draft(state).text,inputs:(draft(state).refs||[]).map(r=>({relative:r.relative}))});
    document.getElementById('pwMaterialTask').onclick=()=>{const file=currentFile();if(file)compose({inputs:[{relative:file.relative}]});};
    document.getElementById('pwAddReference').onclick=()=>state.peek&&currentFile()?addReference(state):switchSurface('library',state);
    document.getElementById('pwUseMaterial').onclick=()=>addReference(state);
    document.getElementById("pwQuote").onclick=()=>quote(state);
    root().addEventListener("click",e=>{
      const mode=e.target.closest('[data-fl-mode]');if(mode)root().dataset.fileMode=mode.dataset.flMode;
      const ref=e.target.closest('[data-pw-ref]');if(ref)openReference(state,Number(ref.dataset.pwRef));
      if(e.target.closest('#pwProjectSettings button'))document.getElementById('pwProjectSettings').open=false;
      const b=e.target.closest("[data-pw-task],[data-pw-start],[data-pw-cancel],[data-pw-remove-ref]");if(!b)return;
      if(b.dataset.pwTask)openTask(b.dataset.pwTask,state.id);
      if(b.dataset.pwStart)taskCommand(state,b.dataset.pwStart,"start");
      if(b.dataset.pwCancel)taskCommand(state,b.dataset.pwCancel,"cancel");
      if(b.hasAttribute("data-pw-remove-ref")){draft(state).refs.splice(Number(b.dataset.pwRemoveRef),1);persist(state);paintRefs(state);}
    });
    root().addEventListener('keydown',e=>{
      if(e.key==='Escape'&&document.getElementById('pwProjectSettings').open){e.preventDefault();e.stopPropagation();document.getElementById('pwProjectSettings').open=false;document.querySelector('#pwProjectSettings summary').focus();return;}
      const panel=narrow()&&state.navOpen?document.getElementById('pwProjectNav'):narrow()&&state.peek?document.getElementById('pwDocumentPane'):null;
      if(!panel)return;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(state.navOpen)closeNavigator(state);else switchSurface('chat',state);return;}
      if(e.key==='Tab'){const items=[...panel.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length&&!el.closest('[hidden],details:not([open])'));const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    });
  }
  async function switchProject(id){
    if(!id||id===mounted?.id)return;
    if(!S.tasks.some(project=>project.id===id))throw new Error('Project not found');
    const old=mounted;if(!await flush()){if(document.getElementById("pwProject"))document.getElementById("pwProject").value=old.id;return;}
    persist(old);curTask=id;localStorage.setItem("rw-task",id);spId=null;flSel="";flCurrentFile=null;await window.render();
  }
  function paintSessions(state){
    if(!live(state))return;
    const history=ConversationHistory.mount(document.getElementById('pwSessions'),{projectId:state.id,selected:()=>state.chatId,onSelect:id=>selectChat(state,id),onChanged:async()=>{
      if(!live(state))return;
      if(state.chatId&&!(S.chats||[]).some(chat=>chat.id===state.chatId)){state.chatId='';persist(state);paintDraft(state);await paintChat(state);}
      document.getElementById('pwChatTitle').textContent=currentChat(state)?.title||'New topic discussion';
    }});
    document.getElementById("pwChatTitle").textContent=currentChat(state)?.title||"New topic discussion";
    return history.ready;
  }
  async function selectChat(state,id){
    if(state.sending||state.creating)return notice('Saving the current request; switch chats in a moment.',state);
    if(!live(state)||!await flush())return;
    const belongsToProject=()=>S.chats?.some(chat=>chat.id===id&&chat.task_id===state.id);
    if(id&&!String(id).startsWith('execution-')&&!belongsToProject()){
      try{await refreshState(false);}catch(err){return error(err.message,state);}
      if(!live(state))return;
      if(!belongsToProject())return error('This chat does not belong to the current project.',state);
    }
    state.chatId=id;persist(state);paintSessions(state);paintDraft(state);paintChat(state);error("",state);
  }
  async function newChat(state){
    if(!live(state)||state.sending||state.creating)return;
    state.creating=true;document.getElementById('pwNewChat').disabled=true;
    try{
      if(!await flush())return;
      if(!state.chatId&&(draft(state).text.trim()||draft(state).refs.length))await ensureChat(state);
      const result=await api('/api/chat/create',{title:'New topic discussion',task_id:state.id});
      state.chatId=result.chat.id;persist(state);await refreshState(false);
      if(live(state)){await paintSessions(state);if(!live(state))return;paintDraft(state);await paintChat(state);document.getElementById('pwAsk').focus();}
    }catch(err){error(err.message,state);}
    finally{state.creating=false;if(live(state))document.getElementById('pwNewChat').disabled=false;}
  }
  function promptKey(state){return `workspace:${state.id}:${state.chatId||'new'}`;}
  function paintDraft(state){if(!live(state))return;document.getElementById("pwAsk").value=draft(state).text||"";PromptUI.select(promptKey(state),draft(state).template);PromptUI.mount(document.getElementById('pwAsk'),promptKey(state),state.id,value=>{draft(state).template=value;persist(state);});paintRefs(state);paintSend(state);paintChatOptions(state);}
  function paintChatOptions(state){
    if(!live(state))return;const chat=currentChat(state)||{},model=document.getElementById('pwModel');
    model.innerHTML='<option value="">Follow expert / current model</option>'+(S.models||[]).map(item=>`<option value="${h(item.id)}">${h(item.name||item.model)}</option>`).join('');model.value=chat.model_id||'';
    document.getElementById('pwPermission').value=chat.permission||'auto';document.getElementById('pwReasoning').value=chat.reasoning||'auto';
    document.querySelectorAll('#pwRuntime select').forEach(item=>item.disabled=state.scope==='workflow'||!!state.optionSaving);
    document.getElementById('pwRuntimeHint').textContent=state.target?'Node tasks use executor config':state.optionSaving?'Saving...':'';
  }
  async function saveChatOption(state,key,value){
    if(!live(state)||state.optionSaving)return;state.optionSaving=true;paintChatOptions(state);
    try{const id=await ensureChat(state);if(!live(state))return;paintChatOptions(state);const result=await api('/api/agent-settings/runtime-save',{id,[key]:value});const item=(S.chats||[]).find(chat=>chat.id===id);if(item)Object.assign(item,result.chat);if(live(state)&&state.chatId===id)notice('Session config saved; applies on the next send.',state);}
    catch(err){error('Save session config failed:'+err.message,state);}finally{state.optionSaving=false;if(live(state))paintChatOptions(state);}
  }
  function mentionDraft(state){const value=draft(state);value.mentions=Array.isArray(value.mentions)?value.mentions:[];return value.mentions;}
  function closeMentionMenu(state){const menu=document.getElementById('pwMentionMenu');if(menu){menu.hidden=true;menu.replaceChildren();}state.mentionQuery='';state.mentionItems=[];state.mentionIndex=0;}
  async function mentionCatalog(state){
    if(state.mentionCatalog)return state.mentionCatalog;const items=[];
    if(!state.targets){try{state.targets=await api('/api/handoff/targets?project_id='+encodeURIComponent(state.id));}catch{}}
    if(state.targets?.layout_id){items.push({kind:'workflow',id:state.targets.layout_id,label:state.targets.layout_name||'Current workflow'});for(const node of state.targets.nodes||[])items.push({kind:'node',id:node.id,label:'Nodes ·'+(node.label||node.id),node});}
    try{const tree=await api('/api/tree?id='+encodeURIComponent(state.id)+'&rel=');for(const row of tree.rows||[]){if(!row.dir)items.push({kind:'file',id:row.rel,label:'File · '+row.rel,relative:row.rel,name:row.name||row.rel});}}catch{}
    try{const capabilities=await api('/api/capabilities?project_id='+encodeURIComponent(state.id));for(const tool of capabilities.tools||[])items.push({kind:'tool',id:tool.id||tool.name,label:'Tools · '+(tool.label||tool.name)});for(const skill of capabilities.skills||[])items.push({kind:'skill',id:skill.id||skill.name,label:'Skill · '+(skill.name||skill.id)});}catch{}
    state.mentionCatalog=items;return items;
  }
  async function openMentionMenu(state){const ask=document.getElementById('pwAsk'),menu=document.getElementById('pwMentionMenu');if(!ask||!menu)return;const match=ask.value.slice(0,ask.selectionStart).match(/(?:^|\s)@([^\s@]*)$/);if(!match){closeMentionMenu(state);return;}state.mentionQuery=match[1].toLowerCase();state.mentionStart=ask.selectionStart-match[1].length-1;const all=await mentionCatalog(state),items=all.filter(item=>!state.mentionQuery||item.label.toLowerCase().includes(state.mentionQuery)||item.id.toLowerCase().includes(state.mentionQuery)).slice(0,12);state.mentionItems=items;state.mentionIndex=0;menu.innerHTML=items.length?items.map((item,index)=>`<button type="button" role="option" data-pw-mention="${h(item.id)}" data-pw-mention-index="${index}"><span>${h(item.label)}</span><small>${h(item.kind)}</small></button>`).join(''):'<p class="hint">No matching workflows, files, tools, or skills</p>';menu.hidden=false;menu.querySelectorAll('[data-pw-mention]').forEach(button=>button.onclick=()=>insertMention(state,Number(button.dataset.pwMentionIndex)));}
  function insertMention(state,index){const ask=document.getElementById('pwAsk'),item=state.mentionItems?.[index];if(!ask||!item)return;const start=state.mentionStart,end=ask.selectionStart,label=item.label.replace(/^(File|Tools|Skill|Node) · /,'');ask.value=ask.value.slice(0,start)+'@'+label+' '+ask.value.slice(end);ask.selectionStart=ask.selectionEnd=start+label.length+2;const value=mentionDraft(state);if(item.kind==='file'&&!value.refs.some(ref=>ref.relative===item.relative))value.refs.push({relative:item.relative,name:item.name||item.relative,mention:true});else if(item.kind==='workflow'||item.kind==='node'){state.scope='workflow';state.target='';document.getElementById('pwScope').value='workflow';if(!value.some(mention=>mention.kind===item.kind&&mention.id===item.id))value.push({kind:item.kind,id:item.id,label:item.label});}else if(!value.some(mention=>mention.kind===item.kind&&mention.id===item.id))value.push({kind:item.kind,id:item.id,label:item.label});persist(state);paintRefs(state);paintTargets(state);closeMentionMenu(state);ask.focus();}
  function handleMentionInput(state){draft(state).text=document.getElementById('pwAsk').value;persist(state);openMentionMenu(state);}
  function paintRefs(state){if(!live(state))return;const value=draft(state),refs=value.refs||[],mentions=mentionDraft(state);document.getElementById('pwRefs').innerHTML=refs.map((r,i)=>`<span class="pw-ref" title="${h(r.relative)}"><button type="button" data-pw-ref="${i}" aria-label="View citations ${h(r.name||r.relative)}">${h(r.name||r.relative)}${r.quote?' · Selection':''}</button><button type="button" data-pw-remove-ref="${i}" aria-label="Remove citation ${h(r.name||r.relative)}">×</button></span>`).join('')+mentions.map((m,i)=>`<span class="pw-ref pw-mention" title="${h(m.id)}"><span>@${h(m.label||m.id)}</span><button type="button" data-pw-remove-mention="${i}" aria-label="Remove @${h(m.label||m.id)}">×</button></span>`).join('');const host=document.getElementById('pwRefs');host.insertAdjacentHTML('beforeend',(value.images||[]).map((item,index)=>`<span class="pw-ref">${h(item.name)}<button type="button" data-remove-image="${index}" aria-label="Remove image">×</button></span>`).join(''));host.querySelectorAll('[data-remove-image]').forEach(button=>button.onclick=()=>{value.images.splice(Number(button.dataset.removeImage),1);persist(state);paintRefs(state);});host.querySelectorAll('[data-pw-remove-mention]').forEach(button=>button.onclick=()=>{mentions.splice(Number(button.dataset.pwRemoveMention),1);persist(state);paintRefs(state);});}
  function paintSend(state){
    if(!live(state))return;
    const running=state.chatId&&chatRecord(state.chatId).run?.status==="running",button=document.getElementById("pwSend");
    button.textContent=running?"■":state.scope==="workflow"?"↗":"↑";button.title=running?"Stop current chat":state.scope==="workflow"?"Prepare tasks":"Send";button.setAttribute("aria-label",button.title);button.classList.toggle("stop",!!running);document.getElementById("pwPrepareTask").hidden=!state.target||state.scope==="workflow";document.getElementById("pwPrepareTask").disabled=!!running||!!state.sending;
    document.getElementById("pwScopeLabel").textContent=state.scope==="workflow"?"Current workflow · targets belong to nodes":"Current project · authorized executors";
  }
  function paintChatView(state,renderExecution=true){
    if(!live(state))return;const trace=state.chatView==='trajectory';document.querySelector('.pw-chat').classList.toggle('pw-viewing-trajectory',trace);
    document.getElementById('pwMessages').hidden=trace;document.getElementById('pwTrajectory').hidden=!trace;
    root().querySelectorAll('[data-pw-chat-view]').forEach(button=>button.setAttribute('aria-selected',String((trace?'trajectory':'chat')===button.dataset.pwChatView)));
    if(renderExecution&&state.chatId?.startsWith('execution-')){const record=chatRecord(state.chatId);if(record.execution)ExecutionConversation.render(trace?document.getElementById('pwTrajectory'):document.getElementById('pwMessages'),{execution:record.execution,messages:record.messages},()=>{record.revision='';return paintChat(state);});}
    const indicator=root().querySelector('[data-execution-indicator]');if(indicator&&!state.chatId?.startsWith('execution-'))indicator.remove();
    if(trace&&!state.chatId?.startsWith('execution-'))WorkspaceTrajectory.mount(document.getElementById('pwTrajectory'),{chatId:state.chatId,projectId:state.id,live:()=>live(state)&&state.surface==='chat'&&state.chatView==='trajectory'});
  }
  function append(box,event){appendOne(box,event);}
  async function paintChat(state){
    if(!live(state))return;
    paintChatView(state,false);
    const box=document.getElementById("pwMessages"),id=state.chatId;
    if(!id){box.innerHTML=`<div class="pw-empty"><h3>Start from a research question</h3><p>Discuss the goal, cite material, or hand concrete work to this project’s experts and teams.</p><div class="pw-empty-actions"><button type="button" class="btn" data-pw-empty="files">View project files</button><button type="button" class="btn" data-pw-empty="papers">Import project literature</button><button type="button" class="btn" data-pw-empty="bindings">Add project experts</button></div></div>`;box.querySelectorAll("[data-pw-empty]").forEach(b=>b.onclick=()=>b.dataset.pwEmpty==="bindings"?document.getElementById("pwBindings").click():showResource(b.dataset.pwEmpty,state));return;}
    const record=chatRecord(id),seq=++record.request;
    if(record.loaded&&box.dataset.chatId!==id)drawMessages(state,id);else if(!record.loaded&&box.dataset.chatId!==id){box.dataset.chatId=id;box.textContent="Reading chat...";}
    try{const result=await api("/api/chat?id="+encodeURIComponent(id));if(seq!==record.request)return;const changed=!result.revision||record.revision!==result.revision;record.messages=result.messages||[];record.execution=result.execution;record.revision=result.revision;record.loaded=true;if(live(state)&&state.chatId===id){if(state.executionTargetChat!==id){state.executionTargetChat=id;if(record.execution){const execution=record.execution;state.scope='project';state.target=execution.kind==='task'?(execution.member_id?'member:'+execution.executor_binding_id+':'+execution.member_id:'binding:'+execution.executor_binding_id):'';document.getElementById('pwScope').value='project';paintTargets(state);paintChatOptions(state);persist(state);}}if(changed||box.dataset.chatId!==id)drawMessages(state,id);clearTimeout(state.executionRefresh);if(record.execution)state.executionRefresh=setTimeout(()=>{if(live(state)&&state.chatId===id&&state.surface==='chat'&&!record.run)paintChat(state);},2000);}}catch(err){if(live(state)&&state.chatId===id)error(err.message,state);}
  }
  function drawMessages(state,id){
    if(!live(state)||state.chatId!==id)return;
    const record=chatRecord(id),box=document.getElementById("pwMessages");box.dataset.chatId=id;if(record.execution){const refresh=()=>{record.revision="";return paintChat(state);};ExecutionConversation.render(state.chatView==="trajectory"?document.getElementById("pwTrajectory"):box,{execution:record.execution,messages:record.messages},refresh);if(record.run?.status==="running")record.events.forEach(ev=>{if(ev.type!=='user')append(box,ev);});return;}box.innerHTML="";
    const history=record.run?.status==="running"?record.base||record.messages:record.messages;
    const seenUserInputs=new Set();
    history.forEach(m=>{
      const events=Array.isArray(m.events)?m.events.filter(event=>{
        if(event.type!=="user")return true;
        const key=userInputKey(event.content);if(!key)return true;
        if(seenUserInputs.has(key))return false;
        seenUserInputs.add(key);return true;
      }):m.events;
      if(m.role==="user"){const key=userInputKey(m.content);if(key)seenUserInputs.add(key);}
      append(box,{...m,events,type:m.role,replay:true,at:m.created_at});
    });
    if(record.run?.status==="running"){record.events.forEach(ev=>{if(ev.type==='user'&&ev.local&&history.some(item=>item.role==='user'&&userInputKey(item.content)===userInputKey(ev.content)))return;append(box,ev);});}
    if(!box.children.length)box.innerHTML='<div class="pw-empty">This chat is bound to the current project; cite material and state a goal.</div>';
    box.scrollTop=box.scrollHeight;
  }
  async function ensureChat(state){
    if(currentChat(state))return state.chatId;
    const saved=draft(state),made=await api("/api/chat/create",{title:(saved.text||"Topic discussion").slice(0,45),task_id:state.id});
    state.chatId=made.chat.id;state.drafts[state.chatId]={...saved,refs:[...(saved.refs||[])]};delete state.drafts.new;persist(state);
    await refreshState(false);if(live(state))paintSessions(state);return state.chatId;
  }
  async function send(state,asTask=false){
    if(!live(state)||state.sending||state.creating||state.optionSaving)return;
    const running=state.chatId&&chatRecord(state.chatId).run;
    if(running?.status==="running"){await api("/api/agent/cancel",{idempotency_key:running.key});return;}
    draft(state).text=document.getElementById("pwAsk").value;
    const submission={text:draft(state).text,refs:[...(draft(state).refs||[])],mentions:[...mentionDraft(state)],images:[...(draft(state).images||[])],template:PromptUI.ref(promptKey(state),state.id)},goal=submission.text.trim();if(!goal)return;
    state.sending=true;document.getElementById("pwSend").disabled=true;error("",state);
    try{
      if(!await flush())return;
      if(state.target&&(asTask||state.scope==='workflow')){await prepareTask(state,goal,submission);return;}
      const selectedModel=currentChat(state)?.model_id,model=(S.models||[]).find(item=>item.id===selectedModel)||S.active;
      const localModel=model && (()=>{try{return ['127.0.0.1','localhost','[::1]'].includes(new URL(model.base_url).hostname);}catch{return false;}})();
      if((!localModel&&!selectedModel&&!await requireModelKey())||!live(state))return;
      const id=await ensureChat(state),record=chatRecord(id),refs=submission.refs;
      const mentions=submission.mentions||[],context=refs.length?"\n\n[materials this project explicitly cites]\n"+refs.map(r=>r.quote?`File: ${r.relative}\nSelection:\n${r.quote}`:`File: ${r.relative}`).join("\n\n"):"";
      const mentionContext=mentions.length?"\n\n[@ context]\n"+mentions.map(item=>"@"+(item.label||item.id)+" ("+item.kind+": "+item.id+")").join(", "):"";
      const selected=state.target?targetRows(state).find(row=>row.value===state.target):null;if(state.target&&!selected)throw new Error('Executor removed, select another');
      const run={key:crypto.randomUUID(),api:"/api/agent",runId:"",cursor:0,status:"running",projectId:state.id,chatId:id,draftText:submission.text,draftImages:submission.images,request:{task_id:id,executor_binding_id:selected?.binding?.id||'',member_id:selected?.member?.id||'',image_ids:submission.images.map(item=>item.asset_id),message:goal+context+mentionContext,mentions,template_ref:submission.template,idempotency_key:""}};run.request.idempotency_key=run.key;
      record.lastError="";record.run=run;run.base=[...record.messages];record.base=run.base;
      const binding=selected?.binding;
      if(binding?.kind==='team'){
        const team=state.teams.find(item=>item.id===binding.target_id);
        run.assistantId=(selected.member || team?.members?.find(member=>member.role==='leader'))?.assistant_id;
      }else if(binding?.kind==='assistant'){
        run.assistantId=binding.target_id;
      }
      record.events=[{type:"user",content:goal+context+mentionContext},{type:"chat_waiting",assistant_id:run.assistantId}];
      if(draft(state).text===submission.text){draft(state).text="";draft(state).images=[];}persist(state);paintDraft(state);drawMessages(state,id);persistRuns();follow(run,record);
    }catch(err){error(err.message,state);}finally{state.sending=false;if(live(state)){document.getElementById("pwSend").disabled=false;paintSend(state);}}
  }
  function persistRuns(){write("rw-workspace-runs",[...chats.values()].filter(c=>c.run?.status==="running").map(c=>c.run));}
  async function follow(run,record){
    await observeAgentRun(run,event=>{
      if(event.type==='user')return;
      record.events.push(event);const state=get(run.projectId);
      if(live(state)&&state.chatId===run.chatId){const box=document.getElementById("pwMessages");if(["done","cancelled"].includes(event.type)){if(event.type==="done"&&!record.events.some(e=>e.type==="assistant"))append(box,{...event,type:"assistant",assistant_id:event.assistant_id||run.assistantId,content:event.content||"Run finished"});}else append(box,event);}
      if(event.type==="error")record.lastError=event.message;paintBackground();
    },persistRuns,()=>{const state=get(run.projectId);if(live(state)&&state.chatId===run.chatId){
      updateChatActivity(document.getElementById("pwMessages"),"chat_reconnecting");
    }});
    const owner=get(run.projectId);
    if(live(owner)&&owner.chatId===run.chatId)updateChatActivity(document.getElementById("pwMessages"),"done");
    if(!run.runId&&run.status==='failed'){
      const failedDraft=owner.drafts[run.chatId];
      if(failedDraft&&failedDraft.text.length===0&&!(failedDraft.images||[]).length){
        failedDraft.text=run.draftText||'';
        failedDraft.images=run.draftImages||[];
        persist(owner);
        if(live(owner)&&owner.chatId===run.chatId)paintDraft(owner);
      }
    }
    record.run=null;record.events=[];record.loaded=false;persistRuns();
    try{await refreshState(false);const state=get(run.projectId);if(live(state)){paintSessions(state);paintSend(state);if(state.chatId===run.chatId){await paintChat(state);if(record.lastError)error(record.lastError,state);}refresh(state);}}catch{}
    paintBackground();
  }
  function restoreRuns(){
    for(const saved of read("rw-workspace-runs",[])){
      if(!saved.projectId||!(S.tasks||[]).some(p=>p.id===saved.projectId)||!(S.chats||[]).some(c=>c.id===saved.chatId&&c.task_id===saved.projectId))continue;
      const record=chatRecord(saved.chatId);if(record.run)continue;saved.status="running";saved.cursor=0;record.run=saved;record.base=saved.base||[];record.events=[{type:'user',content:saved.request.message,local:true},{type:"chat_waiting",assistant_id:saved.assistantId}];follow(saved,record);
    }
    paintBackground();
  }
  function paintBackground(){
    const host=document.getElementById("pwBackground");if(!host)return;
    const runs=[...chats.values()].map(c=>c.run).filter(r=>r?.status==="running"&&r.projectId!==mounted?.id);
    host.innerHTML=runs.map(r=>`<button type="button" class="btn ghost" data-pw-background="${h(r.projectId)}">${h((S.tasks||[]).find(p=>p.id===r.projectId)?.title||"Other projects")} · Chat is running</button>`).join("");
    host.querySelectorAll('[data-pw-background]').forEach(b=>b.onclick=()=>switchProject(b.dataset.pwBackground));
  }
  function selectedBinding(state){
    if(state.scope!=='project')return null;
    const member=state.target.startsWith('member:'),identifier=member?state.target.slice(7,state.target.lastIndexOf(':')):state.target.startsWith('binding:')?state.target.slice(8):'';
    const binding=ExecutorChoices.find(state.bindings,identifier);
    if(binding&&binding.id!==identifier){state.target=(member?'member:':'binding:')+binding.id+(member?state.target.slice(state.target.lastIndexOf(':')):'');persist(state);}
    return binding;
  }
  function targetRows(state){
    if(state.scope==="workflow")return (state.targets?.nodes||[]).flatMap(node=>{
      const actors=new Map();for(const actor of node.actors||[]){const value=`node:${node.id}:${actor.team_id}:${actor.member_id}:${actor.assistant_id}`,key=(actor.team_id?'team:':'assistant:')+actor.assistant_id,old=actors.get(key);if(!old||value===state.target)actors.set(key,{value,label:actor.member_name||actor.assistant_name,node,actor});}
      return [...actors.values()];
    });
    const preferred=selectedBinding(state),memberId=state.target.startsWith('member:')?state.target.slice(state.target.lastIndexOf(':')+1):'';
    return ExecutorChoices.unique(state.bindings,preferred?.id).filter(ExecutorChoices.ready).flatMap(binding=>[
      {value:'binding:'+binding.id,label:(binding.kind==='team'?'Team · ':'Expert · ')+binding.display_name,binding},
      ...(binding.kind==='team'?ExecutorChoices.members(state.teams.find(team=>team.id===binding.target_id)?.members,memberId).filter(member=>state.bindings.some(item=>item.kind==='assistant'&&item.target_id===member.assistant_id&&ExecutorChoices.ready(item))).map(member=>({value:'member:'+binding.id+':'+member.id,label:member.name,binding,member})):[])
    ]);
  }
  function paintTargets(state){
    if(!live(state))return;
    const select=document.getElementById('pwRecipient'),rows=targetRows(state),selected=rows.find(row=>row.value===state.target);
    let primary;
    if(state.scope==='workflow'){
      const nodes=new Map();for(const row of rows){if(!nodes.has(row.node.id)||row.value===state.target)nodes.set(row.node.id,row);}
      primary=[...nodes.values()].map(row=>({...row,label:row.node.label+' · '+(row.actor.team_name||row.actor.assistant_name)}));
    }else primary=rows.filter(row=>!row.member);
    const option=row=>`<option value="${h(row.value)}">${h(row.label)}</option>`;
    const groups=state.scope==='project'?['team','assistant'].map(kind=>{const items=primary.filter(row=>row.binding.kind===kind);return items.length?`<optgroup label="${kind==='team'?'Team':'Expert'}">${items.map(option).join('')}</optgroup>`:'';}).join(''):primary.map(option).join('');
    select.innerHTML='<option value="">Project experts · discussion and coordination</option>'+groups;
    const binding=selectedBinding(state),parent=state.scope==='project'?primary.find(row=>row.binding.id===(selected?.binding.id||binding?.id)):primary.find(row=>row.node.id===selected?.node.id);
    if(state.target&&!parent&&!selected)select.insertAdjacentHTML('beforeend',`<option value="${h(state.target)}" disabled>The original execution target is no longer valid. Select again.</option>`);
    select.value=parent?.value||state.target;
    const control=document.getElementById('pwRecipientDetailControl'),detail=document.getElementById('pwRecipientDetail');
    const team=state.scope==='project'&&parent?.binding.kind==='team';
    const details=team?[{value:parent.value,label:'Arranged by team lead'},...rows.filter(row=>row.member&&row.binding.id===parent.binding.id)]:state.scope==='workflow'&&parent?rows.filter(row=>row.node.id===parent.node.id):[];
    control.hidden=!team&&details.length<2;
    document.getElementById('pwRecipientDetailLabel').textContent=team?'Team members':'Node executor';detail.setAttribute('aria-label',team?'Team members':'Node executor');
    detail.innerHTML=details.map(option).join('');
    if(!control.hidden){if(state.target&&!details.some(row=>row.value===state.target))detail.insertAdjacentHTML('beforeend',`<option value="${h(state.target)}" disabled>Original member is gone, please reselect</option>`);detail.value=state.target;}
    paintSend(state);
  }
  async function refresh(state){
    if(state.refreshing)return;state.refreshing=true;const epoch=state.epoch;
    try{
      const result=await Promise.allSettled([api('/api/project-tasks?project_id='+encodeURIComponent(state.id)),api('/api/project-tasks/executors?project_id='+encodeURIComponent(state.id)),state.targets?.layout_id?api('/api/handoff/targets?project_id='+encodeURIComponent(state.id)):Promise.resolve(state.targets),api('/api/project-tasks/policy?project_id='+encodeURIComponent(state.id)),api('/api/execution-board?project_id='+encodeURIComponent(state.id))]);
      if(epoch!==state.epoch)return;
      if(result[0].status==='fulfilled')state.tasks=result[0].value.tasks||[];
      if(result[4].status==='fulfilled')state.executionRows=result[4].value.items||[];
      if(result[1].status==='fulfilled'){state.bindings=result[1].value.bindings||[];state.teams=result[1].value.teams||[];}
      if(result[2].status==='fulfilled')state.targets=result[2].value;
      if(result[3].status==='fulfilled'&&!state.modeTouched){state.mode=result[3].value.policy.autonomy_mode||'supervised';if(live(state))document.getElementById('pwMode').value=state.mode;}
      if(live(state)){if(state.surface==='chat'&&!state.peek)paintSessions(state);paintTargets(state);paintTasks(state);paintBackground();if(!state.optionSaving&&!document.activeElement?.closest('#pwRuntime'))paintChatOptions(state);if(result[0].status==='rejected')error('Failed to load task:'+result[0].reason.message,state);
        const updated=state.tasks.find(t=>t.id===state.review?.id);
        if(updated&&(updated.version!==state.review.version||updated.status!==state.review.status)){
          const oldRun=state.review.latest_run,newRun=updated.latest_run,changedOutput=!!oldRun&&(oldRun.id!==newRun?.id||(oldRun.checkpoint?.output_revision||0)!==(newRun?.checkpoint?.output_revision||0));
          if(changedOutput&&showsReview(state,state.review)){state.reviewStale=true;notice('A newer artifact version exists. This preview and review still show the old version; view the latest artifact and review again.',state);paintReview(state,state.review);}
          else if(state.surface==='tasks'&&state.section==='task-detail')await openTask(updated.id,state.id);
          else{state.review=updated;paintReview(state,updated);}
        }
      }
    }finally{state.refreshing=false;}
  }
  function stateBindingName(task){return get(task.project_id).bindings.find(b=>b.id===task.executor_binding_id)?.name||'Project executor';}
  function paintTasks(state){
    if(!live(state))return;paintExecutionCounts(state);
    if(state.section==='tasks'){if(state.taskCenterHost?.isConnected)state.taskCenterHost.__taskCenterRefresh?.();}
  }
  function paintExecutionCounts(state){
    if(!live(state))return;const rows=(state.executionRows||[]).filter(row=>!row.deleted_at);
    document.getElementById('pwRunning').textContent='Running '+rows.filter(t=>t.status==='running').length;
    document.getElementById('pwPending').textContent='To confirm '+rows.filter(t=>['awaiting_review','waiting_input'].includes(t.status)).length;
    document.getElementById('pwFailed').textContent='Needs action '+rows.filter(t=>['failed','blocked','interrupted'].includes(t.status)).length;
  }
  async function prepareTask(state,goal,submission){
    const selected=targetRows(state).find(t=>t.value===state.target);if(!selected)throw new Error('The executor config changed; pick again.');
    const refs=submission.refs,inputs=[...refs.map(r=>({relative:r.relative})),...(submission.images||[]).map(image=>({asset_id:image.asset_id}))];const requestKey=crypto.randomUUID();
    const taskGoal=goal+refs.filter(r=>r.quote).map(r=>`\n\n[Material selection: ${r.relative}]\n${r.quote}`).join('');
    const mentionContext=(submission.mentions||[]).length?"\n\n[@ context]\n"+(submission.mentions||[]).map(item=>"@"+(item.label||item.id)+" ("+item.kind+": "+item.id+")").join(", "):"";
    let task;
    if(selected.node){
      const result=await api('/api/workflow/execution/prepare-node',{project_id:state.id,task_id:state.id,node_id:selected.node.id,layout_id:state.targets.layout_id,revision:state.targets.revision,
        ...selected.actor,goal:taskGoal+mentionContext,inputs,template_ref:submission.template,request_key:requestKey});task=result.task;
    }else task=(await api('/api/project-tasks/create',{project_id:state.id,title:goal.slice(0,90),goal:taskGoal+mentionContext,inputs,template_ref:submission.template,executor_binding_id:selected.binding.id,member_id:selected.member?.id||'',review_required:true,request_key:requestKey})).task;
    task=(await api('/api/project-tasks/mode',{id:task.id,project_id:state.id,autonomy_mode:state.mode})).task;
    if(draft(state).text===submission.text){draft(state).text='';draft(state).images=[];}persist(state);if(live(state)){paintDraft(state);state.tasks=[task,...state.tasks.filter(t=>t.id!==task.id)];paintTasks(state);notice('Task prepared, no model called yet. Check the goal, materials, and experts in the task chat, then start.',state);if(state.surface==='chat'&&!draft(state).text.trim()){state.sending=false;await openConversation(task.chat_id,state.id);}}
  }
  async function taskCommand(state,id,action){
    const task=state.tasks.find(t=>t.id===id);if(!task)return;
    if(action==='start'&&task.latest_run?.checkpoint?.phase==='tool'){ProjectTasks.openTask(id,state.id);return;}
    try{const result=await api('/api/project-tasks/'+action,{id,project_id:state.id,...(action==='start'?{autonomy_mode:state.mode,request_key:crypto.randomUUID()}:{})});state.tasks=state.tasks.map(t=>t.id===id?result.task:t);if(live(state)){error('',state);paintTasks(state);if(state.surface==='tasks'&&state.section==='task-detail'&&state.review?.id===id)await openTask(id,state.id);}}catch(err){error(err.message,state);}
  }
  async function showResource(section,state=mounted,options={}){
    if(options.surface==='workbench'&&section==='files')options={...options,surface:'library'};
    if(section==='tools')section='workflow';
    if(!live(state))return;if(section==='discussion')return switchSurface('chat',state);
    if(!options.initial&&!await flush())return;if(!live(state))return;notice('',state);error('',state);
    state.section=resources[section]?section:'overview';state.surface=options.peek?'chat':options.surface||resourceSurface[state.section];state.peek=!!options.peek;state.peekTree=false;state.navOpen=false;state.reading=state.section==='node-result';state.inspection=options.inspection||null;
    if(state.section==='node-result')state.navHidden=true;
    if(state.surface===resourceSurface[state.section])state.sections[state.surface]=state.section;
    if(state.surface==='library'&&state.section==='files')state.fileRow=state.libraryFile;
    state.resourceEpoch++;persist(state);document.getElementById('pwProjectSettings').open=false;
    document.getElementById('pwResourceTitle').textContent=state.section==='catalog'?'All materials':resources[state.section];
    const tree=document.getElementById('pwFileTree');if(tree?.parentElement!==document.getElementById('pwSidebarTreeSlot'))document.getElementById('pwSidebarTreeSlot').append(tree);
    document.getElementById('pwFileToolbar').replaceChildren();
    const area=document.getElementById('pwResource');area.firstElementChild?.__nodeDispose?.();area.innerHTML='<div class="pw-resource-content"></div>';const host=area.firstElementChild;
    if(state.section!=='files')tree.innerHTML='';layoutPanels(state);
    if(state.section==='run-artifacts'){
      await showRunArtifacts(state,host,options.runId);
      return;
    }
    if(state.section==='overview'){
      host.innerHTML='<div class="hint">Loading project overview...</div>';
      try{const view=await window.SpaceOverview(state.id);if(!live(state)||state.section!=='overview')return;host.innerHTML=view.html;view.bind();}
      catch(err){host.innerHTML='<div class="msg error">'+h(err.message||'Failed to read project overview')+'</div>';}
      return;
    }
    if(state.section==='node-result'){
      if(!state.nodeResultSelection){
        const eligibleTask=(state.tasks||[]).find(t=>WorkflowNodeWorkbench.eligible(t));
        if(eligibleTask){
          state.nodeResultSelection=WorkflowNodeWorkbench.availableSelection(eligibleTask);
        }else{
          host.innerHTML='<div class="wnw-empty" style="text-align:center;padding:60px 20px"><span class="pw-eyebrow" style="display:inline-block;margin-bottom:8px">WORKFLOW BENCH</span><h3 style="margin-bottom:10px">Workflow output workbench</h3><p class="hint" style="max-width:540px;margin:0 auto 16px">Current projectNo nodes have run. First LangGraph Prepare and start a run from the graph; node status shows here. Once a node saves its output you can preview it, edit the version, and hand it downstream.</p><div style="display:flex;justify-content:center;gap:10px"><button type="button" class="btn btn-primary" id="pwEmptyToFlow">View LangGraph Graph</button><button type="button" class="btn ghost" id="pwEmptyToChat">Back to the goal chat</button></div></div>';
          document.getElementById('pwEmptyToFlow')?.addEventListener('click',()=>showResource('workflow',state));
          document.getElementById('pwEmptyToChat')?.addEventListener('click',()=>switchSurface('chat',state));
          return;
        }
      }
      const epoch=state.resourceEpoch;
      await WorkflowNodeWorkbench.mount(host,{selection:state.nodeResultSelection,live:()=>live(state)&&state.section==='node-result'&&state.resourceEpoch===epoch,
        selected:selection=>{state.nodeResultSelection={...state.nodeResultSelection,...selection};persist(state);},
        select:selection=>openNodeResult(selection,state.id,{chatId:state.nodeResultSelection?.chat_id,peek:state.peek}),
        openConversation:chatId=>chatId?openConversation(chatId,state.id):switchSurface('chat',state),
        openTask:id=>openTask(id,state.id,{chatId:state.nodeResultSelection?.chat_id}),changed:()=>refresh(state),
        locate:identity=>{state.focusWorkflow={runId:identity.workflow_run_id,nodeId:identity.workflow_node_id};return showResource('workflow',state);}});return;
    }
    if(state.section==='files'){await mountFiles(state,host);return;}
    if(state.section==='papers'){
      const epoch=state.resourceEpoch;
      host.innerHTML=ProjectLiterature.html();
      await ProjectLiterature.mount(host.firstElementChild,state.id,[],()=>live(state)&&state.resourceEpoch===epoch&&host.isConnected);
      return;
    }
    if(['catalog','manuscripts','experiments','outputs'].includes(state.section)){const epoch=state.resourceEpoch;await ProjectResources.mount(host,state.id,{kind:{manuscripts:'manuscript',experiments:'experiment',outputs:'output'}[state.section]||'',live:()=>live(state)&&state.resourceEpoch===epoch&&host.isConnected});return;}
    if(['tasks','automation','plan'].includes(state.section)){state.taskCenterHost=host;await TaskCenter.render(host,{projectId:state.id,view:state.section==='automation'?'automation':state.section==='plan'?'plans':'board',filter:state.filter,live:()=>live(state)&&state.surface==='tasks',onSnapshot:rows=>{state.executionRows=rows;paintExecutionCounts(state);}});return;}
    if(state.section==='workflow'){await mountWorkflow(state,host);return;}
    if(state.section==='search'){await mountSearch(state,host);return;}
    const seq=state.resourceEpoch;host.innerHTML='<p class="pw-loading">Reading project material...</p>';
    try{const data=await api('/api/task?id='+encodeURIComponent(state.id));if(!live(state)||seq!==state.resourceEpoch||!host.isConnected)return;
      state.project=data;spId=state.id;spTab=state.section;host.innerHTML=`<div id="spBody">${spBodyHTML(data)}</div>`;await spBind(data);
      if(!live(state)||seq!==state.resourceEpoch||!host.isConnected)return;
      const graph=document.getElementById('spStars');if(graph&&window.StarMap){graph.__api=api;graph.__toast=toast;StarMap.mount(graph,data.paper_graph||{nodes:[],edges:[],stats:{}});}
      const generate=document.getElementById('spStarGen');if(generate)generate.onclick=async()=>{generate.disabled=true;try{await api('/api/task/papergraph/build',{id:state.id});if(live(state)&&state.section==='stars')await showResource('stars',state);}catch(err){error(err.message,state);if(generate.isConnected)generate.disabled=false;}};
    }catch(err){if(live(state)&&host.isConnected)host.innerHTML=`<p class="pw-error">${h(err.message)}</p>`;}
  }
  async function mountSearch(state,host){
    const query=state.searchQuery||'',seq=state.resourceEpoch;
    if(!query){host.innerHTML='<p class="hint">Type a keyword on the left to search this project’s literature, notes, progress, and evidence.</p>';return;}
    host.innerHTML='<p class="pw-loading">Searching the current project...</p>';
    try{
      const data=await api('/api/space/search?task_id='+encodeURIComponent(state.id)+'&q='+encodeURIComponent(query));
      if(!live(state)||seq!==state.resourceEpoch||!host.isConnected)return;
      const groups={papers:'Literature',notes:'Notes',todos:'Progress tasks',evidence:'Evidence'};
      host.innerHTML=`<div class="pw-view-head"><h3>“${h(query)}” search results</h3><span class="hint">${h(data.total||0)} items</span></div>`+Object.entries(groups).map(([key,label])=>{
        const rows=data.results?.[key]||[];if(!rows.length)return '';
        return `<section class="pw-search-results"><h4>${label}</h4>${rows.map(row=>`<button type="button" data-pw-search-group="${key}"><strong>${h(row.title||row.filename||row.claim||'Untitled')}</strong><span>${h(row.snippet||row.quote||row.authors||row.status||'')}</span></button>`).join('')}</section>`;
      }).join('')+(!data.total?'<p class="hint">No matching material in this project.</p>':'');
      host.querySelectorAll('[data-pw-search-group]').forEach(button=>button.onclick=()=>showResource({papers:'papers',notes:'notes',todos:'plan',evidence:'overview'}[button.dataset.pwSearchGroup],state));
    }catch(err){if(live(state)&&seq===state.resourceEpoch&&host.isConnected)host.innerHTML=`<p class="pw-error">Search failed: ${h(err.message)}</p>`;}
  }
  async function createEntry(projectId,parent,kind){
    const state=get(projectId);if(!live(state)||!await flush())return;
    const name=await uiPrompt(kind==='folder'?'New folder name':'New file name (with extension)',kind==='file'?'Untitled.md':'');if(!name?.trim())return;
    try{
      const row=await api('/api/project/files/create',{project_id:projectId,parent,name:name.trim(),kind});
      if(!live(state))return;
      if(parent){flExpanded.add(parent);flSaveExpanded();}
      await flInitTree();if(!live(state))return;
      if(kind==='file'){await openFile(row,projectId,{peek:false});if(live(state)&&flCurrentFile?.row.rel===row.rel){flCurrentMode='edit';flRenderContent();layoutPanels(state);document.getElementById('flEditText')?.focus();}}
      notice(kind==='folder'?'Folder created in the current directory.':'File created, ready to edit.',state);
    }catch(err){error('Create failed:'+err.message,state);}
  }
  async function refreshFiles(projectId,oldRelative,newRelative=''){
    const state=get(projectId),matches=rel=>rel===oldRelative||rel?.startsWith(oldRelative+'/');
    const change=row=>{if(!row||!matches(row.rel))return row;if(!newRelative)return null;const rel=newRelative+row.rel.slice(oldRelative.length);return {...row,rel,path:row.path.slice(0,-row.rel.length)+rel.replaceAll('/',row.path.includes('\\')?'\\':'/'),name:rel.split('/').pop(),ext:rel.split('.').pop()};};
    const changed=matches(state.fileRow?.rel);state.fileRow=change(state.fileRow);state.libraryFile=change(state.libraryFile);
    if(matches(state.fileDirectory))state.fileDirectory=newRelative?newRelative+state.fileDirectory.slice(oldRelative.length):oldRelative.split('/').slice(0,-1).join('/');
    if(live(state)){for(const rel of [...flExpanded])if(matches(rel)){flExpanded.delete(rel);if(newRelative)flExpanded.add(newRelative+rel.slice(oldRelative.length));}flSaveExpanded();}
    if(newRelative)Object.values(state.drafts).forEach(value=>(value.refs||[]).forEach(ref=>{if(matches(ref.relative)){ref.relative=newRelative+ref.relative.slice(oldRelative.length);ref.name=ref.relative.split('/').pop();}}));
    persist(state);if(!live(state))return;
    if(changed){flCurrentFile=null;flSel=state.fileRow?.rel||'';}
    if(state.section==='files'&&(state.surface!=='chat'||state.peek))await showResource('files',state,{peek:state.peek,surface:state.surface,inspection:state.inspection});
    paintRefs(state);
  }
  async function mountFiles(state,host){
    const previous=typeof flCurrentFile!=='undefined'&&flCurrentFile?.projectId===state.id&&state.fileRow?.path===flCurrentFile.row.path&&!state.fileRow.read_only?flCurrentFile:null;
    host.innerHTML='<div id="pwInlineTree" class="pw-inline-tree"></div>'+filesPanelHTML(true);
    const tree=host.querySelector('.fl-grid>.fl-col'), fileBrowser=state.surface==='library';
    document.getElementById('pwFileTree').replaceChildren(tree);
    if(fileBrowser)tree.querySelector('.fl-h').insertAdjacentHTML('afterend','<button type="button" class="pw-file-root pw-text-button" data-pw-root-folder>Project root</button>');
    document.getElementById('pwFileToolbar').replaceChildren(host.querySelector('.fl-grid>.fl-col:last-child>.fl-h'));
    document.getElementById('flHand').textContent='Hand to an expert or team';document.getElementById('flHand').title='Assign to a project expert, an expert, or a multi-agent team';document.getElementById('flHandoffHistory').textContent='Task log';
    const treeReady=flBind();
    // Open the target picker first.  The previous direct ``project`` shortcut
    // attempted to save and create a task before the user could enter a goal,
    // which also discarded the handoff dialog when a file-save barrier fired.
    document.getElementById('flHand').onclick=()=>FileHandoff.open({project_id:state.id,relative:flSel});
    layoutPanels(state);
    const list=document.getElementById('flList');
    list.onclick=async event=>{
      const el=event.target.closest('[data-rel]');if(!el||!live(state))return;
      const row=flFindRow(el.dataset.rel);if(!row)return;
      if(!row.dir)return openFile(row,state.id);
      if(fileBrowser&&(state.fileRow||row.rel!==state.fileDirectory))return browseDirectory(state,row.rel);
      if(flExpanded.has(row.rel))flExpanded.delete(row.rel);else flExpanded.add(row.rel);
      flSaveExpanded();flRenderTree();
      if(flExpanded.has(row.rel)&&!flTreeCache[row.rel]){await flLoadNode(row.rel);if(list.isConnected)flRenderTree();}
    };
    tree.querySelector('[data-pw-root-folder]')?.addEventListener('click',()=>browseDirectory(state,''));
    if(previous){flCurrentFile=previous;flSel=previous.row.rel;document.getElementById('flName').textContent=previous.row.name;document.getElementById('pwResourceTitle').textContent=previous.row.name;document.getElementById('flModeTabs').style.display='inline-flex';document.getElementById('flSaveBtn').style.display='';document.getElementById('flHand').disabled=false;document.getElementById('flHandoffHistory').disabled=false;flUpdateModeTabs();flRenderContent();layoutPanels(state);}
    else if(state.fileRow)await displayFile(state,state.fileRow);
    else if(fileBrowser){await treeReady;if(host.isConnected&&!state.fileRow)await browseDirectory(state,state.fileDirectory||'');}
    if(!host.isConnected)return;
    document.getElementById('flReload').onclick=async()=>{if(await flush()&&live(state)){await flInitTree();if(host.isConnected&&fileBrowser&&!state.fileRow)await browseDirectory(state,state.fileDirectory||'');}};
    document.getElementById('flOpen').onclick=async()=>{if(!state.fileRow)return;try{if(await flush())await api('/api/conv/open',{path:state.fileRow.path});}catch(err){error(err.message,state);}};
  }
  async function browseDirectory(state,relative){
    const stage=document.getElementById('flStage');
    if(!stage||!live(state)||!await flush()||!stage.isConnected)return;
    const ticket=state.fileRequest=(state.fileRequest||0)+1;
    state.fileDirectory=relative;state.fileRow=null;state.libraryFile=null;state.reading=false;
    const parts=relative?relative.split('/'):[];
    for(let i=1;i<=parts.length;i++)flExpanded.add(parts.slice(0,i).join('/'));
    flSaveExpanded();
    flCurrentFile=null;flSel=relative;
    document.getElementById('pwResourceTitle').textContent='Folders and files';
    persist(state);layoutPanels(state);flRenderTree();
    stage.innerHTML='<p class="hint">Reading the folder...</p>';
    if(!flTreeCache[relative])await flLoadNode(relative);
    if(!live(state)||!stage.isConnected||ticket!==state.fileRequest)return;
    const rows=flTreeCache[relative];
    const breadcrumbs=['Project root',...parts].map((name,index)=>`<button type="button" class="pw-text-button" data-pw-folder-path="${index}">${h(name)}</button>`).join('<span aria-hidden="true">/</span>');
    stage.innerHTML=`<section class="pw-directory"><nav class="pw-directory-path" aria-label="Current folder">${breadcrumbs}</nav><div class="pw-directory-heading"><h3>${h(parts.at(-1)||'Project root')} <small>${rows?.length??0} items</small></h3><input type="search" class="control" aria-label="Filter this folder" placeholder="Filter this folder"></div><div data-pw-folder-rows></div></section>`;
    stage.querySelectorAll('[data-pw-folder-path]').forEach(button=>button.onclick=()=>browseDirectory(state,parts.slice(0,Number(button.dataset.pwFolderPath)).join('/')));
    const search=stage.querySelector('input'), results=stage.querySelector('[data-pw-folder-rows]');
    function paint(){
      const query=search.value.trim().toLocaleLowerCase();
      const visible=(rows||[]).filter(row=>row.name.toLocaleLowerCase().includes(query));
      results.innerHTML=visible.map(row=>`<button type="button" class="pw-directory-row" data-pw-file-entry="${h(row.rel)}"><span aria-hidden="true">${row.dir?'📁':flGetIcon(row.ext)}</span><strong>${h(row.name)}</strong><small>${row.dir?'Folder':h(flFmtSize(row.size)||row.ext.toUpperCase())}</small><time>${h(row.at)}</time></button>`).join('')||`<p class="hint pw-directory-empty">${!rows?'Cannot read this folder; refresh and try again.':query?'No matching projects in this folder.':'This folder is empty.'}</p>`;
      results.onclick=event=>{
        const button=event.target.closest('[data-pw-file-entry]');
        const row=visible.find(item=>item.rel===button?.dataset.pwFileEntry);
        if(!row)return;
        if(!row.dir)return openFile(row,state.id,{peek:false});
        return browseDirectory(state,row.rel);
      };
    }
    search.oninput=paint;
    paint();flRenderTree();
  }
  function relative(path,base){const normal=v=>String(v||'').replaceAll('\\','/').replace(/\/+$/,'');const p=normal(path),b=normal(base);return p.toLowerCase().startsWith(b.toLowerCase()+'/')?p.slice(b.length+1):'';}
  async function openFile(row,projectId=curTask,options={}){
    if(projectId!==mounted?.id){await openProject(projectId);}
    const state=get(projectId);if(!live(state)||!await flush())return;
    const project=(S.tasks||[]).find(p=>p.id===projectId)||state.project?.task||{};
    const rel=row.paper_id?`paper:${row.paper_id}`:(row.read_only?relative(row.path,project.base_dir):'')||row.rel||row.relative||relative(row.path,project.base_dir);
    if(!rel)return error('This file is not saved as a copy in the current project. Import the project first.',state);
    const task=state.review,output=options.inspection?.origin==='task'||row.read_only&&(task?.outputs||[]).some(o=>o.path===row.path),peek=!output&&(options.peek===true||options.peek!==false&&state.surface==='chat');
    state.fileRequest=(state.fileRequest||0)+1;state.fileRow={...row,rel,name:row.name||rel.split('/').pop(),ext:row.ext||rel.split('.').pop(),project_id:projectId};
    if(!output&&!peek)state.libraryFile=state.fileRow;
    const inspection=output?options.inspection||{origin:'task',taskId:task.id}:peek?{origin:'chat'}:null;
    if(state.section!=='files'||!document.getElementById('flStage')||state.peek!==peek||output&&state.surface!=='tasks')await showResource('files',state,{peek,surface:output?'tasks':'library',inspection});
    else if(live(state)){state.inspection=inspection;await displayFile(state,state.fileRow);}
  }
  async function displayFile(state,row){
    if(!live(state))return;const ticket=state.fileRequest;if(flCurrentFile?.row?.path!==row.path)flCurrentMode='preview';await flShow(row);if(!live(state)||ticket!==state.fileRequest||state.fileRow?.rel!==row.rel)return;
    state.fileRow=row;persist(state);document.getElementById('pwResourceTitle').textContent=row.name;layoutPanels(state);
    if(row.read_only){flCurrentMode='preview';flUpdateModeTabs();flRenderContent();document.getElementById('flModeTabs').style.display='none';document.getElementById('flSaveBtn').style.display='none';}
  }
  function currentFile(){if(!active()||mounted.surface==='chat'&&!mounted.peek)return null;if(mounted.section==='files'&&mounted.fileRow&&!mounted.fileRow.paper_id)return {project_id:mounted.id,relative:mounted.fileRow.rel};if(mounted.section==='notes'&&typeof mdProj!=='undefined'&&mdProj?.path)return {project_id:mounted.id,relative:mdProj.path};return null;}
  async function addReference(state,quotation=''){
    if(!live(state)||!await flush())return;const file=currentFile();if(!file)return notice('Open a project file, PDF, or note before citing it into this chat.',state);
    const ref={relative:file.relative,name:file.relative.split('/').pop(),quote:quotation,read_only:state.section==='files'&&!!state.fileRow?.read_only};if(!draft(state).refs.some(r=>r.relative===ref.relative&&r.quote===ref.quote))draft(state).refs.push(ref);persist(state);paintRefs(state);await switchSurface('chat',state);document.getElementById('pwAsk').focus();
  }
  async function referenceResource(row,projectId=curTask){
    if(!row?.relative)return notice("\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u53ef\u7528\u7684\u9879\u76ee\u6587\u4ef6",mounted);
    if(!active()||mounted?.id!==projectId)await openProject(projectId);
    const state=get(projectId);if(!live(state)||!await flush())return;
    const ref={relative:row.relative,name:row.title||row.name||row.relative.split('/').pop(),quote:'',read_only:!!row.read_only};
    if(!draft(state).refs.some(item=>item.relative===ref.relative&&!item.quote))draft(state).refs.push(ref);
    persist(state);paintRefs(state);await switchSurface('chat',state);document.getElementById('pwAsk')?.focus();
  }
  async function handoffResource(row,projectId=curTask){
    if(!row?.relative)return notice("\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u53ef\u7528\u7684\u9879\u76ee\u6587\u4ef6",mounted);
    if(!active()||mounted?.id!==projectId)await openProject(projectId);
    const state=get(projectId);if(!live(state)||!await flush())return;
    const child=await ProjectTasks.compose(projectId,{title:row.title||row.name||row.relative.split('/').pop(),goal:'',inputs:[{relative:row.relative}],metadata:{source:'file_handoff'},quick:true});
    child?.addEventListener('close',()=>refresh(state),{once:true});
  }
  async function openReference(state,index){
    const ref=draft(state).refs[index];if(!ref||!live(state))return;
    try{const data=await api('/api/file/location',{project_id:state.id,relative:ref.relative});if(live(state))await openFile({rel:ref.relative,path:data.path,name:ref.name||ref.relative.split('/').pop(),ext:ref.relative.split('.').pop(),read_only:!!ref.read_only},state.id,{peek:true});}
    catch(err){error('Cannot open referenced material:'+err.message,state);}
  }
  async function quote(state){
    const selected=window.getSelection()?.toString()||'';let text=selected;
    if(!text){const editor=document.getElementById('flEditText')||document.getElementById('mdSource');if(editor&&editor.selectionStart!==editor.selectionEnd)text=editor.value.slice(editor.selectionStart,editor.selectionEnd);}
    if(!text){text=await uiPrompt('Paste the passage to cite; it links to the open project material','');if(text===null)return;}
    if(text.trim())await addReference(state,text.trim());
  }
  async function openPaper(row){const state=mounted;if(!live(state))return;const data=await api('/api/task?id='+encodeURIComponent(state.id));if(!live(state))return;state.project=data;const paper=(data.paper_list||[]).find(p=>p.id===row.paper_id||p.id===row.id);if(!paper)return error('This project PDF was not found.',state);await openFile({path:paper.source_path||paper.path,paper_id:paper.source_path?'':paper.id,name:paper.filename||paper.title||row.title,ext:'pdf',read_only:true},state.id);}
  async function openProject(id){if(!S.tasks.some(p=>p.id===id))await refreshState(false);if(!S.tasks.some(p=>p.id===id))throw new Error('Project not found');if(active())await switchProject(id);else{curTask=id;localStorage.setItem('rw-task',id);await openTab('workspace');}return get(id);}
  async function openNodeResult(selection,projectId=curTask,options={}){
    if(typeof selection==='string')selection={task_id:selection};
    projectId=selection.project_id||projectId;
    if(!active()||mounted.id!==projectId)await openProject(projectId);
    const state=get(projectId);if(!live(state)||!await flush())return;
    state.nodeResultSelection={...selection,project_id:projectId,chat_id:options.chatId||selection.chat_id||state.reviewOrigins?.[selection.task_id]||state.chatId};
    state.review=null;await showResource('node-result',state,{initial:true,peek:options.peek??state.surface==='chat'});
  }
  async function showRunArtifacts(state,host,runId){
    host.innerHTML=`<div class="pw-view-head"><div data-pw-run-picker></div><span class="pw-workbench-scope">Workflow runs and node output</span></div><div data-pw-run-list><p class="hint">LoadingRun records...</p></div>`;
    const isCurrent=()=>host.isConnected&&live(state)&&state.surface==='workbench'&&state.section==='run-artifacts';
    const list=host.querySelector('[data-pw-run-list]');
    const project=encodeURIComponent(state.id);
    try{
      const {runs=[]}=await api('/api/workflow/execution?project_id='+project);
      if(!isCurrent())return;
      const selected=runs.find(run=>run.id===(runId||state.artifactRunId))||runs[0];
      if(!selected){list.innerHTML='<p class="hint">After a workflow run, this delivery is shown here by stage.</p>';return;}
      host.querySelector('[data-pw-run-picker]').innerHTML='<label>Workflow run <select class="control" data-pw-artifact-run>'+runs.map(run=>'<option value="'+h(run.id)+'" '+(run===selected?'selected':'')+'>'+h(run.layout_name||run.name||'Workflow')+' · '+h(labels[run.status]||run.status)+' · '+h(run.started_at||run.id)+'</option>').join('')+'</select></label>';
      let request=0;
      const loadNodes=async run=>{
        const token=++request;
        state.artifactRunId=run.id;
        persist(state);
        list.innerHTML='<p class="hint">Reading node status...</p>';
        try{
          const {tasks=[]}=await api('/api/project-tasks?project_id='+project+'&workflow_run_id='+encodeURIComponent(run.id));
          if(!isCurrent()||token!==request)return;
          const stages=tasks.filter(task=>task.workflow_node_id&&!task.parent_task_id);
          const nodes=new Map(stages.map(task=>[task.workflow_node_id,task]));
          const order=run.node_order||[];
          const ordered=[...order.map(id=>nodes.get(id)).filter(Boolean),...stages.filter(task=>!order.includes(task.workflow_node_id))];
          list.innerHTML=ordered.map((task,index)=>`<div class="pw-output"><b>${h(task.title)}</b><p class="hint">${h(labels[task.status]||task.status)}</p>${task.latest_run?.error?`<p class="pw-error">${h(task.latest_run.error)}</p>`:''}<button type="button" class="btn" data-pw-artifact="${index}">${WorkflowNodeWorkbench.eligible(task)?'View output':'View node status'}</button></div>`).join('')||'<p class="hint">This run has not produced node tasks yet.</p>';
          list.querySelectorAll('[data-pw-artifact]').forEach(button=>button.onclick=()=>{
            const task=ordered[Number(button.dataset.pwArtifact)];
            return openNodeResult({...WorkflowNodeWorkbench.availableSelection(task),workflow_run_id:run.id},state.id,{peek:false});
          });
        }catch(err){if(isCurrent()&&token===request)list.textContent='Read node status failed:'+err.message;}
      };
      host.querySelector('[data-pw-artifact-run]').onchange=event=>{
        const run=runs.find(candidate=>candidate.id===event.target.value);
        if(run&&isCurrent())loadNodes(run);
      };
      await loadNodes(selected);
    }catch(err){if(isCurrent())list.textContent='Read run output failed:'+err.message;}
  }
  async function openWorkflowRun(projectId=curTask,runId='',nodeId=''){
    if(!projectId)return;
    if(!active()||mounted?.id!==projectId)await openProject(projectId);
    const state=get(projectId);if(!live(state)||!await flush())return;
    if(runId&&nodeId){
      try{
        const data=await api('/api/project-tasks?project_id='+encodeURIComponent(projectId)+'&workflow_run_id='+encodeURIComponent(runId));
        const task=(data.tasks||[]).find(item=>item.workflow_node_id===nodeId);
        if(task)return openNodeResult(WorkflowNodeWorkbench.availableSelection(task),projectId,{chatId:state.chatId,peek:false});
      }catch{}
    }
    state.focusWorkflow={runId:String(runId||''),nodeId:String(nodeId||'')};
    state.nodeResultSelection=null;
    state.navHidden=false;
    await showResource('workflow',state,{initial:true});
  }
  async function openWorkflowNode(projectId,nodeId,layoutId=''){
    if(!projectId||!nodeId)return false;
    const {runs=[]}=await api('/api/workflow/execution?project_id='+encodeURIComponent(projectId));
    const run=layoutId?runs.find(item=>item.layout_id===layoutId):runs[0];if(!run)return false;
    const {tasks=[]}=await api('/api/project-tasks?project_id='+encodeURIComponent(projectId)+'&workflow_run_id='+encodeURIComponent(run.id));
    const task=tasks.find(item=>item.workflow_node_id===nodeId);
    if(!task)return false;
    await openNodeResult(WorkflowNodeWorkbench.availableSelection(task),projectId,{peek:false});
    return true;
  }
  async function openStage(projectId, step){
    if(!projectId)throw new Error('Select a project first');
    return uiNavigate(async()=>{
      await openProject(projectId);
      const state=get(projectId);
      if(!live(state))return;
      const layout=await api('/api/workflow/layouts/state?task_id='+encodeURIComponent(projectId));
      if(!live(state))return;
      const node=layout.nodes.find(item=>item.step===step);
      if(node&&await openWorkflowNode(projectId,node.id,layout.layout.id))return;
      if(!live(state))return;
      if(node)await api('/api/workflow/layouts/select',{task_id:projectId,layout_id:layout.layout.id,node_id:node.id});
      if(live(state))await showResource('workflow',state);
    });
  }
  async function openTask(id,projectId=curTask,options={}){
    if(!active()||mounted.id!==projectId)await openProject(projectId);
    const state=get(projectId);if(!live(state)||!await flush())return;
    state.reviewOrigins||={};if(options.chatId)state.reviewOrigins[id]=options.chatId;state.reviewChatId=state.reviewOrigins[id]||'';
    const seq=++state.resourceEpoch;let task;
    try{task=(await api('/api/project-tasks/detail?id='+encodeURIComponent(id)+'&project_id='+encodeURIComponent(projectId))).task;}catch(err){return error(err.message,state);}
    if(!live(state)||seq!==state.resourceEpoch)return;
    const peek=options.peek??(state.surface==='chat');
    if(task.workflow_run_id&&task.workflow_node_id&&options.preferWorkbench!==false){
      return openNodeResult(WorkflowNodeWorkbench.availableSelection(task),projectId,{chatId:options.chatId||state.reviewChatId,peek});
    }
    state.tasks=[task,...state.tasks.filter(t=>t.id!==task.id)];state.review=task;state.reviewStale=false;state.section='task-detail';state.surface=peek?'chat':'tasks';state.peek=peek;state.navOpen=false;state.reading=false;state.inspection=null;persist(state);document.getElementById('pwFileToolbar').replaceChildren();document.getElementById('pwResourceTitle').textContent=task.title||'Task review';
    const run=task.latest_run||{},decision=(task.deliveries||[]).at(-1),outputs=!task.workflow_run_id||WorkflowNodeWorkbench.eligible(task)?task.outputs||[]:[];
    const tree=document.getElementById('pwFileTree');if(tree)document.getElementById('pwSidebarTreeSlot').append(tree);layoutPanels(state);
    const tipHtml=['ready','draft'].includes(task.status)?`<div class="pt-box" style="margin:10px 0;background:var(--panel2);border-left:3px solid var(--accent);padding:10px 14px"><strong style="color:var(--accent)">💡 This node is ready to run</strong><p class="hint" style="margin:4px 0 0">Click ”${run.id?'Run again':'Start task'}”Starts the run; when output exists you can preview and edit it right here.</p></div>`:['running','queued'].includes(task.status)?`<div class="pt-box" style="margin:10px 0;background:var(--panel2);border-left:3px solid var(--accent);padding:10px 14px"><strong style="color:var(--accent)">⏳ An expert is working this node</strong><p class="hint" style="margin:4px 0 0">Once output exists this becomes the preview, version comparison, and editor...</p></div>`:'';
    document.getElementById('pwResource').innerHTML=`<article class="pw-task-detail"><div class="pw-view-head"><span class="pw-state">${h(labels[task.status]||task.status)}</span><span class="hint">${run.id?'attempt '+run.attempt:'Not run yet'}</span></div><h3>${h(task.title)}</h3><p>${h(task.goal)}</p>${tipHtml}<p class="hint">Executor: ${h(run.executor_snapshot?.member?.name||run.executor_snapshot?.assistant?.name||stateBindingName(task))}${task.workflow_run_id?' · Current workflow node':''}</p>${run.error?`<p class="pw-error">${h(run.error)}</p>`:''}<div class="pw-view-head">${['ready','failed','blocked','cancelled'].includes(task.status)?`<button class="btn btn-primary" data-pw-start="${h(task.id)}">${run.checkpoint?.phase==='tool'?'Confirm interrupt and continue':run.id?'Run again':'Start task'}</button>`:''}${['queued','running','blocked'].includes(task.status)?`<button class="btn ghost" data-pw-cancel="${h(task.id)}">Stop task</button>`:''}<button class="btn ghost" id="pwTaskAdvanced">Full run record</button></div><h4>Results</h4><div class="md">${md(run.checkpoint?.reply||'Waiting for the result.')}</div><h4>Output versions</h4>${run.checkpoint?.output_revision?`<p class="hint">Manual revision v${run.checkpoint.output_revision} · Review is based on the current output</p>`:""}${outputs.map((o,i)=>`<div class="pw-output"><b>${h(o.name||o.relative||'Task artifacts')}</b><p class="hint">${h((o.content_hash||o.sha256||'').slice(0,16))} · Version pinned for this run</p><button class="btn btn-primary" data-pw-output-fullscreen="${i}">Full-screen preview</button><button class="btn ghost" data-pw-output="${i}">Open file</button>${ProjectOutputReview.canEdit(task,o)?`<button class="btn ghost" data-pw-output-edit="${i}">Manual revision</button>`:""}</div>`).join('')||'<p class="hint">No artifacts generated yet.</p>'}${decision?`<p class="hint">${h(decision.source==='human'?'Manual review':decision.source==='policy'?'Policy review':'Past deliverables')} · ${h(decision.feedback||'')} · ${h(decision.created_at||'')}</p>`:''}<details><summary>Task input and run scope</summary><pre>${h(JSON.stringify({inputs:run.input_snapshot||task.inputs,scope:task.scope},null,2))}</pre></details></article>`;
    document.getElementById('pwTaskAdvanced').onclick=()=>ProjectTasks.openTask(id,state.id);
    if(task.chat_id){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Open task chat';button.onclick=()=>openConversation(task.chat_id,state.id);document.getElementById('pwTaskAdvanced').parentElement.prepend(button);}
    const actions=document.getElementById('pwTaskAdvanced').parentElement;
    if(task.workflow_run_id&&task.workflow_node_id){
      const button=document.createElement('button');button.type='button';button.className='btn btn-primary';button.dataset.pwNodeResult=task.id;button.textContent=WorkflowNodeWorkbench.eligible(task)?'View this node’s output':'Open current node workbench';button.onclick=()=>openNodeResult(WorkflowNodeWorkbench.availableSelection(task),state.id,{chatId:state.reviewChatId||state.chatId});actions.prepend(button);
    }
    if(task.workflow_run_id){
      const button=document.createElement('button');button.className='btn ghost';button.textContent='Locate workflow node';button.onclick=async()=>{state.focusWorkflow={runId:task.workflow_run_id,nodeId:task.workflow_node_id};await showResource('workflow',state);};actions.append(button);
    }
    if(task.metadata?.stage==='map'&&task.metadata?.node_config?.node_kind!=='tool'&&task.status==='awaiting_review'&&(!task.workflow_run_id||WorkflowNodeWorkbench.eligible(task))){
      const button=document.createElement('button');button.className='btn btn-primary';button.dataset.pwGraphEdit='';button.textContent='Edit node evidence chain';button.onclick=()=>WorkflowReview.editGraph(state.id,task.id,()=>openTask(task.id,state.id));actions.append(button);
    }
    if(state.reviewChatId){
      const button=document.createElement('button');button.className='btn ghost';button.textContent='Back to originating chat';button.onclick=()=>openConversation(state.reviewChatId,state.id);actions.append(button);
    }
    document.querySelectorAll('[data-pw-output]').forEach(b=>b.onclick=()=>openFile({...outputs[Number(b.dataset.pwOutput)],path:outputs[Number(b.dataset.pwOutput)].path,read_only:true},state.id,{surface:'tasks',inspection:{origin:'task',taskId:task.id}}));
    document.querySelectorAll('[data-pw-output-fullscreen]').forEach(button=>button.onclick=()=>ProjectOutputReview.open(state.id,task.id,Number(button.dataset.pwOutputFullscreen),()=>openTask(task.id,state.id)));
    document.querySelectorAll('[data-pw-output-edit]').forEach(button=>button.onclick=()=>ProjectOutputReview.open(state.id,task.id,Number(button.dataset.pwOutputEdit),()=>openTask(task.id,state.id)));
    paintReview(state,task);
  }
  function showsReview(state,task){
    return (state.surface==='tasks'||state.peek)&&(state.section==='task-detail'||(state.inspection?.origin==='task'&&state.inspection.taskId===task.id&&state.section==='files'&&(task.outputs||[]).some(o=>o.path===state.fileRow?.path)));
  }
  function paintReview(state,task){
    const host=document.getElementById('pwReview');if(!live(state)||!host)return;
    host.hidden=task.status!=='awaiting_review'||!showsReview(state,task);if(host.hidden)return;
    const feedback=state.feedback?.[task.id]||'';
    host.innerHTML=`<div class="pw-context-bar">Review target: ${h(task.title)} · attempt ${task.latest_run.attempt} outputs</div><label>Review note<textarea class="control" id="pwFeedback" placeholder="record your reasoning; state the required changes when returning it">${h(feedback)}</textarea></label><div class="pw-view-head"><button type="button" class="btn btn-primary" id="pwApprove">Accept and deliver</button><button type="button" class="btn ghost" id="pwReject">Return for revision</button></div>`;
    document.getElementById('pwFeedback').oninput=e=>{state.feedback||={};state.feedback[task.id]=e.target.value;};
    const review=async approved=>{const text=document.getElementById('pwFeedback').value;if(!approved&&!text.trim())return error('Fill in the change request before sending the task back.',state);host.querySelectorAll('button').forEach(b=>b.disabled=true);try{const result=await api('/api/project-tasks/review',{id:task.id,project_id:state.id,reviewed_run_id:task.latest_run.id,reviewed_output_version:task.latest_run.checkpoint?.output_revision||0,approved,feedback:text,request_key:crypto.randomUUID()});state.review=result.task;host.hidden=true;await refresh(state);if(live(state))notice(approved?'Manual review recorded and the current version delivered.':'Sent back. The retry task will include your change notes.',state);}catch(err){error(err.message,state);host.querySelectorAll('button').forEach(b=>b.disabled=false);}};
    document.getElementById('pwApprove').onclick=()=>review(true);document.getElementById('pwReject').onclick=()=>review(false);
    const retry=document.createElement('button');retry.type='button';retry.className='btn ghost';retry.id='pwRejectRetry';retry.textContent='Return and redo';
    retry.onclick=async()=>{const feedback=document.getElementById('pwFeedback').value;if(!feedback.trim())return error('Enter rework requirements.',state);host.querySelectorAll('button').forEach(button=>button.disabled=true);try{await api('/api/project-tasks/review',{id:task.id,project_id:state.id,reviewed_run_id:task.latest_run.id,reviewed_output_version:task.latest_run.checkpoint?.output_revision||0,approved:false,retry:true,feedback,request_key:crypto.randomUUID()});await openTask(task.id,state.id);}catch(err){error(err.message,state);host.querySelectorAll('button').forEach(button=>button.disabled=false);}};
    document.getElementById('pwReject').after(retry);
    if(state.reviewStale){host.querySelectorAll('button').forEach(button=>button.disabled=true);const latest=document.createElement('button');latest.type='button';latest.className='btn';latest.dataset.pwReviewReload='';latest.textContent='Review the latest output, then check again';latest.onclick=()=>{const updated=state.tasks.find(item=>item.id===task.id);if(WorkflowNodeWorkbench.eligible(updated))return openNodeResult(WorkflowNodeWorkbench.availableSelection(updated),state.id,{chatId:state.reviewChatId});return openTask(task.id,state.id);};host.append(latest);}
  }
  async function mountWorkflow(state,host){
    await ProjectWorkflowGraph.mount(host,{
       projectId:state.id,live:()=>live(state)&&state.section==='workflow',
       focus:state.focusWorkflow,
       saved:()=>refresh(state),reload:()=>showResource('workflow',state),openTask:id=>openTask(id,state.id),openArtifacts:runId=>showResource('run-artifacts',state,{runId}),openResult:selection=>openNodeResult(selection,state.id,{chatId:state.chatId}),
      handoff:async nodeId=>{
        state.scope='workflow';state.targets=await api('/api/handoff/targets?project_id='+encodeURIComponent(state.id));
        await refresh(state);if(!live(state))return;
        document.getElementById('pwScope').value='workflow';paintTargets(state);
        const choice=targetRows(state).find(target=>target.node.id===nodeId);
        if(!choice)return error('This node has no usable executor. Configure a node executor first.',state);
        state.target=choice.value;paintTargets(state);document.getElementById('pwRecipient').value=choice.value;
        paintSend(state);paintChatOptions(state);persist(state);await switchSurface('chat',state);document.getElementById('pwAsk').focus();
      }
    });
    state.focusWorkflow=null;
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing&&active()&&!document.querySelector('dialog[open],.modal:not(.hidden)')){const run=mounted.chatId&&chatRecord(mounted.chatId).run;if(run?.status==='running'){e.preventDefault();api('/api/agent/cancel',{idempotency_key:run.key}).catch(err=>error(err.message));}}});
  window.addEventListener('beforeunload',e=>{if(active()&&hasDirty()){e.preventDefault();e.returnValue='';}});
  window.addEventListener('resize',()=>{if(active())layoutPanels(mounted);});
  const oldTabs=tabs.filter(t=>['space','workflow','notes','workspace'].includes(t.route));
  if(oldTabs.length){const keep=oldTabs.find(t=>t.id===activeTab)||oldTabs[0];if(keep.route!=='workspace')requestRoute(keep.route);keep.route='workspace';keep.title='Project workspace';tabs=tabs.filter(t=>!oldTabs.includes(t)||t===keep);}
  async function applyTemplate(project,value){await openProject(project);if(!live(get(project))||!await flush())return;const state=get(project);draft(state).template=value;draft(state).text=`Complete the task as "${value.title}".`;persist(state);await switchSurface('chat',state);paintDraft(state);document.getElementById('pwAsk').focus();}
  async function openConversation(chatId,projectId){if(!(S.chats||[]).some(chat=>chat.id===chatId))await refreshState(false);if(!active()||mounted?.id!==projectId)await openProject(projectId);const state=get(projectId);await selectChat(state,chatId);await switchSurface('chat',state);}
  function navigationContext(){
    if(!active())return null;
    const {id,chatId,chatView,surface,section,sections,peek,inspection,fileDirectory,fileRow,libraryFile,
      nodeResultSelection,artifactRunId,searchQuery,navHidden,treeHidden,review}=mounted;
    const savedSections={...sections},chat=surface==='chat'&&!peek;
    const note=!chat&&section==='notes'&&mdProj?.pid===id?mdProj:null;
    const label=(S.tasks.find(project=>project.id===id)?.title||TITLES.workspace)+' · '+
      (chat?surfaces.chat:section==='task-detail'?'Task details':resources[section]||surfaces[surface]);
    const key=[id,surface,chat?'chat':section,chatId,chatView,peek,review?.id,fileRow?.rel,
      nodeResultSelection?.task_id,artifactRunId];
    return {label,key,async restore(){
      await openProject(id);
      const state=get(id);
      if(!live(state))return;
      if(state.chatId!==chatId)await selectChat(state,chatId);
      Object.assign(state,{sections:{...savedSections},fileDirectory,fileRow,libraryFile,nodeResultSelection,artifactRunId,
        searchQuery,navHidden,treeHidden});
      if(chat){
        await switchSurface('chat',state);
        state.chatView=chatView||'chat';
        await paintChat(state);
      }else if(section==='task-detail'&&review){
        await openTask(review.id,id,{peek,preferWorkbench:false});
      }else{
        if(inspection?.origin==='task')state.review=review;
        await showResource(section,state,{surface,peek,inspection,initial:true});
        if(note?.path&&live(state)&&state.section==='notes'&&mdDashPath!==note.path)await Notebook.open(note.path);
      }
    }};
  }
  window.ProjectWorkspace={openConversation,openWorkflowRun,openWorkflowNode,openStage,active,hasSurface,hasDirty,flush,leave,requestRoute,render,openProject,openTask,openNodeResult,openFile,openPaper,currentFile,referenceResource,handoffResource,showResource,createEntry,refreshFiles,applyTemplate,navigationContext,refresh:()=>mounted&&refresh(mounted)};
  return window.ProjectWorkspace;
})();
