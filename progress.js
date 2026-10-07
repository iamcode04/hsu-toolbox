// Uses getVodProgress and parseClock from deadline.js (loaded before this file).
let progressStarted = false;

// "07:21", the same way the course page writes a video's length.
function formatClock(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

// "Watched" is the report's total study time, so replays count too; the bar stops at 100%.
function createProgressBar({ seconds, attended }, length, index) {
  const ratio = Math.min(seconds / length, 1);
  const bar = document.createElement("div");
  bar.className = attended ? "tb-progress tb-progress-done" : "tb-progress";
  bar.title = `학습 ${formatClock(seconds)} / 영상 ${formatClock(length)}`;
  bar.style.setProperty("--tb-progress", ratio);
  bar.style.setProperty("--tb-progress-index", index);
  bar.innerHTML = `<span class="tb-progress-track"><span class="tb-progress-fill"></span></span>`;
  const label = document.createElement("span");
  label.className = "tb-progress-label";
  label.textContent = `${Math.floor(ratio * 100)}%`;
  const time = document.createElement("span");
  time.className = "tb-progress-time";
  time.textContent = `${formatClock(Math.min(seconds, length))} / ${formatClock(length)}`;
  bar.append(label, time);
  return bar;
}

async function addProgressBars() {
  const vods = [...document.querySelectorAll("li.activity.modtype_vod")];
  if (!vods.length) return;
  const courseId = new URLSearchParams(location.search).get("id");
  const progress = await getVodProgress(courseId).catch(() => new Map());

  let index = 0;
  for (const li of vods) {
    const instance = li.querySelector(".activityinstance");
    const length = parseClock(li.querySelector(".displayoptions .text-info")?.textContent || "");
    const watched = progress.get(li.querySelector(".instancename")?.firstChild?.textContent.trim());
    if (!instance || !length || !watched) continue;
    const bar = createProgressBar(watched, length, index++);
    // inside the inline-block row, so the bar spans exactly as wide as that video's own line
    instance.append(bar);
    trackTone(bar);
  }
}

function startProgressBars() {
  if (progressStarted) return;
  progressStarted = true;
  addProgressBars();
}

if (location.pathname === "/course/view.php") {
  chrome.storage.local.get("toolbox", (result) => {
    if (result.toolbox?.progress === false) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startProgressBars);
    } else {
      startProgressBars();
    }
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.toolbox?.newValue?.progress) startProgressBars();
  });
}
