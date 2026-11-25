/* Compact creation and metadata editing beside the project switcher. */
const ProjectManager=(()=>{
  const h=value=>esc(String(value??''));
  async function open({edit=false}={}){
    if(window.ProjectWorkspace?.active()&&!await ProjectWorkspace.flush())return;
    const existing=document.querySelector('dialog.project-manager');if(existing){existing.focus();return;}
    const project=edit?S.tasks.find(row=>row.id===curTask):null;
    const dialog=document.createElement('dialog');dialog.className='project-manager pm-compact';
    const title=project?'Edit project info':'New project';let directory='';
    dialog.setAttribute('aria-label',title);
    dialog.innerHTML=`<header class="pm-head"><h2>${title}</h2><button type="button" class="pw-text-button" data-pm-close aria-label="Close">×</button></header><form class="pm-form"><label>Project name<input class="control" id="t-title" maxlength="200" required value="${h(project?.title||'')}" placeholder="Name the research topic"></label><label>Research goal<textarea class="control" id="t-q" rows="3" placeholder="What are you researching, and what should it deliver?">${h(project?.question||'')}</textarea></label><details><summary>Keywordsand save location</summary><label>Keywords<input class="control" id="t-kw" value="${h(project?.material_system||'')}" placeholder="separate with commas"></label><label>Project folder<div class="pm-directory"><input class="control" id="t-dir" value="${h(project?.base_dir||'')}" readonly placeholder="Saved automatically in the local project folder"><button type="button" class="btn ghost" id="t-dir-pick" ${project?'disabled':''}>SelectFolder</button></div></label></details><p class="hint">Materials, tasks, workflow, and automation belong to this project. You can also have the assistant set up a project from your goal.</p><p class="pw-error" data-pm-error role="alert"></p><footer><button type="button" class="pw-text-button" data-pm-cancel>Cancel</button><button class="btn btn-primary" id="t-go" type="submit">${project?'Save':'Create and open'}</button></footer></form>`;
    dialog.querySelector('[data-pm-close]').onclick=dialog.querySelector('[data-pm-cancel]').onclick=()=>dialog.close();
    if(project){
      const remove=document.createElement('button');remove.type='button';remove.className='pw-text-button';remove.dataset.pmDelete='';remove.textContent='Delete project record';
      dialog.querySelector('form footer').prepend(remove);
      remove.onclick=async()=>{
        if(window.ProjectWorkspace?.active()&&!await ProjectWorkspace.flush())return;
        try{if(await confirmDelete(project.id)){dialog.close();await render();}}
        catch(error){dialog.querySelector('[data-pm-error]').textContent=error.message;}
      };
    }
    dialog.querySelector('#t-dir-pick').onclick=async()=>{
      try{const result=await api('/api/folder/pick?title='+encodeURIComponent('Select project folder')+'&initial='+encodeURIComponent(directory));if(result.dir){directory=result.dir;dialog.querySelector('#t-dir').value=directory;}}
      catch(error){dialog.querySelector('[data-pm-error]').textContent=error.message;}
    };
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const button=dialog.querySelector('#t-go');button.disabled=true;
      try{
        const body={title:dialog.querySelector('#t-title').value.trim(),question:dialog.querySelector('#t-q').value.trim(),material_system:dialog.querySelector('#t-kw').value.trim()};
        const result=await api(project?'/api/task/update':'/api/task/create',project?{...body,id:project.id,expected_updated_at:project.updated_at}:{...body,base_dir:directory});
        const id=project?.id||result.task_id;await refreshState(false);dialog.close();await ProjectWorkspace.openProject(id);
      }catch(error){dialog.querySelector('[data-pm-error]').textContent=error.message;button.disabled=false;}
    };
    document.body.appendChild(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();dialog.querySelector('#t-title').focus();return dialog;
  }
  async function confirmDelete(id){
    const project = await api('/api/task/delete-preview?id=' + encodeURIComponent(id));
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    dialog.setAttribute('aria-label', 'Delete project record');
    const conversations = project.conversations
      ? `Keep ${project.conversations} regular chats and move them to Assistant history.`
      : '';
    dialog.innerHTML = `<div class="modal-mask"></div><div class="modal-dialog data-delete-dialog">
      <div class="modal-head"><h3>Delete ”${h(project.title)}”project records</h3></div>
      <div class="modal-body">
        <p>Permanently deletes the project’s tasks, run records, literature index, and notes.${conversations}</p>
        <p>Local files and backups are kept. Under settings → data settings” to find the projectFolder. </p>
        ${project.base_dir ? `<div class="data-location-path"><code>${h(project.base_dir)}</code></div>
          <button class="btn ghost" data-open-project>Open projectFolder</button>` : ''}
        <p class="hint" role="status">${project.running ? 'This project has a running or queued task. Stop it before reopening this window.' : ''}</p>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" data-cancel-delete autofocus>Cancel</button>
        <button class="btn danger" data-confirm-delete ${project.running ? 'disabled' : ''}>Delete record</button>
      </div>
    </div>`;
    const status = dialog.querySelector('[role="status"]');
    const confirm = dialog.querySelector('[data-confirm-delete]');
    const cancel = dialog.querySelector('[data-cancel-delete]');
    const openFolder = dialog.querySelector('[data-open-project]');
    if (openFolder) openFolder.onclick = async () => {
      try { await api('/api/settings/data/open', {kind:'project', id}); }
      catch (error) { status.textContent = error.message; }
    };
    const origin = document.activeElement;
    document.body.appendChild(dialog);
    return new Promise(resolve => {
      let deleted = false;
      dialog.addEventListener('close', () => {
        dialog.remove();
        if (origin?.isConnected) origin.focus();
        resolve(deleted);
      }, {once:true});
      dialog.addEventListener('cancel', event => { if (cancel.disabled) event.preventDefault(); });
      cancel.onclick = () => dialog.close();
      confirm.onclick = async () => {
        confirm.disabled = cancel.disabled = true;
        status.textContent = 'Deleting project records...';
        try { await api('/api/task/delete', {id}); }
        catch (error) {
          status.textContent = error.message;
          confirm.disabled = cancel.disabled = false;
          return;
        }
        deleted = true;
        try { await refreshState(false); needTask(); }
        catch (error) { uiNotify('Project record deleted. Failed to refresh the list:' + error.message); }
        dialog.close();
      };
      dialog.showModal();
    });
  }
  window.ProjectManager={open,confirmDelete};return window.ProjectManager;
})();
