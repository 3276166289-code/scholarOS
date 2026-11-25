window.PromptUI = (() => {
  const pending = new Map();
  const apiFor = (action, project, body={}) => api(`/api/prompt-templates/${action}`, {project_id:project,...body});
  const scopeNames = {project:'Project',step:'Workflow steps',assistant:'Expert',member:'Team members',schedule:'Schedule'};
  const autoNames = new Set(['project.title','project.question','research_question','Research question']);
  const ref = (key, project) => pending.get(key)?.project_id===project ? pending.get(key) : undefined;

  function fields(host, item, options, initial={}){
    host.innerHTML=Object.entries(item.variables).map(([name,spec],i)=>{
      const value=initial[name] ?? spec.default ?? '';
      const choices=spec.type==='asset_ref' ? (options.assets||[]).map(a=>[a.id,a.name]) : (spec.options||[]).map(v=>[v,v]);
      const input=['enum','asset_ref'].includes(spec.type)
        ? `<select aria-label="${esc(spec.label||name)}" data-variable="${i}"><option value="">Select</option>${choices.map(([v,label])=>`<option value="${esc(String(v))}" ${String(value)===String(v)?'selected':''}>${esc(String(label))}</option>`).join('')}</select>`
        : `<textarea rows="2" data-variable="${i}" placeholder="${autoNames.has(name)?'Blank uses the project material':spec.required===false?'Optional':'Enter'}">${esc(String(value))}</textarea>`;
      return `<label>${esc(spec.label||name)}${spec.required===false?' (optional)':''}${input}${spec.description?`<small class="hint">${esc(spec.description)}</small>`:''}</label>`;
    }).join('') || '<p class="hint">Fixed-text template, ready to use.</p>';
    return ()=>Object.fromEntries(Object.entries(item.variables).flatMap(([name,spec],i)=>{
      const value=host.querySelector(`[data-variable="${i}"]`).value;
      if(value==='')return [];
      const original=spec.type==='enum' ? spec.options.find(v=>String(v)===value) : value;
      return [[name,original]];
    }));
  }

  async function configure(project, templateId, choose, options={}){
    const d=Notebook.dialog('Apply prompt template','<p class="hint">Loading template...</p>');
    try{
      const [item,bindingOptions]=await Promise.all([apiFor('read',project,{template_id:templateId}),apiFor('options',project)]);
      d.querySelector('.hint').remove();
      const body=document.createElement('div');body.innerHTML=`<p><strong>${esc(item.title)}</strong> · Version ${item.revision}</p><div class="nb-form" data-variables></div>
        <details class="pt-preview"><summary>Template text</summary><pre>${esc(item.body)}</pre></details><div class="nb-actions"><button class="btn ghost" data-preview>Preview</button><button class="btn" data-apply>${esc(options.applyLabel||'Apply to this run')}</button><button class="btn ghost" data-binding ${options.bindings===false?'hidden':''}>Default binding...</button></div><pre class="pt-preview" data-result hidden></pre>`;
      d.querySelector('.nb-error').before(body);
      const values=fields(body.querySelector('[data-variables]'),item,bindingOptions);
      async function validate(){
        const result=await apiFor('render',project,{template_id:templateId,revision_id:item.revision_id,variables:values()});
        if(!result.ok)throw new Error([...result.missing.map(n=>`Fill in ${n}`),...Object.entries(result.errors).map(([n,e])=>`${n}: ${e}`)].join('\n'));
        Notebook.error(d,'');return result;
      }
      body.querySelector('[data-preview]').onclick=async()=>{try{const result=await validate(),out=body.querySelector('[data-result]');out.hidden=false;out.textContent=result.rendered;}catch(e){Notebook.error(d,e);}};
      body.querySelector('[data-apply]').onclick=async()=>{try{const rendered=await validate();await choose({project_id:project,template_id:templateId,revision_id:item.revision_id,variables:values(),title:item.title,revision:item.revision},rendered);d.close();}catch(e){Notebook.error(d,e);}};
      body.querySelector('[data-binding]').onclick=()=>bindingDialog(project,templateId);
    }catch(e){Notebook.error(d,e);}
  }

  async function picker(project, choose, options={}){
    if(!project)return uiNotify('Pick a project before citing its prompt templates.');
    const d=Notebook.dialog('Choose prompt template','<div class="nb-form"><label>Search templates<input type="search" placeholder="title or content"></label></div><div data-tags></div><div class="pt-template-list"></div>');
    let items=[], tags=[], sequence=0;
    const input=d.querySelector('input');
    function paint(){d.querySelector('.pt-template-list').innerHTML=items.filter(t=>tags.every(v=>t.tags.includes(v))).map(t=>`<button class="pt-template-pick" data-template="${esc(t.template_id)}"><strong>${esc(t.title)}</strong><span class="hint">${esc(t.tags.join(' · ')||'Fixed text or variable template')}</span></button>`).join('')||'<p class="hint">No templates. Click "New template" in a note, save, then use it.</p>';
      d.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>configure(project,b.dataset.template,async(v,rendered)=>{await choose(v,rendered);d.close();},options));}
    try{items=(await apiFor('search',project)).templates;Notebook.tagPicker(d.querySelector('[data-tags]'),[],[...new Set(items.flatMap(t=>t.tags))],v=>{tags=v;paint();},{allowCreate:false,name:'Filter tags'});input.oninput=async()=>{const seq=++sequence;try{const result=await apiFor('search',project,{query:input.value});if(seq===sequence&&d.isConnected){items=result.templates;paint();}}catch(e){Notebook.error(d,e);}};paint();}catch(e){Notebook.error(d,e);}
  }

  function mount(textarea, key, project, onChange=()=>{}){
    if(!textarea)return;
    textarea.parentElement.querySelector('.pt-composer')?.remove();
    const host=document.createElement('div');host.className='pt-composer';textarea.before(host);
    function paint(){const value=ref(key,project);host.innerHTML=`<button type="button" class="btn ghost" data-pick ${project?'':'disabled'} title="${project?'Pick a prompt template for this run':'Bind a project first'}">Prompt templates</button>${value?`<span>${esc(value.title)} · v${value.revision}</span><button type="button" class="btn ghost" data-clear aria-label="Remove template this round">×</button>`:'<small class="hint">Uses the enabled default binding when nothing is picked</small>'}`;
      host.querySelector('[data-pick]').onclick=()=>picker(project,v=>{pending.set(key,v);onChange(v);paint();});
      host.querySelector('[data-clear]')?.addEventListener('click',()=>{pending.delete(key);onChange(null);paint();});}
    paint();
  }

  async function applyToChat(project, templateId){
    await configure(project,templateId,async value=>{
      if(window.ProjectWorkspace)return ProjectWorkspace.applyTemplate(project,value);
      let chat=(S.chats||[]).find(c=>c.id===curChat&&c.task_id===project);
      if(!chat){const created=await api('/api/chat/create',{title:value.title,task_id:project});chat=created.chat;}
      curChat=chat.id;localStorage.setItem('rw-chat',curChat);pending.set(`chat:${curChat}`,value);
      await refreshState(false);openTab('agent');
      if($('ask')){$('ask').value=`Complete the task as "${value.title}".`;$('ask').focus();grow();}
    });
  }

  function noteActions(host,note){
    const template=note.metadata.note_type==='prompt_template';
    host.innerHTML=template?`<span class="nb-tag">Prompt templates</span><button class="btn ghost" data-use>Apply to Agent</button><button class="btn ghost" data-settings ${note.read_only?'disabled':''}>Template settings</button><button class="btn ghost" data-history>Usage records</button><button class="btn ghost" data-copy ${note.read_only?'disabled':''}>Copy template</button>`:`<button class="btn ghost" data-copy ${note.read_only?'disabled':''}>Copy as prompt template</button>`;
    async function saved(){if(!await pnSaveCurrent())throw new Error('Save the note first');return mdProj?.metadata?.template_id;}
    host.querySelector('[data-use]')?.addEventListener('click',async()=>{try{const tid=await saved();await applyToChat(note.pid,tid);}catch(e){uiNotify(e.message);}});
    host.querySelector('[data-settings]')?.addEventListener('click',()=>settings(note));
    host.querySelector('[data-history]')?.addEventListener('click',async()=>{try{await usageHistory(note.pid,await saved());}catch(e){uiNotify(e.message);}});
    host.querySelector('[data-copy]').onclick=async()=>{try{await saved();const result=await apiFor('copy',note.pid,{path:note.path});await Notebook.open(result.path);}catch(e){uiNotify(e.message);}};
  }

  function settings(note){
    const meta=note.metadata, body=$('mdSource')?.value||note.content||'';
    let definitions={...meta.variables};
    for(const match of body.matchAll(/\{\{\s*([\w\u4e00-\u9fff][\w.\u4e00-\u9fff]{0,79})\s*\}\}/g))definitions[match[1]] ||= {type:'text',required:true};
    const names=Object.keys(definitions);
    const d=Notebook.dialog('Template settings',`<form class="nb-form"><label>Template state<select name="status"><option value="active">Available</option><option value="draft">Draft</option><option value="disabled">Disable</option></select></label><label>What it is for<textarea name="description" rows="2">${esc(meta.description||'')}</textarea></label>
      <p class="hint">Variables optional. Write in the text {{Variable name}} then the settings appear here. It also works with no variables.</p>
      ${names.map((name,i)=>{const spec=definitions[name];return `<fieldset data-definition="${i}"><legend>${esc(name)}</legend><label>Type<select name="type">${[['text','Text'],['number','Number'],['enum','Options'],['asset_ref','Project materials']].map(([v,l])=>`<option value="${v}" ${spec.type===v?'selected':''}>${l}</option>`).join('')}</select></label><label><input type="checkbox" name="required" ${spec.required===false?'':'checked'}>Required</label><label>Default<input name="default" value="${esc(String(spec.default??''))}"></label><label>Options (one per line)<textarea name="options" rows="2">${esc((spec.options||[]).join('\n'))}</textarea></label></fieldset>`;}).join('')}
      <button class="btn" type="submit">Save template settings</button></form>`);
    d.querySelector('[name=status]').value=meta.template_status||'active';
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const variables={};
      names.forEach((name,i)=>{const row=d.querySelector(`[data-definition="${i}"]`),type=row.querySelector('[name=type]').value,value=row.querySelector('[name=default]').value;
        variables[name]={type,required:row.querySelector('[name=required]').checked,...(value===''?{}:{default:value}),...(type==='enum'?{options:row.querySelector('[name=options]').value.split('\n').map(v=>v.trim()).filter(Boolean)}:{})};});
      const before={...note.metadata};Object.assign(note.metadata,{variables,template_status:d.querySelector('[name=status]').value,description:d.querySelector('[name=description]').value});
      mdScheduleSave();if(await pnSaveCurrent()){d.close();Notebook.mountMetadata();}else{note.metadata=before;Notebook.error(d,new Error($('mdSaveState')?.title||'Save failed'));}
    };
  }

  async function bindingDialog(project, templateId){
    const d=Notebook.dialog('Default template binding','<p class="hint">Precedence: this round’s choice → Schedule → Workflow steps → Team members → Expert → project. Pinned by defaultCurrent version, you may follow updates.</p>');
    try{
      const [item,options,state]=await Promise.all([apiFor('read',project,{template_id:templateId}),apiFor('options',project),apiFor('bindings',project)]);
      const wrapper=document.createElement('div');wrapper.innerHTML=`<p>Template: ${esc(item.title)} · v${item.revision}</p><form class="nb-form"><label>Binding scope<select name="scope">${Object.entries(scopeNames).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label><label>Binding target<select name="target"></select></label><div class="nb-form" data-values></div><label><span><input name="latest" type="checkbox">Follow the templateLatest version</span></label><label><span><input name="enabled" type="checkbox" checked>Enable this binding</span></label><button class="btn" type="submit">Save the default binding</button></form><div data-existing></div>`;
      d.querySelector('.nb-error').before(wrapper);
      const form=wrapper.querySelector('form'),valuesHost=wrapper.querySelector('[data-values]');let values=fields(valuesHost,item,options);
      function targets(){form.elements.target.innerHTML=options[form.elements.scope.value].map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');}
      form.elements.scope.onchange=targets;targets();
      async function paint(rows){wrapper.querySelector('[data-existing]').innerHTML='<h4>This project already has bindings</h4>'+rows.map((r,i)=>`<div class="nb-category-row"><span>${esc(scopeNames[r.scope])} · ${esc(options[r.scope]?.find(x=>x.id===r.scope_id)?.name||r.scope_id||'Current project')} · ${r.enabled?'Enable':'Disable'}${r.template_id===templateId?' (this template)':''}</span><button class="btn ghost" data-edit="${i}">Change</button><button class="btn ghost" data-remove="${i}">Delete</button></div>`).join('');
        wrapper.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{try{const result=await apiFor('bind',project,{...rows[Number(b.dataset.remove)],delete:true});paint(result.bindings);}catch(e){Notebook.error(d,e);}});
        wrapper.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.edit)];if(r.template_id!==templateId){bindingDialog(project,r.template_id);return;}form.elements.scope.value=r.scope;targets();form.elements.target.value=r.scope_id;form.elements.latest.checked=!r.revision_id;form.elements.enabled.checked=!!r.enabled;values=fields(valuesHost,item,options,r.variables);});
      }
      paint(state.bindings);
      form.onsubmit=async e=>{e.preventDefault();if(!form.elements.target.options.length)return Notebook.error(d,new Error('Nothing in this project can be bound yet'));
        try{const result=await apiFor('bind',project,{scope:form.elements.scope.value,scope_id:form.elements.target.value,template_id:templateId,revision_id:item.revision_id,variables:values(),follow_latest:form.elements.latest.checked,enabled:form.elements.enabled.checked});paint(result.bindings);d.querySelector('.nb-error').textContent='Default binding saved.';}catch(err){Notebook.error(d,err);}};
    }catch(e){Notebook.error(d,e);}
  }

  async function usageHistory(project, templateId){
    const d=Notebook.dialog('Template usage log','<div data-history></div>');
    try{const {history}=await apiFor('history',project,{template_id:templateId});d.querySelector('[data-history]').innerHTML=history.map(r=>`<details class="pt-preview"><summary>${esc(r.created_at)} · v${esc(String(r.input_snapshot.revision||''))} · ${esc(r.run_id||'')}${r.input_snapshot.applied_prompt!==undefined&&r.input_snapshot.applied_prompt!==r.input_snapshot.rendered?' · changed this time':''}</summary><pre>${esc(r.input_snapshot.applied_prompt??r.input_snapshot.rendered??'')}</pre></details>`).join('')||'<p class="hint">This template has not been used yet. Previews do not count as use.</p>';}catch(e){Notebook.error(d,e);}
  }

  async function manageBindings(project){
    const d=Notebook.dialog('Project template binding','<p class="hint">Review and clear existing bindings here; add new ones from the available template“Apply to Agent → Default binding”to enter.</p><div data-bindings></div>');
    async function paint(){
      try{const [state,options,catalog]=await Promise.all([apiFor('bindings',project),apiFor('options',project),apiFor('search',project,{include_disabled:true})]);
        d.querySelector('[data-bindings]').innerHTML=state.bindings.map((r,i)=>`<div class="nb-category-row"><span>${esc(scopeNames[r.scope])} · ${esc(options[r.scope]?.find(x=>x.id===r.scope_id)?.name||r.scope_id||'Current project')}<br>${esc(catalog.templates.find(t=>t.template_id===r.template_id)?.title||'Template no longer valid')} · ${r.enabled?'Enable':'Disable'}</span><button class="btn ghost" data-edit="${i}">Change</button><button class="btn ghost" data-remove="${i}">Release</button></div>`).join('')||'<p class="hint">This project has no default template binding.</p>';
        d.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>bindingDialog(project,state.bindings[Number(b.dataset.edit)].template_id));
        d.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{try{await apiFor('bind',project,{...state.bindings[Number(b.dataset.remove)],delete:true});await paint();}catch(e){Notebook.error(d,e);}});
      }catch(e){Notebook.error(d,e);}
    }
    await paint();
  }

  function event(box,ev){const card=document.createElement('div');card.className='pt-used';card.textContent=`Prompt template: ${ev.title} · v${ev.revision}`;card.title=`Template version: ${ev.revision_id}`;box.appendChild(card);}
  return {picker,configure,usageHistory,mount,ref,select(key,value){if(value)pending.set(key,value);else pending.delete(key);},noteActions,bindingDialog,manageBindings,event};
})();
