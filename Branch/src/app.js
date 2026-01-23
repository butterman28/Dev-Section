// src/modal.js
var { invoke } = window.__TAURI__.core;
var modalInitialized = false;
var currentModal = null;
function ensureModalExists() {
  if (modalInitialized) return;
  const modal = document.createElement("div");
  modal.id = "subfolder-modal";
  modal.className = "hidden fixed inset-0 z-50 flex items-center justify-center p-4";
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" id="modal-backdrop"></div>
    <div class="relative bg-white rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col z-50">
      <div class="px-4 py-3 border-b flex justify-between items-center">
        <h3 id="modal-folder-name" class="font-medium text-slate-800"></h3>
        <button id="modal-close" class="text-slate-500 hover:text-slate-800 text-xl">&times;</button>
      </div>
      <div id="modal-tree" class="flex-1 overflow-auto p-4 text-sm font-mono"></div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  };
  modal.querySelector("#modal-backdrop").addEventListener("click", close);
  modal.querySelector("#modal-close").addEventListener("click", close);
  modalInitialized = true;
  currentModal = modal;
}
async function showSubfolderModal(folderNode, renderNodeFn) {
  ensureModalExists();
  const nameEl = document.getElementById("modal-folder-name");
  const treeEl = document.getElementById("modal-tree");
  nameEl.textContent = folderNode.name;
  treeEl.innerHTML = "Loading\u2026";
  try {
    const children = await invoke("get_children_for_path", {
      path: folderNode.path
    });
    treeEl.innerHTML = "";
    if (children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "text-slate-500 italic";
      empty.textContent = "No subfolders";
      treeEl.appendChild(empty);
    } else {
      const ul = document.createElement("ul");
      ul.className = "text-sm font-mono";
      for (const child of children) {
        ul.appendChild(renderNodeFn(child));
      }
      treeEl.appendChild(ul);
    }
  } catch (err) {
    treeEl.textContent = "Failed to load subfolders";
  }
  currentModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

// src/assets/components/search.js
function createSearchBar(container, onSearch) {
  if (container.querySelector("#folder-search")) return;
  const searchBar = document.createElement("div");
  searchBar.className = "mb-3";
  searchBar.innerHTML = `
    <input
      type="text"
      id="folder-search"
      placeholder="Search folders..."
      class="w-full px-3 py-1.5 text-sm border rounded-md border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  `;
  container.insertBefore(searchBar, container.firstChild);
  const input = searchBar.querySelector("#folder-search");
  input.addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    onSearch(term);
  });
  return input;
}

// src/main.js
var { invoke: invoke2 } = window.__TAURI__.core;
var rootNode = null;
function renderNode(node) {
  const li = document.createElement("li");
  li.className = "ml-4";
  if (node.is_dir) {
    const details = document.createElement("details");
    details.dataset.path = node.path;
    details.dataset.loaded = "false";
    const summary = document.createElement("summary");
    summary.textContent = node.name;
    summary.className = "cursor-pointer font-medium text-slate-800 hover:text-blue-600";
    const ul = document.createElement("ul");
    ul.className = "border-l border-slate-300 ml-2 pl-2";
    details.appendChild(summary);
    details.appendChild(ul);
    li.appendChild(details);
    details.addEventListener("toggle", async () => {
      if (!details.open) return;
      if (details.dataset.loaded !== "false") return;
      details.dataset.loaded = "loading";
      const loading = document.createElement("li");
      loading.textContent = "Loading\u2026";
      loading.className = "ml-6 text-slate-400 italic";
      ul.appendChild(loading);
      try {
        const children = await invoke2("get_children_for_path", {
          path: node.path
        });
        ul.innerHTML = "";
        node.children = children;
        for (const child of children) {
          ul.appendChild(renderNode(child));
        }
        details.dataset.loaded = "true";
      } catch (err) {
        ul.innerHTML = "";
        const error = document.createElement("li");
        error.textContent = "Failed to load directory";
        error.className = "ml-6 text-red-500";
        ul.appendChild(error);
        details.dataset.loaded = "false";
      }
    });
  } else {
    li.textContent = node.name;
    li.className = "ml-6 text-slate-600 hover:text-slate-900 cursor-default";
    li.dataset.path = node.path;
  }
  return li;
}
function renderFolderButtons(folders, container) {
  container.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "flex flex-nowrap gap-2 mb-4  pb-1 ";
  folders.forEach((folder) => {
    const wrapper = document.createElement("div");
    wrapper.className = "flex items-center gap-1";
    const eyeBtn = document.createElement("button");
    eyeBtn.type = "button";
    eyeBtn.className = "flex items-center gap-1.5 px-2.5 py-1 bg-white rounded border text-xs font-medium text-slate-700 hover:bg-slate-50 max-w-[180px]";
    const eyeIcon = document.createElement("span");
    eyeIcon.textContent = "\u{1F441}\uFE0F";
    eyeIcon.setAttribute("aria-hidden", "true");
    const nameSpan = document.createElement("span");
    nameSpan.textContent = folder.name;
    nameSpan.className = "truncate";
    eyeBtn.appendChild(eyeIcon);
    eyeBtn.appendChild(nameSpan);
    eyeBtn.addEventListener("click", () => {
      const details = document.querySelector(
        `details[data-path="${CSS.escape(folder.path)}"]`
      );
      if (details) {
        details.open = !details.open;
        eyeIcon.textContent = details.open ? "\u{1F441}\uFE0F" : "\u{1F648}";
      }
    });
    const subBtn = document.createElement("button");
    subBtn.className = "ml-1 w-6 h-6 flex items-center justify-center text-xs text-slate-500 hover:bg-slate-200 rounded";
    subBtn.textContent = "\u25BC";
    subBtn.title = "View subfolders";
    subBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showSubfolderModal(folder, renderNode);
    });
    wrapper.appendChild(eyeBtn);
    wrapper.appendChild(subBtn);
    bar.appendChild(wrapper);
  });
  container.appendChild(bar);
}
async function loadTree() {
  try {
    const projectDir = await invoke2("get_launch_dir");
    rootNode = await invoke2("get_tree_for_path", {
      path: projectDir
    });
    const treeContainer = document.getElementById("tree");
    const overviewContainer = document.getElementById("folder-overview");
    treeContainer.innerHTML = "";
    overviewContainer.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "text-sm font-mono";
    ul.appendChild(renderNode(rootNode));
    treeContainer.appendChild(ul);
    const topLevel = await invoke2("get_children_for_path", {
      path: rootNode.path
    });
    const foldersOnly = topLevel.filter((f) => f.is_dir);
    let allTopFolders = topLevel.filter((f) => f.is_dir);
    const parentWrapper = overviewContainer.closest(".w-\\[50\\%\\]");
    createSearchBar(parentWrapper, (term) => {
      const filtered = term ? allTopFolders.filter((f) => f.name.toLowerCase().includes(term)) : allTopFolders;
      renderFolderButtons(filtered, overviewContainer);
    });
    renderFolderButtons(allTopFolders, overviewContainer);
    if (foldersOnly.length > 0) {
      const bar = document.createElement("div");
      bar.className = "flex flex-nowrap gap-2 mb-4  pb-1 ";
      foldersOnly.forEach((folder) => {
        const wrapper = document.createElement("div");
        wrapper.className = "flex items-center gap-1";
        const eyeBtn = document.createElement("button");
        eyeBtn.type = "button";
        eyeBtn.title = folder.name;
        eyeBtn.className = "flex items-center gap-1.5 px-2.5 py-1 bg-white rounded border text-xs font-medium text-slate-700 hover:bg-slate-50 max-w-[180px]";
        const eyeIcon = document.createElement("span");
        eyeIcon.textContent = "\u{1F441}\uFE0F";
        eyeIcon.setAttribute("aria-hidden", "true");
        const nameSpan = document.createElement("span");
        nameSpan.textContent = folder.name;
        nameSpan.className = "truncate";
        eyeBtn.appendChild(eyeIcon);
        eyeBtn.appendChild(nameSpan);
        eyeBtn.addEventListener("click", () => {
          const details = document.querySelector(
            `details[data-path="${CSS.escape(folder.path)}"]`
          );
          if (details) {
            details.open = !details.open;
            eyeIcon.textContent = details.open ? "\u{1F441}\uFE0F" : "\u{1F648}";
          }
        });
        const subBtn = document.createElement("button");
        subBtn.className = "ml-1 w-6 h-6 flex items-center justify-center text-xs text-slate-500 hover:bg-slate-200 rounded";
        subBtn.textContent = "\u25BC";
        subBtn.title = "View subfolders";
        subBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showSubfolderModal(folder, renderNode);
        });
        wrapper.appendChild(eyeBtn);
        wrapper.appendChild(subBtn);
        bar.appendChild(wrapper);
      });
      overviewContainer.appendChild(bar);
    }
  } catch (err) {
    console.error(err);
    document.getElementById("tree").textContent = "Failed to load directory tree";
  }
}
window.addEventListener("DOMContentLoaded", loadTree);
