
const OFFICE_INK = "#7E93A3";
const OFFICE_COLORS = ["#7E93A3", "#93A385", "#B08B84", "#C9A67E", "#9C8FA6", "#7E9C90",
                       "#B98F6A", "#8E8C86", "#A8A06B", "#C0A0A6", "#6F8B8E"];
const OFFICE_CN = { idle: "Asleep", queued: "Queued", running: "Running", done: "Done", failed: "Failed", blocked: "Waiting for input", awaiting_review: "To review" };
let officeSel = "";
let officeRAF = 0;
let officeWalkers = [];
let officeRenderSequence = 0;

const offEsc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const offAgo = (iso) => {
  if (typeof fmtAgo === "function") return fmtAgo(iso);
  return String(iso || "").replace("T", " ").slice(5, 16);
};
const offTint = (h) => `background:${h}1f;border-color:${h}99;color:${h}`;

class OfficeWalker {
  constructor(el, host, home, status) {
    this.el = el;
    this.in = el.querySelector(".in");
    this.host = host;
    this.home = home;
    this.status = status || "idle";
    this.hot = this.status === "running" || this.status === "queued";
    this.desk = el._desk || null;
    this.speed = (this.hot ? 20 : 15) + Math.random() * 8;
    this.x = home.x; this.y = home.y;
    this.tx = this.x; this.ty = this.y;
    this.dir = Math.random() < .5 ? 1 : -1;
    this.moving = false; this.seated = true; this.atHome = true;
    this.wait = Math.random() * 2.5;
    this.last = -1;
    this.sit();
    this.paint();
  }
  paint() {
    this.el.style.transform = `translate(${this.x}px,${this.y}px)`;
    this.in.style.transform = `scaleX(${this.dir})`;
  }
  spots() {
    const w = Math.max(0, this.host.clientWidth - 13), h = Math.max(0, this.host.clientHeight - 21);
    return [[.10, .78], [.34, .90], [.60, .90], [.84, .78], [.50, .46], [.12, .50], [.74, .52]]
      .map(([a, b]) => ({ x: Math.round(a * w), y: Math.round(b * h) }));
  }
  pick() {
    const sp = this.spots();
    let i = this.last;
    while (i === this.last && sp.length > 1) i = Math.floor(Math.random() * sp.length);
    this.last = i;
    return sp[i];
  }
  sit() {
    this.seated = true; this.moving = false;
    this.el.classList.remove("walking");
    this.el.classList.add("seat");
    this.el.classList.toggle("typing", this.hot);
    if (this.desk) this.desk.dataset.busy = this.hot ? "1" : "0";
  }
  stand() {
    this.seated = false;
    this.el.classList.remove("seat", "typing");
    if (this.desk) this.desk.dataset.busy = "0";
  }
  walk(pt) {
    this.stand();
    this.tx = pt.x; this.ty = pt.y;
    this.atHome = Math.abs(pt.x - this.home.x) < 2 && Math.abs(pt.y - this.home.y) < 2;
    this.moving = true;
    this.el.classList.add("walking");
  }
  decide() {
    const r = Math.random();
    if (this.hot) {                                  // busy: mostly seated, occasionally up for a few steps
      if (this.seated) {
        if (r < .18) this.walk(this.pick());
        else { this.wait = 3 + Math.random() * 7; this.el.classList.toggle("typing", r < .82); }
      } else this.walk(this.home);
    } else {                                         // idle: wander, sit back down when tired
      if (this.seated) {
        if (r < .7) this.walk(this.pick());
        else this.wait = 4 + Math.random() * 9;
      } else if (r < .45) this.walk(this.home);
      else this.walk(this.pick());
    }
  }
  step(dt) {
    if (this.moving) {
      const dx = this.tx - this.x, dy = this.ty - this.y;
      const d = Math.hypot(dx, dy), v = this.speed * dt;
      if (d <= v + .2) {
        this.x = this.tx; this.y = this.ty; this.moving = false;
        this.el.classList.remove("walking");
        if (this.atHome) this.sit();
        else this.el.classList.remove("seat");
        this.wait = this.hot ? (1.2 + Math.random() * 2.4) : (1.8 + Math.random() * 4.5);
      } else {
        this.x += dx / d * v; this.y += dy / d * v;
        if (Math.abs(dx) > .4) this.dir = dx > 0 ? 1 : -1;
      }
      this.paint();
    } else {
      this.wait -= dt;
      if (this.wait <= 0) this.decide();
    }
  }
}

const OFFICE_CORR_SPOTS = [[.05, .5], [.30, .5], [.52, .5], [.74, .5], [.90, .5]];
const OFFICE_SKINS = ["#E8C7A8", "#DDB28C", "#C99A76", "#B98560"];   // Four skin tones
const offSkin = (m) => OFFICE_SKINS[Math.abs(offHash(m.assistant_id || m.name || "x")) % OFFICE_SKINS.length];
const offHair = (m) => Math.abs(offHash((m.assistant_id || m.name || "x") + "#h")) % 3;
function offHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

/* fixed desk positions, each person placed at their own */
function officeSit() {
  cancelAnimationFrame(officeRAF);
  officeWalkers = [];
  document.querySelectorAll(".tof-sheet .tof-room .tof-floor").forEach((floor) => {
    const desks = [...floor.querySelectorAll(".tof-desk")];
    const figs = [...floor.querySelectorAll(".tof-fig")];
    const W = floor.clientWidth, H = floor.clientHeight;
    const n = desks.length;
    // sizes come from CSS; only half-width and half-height offsets are computed here
    const em = parseFloat(getComputedStyle(floor).fontSize) || 8.0;
    const DW = 10 * em, DH = 4.78 * em, FW = 2.83 * em, FH = 4.57 * em;
    // 2×2 grid, four desks per room, filled from the top left
    const PAD_T = 54, PAD_B = 26;                 // Height taken by room title / bottom ticker
    const gw = W / 2, gh = Math.max(1, (H - PAD_T - PAD_B) / 2);
    desks.forEach((d, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const cx = gw * (col + .5), cy = PAD_T + gh * (row + .5);
      d.style.left = Math.max(2, Math.round(cx - DW / 2)) + "px";
      d.style.top = Math.max(2, Math.round(cy - DH / 2)) + "px";
    });
    figs.forEach((el, i) => {
      const d = desks[i] || desks[desks.length - 1];
      const home = d
        ? { x: parseFloat(d.style.left) + DW / 2 - FW / 2, y: parseFloat(d.style.top) + DH - FH * .28 }
        : { x: W * .5, y: H * .5 };
      el._desk = d;
      officeWalkers.push(new OfficeWalker(el, floor, home, el.dataset.status));
    });
  });
  const corr = document.querySelector(".tof-corr");
  if (corr) corr.querySelectorAll(".tof-fig").forEach((el) => {
    const W = corr.clientWidth;
    officeWalkers.push(new OfficeWalker(el, corr, { x: Math.round(W * .5), y: 8 }, "running"));
  });
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;                                // less motion: everyone sits at their desk, no walking
  let last = performance.now();
  const tick = (now) => {
    if (!document.querySelector(".tof-sheet")) return;
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    for (const w of officeWalkers) w.step(dt);
    officeRAF = requestAnimationFrame(tick);
  };
  officeRAF = requestAnimationFrame(tick);
}

/* ---------- Rendering ---------- */
function officeRoom(p, colorOf) {
  const members = [p.leader, ...(p.members || [])].filter(Boolean).slice(0, 4);   // 2×2 grid = 4 workstations
  const running = [p.leader,...(p.members || [])].filter(Boolean).some((m) => m.status === "running" || m.status === "queued");
  const figs = members.map((m) => `<div class="tof-fig ${m.status === "running" || m.status === "queued" ? "sel act-run" : ""}" data-status="${offEsc(m.status || "idle")}"
      data-hair="${offHair(m)}" style="--c:${colorOf(m)};--skin:${offSkin(m)}" title="${offEsc(m.name)} · ${OFFICE_CN[m.status] || m.status}">
      <span class="tag"><i class="tag-dot" style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${m.status==='running'?'var(--accent,#4ade80)':m.status==='queued'?'#eab308':'var(--muted)'};margin-right:3px;vertical-align:middle"></i>${offEsc(m.name)}</span>
      <span class="in"><i class="h"></i><i class="b"></i><i class="a1"></i><i class="a2"></i><i class="l1"></i><i class="l2"></i></span></div>`).join("");
  const desks = members.map((m) => `<div class="tof-desk" title="${offEsc(m.name)} desk">
      <span class="mon"></span><span class="kb"></span><span class="cup"></span><span class="pp"></span>
    </div>`).join("");
  const ev = (p.events || [])[0];
  let actHtml = "No work assigned here yet";
  if (p.active_task) {
    const actM = p.active_task.member_name || "Members";
    const actT = p.active_task.title || "Task";
    const actSt = p.active_task.status === "running" ? "Running" : "Queued";
    actHtml = `⚡ <b>“${offEsc(actM)}"</b>${actSt}“${offEsc(actT)}"`;
  } else if (ev) {
    actHtml = offEsc(offAgo(ev.at)) + " · " + offEsc(ev.text || "");
  }
  return `<div class="tof-room ${p.kind === "temp" ? "temp " : ""}${p.id === officeSel ? "sel" : ""}" data-office="${offEsc(p.id)}">
    <div class="nm">${offEsc(p.name)}</div>
    <div class="kind ${p.kind === "temp" ? "t" : ""}">${p.kind === "temp" ? "Rush" : "Standing"} · ${members.length} people</div>
    <div class="st ${running ? "run" : ""}"><span class="dot"></span>${running ? "Running" : "Standing by"}</div>
    <div class="tof-floor">${desks}${figs}</div>
    <div class="act"><span>${actHtml}</span></div>
  </div>`;
}

function officePanel(p, colorOf) {
  if (!p) return `<div class="tof-pd"><p class="hint">No office selected on this floor.</p></div>`;
  const lead = p.leader, ms = p.members || [];
  const row = (m, isLead) => {
    const c = colorOf(m);
    const st = m.status || "idle";
    const isSteward = isLead && (m.name === "Assistant" || m.assistant_id === "builtin-steward");
    const av = isSteward
      ? `<div class="av av-lead" title="Assistant · Auto-coordinate"><img src="../mark.png" alt="scholar"></div>`
      : `<div class="av" style="${offTint(c)}" title="${offEsc(m.name || "")}">${offEsc(m.avatar || (m.name || "?").slice(0, 1))}</div>`;
    return `<div class="tof-mrow">
      ${av}
      <div class="mc"><b>${offEsc(m.name)}<u>${offEsc((m.assistant_id || m.id || "").slice(-4))}</u></b>
        <i>${offEsc(m.prompt || (m.model ? "Model " + m.model : "Follows the current model"))}</i></div>
      <span class="pill ${st === "running" || st === "queued" ? "run" : ""}">${isLead?"Lead · ":""}${OFFICE_CN[st]||st}</span>
    </div>`;
  };
  return `<div class="tof-pd">
    <div class="k"><span>Team structure</span><span>${ms.length} / ${Math.max(ms.length, 4)} in progress</span></div>
    <h2>${offEsc(p.name)}</h2>
    <div class="sub">${p.kind === "temp"
      ? "Rush · as ”" + offEsc(p.purpose || "some work") + "”assembled, working together as needed"
      : "Standing · The lead splits the work, experts research in parallel and deliver"}</div>
    <div class="gh"><span>Lead</span><span>Status</span></div>
    ${lead ? row(lead, true) : `<p class="hint" style="padding:8px 0">This room has no Leader (You can make any member the Leader). </p>`}
    <div class="gh"><span>Members</span><span>Colour is identity</span></div>
    ${ms.length ? ms.map((m) => row(m, false)).join("")
      : `<p class="hint" style="padding:8px 0">nobody is here yet -- Use edit team to pull people from your experts.</p>`}
    <div class="feed">
      <div class="fk"><span>Recent activity</span><span>${(p.events || []).length} items</span></div>
      ${(p.events || []).length
        ? p.events.map((e) => `<div class="fr"><u>${offEsc(offAgo(e.at))}</u><span>${offEsc(e.text)}</span></div>`).join("")
        : `<div class="fr"><span>Nothing has been sent to this room yet.</span></div>`}
    </div>
    <div class="to"><span>→</span><span>The team room is the running tasks and chats for this project on the research desk</span></div>
    <div class="ft">
      <button class="btn" id="tofEdit">Edit team</button>
      <button class="btn btn-primary" id="tofEnter">Enter the team room</button>
    </div>
  </div>`;
}

async function renderTeamOffice(m) {
  const ticket=++officeRenderSequence;
  cancelAnimationFrame(officeRAF);
  const pid = curTask || ((S.tasks || [])[0] || {}).id || "";
  if(pid&&!curTask){curTask=pid;localStorage.setItem('rw-task',pid);}
  if (!pid) {
    m.classList.add("tof-fill");
    m.innerHTML = `<div class="tof-empty"><b>Teams belong to projects</b>
      <p>Create a project first; teams and the office follow the project.</p>
      <button class="btn btn-primary" onclick="openTab('tasks')">Create a project</button></div>`;
    return;
  }
  m.classList.add("tof-fill");
  m.innerHTML='<div class="hint" role="status">Loading teams...</div>';
  let d;
  try { d = await api("/api/teams?project=" + encodeURIComponent(pid)); }
  catch (e) {
    if(ticket!==officeRenderSequence || route()!=='team' || curTask!==pid || !m.isConnected)return;
    m.innerHTML = `<div class="tof-empty"><b>The team could not be read</b><p>${offEsc(e.message)}</p></div>`;
    return;
  }
  if(ticket!==officeRenderSequence || route()!=='team' || curTask!==pid || !m.isConnected)return;
  const teams = d.teams || [];
  if (!teams.some((t) => t.id === officeSel)) officeSel = (teams[0] || {}).id || "";

  // colour by member order in the project; the same person keeps it across rooms
  const order = [];
  teams.forEach((t) => [t.leader, ...(t.members || [])].filter(Boolean).forEach((x) => {
    const key = x.assistant_id || x.name;
    if (!order.includes(key)) order.push(key);
  }));
  const colorOf = (x) => OFFICE_COLORS[Math.max(0, order.indexOf(x.assistant_id || x.name)) % OFFICE_COLORS.length];

  const fixed = teams.filter((t) => t.kind !== "temp");
  const temp = teams.filter((t) => t.kind === "temp");
  const project = (S.tasks || []).find((t) => t.id === pid) || {};
  const sel = teams.find((t) => t.id === officeSel) || teams[0];
  const vacancies = Math.max(0, 3 - temp.length);

  m.innerHTML = `<div class="tof">
    <header class="tof-head">
      <div><h2>Team</h2><p>${offEsc(project.title || "")} · Standing ${fixed.length} rooms / Rush ${temp.length}</p></div>
      <div class="tof-hd-r">
        <label class="tof-sel"><span>Project</span>
          <select id="tofProj">${(S.tasks || []).map((t) =>
            `<option value="${offEsc(t.id)}" ${t.id === pid ? "selected" : ""}>${offEsc(t.title)}</option>`).join("")}</select>
        </label>
        <button class="btn btn-primary" id="tofNew" ${vacancies?'':'disabled title="Rush teams are full; dismiss one you no longer use under edit team"'}>+ Assemble team</button>
      </div>
    </header>
    <div class="tof-body">
      <div class="tof-stage"><div class="tof-sheet" id="tofSheet">
        <div class="tof-row top" style="grid-template-columns:repeat(${Math.max(1, fixed.length)},1fr)">${fixed.map((p) => officeRoom(p, colorOf)).join("")}</div>
        <div class="tof-corr">
          <span>Corridor</span><i class="cl"></i>
          <div class="tof-fig butler" data-status="idle" data-hair="0" style="--c:var(--accent);--skin:${OFFICE_SKINS[0]}">
            <span class="in"><i class="h"></i><i class="b"></i><i class="a1"></i><i class="a2"></i><i class="l1"></i><i class="l2"></i></span></div>
        </div>
        <div class="tof-row bottom">${temp.map((p) => officeRoom(p, colorOf)).join("")}
          ${Array.from({ length: vacancies }).map(() => `<div class="tof-room vacant"><span>Empty desk</span></div>`).join("")}
        </div>
      </div></div>
      <aside class="tof-panel" id="tofPanel">${officePanel(sel, colorOf)}</aside>
    </div>
  </div>`;

  m.querySelectorAll(".tof-room[data-office]").forEach((el) => {
    el.onclick = () => {
      officeSel = el.dataset.office;
      m.querySelectorAll(".tof-room").forEach((x) => x.classList.toggle("sel", x === el));
      const p = teams.find((t) => t.id === officeSel);
      $("tofPanel").innerHTML = officePanel(p, colorOf);
      bindPanel();
    };
  });
  const bindPanel = () => {
    const ed = $("tofEdit"), en = $("tofEnter"), cl = $("tofClose");
    if (ed) ed.onclick = () => { teamScope=officeSel;teamSession='';teamList=null;localStorage.setItem('rw-team-chat',teamScope);window.__teamMode = "manage"; render(); };
    if (en) en.onclick = () => officeEnter(pid,officeSel);
    if (cl) cl.onclick = () => { window.__teamMode = ""; render(); };
  };
  bindPanel();
  const pj = $("tofProj");
  if (pj) pj.onchange = (e) => {
    curTask = e.target.value || null;
    if (curTask) localStorage.setItem("rw-task", curTask); else localStorage.removeItem("rw-task");
    officeSel = ""; render();
  };
  const nw = $("tofNew");
  if (nw) nw.onclick = () => officeForm(pid);
  officeSit();
}

function officeEnter(pid,teamId=officeSel) {
  if (pid) { curTask = pid; localStorage.setItem("rw-task", pid); }
  teamScope=teamId;teamList=null;teamData=null;teamSession='';
  localStorage.setItem('rw-team-chat',teamScope);
  window.__teamMode = "chat";
  return openTab('team');
}

/* manual team building (the Assistant can also use the team_form tool) */
function officeForm(pid) {
  const pool = (S.assistants || []).filter((a) => a.enabled !== 0);
  const box = document.createElement("div");
  box.className = "tof-mask";
  box.innerHTML = `<div class="tof-modal">
    <h3>assemble a rush team</h3>
    <p class="hint">Say why the team exists and what it owes; members come from your experts. Dismiss it under edit team and the desk returns.</p>
    <label class="fld"><span>why the team exists</span><input class="control" id="tofPurpose" placeholder="e.g. the first 3 figure for the chapter; deliver three comparison figures"></label>
    <div class="fld"><span>who to bring in</span>
      <div class="tof-pool">${pool.map((a) => `<label class="pick"><input type="checkbox" value="${offEsc(a.id)}">
        <b>${offEsc(a.name)}</b><small>${offEsc(a.description || "").slice(0, 26)}</small></label>`).join("")}</div></div>
    <div class="row"><button class="btn" id="tofCancel">Cancel</button><button class="btn btn-primary" id="tofOk">Assemble team</button></div>
  </div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  box.querySelector("#tofCancel").onclick = close;
  box.onclick = (e) => { if (e.target === box) close(); };
  box.querySelector("#tofOk").onclick = async () => {
    const purpose = box.querySelector("#tofPurpose").value.trim();
    const ids = [...box.querySelectorAll(".pick input:checked")].map((x) => x.value);
    if (!purpose) return uiNotify("Explain why you are forming it");
    if (!ids.length) return uiNotify("Nobody was picked");
    try {
      const r = await api("/api/teams/new", { kind: "temp", name: purpose.slice(0, 24), purpose, project: pid });
      for (const id of ids) await api("/api/team/chat/member", { scope: r.team.id, assistant_id: id });
      officeSel = r.team.id;
      close(); render();
    } catch (e) { uiNotify(e.message); }
  };
}
