const TOOLBOX_KEY = "toolbox";
const TOOLBOX_FEATURES = [
  { key: "memo", label: "메모" },
  { key: "dday", label: "디데이" },
  { key: "deadline", label: "남은 기간" },
  { key: "todo", label: "할 일 개수" },
  { key: "watch", label: "미시청 영상" },
];

let toolboxSettings = { memo: true, dday: true, deadline: true, todo: true, watch: true };

function applyToolboxSettings() {
  for (const { key } of TOOLBOX_FEATURES) {
    document.documentElement.classList.toggle(`tb-hide-${key}`, !toolboxSettings[key]);
  }
}

function createToolboxMenu() {
  if (document.getElementById("tb-toolbox")) return;
  const guide = document.querySelector("#page-lnb .left-menus > li > .left-menu-link-guide");
  const menus = document.querySelector("#page-lnb .left-menus:not(.left-banner)");
  if (!menus) return;

  const li = document.createElement("li");
  li.id = "tb-toolbox";
  li.innerHTML = `
    <a href="#" class="left-menu-link" title="도구모음"><h5>도구모음</h5></a>
    <img class="tb-toolbox-icon" alt="">
    <ul></ul>`;
  li.querySelector(".tb-toolbox-icon").src = chrome.runtime.getURL("icons/menu-character.png");

  const list = li.querySelector("ul");
  for (const { key, label } of TOOLBOX_FEATURES) {
    const item = document.createElement("li");
    item.innerHTML = `<label class="tb-toolbox-switch"><input type="checkbox"><span></span></label>`;
    const input = item.querySelector("input");
    input.before(label);
    input.checked = toolboxSettings[key];
    input.addEventListener("change", () => {
      toolboxSettings[key] = input.checked;
      applyToolboxSettings();
      chrome.storage.local.set({ [TOOLBOX_KEY]: toolboxSettings });
    });
    list.appendChild(item);
  }

  // The site's jQuery binds its own accordion click and hover popover to every sidebar item,
  // so stop those events at this item (capture phase) and handle the accordion here.
  li.addEventListener(
    "click",
    (e) => {
      if (!e.target.closest(".left-menu-link")) return;
      e.preventDefault();
      e.stopPropagation();
      li.classList.toggle("active");
    },
    true
  );
  for (const type of ["mouseover", "mouseout"]) {
    li.addEventListener(type, (e) => e.stopPropagation(), true);
  }

  if (guide) {
    guide.parentElement.after(li);
  } else {
    menus.appendChild(li);
  }
}

chrome.storage.local.get(TOOLBOX_KEY, (result) => {
  toolboxSettings = { ...toolboxSettings, ...result[TOOLBOX_KEY] };
  applyToolboxSettings();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createToolboxMenu);
  } else {
    createToolboxMenu();
  }
});
