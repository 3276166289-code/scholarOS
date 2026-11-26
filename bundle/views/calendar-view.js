let calY = new Date().getFullYear(), calM = new Date().getMonth();   // calM 0-11
let calSel = today();                                                // selected day (click a day on the left, it shows on the right)
let calPrefs = {lunar:false, solarTerms:false, festivals:false};   // The three switches in the calendar dialog; off by default — they print in Chinese
const CAL_TYPES = {mine:{color:"var(--accent)",label:"Schedule"},festival:{color:"#c2415d",label:"Holidays"},solarTerm:{color:"#27845f",label:"Solar terms"}};
const pad2 = n => String(n).padStart(2,"0");
const dkey = (y,m,d) => `${y}-${pad2(m+1)}-${pad2(d)}`;
const hhmm = t => String(t||"").replace("T"," ").slice(5,16);

function calendarDateInfo(dateKey){
  if(!window.Solar || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return {label:"",events:[]};
  try{
    const [y,mo,d] = dateKey.split("-").map(Number);
    const solar = window.Solar.fromYmd(y,mo,d), lunar = solar.getLunar();
    const term = calPrefs.solarTerms ? lunar.getJieQi() : "";
    const festivals = calPrefs.festivals ? [...solar.getFestivals(), ...lunar.getFestivals()].filter(Boolean) : [];
    let lunarLabel = "";
    if(calPrefs.lunar) lunarLabel = lunar.getDay() === 1 ? `${lunar.getMonthInChinese()} month` : lunar.getDayInChinese();
    return {label: term || festivals[0] || lunarLabel,
      events: [...(term?[{type:"solarTerm",label:term,computed:true}]:[]), ...[...new Set(festivals)].map(label=>({type:"festival",label,computed:true}))]};
  }catch(_){ return {label:"",events:[]}; }
}
function calEventsByDate(){
  const map = {};
  for(const e of S.events) (map[e.date] = map[e.date] || []).push({type:"mine",label:e.title,id:e.id,done:e.done});
  return map;
}
function calendarEntryHTML(e){
  const project=(S.tasks || []).find(t=>t.id===e.task_id);
  const status={TODO:"To-do",IN_PROGRESS:"Running",REVIEW:"Awaiting review",DONE:"Completed",scheduled:"Scheduled",running:"Running",completed:"Completed",failed:"Failed",blocked:"Blocked",canceled:"Cancelled",cancelled:"Stopped",awaiting_review:"Awaiting manual review",delivered:"Reviewed",rejected:"Returned",succeeded:"Completed"}[e.status] || e.status || "";
  return `<div class="check-item ${e.done?"done":""}"><input type="checkbox" data-chk="${esc(e.id)}" ${e.done?"checked":""} ${e.linked && !e.can_toggle?'disabled title="Open source processing to run or review it"':""}>${e.time?`<span class="check-time">${esc(e.time)}</span>`:""}
    <span class="check-title">${esc(e.title)}${e.linked?`<small style="display:block;color:var(--muted)">${esc(project?.title || "")} · ${esc(e.source_label)} · ${esc(status)}</small>`:""}</span>
    ${e.linked?`<button class="btn ghost" data-cal-open="${esc(e.id)}">${e.target_type==="note"?"Open note":e.source_type==="workflow_review" && e.is_pending?"Review node":"Open source"}</button>`:`<button class="check-del" data-del="${esc(e.id)}" title="Delete">✕</button>`}</div>`;
}
let calendarSearch='';
function renderCalendar(m){
  const y = calY, mo = calM, t0 = today();
  const lead = (new Date(y,mo,1).getDay()+6)%7;                       // Monday=0
  const daysIn = new Date(y,mo+1,0).getDate(), prevDays = new Date(y,mo,0).getDate();
  const cells = [];
  for(let i=lead-1;i>=0;i--) cells.push({d:prevDays-i,out:true,off:-1});
  for(let d=1;d<=daysIn;d++) cells.push({d,out:false,off:0});
  const trail = (7-(cells.length%7))%7;
  for(let d=1;d<=trail;d++) cells.push({d,out:true,off:1});
  const events = calEventsByDate();
  const grid = cells.map(c=>{
    const mm = mo+c.off, yy = y+Math.floor(mm/12), nm = ((mm%12)+12)%12;
    const key = dkey(yy,nm,c.d);
    const info = calendarDateInfo(key);
    const evs = [...(events[key]||[]), ...info.events];
    const dots = evs.slice(0,3).map(e=>`<i class="cal-dot" style="background:${CAL_TYPES[e.type].color}"></i>`).join("");
    const more = evs.length>3 ? `<i class="cal-more">+${evs.length-3}</i>` : "";
    const cls = ["cal-cell", c.out?"out":"", key===t0?"today":"", key===calSel?"selected":""].filter(Boolean).join(" ");
    return `<div class="${cls}" data-date="${key}" title="${esc(evs.map(e=>e.label).join("; "))}"><span class="cal-num">${c.d}</span>${info.label?`<span class="cal-lunar">${esc(info.label)}</span>`:""}<span class="cal-dots">${dots}${more}</span></div>`;
  }).join("");
  const selEvs = [...(events[calSel]||[]), ...calendarDateInfo(calSel).events];
  const dayItems = S.events.filter(e=>e.date===calSel)
    .sort((a,b)=> (a.time||"99:99").localeCompare(b.time||"99:99") || String(a.created_at).localeCompare(String(b.created_at)));   // sort by time of day, undated items last
  const now = new Date();
  const yearOpts = Array.from({length:11},(_,i)=>now.getFullYear()-5+i).map(v=>`<option value="${v}" ${v===y?"selected":""}>${v}</option>`).join("");
  const monthOpts = Array.from({length:12},(_,i)=>`<option value="${i}" ${i===mo?"selected":""}>${i+1}</option>`).join("");
  const doneEvs = S.events.filter(e=>e.done).sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||""))).slice(0,30);
  const soon = S.events.filter(e=>!e.done && e.is_pending!==false && e.date>=t0).sort((a,b)=>a.date.localeCompare(b.date));
  const DAY = 86400000, base = new Date(t0+"T00:00:00").getTime();

  m.innerHTML = `<div class="cal-page"><div class="cal-search"><input type="search" class="control" aria-label="Search all schedules" placeholder="Search schedules by name, date, or project..." value="${esc(calendarSearch)}" data-cal-search><div data-cal-search-results aria-live="polite"></div></div>
    <div class="cal-mid">
      <div class="cal-left">
      <div class="card cal-hello">
        <span class="hello-avatar" id="calHelloAvatar">${avatarInner()}</span><b id="calHelloText">${helloText()}</b></div>
      <div class="card">
        <div class="card-head"><b>📅 Research calendar</b>
          <div class="cal-nav">
            <button class="cal-nav-btn" id="calOptions" title="Calendar display">Calendar</button>
            <button class="cal-nav-btn" id="calPrev" title="Previous month">‹</button>
            <select id="calY" title="Choose year">${yearOpts}</select>
            <select id="calM" title="Choose month">${monthOpts}</select>
            <button class="cal-nav-btn" id="calNext" title="Next month">›</button>
            <button class="cal-nav-btn cal-today-btn" id="calToday">Today</button>
          </div>
          <div id="calOptionsPop" class="cal-pop hidden">
            <label><input type="checkbox" data-cal-pref="lunar" ${calPrefs.lunar?"checked":""}> Show lunar dates</label>
            <label><input type="checkbox" data-cal-pref="solarTerms" ${calPrefs.solarTerms?"checked":""}> Show the 24 solar terms</label>
            <label><input type="checkbox" data-cal-pref="festivals" ${calPrefs.festivals?"checked":""}> Show traditional and Gregorian holidays</label>
            <p>Festivals are not statutory holidays or make-up days.</p>
          </div>
        </div>
        <div class="cal-week"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span class="cal-we">Sat</span><span class="cal-we">Sun</span></div>
        <p class="hint" style="padding:0 14px">Project deadlines, the next scheduled run, output notes, and workflow reviews are added to the calendar automatically.</p>
        <div class="cal-grid">${grid}</div>
        <div class="cal-day-events"><div class="cal-day-head">📆 ${calSel===t0?"Today · ":""}${calSel}<span class="side-count">${selEvs.length} items</span></div></div>
      </div>
      </div>

      <div class="card">
        <div class="card-head"><b>☀ Today’s plan</b><span class="side-count">${calSel}</span></div>
        <div class="check-list">${dayItems.length ? dayItems.map(calendarEntryHTML).join("")
          : `<div class="hint">Nothing scheduled this day 🎉🎉🎉</div>`}</div>
        <div class="quick-add"><input id="todayInput" class="tb-input" placeholder="+ Add a task; press Enter to confirm..."><input id="todayTime" class="tb-input quick-time" type="time" title="Optional: the exact time of this entry"><button class="btn" id="btnTodayAdd">Add</button></div>
      </div>
    </div>

    <div class="cal-bottom">
      <div class="card">
        <div class="card-head"><b>📡 Task completion</b><span class="side-count">Generate automatically</span></div>
        <div class="feed-list">${doneEvs.length ? doneEvs.map(e=>`<div class="feed-item"><span class="feed-ico">✅</span><span class="feed-text">Complete task [${esc(e.title)}]</span>${e.linked?`<button class="btn ghost" data-cal-open="${esc(e.id)}">${e.target_type==="note"?"Open note":"Open source"}</button>`:""}<span class="feed-time">${hhmm(e.created_at)}</span></div>`).join("")
          : `<div class="hint">No finished tasks yet</div>`}</div>
      </div>
      <div class="card">
        <div class="card-head"><b>⏳ Countdown</b><span class="side-count">${soon.length} unfinished</span></div>
        <div class="countdown-list">${soon.length ? soon.map(e=>{
            const d = Math.round((new Date(e.date+"T00:00:00").getTime()-base)/DAY);
            return `<div class="countdown-item"><span class="countdown-days ${d<=3?"urgent":""}">${d===0?"Today":d+"d"}</span><span class="countdown-label">${esc(e.title)}</span><span class="side-count">${e.date.slice(5)}</span></div>`;
          }).join("") : `<div class="hint">No important nodes left unfinished</div>`}</div>
      </div>
    </div>
  </div>`;

  const search=m.querySelector('[data-cal-search]'),results=m.querySelector('[data-cal-search-results]');
  const searchEvents=()=>{
    calendarSearch=search.value;const query=calendarSearch.trim().toLowerCase();results.hidden=!query;
    if(!query){results.replaceChildren();return;}
    const matches=S.events.filter(event=>[event.title,event.date,event.project_title,event.kind].join(' ').toLowerCase().includes(query)).slice(0,100);
    results.innerHTML=matches.length?matches.map(event=>`<button type="button" class="cal-search-result" data-cal-result="${esc(event.id)}"><strong>${esc(event.title)}</strong><span>${esc(event.date)} ${esc(event.time||'')}</span></button>`).join(''):'<p class="hint">No matching schedules</p>';
    results.querySelectorAll('[data-cal-result]').forEach(button=>button.onclick=()=>{const event=S.events.find(item=>item.id===button.dataset.calResult);if(!event)return;calSel=event.date;const d=new Date(event.date+'T00:00:00');calY=d.getFullYear();calM=d.getMonth();calendarSearch='';render();});
  };
  search.oninput=searchEvents;searchEvents();
  $("calY").onchange = e=>{ calY = +e.target.value; render(); };
  $("calM").onchange = e=>{ calM = +e.target.value; render(); };
  $("calPrev").onclick = ()=>{ if(--calM<0){calM=11;calY--;} render(); };
  $("calNext").onclick = ()=>{ if(++calM>11){calM=0;calY++;} render(); };
  $("calToday").onclick = ()=>{ const n=new Date(); calY=n.getFullYear(); calM=n.getMonth(); calSel=today(); render(); };
  $("calOptions").onclick = ()=>$("calOptionsPop").classList.toggle("hidden");
  m.querySelectorAll("[data-cal-pref]").forEach(i=>i.onchange=()=>{ calPrefs[i.dataset.calPref]=i.checked; render(); });
  m.querySelectorAll(".cal-cell").forEach(c=>c.onclick=()=>{ const k=c.dataset.date; if(k===calSel) return; calSel=k; const n=new Date(k+"T00:00:00"); calY=n.getFullYear(); calM=n.getMonth(); render(); });
  m.querySelectorAll("[data-chk]").forEach(i=>i.onchange=async()=>{ await api("/api/calendar/toggle",{id:i.dataset.chk,done:i.checked}); await refreshState(); });
  m.querySelectorAll("[data-del]").forEach(b=>b.onclick=async(ev)=>{ ev.stopPropagation(); if(!await uiConfirm("Delete this one?")) return; await api("/api/calendar/delete",{id:b.dataset.del}); await refreshState(); });
  const add = async()=>{ const v=$("todayInput").value.trim(); if(!v) return;
    await api("/api/calendar/add",{title:v,date:calSel,task_id:curTask||null,kind:"todo",time:$("todayTime").value});
    $("todayInput").value=""; $("todayTime").value=""; await refreshState(); };
  $("btnTodayAdd").onclick = add;
  $("todayInput").onkeydown = e=>{ if(e.key==="Enter"){ e.preventDefault(); add(); } };
  $("todayTime").onkeydown = e=>{ if(e.key==="Enter"){ e.preventDefault(); add(); } };
}
