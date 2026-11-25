WorkflowNodeRenderers.register('review', {
  accepts(context) {
    return WorkflowDocument.accepts(context);
  },

  render(target, context) {
    const {artifact, data, editable, onChange} = context;
    const key = Array.isArray(data?.issues) ? 'issues' : 'checklist';
    if (artifact.id !== 'structured' || !Array.isArray(data?.[key])) {
      WorkflowDocument.render(target, context, 'Review report');
      return;
    }

    const issues = data[key];
    const html = value => esc(String(value ?? ''));
    const detailField = issue => ['detail', 'problem', 'text', 'title'].find(field => typeof issue[field] === 'string') || 'detail';
    const summaries = editable ? `<label>Review summary<textarea class="control" rows="3" data-wnw-review-summary>${html(data.summary)}</textarea></label>` :
      `<div class="md-render wnw-prose">${renderMarkdown(data.summary || '')}</div>`;
    target.innerHTML = `${summaries}<label>Locate the problem<select class="control" data-wnw-review-jump><option value="">Choose a problem</option>${issues.map((issue, index) =>
      `<option value="${index}">${html(issue.title || issue.id || `Question ${index + 1}`)}</option>`).join('')}</select></label>
      <ol class="wnw-review-list">${issues.map((issue, index) => {
        const location = issue.location ?? issue.line ?? issue.page ?? issue.quote;
        const description = editable ? `<label>Problem description<textarea class="control" rows="3" data-wnw-review-field="${detailField(issue)}">${html(issue[detailField(issue)])}</textarea></label>
          <label>Recommended fix<textarea class="control" rows="2" data-wnw-review-field="comment">${html(issue.comment)}</textarea></label>
          <label><input type="checkbox" data-wnw-review-field="resolved" ${issue.resolved ? 'checked' : ''}> Handled</label>` :
          `<p>${html(issue[detailField(issue)])}</p>${issue.comment ? `<p>${html(issue.comment)}</p>` : ''}<p>${issue.resolved ? 'Handled' : 'To handle'}</p>`;
        return `<li tabindex="-1" data-wnw-review-issue="${index}"><h4>${html(issue.title || issue.id || `Question ${index + 1}`)}</h4>
          ${location == null ? '' : `<p class="hint">Position in the source ${html(typeof location === 'object' ? JSON.stringify(location) : location)}</p>`}
          ${issue.severity ? `<p class="hint">Severity ${html(issue.severity)}</p>` : ''}
          ${issue.fix ? `<p>Suggested fix ${html(issue.fix)}</p>` : ''}${description}</li>`;
      }).join('')}</ol>`;

    const jump = target.querySelector('[data-wnw-review-jump]');
    jump.onchange = () => {
      const issue = target.querySelector(`[data-wnw-review-issue="${jump.value}"]`);
      issue?.focus({preventScroll: true});
      issue?.scrollIntoView({block: 'nearest'});
      jump.value = '';
    };
    const summary = target.querySelector('[data-wnw-review-summary]');
    if (summary) summary.oninput = () => {
      data.summary = summary.value;
      onChange(data);
    };
    for (const field of target.querySelectorAll('[data-wnw-review-field]')) {
      field.oninput = () => {
        const index = Number(field.closest('[data-wnw-review-issue]').dataset.wnwReviewIssue);
        issues[index][field.dataset.wnwReviewField] = field.type === 'checkbox' ? field.checked : field.value;
        onChange(data);
      };
    }
  },
});
