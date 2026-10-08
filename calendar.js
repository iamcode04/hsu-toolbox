// Uses startTodo, todoSync, todoSyncListeners, TODO_ICONS and formatTodoDate from todo.js and createDeadlineBadge from deadline.js
// (loaded before this file); the deadlines are todo.js's "todoCache".
const CAL_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const CAL_CHIPS = 2;
// [colour on light backgrounds, colour on dark backgrounds]:
// red for what is still to do, green for a finished assignment on its due day, grey for the day it was handed in
const CAL_TONES = {
  todo: ["#b91c1c", "#fca5a5"],
  done: ["#15803d", "#86efac"],
  handIn: ["#52525b", "#a1a1aa"],
};

// Solar icon set by 480 Design (CC BY 4.0)
const CAL_ICONS = {
  calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12c0-3.771 0-5.657 1.172-6.828S6.229 4 10 4h4c3.771 0 5.657 0 6.828 1.172S22 8.229 22 12v2c0 3.771 0 5.657-1.172 6.828S17.771 22 14 22h-4c-3.771 0-5.657 0-6.828-1.172S2 17.771 2 14z"/><path stroke-linecap="round" d="M7 4V2.5M17 4V2.5M2.5 9h19"/></g></svg>`,
  prev: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m15 5l-6 7l6 7"/></svg>`,
  next: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m9 5l6 7l-6 7"/></svg>`,
};

let calMonth = null;
let calSelected = null;
let calCache = null;
let calOpenWhenSynced = false;

function calKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isMidnight(ms) {
  const date = new Date(ms);
  return date.getHours() === 0 && date.getMinutes() === 0;
}

// A 00:00 deadline is really the end of the day before, so it is filed there as 24:00.
function calDueDay(ms) {
  return new Date(isMidnight(ms) ? ms - 1 : ms);
}

function calClock(ms) {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function calTime(ms) {
  return isMidnight(ms) ? "24:00" : calClock(ms);
}

// The cache belongs to whoever was logged in when it was written (shared PCs), like in todo.js.
function readCalCache(cache) {
  const user = document.querySelector("nav.navbar .user_department")?.textContent.trim();
  return cache && cache.user === user ? cache : null;
}

// Names come from the dashboard's course list (title text only, without the "NEW" label), then from the cache.
function getCalNames() {
  const names = new Map();
  for (const link of document.querySelectorAll(".course_lists a.course_link")) {
    if (link.querySelector(".label-course")?.textContent.trim() === "커뮤니티") continue;
    const id = link.getAttribute("href").match(/id=(\d+)/)?.[1];
    if (id) names.set(id, link.querySelector("h3")?.firstChild?.textContent.trim() || "");
  }
  for (const [id, name] of Object.entries(calCache?.names || {})) {
    if (!names.has(id)) names.set(id, name);
  }
  return names;
}

function calTint(hex, alpha) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function paintCalTone(el, tone) {
  const [light, dark] = CAL_TONES[tone];
  el.style.setProperty("--tb-cal-c", light);
  el.style.setProperty("--tb-cal-bg", calTint(light, 0.09));
  el.style.setProperty("--tb-cal-c-dark", dark);
  el.style.setProperty("--tb-cal-bg-dark", calTint(dark, 0.16));
}

// A submitted assignment shows up twice: as "제출 완료" on its due day, and as a hand-in on the day it was submitted.
// Within a day: what is still to do first, then hand-ins, then finished due items.
function getCalEvents() {
  const events = new Map();
  const add = (date, event) => {
    const key = calKey(date);
    if (!events.has(key)) events.set(key, []);
    events.get(key).push(event);
  };
  for (const [courseId, todos] of Object.entries(calCache?.todos || {})) {
    if (!Array.isArray(todos)) continue;
    for (const todo of todos) {
      if (todo.end) add(calDueDay(todo.end), { ...todo, courseId, rank: todo.done ? 2 : 0, at: todo.end });
      if (todo.submitted) add(new Date(todo.submitted), { ...todo, courseId, handIn: true, rank: 1, at: todo.submitted });
    }
  }
  for (const list of events.values()) list.sort((a, b) => a.rank - b.rank || a.at - b.at);
  return events;
}

function calTone(event) {
  return event.handIn ? "handIn" : event.done ? "done" : "todo";
}

function calIcon(event) {
  return event.handIn ? TODO_ICONS.clear : TODO_ICONS[event.kind];
}

// only work still to do fades once its deadline has passed
function isCalPast(event) {
  return !event.done && event.end < Date.now();
}

function createCalendarButton() {
  const anchor = document.getElementById("mycourse-type");
  if (!anchor || document.getElementById("tb-cal-btn")) return;

  const btn = document.createElement("button");
  btn.id = "tb-cal-btn";
  btn.type = "button";
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `<span class="tb-cal-btn-icon">${CAL_ICONS.calendar}</span>과제 달력`;
  btn.addEventListener("click", toggleCalendar);
  (document.getElementById("tb-watch-btn") || anchor).after(btn);
  trackTone(btn);
  todoSyncListeners.add(showCalSync);
  showCalSync(todoSync);
}

// While todo.js reads e-class, a ring next to the button shows how far it got; the calendar waits for it to finish.
function showCalSync(sync) {
  const btn = document.getElementById("tb-cal-btn");
  if (!btn || !sync) return;
  btn.classList.toggle("is-syncing", !sync.finished);
  btn.title = sync.finished ? "" : "동기화가 끝나면 달력이 열려요";

  let meter = document.getElementById("tb-cal-sync");
  // a sync with nothing to read finishes without ever showing the meter
  if (!sync.finished || meter) {
    if (!meter) {
      meter = document.createElement("span");
      meter.id = "tb-cal-sync";
      meter.setAttribute("role", "progressbar");
      meter.setAttribute("aria-label", "과제 달력 동기화");
      meter.setAttribute("aria-valuemin", "0");
      meter.setAttribute("aria-valuemax", "100");
      meter.innerHTML = `<span class="tb-cal-sync-ring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="tb-cal-sync-track" cx="18" cy="18" r="14"/><circle class="tb-cal-sync-fill" cx="18" cy="18" r="14" pathLength="100"/></svg></span><b></b><span class="tb-cal-sync-note"></span>`;
      btn.after(meter);
      trackTone(meter);
    }
    const percent = sync.total ? Math.floor((sync.done / sync.total) * 100) : 100;
    meter.setAttribute("aria-valuenow", percent);
    meter.querySelector(".tb-cal-sync-fill").style.strokeDasharray = `${percent} 100`;
    meter.querySelector("b").textContent = sync.finished ? "동기화 완료" : `${percent}%`;
    meter.querySelector(".tb-cal-sync-note").textContent = sync.finished ? "" : `동기화 중 · ${Math.floor(sync.done)}/${sync.total} 과목`;
    meter.classList.toggle("is-done", sync.finished);
    if (sync.finished) {
      setTimeout(() => meter.classList.add("is-leaving"), 1200);
      setTimeout(() => meter.remove(), 1600);
    }
  }

  if (sync.finished && calOpenWhenSynced) {
    calOpenWhenSynced = false;
    toggleCalendar();
  }
}

function toggleCalendar() {
  const btn = document.getElementById("tb-cal-btn");
  const open = document.getElementById("tb-cal");
  if (open) {
    open.remove();
    btn.setAttribute("aria-expanded", "false");
    return;
  }
  // The calendar only shows synced data: a click before that opens it as soon as the sync is done.
  if (!todoSync?.finished) {
    calOpenWhenSynced = true;
    // starts the sync even while 할 일 개수 and 미시청 영상 are switched off
    startTodo();
    return;
  }

  const now = new Date();
  calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  calSelected = calKey(now);
  const panel = document.createElement("section");
  panel.id = "tb-cal";
  panel.setAttribute("aria-label", "과제 달력");
  panel.addEventListener("click", onCalendarClick);
  (btn.closest(".course_semester") || btn.parentElement).after(panel);
  btn.setAttribute("aria-expanded", "true");
  trackTone(panel);
  renderCalendar();

  chrome.storage.local.get("todoCache", (result) => {
    calCache = readCalCache(result.todoCache);
    renderCalendar();
  });
}

function onCalendarClick(e) {
  const move = e.target.closest("[data-move]");
  const day = e.target.closest("[data-date]");
  if (move) {
    const step = Number(move.dataset.move);
    const now = new Date();
    calMonth = step ? new Date(calMonth.getFullYear(), calMonth.getMonth() + step, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
    if (!step) calSelected = calKey(now);
  } else if (day) {
    const [year, month] = day.dataset.date.split("-").map(Number);
    calSelected = day.dataset.date;
    calMonth = new Date(year, month - 1, 1);
  } else {
    return;
  }
  renderCalendar();
}

function createCalChip(event) {
  const chip = document.createElement("span");
  chip.className = `tb-cal-chip tb-cal-${event.kind}`;
  chip.classList.toggle("is-past", isCalPast(event));
  chip.innerHTML = `${calIcon(event)}<span></span>`;
  chip.lastChild.textContent = event.title;
  paintCalTone(chip, calTone(event));
  return chip;
}

function renderCalendar() {
  const panel = document.getElementById("tb-cal");
  if (!panel) return;
  const events = getCalEvents();
  const names = getCalNames();
  const today = calKey(new Date());
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const offset = calMonth.getDay();
  const weeks = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7);

  panel.innerHTML = `
    <div class="tb-cal-core">
      <div class="tb-cal-head">
        <div>
          <span class="tb-cal-eyebrow">과제·영상 마감과 제출</span>
          <div class="tb-cal-month">${year}년 ${month + 1}월</div>
        </div>
        <div class="tb-cal-nav">
          <button type="button" data-move="-1" aria-label="이전 달">${CAL_ICONS.prev}</button>
          <button type="button" data-move="0" class="tb-cal-today">오늘</button>
          <button type="button" data-move="1" aria-label="다음 달">${CAL_ICONS.next}</button>
        </div>
      </div>
      <div class="tb-cal-legend"></div>
      <div class="tb-cal-grid">${CAL_WEEKDAYS.map((name) => `<span class="tb-cal-weekday">${name}</span>`).join("")}</div>
      <div class="tb-cal-detail"></div>
    </div>`;

  const legend = panel.querySelector(".tb-cal-legend");
  for (const [tone, label] of [["todo", "미제출·미시청"], ["done", "제출 완료"], ["handIn", "제출한 날"]]) {
    const item = document.createElement("span");
    item.className = "tb-cal-legend-item";
    item.textContent = label;
    paintCalTone(item, tone);
    legend.append(item);
  }

  const grid = panel.querySelector(".tb-cal-grid");
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(year, month, 1 - offset + i);
    const key = calKey(date);
    const list = events.get(key) || [];
    const day = document.createElement("button");
    day.type = "button";
    day.className = "tb-cal-day";
    day.dataset.date = key;
    day.classList.toggle("is-other", date.getMonth() !== month);
    day.classList.toggle("is-today", key === today);
    day.classList.toggle("is-selected", key === calSelected);
    day.setAttribute("aria-label", `${date.getMonth() + 1}월 ${date.getDate()}일, 일정 ${list.length}개`);

    const num = document.createElement("span");
    num.className = `tb-cal-num${date.getDay() === 0 ? " is-sun" : date.getDay() === 6 ? " is-sat" : ""}`;
    num.textContent = date.getDate();
    day.append(num, ...list.slice(0, CAL_CHIPS).map(createCalChip));
    if (list.length > CAL_CHIPS) {
      const more = document.createElement("span");
      more.className = "tb-cal-more";
      more.textContent = `+${list.length - CAL_CHIPS}`;
      day.append(more);
    }
    grid.append(day);
  }

  renderCalendarDetail(panel.querySelector(".tb-cal-detail"), events.get(calSelected) || [], names);
}

// "10/8 24:00": a due date written the way the calendar files it
function calDueDate(ms) {
  const day = calDueDay(ms);
  return `${day.getMonth() + 1}/${day.getDate()} ${calTime(ms)}`;
}

function renderCalendarDetail(detail, list, names) {
  const [year, month, day] = calSelected.split("-").map(Number);
  const head = document.createElement("div");
  head.className = "tb-cal-detail-head";
  head.textContent = `${month}월 ${day}일 ${CAL_WEEKDAYS[new Date(year, month - 1, day).getDay()]}요일`;
  detail.append(head);

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "tb-cal-empty";
    empty.textContent = calCache ? "이날은 마감이나 제출한 과제가 없어요." : "과제·영상 마감을 불러오는 중이에요…";
    detail.append(empty);
    return;
  }

  for (const event of list) {
    // assignments link to their own page
    const row = document.createElement(event.kind === "assign" && event.cmid ? "a" : "div");
    if (row.tagName === "A") row.href = `/mod/assign/view.php?id=${event.cmid}`;
    row.className = `tb-cal-row tb-cal-${event.kind}`;
    row.classList.toggle("is-past", isCalPast(event));
    row.innerHTML = `<span class="tb-cal-row-icon">${calIcon(event)}</span><span class="tb-cal-row-text"><span class="tb-cal-row-title"></span><span class="tb-cal-row-course"></span></span><span class="tb-cal-row-due"></span>`;
    row.querySelector(".tb-cal-row-title").textContent = event.title;

    // each entry of a submitted assignment points at the other one's date
    const other = event.handIn ? event.end && `${calDueDate(event.end)} 마감` : event.submitted && `${formatTodoDate(event.submitted)} 제출`;
    row.querySelector(".tb-cal-row-course").textContent = [event.kind === "assign" ? "과제" : "영상", names.get(event.courseId), other]
      .filter(Boolean)
      .join(" · ");

    const due = row.querySelector(".tb-cal-row-due");
    if (event.handIn) {
      due.textContent = `${calClock(event.submitted)} 제출`;
    } else if (event.done) {
      due.append(createDeadlineBadge({ done: true, doneText: "제출 완료" }), `${calTime(event.end)} 마감`);
    } else if (isCalPast(event)) {
      due.textContent = "마감 지남";
    } else {
      due.append(createDeadlineBadge({ start: event.start, end: event.end }), `${calTime(event.end)} 마감`);
    }
    paintCalTone(row, calTone(event));
    detail.append(row);
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.todoCache || !document.getElementById("tb-cal")) return;
  calCache = readCalCache(changes.todoCache.newValue);
  renderCalendar();
});

document.addEventListener("DOMContentLoaded", createCalendarButton);
