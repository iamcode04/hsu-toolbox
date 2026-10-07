// Runs in the video page's own JavaScript world so it can use the site's jwplayer API.
// It only reacts to the toolbox's play request (sent by watch-player.js) and starts the video if it is not playing yet.
(() => {
  const WAIT_MS = 500;
  const MAX_TRIES = 20;

  function playWhenReady(tries = 0) {
    const setUp = document.getElementById("vod_player")?.classList.contains("jwplayer");
    const player = setUp && typeof window.jwplayer === "function" ? window.jwplayer("vod_player") : null;
    const state = typeof player?.getState === "function" ? player.getState() : undefined;
    if (state === "idle" || state === "paused") {
      player.play();
    } else if (state === undefined && tries < MAX_TRIES) {
      setTimeout(() => playWhenReady(tries + 1), WAIT_MS);
    }
  }

  window.addEventListener("message", (e) => {
    if (e.source === window && e.data === "tb-watch-play") playWhenReady();
  });
  window.postMessage("tb-watch-main-ready", location.origin);
})();
