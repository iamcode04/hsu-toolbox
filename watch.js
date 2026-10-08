// Dashboard button that opens the unwatched-video window (watch.html).
// Counts come from todo.js's cache; the play icon is TODO_ICONS.video from todo.js (loaded before this file).
const WATCH_WINDOW_FEATURES = "popup,width=400,height=640";

function countWatchable(cache) {
  const now = Date.now();
  return Object.values(cache?.todos || {})
    .flat()
    .filter((t) => t.kind === "video" && !t.done && t.cmid && t.start <= now && now <= t.end).length;
}

function createWatchButton() {
  const anchor = document.getElementById("mycourse-type");
  if (!anchor || document.getElementById("tb-watch-btn")) return;

  const btn = document.createElement("button");
  btn.id = "tb-watch-btn";
  btn.type = "button";
  btn.innerHTML = `<span class="tb-watch-icon">${TODO_ICONS.video}</span>미시청 영상<span class="tb-watch-count">…</span>`;
  btn.addEventListener("click", () => window.open(chrome.runtime.getURL("watch.html"), "tb-watch", WATCH_WINDOW_FEATURES));
  anchor.after(btn);
  trackTone(btn);

  const count = btn.querySelector(".tb-watch-count");
  const update = (cache) => {
    count.textContent = cache ? countWatchable(cache) : "…";
  };
  chrome.storage.local.get("todoCache", (result) => update(result.todoCache));
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.todoCache) update(changes.todoCache.newValue);
  });
}

document.addEventListener("DOMContentLoaded", createWatchButton);
