const UsageView=(()=>{
  const h=value=>esc(String(value??''));
  const compact=new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1});
  const n=value=>value==null?'-':compact.format(value);
  const full=value=>value==null?'No response':Number(value).toLocaleString('zh-CN');
  const money=(value,currency='USD')=>new Intl.NumberFormat('zh-CN',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:6}).format(value);
  const cost=row=>row.cost==null?'-':row.cost_min!=null&&row.cost_min!==row.cost?`${money(row.cost_min,row.currency)}–${money(row.cost,row.currency)}`:money(row.cost,row.currency);
  const when=value=>new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const labels={overview:'Overview',requests:'Request detail',sessions:'Session',context:'Context',prices:'Model prices'};
  const components={system:'System prompt',tools:'Tool definition',tool_results:'Tool result',conversation:'Conversation content'};
  let view='overview',days=30,page=1,model='',status='',project='',query='',generation=0,priceSearch='';

  function table(head,rows){
    return `<div class="usage-table" tabindex="0" aria-label="A table that scrolls sideways"><table><thead><tr>${head.map(item=>`<th scope="col">${h(item)}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${head.length}" class="usage-empty-cell">No records in the current filter</td></tr>`}</tbody></table></div>`;
  }
  function empty(title,description){return `<div class="usage-empty"><span aria-hidden="true">∿</span><strong>${h(title)}</strong><p>${h(description)}</p></div>`;}
  function badge(ok,label){return `<span class="usage-badge ${ok?'is-ok':'is-warn'}">${h(label)}</span>`;}
  function trend(data){
    if(!data.totals.metered)return empty(data.totals.requests?'No token usage yet':'Waiting for first request',data.totals.requests?'Request records exist, but the provider returned no usage. Check the request details for status.':'Daily usage trends appear here after model calls.');
    const rows=data.daily,max=Math.max(1,...rows.map(row=>row.tokens)),width=900,height=160,step=width/rows.length;
    const bars=rows.map((row,index)=>{
      const label=`${row.date} · ${full(row.tokens)} token · ${row.requests} requests · ${row.metered} requests returned usage`;
      return row.tokens?`<rect x="${index*step+step*.13}" y="${height-row.tokens/max*height}" width="${step*.74}" height="${row.tokens/max*height}" rx="${Math.min(3,step*.15)}" tabindex="0" data-point="${h(label)}" aria-label="${h(label)}"><title>${h(label)}</title></rect>`:'';
    }).join('');
    const ticks=[...new Set([0,Math.floor((rows.length-1)/3),Math.floor((rows.length-1)*2/3),rows.length-1])];
    return `<p class="usage-chart-readout" data-chart-readout aria-live="polite">Hover or focus a bar to see that day’s usage</p><div class="usage-trend"><div class="usage-yaxis"><span>${n(max)}</span><span>${n(max/2)}</span><span>0</span></div><div class="usage-plot"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Daily Token bar chart">${bars}</svg></div></div><div class="usage-xaxis">${ticks.map(index=>`<span>${h(rows[index].date.slice(5))}</span>`).join('')}</div>`;
  }
  function sessionTable(rows,detail=false){
    return table(['Session / Project','Request','Token','Cache read',...(detail?['Total time']:[])],rows.map(row=>`<tr><td><strong>${h(row.title)}</strong><small>${h(row.project_title)}</small></td><td>${full(row.requests)}</td><td>${row.metered?n(row.tokens):'-'}<small>${row.metered}/${row.requests} requests returned usage</small></td><td>${row.cached_reported?n(row.cached):'-'}</td>${detail?`<td>${(row.duration_ms/1000).toFixed(1)} s</td>`:''}</tr>`));
  }
  function overview(data){
    const total=data.totals.input+data.totals.output;
    return `<div class="usage-overview-grid"><section class="usage-card usage-trend-card"><div class="usage-card-head"><h3>Daily Token</h3><span>Input + Output</span></div>${trend(data)}</section><section class="usage-card"><div class="usage-card-head"><h3>Model breakdown</h3><span>${data.model_totals.length} models</span></div><div class="usage-model-ranks">${data.model_totals.slice(0,6).map((row,index)=>`<div><div class="usage-rank-label"><span class="usage-rank-index">${String(index+1).padStart(2,'0')}</span><strong title="${h(row.model)}">${h(row.model)}</strong><span>${row.metered?n(row.tokens):'No response'}</span></div><div class="usage-track"><i style="width:${total?row.tokens/total*100:0}%"></i></div><small>${h(row.provider)} · ${row.requests} requests</small></div>`).join('')||empty('No model usage yet','Requests are totalled by model.')}</div></section></div><section class="usage-card"><div class="usage-card-head"><h3>Chat usage</h3><button class="pw-text-button" data-go="sessions">View all →</button></div>${sessionTable(data.sessions.slice(0,8))}</section><div class="usage-price-shortcut"><div><strong>Price table ready</strong><p>${Object.keys(data.price_catalog).length} models · reviewed ${h(data.price_checked_at)} · Manual override supported</p></div><button class="btn ghost" data-go="prices">Manage model prices →</button></div>`;
  }
  function requests(data){
    return `<section class="usage-card">${table(['Time / Status','Model / Provider','Session','Input','Output','Cache read','first characters / Total time','Estimated cost'],data.requests.map(row=>`<tr><td><time title="${h(new Date(row.created_at).toLocaleString())}">${h(when(row.created_at))}</time><small>${badge(row.status==='ok',row.status==='ok'?'Success':'Failed')}${row.attempt?'· Retry'+row.attempt:''}</small></td><td>${h(row.model)}<small>${h(row.provider)}</small></td><td>${h(row.title)}<small>${h(row.project_title)}</small></td><td title="${full(row.prompt_tokens)}">${n(row.prompt_tokens)}</td><td title="${full(row.output_tokens)}">${n(row.output_tokens)}</td><td title="${full(row.cached_tokens)}">${n(row.cached_tokens)}</td><td>${row.first_token_ms==null?'-':(row.first_token_ms/1000).toFixed(1)+' s'}<small>Total ${(row.duration_ms/1000).toFixed(1)} s</small></td><td>${cost(row)}<small>${h(row.cost_reason)}</small></td></tr>`))}</section>`;
  }
  function contexts(data){
    return `<p class="usage-note">Shows the request by character count; proportions do not mean Token or context window usage. Images are counted separately.</p><div class="usage-context-list">${data.requests.map(row=>{
      const context=row.context||{},values=Object.keys(components).map(key=>[key,Math.max(0,Number(context[key])||0)]),total=values.reduce((sum,[,value])=>sum+value,0);
      return `<details class="usage-card usage-context"><summary><span class="usage-context-title"><strong>${h(row.title)}</strong><span>${h(row.model)} · ${h(when(row.created_at))}</span></span><span class="usage-context-meta">${badge(row.status==='ok',row.status==='ok'?'Success':'Failed')}<span>${row.prompt_tokens==null?'Prompt usage not returned':n(row.prompt_tokens)+' Input Token'}</span></span></summary><div class="usage-context-detail"><div class="usage-card-head"><h4>Request composition</h4><span>${full(total)} characters</span></div>${total?`<div class="usage-composition" role="img" aria-label="${h(values.map(([key,value])=>components[key]+' '+full(value)+' characters').join(', '))}">${values.filter(([,value])=>value>0).map(([key,value])=>`<span class="usage-tone-${key}" style="width:${value/total*100}%" title="${components[key]} ${full(value)} chars · ${(value/total*100).toFixed(1)}%"></span>`).join('')}</div>`:'<p class="usage-note">No text composition records to show</p>'}<div class="usage-legend">${values.map(([key,value])=>`<div><span><i class="usage-tone-${key}"></i>${components[key]}</span><strong>${full(value)} <small>characters</small></strong><span>${!value?'0%':value/total<.001?'<0.1%':(value/total*100).toFixed(1)+'%'}</span></div>`).join('')}<p>Images: ${full(context.images||0)} <span>· Not counted in the character share</span></p></div></div></details>`;
    }).join('')||empty('No context records yet','No model requests in the current filter.')}</div>`;
  }
  function prices(data){
    const profiles=data.profile_prices;
    return `<section class="usage-card"><div class="usage-card-head"><h3>How this model is priced</h3><span>Matched automatically by the official API</span></div>${table(['Model profile','Model','Source','Currency / million Token'],profiles.map(item=>`<tr><td>${h(item.name)}</td><td>${h(item.model)}</td><td>${badge(!!item.price,item.price?.origin==='manual'?'Manual price':item.price?'Official price':'To configure')}</td><td>${item.price?`${item.price.currency} · Input ${item.price.input} / Output ${item.price.output}`:'No matching official API or model'}</td></tr>`))}<details class="usage-price-editor"><summary>CustomUnit price / Restore automatic matching</summary><p class="usage-note">Forwarding services, subscription conversions, or special discounts are set here. Saving re-prices this profile's records.</p><form data-price class="usage-filters"><label>Model profile<select name="profile_id" class="control" required>${profiles.map(item=>`<option value="${h(item.id)}">${h(item.name)}</option>`).join('')}</select></label><label>Currency<select name="currency" class="control"><option>USD</option><option>CNY</option></select></label>${[['input','Input',true],['output','Output',true],['cached','Cache read',false],['cache_write','Cache writes',false]].map(([key,label,required])=>`<label>${label}<input class="control" type="number" name="${key}" min="0" step="any" ${required?'required':''} placeholder="${required?'Required':'Optional if unknown'}"></label>`).join('')}<button class="btn" ${profiles.length?'':'disabled'}>Save unit price</button><button class="btn ghost" type="button" data-price-reset ${profiles.length?'':'disabled'}>Restore automatic matching</button><span data-price-status role="status"></span></form></details></section><section class="usage-card"><div class="usage-card-head"><div><h3>Official price table</h3><p class="usage-note">${h(data.price_checked_at)} Review · Unit: the matching currency / million Token</p></div><input class="control usage-price-search" data-price-search type="search" aria-label="Search the price table" placeholder="Search models or providers" value="${h(priceSearch)}"></div><p class="usage-note">estimates standard API token cost; currencies are totalled separately. See each model's notes for long context, promotions, peak hours, and cache writes.</p><div data-price-table></div></section>`;
  }
  function priceTable(data,host){
    const rows=Object.values(data.price_catalog).filter(item=>(item.provider+' '+item.model+' '+item.aliases.join(' ')).toLowerCase().includes(priceSearch.toLowerCase()));
    const rates=item=>`${item.input} / ${item.output} / ${item.cached??'to verify'}`;
    host.innerHTML=table(['Model / Provider','Currency','Input','Output','Cache read','Cache write','Pricing notes / Source'],rows.map(item=>`<tr><td><strong>${h(item.model)}</strong><small>${h(item.provider)}</small></td><td>${h(item.currency)}</td><td>${full(item.input)}</td><td>${full(item.output)}</td><td>${item.cached==null?'To verify':full(item.cached)}</td><td>${Array.isArray(item.cache_write)?item.cache_write.join('–'):item.cache_write??'-'}</td><td>${h(item.note||'Standard API Unit price')}<small><a href="${h(item.source)}" target="_blank" rel="noopener noreferrer">Official pricing ↗</a></small>${item.peak?`<small>peak-hour input / Output / Cache: ${rates(item.peak)}</small>`:''}${(item.tiers||[]).map(tier=>`<small>Input >${full(tier.above)}: ${rates(tier)}</small>`).join('')}${(item.schedule||[]).map(rate=>`<small>${rate.from} from: ${rates(rate)}</small>`).join('')}</td></tr>`));
  }
  function bindPrices(data,host){
    const form=host.querySelector('[data-price]');if(!form)return;
    const fill=()=>{const price=data.profile_prices.find(item=>item.id===form.elements.profile_id.value)?.price||{};for(const key of ['input','output','cached','cache_write'])form.elements[key].value=typeof price[key]==='number'?price[key]:'';form.elements.currency.value=price.currency||'USD';};
    form.elements.profile_id.onchange=fill;fill();
    const save=async reset=>{
      const controls=[...form.querySelectorAll('button')];controls.forEach(button=>button.disabled=true);
      const payload=Object.fromEntries(new FormData(form));if(reset)payload.reset=true;
      try{await api('/api/usage/prices',payload);await render(host);}catch(error){if(form.isConnected)form.querySelector('[data-price-status]').textContent=error.message;}finally{controls.forEach(button=>button.disabled=false);}
    };
    form.onsubmit=event=>{event.preventDefault();save(false);};form.querySelector('[data-price-reset]').onclick=()=>save(true);
    priceTable(data,host.querySelector('[data-price-table]'));
    host.querySelector('[data-price-search]').oninput=event=>{priceSearch=event.target.value;priceTable(data,host.querySelector('[data-price-table]'));};
  }
  async function exportCSV(data){
    const keys=['created_at','model','provider','title','status','attempt','prompt_tokens','output_tokens','cached_tokens','reasoning_tokens','duration_ms','first_token_ms','currency','cost_min','cost','cost_reason'];
    const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
    const csv='\uFEFF'+[keys,...data.requests.map(row=>keys.map(key=>row[key]))].map(row=>row.map(cell).join(',')).join('\r\n');
    try{
      const message=await exportBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),'model-usage.csv');
      if(message)uiNotify(message);
    }catch(error){uiNotify('Export failed:'+error.message);}
  }
  async function render(host){
    if(route()!=='usage')return;
    const ticket=++generation,focus=host.contains(document.activeElement)?document.activeElement:null;
    const focusKey=focus?.dataset.view?'[data-view="'+focus.dataset.view+'"]':focus?.hasAttribute('data-usage-refresh')?'[data-usage-refresh]':focus?.hasAttribute('data-usage-search')?'[data-usage-search]':null;
    if(!host.querySelector('.usage-page'))host.innerHTML='<div class="usage-page usage-loading" role="status"><div></div><div></div><div></div><p>LoadingUsage...</p></div>';
    host.setAttribute('aria-busy','true');
    try{
      const data=await api('/api/usage?'+new URLSearchParams({days,page,model,status,project_id:project,q:query}));
      if(ticket!==generation||route()!=='usage')return;
      page=data.page;const totals=data.totals,known=totals.metered>0;
      const costs=Object.entries(totals.costs).map(([currency,value])=>cost({cost:value.max,cost_min:value.min,currency}));
      const metrics=[['Total tokens',known?n(totals.input+totals.output):'-',known?'Input '+n(totals.input)+' · Output '+n(totals.output):totals.requests?'Provider returned no usage':'No calls recorded'],['Requests',n(totals.requests),`${totals.requests-totals.failed} Success · ${totals.failed} Failed`],['Cache read',totals.cached_reported?n(totals.cached):'-','Input Token subset of'],['Reasoning tokens',totals.reasoning_reported?n(totals.reasoning):'-','Output Token subset of'],['Estimated cost',costs.length?costs.join('<br>'):known?'To price':'-',`${totals.priced} / ${totals.requests} calls priced`]];
      host.innerHTML=`<section class="usage-page"><header class="usage-header"><div><p class="usage-eyebrow"><i></i>Model run observability</p><h2>Usage<span>Every call leaves a trail</span></h2></div><button class="btn ghost" data-usage-refresh>↻ Refresh</button></header><nav class="usage-tabs" aria-label="Usage view">${Object.entries(labels).map(([id,label])=>`<button type="button" data-view="${id}" aria-pressed="${view===id}">${label}</button>`).join('')}</nav>${view==='prices'?'':`<div class="usage-filters"><label>Time range<select data-days class="control">${[1,7,30,90,365].map(value=>`<option value="${value}" ${days===value?'selected':''}>${value===1?'Recent 24 hours':'Recent '+value+' d'}</option>`).join('')}</select></label><label>Model<select data-model class="control"><option value="">All models</option>${[...new Set(data.models.map(item=>item.model))].map(value=>`<option ${model===value?'selected':''}>${h(value)}</option>`).join('')}</select></label><label>Project<select data-project class="control"><option value="">All projects</option>${S.tasks.map(item=>`<option value="${h(item.id)}" ${project===item.id?'selected':''}>${h(item.title)}</option>`).join('')}</select></label><label>Status<select data-status class="control"><option value="">All requests</option><option value="ok" ${status==='ok'?'selected':''}>Success</option><option value="error" ${status==='error'?'selected':''}>Failed</option></select></label><button class="btn ghost usage-export" data-export>↓ Export this page’s requests CSV</button></div><div class="usage-kpis">${metrics.map(([label,value,hint],index)=>`<article class="${index===0?'usage-primary':''}"><small>${label}</small><strong>${value}</strong><span>${hint}</span></article>`).join('')}</div><div class="usage-coverage"><span><i class="${totals.requests&&!known?'is-warn':''}"></i>${totals.metered} / ${totals.requests} requests returned usage</span><p>Values not returned show as ”-”, excluded from the total. Costs are estimated at current prices.</p>${Object.keys(totals.unpriced).length?`<span>${h(Object.entries(totals.unpriced).map(([reason,count])=>reason+' '+count+' times').join(' · '))}</span>`:''}</div>`}<div data-usage-body></div></section>`;
      const body=host.querySelector('[data-usage-body]');
      body.innerHTML=view==='overview'?overview(data):view==='requests'?requests(data):view==='sessions'?`<section class="usage-card"><div class="usage-card-head"><h3>Chat usage</h3><span>Sort by token · at most 200 items</span></div>${sessionTable(data.sessions,true)}</section>`:view==='context'?contexts(data):prices(data);
      if(['requests','context'].includes(view))body.insertAdjacentHTML('beforeend',`<div class="usage-pager"><span>${full(totals.requests)} requests · per page 100 items</span><button class="btn ghost" data-prev ${page<=1?'disabled':''}>Previous</button><span>${page} / ${data.pages}</span><button class="btn ghost" data-next ${page>=data.pages?'disabled':''}>Next</button></div>`);
      host.querySelectorAll('[data-view],[data-go]').forEach(button=>button.onclick=()=>{view=button.dataset.view||button.dataset.go;page=1;render(host);});
      for(const [selector,set] of [['days',value=>days=Number(value)],['model',value=>model=value],['project',value=>project=value],['status',value=>status=value]]){const input=host.querySelector('[data-'+selector+']');if(input)input.onchange=event=>{set(event.target.value);page=1;render(host);};}
      host.querySelector('[data-usage-refresh]').onclick=()=>render(host);
      for(const [selector,delta] of [['prev',-1],['next',1]]){const button=host.querySelector('[data-'+selector+']');if(button)button.onclick=()=>{page+=delta;render(host);};}
      const exporter=host.querySelector('[data-export]');if(exporter)exporter.onclick=()=>exportCSV(data);
      if(exporter){
        exporter.insertAdjacentHTML('beforebegin',`<label>Search records<input class="control" type="search" data-usage-search placeholder="models, chats, projects · Enter Search" value="${h(query)}"></label>`);
        const search=host.querySelector('[data-usage-search]');
        const apply=()=>{query=search.value.trim();page=1;render(host);};
        search.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();apply();}else if(event.key==='Escape'&&search.value){event.preventDefault();event.stopPropagation();search.value='';apply();}};
        search.oninput=()=>{if(!search.value&&query)apply();};
      }
      host.querySelectorAll('[data-point]').forEach(point=>{for(const type of ['focus','pointerenter'])point.addEventListener(type,()=>host.querySelector('[data-chart-readout]').textContent=point.dataset.point);});
      bindPrices(data,host);if(focusKey)host.querySelector(focusKey)?.focus({preventScroll:true});
    }catch(error){
      if(ticket!==generation||route()!=='usage')return;
      host.innerHTML=`<section class="usage-page"><div class="usage-empty" role="alert"><strong>Usage stats cannot load right now</strong><p>${h(error.message)}</p><button class="btn ghost" data-retry>Retry</button></div></section>`;
      host.querySelector('[data-retry]').onclick=()=>render(host);
    }finally{if(ticket===generation)host.removeAttribute('aria-busy');}
  }
  return {render};
})();
