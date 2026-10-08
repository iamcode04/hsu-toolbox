const VIEWER_URL = "https://learn.hansung.ac.kr/mod/vod/viewer.php?id=";
// the size of the window the site opens for a video
const VIEWER_WIDTH = 1005;
const VIEWER_HEIGHT = 755;
// the size watch.js opens this list window at
const LIST_WIDTH = 400;
const LIST_HEIGHT = 640;
// what watch-player.js plays in this window: { mode: "auto" | "single", paused, queue, done }
const WATCH_SESSION_KEY = "watchSession";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Solar icon set by 480 Design (CC BY 4.0)
const ICONS = {
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.4086 9.35258C23.5305 10.5065 23.5305 13.4935 21.4086 14.6474L8.59662 21.6145C6.53435 22.736 4 21.2763 4 18.9671L4 5.0329C4 2.72368 6.53435 1.26402 8.59661 2.38548L21.4086 9.35258Z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path stroke-linejoin="round" d="M8.5 12.5L10.5 14.5L15.5 9.5"/></g></svg>`,
};

const app = document.getElementById("app");
let cache = null;

function getVideos() {
  const now = Date.now();
  const names = cache?.names || {};
  const videos = [];
  for (const [courseId, todos] of Object.entries(cache?.todos || {})) {
    if (!Array.isArray(todos)) continue;
    for (const t of todos) {
      if (t.kind === "video" && !t.done && t.cmid && t.start <= now && now <= t.end) {
        videos.push({ cmid: t.cmid, title: t.title, course: names[courseId] || "", end: t.end, seconds: t.seconds, length: t.length });
      }
    }
  }
  return videos.sort((a, b) => a.end - b.end);
}

function formatLeft(end) {
  const ms = end - Date.now();
  const minutes = Math.max(Math.floor(ms / 60000), 1);
  const text = minutes < 60 ? `${minutes}분` : ms < DAY_MS ? `${Math.floor(ms / HOUR_MS)}시간` : `${Math.floor(ms / DAY_MS)}일`;
  const state = ms < DAY_MS ? "urgent" : ms < 4 * DAY_MS ? "warn" : "normal";
  return { text: `${text} 남음`, state };
}

// "07:21", the way the course page writes a video's length
function formatClock(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function iconButton(className, icon, label, onClick) {
  const button = el("button", className);
  button.type = "button";
  button.innerHTML = `<span class="ic">${ICONS[icon]}</span>`;
  if (label) button.append(label);
  else button.setAttribute("aria-label", "재생");
  button.addEventListener("click", onClick);
  return button;
}

// The site's video page can't be framed (frame-ancestors 'self'), so this window grows to the site's video window size and
// becomes the video page; "#tb-watch" tells watch-player.js the page is ours.
// The queue goes course by course (courses in the order of their first deadline, each in deadline order), so 자동시청
// finishes a course before moving on; the earliest video still comes first.
function playInWindow(mode, videos, cmid) {
  const courses = [...new Set(videos.map((video) => video.course))];
  const queue = courses.flatMap((course) =>
    videos.filter((video) => video.course === course).map(({ cmid, title, course }) => ({ cmid, title, course }))
  );
  chrome.storage.local.set({ [WATCH_SESSION_KEY]: { mode, paused: false, queue, done: [] } }, () => {
    window.resizeBy(VIEWER_WIDTH - window.innerWidth, VIEWER_HEIGHT - window.innerHeight);
    location.href = `${VIEWER_URL}${cmid}#tb-watch`;
  });
}

// How much the report counts as studied, like the course page's bar (progress.js): replays count too, so it stops at 100%.
function createWatched({ seconds = 0, length }, index) {
  const ratio = Math.min(seconds / length, 1);
  const bar = el("div", "watched");
  bar.style.setProperty("--p", ratio);
  bar.style.setProperty("--i", index);
  bar.title = `학습 ${formatClock(seconds)} / 영상 ${formatClock(length)}`;
  const track = el("span", "track");
  track.append(el("span", "fill"));
  bar.append(track, el("span", "pct", `${Math.floor(ratio * 100)}%`), el("span", "time", `${formatClock(Math.min(seconds, length))} / ${formatClock(length)}`));
  return bar;
}

function createItem(video, index) {
  const item = el("div", "item");
  item.style.setProperty("--i", index);
  const text = el("div", "txt");
  text.append(el("div", "course", video.course), el("div", "name", video.title));
  item.append(text);
  return item;
}

function renderList() {
  const videos = getVideos();
  const head = el("div", "head");
  const title = el("h1", "title", cache ? `미시청 영상 ${videos.length}개` : "미시청 영상");
  head.append(title);
  if (videos.length) head.append(iconButton("cta", "play", "자동시청", () => playInWindow("auto", videos, videos[0].cmid)));
  app.append(el("span", "eyebrow", "지금 볼 수 있는 영상"), head);

  if (!cache) {
    app.append(el("p", "empty", "e-class 대시보드를 열면 목록을 불러와요."));
    return;
  }
  if (!videos.length) {
    const empty = el("div", "empty is-clear");
    empty.innerHTML = ICONS.check;
    empty.append("미시청 영상이 없어요");
    app.append(empty);
    return;
  }

  const shell = el("div", "shell");
  videos.forEach((video, index) => {
    const item = createItem(video, index);
    const left = formatLeft(video.end);
    item.firstChild.append(el("div", `due is-${left.state}`, left.text));
    if (video.length) item.firstChild.append(createWatched(video, index));
    item.append(iconButton("play", "play", "", () => playInWindow("single", videos, video.cmid)));
    shell.append(item);
  });
  app.append(shell, el("p", "foot", "재생하면 이 창에서 e-class 영상이 열려요. 위쪽에서 다른 영상으로 바로 넘어갈 수 있어요."));
}

function render() {
  app.replaceChildren();
  renderList();
}

// back from the video page (watch-player.js's home button): shrink to the list size again
if (location.hash === "#home") {
  window.resizeBy(LIST_WIDTH - window.innerWidth, LIST_HEIGHT - window.innerHeight);
  history.replaceState(null, "", location.pathname);
}

chrome.storage.local.get("todoCache", (result) => {
  cache = result.todoCache || null;
  render();
});

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.todoCache) return;
  cache = changes.todoCache.newValue || null;
  render();
});
