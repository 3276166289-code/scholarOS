const TaskActions=(()=>{
  const link=row=>location.origin+location.pathname+'#project='+encodeURIComponent(row.project_id)+'&task='+encodeURIComponent(row.id);
  async function copy(text){await navigator.clipboard.writeText(text);uiNotify('Copied');}
  async function visibility(rows,refresh,action='delete',section=''){
    if(!rows.length)return;
    if(action==='delete'){
      const running=rows.some(row=>['running','queued','waiting_input'].includes(row.status));
      if(!await uiConfirm(`Move ${section?'“'+section+'”in ':''}${rows.length} records move from the board to Recently deleted? Their sessions, tasks, and output are kept.${running?' runs still in flight continue; stop them first if you need them ended.':''}`,{ok:'Remove from board'}))return;
    }
    const groups=new Map();
    for(const row of rows){if(!groups.has(row.project_id))groups.set(row.project_id,[]);groups.get(row.project_id).push({kind:row.kind,id:row.id});}
    try{
      for(const [project_id,items] of groups)for(let offset=0;offset<items.length;offset+=500)await api('/api/execution-board/visibility',{project_id,action,items:items.slice(offset,offset+500)});
    }finally{await refresh();}
  }
  const removal=(row,refresh)=>({text:row.deleted_at?'Restore to board':'Remove from board',danger:!row.deleted_at,run:()=>visibility([row],refresh,row.deleted_at?'restore':'delete')});
  async function stop(row){
    if(row.active_run_kind==='conversation'||(row.kind==='conversation'&&row.execution_kind!=='workflow'))return api('/api/execution-board/conversation-action',{project_id:row.project_id,run_id:row.active_run_id||row.run_id,action:'stop'});
    return api(row.execution_kind==='workflow'?'/api/workflow/execution/cancel':'/api/project-tasks/cancel',{project_id:row.project_id,id:row.execution_kind==='workflow'?row.run_id:row.id});
  }
  function actions(row,refresh){
    if(row.deleted_at)return [removal(row,refresh)];
    if(row.kind!=='task')return [
      {text:'Open chat',run:()=>row.channel==='toolbox'?PaperToolbox.openResult(row.run_id,row.project_id):AppNavigation.follow(()=>ProjectWorkspace.openConversation(row.chat_id,row.project_id))},
      ...(['running','queued','waiting_input'].includes(row.status)?[{text:'Stop run',run:async()=>{await stop(row);await refresh();}}]:[]),
      ...(['failed','interrupted'].includes(row.status)?[{text:'Continue',run:async()=>{await api(row.execution_kind==='workflow'?'/api/workflow/execution/resume':'/api/execution-board/conversation-action',{id:row.run_id,project_id:row.project_id,run_id:row.run_id,action:'resume'});await refresh();}}]:[]),
      {separator:true},removal(row,refresh)
    ];
    const command=async(action,body={})=>{const result=await api('/api/project-tasks/'+action,{project_id:row.project_id,id:row.id,...body});await refresh();return result;};
    const edit=async(key,title,value)=>{const answer=await uiPrompt(title,value||'');if(answer!==null)await command('organize',{[key]:answer});};
    return [
      {text:'Open task chat',run:()=>AppNavigation.follow(()=>ProjectWorkspace.openConversation(row.chat_id,row.project_id))},
      {text:'Open task and review',run:()=>AppNavigation.follow(()=>ProjectWorkspace.openTask(row.id,row.project_id,{peek:false}))},
      {text:'Rename task...',run:()=>edit('title','Task name',row.title)},
      {text:'Priority...',run:()=>edit('priority','Priority (P0 / P1 / P2)',row.priority)},
      {text:'Start date...',run:()=>edit('start_date','Start date (YYYY-MM-DD, blank to clear)',row.start_date)},
      {text:'Due date...',run:()=>edit('due_date','Due date (YYYY-MM-DD, leave empty to clear)',row.due_date)},
      {text:row.pinned?'Unpin':'Pin task',run:()=>command('organize',{pinned:!row.pinned})},
      {separator:true},
      {text:'Open in new tab',run:()=>window.open(link(row),'_blank','noopener')},
      {text:'Copy task link',run:()=>copy(link(row))},
      {text:'Copy local working directory',run:async()=>{const data=await command('location');await copy(data.path);}},
      {text:'Copy as new task',run:async()=>{const data=await command('duplicate');await ProjectWorkspace.openTask(data.task.id,row.project_id);}},
      {separator:true},
      ...(['running','queued'].includes(row.status)?[{text:'Stop run',run:async()=>{await stop(row);await refresh();}}]:[]),
      removal(row,refresh)
    ];
  }
  return {actions,copy,visibility,stop};
})();
