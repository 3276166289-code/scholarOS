/* Runtime choices belong to a conversation and apply to its next request. */
const AgentRuntime=(()=>{
  const h=value=>esc(String(value??''));
  const reasoning=[['auto','Auto'],['none','Close'],['minimal','Very low'],['low','Low'],['medium','Medium'],['high','High'],['xhigh','Very high']];
  const permissions=[['auto','Follow expert'],['read_only','Read-only'],['workspace_write','Read/write in project'],['full_access','Full access']];
  function markup(prefix,chat={},modelId=prefix+'Model'){
    const select=(id,label,values,value)=>`<label class="agent-runtime-choice"><span>${label}</span><select id="${id}" class="control" aria-label="this chat${label}">${values.map(([id,text])=>`<option value="${h(id)}" ${id===value?'selected':''}>${h(text)}</option>`).join('')}</select></label>`;
    return `<div class="agent-runtime" id="${prefix}Runtime">${select(modelId,'Model',[['','Follow the expert'],...(S.models||[]).map(m=>[m.id,m.name||m.model])],chat.model_id||'')}${select(prefix+'Reasoning','Reasoning effort',reasoning,chat.reasoning||'auto')}${select(prefix+'Permission','Tool permissions',permissions,chat.permission||'auto')}<span class="agent-runtime-hint" id="${prefix}RuntimeHint" role="status"></span></div>`;
  }
  async function save(chatId,key,value){const result=await api('/api/agent-settings/runtime-save',{id:chatId,[key]:value});const chat=S.chats.find(row=>row.id===chatId);if(chat)Object.assign(chat,result.chat);return result.chat;}
  return {markup,save};
})();
