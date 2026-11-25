/* One persistent capture field, backed by the same tasks as the progress board. */
const GlobalTodos = (() => {
  const host = document.getElementById('globalTodo');
  let todos = [], busy = false, request = 0, loaded = false, projectSignature = '', pendingPaint=false;
  const labels = {TODO:'To-do', IN_PROGRESS:'In progress', REVIEW:'To review', DONE:'Completed'};
  host.className = 'global-todo';
  host.innerHTML = `<div class="todo-capture">
    <button type="button" id="todoToggle" class="todo-toggle" aria-expanded="false" aria-controls="todoPanel"><span class="todo-cbx" aria-hidden="true"></span>To-do <span id="todoCount">...</span></button>
    <form id="todoCaptureForm"><input id="todoCaptureInput" aria-label="Jot down a to-do" placeholder="What do you want to do? Write it down,Enter Save" maxlength="500" autocomplete="off">
      <select id="todoCaptureProject" aria-label="To-do owner"><option value="">Personal to-dos</option></select>
      <button type="submit" id="todoCaptureAdd" class="btn" aria-label="Add to-do">+</button></form>
    <span id="todoCaptureStatus" role="status" aria-live="polite"></span>
  </div>
  <section id="todoPanel" class="todo-panel-popover" aria-label="To-do list" hidden>
    <div class="todo-panel-head"><strong>To-do list</strong><button type="button" id="todoRefresh" class="btn ghost">Refresh</button><button type="button" id="todoClose" class="btn ghost" aria-label="Collapse the to-do list">✕</button></div>
    <div class="todo-list-filters"><input id="todoListSearch" type="search" aria-label="Search to-dos" placeholder="Search to-dos..."><select id="todoListScope" aria-label="Filter to-dos by owner"><option value="all">All to-dos</option><option value="personal">Personal to-dos</option></select><label><input id="todoShowDone" type="checkbox">Completed</label></div>
    <div id="todoList" class="global-todo-list"></div>
  </section>`;
  const input = $('todoCaptureInput'), scope = $('todoCaptureProject'), panel = $('todoPanel');
  input.value = localStorage.getItem('rw-todo-draft') || '';
  input.oninput = () => localStorage.setItem('rw-todo-draft', input.value);
  scope.onchange = () => localStorage.setItem('rw-todo-project', scope.value);
  function syncProjects(){
    const projects = S.tasks || [], signature = JSON.stringify(projects.map(p=>[p.id,p.title]));
    if(signature === projectSignature) return;
    projectSignature = signature;
    const selected = scope.value || localStorage.getItem('rw-todo-project') || '';
    const listScope = $('todoListScope').value;
    const options = projects.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
    scope.innerHTML = '<option value="">Personal to-dos</option>' + options;
    scope.value = projects.some(p=>p.id===selected) ? selected : '';
    $('todoListScope').innerHTML = '<option value="all">All to-dos</option><option value="personal">Personal to-dos</option>' + options;
    $('todoListScope').value = ['all','personal',...projects.map(p=>p.id)].includes(listScope) ? listScope : 'all';
    paint();
  }
  function status(message){ $('todoCaptureStatus').textContent = message; }
  async function refresh(){
    const version = ++request;
    try {
      const result = await api('/api/todos');
      if(version !== request) return;
      todos = result.todos || []; loaded = true; paint();
    } catch(error) {
      if(version !== request) return;
      status('To-do read failed:' + error.message);
      if(!loaded) $('todoList').textContent = 'To-dos cannot be read right now. Click refresh to try again.';
    }
  }
  function paint(){
    if(host.querySelector('.context-active')){pendingPaint=true;return;}pendingPaint=false;
    $('todoCount').textContent = loaded ? todos.filter(t=>t.status!=='DONE').length : '...';
    if(panel.hidden) return;
    const query = $('todoListSearch').value.trim().toLowerCase(), filter = $('todoListScope').value;
    const done = $('todoShowDone').checked;
    const rows = todos.filter(t=>(done ? t.status==='DONE' : t.status!=='DONE') &&
      (filter==='all' || (filter==='personal' ? !t.task_id : t.task_id===filter)) &&
      (!query || (t.title+' '+t.description).toLowerCase().includes(query)));
    const active = document.activeElement, previousRow = active?.closest('[data-global-todo-id]');
    const focused = previousRow ? {id:previousRow.dataset.globalTodoId, action:active.dataset.todoAction} : null;
    $('todoList').innerHTML = rows.map(t=>`<div class="global-todo-row ${t.status==='DONE'?'done':''}" data-global-todo-id="${esc(t.id)}">
      <input type="checkbox" data-todo-action="toggle" aria-label="${t.status==='DONE'?'Reopen':'Done'}: ${esc(t.title)}" ${t.status==='DONE'?'checked':''} ${t.stage?'disabled title="Status is updated by the workflow delivery"':''}>
      <div class="global-todo-copy"><strong>${esc(t.title)}</strong><span>${esc(S.tasks.find(p=>p.id===t.task_id)?.title || (t.task_id?'Project to-dos':'Personal to-dos'))} · ${esc(t.priority||'P1')} · ${labels[t.status] || t.status}${t.due_date?' · '+esc(t.due_date):''}</span></div>
      <button type="button" class="context-trigger" data-todo-action="edit" title="Edit to-do" aria-label="Edit to-do">✎</button>
      ${t.task_id?'<button type="button" class="context-trigger" data-todo-action="project" title="View project progress" aria-label="View project progress">↗</button>':''}
      <button type="button" class="context-trigger" data-todo-action="delete" title="Delete to-do" aria-label="Delete to-do">×</button>
    </div>`).join('') || `<div class="todo-list-empty">${loaded?(query?'No matching to-dos':done?'No finished to-dos yet':'No to-dos yet; add one above whenever you like.'):'LoadingTo-dos...'}</div>`;
    if(focused){
      const row = [...$('todoList').children].find(el=>el.dataset.globalTodoId===focused.id);
      (row?.querySelector(`[data-todo-action="${focused.action}"]`) || $('todoListSearch')).focus();
    }
  }
  function close(restore=true){
    panel.hidden = true; $('todoToggle').setAttribute('aria-expanded','false');
    if(restore) $('todoToggle').focus();
  }
  function open(){
    syncProjects(); panel.hidden = false; $('todoToggle').setAttribute('aria-expanded','true');
    paint(); refresh(); $('todoListSearch').focus();
  }
  function focus(options={}){
    syncProjects(); close(false);
    if(options.projectId !== undefined){ scope.value=options.projectId; scope.onchange(); }
    if(options.title && !input.value.trim()){ input.value=options.title; input.oninput(); }
    input.focus();
  }
  async function submit(event){
    event.preventDefault();
    if(busy || !input.value.trim()) { if(!busy) input.focus(); return; }
    const title=input.value.trim(), draft=input.value, project=scope.value;
    busy=true; $('todoCaptureAdd').disabled=true; status('Saving...');
    try {
      await api('/api/todos/add',{task_id:project,title,priority:'P2'});
      if(input.value===draft){ input.value=''; input.oninput(); }
      status('Noted'); await refresh();
    } catch(error) { status('Unsaved:'+error.message); }
    finally { busy=false; $('todoCaptureAdd').disabled=false; }
  }
  function openProject(todo){
    return uiNavigate(()=>{
      curTask=todo.task_id; spId=todo.task_id; spTab='plan';
      localStorage.setItem('rw-task',curTask); openTab('space');
    });
  }
  async function act(id, action){
    const todo=todos.find(t=>t.id===id); if(!todo) return;
    try {
      if(action==='toggle' && !todo.stage) await api('/api/todos/toggle',{id});
      else if(action==='edit'){
        const title=await uiPrompt('Edit to-do',todo.title);
        if(title===null) return;
        if(!title.trim()) throw new Error('To-do title cannot be empty');
        await api('/api/todos/update',{id,title:title.trim()});
      } else if(action==='priority'||action==='due_date'){
        const value=await uiPrompt(action==='priority'?'Priority (P0 / P1 / P2)':'Due date (YYYY-MM-DD, leave empty to clear)',todo[action]||'');
        if(value===null)return;
        if(action==='priority'&&!['P0','P1','P2'].includes(value.trim().toUpperCase()))throw new Error('Enter P0, P1, or P2');
        if(action==='due_date'&&value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Date format is YYYY-MM-DD');
        await api('/api/todos/update',{id,[action]:action==='priority'?value.trim().toUpperCase():value});
      } else if(action==='duplicate'){
        await api('/api/todos/add',{task_id:todo.task_id,title:todo.title+'(copy)',description:todo.description,priority:todo.priority,due_date:todo.due_date});
      } else if(action==='delete'){
        if(!await uiConfirm(`Delete to-do "${todo.title}"?`,{okText:'Delete'})) return;
        await api('/api/todos/delete',{id});
      } else if(action==='project') { close(false); return openProject(todo); }
    } catch(error) { uiNotify(error.message); }
    await refresh();
  }
  function contextActions(row){
    const todo=todos.find(t=>t.id===row.dataset.globalTodoId); if(!todo) return [];
    return [{text:'Edit to-do...',run:()=>act(todo.id,'edit')},
      {text:todo.status==='DONE'?'Reopen to-do':'Mark as done',disabled:!!todo.stage,run:()=>act(todo.id,'toggle')},
      {text:'Priority...',run:()=>act(todo.id,'priority')},
      {text:'Due date...',run:()=>act(todo.id,'due_date')},
      {separator:true},
      ...(todo.task_id?[{text:'View project progress',run:()=>act(todo.id,'project')}]:[]),
      {text:'New to-do',run:()=>focus({projectId:todo.task_id})},
      {text:'Copy to-do content',run:()=>TaskActions.copy(todo.title+(todo.description?'\n'+todo.description:''))},
      {text:'Copy as new to-do',run:()=>act(todo.id,'duplicate')},
      {separator:true},
      {text:'Delete to-do...',danger:true,run:()=>act(todo.id,'delete')}];
  }
  $('todoCaptureForm').onsubmit=submit;
  input.onkeydown=event=>{ if(event.key==='Enter' && (event.isComposing || event.repeat)) event.preventDefault(); };
  $('todoToggle').onclick=()=>panel.hidden?open():close();
  $('todoClose').onclick=()=>close();
  $('todoRefresh').onclick=refresh;
  $('todoListSearch').oninput=paint; $('todoListScope').onchange=paint; $('todoShowDone').onchange=paint;
  $('todoList').onclick=event=>{
    const button=event.target.closest('[data-todo-action]'); if(!button) return;
    const row=button.closest('[data-global-todo-id]');
    if(button.dataset.todoAction==='toggle') button.disabled=true;
    act(row.dataset.globalTodoId,button.dataset.todoAction).finally(()=>{if(button.isConnected)button.disabled=false;});
  };
  document.addEventListener('pointerdown',event=>{
    if(!panel.hidden && !host.contains(event.target) && !event.target.closest('.context-menu, dialog, .modal')) close(false);
  });
  window.addEventListener('todos-changed',refresh);
  window.addEventListener('rw:context-menu-closed',()=>setTimeout(()=>{if(pendingPaint)paint();},0));
  window.addEventListener('focus',refresh);
  syncProjects(); refresh();
  return {focus,open,close,refresh,syncProjects,contextActions,isOpen:()=>!panel.hidden};
})();
