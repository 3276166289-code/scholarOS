// Checks the note / folder / to-do store in bundle/api.js against a fake
// storage runtime: save -> read -> tree -> rename -> delete, and the to-do
// lifecycle. Run: node tools/test-docs.mjs
import assert from "node:assert/strict";

const store = new Map();
globalThis.__annaRuntime = {
  storage: {
    async get({ key }) {
      return { value: store.has(key) ? store.get(key) : null };
    },
    async set({ key, value }) {
      store.set(key, structuredClone(value));
      return { value };
    },
  },
};

const { request } = await import("../bundle/api.js");
const PID = "proj-1";
// Same shape as the views' api(path, body) shim in views/app-core.js: a bare
// object second argument means POST with that JSON body.
const api = (path, body) => request(path, body === undefined ? {} : { method: "POST", body });

// save -> read back the same text
const saved = await api("/api/project/note/save", {
  project_id: PID,
  path: "Notes/Lit/refs.md",
  title: "Refs",
  content: "# Refs\n\none line",
});
assert.equal(saved.path, "Notes/Lit/refs.md");
assert.match(saved.content_hash, /^[0-9a-f]{8}$/);

const one = await api(`/api/project/note?project_id=${PID}&path=${encodeURIComponent(saved.path)}`);
assert.equal(one.content, "# Refs\n\none line");
assert.equal(one.body, one.content, "notebook reads body, notes-and-settings reads content");
assert.equal(one.title, "Refs");

// a different body hashes differently
// tree carries the folder chain and the file
const board = await api(`/api/project/notes?project_id=${PID}`);
assert.equal(board.items.length, 1);
const lit = board.tree.children.find((c) => c.path === "Notes/Lit");
assert.equal(lit.type, "dir");
assert.equal(lit.children[0].type, "file");
assert.equal(lit.children[0].title, "Refs");

const other = await api("/api/project/note/save", { project_id: PID, path: "Notes/Lit/refs.md", content: "x" });
assert.notEqual(other.content_hash, saved.content_hash);

// an empty folder shows up even with no note in it
await api("/api/project/folder/create", { project_id: PID, relative: "Notes/Empty/Nested" });
const board2 = await api(`/api/project/notes?project_id=${PID}`);
const empty = board2.tree.children.find((c) => c.path === "Notes/Empty");
assert.equal(empty.children[0].path, "Notes/Empty/Nested");

// batch tags, then rename moves the file and keeps its body
await api("/api/project/note/batch", { project_id: PID, paths: ["Notes/Lit/refs.md"], add_tags: ["draft"] });
const tagged = await api(`/api/project/note?project_id=${PID}&path=${encodeURIComponent("Notes/Lit/refs.md")}`);
assert.deepEqual(tagged.tags, ["draft"]);

const renamed = await api("/api/project/note/rename", {
  project_id: PID,
  path: "Notes/Lit/refs.md",
  new_name: "references",
});
assert.equal(renamed.new_path, "Notes/Lit/references.md");
const moved = await api(`/api/project/note?project_id=${PID}&path=${encodeURIComponent(renamed.new_path)}`);
assert.equal(moved.content, "x");
assert.equal(moved.title, "refs", "renaming the file keeps the note title");

// deleting a folder path drops the whole subtree
await api("/api/project/note/delete", { project_id: PID, path: "Notes/Lit" });
const board3 = await api(`/api/project/notes?project_id=${PID}`);
assert.equal(board3.items.length, 0);
assert.equal(board3.tree.children.some((c) => c.path === "Notes/Lit"), false);

// to-do lifecycle
const added = await api("/api/todos/add", { title: "read a paper", priority: "p1", task_id: "proj-1" });
assert.equal(added.todo.status, "TODO");
assert.equal(added.todo.priority, "P1");
let todos = (await api("/api/todos?task_id=proj-1")).todos;
assert.equal(todos.length, 1);
assert.equal((await api("/api/todos?task_id=other")).todos.length, 0);

await request("/api/todos/toggle", { method: "POST", body: { id: added.todo.id } });
todos = (await api("/api/todos")).todos;
assert.equal(todos[0].status, "DONE");

await api("/api/todos/update", { id: added.todo.id, title: "read two papers" });
assert.equal((await api("/api/todos")).todos[0].title, "read two papers");

await api("/api/todos/delete", { id: added.todo.id });
assert.deepEqual((await api("/api/todos")).todos, []);

await assert.rejects(() => api("/api/todos/add", { title: "  " }), /needs a title/);

// a project: the id every other screen hangs off
const made = await api("/api/task/create", { title: "Sodium cathode doping", question: "Which dopant?" });
assert.ok(made.task_id);
const state = await api("/api/state");
assert.equal(state.tasks.length, 1);
assert.equal(state.tasks[0].title, "Sodium cathode doping");
assert.equal(state.models[0].api, "anna", "the model row the send guard looks for survives");

const detail = await api(`/api/task?id=${made.task_id}`);
assert.deepEqual(detail.paper_list, []);
assert.equal(detail.question, "Which dopant?");

await api("/api/task/update", { id: made.task_id, title: "Sodium cathode co-doping" });
assert.equal((await api("/api/state")).tasks[0].title, "Sodium cathode co-doping");

await api("/api/task/delete", { id: made.task_id });
assert.deepEqual((await api("/api/state")).tasks, []);

// chat memory + experts: both used to be routed at the llm lane and 422'd
const chat = await api("/api/chat/create", {});
assert.ok(chat.chat.id.startsWith("chat-"), "chat id");
assert.deepEqual((await api(`/api/chat?id=${chat.chat.id}`)).messages, []);
await api("/api/chat/rename", { id: chat.chat.id, title: "Mg stability" });
const hist = await api("/api/conversation-history?kind=chat");
assert.equal(hist.conversations[0].title, "Mg stability");
assert.equal((await api("/api/conversation-history?kind=chat&q=nomatch")).conversations.length, 0);
await api("/api/conversation-history", { id: chat.chat.id, action: "export" });

await api("/api/assistant/save", { name: "Cathode reviewer", description: "checks doping claims" });
const experts = (await api("/api/assistants")).assistants;
assert.equal(experts[0].id, "builtin-steward");
assert.equal(experts.at(-1).name, "Cathode reviewer");
assert.equal((await api("/api/state")).assistants.length, 2);

// production storage (APS) rejects absolute keys, so none may be written
const absolute = [...store.keys()].filter((k) => k.startsWith("/"));
assert.deepEqual(absolute, [], `absolute keys: ${absolute.join(", ")}`);

console.log("OK: notes, folders, to-dos and projects persist through app storage");
console.log("OK: chat memory, experts, and relative storage keys");
