const VIEWER_URL = "https://learn.hansung.ac.kr/mod/vod/viewer.php?id=";
// same window the site opens for a video
const VIEWER_FEATURES =
  "width=1005,height=755,toolbar=no,location=no,menubar=no,copyhistory=no,status=no,directories=no,scrollbars=yes,resizable=yes";
const VIEWER_NAME = "tb-watch-player";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Solar icon set by 480 Design (CC BY 4.0)
const ICONS = {
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.4086 9.35258C23.5305 10.5065 23.5305 13.4935 21.4086 14.6474L8.59662 21.6145C6.53435 22.736 4 21.2763 4 18.9671L4 5.0329C4 2.72368 6.53435 1.26402 8.59661 2.38548L21.4086 9.35258Z"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path stroke-linejoin="round" d="M8.5 12.5L10.5 14.5L15.5 9.5"/></g></svg>`,
};

const app = document.getElementById("app");
let cache = null;
let auto = null;

function getVideos() {
  const now = Date.now();
  const names = cache?.names || {};
  const videos = [];
  for (const [courseId, todos] of Object.entries(cache?.todos || {})) {
    if (!Array.isArray(todos)) continue;
    for (const t of todos) {
      if (t.kind === "video" && t.cmid && t.start <= now && now <= t.end) {
        videos.push({ cmid: t.cmid, title: t.title, course: names[courseId] || "", end: t.end });
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

function openViewer(cmid) {
  window.open(VIEWER_URL + cmid, VIEWER_NAME, VIEWER_FEATURES);
}

function startAuto(videos) {
  const queue = videos.map(({ cmid, title, course }) => ({ cmid, title, course }));
  chrome.storage.local.set({ autoWatch: { active: true, queue, done: [], current: queue[0].cmid } }, () => openViewer(queue[0].cmid));
}

function stopAuto() {
  chrome.storage.local.set({ autoWatch: { ...auto, active: false } });
}

function playOne(cmid) {
  if (auto?.active) stopAuto();
  openViewer(cmid);
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
  if (videos.length) head.append(iconButton("cta", "play", "자동시청", () => startAuto(videos)));
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
    item.append(iconButton("play", "play", "", () => playOne(video.cmid)));
    shell.append(item);
  });
  app.append(shell, el("p", "foot", "재생하면 e-class 영상 창이 하나 열립니다. 한 번에 한 영상만 재생돼요."));
}

function renderAuto() {
  const total = auto.queue.length;
  const done = auto.done.length;
  const head = el("div", "head");
  head.append(el("h1", "title", `${Math.min(done + 1, total)} / ${total} 재생 중`), iconButton("cta is-stop", "stop", "중지", stopAuto));
  app.append(el("span", "eyebrow", "자동시청 중"), head);

  const progress = el("div", "progress");
  const fill = el("div", "fill");
  fill.style.transform = `scaleX(${done / total})`;
  const track = el("div", "track");
  track.append(fill);
  const meta = el("div", "meta");
  meta.append(el("span", "", `${done}개 끝남`), el("span", "", "끝나면 다음 영상으로 넘어가요"));
  progress.append(track, meta);

  const shell = el("div", "shell");
  auto.queue.forEach((video, index) => {
    const item = createItem(video, index);
    if (auto.done.includes(video.cmid)) {
      item.classList.add("is-done");
      item.firstChild.append(el("div", "due is-done", "✓ 다 봤어요"));
      const check = el("span", "play is-done");
      check.innerHTML = `<span class="ic">${ICONS.check}</span>`;
      item.append(check);
    } else {
      const now = video.cmid === auto.current;
      if (now) item.classList.add("is-now");
      item.firstChild.append(el("div", now ? "due is-live" : "due is-wait", now ? "재생 중" : "대기 중"));
      item.append(iconButton("play", "play", "", () => playOne(video.cmid)));
    }
    shell.append(item);
  });
  app.append(progress, shell);
}

function render() {
  app.replaceChildren();
  if (auto?.active) renderAuto();
  else renderList();
}

chrome.storage.local.get(["todoCache", "autoWatch"], (result) => {
  cache = result.todoCache || null;
  auto = result.autoWatch || null;
  render();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.todoCache) cache = changes.todoCache.newValue || null;
  if (changes.autoWatch) auto = changes.autoWatch.newValue || null;
  if (changes.todoCache || changes.autoWatch) render();
});
