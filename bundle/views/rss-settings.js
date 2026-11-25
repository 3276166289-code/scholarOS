/* RSS configuration remains global and feeds the existing intelligence reader. */
window.RSSSettings=(()=>{
  const h=value=>esc(String(value??''));
  if(!SET_SECS.some(section=>section[0]==='rss'))SET_SECS.splice(3,0,['rss','📡','RSS feeds']);
  const style=document.createElement('style');style.textContent=`
    .rss-settings .rss-settings-head,.rss-settings .rss-source-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .rss-settings .rss-settings-head>div,.rss-settings .rss-source-head>div{flex:1;min-width:160px}.rss-settings h3,.rss-settings h4{margin:0 0 6px;overflow-wrap:anywhere}
    .rss-settings .rss-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rss-settings .rss-source{margin-top:12px;padding:16px;border:1px solid var(--line);border-radius:9px;background:var(--panel)}
    .rss-settings .rss-source-url{font-size:12px;color:var(--muted);overflow-wrap:anywhere;margin:9px 0}.rss-settings .rss-source-meta{font-size:11px;line-height:1.8;color:var(--muted)}
    .rss-settings .rss-source-error,.rss-settings [data-rss-error]{color:var(--err);white-space:pre-wrap;overflow-wrap:anywhere}.rss-settings .btn{font-size:12px}.rss-settings [data-rss-status]{margin:12px 0}
    .intel .rss-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .rss-settings .rss-empty{padding:24px 0;line-height:1.8}.rss-settings-dialog label{display:grid;gap:7px}.rss-settings-dialog input[type=checkbox]{width:auto}.rss-settings-dialog .rss-enabled{display:flex;gap:8px;align-items:center}
  `;document.head.append(style);
  function markup(){return `<section class="rss-settings card" data-rss-settings><div class="rss-settings-head"><div><h3>Daily digest · RSS Feeds</h3><p class="hint">Configure global sources; enabled ones feed the daily digest. Saving does not fetch anything right away.</p></div><div class="rss-actions"><button type="button" class="btn" data-rss-add disabled>Add a feed</button><button type="button" class="btn ghost" data-rss-defaults disabled>Add built-in sources</button></div></div><p class="hint" data-rss-status role="status">LoadingFeeds...</p><p data-rss-error role="alert"></p><div data-rss-list></div></section>`;}
  async function mount(host){
    if(!host)return;let sources=[],busy=false;
    const el=name=>host.querySelector('[data-rss-'+name+']');
    const error=err=>{if(host.isConnected)el('error').textContent=err?.message||String(err||'');};
    function lock(value){busy=value;host.querySelectorAll('button').forEach(button=>button.disabled=value);}
    function paint(){
      el('status').textContent=sources.length+'feeds ·'+sources.filter(source=>source.enabled).length+'enabled';
      el('list').innerHTML=sources.map(source=>`<article class="rss-source" data-rss-source="${h(source.id)}"><div class="rss-source-head"><div><h4>${h(source.title)}</h4><span class="pill">${source.enabled?'Enabled':'Disabled'}</span> <span class="hint">${h(source.category)}</span></div><div class="rss-actions"><button type="button" class="btn ghost" data-rss-edit="${h(source.id)}">Edit</button><button type="button" class="btn ghost" data-rss-toggle="${h(source.id)}">${source.enabled?'Disable':'Enable'}</button><button type="button" class="btn ghost" data-rss-delete="${h(source.id)}">Delete</button></div></div><p class="rss-source-url">${h(source.url)}</p><div class="rss-source-meta">In the library ${h(source.count||0)} items · Last fetch: ${h(source.last_fetch||'Not fetched yet')}</div>${source.last_error?`<div class="rss-source-error">Fetch failed: ${h(source.last_error)}</div>`:''}</article>`).join('')||'<p class="hint rss-empty">No feeds yet. Add an RSS address or click "Add built-in sources".</p>';
      host.querySelectorAll('[data-rss-edit]').forEach(button=>button.onclick=()=>edit(sources.find(source=>source.id===button.dataset.rssEdit)));
      host.querySelectorAll('[data-rss-toggle]').forEach(button=>button.onclick=()=>action(async()=>{const source=sources.find(item=>item.id===button.dataset.rssToggle);await api('/api/rss/sources/save',{id:source.id,enabled:!source.enabled});await load();}));
      host.querySelectorAll('[data-rss-delete]').forEach(button=>button.onclick=async()=>{if(busy)return;const source=sources.find(item=>item.id===button.dataset.rssDelete);if(!await uiConfirm('Delete feed "'+source.title+'"? Already-fetched items are kept.',{ok:'Delete feed',cancel:'Cancel',danger:true}))return;await action(async()=>{await api('/api/rss/sources/delete',{id:source.id});await load();});});
    }
    async function load(){const data=await api('/api/rss/sources');if(!host.isConnected)return;sources=data.sources||[];paint();}
    async function action(work){if(busy)return;lock(true);error('');try{await work();}catch(err){error(err);}finally{if(host.isConnected)lock(false);}}
    function edit(source=null){
      if(busy)return;
      const dialog=Notebook.dialog(source?'Edit RSS feed':'Add RSS feed',`<form class="nb-form"><label>Feed name<input class="control" name="title" aria-label="Feed name" maxlength="200" required value="${h(source?.title||'')}" placeholder="For example: materials science research news"></label><label>RSS Address<input class="control" name="url" aria-label="RSS Address" type="url" required maxlength="8192" value="${h(source?.url||'')}" placeholder="https://example.org/feed.xml"></label><label>Category<input class="control" name="category" aria-label="Feed category" maxlength="60" value="${h(source?.category||'academic papers')}"></label><label class="rss-enabled"><input type="checkbox" name="enabled" ${source?.enabled===0?'':'checked'}>Enable fetching</label><p class="hint">Only saves the subscription; go back to the digest and click“Refresh”before fetching content.</p><button type="submit" class="btn">Save the feed</button></form>`);
      dialog.classList.add('rss-settings-dialog');
      dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;
        try{await api('/api/rss/sources/save',{id:source?.id||'',title:form.elements.title.value,url:form.elements.url.value,category:form.elements.category.value,enabled:form.elements.enabled.checked});dialog.close();await load();}
        catch(err){if(dialog.isConnected)Notebook.error(dialog,err);else error(err);}finally{button.disabled=false;}
      };
    }
    el('add').onclick=()=>edit();el('defaults').onclick=()=>action(async()=>{const result=await api('/api/rss/sources/defaults',{});await load();el('status').textContent+='· Added'+result.added+'built-in sources, existing config kept';});
    await action(load);
  }
  const previousPanel=setPanel;setPanel=function(){return setSec==='rss'?markup():previousPanel();};
  const previousSettings=renderSettings;renderSettings=function(container){previousSettings(container);if(setSec==='rss')mount(container.querySelector('[data-rss-settings]'));};
  return {open:()=>AppNavigation.follow(()=>{setSec='rss';return openTab('settings');})};
})();
