/* Shared history commands for global, project and team conversations. */
const ConversationHistory=(()=>{
  const h=value=>esc(String(value??'')),mounts=new WeakMap();
  const rowType=row=>({task:'Task',workflow:'Workflow'}[row.execution_kind]||(row.channel==='toolbox'?'Paper tools':''));
  function mount(host,options){
    if(!host)return;
    const key=(options.kind||'chat')+':'+(options.projectId||options.teamId||'global');
    const existing=mounts.get(host);if(existing?.key===key){existing.options=options;existing.ready=existing.refresh();return existing;}
    const state={key,options,view:'active',query:'',rows:[],selected:new Set(),version:0,refresh:null};mounts.set(host,state);
    host.innerHTML=`<div class="history-filters"><input class="control" type="search" data-history-search aria-label="Search chat history" placeholder="Search chats..."><select class="control" data-history-view aria-label="Chat scope"><option value="active">Recent chats</option><option value="archive">Archived</option><option value="trash">Recently deleted</option></select></div><div class="history-batch"><label><input type="checkbox" data-history-all> Select all</label><button class="pw-text-button" type="button" data-history-delete>Delete selected</button></div><p class="pw-error" data-history-error role="alert"></p><div data-history-rows></div>`;
    async function refresh(){
      const version=++state.version,opts=state.options;
      try{const data=await api('/api/conversation-history?kind='+(opts.kind||'chat')+'&project_id='+encodeURIComponent(opts.projectId||'')+'&team_id='+encodeURIComponent(opts.teamId||'')+'&view='+state.view+'&q='+encodeURIComponent(state.query));if(!host.isConnected||version!==state.version)return;state.rows=data.conversations;
        const signature=JSON.stringify([state.rows,state.view,opts.selected?.(),[...state.selected]]);
        host.querySelector('[data-history-error]').textContent='';
        if(signature===state.signature)return;
        state.signature=signature;
        const rowsById=new Map(state.rows.map(row=>[row.id,row]));
        host.querySelector('[data-history-rows]').innerHTML=state.rows.map(row=>`<div class="history-row ${row.pinned_at?'is-pinned':''}" data-history-id="${h(row.id)}" data-history-kind="${opts.kind||'chat'}"><input type="checkbox" data-history-select="${h(row.id)}" aria-label="Select ${h(row.title)}" ${state.selected.has(row.id)?'checked':''}><button class="${opts.projectId?'pw-session':opts.kind==='team'?'tc-hist-item':'ah-item'} history-open" type="button" ${opts.projectId?'data-pw-chat':opts.kind==='team'?'data-tc-sess':'data-open'}="${h(row.id)}" aria-current="${opts.selected?.()===row.id}"><strong>${h(row.title)}</strong><small>${[rowType(row),row.pinned_at?'Pin':'',row.running?'Running':'',fmtAgo(row.updated_at)].filter(Boolean).map(h).join(' · ')}</small></button></div>`).join('')||'<p class="hint history-empty">No chats here yet</p>';
        host.querySelectorAll('[data-history-id]').forEach(node=>{node.__historyState=state;const row=rowsById.get(node.dataset.historyId);node.querySelector('.history-open').onclick=()=>state.view==='active'?openRow(row,state):preview(row,state);node.querySelector('[data-history-select]').onchange=event=>event.target.checked?state.selected.add(row.id):state.selected.delete(row.id);});
      }catch(error){if(host.isConnected)host.querySelector('[data-history-error]').textContent=error.message;}
    }
    state.refresh=refresh;host.querySelector('[data-history-search]').oninput=event=>{state.query=event.target.value;refresh();};host.querySelector('[data-history-view]').onchange=event=>{state.view=event.target.value;state.selected.clear();refresh();};
    host.querySelector('[data-history-all]').onchange=event=>{state.rows.forEach(row=>event.target.checked?state.selected.add(row.id):state.selected.delete(row.id));refresh();};
    host.querySelector('[data-history-delete]').onclick=async()=>{if(!state.selected.size)return;if(!await uiConfirm('Apply to the selected'+state.selected.size+'chats to Recently Deleted?'))return;for(const id of [...state.selected]){try{await call(state,id,'trash');state.selected.delete(id);}catch(error){uiNotify(error.message);}}await changed(state);};
    state.ready=refresh();return state;
  }
  function openRow(row,state){
    if(row.channel==='toolbox'&&row.run_id)return PaperToolbox.openResult(row.run_id,state.options.projectId);
    if(row.channel==='toolbox')return preview(row,state);
    return state.options.onSelect(row.id);
  }
  function call(state,id,action,extra={}){const opts=state.options;return api('/api/conversation-history',{kind:opts.kind||'chat',id,action,project_id:opts.projectId||'',team_id:opts.teamId||'',...extra});}
  async function changed(state){await refreshState(false);await state.options.onChanged?.();await state.refresh();}
  async function act(state,row,action){
    try{
      let extra={};if(action==='rename'){const title=await uiPrompt('Rename conversation',row.title);if(title===null)return;extra={title};}
      if(['trash','purge'].includes(action)&&!await uiConfirm(action==='purge'?'Permanently delete this chat record? Linked project files and output are kept.':'Move this chat to Recently deleted? You can restore it from there.'))return;
      if(action==='export'){const data=await call(state,row.id,action);const message=await exportBlob(
        new Blob([data.content],{type:'text/markdown;charset=utf-8'}),data.title+'.md');
      if(message)uiNotify(message);return;}
      await call(state,row.id,action,extra);await changed(state);
    }catch(error){uiNotify(error.message);}
  }
  function actions(node){const state=node.__historyState,row=state?.rows.find(item=>item.id===node.dataset.historyId);if(!row)return [];
    if(row.deleted_at)return [{text:'View records',run:()=>preview(row,state)},{text:'Resume conversation',run:()=>act(state,row,'restore')},{text:'Export Markdown',run:()=>act(state,row,'export')},{separator:true},{text:'Delete permanently...',danger:true,run:()=>act(state,row,'purge')}];
    return [{text:row.pinned_at?'Unpin':'Pin conversation',run:()=>act(state,row,row.pinned_at?'unpin':'pin')},{text:'Rename...',run:()=>act(state,row,'rename')},{text:'Export Markdown',run:()=>act(state,row,'export')},...(!row.running?[{text:row.archived_at?'Unarchive':'Archive chat',run:()=>act(state,row,row.archived_at?'unarchive':'archive')},{separator:true},{text:'Delete chat...',danger:true,run:()=>act(state,row,'trash')}]:[{text:'Open the running chat',run:()=>openRow(row,state)}])];
  }
  async function preview(row,state){try{const data=await call(state,row.id,'export'),dialog=document.createElement('dialog');dialog.className='pt-dialog';dialog.innerHTML=`<header class="history-preview-head"><h3>${h(row.title)}</h3><button type="button" class="pw-text-button" aria-label="Close">×</button></header><pre class="history-preview">${h(data.content)}</pre>`;dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();}catch(error){uiNotify(error.message);}}
  return {mount,actions};
})();
