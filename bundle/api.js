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
      if (!out?.success) throw new Error(out?.error || `${route.tool}.${route.method} failed`);
      return out.data;
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

async function completeText(message) {
  const out = await call("llm", "complete", { messages: [{ role: "user", content: message }] });
  const text = out?.content ?? out?.text ?? out?.message ?? "";
  if (!text) throw new Error(out?.error || "The model returned nothing");
  return String(text);
}

function agentRun(init) {
  let req = {};
  try { req = JSON.parse(init.body || "{}"); } catch (e) { /* keep {} */ }
  const runId = "run-" + Date.now().toString(36);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(enc.encode(sse(obj)));
      send({ type: "run_started", run_id: runId });
      try {
        const text = await completeText(req.message || "");
        for (const chunk of text.match(/[\s\S]{1,40}/g) || []) send({ type: "assistant_delta", text: chunk });
        send({ type: "assistant", content: text });
        send({ type: "done" });
      } catch (e) {
        send({ type: "error", message: e.message });
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
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
      // run polling: this bridge answers in one shot, so nothing is pending
      if (clean.startsWith("/api/runs/")) {
        return clean.endsWith("/stream") ? new Response("", { status: 204 }) : jsonResponse({ status: "done" });
      }
      let body;
      if (init.body) { try { body = JSON.parse(init.body); } catch (e) { body = init.body; } }
      return jsonResponse(await request(url, { method: init.method || "GET", body }));
    } catch (e) {
      return jsonResponse({ error: e.message }, 400);
    }
  };
}

patchFetch();
