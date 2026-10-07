// Uses startTodo and TODO_ICONS from todo.js (loaded before this file); the deadlines are todo.js's "todoCache".
const CAL_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const CAL_CHIPS = 2;
// [colour on light backgrounds, colour on dark backgrounds], handed out in course-list order
const CAL_COURSE_COLORS = [
  ["#1d4ed8", "#93c5fd"],
  ["#c2410c", "#fdba74"],
  ["#15803d", "#86efac"],
  ["#a21caf", "#f0abfc"],
  ["#0e7490", "#67e8f9"],
  ["#b91c1c", "#fca5a5"],
  ["#6d28d9", "#c4b5fd"],
  ["#a16207", "#fcd34d"],
  ["#be185d", "#f9a8d4"],
  ["#4d7c0f", "#bef264"],
];

// Solar icon set by 480 Design (CC BY 4.0)
const CAL_ICONS = {
  calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12c0-3.771 0-5.657 1.172-6.828S6.229 4 10 4h4c3.771 0 5.657 0 6.828 1.172S22 8.229 22 12v2c0 3.771 0 5.657-1.172 6.828S17.771 22 14 22h-4c-3.771 0-5.657 0-6.828-1.172S2 17.771 2 14z"/><path stroke-linecap="round" d="M7 4V2.5M17 4V2.5M2.5 9h19"/></g></svg>`,
  prev: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m15 5l-6 7l6 7"/></svg>`,
  next: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m9 5l6 7l-6 7"/></svg>`,
};

let calMonth = null;
let calSelected = null;
let calCache = null;

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

function calTime(ms) {
  if (isMidnight(ms)) return "24:00";
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// The cache belongs to whoever was logged in when it was written (shared PCs), like in todo.js.
function readCalCache(cache) {
  const user = document.querySelector("nav.navbar .user_department")?.textContent.trim();
  return cache && cache.user === user ? cache : null;
}

// Colours follow the course list on the dashboard as it is right now, so reordering the courses reorders the colours.
// Names come from the same list (title text only, without the "NEW" label); courses only in the cache go last.
function getCalCourses() {
  const courses = new Map();
  const add = (id, name) => {
    if (!id || courses.has(id)) return;
    courses.set(id, { name: name || "", color: CAL_COURSE_COLORS[courses.size % CAL_COURSE_COLORS.length] });
  };
  for (const link of document.querySelectorAll(".course_lists a.course_link")) {
    if (link.querySelector(".label-course")?.textContent.trim() === "커뮤니티") continue;
    add(link.getAttribute("href").match(/id=(\d+)/)?.[1], link.querySelector("h3")?.firstChild?.textContent.trim());
  }
  for (const id of Object.keys(calCache?.todos || {})) add(id, calCache.names?.[id]);
  return courses;
}

function calTint(hex, alpha) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function paintCalCourse(el, color = CAL_COURSE_COLORS[0]) {
  el.style.setProperty("--tb-cal-c", color[0]);
  el.style.setProperty("--tb-cal-bg", calTint(color[0], 0.09));
  el.style.setProperty("--tb-cal-c-dark", color[1]);
  el.style.setProperty("--tb-cal-bg-dark", calTint(color[1], 0.16));
}

function getCalEvents() {
  const events = new Map();
  for (const [courseId, todos] of Object.entries(calCache?.todos || {})) {
    if (!Array.isArray(todos)) continue;
    for (const todo of todos) {
      const key = calKey(calDueDay(todo.end));
      if (!events.has(key)) events.set(key, []);
      events.get(key).push({ ...todo, courseId });
    }
  }
  for (const list of events.values()) list.sort((a, b) => a.end - b.end);
  return events;
}

function createCalendarButton() {
  const anchor = document.getElementById("mycourse-type");
  if (!anchor || document.getElementById("tb-cal-btn")) return;

  const btn = document.createElement("button");
  btn.id = "tb-cal-btn";
  btn.type = "button";
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `<span class="tb-cal-btn-icon">${CAL_ICONS.calendar}</span>달력`;
  btn.addEventListener("click", toggleCalendar);
  (document.getElementById("tb-watch-btn") || anchor).after(btn);
  trackTone(btn);
}

function toggleCalendar() {
  const btn = document.getElementById("tb-cal-btn");
  const open = document.getElementById("tb-cal");
  if (open) {
    open.remove();
    btn.setAttribute("aria-expanded", "false");
    return;
  }

  const now = new Date();
  calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  calSelected = calKey(now);
  const panel = document.createElement("section");
  panel.id = "tb-cal";
  panel.setAttribute("aria-label", "마감 달력");
  panel.addEventListener("click", onCalendarClick);
  (btn.closest(".course_semester") || btn.parentElement).after(panel);
  btn.setAttribute("aria-expanded", "true");
  trackTone(panel);
  renderCalendar();

  chrome.storage.local.get("todoCache", (result) => {
    calCache = readCalCache(result.todoCache);
    renderCalendar();
  });
  // fills or refreshes the cache even while 할 일 개수 and 미시청 영상 are switched off
  startTodo();
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

function createCalChip(event, color) {
  const chip = document.createElement("span");
  chip.className = `tb-cal-chip tb-cal-${event.kind}`;
  chip.classList.toggle("is-past", event.end < Date.now());
  chip.innerHTML = `${TODO_ICONS[event.kind]}<span></span>`;
  chip.lastChild.textContent = event.title;
  paintCalCourse(chip, color);
  return chip;
}

function renderCalendar() {
  const panel = document.getElementById("tb-cal");
  if (!panel) return;
  const events = getCalEvents();
  const courses = getCalCourses();
  const today = calKey(new Date());
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const offset = calMonth.getDay();
  const weeks = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7);

  panel.innerHTML = `
    <div class="tb-cal-core">
      <div class="tb-cal-head">
        <div>
          <span class="tb-cal-eyebrow">남은 과제·영상 마감</span>
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
  for (const { name, color } of courses.values()) {
    if (!name) continue;
    const item = document.createElement("span");
    item.className = "tb-cal-legend-item";
    item.textContent = name;
    paintCalCourse(item, color);
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
    day.setAttribute("aria-label", `${date.getMonth() + 1}월 ${date.getDate()}일, 마감 ${list.length}개`);

    const num = document.createElement("span");
    num.className = `tb-cal-num${date.getDay() === 0 ? " is-sun" : date.getDay() === 6 ? " is-sat" : ""}`;
    num.textContent = date.getDate();
    day.append(num, ...list.slice(0, CAL_CHIPS).map((event) => createCalChip(event, courses.get(event.courseId)?.color)));
    if (list.length > CAL_CHIPS) {
      const more = document.createElement("span");
      more.className = "tb-cal-more";
      more.textContent = `+${list.length - CAL_CHIPS}`;
      day.append(more);
    }
    grid.append(day);
  }

  renderCalendarDetail(panel.querySelector(".tb-cal-detail"), events.get(calSelected) || [], courses);
}

function renderCalendarDetail(detail, list, courses) {
  const [year, month, day] = calSelected.split("-").map(Number);
  const head = document.createElement("div");
  head.className = "tb-cal-detail-head";
  head.textContent = `${month}월 ${day}일 ${CAL_WEEKDAYS[new Date(year, month - 1, day).getDay()]}요일`;
  detail.append(head);

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "tb-cal-empty";
    empty.textContent = calCache ? "이날 마감인 과제·영상이 없어요." : "과제·영상 마감을 불러오는 중이에요…";
    detail.append(empty);
    return;
  }

  for (const event of list) {
    const course = courses.get(event.courseId);
    const row = document.createElement("div");
    row.className = `tb-cal-row tb-cal-${event.kind}`;
    row.classList.toggle("is-past", event.end < Date.now());
    row.innerHTML = `<span class="tb-cal-row-icon">${TODO_ICONS[event.kind]}</span><span class="tb-cal-row-text"><span class="tb-cal-row-title"></span><span class="tb-cal-row-course"></span></span><span class="tb-cal-row-due"></span>`;
    row.querySelector(".tb-cal-row-title").textContent = event.title;
    row.querySelector(".tb-cal-row-course").textContent = `${event.kind === "assign" ? "과제" : "영상"}${course?.name ? ` · ${course.name}` : ""}`;
    row.querySelector(".tb-cal-row-due").textContent = event.end < Date.now() ? "마감 지남" : `${calTime(event.end)} 마감`;
    paintCalCourse(row, course?.color);
    detail.append(row);
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.todoCache || !document.getElementById("tb-cal")) return;
  calCache = readCalCache(changes.todoCache.newValue);
  renderCalendar();
});

document.addEventListener("DOMContentLoaded", createCalendarButton);
