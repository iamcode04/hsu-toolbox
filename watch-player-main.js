// Runs in the video page's own JavaScript world so it can use the site's jwplayer, jQuery and progress functions.
// It only reacts to the toolbox's requests (sent by watch-player.js): start the video if it is not playing yet, save the
// position right away, and let 자동시청 leave the page without the site's leave prompt.
(() => {
  const WAIT_MS = 500;
  const MAX_TRIES = 20;
  const SAVE_WAIT_MS = 4000;

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

  // posts the reply once jQuery has no request left (the site's position save), or after SAVE_WAIT_MS
  function replyWhenSaved(reply) {
    const $ = window.jQuery;
    const started = Date.now();
    (function check() {
      if (!$ || !$.active || Date.now() - started > SAVE_WAIT_MS) {
        window.postMessage(reply, location.origin);
      } else {
        setTimeout(check, 100);
      }
    })();
  }

  // The site saves the position once a minute (its vod_progress_check timer); make that same call now, so the report
  // the toolbox reads next already has what was just watched.
  function saveNow() {
    const player = typeof window.jwplayer === "function" ? window.jwplayer("vod_player") : null;
    if (typeof window.track_for_onwindow === "function" && typeof player?.getPosition === "function") {
      window.track_for_onwindow(99, window.is_time_allowed !== "1" ? 0 : player.getPosition());
    }
    replyWhenSaved("tb-watch-saved");
  }

  // The site's leave handler ($(window).bind("beforeunload")) saves the final position and then returns
  // "학습 상태가 반영되었습니다.", which makes Chrome ask "사이트에서 나가시겠습니까?" and would stop 자동시청 there.
  // Run it now so the position is still saved, unbind it, and report once its save request has finished.
  function prepareQuietLeave() {
    const $ = window.jQuery;
    if ($) {
      // the site's jQuery 1.9 copies the handler's message onto event.originalEvent, which a triggered event lacks
      const event = $.Event("beforeunload");
      event.originalEvent = {};
      try {
        $(window).triggerHandler(event);
      } catch {
        // a failing site handler must not hold 자동시청 on this page
      }
      $(window).off("beforeunload");
    }
    replyWhenSaved("tb-watch-leave-ready");
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data === "tb-watch-play") playWhenReady();
    if (e.data === "tb-watch-save") saveNow();
    if (e.data === "tb-watch-leave") prepareQuietLeave();
  });
  window.postMessage("tb-watch-main-ready", location.origin);
})();
