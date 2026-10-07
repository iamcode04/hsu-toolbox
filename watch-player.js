// Runs in the e-class video window. It only acts while 자동시청 is on and this video is in its queue:
// starts the video (via watch-player-main.js) and, when it ends, moves this window to the next video.
const WATCH_AUTO_KEY = "autoWatch";
// the site saves the finished position on its own "complete" handler; give that request time before leaving
const WATCH_NEXT_DELAY_MS = 3000;
const watchCmid = new URLSearchParams(location.search).get("id");
let watchActive = false;

function requestPlay() {
  window.postMessage("tb-watch-play", location.origin);
}

function onWatchEnded() {
  document.removeEventListener("ended", onWatchEnded, true);
  setTimeout(() => {
    chrome.storage.local.get([WATCH_AUTO_KEY, "todoCache"], (result) => {
      const auto = result[WATCH_AUTO_KEY];
      if (!auto?.active) return;
      const done = [...new Set([...auto.done, watchCmid])];
      const next = auto.queue.find((video) => !done.includes(video.cmid));
      const update = { [WATCH_AUTO_KEY]: { ...auto, done, current: next?.cmid ?? null, active: Boolean(next) } };

      // drop the finished video from the cached to-do list so counts stay right until the next refresh
      const cache = result.todoCache;
      if (cache?.todos && !Array.isArray(cache.todos)) {
        for (const id of Object.keys(cache.todos)) cache.todos[id] = cache.todos[id].filter((t) => t.cmid !== watchCmid);
        update.todoCache = cache;
      }

      chrome.storage.local.set(update, () => {
        if (next) location.href = `/mod/vod/viewer.php?id=${next.cmid}`;
      });
    });
  }, WATCH_NEXT_DELAY_MS);
}

window.addEventListener("message", (e) => {
  if (e.source === window && e.data === "tb-watch-main-ready" && watchActive) requestPlay();
});

chrome.storage.local.get(WATCH_AUTO_KEY, (result) => {
  const auto = result[WATCH_AUTO_KEY];
  if (!auto?.active || !auto.queue.some((video) => video.cmid === watchCmid)) return;
  watchActive = true;
  chrome.storage.local.set({ [WATCH_AUTO_KEY]: { ...auto, current: watchCmid } });
  // "ended" does not bubble, so listen in the capture phase for the player's <video>
  document.addEventListener("ended", onWatchEnded, true);
  requestPlay();
});
