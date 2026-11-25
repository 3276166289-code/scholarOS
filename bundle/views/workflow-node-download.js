WorkflowNodeRenderers.register('download', {
  accepts({artifact, data}) {
    return artifact.id === 'structured' && artifact.kind === 'papers' && Array.isArray(data) && data.length > 0;
  },

  render(target, {data, editable, files, openArtifact, onChange}) {
    const escape = value => esc(String(value ?? ''));
    const pdfs = files.filter(file => file.kind === 'pdf');
    const paperFile = row => pdfs.find(file => {
      if (row.sha256) return file.content_hash === row.sha256;
      return file.id === 'asset:' + row.id || file.name === row.filename;
    });
    const annotations = (row, index) => editable ? `
      <label>Review reason<textarea class="control" rows="2" data-wnw-cell="${index}" data-field="reason">${escape(row.reason)}</textarea></label>
      <label>Review note<textarea class="control" rows="2" data-wnw-cell="${index}" data-field="annotation">${escape(row.annotation)}</textarea></label>` :
      [row.reason, row.annotation].filter(Boolean).map(text => `<p>${escape(text)}</p>`).join('');

    target.innerHTML = `<div class="wnw-papers">${data.map((row, index) => {
      const pdf = paperFile(row);
      const abstract = row.abstract?.abstract;
      const page = row.abstract?.page;
      const notes = Array.isArray(row.reading_notes) ? row.reading_notes : [];
      return `<article class="wnw-download-paper"><h4>${escape(row.title || row.filename || 'Literature')}</h4>
        ${pdf ? `<button class="btn" type="button" data-wnw-paper-open="${escape(pdf.id)}">Preview the original PDF</button>` : '<p>This version has no PDF snapshot.</p>'}
        ${abstract ? `<details><summary>Abstract${page ? ` · page ${escape(page)}` : ''}</summary><p>${escape(abstract)}</p></details>` : ''}
        ${notes.map(note => `<details><summary>${escape(note.title || 'Read every page closely')}</summary><div class="md-render wnw-prose">${renderMarkdown(note.markdown || '')}</div></details>`).join('')}
        ${annotations(row, index)}
      </article>`;
    }).join('')}</div>`;

    target.querySelectorAll('[data-wnw-paper-open]').forEach(button => {
      button.onclick = () => openArtifact(pdfs.find(file => file.id === button.dataset.wnwPaperOpen));
    });
    target.querySelectorAll('[data-wnw-cell]').forEach(input => {
      input.oninput = () => {
        const row = data[Number(input.dataset.wnwCell)];
        row[input.dataset.field] = input.value;
        onChange(data);
      };
    });
  },
});
