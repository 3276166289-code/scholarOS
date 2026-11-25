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
  const route = resolve(path);
  if (!route) throw new Error(`scholarOS: no route for ${path} yet`);

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
    case "storage":
      return call("storage", method === "GET" ? "get" : "set", { key: body?.key ?? route.path ?? path, value: body?.value });
    default:
      throw new Error(`scholarOS: unhandled route kind ${route.kind}`);
  }
}

export const api = request;
