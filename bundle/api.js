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

export const ROUTES = {
  // paper toolbox: pure computation -> paper-core tool
  "/api/paper-toolbox": { kind: "tool", tool: "paper-core", method: "extract_text" },
  "/api/paper-toolbox/upload": { kind: "host", host: "upload" },
  "/api/paper-toolbox/file": { kind: "host", host: "files" },
  "/api/paper-toolbox/import": { kind: "tool", tool: "paper-core", method: "extract_text" },
  "/api/paper-toolbox/preview": { kind: "host", host: "files" },
  "/api/paper-toolbox/result": { kind: "host", host: "files" },
  "/api/paper-toolbox/save": { kind: "storage" },
  "/api/paper-toolbox/start": { kind: "tool", tool: "paper-core", method: "extract_text" },

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
  "/api/todos": { todos: [] },
};

// Chat vertical: the app's own chat rooms map onto Anna's durable conversations.
const CHAT_METHODS = {
  "/api/chat/create": "create",
  "/api/conversation-history": "list",
};

let anna = null;

export async function connect() {
  if (anna) return anna;
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
  const route = resolve(path);
  if (!route) throw new Error(`scholarOS: no route for ${path} yet`);

  // Durable conversations: create a room / list the rooms. The SDK answers its
  // own shapes, so normalise to what the views already read. Hosts without the
  // conversation RPC (the dev harness, older runtimes) fall back to a local
  // list in storage so the chat UI still works.
  // ponytail: the fallback has no memory and no model — send is still unmapped.
  if (CHAT_METHODS[cleanPath]) {
    const localKey = "/local-chats";
    const readLocal = async () => (await call("storage", "get", { key: localKey }))?.value || { conversations: [] };
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
      await call("storage", "set", { key: localKey, value: store });
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
        const stored = unwrap(await call("storage", "get", { key }));
        if (stored != null) return stored;
        return SEEDS[key] ? structuredClone(SEEDS[key]) : null;
      }
      return unwrap(await call("storage", "set", { key, value: body }));
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
    send({ type: "assistant", content: text });
    send({ type: "done", content: text });
  });
}

// ---- offline toolbox runs ------------------------------------------------
// "references" and "compliance" are pure text transforms; paper-core does them
// with the stdlib, so they keep working while model quota is exhausted. Any
// other tool needs the agent lane and is left to it.
// ponytail: only these two are local; add others when their executa lands.
const LOCAL_TOOLS = { references: "cite_format", compliance: "compliance" };
const RUNS = new Map();

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
      : { text: entry.body.text || "" };
  const out = await call("tools", "invoke", { tool_id: "paper-core", method, args });
  const data = toolData(out, `paper-core.${method}`);
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
        if (entry && LOCAL_TOOLS[entry.tool]) {
          if (!RUN_CACHE.has(key)) RUN_CACHE.set(key, await localSse(key, entry));
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
