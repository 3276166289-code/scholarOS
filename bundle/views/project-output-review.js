/* Human revision is a new reviewed artifact version, separate from model execution. */
const ProjectOutputReview=(()=>{
  function canEdit(task,output){return task.status==='awaiting_review'&&task.metadata?.node_config?.node_kind!=='tool'&&['','task','outline','write','review'].includes(task.metadata?.stage||'')&&/\.(md|markdown|txt|json|yaml|yml|csv|tex|bib|py|js|css|html)$/i.test(output.name||output.path||'');}
  async function open(projectId,taskId,index,onSaved){
    const origin=document.activeElement,dialog=document.createElement('dialog');dialog.className='output-revision-dialog';dialog.setAttribute('aria-label','Manually revised output');
    dialog.innerHTML='<header><div><strong>Revise the output by hand</strong><p class="hint" data-por-meta>LoadingCurrent version...</p></div><button type="button" class="pw-text-button" data-por-close>Close</button></header><div class="por-modes"><button type="button" class="pw-text-button" data-por-mode="edit">Edit</button><button type="button" class="pw-text-button" data-por-mode="preview">Preview</button></div><textarea data-por-text aria-label="Revised output text" spellcheck="false" disabled></textarea><div class="por-preview md-render" data-por-preview hidden></div><footer><label>Revision note<input class="control" data-por-reason placeholder="Say why this change was made"></label><p class="pw-error" data-por-error role="alert"></p><button type="button" class="btn btn-primary" data-por-save disabled>Save the revision and keep reviewing</button></footer>';
    document.body.append(dialog);dialog.showModal();let snapshot=null,busy=false;
    const el=name=>dialog.querySelector('[data-por-'+name+']');
    const changed=()=>snapshot&&el('text').value!==snapshot.text;
    const close=async()=>{if(busy)return;if(!changed()||await uiConfirm('Revision unsaved; closing loses these changes. Close anyway?'))dialog.close();};
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});el('close').onclick=close;
    dialog.addEventListener('close',()=>{dialog.remove();if(origin?.isConnected)origin.focus();},{once:true});
    dialog.querySelectorAll('[data-por-mode]').forEach(button=>button.onclick=()=>{const preview=button.dataset.porMode==='preview';el('text').hidden=preview;el('preview').hidden=!preview;if(preview)el('preview').innerHTML=renderMarkdown(el('text').value);});
    const save=async()=>{if(!snapshot||busy)return;busy=true;el('save').disabled=true;el('error').textContent='';try{const result=await api('/api/project-tasks/revise-output',{id:taskId,project_id:projectId,reviewed_run_id:snapshot.run_id,expected_version:snapshot.task_version,expected_hash:snapshot.content_hash,output_index:index,text:el('text').value,reason:el('reason').value});dialog.close();await onSaved?.(result.task);}catch(error){if(dialog.isConnected)el('error').textContent=error.message;}finally{busy=false;if(dialog.isConnected)el('save').disabled=!snapshot?.editable;}};
    el('save').onclick=save;dialog.onkeydown=event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();save();}};
    try{snapshot=await api('/api/project-tasks/output?id='+encodeURIComponent(taskId)+'&project_id='+encodeURIComponent(projectId)+'&output_index='+index);if(!dialog.isConnected)return dialog;el('text').value=snapshot.text;el('text').disabled=!snapshot.editable;el('save').disabled=!snapshot.editable;el('meta').textContent=snapshot.name+'· revision v'+snapshot.output_revision+'· original file and all revisions kept';if(!snapshot.editable){dialog.querySelector('header strong').textContent='Output preview';el('error').textContent='Read-only preview; output can be revised only while awaiting manual review.';el('text').hidden=true;el('preview').hidden=false;el('preview').innerHTML=renderMarkdown(snapshot.text||'');}else el('text').focus();}
    catch(error){if(dialog.isConnected)el('error').textContent=error.message;}
    return dialog;
  }
  return {open,canEdit};
})();
