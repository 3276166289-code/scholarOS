/* A single import preview for intelligence and manually entered references. */
const LiteratureImport = (() => {
  const h = value => esc(String(value ?? ''));
  const safeLink = value => {try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  function open({projectId=curTask,items=null,onImported=()=>{}}={}) {
    const origin=document.activeElement,dialog=document.createElement('dialog');
    dialog.className='pt-dialog li-dialog';dialog.setAttribute('aria-label',items?'Import digest into project':'Import literature by link or DOI');
    dialog.innerHTML=`<form class="li-form"><header><h3>${items?'Import digest items into a project':'by link or DOI Import papers'}</h3><button type="button" class="pw-text-button" data-li-close aria-label="Close">×</button></header><label>Target project<select class="control" name="project_id" required><option value="">Choose the target project</option>${(S.tasks||[]).map(p=>`<option value="${h(p.id)}" ${p.id===projectId?'selected':''}>${h(p.title)}</option>`).join('')}</select></label>${items?`<p class="hint">Confirm ${items.length} digest entries. Title, authors, date, abstract, and original link are saved; identical DOI or linked papers are skipped.</p><div class="li-preview">${items.map(item=>`<article><strong>${h(item.title)}</strong><p class="hint">${h(item.authors||'Authors unknown')} · ${h(item.source_title||'Daily digest')}</p><details><summary>Preview abstracts and links</summary><p>${h(item.summary||'The feed gave no abstract')}</p>${safeLink(item.link)?`<a href="${h(safeLink(item.link))}" target="_blank" rel="noopener noreferrer">${h(item.link)}</a>`:'<p class="pw-error">This entry has no openable web link; the import will explain why.</p>'}</details></article>`).join('')}</div>`:`<label>Paper title<input class="control" name="title" required maxlength="2000" placeholder="Use the exact title for search and citation"></label><label>Original link<input class="control" name="url" type="url" placeholder="https://..."></label><label>DOI<input class="control" name="doi" placeholder="10.xxxx/xxxxx or https://doi.org/..."></label><div class="li-fields"><label>Author<input class="control" name="authors" placeholder="Separate with semicolons"></label><label>Year<input class="control" name="year" maxlength="4" inputmode="numeric"></label></div><label>Abstract<textarea class="control" name="abstract" rows="3"></textarea></label><p class="hint">Original link and DOI Fill in at least one field. After it enters the library you can add or edit it under project literature.</p>`}<p class="hint">This import saves references only; nothing is downloaded PDF full text.</p><p data-li-status role="status" aria-live="polite"></p><p class="pw-error" data-li-error role="alert"></p><footer><button type="button" class="btn ghost" data-li-library hidden>OpenProject literature</button><span class="pw-spacer"></span><button type="button" class="btn ghost" data-li-cancel>Close</button><button type="submit" class="btn" ${S.tasks?.length?'':'disabled'}>Confirm importing references</button></footer></form>`;
    let saving=false,importedProject='';
    dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
    dialog.addEventListener('close',()=>{dialog.remove();if(origin?.isConnected)origin.focus();},{once:true});
    dialog.querySelectorAll('[data-li-close],[data-li-cancel]').forEach(button=>button.onclick=()=>{if(!saving)dialog.close();});
    dialog.querySelector('[data-li-library]').onclick=async()=>{dialog.close();await ProjectLiterature.open(importedProject);};
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();if(saving)return;
      const form=event.currentTarget,button=form.querySelector('[type=submit]'),values=Object.fromEntries(new FormData(form));
      saving=true;button.disabled=true;form.querySelector('[data-li-error]').textContent='';
      try {
        const result=await api(items?'/api/rss/import':'/api/library/import',items?{project_id:values.project_id,ids:items.map(item=>item.id)}:values);
        importedProject=result.project_id;
        form.querySelector('[data-li-status]').textContent=items?`Imported ${result.imported} records; ${result.existing} already existed.`:(result.existing?'This paper is already in the project library.':'References imported into the project.');
        form.querySelector('[data-li-error]').textContent=(result.failures||[]).map(row=>row.title+': '+row.error).join('\n');
        form.querySelector('[data-li-library]').hidden=!(result.result_id||result.items?.length);
        await onImported(result);button.textContent='Check import again';
      } catch(error) {form.querySelector('[data-li-error]').textContent=error.message;}
      finally {saving=false;if(dialog.isConnected)button.disabled=false;}
    };
    document.body.append(dialog);dialog.showModal();dialog.querySelector('[name=project_id]').focus();
  }
  return {open,safeLink};
})();
