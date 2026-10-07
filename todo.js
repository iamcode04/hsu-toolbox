// Uses fetchDeadlineDoc and getAssignments from deadline.js (loaded before this file).
const TODO_CACHE_KEY = "todoCache";
const TODO_CACHE_MS = 30 * 60 * 1000;
const TODO_ASSIGN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Solar icon set by 480 Design (CC BY 4.0)
const TODO_ICONS = {
  assign: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path d="M3 10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H13C16.7712 2 18.6569 2 19.8284 3.17157C21 4.34315 21 6.22876 21 10V14C21 17.7712 21 19.6569 19.8284 20.8284C18.6569 22 16.7712 22 13 22H11C7.22876 22 5.34315 22 4.17157 20.8284C3 19.6569 3 17.7712 3 14V10Z"/><path d="M8 12H16"/><path d="M8 8H16"/><path d="M8 16H13"/></g></svg>`,
  video: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M15.4137 10.941C16.1954 11.4026 16.1954 12.5974 15.4137 13.059L10.6935 15.8458C9.93371 16.2944 9 15.7105 9 14.7868L9 9.21316C9 8.28947 9.93371 7.70561 10.6935 8.15419L15.4137 10.941Z"/></g></svg>`,
  clear: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path stroke-linejoin="round" d="M8.5 12.5L10.5 14.5L15.5 9.5"/></g></svg>`,
};

let todoStarted = false;

async function getVideoTodos(courseId) {
  const doc = await fetchDeadlineDoc(`/report/ubcompletion/progress.php?id=${courseId}`);
  const videos = [];
  for (const row of doc.querySelectorAll("table.user_progress_table tbody tr")) {
    const button = row.querySelector("button.track_detail");
    const cells = [...row.cells];
    const title = cells.findIndex((td) => td.classList.contains("text-left"));
    if (!button || title < 0 || cells[title + 2]?.textContent.trim() === "O") continue;
    videos.push({ kind: "video", title: cells[title].textContent.trim(), start: button.dataset.sterm * 1000, end: button.dataset.eterm * 1000 });
  }
  if (videos.length) {
    const ids = await getVodIds(courseId).catch(() => new Map());
    for (const video of videos) video.cmid = ids.get(video.title) ?? null;
  }
  return videos;
}

// The attendance page has no player id, so map titles to ids from the course's video list (used by watch.js to open the player).
async function getVodIds(courseId) {
  const doc = await fetchDeadlineDoc(`/mod/vod/index.php?id=${courseId}`);
  const ids = new Map();
  // links on this page are relative ("view.php?id=…")
  for (const link of doc.querySelectorAll('table.generaltable a[href*="view.php?id="]')) {
    ids.set(link.textContent.trim(), link.getAttribute("href").match(/id=(\d+)/)?.[1]);
  }
  return ids;
}

async function getCourseTodos(courseId) {
  const todos = await getVideoTodos(courseId).catch(() => []);
  for (const assignment of (await getAssignments(courseId).catch(() => new Map())).values()) {
    if (!assignment.done) todos.push({ kind: "assign", title: assignment.title, end: assignment.end.getTime() });
  }
  return todos;
}

function formatTodoDate(ms) {
  const date = new Date(ms);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function createTodoPart(kind, text) {
  const part = document.createElement("span");
  part.className = `tb-todo-part tb-todo-${kind}`;
  part.innerHTML = TODO_ICONS[kind];
  part.append(text);
  return part;
}

function openTodoTip(badge, items) {
  closeTodoTip();
  const tip = document.createElement("div");
  tip.id = "tb-todo-tip";
  tip.innerHTML = `<div class="tb-todo-tip-core"><span class="tb-todo-eyebrow">7일 안에 할 일</span></div>`;
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "tb-todo-tip-row";
    row.innerHTML = TODO_ICONS[item.kind];
    const title = document.createElement("span");
    title.className = "tb-todo-tip-title";
    title.textContent = item.title;
    const due = document.createElement("span");
    due.className = "tb-todo-tip-due";
    due.textContent = `${formatTodoDate(item.end)} 마감`;
    row.classList.add(`tb-todo-${item.kind}`);
    row.append(title, due);
    tip.firstElementChild.appendChild(row);
  }
  const rect = badge.getBoundingClientRect();
  tip.style.top = `${rect.bottom + 8}px`;
  tip.style.left = `${rect.left}px`;
  document.body.appendChild(tip);
}

function closeTodoTip() {
  document.getElementById("tb-todo-tip")?.remove();
}

function renderCourseTodos(badge, todos) {
  const now = Date.now();
  const assigns = todos.filter((t) => t.kind === "assign" && t.end > now && t.end - now <= TODO_ASSIGN_WINDOW_MS);
  const videos = todos.filter((t) => t.kind === "video" && t.start <= now && now <= t.end);

  const core = document.createElement("span");
  core.className = "tb-todo-core";
  badge.classList.remove("tb-todo-is-loading");
  if (!assigns.length && !videos.length) {
    badge.classList.add("tb-todo-is-clear");
    core.appendChild(createTodoPart("clear", "할 일 없음"));
    badge.replaceChildren(core);
    return;
  }

  if (assigns.length) core.appendChild(createTodoPart("assign", `과제 ${assigns.length}`));
  if (videos.length) core.appendChild(createTodoPart("video", `영상 ${videos.length}`));
  badge.replaceChildren(core);

  const items = [...assigns, ...videos].sort((a, b) => a.end - b.end);
  badge.addEventListener("mouseenter", () => openTodoTip(badge, items));
  badge.addEventListener("mouseleave", closeTodoTip);
}

function startTodo() {
  if (todoStarted) return;
  todoStarted = true;
  const courses = [...document.querySelectorAll(".course_lists a.course_link")]
    .filter((a) => a.querySelector(".label-course")?.textContent.trim() !== "커뮤니티")
    .map((a) => ({ id: a.getAttribute("href").match(/id=(\d+)/)?.[1], title: a.querySelector("h3") }))
    .filter((course) => course.id && course.title)
    .map((course) => ({ ...course, name: course.title.textContent.trim() }));
  if (!courses.length) return;

  courses.forEach((course, index) => {
    course.badge = document.createElement("span");
    course.badge.className = "tb-todo tb-todo-is-loading";
    course.badge.style.setProperty("--tb-todo-index", index);
    course.badge.innerHTML = `<span class="tb-todo-core">확인 중</span>`;
    course.title.appendChild(course.badge);
    trackTone(course.badge);
  });
  const user = document.querySelector("nav.navbar .user_department")?.textContent.trim();

  // One course at a time: e-class handles a user's requests one by one, so this keeps the user's own clicks from queuing behind ours.
  chrome.storage.local.get(TODO_CACHE_KEY, async (result) => {
    const cache = result[TODO_CACHE_KEY];
    const fresh = Boolean(cache) && cache.user === user && Date.now() - cache.time < TODO_CACHE_MS;
    const todos = fresh && !Array.isArray(cache.todos) ? cache.todos : {};
    const names = Object.fromEntries(courses.map((course) => [course.id, course.name]));
    let fetched = false;
    for (const course of courses) {
      // entries cached before video ids were stored lack "cmid"; refetch those
      if (!todos[course.id] || todos[course.id].some((t) => t.kind === "video" && !("cmid" in t))) {
        todos[course.id] = await getCourseTodos(course.id);
        fetched = true;
      }
      renderCourseTodos(course.badge, todos[course.id]);
    }
    if (fetched) chrome.storage.local.set({ [TODO_CACHE_KEY]: { user, time: fresh ? cache.time : Date.now(), todos, names } });
  });
}

// Like deadline.js: no page reads while both switches that use this data (할 일 개수, 미시청 영상) are off.
chrome.storage.local.get("toolbox", (result) => {
  if (result.toolbox?.todo === false && result.toolbox?.watch === false) return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startTodo);
  } else {
    startTodo();
  }
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.toolbox?.newValue?.todo || changes.toolbox?.newValue?.watch) startTodo();
});
