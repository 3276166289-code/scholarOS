// The only door out of the bundle.
//
// Every view keeps calling the same paths it used to (`/api/...`), so no view
// needs rewriting. What changes is what happens here: ROUTES says who serves
// each path. Unmapped paths throw loudly instead of 404-ing silently, so the
// gap list stays visible while porting.
//
// kinds:
//   tool    -> invoke an Executa tool method
//   llm     -> host model call
//   storage -> app storage (<=256 KB per key; big blobs go to files.*)
//   host    -> thin wrapper over an anna.* namespace call
//   gone    -> feature removed in the Anna build; throws a readable error

export const TOOL_ID = "tool-linder0613-paper-core-e5qmwn6s"; // platform-minted executa id
const ROUTES = {
  // paper toolbox: pure computation -> paper-core tool
  "/api/paper-toolbox": { kind: "tool", tool: TOOL_ID, method: "extract_text" },
  "/api/paper-toolbox/upload": { kind: "host", host: "upload" },
  "/api/paper-toolbox/file": { kind: "host", host: "files" },
  "/api/paper-toolbox/import": { kind: "tool", tool: TOOL_ID, method: "extract_text" },
  "/api/paper-toolbox/preview": { kind: "host", host: "files" },
  "/api/paper-toolbox/result": { kind: "host", host: "files" },
  "/api/paper-toolbox/save": { kind: "storage" },
  "/api/paper-toolbox/start": { kind: "tool", tool: TOOL_ID, method: "extract_text" },

  // features the platform already owns, or that cannot exist here
  "/api/usage": { kind: "gone", why: "Usage is shown in Anna's own dashboard." },
  "/api/capabilities": { kind: "gone", why: "Executas are installed from the Anna Executa Hub." },
  "/api/capabilities/bindings": { kind: "gone", why: "Executas are installed from the Anna Executa Hub." },
  "/api/capabilities/skill": { kind: "gone", why: "Executas are installed from the Anna Executa Hub." },
  "/api/feishu": { kind: "gone", why: "Feishu inbound needs a long-lived socket; only outbound webhooks survive." },
  "/api/conv/open": { kind: "gone", why: "Opening a local file needs the desktop build." },
};

// Domain defaults. Longest prefix wins, so order matters only for overlaps.
// Everything not listed here stays unmapped and throws until it gets a decision.
const PREFIX_KINDS = [
  // pure computation / outbound network -> Executa tools
  ["/api/paper-toolbox/", "tool"],
  ["/api/paper-toolbox", "tool"],
  ["/api/pdf", "tool"],
  ["/api/paper/", "tool"],
  ["/api/papermeta", "tool"],
  ["/api/translate", "tool"],
  ["/api/tr", "tool"],
  ["/api/trans/", "tool"],
  ["/api/zotero/", "tool"],
  ["/api/zotero", "tool"],
  ["/api/mail/", "tool"],
  ["/api/mail", "tool"],
  ["/api/rss/", "tool"],
  ["/api/rss", "tool"],
  ["/api/easyscholar/", "tool"],
  ["/api/easyscholar", "tool"],
  ["/api/library", "tool"],
  ["/api/upload", "tool"],

  // model work -> host llm / agent sessions
  ["/api/agent/", "llm"],
  ["/api/agent-settings/", "llm"],
  ["/api/agent-settings", "llm"],
  ["/api/models", "llm"],
  ["/api/chat/", "llm"],
  ["/api/chat", "llm"],
  ["/api/assistant/", "llm"],
  ["/api/assistant", "llm"],
  ["/api/workflow/execution", "job"],
  ["/api/project-tasks/", "job"],
  ["/api/project-tasks", "job"],
  ["/api/execution-board", "job"],
  ["/api/execution-conversations", "job"],
  ["/api/task/", "job"],
  ["/api/task", "job"],
  ["/api/runs", "job"],
  ["/api/plans", "job"],
  ["/api/langgraph", "job"],
  ["/api/step", "job"],

  // platform already owns it, or it cannot exist here
  ["/api/capabilities", "gone"],
  ["/api/usage", "gone"],
  ["/api/feishu", "gone"],
  ["/api/security", "gone"],
  ["/api/win", "gone"],
  ["/api/message-channels", "gone"],
  ["/api/schedule", "gone"],

  // everything else is app state -> storage (keep last: it matches all)
  ["/api/", "storage"],
];

// Empty-but-valid shapes for the three bootstrap reads. Without them the shell
// dies on `undefined.length` because Anna has no backend to seed it.
// ponytail: only the bootstrap reads are seeded; every other endpoint still
// needs its own mapping before its screen works.
const SEEDS = {
  "/api/state": {
    tasks: [], chats: [], assistants: [],
    // the platform supplies the model; one row is enough to mean "a model exists"
    models: [{ id: "anna", name: "Anna model", api: "anna", api_key: "platform" }],
    active: { id: "anna", name: "Anna model", api: "anna", api_key: "platform" },
    events: [], stages: [],
  },
  "/api/providers": { providers: [], wires: [], default: null },
  "/api/tools": { tools: [] },
  "/api/conversation-history": { conversations: [] },
};

// Chat vertical: the app's own chat rooms map onto Anna's durable conversations.
const CHAT_METHODS = {
  "/api/chat/create": "create",
  "/api/conversation-history": "list",
};

// ---- notes, folders, to-dos ---------------------------------------------
// Nothing on the platform stores a project notebook or a to-do list, so these
// live in app storage: one key per project for the notes and the folder list,
// one key for to-dos. Everything below is the lazy store the views already
// speak; no view changes.
// ponytail: last write wins — expected_hash is accepted and ignored, so two
// devices editing one note will clobber rather than merge. Add revision checks
// the day that is real. A project's notes share one key (256 KB limit), which
// is a few hundred notes; split per folder before that bites.
const notesKey = (pid) => `/doc/notes/${pid || "personal"}`;
const foldersKey = (pid) => `/doc/folders/${pid || "personal"}`;
const TODO_KEY = "/doc/todos";
const PROJECT_KEY = "/doc/projects";

const unwrapValue = (raw) => (raw && typeof raw === "object" && "value" in raw ? raw.value : raw);
// Real APS storage (production) rejects absolute keys — "key must be relative".
// Every key in this file is written as a path, so strip the leading slashes in
// one place instead of at all six call sites.
const skey = (key) => String(key ?? "").replace(/^\/+/, "") || "root";

async function readKey(key, fallback) {
  const stored = unwrapValue(await call("storage", "get", { key: skey(key) }));
  return stored == null ? structuredClone(fallback) : stored;
}

const writeKey = (key, value) => call("storage", "set", { key: skey(key), value });

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : String(Date.now()) + Math.random().toString(36).slice(2);

// 32-bit FNV-1a: only has to answer "did this change since I loaded it".
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const baseName = (p) => String(p || "").split("/").pop();
const titleOf = (p) => baseName(p).replace(/\.md$/i, "");

// A note's path is its address, so the folder tree is derived from the paths
// plus whatever empty folders folder/create remembered.
function treeOf(notes, folders) {
  const root = { type: "dir", name: "Notes", path: "Notes", children: [] };
  const rel = (p) => {
    const parts = String(p).split("/").filter(Boolean);
    return parts[0] === root.name ? parts.slice(1) : parts;
  };
  const dirFor = (parts) => {
    let node = root;
    let acc = root.path;
    for (const seg of parts) {
      acc = `${acc}/${seg}`;
      let next = node.children.find((c) => c.type === "dir" && c.path === acc);
      if (!next) {
        next = { type: "dir", name: seg, path: acc, children: [] };
        node.children.push(next);
      }
      node = next;
    }
    return node;
  };
  for (const folder of folders) dirFor(rel(folder));
  for (const [path, note] of Object.entries(notes)) {
    const parts = rel(path);
    dirFor(parts.slice(0, -1)).children.push({
      type: "file",
      name: baseName(path),
      path,
      title: note.title || titleOf(path),
      ext: "md",
      updated_at: note.updated_at,
    });
  }
  return root;
}

const noteRow = (path, note) => ({
  path,
  title: note.title || titleOf(path),
  body: note.content,
  content: note.content,
  content_hash: hash(note.content),
  read_only: false,
  category_id: note.category_id ?? null,
  tags: note.tags || [],
  note_type: note.note_type || "note",
  metadata: note.metadata || {},
});

const DOC = {
  // chat memory: per-conversation log + the sidebar history panel
  "/api/chat": (body, params) => chatLog(params?.get("id") || body?.id || ""),
  "/api/chat/create": async () => {
    const id = "chat-" + uid();
    await upsertChat(id, { title: "New chat" });
    return { chat: { id } };
  },
  "/api/conversation-history": (body, params) =>
    body && body.action ? chatHistoryAction(body) : chatHistory(body, params),
  // The project list is the spine: every other screen hangs off a project id,
  // and Anna has no project backend, so it lives in storage too.
  "/api/state": async () => ({
    ...structuredClone(SEEDS["/api/state"]),
    tasks: await readKey(PROJECT_KEY, []),
  }),

  "/api/task/create": async (body) => {
    const title = String(body.title || "").trim();
    if (!title) throw new Error("A project needs a name");
    const projects = await readKey(PROJECT_KEY, []);
    const project = {
      id: uid(),
      title,
      question: String(body.question || ""),
      material_system: String(body.material_system || ""),
      base_dir: String(body.base_dir || ""),
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    projects.unshift(project);
    await writeKey(PROJECT_KEY, projects);
    return { task_id: project.id, project };
  },

  "/api/task": async (body, q) => {
    const id = q.get("id") || body.id;
    const project = (await readKey(PROJECT_KEY, [])).find((p) => p.id === id);
    if (!project) throw new Error("That project is not here any more");
    // the workspace reads these collections; nothing runs them yet
    return { ...project, paper_list: [], materials: [], experts: [], tasks: [], stages: [] };
  },

  "/api/task/update": async (body) => {
    const projects = await readKey(PROJECT_KEY, []);
    const project = projects.find((p) => p.id === body.id);
    if (!project) throw new Error("That project is not here any more");
    for (const key of ["title", "question", "material_system", "base_dir"]) {
      if (body[key] !== undefined) project[key] = String(body[key]);
    }
    project.updated_at = new Date().toISOString();
    await writeKey(PROJECT_KEY, projects);
    return { task_id: project.id, project };
  },

  "/api/task/delete": async (body) => {
    const projects = await readKey(PROJECT_KEY, []);
    await writeKey(PROJECT_KEY, projects.filter((p) => p.id !== body.id));
    return { ok: true };
  },

  "/api/task/delete-preview": async (body, q) => {
    const id = q.get("id") || body.id;
    const project = (await readKey(PROJECT_KEY, [])).find((p) => p.id === id);
    return { title: project?.title || "Project", base_dir: project?.base_dir || "", conversations: 0, running: false };
  },

  // The task board has no engine behind it (nothing runs agents here), but the
  // workspace reads it on every open — empty shapes keep the screen clean
  // instead of talking to tools.getJob with a project id.
  "/api/project-tasks": async () => ({ tasks: [] }),
  "/api/project-tasks/executors": async () => ({ bindings: [], teams: [] }),
  "/api/project-tasks/policy": async () => ({ policy: { autonomy_mode: "supervised" } }),
  "/api/execution-board": async () => ({ items: [] }),
  // teams exist only as a project's ad-hoc rooms in the desktop build; here the
  // office opens empty rather than spinning on "Loading teams..."
  "/api/teams": async () => ({ teams: [] }),

  "/api/project/notes": async (body, q) => {
    const pid = q.get("project_id") || body.project_id || "";
    const notes = await readKey(notesKey(pid), {});
    const folders = await readKey(foldersKey(pid), []);
    return {
      project_id: pid,
      read_only: false,
      items: Object.entries(notes).map(([path, note]) => ({
        path,
        title: note.title || titleOf(path),
        category_id: note.category_id ?? null,
        tags: note.tags || [],
        note_type: note.note_type || "note",
        updated_at: note.updated_at,
      })),
      tree: treeOf(notes, folders),
      catalog: { categories: [], content_hash: "" },
    };
  },

  "/api/project/note": async (body, q) => {
    const pid = q.get("project_id") || body.project_id || "";
    const path = q.get("path") || body.path || "";
    const notes = await readKey(notesKey(pid), {});
    return notes[path] ? noteRow(path, notes[path]) : noteRow(path, { content: "", title: titleOf(path) });
  },

  "/api/project/note/save": async (body) => {
    const pid = body.project_id || "";
    const notes = await readKey(notesKey(pid), {});
    const path = String(body.path || "").trim() || `Notes/${uid()}.md`;
    const content = String(body.content ?? "");
    const meta = body.metadata || {};
    notes[path] = {
      title: String(body.title || titleOf(path)),
      content,
      updated_at: new Date().toISOString(),
      category_id: meta.category_id ?? null,
      tags: meta.tags || [],
      note_type: meta.note_type || "note",
      metadata: meta,
    };
    await writeKey(notesKey(pid), notes);
    return { path, title: notes[path].title, content, content_hash: hash(content), template_id: null };
  },

  "/api/project/note/delete": async (body) => {
    const pid = body.project_id || "";
    const path = String(body.path || "").replace(/\/+$/, "");
    const notes = await readKey(notesKey(pid), {});
    if (notes[path]) {
      delete notes[path];
    } else {
      // a folder: the tree is derived from paths, so drop the subtree
      const prefix = `${path}/`;
      for (const key of Object.keys(notes)) if (key.startsWith(prefix)) delete notes[key];
      const folders = (await readKey(foldersKey(pid), [])).filter((f) => f !== path && !f.startsWith(prefix));
      await writeKey(foldersKey(pid), folders);
    }
    await writeKey(notesKey(pid), notes);
    return { ok: true };
  },

  "/api/project/note/rename": async (body) => {
    const pid = body.project_id || "";
    const from = String(body.path || "").replace(/\/+$/, "");
    let name = String(body.new_name || "").trim();
    if (!name) throw new Error("A new name is required");
    if (/\.md$/i.test(from) && !/\.md$/i.test(name)) name += ".md";
    const to = (from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "") + name;
    const notes = await readKey(notesKey(pid), {});
    if (notes[from]) {
      // the file name and the note title are separate; only the path moves
      notes[to] = { ...notes[from] };
      delete notes[from];
    } else {
      for (const key of Object.keys(notes)) {
        if (!key.startsWith(`${from}/`)) continue;
        notes[to + key.slice(from.length)] = notes[key];
        delete notes[key];
      }
      const folders = await readKey(foldersKey(pid), []);
      const moved = folders.map((f) => (f === from || f.startsWith(`${from}/`) ? to + f.slice(from.length) : f));
      await writeKey(foldersKey(pid), moved);
    }
    await writeKey(notesKey(pid), notes);
    return { new_path: to };
  },

  "/api/project/note/batch": async (body) => {
    const pid = body.project_id || "";
    const notes = await readKey(notesKey(pid), {});
    const add = body.add_tags || [];
    const remove = body.remove_tags || [];
    const rename = body.rename_tags || {};
    let updated = 0;
    for (const path of body.paths || []) {
      const note = notes[path];
      if (!note) continue;
      const kept = (note.tags || []).filter((t) => !remove.includes(t)).map((t) => rename[t] || t);
      note.tags = [...new Set([...kept, ...add])];
      if (body.category_id !== undefined) note.category_id = body.category_id || null;
      updated++;
    }
    await writeKey(notesKey(pid), notes);
    return { updated };
  },

  // The category scheme is a filesystem concept in the desktop build. Notes
  // here carry a category_id, but there is no catalog to edit yet.
  "/api/project/note-categories": async () => ({ categories: [], content_hash: "" }),

  "/api/project/folder/create": async (body) => {
    const pid = body.project_id || "";
    const path = String(body.path || body.relative || "").replace(/^\/+|\/+$/g, "");
    if (!path) throw new Error("A folder path is required");
    const folders = await readKey(foldersKey(pid), []);
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const one = parts.slice(0, i).join("/");
      if (!folders.includes(one)) folders.push(one);
    }
    await writeKey(foldersKey(pid), folders);
    return { path };
  },

  "/api/todos": async (body, q) => {
    const store = await readKey(TODO_KEY, { todos: [] });
    const task = q.get("task_id");
    return { todos: task ? store.todos.filter((t) => t.task_id === task) : store.todos };
  },

  "/api/todos/add": async (body) => {
    const title = String(body.title || "").trim();
    if (!title) throw new Error("A to-do needs a title");
    const store = await readKey(TODO_KEY, { todos: [] });
    // ponytail: status is TODO/DONE (what the to-do panel reads). The project
    // panel checks "done" in lower case, so its checkbox stays unticked.
    const todo = {
      id: uid(),
      task_id: body.task_id || "",
      title,
      description: body.description || "",
      priority: String(body.priority || "P2").toUpperCase(),
      due_date: body.due_date || null,
      status: "TODO",
      stage: null,
      created_at: new Date().toISOString(),
    };
    store.todos.unshift(todo);
    await writeKey(TODO_KEY, store);
    return { todo };
  },

  "/api/todos/toggle": async (body) => {
    const store = await readKey(TODO_KEY, { todos: [] });
    const todo = store.todos.find((t) => t.id === body.id);
    if (!todo) throw new Error("That to-do is gone");
    todo.status = todo.status === "DONE" ? "TODO" : "DONE";
    await writeKey(TODO_KEY, store);
    return { todo };
  },

  "/api/todos/update": async (body) => {
    const store = await readKey(TODO_KEY, { todos: [] });
    const todo = store.todos.find((t) => t.id === body.id);
    if (!todo) throw new Error("That to-do is gone");
    for (const [key, value] of Object.entries(body)) if (key !== "id") todo[key] = value;
    await writeKey(TODO_KEY, store);
    return { todo };
  },

  "/api/todos/delete": async (body) => {
    const store = await readKey(TODO_KEY, { todos: [] });
    store.todos = store.todos.filter((t) => t.id !== body.id);
    await writeKey(TODO_KEY, store);
    return { ok: true };
  },

  // Workflows are not part of this build, so there are no stages to copy in.
  "/api/todos/import_workflow": async () => ({ added: 0 }),
};


let anna = null;

export async function connect() {
  if (anna) return anna;
  // the dev harness and tools/test-docs.mjs inject a runtime instead of the SDK
  if (globalThis.__annaRuntime) return (anna = globalThis.__annaRuntime);
  const { AnnaAppRuntime } = await import("/static/anna-apps/_sdk/latest/index.js");
  anna = await AnnaAppRuntime.connect();
  return anna;
}

export function resolve(path) {
  const clean = String(path).split("?")[0];
  if (ROUTES[clean]) return ROUTES[clean];
  for (const [prefix, kind] of PREFIX_KINDS) {
    if (clean.startsWith(prefix)) return { kind, prefix, path: clean };
  }
  return null;
}

// Dynamic dispatch, so we don't hardcode method names before a route needs one.
// Verified against the runtime SDK: tools.invoke / tools.getJob / llm.complete exist.
async function call(ns, method, args) {
  const app = await connect();
  const space = app[ns];
  const fn = space?.[method];
  if (typeof fn !== "function") throw new Error(`scholarOS: anna.${ns}.${method} is not available`);
  return fn.call(space, args);
}

export async function request(path, { method = "GET", body } = {}) {
  const cleanPath = String(path).split("?")[0];
  // Both lanes (api() and the raw fetch patch) answer these two here, so the
  // paper toolbox sees one behaviour no matter how it is called.
  if (cleanPath === "/api/paper-toolbox") return CATALOG;
  if (cleanPath === "/api/paper-toolbox/start") return startToolRun(body);
  const doc = DOC[cleanPath];
  if (doc) return doc(body || {}, new URLSearchParams(String(path).split("?")[1] || ""));
  const route = resolve(path);
  if (!route) throw new Error(`scholarOS: no route for ${path} yet`);

  // Durable conversations: create a room / list the rooms. The SDK answers its
  // own shapes, so normalise to what the views already read. Hosts without the
  // conversation RPC (the dev harness, older runtimes) fall back to a local
  // list in storage so the chat UI still works.
  // ponytail: the fallback has no memory and no model — send is still unmapped.
  if (CHAT_METHODS[cleanPath]) {
    const localKey = "/local-chats";
    const readLocal = async () => (await call("storage", "get", { key: skey(localKey) }))?.value || { conversations: [] };
    if (CHAT_METHODS[cleanPath] === "create") {
      const title = body?.title || "Chat";
      try {
        const made = await call("conversation", "create", { name: title });
        const uuid = made?.conversation_uuid || made?.uuid || made?.id;
        if (uuid) return { id: uuid, chat: { id: uuid, title } };
      } catch (e) {
        /* fall through to the local list */
      }
      const store = await readLocal();
      const id = "local-" + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
      store.conversations.unshift({ id, title, updated_at: new Date().toISOString(), kind: "chat", local: true });
      await call("storage", "set", { key: skey(localKey), value: store });
      return { id, chat: { id, title } };
    }
    try {
      const listed = await call("conversation", "list", { limit: 50 });
      const rows = listed?.conversations || listed?.items || (Array.isArray(listed) ? listed : []);
      if (rows.length) {
        return {
          conversations: rows.map((c) => ({
            id: c.conversation_uuid || c.uuid || c.id,
            title: c.name || c.title || "Chat",
            updated_at: c.updated_at || c.created_at || null,
            kind: c.kind || "chat",
          })),
        };
      }
    } catch (e) {
      /* fall through */
    }
    return await readLocal();
  }

  if (route.kind === "gone") throw new Error(route.why);

  switch (route.kind) {
    case "tool": {
      const out = await call("tools", "invoke", {
        tool_id: route.tool,
        method: route.method,
        args: { path: route.path || path, ...(body || {}) },
      });
      return toolData(out, `${route.tool}.${route.method}`);
    }
    case "job":
      return call("tools", "getJob", { jobId: body?.job_id || body?.id });
    case "llm":
      return call("llm", route.method || "complete", body);
    case "storage": {
      const key = route.path ?? String(path).split("?")[0];
      // the SDK answers {value} rather than the bare value
      const unwrap = (raw) => (raw && typeof raw === "object" && "value" in raw ? raw.value : raw);
      if (method === "GET") {
        const stored = unwrap(await call("storage", "get", { key: skey(key) }));
        if (stored != null) return stored;
        return SEEDS[key] ? structuredClone(SEEDS[key]) : null;
      }
      return unwrap(await call("storage", "set", { key: skey(key), value: body }));
    }
    default:
      throw new Error(`scholarOS: unhandled route kind ${route.kind}`);
  }
}

export const api = request;

// ---- fetch bridge -------------------------------------------------------
// The chat client streams with raw fetch + SSE (it never goes through api()),
// so the shim has to sit on window.fetch as well. Everything else /api/* is
// answered from request() so both lanes agree.

const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// llm.complete is rejected by this host (the sync channel answers 502 when the
// account has no quota), while llm.stream reports the same condition as a
// readable frame. Stream, and forward deltas as they arrive.
async function streamAnswer(message, send) {
  const app = await connect();
  const frames = app.llm.stream({ messages: [{ role: "user", content: message }] });
  let text = "";
  for await (const frame of frames) {
    if (frame?.event === "error") throw new Error(frame.message || frame.code || "The model call failed");
    const delta = frame?.text ?? frame?.delta ?? "";
    if (delta) {
      text += delta;
      send({ type: "assistant_delta", text: String(delta) });
    }
  }
  if (!text) throw new Error("The model returned nothing");
  return text;
}

function sseStream(runId, work) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(enc.encode(sse(obj)));
      send({ type: "run_started", run_id: runId });
      try {
        await work(send);
      } catch (e) {
        send({ type: "error", message: e.message });
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function agentRun(init) {
  let req = {};
  try { req = JSON.parse(init.body || "{}"); } catch (e) { /* keep {} */ }
  const entry = RUNS.get(req.task_id);
  return sseStream("run-" + Date.now().toString(36), async (send) => {
    if (entry && LOCAL_TOOLS[entry.tool]) {
      RUNS.delete(req.task_id);
      await runLocalTool(entry, send);
      return;
    }
    const text = await streamAnswer(req.message || entry?.body?.text || "", send);
    if (req.task_id && !entry) {
      // A chat turn, not a toolbox run: keep the log so the conversation
      // survives a reload. History must never be able to break a reply.
      try {
        await appendChatTurn(req.task_id, req.message || "", text);
      } catch (e) {
        /* storage failure is not worth losing the answer over */
      }
    }
    send({ type: "assistant", content: text });
    send({ type: "done", content: text });
  });
}

// ---- chat memory -------------------------------------------------------
// One storage row per conversation. Without this every reload started from an
// empty log and the history panel had nothing to list.
const CHATS_KEY = "/doc/chats";
const chatLogKey = (id) => `/doc/chat/${id}`;
const nowIso = () => new Date().toISOString();
const titleFrom = (text) =>
  (String(text || "").trim().split("\n")[0] || "Chat").slice(0, 60) || "Chat";

async function chatIndex() {
  const rows = await readKey(CHATS_KEY, null);
  return Array.isArray(rows) ? rows : [];
}

async function chatLog(id) {
  if (!id) return { messages: [] };
  const log = await readKey(chatLogKey(id), null);
  return log && Array.isArray(log.messages) ? log : { messages: [] };
}

async function upsertChat(id, patchBody) {
  const rows = await chatIndex();
  const at = rows.findIndex((r) => r.id === id);
  const row = { id, title: "Chat", created_at: nowIso(), ...(at < 0 ? {} : rows[at]), ...patchBody };
  row.updated_at = nowIso();
  if (at < 0) rows.unshift(row);
  else rows[at] = row;
  await writeKey(CHATS_KEY, rows);
  return row;
}

async function appendChatTurn(id, userText, answerText) {
  if (!id) return;
  const log = await chatLog(id);
  const ts = nowIso();
  if (userText) log.messages.push({ role: "user", content: String(userText), ts });
  if (answerText) log.messages.push({ role: "assistant", content: String(answerText), ts });
  await writeKey(chatLogKey(id), log);
  const prev = (await chatIndex()).find((r) => r.id === id);
  const keepTitle = prev?.title && prev.title !== "Chat" && prev.title !== "New chat";
  await upsertChat(id, { title: keepTitle ? prev.title : titleFrom(userText), count: log.messages.length });
}

async function chatHistory(body, params) {
  const kind = params?.get("kind") || body?.kind || "chat";
  if (kind !== "chat") return { conversations: [] };
  const needle = String(params?.get("q") || body?.q || "").toLowerCase();
  return {
    conversations: (await chatIndex())
      .filter((row) => !needle || String(row.title || "").toLowerCase().includes(needle))
      .map((row) => ({
        id: row.id,
        title: row.title || "Chat",
        updated_at: row.updated_at,
        pinned_at: row.pinned_at || null,
        running: false,
        channel: "chat",
      }))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
  };
}

async function chatHistoryAction(body) {
  const id = body?.id;
  if (!id) throw new Error("scholarOS: a conversation id is required");
  const action = body.action;
  if (action === "rename") {
    await upsertChat(id, { title: String(body.title || "Chat").slice(0, 80) });
    return { ok: true };
  }
  if (action === "trash" || action === "purge") {
    await writeKey(CHATS_KEY, (await chatIndex()).filter((row) => row.id !== id));
    await writeKey(chatLogKey(id), { messages: [] });
    return { ok: true };
  }
  if (action === "export") {
    const log = await chatLog(id);
    const row = (await chatIndex()).find((r) => r.id === id);
    const bodyText = log.messages
      .map((m) => (m.role === "user" ? "**You**" : "**Assistant**") + "\n\n" + m.content)
      .join("\n\n---\n\n");
    return { title: row?.title || "Chat", content: `# ${row?.title || "Chat"}\n\n${bodyText}\n` };
  }
  return { ok: true };
}

// ---- offline toolbox runs ------------------------------------------------
// "references" and "compliance" are pure text transforms; paper-core does them
// with the stdlib, so they keep working while model quota is exhausted. Every
// other tool is one model call, answered on the same run stream.
// ponytail: only these two are local; add others when their executa lands.
const LOCAL_TOOLS = { references: "cite_format", compliance: "compliance", convert: "docx_b64" };
const RUNS = new Map();

// Instruction per model-backed tool. A prompt the panel edited wins over these.
const TOOL_PROMPTS = {
  translate: (body) =>
    `Translate the text below into ${body.direction === "en_zh" ? "Chinese" : "English"}. ` +
    "Keep formulas, citations, numbers and heading levels exactly as they are. Return only the translation.",
  polish: () =>
    "Rewrite the text below for clarity and flow without changing its technical content, numbers or citations. " +
    "Return only the rewritten text.",
  caption: (body) =>
    `Write one concise journal-style figure caption in ${body.lang === "zh" ? "Chinese" : "English"} from the notes below. ` +
    "Name what the figure shows and what the reader should take from it. Return only the caption.",
  mermaid: () =>
    "Turn the description below into a Mermaid diagram. Return only one fenced mermaid code block.",
};

// Tools whose real work is a pipeline this build does not carry. Saying so is
// better than a model answer that pretends to have converted something.
const TOOL_ABSENT = {
  image_convert: "Image conversion needs the desktop image pipeline, which this build does not carry.",
  pdf_translate: "PDF translation needs the full-text pipeline, which this build does not carry yet.",
};

async function startToolRun(body) {
  const runId = "run-" + Math.random().toString(36).slice(2, 10);
  const entry = { tool: body?.tool, body: body || {} };
  RUNS.set(runId, entry);
  RUNS.set("chat-" + runId, entry);
  return { run_id: runId, chat_id: "chat-" + runId, request_key: body?.request_key || runId };
}

async function runLocalTool(entry, send) {
  const method = LOCAL_TOOLS[entry.tool];
  const args =
    entry.tool === "references"
      ? { text: entry.body.text || "", style: entry.body.cite_style || "apa" }
      : entry.tool === "convert"
        ? { text: entry.body.text || "", filename: entry.body.filename || "manuscript.docx" }
        : { text: entry.body.text || "" };
  const out = await call("tools", "invoke", { tool_id: TOOL_ID, method, args });
  const data = toolData(out, `paper-core.${method}`);
  if (entry.tool === "convert") {
    // There is no shared filesystem with the executa: hand the bytes to the
    // panel, which saves them through a Blob download.
    const raw = typeof data === "string" ? data : data?.text ?? JSON.stringify(data);
    const parsed = JSON.parse(raw);
    send({
      type: "toolbox_result",
      content: `Converted ${parsed.paragraphs || 0} paragraph(s) — the .docx is downloading.`,
      files: [{ name: parsed.filename || "manuscript.docx", mime: parsed.mime, b64: parsed.b64 }],
    });
    send({ type: "done", content: "done" });
    return;
  }
  const content = typeof data === "string" ? data : data?.text ?? JSON.stringify(data);
  send({ type: "toolbox_result", content });
  send({ type: "done", content });
}

// The paper toolbox reads its menu from here. Presets live in the product
// backend; without them the panel still runs the built-in tools.
const CATALOG = {
  tools: [
    { id: "translate", name: "Translate" },
    { id: "polish", name: "Polish" },
    { id: "references", name: "References" },
    { id: "compliance", name: "Compliance check" },
    { id: "caption", name: "Captions" },
    { id: "convert", name: "Convert document" },
    { id: "image_convert", name: "Convert images" },
    { id: "pdf_translate", name: "Translate PDF" },
    { id: "mermaid", name: "Diagram" },
  ],
  prompt_presets: [],
  document_conversion: { available: false, inputs: [] },
};

// Executa results arrive as the payload itself; a failure is an `error` field.
function toolData(out, label) {
  if (out && typeof out === "object" && out.error) throw new Error(out.error);
  if (out?.success === false) throw new Error(`${label} failed`);
  return out?.data ?? out;
}

// A local tool answers in milliseconds, so the events are built up front and
// replayed to every subscriber — the panel can call follow() twice and both
// readers still get the full log.
const RUN_CACHE = new Map();

async function localSse(key, entry) {
  const events = [];
  try {
    await runLocalTool(entry, (o) => events.push(o));
  } catch (e) {
    events.push({ type: "error", message: e.message });
  }
  return [sse({ type: "run_started", run_id: key }), ...events.map(sse)].join("");
}

// One model call per run, reported in the toolbox's own event shape: the panel
// only understands toolbox_result + done, so deltas are swallowed here.
async function modelSse(key, entry) {
  const body = entry.body || {};
  const events = [];
  try {
    if (TOOL_ABSENT[entry.tool]) throw new Error(TOOL_ABSENT[entry.tool]);
    const build = TOOL_PROMPTS[entry.tool];
    if (!build) throw new Error(`The ${entry.tool} tool is not available in this build.`);
    const text = String(body.text || "").trim();
    if (!text) throw new Error("Paste the text to process first.");
    const terms = String(body.terminology || "").trim();
    const message = [String(body.prompt || "").trim() || build(body), terms && `Terminology to keep:\n${terms}`, "---", text]
      .filter(Boolean)
      .join("\n\n");
    const out = await streamAnswer(message, () => {});
    events.push({ type: "toolbox_result", content: out });
    events.push({ type: "done", content: out });
  } catch (e) {
    events.push({ type: "error", message: e.message });
  }
  return [sse({ type: "run_started", run_id: key }), ...events.map(sse)].join("");
}

export function patchFetch() {
  if (typeof window === "undefined" || window.__scholarFetchPatched) return;
  window.__scholarFetchPatched = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (!String(url).startsWith("/api/")) return real(input, init);
    const clean = String(url).split("?")[0];
    try {
      if (clean === "/api/agent") return agentRun(init);
      // run polling: a local toolbox run answers its own stream in one shot
      const streamMatch = clean.match(/^\/api\/runs\/([^/]+)\/stream$/);
      if (streamMatch) {
        const key = decodeURIComponent(streamMatch[1]);
        const entry = RUNS.get(key);
        if (entry) {
          // both lanes answer here, and the answer is replayed to every caller:
          // the panel calls follow() twice and must not lose the log.
          if (!RUN_CACHE.has(key)) {
            RUN_CACHE.set(key, LOCAL_TOOLS[entry.tool] ? await localSse(key, entry) : await modelSse(key, entry));
          }
          return new Response(RUN_CACHE.get(key), { status: 200, headers: { "Content-Type": "text/event-stream" } });
        }
        // unknown id (e.g. a run restored after reload): end the stream cleanly
        return new Response(sse({ type: "error", message: "This run is no longer available; start it again." }), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      if (clean.startsWith("/api/runs/")) return jsonResponse({ status: "done" });
      let body;
      if (init.body) { try { body = JSON.parse(init.body); } catch (e) { body = init.body; } }
      return jsonResponse(await request(url, { method: init.method || "GET", body }));
    } catch (e) {
      return jsonResponse({ error: e.message }, 400);
    }
  };
}

patchFetch();
