// -*- coding: utf-8 -*-
/**
 */
(function () {
  async function loadProjectTodos(taskId, container) {
    if (!container || !taskId) return;
    try {
      const res = await window.api(`/api/todos?task_id=${encodeURIComponent(taskId)}`);
      const todos = res.todos || [];
      renderTodoList(todos, taskId, container);
    } catch (e) {
      container.innerHTML = `<div class="hint error">Failed to load to-dos: ${e.message}</div>`;
    }
  }

  function renderTodoList(todos, taskId, container) {
    container.innerHTML = `
      <div class="todo-panel card" style="margin-top:14px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">
          <h4 style="margin:0">📋 Project to-dos (${todos.filter(t => t.status === "done").length}/${todos.length})</h4>
          <button class="btn sm ghost" id="todo-import-wf">Import stages from a workflow</button>
        </div>
        <div class="todo-add-form" style="display:flex; gap:6px; margin-bottom:12px">
          <input type="text" class="control" id="todo-input-title" placeholder="AddTo-dosTitle..." style="flex:1">
          <select class="control" id="todo-input-prio" style="width:90px">
            <option value="P0">P0 Urgent</option>
            <option value="P1" selected>P1 Important</option>
            <option value="P2">P2 Normal</option>
          </select>
          <button class="btn sm" id="todo-btn-add">Add</button>
        </div>
        <div class="todo-list" style="display:flex; flex-direction:column; gap:6px">
          ${todos.length === 0 ? '<div class="hint">No to-dos yet; add one above or import from a workflow.</div>' : ""}
          ${todos.map(t => `
            <div class="todo-item ${t.status === "done" ? "done" : ""}" style="display:flex; align-items:center; gap:8px; padding:6px 8px; background:var(--bg-sub, #f8fafc); border-radius:6px; border:1px solid var(--border, #e2e8f0)">
              <input type="checkbox" data-todo-id="${t.id}" ${t.status === "done" ? "checked" : ""} class="todo-check">
              <span class="pill sm prio-${t.priority.toLowerCase()}">${t.priority}</span>
              <span style="flex:1; text-decoration:${t.status === "done" ? "line-through" : "none"}; color:${t.status === "done" ? "var(--muted, #64748b)" : "inherit"}">${t.title}</span>
              <button class="btn sm ghost todo-del-btn" data-todo-id="${t.id}" style="padding:2px 6px; font-size:11px">✕</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    container.querySelector("#todo-btn-add")?.addEventListener("click", async () => {
      const input = container.querySelector("#todo-input-title");
      const prio = container.querySelector("#todo-input-prio")?.value || "P1";
      if (!input?.value.trim()) return;
      await window.api("/api/todos/add", { task_id: taskId, title: input.value.trim(), priority: prio });
      loadProjectTodos(taskId, container);
    });

    container.querySelector("#todo-import-wf")?.addEventListener("click", async () => {
      await window.api("/api/todos/import_workflow", { task_id: taskId });
      loadProjectTodos(taskId, container);
    });

    container.querySelectorAll(".todo-check").forEach(chk => {
      chk.addEventListener("change", async (e) => {
        const id = e.target.getAttribute("data-todo-id");
        await window.api("/api/todos/toggle", { id });
        loadProjectTodos(taskId, container);
      });
    });

    container.querySelectorAll(".todo-del-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.getAttribute("data-todo-id");
        await window.api("/api/todos/delete", { id });
        loadProjectTodos(taskId, container);
      });
    });
  }

  function setupNotesSplitPreview(editorEl, previewEl) {
    if (!editorEl || !previewEl) return;
    function update() {
      const md = editorEl.value || "";
      if (window.marked && window.DOMPurify) {
        previewEl.innerHTML = renderMarkdown(md);
      } else {
        previewEl.textContent = md;
      }
    }
    editorEl.addEventListener("input", update);
    update();
  }

  window.ProjectSpace = {
    loadTodos: loadProjectTodos,
    setupNotesSplitPreview: setupNotesSplitPreview
  };
})();
