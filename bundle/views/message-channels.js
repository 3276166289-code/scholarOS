const MessageChannels=(()=>{
  const h=value=>esc(String(value??''));
  async function mount(host){
    try{
      const data=await api('/api/message-channels');if(!host.isConnected)return;
      host.innerHTML=`<h2>Message channel</h2><p class="hint">Connects the research work to messaging. Lark supports two-way chat; other channels push to a chosen destination.</p><div class="channel-list">${data.channels.map(channel=>`<button type="button" class="channel-row" data-channel="${channel.id}"><strong>${h(channel.name)}</strong><span>${h(channel.capability)}</span><small>${channel.id==='feishu'?'View binding and connection status':!channel.enabled?'Not connected':channel.last_status==='ok'?'Verified':channel.last_status==='failed'?'Send failed':'Configured · Pending verification'}</small><b>›</b></button>`).join('')}</div><div data-channel-detail></div>`;
      host.querySelectorAll('[data-channel]').forEach(button=>button.onclick=()=>{
        if(button.dataset.channel==='feishu')return IntegrationSettings.openFeishu();
        const channel=data.channels.find(item=>item.id===button.dataset.channel),detail=host.querySelector('[data-channel-detail]');
        detail.innerHTML=`<form class="card channel-form"><h3>${h(channel.name)}</h3><label><input type="checkbox" name="enabled" ${channel.enabled?'checked':''}> Enable message push</label>${channel.id==='telegram'?`<label>Bot token<input class="control" name="token" type="password" autocomplete="new-password" placeholder="${channel.token_set?'Saved, leave blank to keep':'Token from BotFather'}"></label><label>Recipient chat_id<input class="control" name="chat_id" value="${h(channel.chat_id||'')}"></label>`:`<label>Webhook Address<input class="control" name="webhook" type="password" autocomplete="new-password" placeholder="${channel.webhook_set?'Saved, leave blank to keep':'Official HTTPS webhook URL'}"></label>${channel.id==='dingtalk'?`<label>Signing secret<input class="control" name="secret" type="password" autocomplete="new-password" placeholder="${channel.secret_set?'Saved; blank keeps it':'If the bot uses signing, enter SEC...'}"></label>`:''}`}<p class="hint">Credentials are encrypted on this machine. Saving sends no message.</p><div class="integration-actions"><button class="btn" type="submit">Save settings</button><button type="button" class="btn ghost" data-test>Send a test message</button><button type="button" class="btn ghost" data-disconnect>Disconnect</button></div><details><summary>Sends messages to the saved recipient</summary><label>Message body<textarea class="control" data-message rows="4" placeholder="Write the progress or result summary to send"></textarea></label><button type="button" class="btn ghost" data-send>Send message</button></details><p role="status" data-result></p></form>`;
        const status=detail.querySelector('[data-result]');
        const work=async(fn,success)=>{detail.querySelectorAll('button').forEach(item=>item.disabled=true);try{await fn();status.textContent=success;}catch(err){status.textContent=err.message;}finally{detail.querySelectorAll('button').forEach(item=>item.disabled=false);}};
        detail.querySelector('form').onsubmit=event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.target));values.enabled=event.target.elements.enabled.checked;work(()=>api('/api/message-channels/'+channel.id+'/save',values),'Config saved; send a test message to verify.');};
        detail.querySelector('[data-send]').onclick=()=>work(()=>api('/api/message-channels/'+channel.id+'/send',{text:detail.querySelector('[data-message]').value}),'Message sent.');
        detail.querySelector('[data-test]').onclick=()=>work(()=>api('/api/message-channels/'+channel.id+'/test',{}),'Test message sent.');
        detail.querySelector('[data-disconnect]').onclick=()=>work(async()=>{await api('/api/message-channels/'+channel.id+'/disconnect',{});await mount(host);},'Disconnected');
        detail.scrollIntoView({block:'nearest'});
      });
    }catch(err){host.textContent=err.message;}
  }
  return {mount};
})();
