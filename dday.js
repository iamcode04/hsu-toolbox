const DDAY_KEY = "dday";
const DDAY_COLOR_KEY = "ddayColor";
const DDAY_DEFAULT_COLOR = "#ffffff";
const DDAY_COLORS = [
  ["#ffffff", "흰색"],
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

let ddayData = null;
let ddayColor = DDAY_DEFAULT_COLOR;

function createDdayButton() {
  if (document.getElementById("tb-dday")) return;
  const title = document.querySelector("nav.navbar .coursename h1");
  if (!title) return;

  chrome.storage.local.get([DDAY_KEY, DDAY_COLOR_KEY], (result) => {
    ddayData = result[DDAY_KEY] || null;
    ddayColor = result[DDAY_COLOR_KEY] || DDAY_DEFAULT_COLOR;

    const wrap = document.createElement("div");
    wrap.id = "tb-dday";
    const btn = document.createElement("button");
    btn.id = "tb-dday-btn";
    btn.type = "button";
    btn.title = "디데이 설정";
    btn.setAttribute("aria-label", "디데이 설정");
    btn.addEventListener("click", toggleDdayPanel);
    wrap.appendChild(btn);
    title.appendChild(wrap);
    renderDdayButton();
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

function renderDdayButton() {
  const btn = document.getElementById("tb-dday-btn");
  btn.style.color = ddayColor;
  if (!ddayData) {
    btn.textContent = "+ 디데이";
    return;
  }

  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>`;
  if (ddayData.label) {
    const label = document.createElement("span");
    label.textContent = ddayData.label;
    const dot = document.createElement("i");
    dot.textContent = "·";
    btn.append(label, dot);
  }
  const count = document.createElement("b");
  count.textContent = formatDday(getDdayCount(ddayData.date));
  btn.append(count);
}

function toggleDdayPanel() {
  if (document.getElementById("tb-dday-panel")) {
    closeDdayPanel();
  } else {
    openDdayPanel();
  }
}

function openDdayPanel() {
  const panel = document.createElement("form");
  panel.id = "tb-dday-panel";
  panel.innerHTML = `
    <label>이름<input name="label" type="text" maxlength="20" placeholder="예: 기말고사"></label>
    <label>날짜<input name="date" type="date" required></label>
    <div class="tb-dday-field">글자 색<div class="tb-dday-colors">
      ${DDAY_COLORS.map(
        ([hex, name]) =>
          `<button type="button" class="tb-dday-swatch" data-color="${hex}" style="background:${hex}" title="${name}" aria-label="${name}"></button>`
      ).join("")}
      <span class="tb-dday-swatch tb-dday-swatch-more" title="직접 고르기"><input name="color" type="color" aria-label="직접 고르기"></span>
    </div></div>
    <div class="tb-dday-actions">
      <button type="button" class="tb-dday-delete">삭제</button>
      <button type="submit" class="tb-dday-save">저장</button>
    </div>`;

  const { label, date, color } = panel.elements;
  label.value = ddayData?.label || "";
  date.value = ddayData?.date || "";
  color.value = ddayColor;

  const swatches = panel.querySelectorAll(".tb-dday-swatch");
  const markColor = () => {
    const preset = DDAY_COLORS.some(([hex]) => hex === color.value);
    for (const swatch of swatches) {
      swatch.classList.toggle("is-selected", swatch.dataset.color ? swatch.dataset.color === color.value : !preset);
    }
  };
  panel.querySelector(".tb-dday-colors").addEventListener("click", (e) => {
    if (!e.target.dataset.color) return;
    color.value = e.target.dataset.color;
    markColor();
  });
  color.addEventListener("input", markColor);
  markColor();
  panel.addEventListener("submit", (e) => {
    e.preventDefault();
    saveDday({ label: label.value.trim(), date: date.value }, color.value);
  });
  panel.querySelector(".tb-dday-delete").addEventListener("click", () => saveDday(null, ddayColor));
  document.addEventListener("keydown", onDdayKeyDown, true);
  document.addEventListener("mousedown", onDdayOutsideClick, true);
  const rect = document.getElementById("tb-dday-btn").getBoundingClientRect();
  panel.style.top = `${rect.bottom + 8}px`;
  panel.style.left = `${rect.left}px`;
  document.body.appendChild(panel);
  label.focus();
}

function saveDday(data, color) {
  ddayData = data;
  ddayColor = color;
  const done = () => {
    renderDdayButton();
    closeDdayPanel();
  };
  if (data) {
    chrome.storage.local.set({ [DDAY_KEY]: data, [DDAY_COLOR_KEY]: color }, done);
  } else {
    chrome.storage.local.remove(DDAY_KEY, done);
  }
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
