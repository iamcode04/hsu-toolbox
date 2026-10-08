// Runs in the e-class video page, but only acts in the toolbox's own video window (watch.html turns itself into the page
// with "#tb-watch"): a home button back to the list, a picker in place of the title to move between videos and, while
// 자동시청 is on, a live badge with a pause switch. It starts the video (via watch-player-main.js) and, when it ends, moves
// on to the next one or closes the window.
const WATCH_SESSION_KEY = "watchSession";
// the site saves the finished position on its own "complete" handler; give that request time before leaving
const WATCH_NEXT_DELAY_MS = 3000;
const WATCH_TOAST_MS = 2600;
// watch-player-main.js replies within 4s; this only covers it not answering at all
const WATCH_MAIN_TIMEOUT_MS = 5000;
const watchCmid = new URLSearchParams(location.search).get("id");
let watchActive = false;
// { mode: "auto" | "single", paused, queue: [{ cmid, title, course }], done: [cmid] }; paused: close after this video
let watchSession = null;

// Solar icon set by 480 Design (CC BY 4.0)
const WATCH_ICONS = {
  home: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12.204c0-2.289 0-3.433.52-4.381c.518-.949 1.467-1.537 3.364-2.715l2-1.241C9.889 2.622 10.892 2 12 2s2.11.622 4.116 1.867l2 1.241c1.897 1.178 2.846 1.766 3.365 2.715S22 9.915 22 12.203v1.522c0 3.9 0 5.851-1.172 7.063S17.771 22 14 22h-4c-3.771 0-5.657 0-6.828-1.212S2 17.626 2 13.725z"/><path stroke-linecap="round" d="M9 16c.85.63 1.885 1 3 1s2.15-.37 3-1"/></g></svg>`,
  chevron: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 9l-7 6l-7-6"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 6c0-1.886 0-2.828.586-3.414S4.114 2 6 2s2.828 0 3.414.586S10 4.114 10 6v12c0 1.886 0 2.828-.586 3.414S7.886 22 6 22s-2.828 0-3.414-.586S2 19.886 2 18zm12 0c0-1.886 0-2.828.586-3.414S16.114 2 18 2s2.828 0 3.414.586S22 4.114 22 6v12c0 1.886 0 2.828-.586 3.414S19.886 22 18 22s-2.828 0-3.414-.586S14 19.886 14 18z"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.4086 9.35258C23.5305 10.5065 23.5305 13.4935 21.4086 14.6474L8.59662 21.6145C6.53435 22.736 4 21.2763 4 18.9671L4 5.0329C4 2.72368 6.53435 1.26402 8.59661 2.38548L21.4086 9.35258Z"/></svg>`,
  info: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 17v-6"/><circle cx="12" cy="8" r="1" fill="currentColor"/></g></svg>`,
};

function requestPlay() {
  window.postMessage("tb-watch-play", location.origin);
}

function watchVideoUrl(cmid) {
  return `/mod/vod/viewer.php?id=${cmid}#tb-watch`;
}

// Sends watch-player-main.js a request and resolves on its reply (or after WATCH_MAIN_TIMEOUT_MS).
function askMainWorld(request, reply) {
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener("message", onReply);
      resolve();
    };
    const onReply = (e) => {
      if (e.source === window && e.data === reply) done();
    };
    window.addEventListener("message", onReply);
    window.postMessage(request, location.origin);
    setTimeout(done, WATCH_MAIN_TIMEOUT_MS);
  });
}

// Only for 자동시청 moving on or closing by itself: watch-player-main.js runs the site's leave handler (which saves the
// position) and unbinds it, so Chrome doesn't stop here with "사이트에서 나가시겠습니까?". Leaving any other way keeps the prompt.
function leaveQuietly(go) {
  askMainWorld("tb-watch-leave", "tb-watch-leave-ready").then(go);
}

// "07:21" or "1:02:03" → seconds, as deadline.js's parseClock reads the report
function watchClock(text) {
  const clock = text.match(/\d+(?::\d{2})+/)?.[0];
  return clock ? clock.split(":").reduce((total, part) => total * 60 + Number(part), 0) : 0;
}

// Before going home: save where the video is now, then read this course's report again (as todo.js does) so the list's
// progress bars show what was just watched, and a video the report now counts as attended leaves the list.
async function refreshWatchProgress() {
  await askMainWorld("tb-watch-save", "tb-watch-saved");
  const { todoCache: cache } = await new Promise((resolve) => chrome.storage.local.get("todoCache", resolve));
  const courseId = Object.keys(cache?.todos || {}).find((id) => cache.todos[id].some((t) => t.kind === "video" && t.cmid === watchCmid));
  if (!courseId) return;
  const res = await fetch(`/report/ubcompletion/progress.php?id=${courseId}`);
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  const report = new Map();
  for (const row of doc.querySelectorAll("table.user_progress_table tbody tr")) {
    const cells = [...row.cells];
    const title = cells.findIndex((td) => td.classList.contains("text-left"));
    if (title < 0) continue;
    report.set(cells[title].textContent.trim(), {
      seconds: watchClock(cells[title + 1]?.firstChild?.textContent || ""),
      done: cells[title + 2]?.textContent.trim() === "O",
    });
  }
  cache.todos[courseId] = cache.todos[courseId].map((t) => {
    const row = t.kind === "video" && report.get(t.title);
    return row ? { ...t, ...row } : t;
  });
  await new Promise((resolve) => chrome.storage.local.set({ todoCache: cache }, resolve));
}

function showWatchToast(text) {
  document.getElementById("tb-wp-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "tb-wp-toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = `<span class="tb-wp-ic">${WATCH_ICONS.info}</span>`;
  toast.append(text);
  document.body.append(toast);
  setTimeout(() => toast.classList.add("is-leaving"), WATCH_TOAST_MS);
  setTimeout(() => toast.remove(), WATCH_TOAST_MS + 500);
}

function watchOptionText(video) {
  return `${watchSession.done.includes(video.cmid) ? "✓ " : ""}${video.title}`;
}

// The picker shows the current video's title, so it stands in for the site's own title text.
function createWatchPicker() {
  const pick = document.createElement("span");
  pick.className = "tb-wp-pick";
  const select = document.createElement("select");
  select.id = "tb-wp-select";
  select.setAttribute("aria-label", "볼 영상 고르기");
  const groups = new Map();
  for (const video of watchSession.queue) {
    if (!groups.has(video.course)) {
      const group = document.createElement("optgroup");
      group.label = video.course;
      groups.set(video.course, group);
      select.append(group);
    }
    groups.get(video.course).append(new Option(watchOptionText(video), video.cmid, false, video.cmid === watchCmid));
  }
  select.addEventListener("change", () => {
    location.href = watchVideoUrl(select.value);
  });
  pick.append(select);
  pick.insertAdjacentHTML("beforeend", WATCH_ICONS.chevron);
  return pick;
}

function paintWatchAuto() {
  const { paused } = watchSession;
  const badge = document.getElementById("tb-wp-auto");
  badge.classList.toggle("is-paused", paused);
  badge.querySelector(".tb-wp-auto-label").textContent = paused ? "이 영상 후 닫힘" : "자동재생";
  const button = document.getElementById("tb-wp-pause");
  button.querySelector(".tb-wp-ic").innerHTML = paused ? WATCH_ICONS.play : WATCH_ICONS.pause;
  button.querySelector(".tb-wp-pause-label").textContent = paused ? "자동재생 다시 시작" : "자동재생 멈춤";
}

function createWatchAuto(h1) {
  const badge = document.createElement("span");
  badge.id = "tb-wp-auto";
  badge.innerHTML = `<i></i><span class="tb-wp-auto-label"></span><b></b>`;
  const index = watchSession.queue.findIndex((video) => video.cmid === watchCmid);
  badge.querySelector("b").textContent = `${index + 1}/${watchSession.queue.length}`;

  const button = document.createElement("button");
  button.id = "tb-wp-pause";
  button.type = "button";
  button.innerHTML = `<span class="tb-wp-ic"></span><span class="tb-wp-pause-label"></span>`;
  button.addEventListener("click", () => {
    watchSession.paused = !watchSession.paused;
    chrome.storage.local.set({ [WATCH_SESSION_KEY]: watchSession });
    paintWatchAuto();
    showWatchToast(watchSession.paused ? "이 영상만 보고 창이 닫힙니다" : "자동재생을 다시 시작합니다");
  });
  h1.append(badge, button);
  paintWatchAuto();
}

function createWatchHome() {
  const button = document.createElement("button");
  button.id = "tb-wp-home";
  button.type = "button";
  button.title = "미시청 영상 목록으로";
  button.setAttribute("aria-label", "미시청 영상 목록으로");
  button.innerHTML = WATCH_ICONS.home;
  button.addEventListener("click", async () => {
    button.disabled = true;
    // a failed refresh still goes home; the list then shows the progress it had
    await refreshWatchProgress().catch(() => {});
    // watch.html is web-accessible for this site; it shrinks the window back itself ("#home"), so answering the site's
    // leave prompt with 취소 leaves this page as it was, with the button usable again
    location.href = `${chrome.runtime.getURL("watch.html")}#home`;
    setTimeout(() => {
      button.disabled = false;
    }, 1000);
  });
  return button;
}

function createWatchBar() {
  const h1 = document.querySelector("#vod_header h1");
  if (!h1) return;
  const titleNode = [...h1.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (titleNode) {
    const title = document.createElement("span");
    title.className = "tb-wp-title";
    titleNode.replaceWith(title);
    title.append(titleNode);
  }
  h1.prepend(createWatchHome(), createWatchPicker());
  // the badge and its switch sit right after "출석처리 기간입니다."
  if (watchSession.mode === "auto") createWatchAuto(h1);
}

function onWatchEnded() {
  document.removeEventListener("ended", onWatchEnded, true);
  setTimeout(() => {
    chrome.storage.local.get([WATCH_SESSION_KEY, "todoCache"], (result) => {
      const session = result[WATCH_SESSION_KEY];
      if (!session) return;
      session.done = [...new Set([...session.done, watchCmid])];
      const update = { [WATCH_SESSION_KEY]: session };

      // mark the finished video watched in the cached to-do list so counts and the calendar stay right until the next refresh
      const cache = result.todoCache;
      if (cache?.todos && !Array.isArray(cache.todos)) {
        for (const id of Object.keys(cache.todos)) {
          cache.todos[id] = cache.todos[id].map((t) => (t.kind === "video" && t.cmid === watchCmid ? { ...t, done: true } : t));
        }
        update.todoCache = cache;
      }

      chrome.storage.local.set(update, () => {
        watchSession = session;
        const option = document.querySelector(`#tb-wp-select option[value="${watchCmid}"]`);
        const video = session.queue.find((v) => v.cmid === watchCmid);
        if (option && video) option.textContent = watchOptionText(video);
        if (session.mode !== "auto") return;
        if (session.paused) {
          leaveQuietly(() => window.close());
          return;
        }
        // carry on after this video (it may have been picked out of order), then whatever is left before it
        const at = session.queue.findIndex((v) => v.cmid === watchCmid);
        const next = [...session.queue.slice(at + 1), ...session.queue.slice(0, at)].find((v) => !session.done.includes(v.cmid));
        if (next) {
          leaveQuietly(() => {
            location.href = watchVideoUrl(next.cmid);
          });
          return;
        }
        showWatchToast("미시청 영상을 모두 봤어요");
        setTimeout(() => leaveQuietly(() => window.close()), WATCH_TOAST_MS);
      });
    });
  }, WATCH_NEXT_DELAY_MS);
}

window.addEventListener("message", (e) => {
  if (e.source === window && e.data === "tb-watch-main-ready" && watchActive) requestPlay();
});

if (location.hash === "#tb-watch") {
  chrome.storage.local.get(WATCH_SESSION_KEY, (result) => {
    const session = result[WATCH_SESSION_KEY];
    if (!session?.queue.some((video) => video.cmid === watchCmid)) return;
    watchSession = session;
    watchActive = true;
    createWatchBar();
    // "ended" does not bubble, so listen in the capture phase for the player's <video>
    document.addEventListener("ended", onWatchEnded, true);
    requestPlay();
  });
}
