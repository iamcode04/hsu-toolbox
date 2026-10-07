const MEMO_SAVE_DELAY = 400;

let memoSaveTimer = null;
let memoEditor = null;

function createMemoButton() {
  if (document.getElementById("tb-memo-btn")) return;
  const name = document.querySelector("nav.navbar .user_department");
  if (!name) return;

  const li = document.createElement("li");
  li.id = "tb-memo-li";
  const btn = document.createElement("button");
  btn.id = "tb-memo-btn";
  btn.type = "button";
  btn.title = "메모장";
  btn.setAttribute("aria-label", "메모장");
  btn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
    </svg>
    <span>메모</span>`;
  btn.addEventListener("click", toggleMemo);
  li.appendChild(btn);
  name.before(li);
}

function toggleMemo() {
  if (document.getElementById("tb-memo")) {
    closeMemo();
  } else {
    openMemo();
  }
}

function openMemo() {
  const panel = document.createElement("div");
  panel.id = "tb-memo";
  panel.innerHTML = `
    <div class="tb-memo-head">
      <b>메모</b>
      <span class="tb-memo-status"></span>
      <button class="tb-memo-close" title="닫기" aria-label="닫기">×</button>
    </div>
    <div class="tb-memo-editor"></div>`;

  const status = panel.querySelector(".tb-memo-status");
  panel.querySelector(".tb-memo-close").addEventListener("click", closeMemo);
  document.addEventListener("keydown", onMemoKeyDown, true);
  document.body.appendChild(panel);

  chrome.storage.local.get("memo", (result) => {
    memoEditor = createMemoEditor(panel.querySelector(".tb-memo-editor"), result.memo || "", (markdown) => {
      status.textContent = "저장 중…";
      clearTimeout(memoSaveTimer);
      memoSaveTimer = setTimeout(() => {
        chrome.storage.local.set({ memo: markdown }, () => {
          status.textContent = "저장됨";
        });
      }, MEMO_SAVE_DELAY);
    });
    memoEditor.commands.focus("end");
  });
}

function closeMemo() {
  document.removeEventListener("keydown", onMemoKeyDown, true);
  memoEditor?.destroy();
  memoEditor = null;
  document.getElementById("tb-memo")?.remove();
}

function onMemoKeyDown(e) {
  if (e.key === "Escape") closeMemo();
}

document.addEventListener("DOMContentLoaded", createMemoButton);
