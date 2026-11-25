/* Shared commands keep keyboard, command search and visible controls in sync. */
const AppInteractions = (() => {
  const isMac = /mac/i.test(navigator.userAgentData?.platform || navigator.userAgent);
  const labelKey = key => key.replaceAll("Mod", isMac ? "⌘" : "Ctrl");
  const visible = el => !!el?.isConnected && !!el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
  const editable = el => !!el?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
  const usable = selector => [...document.querySelectorAll(selector)].find(el => visible(el) && !el.disabled);
  const enabled = () => localStorage.getItem("rw-shortcuts") !== "off";
  const singleKeys = () => localStorage.getItem("rw-single-key-shortcuts") !== "off";
  const searchField = () => usable('#main #mdDashSearch, #main #spSearchInput, #main #mailSearch, #main #itQ, #main #wsInputQuery, #main #kbSearchInput, #main input[type="search"]');
  const sendButton = () => {
    const field = document.activeElement;
    if(!editable(field)) return null;
    const button = field.id==='tcSay' ? document.getElementById('tcSend') : field.closest('.composer, .at-dock, .ol-grid, .wv-composer')?.querySelector('.send-btn, #send, #pwSend, [id$="-send"]');
    return visible(button) && !button.disabled && !button.classList.contains("stop") ? button : null;
  };
  const commands = [
    {id:"palette", text:"Search commands and pages", keys:["Mod+k"], scope:"Global", inInput:true, run:openCommandPalette},
    {id:"help", text:"Shortcuts and help", keys:["F1", "?"], scope:"Global", run:openHelp},
    {id:"quick-todo", text:"Jot down a to-do", keys:["Mod+Shift+Enter"], scope:"Global", inInput:true, run:()=>GlobalTodos.focus()},
    {id:"progress-new", text:"Create research plan", keys:["Alt+Shift+n"], scope:"Current project (outside the box)", available:()=>!!curTask, run:()=>TaskCenter.newPlan()},
    {id:"file-location", text:"Show file location", keys:["Alt+Shift+o"], scope:"Focused file or project", available:()=>!!fileReference(document.activeElement?.closest(rowSelector)), run:()=>locationAction(document.activeElement.closest(rowSelector),true)},
    {id:"file-handoff", text:"Hand the file to the current workflow...", keys:["Alt+Shift+h"], scope:"File list or editor", inInput:true, available:()=>!!FileHandoff.focused(), run:()=>FileHandoff.open(FileHandoff.focused())},
    {id:"search", text:"Search this page", keys:["/"], scope:"Pages with a search box", available:()=>!!searchField(), run:()=>{ searchField()?.focus(); searchField()?.select(); }},
    {id:"save-note", text:"Save current edit", keys:["Mod+s"], scope:"Editor", inInput:true, available:()=>!!usable('#mdDashSave, #flSaveBtn, [id$="-edit-save"]:not(.hidden)'), run:async()=>{
      const flSave = usable('#flSaveBtn');
      if(flSave){
        flSave.click();
        return;
      }
      const docSave = usable('[id$="-edit-save"]:not(.hidden)');
      if(docSave){
        docSave.click();
        return;
      }
      if(await pnSaveCurrent()) uiNotify("Note saved"); else uiNotify("Save failed; check the message above the note and retry.");
    }},
    {id:"new-note", text:"New note", keys:["Mod+Alt+n"], scope:"Project notes", available:()=>!!usable('#nbTreeNewFile, #pnBtnSideNewFile'), run:()=>pnNewNote()},
    {id:"bold", text:"Bold", keys:["Mod+b"], scope:"Markdown Editor", inInput:true, available:()=>document.activeElement?.id === "mdSource" && !document.activeElement.readOnly, run:()=>mdCmd("bold")},
    {id:"italic", text:"Italic", keys:["Mod+i"], scope:"Markdown Editor", inInput:true, available:()=>document.activeElement?.id === "mdSource" && !document.activeElement.readOnly, run:()=>mdCmd("italic")},
    {id:"send", text:"Send current message", keys:["Mod+Enter"], scope:"Chat input", inInput:true, available:()=>!!sendButton(), run:()=>sendButton()?.click()},
  ];
  function matches(event, key){
    if(key === "?" || key === "/") return event.key === key && !event.ctrlKey && !event.metaKey && !event.altKey;
    const parts=key.toLowerCase().split("+"), main=parts.pop();
    return event.key.toLowerCase()===main && event.ctrlKey===(!isMac && parts.includes("mod")) &&
      event.metaKey===(isMac && parts.includes("mod")) && event.altKey===parts.includes("alt") && event.shiftKey===parts.includes("shift");
  }
  function consume(event){ event.preventDefault(); event.stopImmediatePropagation(); }
  function run(command){
    if(!command || (command.available && !command.available())) return;
    Promise.resolve().then(command.run).catch(error=>uiNotify("Operation failed:"+error.message));
  }
  function commandItems(){
    return commands.filter(c=>c.id!=="palette" && (!c.available || c.available())).map(c=>({
      text:c.text, sub:c.scope, cat:"Common actions", ico:"⌨", shortcut:enabled()?labelKey(c.keys[0]):"", run:()=>run(c)
    }));
  }

  function openHelp(){
    let modal=$("shortcutHelp");
    if(!modal){
      modal=document.createElement("div"); modal.id="shortcutHelp"; modal.className="modal hidden";
      modal.setAttribute("aria-label","Shortcuts and help");
      document.body.appendChild(modal);
    }
    modal.innerHTML=`<div class="modal-mask"></div><section class="modal-dialog shortcut-dialog">
      <div class="modal-head"><h3>Shortcuts and help</h3><button type="button" class="modal-close" aria-label="Close the shortcuts help">✕</button></div>
      <div class="modal-body"><p class="hint">Find actions in button tips, the context menu, and command search. The context menu also works with "⋯” or Shift+F10 open.</p>
      <div class="shortcut-preferences"><label><input type="checkbox" data-shortcuts ${enabled()?"checked":""}>Enable app shortcuts</label>
      <label><input type="checkbox" data-single-keys ${singleKeys()?"checked":""}>Enable with one key / search,? Help (never fires while typing)</label></div>
      <table class="shortcut-table"><thead><tr><th>Actions</th><th>Shortcuts</th><th>Applies to</th></tr></thead><tbody>
      ${commands.map(c=>`<tr><td>${esc(c.text)}</td><td>${c.keys.map(k=>`<kbd>${esc(labelKey(k))}</kbd>`).join(" ")}</td><td>${esc(c.scope)}</td></tr>`).join("")}
      <tr><td>Switch research step ( 10 steps)</td><td><kbd>Alt+1 ... Alt+0</kbd></td><td>Research platform (outside text fields)</td></tr>
      <tr><td>Open the actions menu</td><td><kbd>Shift+F10</kbd></td><td>notes, projects, literature, tabs</td></tr>
      <tr><td>Menu navigation / Run / Close</td><td><kbd>↑ ↓</kbd> <kbd>Enter</kbd> <kbd>Esc</kbd></td><td>Current menu</td></tr>
      <tr><td>Switch / Close the tab</td><td><kbd>← →</kbd> <kbd>Enter</kbd> / <kbd>Delete</kbd></td><td>Focus is in a tab</td></tr>
      </tbody></table><p class="hint">Esc Closes the topmost dialog and returns to where you were. Choosing IME candidates never sends a message or fires a shortcut.</p></div></section>`;
    modal.querySelector(".modal-close").onclick=()=>uiCloseModal(modal);
    modal.querySelector(".modal-mask").onclick=()=>uiCloseModal(modal);
    modal.querySelector("[data-shortcuts]").onchange=e=>{ localStorage.setItem("rw-shortcuts",e.target.checked?"on":"off"); decorateCommands(); };
    modal.querySelector("[data-single-keys]").onchange=e=>localStorage.setItem("rw-single-key-shortcuts",e.target.checked?"on":"off");
    uiOpenModal(modal);
  }

  let contextMenu=null, menuOwner=null, menuOrigin=null, menuAnchor=null;
  const rowSelector='[data-schedule-id], [data-ec-task], [data-history-id], [data-plan-id], [data-ec-column], [data-tree-path], [data-pn-file]:not(button), .nb-note-row, [data-card-folder], .proj-row, .zot-row-card, [data-tab-id], .fl-tree-row[data-rel], .cv-f[data-p], [data-global-todo-id]';
  function fileReference(row){
    if(!row) return null;
    if(row.matches('.proj-row')) return {project_id:row.querySelector('[data-go]')?.dataset.go,relative:''};
    if(row.matches('.zot-row-card')) return {zotero_key:row.dataset.zotKey};
    if(row.matches('.fl-tree-row')) return {project_id:row.dataset.projectId || curTask,relative:row.dataset.rel};
    if(row.matches('.cv-f')) return {path:row.dataset.p};
    const relative=row.dataset.treePath || row.dataset.pnFile || row.dataset.cardFolder || row.querySelector('[data-pn-file]')?.dataset.pnFile;
    return relative ? {project_id:mdDashProject,relative} : null;
  }
  async function copyText(value){
    try { await navigator.clipboard.writeText(value); }
    catch {
      const origin=document.activeElement, field=document.createElement('textarea');
      field.value=value; field.style.position='fixed'; field.style.opacity='0'; document.body.appendChild(field); field.select();
      const ok=document.execCommand('copy'); field.remove(); origin?.focus();
      if(!ok) throw new Error('Cannot write to clipboard');
    }
    uiNotify('Path copied');
  }
  async function locationAction(row,open){
    const reference=fileReference(row); if(!reference) return;
    const result=await api('/api/file/location',{...reference,open});
    if(open) uiNotify('Containing folder opened'); else await copyText(result.path);
  }
  function fileActions(row){
    return [
      {text:'Show file location',run:()=>locationAction(row,true)},
      {text:'Copy full path',run:()=>locationAction(row,false)}
    ];
  }
  const ownTrigger=row=>[...row.querySelectorAll('[data-context-trigger]')].find(button=>button.closest(rowSelector)===row);
  function buttonAction(button, text){
    return {text:text || button.title || button.textContent.trim(), disabled:button.disabled,
      danger:button.matches('.del, [data-del]') || /Delete/.test(button.title || button.textContent),
      run:()=>{ if(button.isConnected && !button.disabled) button.click(); }};
  }
  function contextActions(row){
    if(row.matches('[data-schedule-id]'))return [...row.querySelectorAll('[data-sch-run],[data-sch-toggle],[data-sch-edit],[data-sch-del]')].map(button=>({...buttonAction(button),danger:button.hasAttribute('data-sch-del')}));
    if(row.matches('[data-history-id]'))return ConversationHistory.actions(row);
    if(row.matches('[data-global-todo-id]')) return GlobalTodos.contextActions(row);
    if(row.matches('[data-ec-task], [data-plan-id], [data-ec-column]')) return TaskCenter.contextActions(row);
    if(row.matches('.cv-f')) return [
      {text:'Preview file',run:()=>row.click()},
      ...fileActions(row),
      {text:'Record related to-dos',run:()=>GlobalTodos.focus({projectId:curTask,title:'Handle: '+(row.querySelector('.fl-name')?.textContent || row.dataset.p?.split(/[\\/]/).pop() || row.dataset.rel)})}
    ];
    if(row.matches('[data-tab-id]')){
      const id=row.dataset.tabId, index=tabs.findIndex(t=>t.id===id);
      const closeSet=ids=>uiNavigate(()=>{
        tabs=tabs.filter(t=>!ids.includes(t.id));
        if(!tabs.some(t=>t.id===activeTab)) activeTab=id;
        render(); document.querySelector(`[data-t="${activeTab}"]`)?.focus();
      });
      return [
      {text:"Close tab", disabled:tabs.length<2, run:()=>uiNavigate(()=>{ closeTab(id); document.querySelector('#tabsbar [aria-selected="true"]')?.focus(); })},
        {text:"Close other tabs", disabled:tabs.length<2, run:()=>closeSet(tabs.filter(t=>t.id!==id).map(t=>t.id))},
        {text:"Close tabs to the right", disabled:index===tabs.length-1, run:()=>closeSet(tabs.slice(index+1).map(t=>t.id))}
      ];
    }
    if(row.matches('.proj-row')) return [
      {text:"Set as current project", run:()=>uiNavigate(()=>row.click())},
      ...fileActions(row),
      {text:'Add project to-do',run:()=>GlobalTodos.focus({projectId:row.querySelector('[data-go]').dataset.go})},
      ...[...row.querySelectorAll('[data-go], [data-del]')].map(b=>buttonAction(b,b.hasAttribute('data-go')?"Open research platform":"Delete project..."))
    ];
    if(row.matches('.zot-row-card')) return [
      ...[...row.querySelectorAll('.zot-open-pdf, .zot-single-note')].map(b=>buttonAction(b)),
      ...fileActions(row)
    ];

    if(row.matches('[data-tree-path], .fl-tree-row, .nb-note-row')){
      const isFileTree=row.matches('.fl-tree-row')&&!!row.closest('#flList');
      const isDir = row.dataset.treeType === "dir" || row.dataset.dir === "1" || row.hasAttribute('data-card-folder');
      const treePath = row.dataset.treePath || row.dataset.rel || row.dataset.pnFile || row.dataset.p || "";
      const parentDir = isDir ? treePath : (treePath.split('/').slice(0, -1).join('/') || 'Notes');
      const targetName = (treePath.split('/').pop() || treePath).split(/[\\/]/).pop() || "";
      const isProjectNote = row.matches('[data-tree-path], .nb-note-row') || treePath.startsWith("Notes");
      const projectId = isFileTree ? row.dataset.projectId || curTask : mdDashProject || curTask;
      const readOnly = isFileTree ? false : mdDashReadOnly;

      return [
        ...(isDir && isFileTree ? [{text:'Open folder',run:()=>row.click()},{separator:true}] : []),
        ...(!isDir ? [{text:"Open file",run:()=>row.click()}, {text:"Hand off to current workflow...",shortcut:"Alt+Shift+H",run:()=>FileHandoff.open(fileReference(row))},
          {text:"Handoff log and receipts",run:()=>FileHandoff.history(fileReference(row))}, {separator:true}] : []),
        {
          icon: "📄",
          text: "New file",
          disabled: readOnly,
          run: () => {
            if(isFileTree)return ProjectWorkspace.createEntry(projectId,isDir?treePath:treePath.split('/').slice(0,-1).join('/'),'file');
            if(window.pnNewNote) window.pnNewNote(parentDir);
          }
        },
        {
          icon: "📁",
          text: "New folder",
          disabled: readOnly,
          run: () => {
            if(isFileTree)return ProjectWorkspace.createEntry(projectId,isDir?treePath:treePath.split('/').slice(0,-1).join('/'),'folder');
            if(window.promptNewFolder) window.promptNewFolder(parentDir);
            else if(window.Notebook?.promptNewFolder) window.Notebook.promptNewFolder(parentDir);
          }
        },
        { separator: true },
        {
          icon: "📋",
          text: "Copy",
          run: async () => {
            if(isDir){
              await copyText(treePath);
              uiNotify("Folder path copied");
            } else {
              try {
                const loc = await api('/api/file/location', { ...fileReference(row), open: false });
                const readRes = await api(`/api/conv/read?path=${encodeURIComponent(loc?.path || treePath)}`);
                if(readRes && readRes.text){
                  await copyText(readRes.text);
                  uiNotify("File contents copied to clipboard");
                } else {
                  await copyText(treePath);
                  uiNotify("Copied");
                }
              } catch {
                await copyText(treePath);
                uiNotify("Copied");
              }
            }
          }
        },
        {
          icon: "📋",
          text: "Copy path",
          shortcut: "Alt+Shift+C",
          run: async () => {
            const loc = await api('/api/file/location', { ...fileReference(row), open: false });
            if(loc?.path){
              await copyText(loc.path);
              uiNotify("Full path copied");
            } else {
              await copyText(treePath);
              uiNotify("Path copied");
            }
          }
        },
        {
          icon: "📋",
          text: "Copy relative path",
          shortcut: "Ctrl+Alt+Shift+C",
          run: async () => {
            await copyText(treePath);
            uiNotify("Relative path copied");
          }
        },
        {
          icon: "💻",
          text: "Copy cd command",
          run: async () => {
            const loc = await api('/api/file/location', { ...fileReference(row), open: false });
            const absPath = loc?.path || treePath;
            const dir = isDir ? absPath : absPath.replace(/[\\/][^\\/]+$/, '');
            await copyText(`cd "${dir}"`);
            uiNotify(`Terminal command copied: cd "${dir}"`);
          }
        },
        {
          icon: "🔍",
          text: isFileTree ? "Search project materials with the same name" : "Show in folder",
          shortcut: "Ctrl+Shift+F",
          run: () => {
            const s = document.getElementById('nbTreeSearch') || searchField();
            if(s){
              s.value = targetName;
              s.focus();
              s.dispatchEvent(new Event('input', { bubbles: true }));
              if(isFileTree)s.closest('form')?.requestSubmit();
            }
          }
        },
        {
          icon: "↗",
          text: "Show in File Explorer",
          run: () => locationAction(row, true)
        },
        { separator: true },
        {
          icon: "✏",
          text: "Rename",
          shortcut: "Enter",
          disabled: readOnly,
          run: async () => {
            if(isFileTree&&!await ProjectWorkspace.flush())return;
            const curName = isDir || isFileTree&&!isProjectNote ? targetName : (row.dataset.title || targetName.replace(/\.md$/i, ''));
            const newName = window.prompt("New name:", curName);
            if(!newName || newName.trim() === curName) return;
            const cleanNewName = newName.trim();
            if(isProjectNote){
              try {
                const renamed=await api('/api/project/note/rename', {
                  project_id: projectId,
                  path: treePath,
                  new_name: cleanNewName
                });
                uiNotify("Renamed");
                if(isFileTree)await ProjectWorkspace.refreshFiles(projectId,treePath,renamed.new_path);else await mdDashLoad();
              } catch(e) {
                uiNotify("Rename failed:" + e.message);
              }
            } else {
              try {
                const loc = await api('/api/file/location', { ...fileReference(row), open: false });
                await api('/api/conv/rename', {
                  path: loc?.path || treePath,
                  new_name: cleanNewName
                });
                uiNotify("Renamed");
                if(isFileTree)await ProjectWorkspace.refreshFiles(projectId,treePath,treePath.split('/').slice(0,-1).concat(cleanNewName).join('/'));else if(window.flInitTree) window.flInitTree();
              } catch(e) {
                uiNotify("Rename failed:" + e.message);
              }
            }
          }
        },
        {
          icon: "🗑",
          text: "Delete",
          shortcut: "Delete",
          danger: true,
          disabled: readOnly,
          run: async () => {
            if(isFileTree&&!await ProjectWorkspace.flush())return;
            const label = isDir ? `Folder "${targetName}" and everything in it` : `file ”${targetName}"`;
            if(!await uiConfirm(`Permanently delete ${label}?`, { okText: "Delete", danger: true })) return;
            if(isProjectNote){
              try {
                await api('/api/project/note/delete', {
                  project_id: projectId,
                  path: treePath
                });
                uiNotify("Deleted");
                if(isFileTree)await ProjectWorkspace.refreshFiles(projectId,treePath);else await mdDashLoad();
              } catch(e) {
                uiNotify("Delete failed:" + e.message);
              }
            } else {
              try {
                const loc = await api('/api/file/location', { ...fileReference(row), open: false });
                await api('/api/conv/delete', {
                  path: loc?.path || treePath
                });
                uiNotify("Deleted");
                if(isFileTree)await ProjectWorkspace.refreshFiles(projectId,treePath);else if(window.flInitTree) window.flInitTree();
              } catch(e) {
                uiNotify("Delete failed:" + e.message);
              }
            }
          }
        }
      ];
    }

    const path=row.dataset.treePath || row.dataset.pnFile || row.dataset.cardFolder || row.querySelector('[data-pn-file]')?.dataset.pnFile;
    const actionRow=path ? [...document.querySelectorAll('[data-tree-path]')].find(item=>item.dataset.treePath===path) || row : row;
    const existing=[...actionRow.querySelectorAll('.pn-tree-act')].map(b=>buttonAction(b));
    const projectId=mdDashProject;
    return [
      {text:row.dataset.treeType==="dir" || row.hasAttribute('data-card-folder')?"Open folder":"Open note", run:()=>(row.querySelector('button[data-pn-file]') || row).click()},
      ...fileActions(row),
      {text:'Record related to-dos',run:()=>GlobalTodos.focus({projectId,title:'Handle: '+(path || row.dataset.treePath).split('/').pop()})},
      ...existing
    ];
  }
  function closeMenu(restore=true){
    if(!contextMenu) return;
    contextMenu.remove(); contextMenu=null;
    menuOwner?.classList.remove("context-active");
    if(menuOwner) ownTrigger(menuOwner)?.setAttribute('aria-expanded','false');
    if(restore){
      if(menuOrigin?.isConnected) menuOrigin.focus({preventScroll:true});
      else document.querySelector('#tabsbar [aria-selected="true"]')?.focus();
    }
    menuOwner=null; menuOrigin=null; menuAnchor=null;
    window.dispatchEvent(new Event('rw:context-menu-closed'));
  }
  function openPopupItems(items, x, y, origin, owner){
    closeMenu(false);
    if(!items || !items.length) return;
    menuOwner = owner || null;
    menuOrigin = origin || null;
    menuAnchor = owner ? owner.getBoundingClientRect() : { top: y, left: x, width: 0, height: 0 };
    if(owner){
      owner.classList.add("context-active");
      ownTrigger(owner)?.setAttribute('aria-expanded','true');
    }
    contextMenu=document.createElement("div"); contextMenu.className="context-menu";
    contextMenu.setAttribute("role","menu"); contextMenu.setAttribute("aria-label","Actions menu");

    const actions = [];
    contextMenu.innerHTML = items.map(item => {
      if(item.separator) return '<div role="separator" class="context-separator"></div>';
      const idx = actions.length;
      actions.push(item);
      return `<button type="button" role="menuitem" tabindex="-1" data-menu-index="${idx}" ${item.disabled ? 'disabled aria-disabled="true"' : ''} class="${item.danger ? 'danger' : ''}">
        <span class="context-item-left">
          ${item.icon ? `<span class="context-item-ico" aria-hidden="true">${item.icon}</span>` : ''}
          <span class="context-item-text">${esc(item.text)}</span>
        </span>
        ${item.shortcut ? `<kbd class="context-shortcut" aria-hidden="true">${esc(item.shortcut)}</kbd>` : ''}
      </button>`;
    }).join("");

    document.body.appendChild(contextMenu);
    contextMenu.style.left=Math.max(8,Math.min(x,innerWidth-contextMenu.offsetWidth-8))+"px";
    contextMenu.style.top=Math.max(8,Math.min(y,innerHeight-contextMenu.offsetHeight-8))+"px";
    contextMenu.querySelectorAll('button').forEach(button=>{
      button.onclick=()=>{
        const act=actions[Number(button.dataset.menuIndex)];
        closeMenu();
        if(act) run({run:act.run, available:()=>(!owner || owner.isConnected) && !act.disabled});
      };
    });
    contextMenu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }

  function openMenu(row, x, y, origin){
    const items=contextActions(row);
    if(!items.length) return;
    openPopupItems(items, x, y, origin, row);
  }

  function openBlankTreeMenu(x, y, folder){
    const items = [
      {
        icon: "📄",
        text: "New file",
        run: () => { if(window.pnNewNote) window.pnNewNote(folder || "Notes"); }
      },
      {
        icon: "📁",
        text: "New folder",
        run: () => { if(window.promptNewFolder) window.promptNewFolder(folder || "Notes"); }
      },
      { separator: true },
      {
        icon: "↗",
        text: "Show in File Explorer",
        run: async () => {
          await api('/api/file/location', { project_id: mdDashProject, relative: folder || "Notes", open: true });
        }
      },
      {
        icon: "↻",
        text: "Refresh note list",
        run: () => mdDashLoad()
      }
    ];
    openPopupItems(items, x, y, null, null);
  }
  function menuKey(event){
    const buttons=[...contextMenu.querySelectorAll('button:not(:disabled)')];
    const i=buttons.indexOf(document.activeElement);
    if(event.key==='Escape'){ consume(event); closeMenu(); }
    else if(event.key==='Tab'){ closeMenu(); event.stopImmediatePropagation(); }
    else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      consume(event);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
      buttons[next]?.focus();
    } else if(event.key==='Enter' || event.key===' '){ consume(event); buttons[i]?.click(); }
  }
  function topModal(){
    const native=[...document.querySelectorAll('dialog[open]')].filter(visible);
    if(native.length) return native.at(-1);
    return [...document.querySelectorAll('.modal:not(.hidden), .cap-overlay')].filter(visible)
      .sort((a,b)=>Number(getComputedStyle(a).zIndex || 0)-Number(getComputedStyle(b).zIndex || 0)).at(-1);
  }
  function trapTab(event, modal){
    const fields=[...modal.querySelectorAll('button, input, textarea, select, a[href], [tabindex]')].filter(el=>visible(el) && !el.disabled && el.tabIndex>=0);
    const first=fields[0], last=fields.at(-1), current=document.activeElement;
    if(!first){ consume(event); modal.tabIndex=-1; modal.focus(); }
    else if(!modal.contains(current) || (!event.shiftKey && current===last) || (event.shiftKey && current===first)){
      consume(event); (event.shiftKey?last:first).focus();
    }
  }
  window.addEventListener('keydown', event=>{
    // Preserve the IME's native editing while keeping application handlers idle.
    if(event.isComposing || event.keyCode===229){ event.stopImmediatePropagation(); return; }
    if(event.defaultPrevented) return;
    if(contextMenu){ menuKey(event); return; }
    const modal=topModal();
    if(modal){
      if(modal.id==='cmdPaletteModal' && handleCommandPaletteKey(event)){ consume(event); return; }
      if(event.key==='Tab'){ trapTab(event,modal); return; }
      if(event.key==='Escape'){
        const close=modal.querySelector('[data-no], .modal-close, [data-close]');
        if(close){ consume(event); close.click(); }
        else if(modal.id==='cmdPaletteModal'){ consume(event); closeCommandPalette(); }
      }
      return;
    }
    if(event.key==='Escape' && GlobalTodos.isOpen()){ consume(event); GlobalTodos.close(); return; }
    const attachment=usable('#attmenu');
    if(event.key==='Escape' && attachment){ consume(event); attachment.style.display='none'; document.getElementById('plus')?.focus(); return; }
    const target=event.target, row=target.closest?.(rowSelector);
    if((event.key==='ContextMenu' || (event.shiftKey && event.key==='F10')) && row && !editable(target)){
      consume(event); const r=row.getBoundingClientRect(); openMenu(row,r.left+24,r.top+24,target); return;
    }
    if(target.matches?.('[role="tab"][data-t]')){
      const tabButtons=[...document.querySelectorAll('#tabsbar [data-t]')], index=tabButtons.indexOf(target);
      if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
        consume(event);
        const next=event.key==='Home'?0:event.key==='End'?tabButtons.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabButtons.length)%tabButtons.length;
        tabButtons.forEach((button,i)=>button.tabIndex=i===next?0:-1); tabButtons[next]?.focus(); return;
      }
      if(event.key==='Delete' && tabs.length>1){ consume(event); uiNavigate(()=>{ closeTab(target.dataset.t); document.querySelector('#tabsbar [aria-selected="true"]')?.focus(); }); return; }
    }
    if(row===target && !row.matches('[data-tab-id]') && ['Enter',' '].includes(event.key)){
      consume(event); const action=contextActions(row).find(a=>!a.separator && !a.disabled); if(action) run(action); return;
    }
    if(row && (row===target || row.contains(target)) && !editable(target)){
      if(event.key==='F2'){
        consume(event); const renameAct=contextActions(row).find(a=>a.text==='Rename' && !a.disabled); if(renameAct) run(renameAct); return;
      }
      if(event.key==='Delete'){
        consume(event); const delAct=contextActions(row).find(a=>a.danger && !a.disabled); if(delAct) run(delAct); return;
      }
      if(event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && (event.key==='C' || event.key==='c')){
        consume(event); const cPathAct=contextActions(row).find(a=>a.text==='Copy path'); if(cPathAct) run(cPathAct); return;
      }
      if((event.ctrlKey || event.metaKey) && event.altKey && event.shiftKey && (event.key==='C' || event.key==='c')){
        consume(event); const cRelAct=contextActions(row).find(a=>a.text==='Copy relative path'); if(cRelAct) run(cRelAct); return;
      }
    }
    if(!enabled() || event.repeat) return;
    for(const command of commands){
      if(editable(target) && !command.inInput) continue;
      if(command.available && !command.available()) continue;
      if(command.keys.some(key=>(key.length!==1 || singleKeys()) && matches(event,key))){ consume(event); run(command); return; }
    }
  },true);
  document.addEventListener('contextmenu', event=>{
    if(editable(event.target)) return;
    const row=event.target.closest(rowSelector); if(!row) return;
    event.preventDefault(); openMenu(row,event.clientX,event.clientY,row.querySelector('[data-t]') || row);
  });
  document.addEventListener('pointerdown',event=>{ if(contextMenu && !contextMenu.contains(event.target)) closeMenu(false); },true);
  document.addEventListener('scroll',event=>{
    if(!contextMenu || contextMenu.contains(event.target)) return;
    const current=menuOwner?.getBoundingClientRect();
    // A pointer click may queue a focus scroll before the menu opens. Only
    // dismiss when the anchor actually moves after the menu was positioned.
    if(!current || Math.abs(current.top-menuAnchor.top)>1 || Math.abs(current.left-menuAnchor.left)>1) closeMenu(false);
  },true);
  window.addEventListener('resize',()=>closeMenu(false));
  window.addEventListener('blur',()=>closeMenu(false));
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-command], [data-context-trigger], #tabActions');
    if(!trigger) return;
    if(trigger.dataset.command){ run(commands.find(c=>c.id===trigger.dataset.command)); return; }
    const row=trigger.id==='tabActions'?document.querySelector(`[data-tab-id="${activeTab}"]`):trigger.closest(rowSelector);
    if(row){ event.stopPropagation(); const r=trigger.getBoundingClientRect(); openMenu(row,r.left,r.bottom+4,trigger); }
  });
  function decorateCommands(){
    document.querySelectorAll('[data-command]').forEach(button=>{
      const command=commands.find(c=>c.id===button.dataset.command); if(!command) return;
      button.title=command.text+(enabled()?` (${labelKey(command.keys[0])})`:"");
      const badge=button.querySelector('kbd'); if(badge) badge.textContent=enabled()?labelKey(command.keys[0]):"";
    });
    const save=document.getElementById('mdDashSave');
    if(save){ save.title=enabled()?`Save note (${labelKey('Mod+S')})`:"Save note"; save.setAttribute('aria-keyshortcuts',isMac?'Meta+s':'Control+s'); }
    const capture=document.getElementById('todoCaptureInput');
    if(capture) capture.title=enabled()?`Quick note To do (${labelKey('Mod+Shift+Enter')})`:'Jot down a to-do';
    const progress=document.querySelector('[data-ec-new]');
    if(progress) progress.title=enabled()?'Create a research plan (Alt+Shift+N)':'Create research plan';
  }
  function enhance(){
    if(contextMenu && !menuOwner?.isConnected) closeMenu();
    document.querySelectorAll(rowSelector).forEach(row=>{
      if(row.dataset.contextReady || row.matches('[data-tab-id]')) return;
      row.dataset.contextReady='true';
      row.tabIndex=0;
      row.setAttribute('role','group');
      row.setAttribute('aria-label',row.dataset.treePath || row.dataset.pnFile || row.dataset.cardFolder || row.dataset.rel || row.querySelector('.nm, strong, b, h3')?.textContent || 'Actions item');
      row.setAttribute('aria-description','Press Enter for the default action, Shift+F10 for more.');
      const more=document.createElement('button'); more.type='button'; more.className='context-trigger'; more.dataset.contextTrigger='true';
      more.setAttribute('aria-label','More actions'); more.setAttribute('aria-haspopup','menu'); more.setAttribute('aria-expanded','false'); more.title='More actions (Shift+F10)'; more.textContent='⋯';
      more.onclick=event=>{ event.stopPropagation(); const r=more.getBoundingClientRect(); openMenu(row,r.left,r.bottom+4,more); };
      row.appendChild(more);
    });
    decorateCommands();
  }
  let pending=false;
  new MutationObserver(records=>{
    if(pending || !records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1))) return;
    pending=true; queueMicrotask(()=>{pending=false; enhance();});
  }).observe(document.body,{childList:true,subtree:true});
  enhance();
  return {commandItems, openHelp, labelKey, openBlankTreeMenu};
})();
