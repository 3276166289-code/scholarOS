/* Visible template management shares project notes, versions and taxonomy. */
window.PromptLibrary=(()=>{
  const h=value=>esc(String(value??''));
  const request=(action,project,body={})=>api('/api/prompt-templates/'+action,{project_id:project,...body});
  const statuses={active:'Available',draft:'Draft',disabled:'Disabled'};
  const labelFields=(form,names)=>Object.entries(names).forEach(([name,label])=>form.elements.namedItem(name)?.setAttribute('aria-label',label));
  async function open(options={}){
    const projects=S.tasks||[];
    const state={project:options.project_id||curTask||projects[0]?.id||'',data:null,key:'',note:null,dirty:false,saving:false,loading:false,sequence:0,loadSequence:0};
    const dialog=Notebook.dialog('Prompt template library',`<div class="pl-toolbar"><label>Template’s project<select class="control" data-pl-project aria-label="Template’s project"><option value="">Built-in templates only</option>${projects.map(p=>`<option value="${h(p.id)}">${h(p.title)}</option>`).join('')}</select></label><button type="button" class="btn" data-pl-new>New template</button><button type="button" class="btn ghost" data-pl-categories>Manage categories</button><button type="button" class="btn ghost" data-pl-bindings>Template binding</button><button type="button" class="btn ghost" data-pl-refresh>Refresh</button></div><div class="pl-filters"><input type="search" class="control" data-pl-search aria-label="Search templates" placeholder="Search names, categories, or tags"><select class="control" data-pl-source aria-label="Template source"><option value="all">All templates</option><option value="project">Project templates</option><option value="builtin">Built-in templates</option></select><span class="hint" data-pl-count></span></div><div class="pl-layout"><nav class="pl-list" data-pl-list aria-label="Template list"></nav><section class="pl-editor" data-pl-editor aria-label="Template details"></section></div>`);
    dialog.classList.add('prompt-library');
    const el=name=>dialog.querySelector('[data-pl-'+name+']');
    const fail=err=>Notebook.error(dialog,err);
    el('project').value=state.project;
    const categoryName=id=>{const rows=state.data?.catalog.categories||[],item=rows.find(c=>c.id===id),parent=rows.find(c=>c.id===item?.parent_id);return item?(parent?parent.name+' / ':'')+item.name:'Uncategorized';};
    const defaultCategory=()=>state.data?.catalog.categories.find(c=>c.preset_key==='prompt_templates')?.id||'';
    const categoryOptions=(selected='',exclude=new Set())=>'<option value="">Uncategorized</option>'+(state.data?.catalog.categories||[]).filter(c=>!exclude.has(c.id)).map(c=>`<option value="${h(c.id)}" ${c.id===selected?'selected':''}>${h(categoryName(c.id))}</option>`).join('');
    async function leave(){if(state.saving)return false;return !state.dirty||await uiConfirm('You have unsaved template changes that will be lost. Continue?',{ok:'Discard changes',cancel:'Continue editing',danger:true});}
    async function close(){if(await leave())dialog.close();}
    dialog.querySelector('[data-close]').onclick=close;
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    function rows(){return [...(state.data?.templates||[]).map(item=>({...item,key:'project:'+item.template_id,source:'project',name:item.title,category:categoryName(item.category_id)})),...(state.data?.builtins||[]).map(item=>({...item,key:'builtin:'+item.id,source:'builtin'}))];}
    function paintList(){
      const query=el('search').value.trim().toLocaleLowerCase(),source=el('source').value;
      const visible=rows().filter(item=>(source==='all'||source===item.source)&&(!query||[item.name,item.description,item.excerpt,item.prompt,item.category,...item.tags||[]].join(' ').toLocaleLowerCase().includes(query)));
      el('count').textContent=visible.length+'templates';
      el('list').innerHTML=visible.map(item=>`<button type="button" class="pl-item ${item.key===state.key?'is-selected':''}" data-pl-row="${h(item.key)}" aria-pressed="${item.key===state.key}"><strong>${h(item.name)}</strong><small>${h(item.source==='builtin'?'Built-in · '+item.category:categoryName(item.category_id)+' · '+(statuses[item.template_status]||'Available'))}</small>${item.description||item.tags?.length?`<span>${h(item.source==='builtin'?item.description:(item.tags||[]).join(' · '))}</span>`:''}</button>`).join('')||'<p class="pl-empty hint">No matching templates. Click "New template" to add one.</p>';
      el('list').querySelectorAll('[data-pl-row]').forEach(button=>button.onclick=()=>select(button.dataset.plRow));
    }
    function headerState(){const locked=state.loading||!state.data||!state.project||state.data.read_only;el('new').disabled=locked;el('categories').disabled=locked;el('bindings').disabled=!state.project;el('project').value=state.project;}
    async function load(key=state.key){
      const sequence=++state.sequence,loadSequence=++state.loadSequence;
      state.loading=true;headerState();el('list').innerHTML='<p class="pl-empty hint">Reading the template library...</p>';el('editor').innerHTML='<p class="pl-empty hint" role="status">Reading templates...</p>';
      try{const data=await request('library',state.project);if(sequence!==state.sequence||!dialog.isConnected)return;
        state.data=data;headerState();paintList();
        const next=rows().find(item=>item.key===key)||rows()[0];
        if(next)await select(next.key,false);else{state.key='';state.note=null;el('editor').innerHTML='<p class="pl-empty hint">Click "New template" to create a project template.</p>';}
      }catch(err){fail(err);}finally{if(loadSequence===state.loadSequence){state.loading=false;if(dialog.isConnected)headerState();}}
    }
    async function select(key,check=true){
      if(check&&!await leave())return;
      const item=rows().find(row=>row.key===key);if(!item)return;
      const sequence=++state.sequence;state.dirty=false;state.key=key;paintList();el('editor').innerHTML='<p class="pl-empty hint" role="status">Reading templates...</p>';
      try{const note=item.source==='builtin'?{title:item.name,body:item.prompt,metadata:{category_id:defaultCategory(),description:item.description,tags:['Paper toolbox',item.tool==='translate'?'Translate':'Polish',item.category],template_status:'active'},variables:{},builtin:true}:await request('inspect',state.project,{template_id:item.template_id});
        if(sequence!==state.sequence||!dialog.isConnected)return;state.note=note;paintEditor();Notebook.error(dialog,'');
      }catch(err){fail(err);}
    }
    function newDraft(source=null){
      ++state.sequence;
      state.key='';state.dirty=false;state.note={title:source?source.title+'(custom)':'',body:source?.body||'',metadata:{category_id:defaultCategory(),tags:[],template_status:'active',...source?.metadata},variables:source?.variables||{}};
      delete state.note.metadata.template_id;paintList();paintEditor();
    }
    function paintEditor(){
      const note=state.note,meta=note.metadata||{},builtin=!!note.builtin,locked=builtin||state.data.read_only;
      el('editor').innerHTML=`<form class="pl-editor-form"><div class="pl-editor-heading"><div><span class="pw-eyebrow">${builtin?'Built-in templates':'Project templates'}</span><h4>${h(note.title||'New prompt template')}</h4></div><span class="hint" data-pl-save-state>${builtin?'Copy it, then edit and save':'Edit, then click save'}</span></div><div class="pl-fields"><label class="pl-wide">Template name<input class="control" name="title" required maxlength="100" value="${h(note.title)}"></label><label>Category<select class="control" name="category">${categoryOptions(meta.category_id)}</select></label><label>Status<select class="control" name="status">${Object.entries(statuses).map(([value,label])=>`<option value="${value}" ${value===(meta.template_status||'active')?'selected':''}>${label}</option>`).join('')}</select></label><label class="pl-wide">Tags<input class="control" name="tags" value="${h((meta.tags||[]).join(', '))}" placeholder="Separate tags with commas"></label><label class="pl-wide">What it is for<textarea class="control" name="description" rows="2">${h(meta.description||'')}</textarea></label></div><label class="pl-body-label">Prompt body<textarea class="control pl-body-input" name="content" rows="11" required placeholder="Write a reusable instruction; use {{Variable name}} Add variable">${h(note.body)}</textarea></label><details class="pl-variables"><summary>Variable settings (optional)</summary><p class="hint">in the text, {{Variable name}} is treated as a text variable. Set its type, default, and options below.</p><label>Variable definitions (JSON)<textarea class="control" name="variables" rows="5">${h(JSON.stringify(note.variables||{},null,2))}</textarea></label></details><footer class="pl-editor-actions">${builtin?'<button type="button" class="btn" data-pl-copy>Copy asCustomTemplate</button>':`<button type="submit" class="btn" data-pl-save>Save template</button><button type="button" class="btn ghost" data-pl-copy>Copy template</button>${note.template_id?'<button type="button" class="btn ghost pl-delete" data-pl-delete>Delete template</button><button type="button" class="btn ghost" data-pl-history>Usage records</button>':''}`} ${!builtin&&note.template_id&&options.onChoose?'<button type="button" class="btn ghost" data-pl-apply>used by this tool</button>':''}</footer>${locked&&!builtin?'<p class="hint">Current projectis read-only and cannot change the template.</p>':''}</form>`;
      const form=el('editor').querySelector('form');
      labelFields(form,{title:'Template name',category:'Category',status:'Status',tags:'Tags',description:'Purpose',content:'Prompt body',variables:'Variable definitions (JSON)'});
      if(locked)form.querySelectorAll('input,textarea,select').forEach(input=>{if(input.tagName==='SELECT')input.disabled=true;else input.readOnly=true;});
      form.querySelector('[data-pl-copy]').disabled=!state.project||state.data.read_only;
      form.querySelector('[data-pl-copy]').onclick=async()=>{if(await leave())newDraft(note);};
      form.elements.content.required=(meta.template_status||'active')!=='draft';
      form.oninput=form.onchange=()=>{if(locked)return;form.elements.content.required=form.elements.status.value!=='draft';state.dirty=true;el('save-state').textContent='Unsaved changes';if(el('apply'))el('apply').disabled=true;};
      if(el('save'))el('save').disabled=locked;
      if(el('delete')){el('delete').disabled=locked;el('delete').onclick=remove;}
      if(el('history'))el('history').onclick=()=>PromptUI.usageHistory(state.project,note.template_id);
      if(el('apply')){el('apply').disabled=(meta.template_status||'active')!=='active';el('apply').onclick=()=>PromptUI.configure(state.project,note.template_id,async(reference,rendered)=>{await options.onChoose(reference,rendered);dialog.close();},{applyLabel:'Used by the current tool',bindings:false});}
      form.onsubmit=async event=>{
        event.preventDefault();if(locked||state.saving)return;
        const values=form.elements;let variables;
        try{variables=JSON.parse(values.variables.value||'{}');if(!variables||typeof variables!=='object'||Array.isArray(variables))throw new Error();}catch{return fail(new Error('Variable definitions need a valid JSON object'));}
        state.saving=true;form.inert=true;el('save-state').textContent='Saving...';
        try{const saved=await request('save',state.project,{template_id:note.template_id||'',expected_hash:note.content_hash||'',title:values.title.value,content:values.content.value,metadata:{category_id:values.category.value,template_status:values.status.value,tags:values.tags.value.split(/[,, \n]/).map(v=>v.trim()).filter(Boolean),description:values.description.value,variables}});
          state.dirty=false;options.onChanged?.({project_id:state.project,template_id:saved.template_id,status:saved.template_status});
          await load('project:'+saved.template_id);el('save-state').textContent='Saved';
        }catch(err){fail(err);el('save-state').textContent='Save failed; your current content was kept';}finally{state.saving=false;form.inert=false;}
      };
    }
    async function remove(){
      if(!await leave())return;const note=state.note;
      if(!await uiConfirm('Delete template "'+note.title+'"? This also removes its default binding; submitted tasks and run history are kept.',{ok:'Delete template',danger:true}))return;
      state.saving=true;
      try{await request('delete',state.project,{template_id:note.template_id,expected_hash:note.content_hash});state.dirty=false;options.onChanged?.({project_id:state.project,template_id:note.template_id,deleted:true});await load('');}catch(err){fail(err);}finally{state.saving=false;}
    }
    async function categories(){
      if(!await leave())return;state.dirty=false;
      const project=state.project,box=Notebook.dialog('Manage template categories','<p class="hint">Shares categories with the current project’s notes. Editing a category never moves files.</p><button type="button" class="btn" data-pl-add-category>New category</button><div data-pl-category-list></div>');
      async function change(body){const catalog=await api('/api/project/note-categories',{project_id:project,expected_hash:state.data.catalog.content_hash,...body});state.data.catalog=catalog;paint();}
      function descendants(id){const result=new Set([id]);let previous;do{previous=result.size;state.data.catalog.categories.forEach(c=>{if(result.has(c.parent_id))result.add(c.id);});}while(previous!==result.size);return result;}
      function edit(category=null){
        const child=Notebook.dialog(category?'Edit template category':'New template category',`<form class="nb-form"><label>Category name<input class="control" name="name" required maxlength="80" value="${h(category?.name||'')}"></label><label>Parent category<select class="control" name="parent"><option value="">None (top level)</option>${state.data.catalog.categories.filter(c=>!c.parent_id&&c.id!==category?.id).map(c=>`<option value="${h(c.id)}" ${c.id===(category?.parent_id??defaultCategory())?'selected':''}>${h(c.name)}</option>`).join('')}</select></label><label>Description<textarea class="control" name="description" rows="2">${h(category?.description||'')}</textarea></label><button type="submit" class="btn">Save category</button></form>`);
        labelFields(child.querySelector('form'),{name:'Category name',parent:'Parent category',description:'Description'});
        child.querySelector('form').onsubmit=async event=>{event.preventDefault();const f=event.currentTarget;try{await change({action:'save',id:category?.id||'',name:f.elements.name.value,parent_id:f.elements.parent.value,description:f.elements.description.value});child.close();}catch(err){Notebook.error(child,err);}};
      }
      function erase(category){
        const excluded=descendants(category.id),child=Notebook.dialog('Delete template category',`<form class="nb-form"><p class="hint">Notes and templates in this category move to the one you pick; files stay put.</p><label>Migrate to<select class="control" name="destination">${categoryOptions(defaultCategory(),excluded)}</select></label><button type="submit" class="btn">Move and delete the category</button></form>`);
        labelFields(child.querySelector('form'),{destination:'Migrate to'});
        child.querySelector('form').onsubmit=async event=>{event.preventDefault();try{await change({action:'delete',id:category.id,destination_id:event.currentTarget.elements.destination.value});child.close();}catch(err){Notebook.error(child,err);}};
      }
      function paint(){box.querySelector('[data-pl-category-list]').innerHTML=state.data.catalog.categories.map(c=>`<div class="pl-category-row"><span>${h(categoryName(c.id))}</span><button type="button" class="btn ghost" data-pl-edit-category="${h(c.id)}">Edit</button><button type="button" class="btn ghost" data-pl-delete-category="${h(c.id)}" ${c.preset_key==='prompt_templates'?'disabled title="Keep the template root category"':''}>Delete</button></div>`).join('');
        box.querySelectorAll('[data-pl-edit-category]').forEach(button=>button.onclick=()=>edit(state.data.catalog.categories.find(c=>c.id===button.dataset.plEditCategory)));
        box.querySelectorAll('[data-pl-delete-category]').forEach(button=>button.onclick=()=>erase(state.data.catalog.categories.find(c=>c.id===button.dataset.plDeleteCategory)));
      }
      let refreshed=false;const refresh=()=>{if(!refreshed){refreshed=true;load();}};
      box.querySelector('[data-pl-add-category]').onclick=()=>edit();box.querySelector('[data-close]').onclick=()=>{refresh();box.close();};box.addEventListener('close',refresh);paint();
    }
    el('new').onclick=async()=>{if(await leave())newDraft();};
    el('categories').onclick=categories;el('bindings').onclick=()=>PromptUI.manageBindings(state.project);
    el('refresh').onclick=async()=>{if(await leave()){state.dirty=false;await load();}};
    el('project').onchange=async()=>{const next=el('project').value;if(!await leave()){el('project').value=state.project;return;}state.project=next;state.dirty=false;state.key='';state.data=null;headerState();el('list').innerHTML='';el('editor').innerHTML='';await load('');};
    el('search').oninput=paintList;el('source').onchange=paintList;
    headerState();el('list').innerHTML='<p class="pl-empty hint">Reading the template library...</p>';await load();return dialog;
  }
  return {open};
})();
