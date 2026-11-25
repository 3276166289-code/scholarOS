WorkflowNodeRenderers.register('notes', {
  accepts({artifact, data}) {
    return artifact.id === 'structured' && artifact.kind === 'bilingual' && Array.isArray(data) && data.length > 0;
  },

  render(target, {data, editable, files, openArtifact, loadPdf, onChange}) {
    const escape = value => esc(String(value ?? ''));
    const pdfs = new Map(files.filter(file => file.kind === 'pdf' && file.source_path).map(file => [file.source_path, file]));
    const openButton = (file, label) => file ? `<button class="btn" type="button" data-wnw-notes-pdf="${escape(file.id)}">${label}</button>` : '';

    target.innerHTML = data.map((paper, index) => {
      const source = pdfs.get(paper.source_path);
      const translation = pdfs.get(paper.translation_path || paper.files?.[0]);
      const dual = pdfs.get(paper.dual_path || paper.files?.[1]);
      const notes = paper.reading_notes || [];
      return `<article class="wnw-reading-paper" data-wnw-reading-paper="${index}">
        <h4>${escape(paper.title || translation?.name || 'Literature ' + (index + 1))}</h4>
        <div class="wnw-reading-actions">
          ${openButton(source, 'Source PDF')}${openButton(translation, 'Translation PDF')}${openButton(dual, 'Bilingual PDF')}
          ${source && translation ? '<button class="btn" type="button" data-wnw-compare aria-expanded="false">Original and translation side by side</button>' : ''}
        </div>
        ${source && translation ? '<div data-wnw-comparison hidden></div>' : '<p class="hint">This version has no matching PDF. </p>'}
        ${notes.map((note, noteIndex) => editable ? `
          <label>${escape(note.title || 'Close-reading notes')}<textarea class="control" rows="6" data-wnw-reading-note="${noteIndex}">${escape(note.markdown)}</textarea></label>` : `
          <section><h5>${escape(note.title || 'Close-reading notes')}</h5><div class="md-render wnw-prose">${note.markdown ? renderMarkdown(note.markdown) : '<p class="hint">No notes yet</p>'}</div></section>`).join('')}
        ${!notes.length && typeof paper.translation === 'string' ? (editable ? `
          <label>Close-reading notes<textarea class="control" rows="6" data-wnw-reading-legacy>${escape(paper.translation)}</textarea></label>` :
          `<div class="md-render wnw-prose">${renderMarkdown(paper.translation)}</div>`) : ''}
      </article>`;
    }).join('');

    for (const article of target.querySelectorAll('[data-wnw-reading-paper]')) {
      const paper = data[Number(article.dataset.wnwReadingPaper)];
      for (const button of article.querySelectorAll('[data-wnw-notes-pdf]')) {
        button.onclick = () => openArtifact(files.find(file => file.id === button.dataset.wnwNotesPdf));
      }
      for (const input of article.querySelectorAll('[data-wnw-reading-note]')) {
        input.oninput = () => {
          paper.reading_notes[Number(input.dataset.wnwReadingNote)].markdown = input.value;
          onChange(data);
        };
      }
      const legacy = article.querySelector('[data-wnw-reading-legacy]');
      if (legacy) legacy.oninput = () => {
        paper.translation = legacy.value;
        onChange(data);
      };
      const compare = article.querySelector('[data-wnw-compare]');
      const panel = article.querySelector('[data-wnw-comparison]');
      if (compare) compare.onclick = async () => {
        panel.hidden = !panel.hidden;
        compare.setAttribute('aria-expanded', String(!panel.hidden));
        if (panel.hidden) {
          panel.replaceChildren();
          return;
        }
        const loading = document.createElement('p');
        loading.setAttribute('role', 'status');
        loading.textContent = 'Reading PDF...';
        panel.replaceChildren(loading);
        try {
          const urls = await Promise.all([loadPdf(pdfs.get(paper.source_path)), loadPdf(pdfs.get(paper.translation_path))]);
          if (!loading.isConnected) return;
          const pages = paper.page_map || [];
          panel.innerHTML = `${pages.length ? `<label>Page mapping <select class="control" data-wnw-reading-page>
            ${pages.map((page, index) => `<option value="${index}">Source ${escape(page.source)} / Translation ${escape(page.translation)}</option>`).join('')}
            </select></label>` : '<p class="hint">This version has no verified page mapping; page them separately.</p>'}
            <div class="wnw-reading-pdfs"><iframe title="Source PDF"></iframe><iframe title="Translation PDF"></iframe></div>`;
          const frames = panel.querySelectorAll('iframe');
          const show = page => {
            frames[0].src = urls[0] + (page ? '#page=' + page.source : '');
            frames[1].src = urls[1] + (page ? '#page=' + page.translation : '');
          };
          const select = panel.querySelector('select');
          if (select) select.onchange = () => show(pages[Number(select.value)]);
          show(pages[0]);
        } catch (error) {
          if (loading.isConnected) loading.textContent = 'Cannot preview PDF: ' + error.message;
        }
      };
    }
  },
});
