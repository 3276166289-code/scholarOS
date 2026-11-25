/* Shared filtering for local catalogs. Existing server-backed searches keep their own scope. */
const ListSearch=(()=>{
  const queries=new Map();
  function mount(list,{key,label,selector,place=list,inside=false,text=row=>row.textContent}={}){
    if(!list||!place)return;
    let bar=inside?place.firstElementChild:place.previousElementSibling;
    if(bar?.dataset.listSearch!==key){
      bar=document.createElement('div');bar.className='list-search';bar.dataset.listSearch=key;
      bar.innerHTML='<input type="search" class="control" autocomplete="off"><button type="button" class="pw-text-button">Clear</button><span role="status" aria-live="polite"></span>';
      bar.querySelector('input').setAttribute('aria-label',label);bar.querySelector('input').placeholder=label+'...';
      bar.querySelector('input').value=queries.get(key)||'';
      if(inside)place.prepend(bar);else place.before(bar);
    }
    const field=bar.querySelector('input'),counter=bar.querySelector('[role=status]'),clear=bar.querySelector('button');
    const apply=()=>{
      const query=field.value.trim().toLocaleLowerCase(),tokens=query.split(/\s+/).filter(Boolean),rows=[...list.querySelectorAll(selector)];
      let count=0;for(const row of rows){const match=tokens.every(word=>String(text(row)).toLocaleLowerCase().includes(word));row.hidden=!match;row.toggleAttribute('data-list-search-hidden',!match);if(match)count++;}
      queries.set(key,field.value);clear.hidden=!field.value;
      const message=query?(count?`${count} / ${rows.length} items`:'No matches, try different keywords'):`${rows.length} items`;
      if(counter.textContent!==message)counter.textContent=message;
    };
    field.oninput=apply;field.onkeydown=event=>{if(event.key==='Escape'&&field.value){event.preventDefault();event.stopPropagation();field.value='';apply();}};
    clear.onclick=()=>{field.value='';apply();field.focus();};apply();
  }
  function enhance(){
    const main=document.getElementById('main');if(!main)return;
    const view=route();
    if(view==='assistants')mount(main.querySelector('.ag-grid'),{key:'experts',label:'Search experts by name, skill, or model',selector:':scope > .card'});
    if(main.querySelector('#ag-provider-select')){
      mount(main.querySelector('.ag-grid'),{key:'providers',label:'Search configured providers',selector:':scope > .card'});
      mount(main.querySelector('.ag-model-grid'),{key:'models',label:'Search adopted models',selector:':scope > *'});
    }
    if(view==='team')mount(main.querySelector('#tofSheet'),{key:'teams:'+curTask,label:'Search teams or members',selector:'.tof-room[data-office]',place:main.querySelector('.tof-body')});
    mount(main.querySelector('.ag-team-nav'),{key:'team-settings',label:'Search teams',selector:'[data-ag-team]',inside:true});
    mount(main.querySelector('.set-nav'),{key:'settings',label:'Search settings',selector:'[data-set]',inside:true});
    mount(main.querySelector('.channel-list'),{key:'channels',label:'Search channels',selector:'[data-channel]'});
    mount(main.querySelector('.ptb-tools'),{key:'toolbox',label:'Search paper tools',selector:'[data-tb-tool]'});
    mount(main.querySelector('[data-rss-list]'),{key:'rss-sources',label:'Search feeds by name, category, or URL',selector:'[data-rss-source]'});
    mount(main.querySelector('.wfl-editor-list'),{key:'workflow-templates',label:'Search workflow templates',selector:'[data-wfl-edit]',inside:true});
    const schedules=main.querySelector('[data-schedule-list]');
    mount(schedules,{key:'schedules:'+curTask,label:'Search automation rules and run logs',selector:'.sch-card,.sch-run',place:main.querySelector('[data-schedule-search-anchor]')});
  }
  let pending=false;
  const observer=new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;enhance();});});
  observer.observe(document.getElementById('main'),{childList:true,subtree:true});
  return {mount};
})();
