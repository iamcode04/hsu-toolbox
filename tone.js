// Toolbox badges get the "tb-on-dark" class when what is behind them is dark (e.g. a palette dark theme),
// so their CSS can switch to a light-on-dark look. Used by deadline.js, progress.js, todo.js, watch.js and calendar.js.
const toneTargets = new Set();
let toneTimer = null;

function getBackdropColor(el) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const [r, g, b, a = 1] = (getComputedStyle(node).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    if (a > 0.5) return [r, g, b];
  }
  return [255, 255, 255];
}

function updateTone(el) {
  const [r, g, b] = getBackdropColor(el);
  el.classList.toggle("tb-on-dark", r * 0.299 + g * 0.587 + b * 0.114 < 128);
}

function trackTone(el) {
  toneTargets.add(el);
  updateTone(el);
}

function refreshTones() {
  clearTimeout(toneTimer);
  toneTimer = setTimeout(() => {
    for (const el of toneTargets) {
      if (el.isConnected) updateTone(el);
      else toneTargets.delete(el);
    }
  }, 100);
}

// The palette extension keeps its theme in <style id="tc-style"> (a child of <html>) and rewrites it on every change.
const paletteStyleObserver = new MutationObserver(refreshTones);
new MutationObserver(() => {
  const style = document.getElementById("tc-style");
  if (style) paletteStyleObserver.observe(style, { childList: true, characterData: true, subtree: true });
  refreshTones();
}).observe(document.documentElement, { childList: true });
