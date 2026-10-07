const DDAY_KEY = "ddays";
const DDAY_MAX = 3;
// "auto" follows the course title colour, which the palette extension changes with its theme.
const DDAY_AUTO = "auto";
const DDAY_COLORS = [
  [DDAY_AUTO, "자동 (상단바 글자색)"],
  ["#18181b", "검정"],
  ["#6b7280", "회색"],
  ["#0b4da2", "파랑"],
  ["#e5484d", "빨강"],
  ["#f76b15", "주황"],
  ["#2f9e44", "초록"],
  ["#7c3aed", "보라"],
  ["#e8578b", "분홍"],
];
const DAY_MS = 24 * 60 * 60 * 1000;
const DDAY_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>`;
const DDAY_REMOVE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
    <path d="M7 7l10 10M17 7 7 17"/>
  </svg>`;

let ddays = [];

// 1.0.0 kept a single D-day under "dday" and its colour under "ddayColor".
// White was the old default and disappears on light palette themes, so it is read as "auto".
function readDdays(result) {
  const list = Array.isArray(result[DDAY_KEY])
    ? result[DDAY_KEY]
    : result.dday
      ? [{ ...result.dday, color: result.ddayColor }]
      : [];
  return list.map((dday) => ({ ...dday, color: !dday.color || dday.color === "#ffffff" ? DDAY_AUTO : dday.color }));
}

function createDdayButton() {
  if (document.getElementById("tb-dday")) return;
  const title = document.querySelector("nav.navbar .coursename h1");
  if (!title) return;

  chrome.storage.local.get([DDAY_KEY, "dday", "ddayColor"], (result) => {
    ddays = readDdays(result);
    const wrap = document.createElement("div");
    wrap.id = "tb-dday";
    title.appendChild(wrap);
    renderDdays();
  });
}

function getDdayCount(date) {
  const [year, month, day] = date.split("-").map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(year, month - 1, day) - today) / DAY_MS);
}

function formatDday(count) {
  if (count === 0) return "D-Day";
  return count > 0 ? `D-${count}` : `D+${-count}`;
}

function createDdayItem(dday, index) {
  const item = document.createElement("span");
  item.className = "tb-dday-item";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tb-dday-btn";
  btn.title = "디데이 설정";
  btn.setAttribute("aria-label", `디데이 설정: ${dday.label || dday.date}`);
  if (dday.color !== DDAY_AUTO) btn.style.color = dday.color;
  if (index === 0) btn.innerHTML = DDAY_ICON;
  if (dday.label) {
    const label = document.createElement("span");
    label.textContent = dday.label;
    const dot = document.createElement("i");
    dot.textContent = "·";
    btn.append(label, dot);
  }
  const count = document.createElement("b");
  count.textContent = formatDday(getDdayCount(dday.date));
  btn.append(count);
  btn.addEventListener("click", () => toggleDdayPanel(btn, index));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "tb-dday-remove";
  remove.title = "디데이 삭제";
  remove.setAttribute("aria-label", `디데이 삭제: ${dday.label || dday.date}`);
  remove.innerHTML = DDAY_REMOVE_ICON;
  remove.addEventListener("click", () => {
    closeDdayPanel();
    saveDdays(ddays.filter((_, i) => i !== index));
  });

  item.append(btn, remove);
  return item;
}

function createDdayAdd() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tb-dday-btn tb-dday-add";
  btn.title = "디데이 추가";
  btn.setAttribute("aria-label", "디데이 추가");
  btn.textContent = ddays.length ? "+" : "+ 디데이";
  btn.addEventListener("click", () => toggleDdayPanel(btn, ddays.length));
  return btn;
}

function renderDdays() {
  const items = ddays.map(createDdayItem);
  if (ddays.length < DDAY_MAX) items.push(createDdayAdd());
  const wrap = document.getElementById("tb-dday");
  wrap.classList.toggle("tb-dday-many", ddays.length > 1);
  wrap.replaceChildren(...items);
}

function toggleDdayPanel(anchor, index) {
  const open = document.getElementById("tb-dday-panel");
  closeDdayPanel();
  if (Number(open?.dataset.index) !== index) openDdayPanel(anchor, index);
}

function openDdayPanel(anchor, index) {
  const dday = ddays[index];
  let chosen = dday?.color || DDAY_AUTO;
  const panel = document.createElement("form");
  panel.id = "tb-dday-panel";
  panel.dataset.index = index;
  panel.innerHTML = `
    <label>이름<input name="label" type="text" maxlength="20" placeholder="예: 기말고사"></label>
    <label>날짜<input name="date" type="date" required></label>
    <div class="tb-dday-field">글자 색<div class="tb-dday-colors">
      ${DDAY_COLORS.map(([value, name]) =>
        value === DDAY_AUTO
          ? `<button type="button" class="tb-dday-swatch tb-dday-swatch-auto" data-color="${value}" title="${name}" aria-label="${name}"></button>`
          : `<button type="button" class="tb-dday-swatch" data-color="${value}" style="background:${value}" title="${name}" aria-label="${name}"></button>`
      ).join("")}
      <span class="tb-dday-swatch tb-dday-swatch-more" title="직접 고르기"><input name="color" type="color" aria-label="직접 고르기"></span>
    </div></div>
    <div class="tb-dday-actions">
      <button type="button" class="tb-dday-delete">${dday ? "삭제" : "취소"}</button>
      <button type="submit" class="tb-dday-save">저장</button>
    </div>`;

  const { label, date, color } = panel.elements;
  label.value = dday?.label || "";
  date.value = dday?.date || "";
  color.value = chosen === DDAY_AUTO ? "#18181b" : chosen;

  const swatches = panel.querySelectorAll(".tb-dday-swatch");
  const markColor = () => {
    const preset = DDAY_COLORS.some(([value]) => value === chosen);
    for (const swatch of swatches) {
      swatch.classList.toggle("is-selected", swatch.dataset.color ? swatch.dataset.color === chosen : !preset);
    }
  };
  panel.querySelector(".tb-dday-colors").addEventListener("click", (e) => {
    if (!e.target.dataset.color) return;
    chosen = e.target.dataset.color;
    markColor();
  });
  color.addEventListener("input", () => {
    chosen = color.value;
    markColor();
  });
  markColor();
  panel.addEventListener("submit", (e) => {
    e.preventDefault();
    const next = [...ddays];
    next[index] = { label: label.value.trim(), date: date.value, color: chosen };
    saveDdays(next);
  });
  panel.querySelector(".tb-dday-delete").addEventListener("click", () => {
    if (dday) saveDdays(ddays.filter((_, i) => i !== index));
    else closeDdayPanel();
  });
  document.addEventListener("keydown", onDdayKeyDown, true);
  document.addEventListener("mousedown", onDdayOutsideClick, true);
  const rect = anchor.getBoundingClientRect();
  panel.style.top = `${rect.bottom + 8}px`;
  panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 268))}px`;
  document.body.appendChild(panel);
  label.focus();
}

function saveDdays(next) {
  ddays = next;
  chrome.storage.local.set({ [DDAY_KEY]: ddays }, () => {
    chrome.storage.local.remove(["dday", "ddayColor"]);
    renderDdays();
    closeDdayPanel();
  });
}

function closeDdayPanel() {
  document.removeEventListener("keydown", onDdayKeyDown, true);
  document.removeEventListener("mousedown", onDdayOutsideClick, true);
  document.getElementById("tb-dday-panel")?.remove();
}

function onDdayKeyDown(e) {
  if (e.key === "Escape") closeDdayPanel();
}

function onDdayOutsideClick(e) {
  if (!e.target.closest("#tb-dday, #tb-dday-panel")) closeDdayPanel();
}

document.addEventListener("DOMContentLoaded", createDdayButton);
