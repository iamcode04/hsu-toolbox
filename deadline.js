const DEADLINE_DAY_MS = 24 * 60 * 60 * 1000;
const DEADLINE_PERIOD = /(\d{4}-\d{2}-\d{2} [\d:]+) ~ (\d{4}-\d{2}-\d{2} [\d:]+)/;

function parseDeadlineDate(text) {
  const [year, month, day, hour, minute, second = 0] = text.match(/\d+/g).map(Number);
  return new Date(year, month - 1, day, hour, minute, second);
}

function formatDeadlineSpan(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간`;
  return `${Math.floor(hours / 24)}일`;
}

function createDeadlineBadge({ start, end, done, doneText }) {
  const now = Date.now();
  let state;
  let text;
  if (done) {
    state = "done";
    text = `✓ ${doneText}`;
  } else if (start && now < start) {
    state = "muted";
    text = `${formatDeadlineSpan(start - now)} 후 시작`;
  } else if (now > end) {
    state = "muted";
    text = "기간 종료";
  } else {
    const days = Math.floor((end - now) / DEADLINE_DAY_MS);
    state = days < 1 ? "urgent" : days <= 3 ? "warn" : "normal";
    text = `${formatDeadlineSpan(end - now)} 남음`;
  }

  const badge = document.createElement("span");
  badge.className = `tb-deadline tb-deadline-${state}`;
  badge.textContent = text;
  return badge;
}

async function fetchDeadlineDoc(path) {
  const res = await fetch(path);
  return new DOMParser().parseFromString(await res.text(), "text/html");
}

async function getAttendedTitles(courseId) {
  const doc = await fetchDeadlineDoc(`/report/ubcompletion/progress.php?id=${courseId}`);
  const attended = new Set();
  for (const row of doc.querySelectorAll("table.user_progress_table tbody tr")) {
    const cells = [...row.cells];
    const title = cells.findIndex((td) => td.classList.contains("text-left"));
    if (title >= 0 && cells[title + 2]?.textContent.trim() === "O") {
      attended.add(cells[title].textContent.trim());
    }
  }
  return attended;
}

async function getAssignments(courseId) {
  const doc = await fetchDeadlineDoc(`/mod/assign/index.php?id=${courseId}`);
  const heads = [...doc.querySelectorAll("table.generaltable thead th")].map((th) => th.textContent.trim());
  const dueCol = heads.indexOf("종료 일시");
  const statusCol = heads.indexOf("제출");
  const assignments = new Map();
  for (const row of doc.querySelectorAll("table.generaltable tbody tr")) {
    const link = row.querySelector('a[href*="/mod/assign/view.php"]');
    const id = link?.getAttribute("href").match(/id=(\d+)/)?.[1];
    const due = row.cells[dueCol]?.textContent.trim() || "";
    if (!id || !/^\d{4}-\d{2}-\d{2} /.test(due)) continue;
    assignments.set(id, {
      title: link.textContent.trim(),
      end: parseDeadlineDate(due),
      done: row.cells[statusCol]?.textContent.includes("제출 완료") || false,
    });
  }
  return assignments;
}

async function addDeadlineBadges() {
  const courseId = new URLSearchParams(location.search).get("id");
  const vods = [...document.querySelectorAll("li.activity.modtype_vod")];
  const assigns = [...document.querySelectorAll("li.activity.modtype_assign")];
  const [attended, assignments] = await Promise.all([
    vods.length ? getAttendedTitles(courseId).catch(() => new Set()) : new Set(),
    assigns.length ? getAssignments(courseId).catch(() => new Map()) : new Map(),
  ]);

  for (const li of vods) {
    const options = li.querySelector(".displayoptions");
    const period = options?.querySelector(".text-ubstrap")?.textContent.match(DEADLINE_PERIOD);
    if (!period) continue;
    const title = li.querySelector(".instancename")?.firstChild?.textContent.trim();
    const badge = createDeadlineBadge({
      start: parseDeadlineDate(period[1]),
      end: parseDeadlineDate(period[2]),
      done: attended.has(title),
      doneText: "출석 완료",
    });
    options.appendChild(badge);
    trackTone(badge);
  }

  for (const li of assigns) {
    const assignment = assignments.get(li.id.replace("module-", ""));
    const link = li.querySelector(".activityinstance > a");
    if (!assignment || !link) continue;
    const badge = createDeadlineBadge({ ...assignment, doneText: "제출 완료" });
    link.after(badge);
    trackTone(badge);
  }
}

let deadlineStarted = false;

function startDeadlineBadges() {
  if (deadlineStarted) return;
  deadlineStarted = true;
  addDeadlineBadges();
}

// Skip the extra page reads entirely while the toolbox switch is off; start them if it is turned on later.
if (location.pathname === "/course/view.php") {
  chrome.storage.local.get("toolbox", (result) => {
    if (result.toolbox?.deadline === false) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startDeadlineBadges);
    } else {
      startDeadlineBadges();
    }
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.toolbox?.newValue?.deadline) startDeadlineBadges();
  });
}
