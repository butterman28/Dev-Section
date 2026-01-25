// src/assets/components/modal.js
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
  const searchBar2 = document.createElement("div");
  searchBar2.className = "mb-3";
  searchBar2.innerHTML = `
    <input
      type="text"
      id="folder-search"
      placeholder="Search folders..."
      class="w-full px-3 py-1.5 text-sm border rounded-md border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  `;
  container.insertBefore(searchBar2, container.firstChild);
  const input = searchBar2.querySelector("#folder-search");
  input.addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    onSearch(term);
  });
  return input;
}

// src/assets/components/codeTree.js
var selectedPaths = /* @__PURE__ */ new Set();
var rootPath = "";
var codeTreePanel = null;
var currentPrompt = "";
var SCRIPT_EXTENSIONS = /* @__PURE__ */ new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".sh",
  ".bash",
  ".rb",
  ".php",
  ".pl",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".swift",
  ".kt",
  ".lua",
  ".r",
  ".scala",
  ".clj",
  ".ex",
  ".erl",
  ".sql",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".md"
]);
function isScriptFile(path) {
  const dotIndex = path.lastIndexOf(".");
  if (dotIndex === -1) return false;
  const ext = path.slice(dotIndex).toLowerCase();
  return SCRIPT_EXTENSIONS.has(ext);
}
async function collectScriptFiles(dirPath) {
  const { invoke: invoke3 } = window.__TAURI__.core;
  const scripts = [];
  try {
    const children = await invoke3("get_children_for_path", { path: dirPath });
    for (const child of children) {
      if (child.is_dir) {
        const subScripts = await collectScriptFiles(child.path);
        scripts.push(...subScripts);
      } else if (isScriptFile(child.path)) {
        scripts.push(child.path);
      }
    }
  } catch (err) {
    console.warn(`Failed to read directory: ${dirPath}`, err);
  }
  return scripts;
}
function initializeCodeTree({ rootPath: root, treeContainer, parentSection }) {
  rootPath = root.replace(/[\\/]+$/, "");
  codeTreePanel = createCodeTreePanel();
  parentSection.prepend(codeTreePanel);
  treeContainer.addEventListener("change", handleCheckboxChange);
}
function createCodeTreePanel() {
  const panel = document.createElement("div");
  panel.className = "w-1/2 flex flex-col";
  panel.innerHTML = `
  <h3 class="font-bold text-slate-800 mb-2">Selected Code Tree</h3>
  <div id="code-tree-content" class="flex-1 overflow-auto bg-slate-100 p-3 rounded shadow-sm ">
    <p class="text-slate-500 italic">Select files using checkboxes in the tree.</p>
  </div>
  <div class="mt-2 flex gap-2 flex-wrap">
    <button id="export-md" class="px-2 py-1 text-xs bg-blue-600 text-white rounded">Markdown</button>
    <button id="export-js" class="px-2 py-1 text-xs bg-green-600 text-white rounded">JavaScript</button>
    <button id="export-txt" class="px-2 py-1 text-xs bg-gray-700 text-white rounded">Text</button>
    <button id="clear-all" class="px-2 py-1 text-xs bg-red-600 text-white rounded">Clear All</button>
  </div>
`;
  panel.querySelector("#export-md").addEventListener("click", () => exportAs("md"));
  panel.querySelector("#export-js").addEventListener("click", () => exportAs("js"));
  panel.querySelector("#export-txt").addEventListener("click", () => exportAs("txt"));
  panel.querySelector("#clear-all").addEventListener("click", () => {
    selectedPaths.clear();
    syncCheckboxes();
    updateCodeTreePreview();
  });
  return panel;
}
async function handleCheckboxChange(e) {
  if (!e.target.matches('input[type="checkbox"]')) return;
  const path = e.target.dataset.path;
  const isChecked = e.target.checked;
  const isDir = !!document.querySelector(`details[data-path="${CSS.escape(path)}"]`);
  if (isDir) {
    const scriptPaths = await collectScriptFiles(path);
    if (isChecked) {
      scriptPaths.forEach((p) => selectedPaths.add(p));
    } else {
      scriptPaths.forEach((p) => selectedPaths.delete(p));
    }
  } else {
    if (isChecked) {
      selectedPaths.add(path);
    } else {
      selectedPaths.delete(path);
    }
  }
  syncCheckboxes();
  updateCodeTreePreview();
}
function syncCheckboxes() {
  document.querySelectorAll('#tree input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });
  selectedPaths.forEach((path) => {
    const cb = document.querySelector(`#tree input[type="checkbox"][data-path="${CSS.escape(path)}"]`);
    if (cb) cb.checked = true;
  });
}
async function updateCodeTreePreview() {
  const container = document.getElementById("code-tree-content");
  if (!container) return;
  if (selectedPaths.size === 0) {
    container.innerHTML = '<p class="text-slate-500 italic">Select files using checkboxes in the tree.</p>';
    return;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "flex flex-col h-full gap-2";
  const promptInput = document.createElement("input");
  promptInput.type = "text";
  promptInput.placeholder = "Enter a prompt for this code context...";
  promptInput.value = currentPrompt;
  promptInput.className = "px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500";
  const addButton = document.createElement("button");
  addButton.textContent = "Add Prompt";
  addButton.className = "px-2 py-1 text-xs bg-blue-600 text-white rounded w-fit";
  addButton.addEventListener("click", () => {
    currentPrompt = promptInput.value.trim();
    updateCodeTreePreview();
  });
  const inputRow = document.createElement("div");
  inputRow.className = "flex gap-2 items-center";
  inputRow.appendChild(promptInput);
  inputRow.appendChild(addButton);
  const contentPre = document.createElement("pre");
  contentPre.className = "font-mono text-sm whitespace-pre overflow-auto flex-1 bg-white p-2 rounded";
  contentPre.textContent = "Loading content\u2026";
  wrapper.appendChild(inputRow);
  wrapper.appendChild(contentPre);
  container.innerHTML = "";
  container.appendChild(wrapper);
  const { invoke: invoke3 } = window.__TAURI__.core;
  let previewContent = "";
  if (currentPrompt) {
    previewContent += `${currentPrompt}
---

`;
  }
  const sortedPaths = Array.from(selectedPaths).sort();
  for (const fullPath of sortedPaths) {
    try {
      const stats = await invoke3("get_file_stats", { path: fullPath });
      if (stats.is_dir) continue;
      const content = await invoke3("read_file", { path: fullPath });
      const relPath = fullPath.replace(rootPath, "").replace(/^[\\/]/, "");
      previewContent += `# ${relPath}
${content}

`;
    } catch (err) {
      const relPath = fullPath.replace(rootPath, "").replace(/^[\\/]/, "");
      previewContent += `# ${relPath} [ERROR: ${String(err)}]

`;
    }
  }
  previewContent = previewContent.trimEnd();
  contentPre.textContent = previewContent;
}
async function exportAs(format) {
  const { save } = window.__TAURI__.dialog;
  const { writeTextFile } = window.__TAURI__.fs;
  let output = "";
  if (currentPrompt) {
    output += `${currentPrompt}
---

`;
  }
  const { invoke: invoke3 } = window.__TAURI__.core;
  const sortedPaths = Array.from(selectedPaths).sort();
  for (const fullPath of sortedPaths) {
    try {
      const stats = await invoke3("get_file_stats", { path: fullPath });
      if (stats.is_dir) continue;
      const content = await invoke3("read_file", { path: fullPath });
      const relPath = fullPath.replace(rootPath, "").replace(/^[\\/]/, "");
      output += `# ${relPath}
${content}

`;
    } catch (err) {
      const relPath = fullPath.replace(rootPath, "").replace(/^[\\/]/, "");
      output += `# ${relPath} [ERROR: ${String(err)}]

`;
    }
  }
  output = output.trimEnd() + "\n";
  const filePath = await save({
    filters: [{ name: "Plain Text", extensions: ["txt"] }],
    defaultPath: `code-context.txt`
  });
  if (filePath) {
    await writeTextFile(filePath, output);
  }
}

// src/main.js
var { invoke: invoke2 } = window.__TAURI__.core;
var rootNode = null;
function renderNode(node) {
  const li = document.createElement("li");
  li.className = "ml-4";
  const itemContainer = document.createElement("div");
  itemContainer.className = "flex items-center gap-1.5";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.path = node.path;
  checkbox.className = "mt-0.5 h-4 w-4";
  const nameLabel = document.createElement("span");
  nameLabel.textContent = node.name;
  nameLabel.className = node.is_dir ? "cursor-pointer font-medium text-slate-800 hover:text-blue-600" : "text-slate-600";
  itemContainer.appendChild(checkbox);
  itemContainer.appendChild(nameLabel);
  if (node.is_dir) {
    const details = document.createElement("details");
    details.dataset.path = node.path;
    details.dataset.loaded = "false";
    const summary = document.createElement("summary");
    summary.className = "list-none cursor-pointer";
    summary.appendChild(itemContainer);
    const ul = document.createElement("ul");
    ul.className = "border-l border-slate-300 ml-2 pl-2 mt-1";
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
    li.replaceChildren(itemContainer);
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
    const buttonGroup = document.createElement("div");
    buttonGroup.className = "flex items-center bg-white border border-slate-300 rounded-md overflow-hidden hover:bg-slate-50";
    const eyeBtn = document.createElement("button");
    eyeBtn.type = "button";
    eyeBtn.className = "flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-700";
    eyeBtn.title = "Toggle folder visibility";
    const eyeIcon = document.createElement("span");
    eyeIcon.textContent = "\u{1F648}";
    eyeIcon.setAttribute("aria-hidden", "true");
    const nameSpan = document.createElement("span");
    nameSpan.textContent = folder.name;
    nameSpan.className = "truncate max-w-[140px]";
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
    subBtn.className = "w-7 flex items-center justify-center text-xs text-slate-500 hover:bg-slate-200";
    subBtn.textContent = "\u25BC";
    subBtn.title = "View subfolders";
    subBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showSubfolderModal(folder, renderNode);
    });
    buttonGroup.appendChild(eyeBtn);
    buttonGroup.appendChild(subBtn);
    const wrapper = document.createElement("div");
    wrapper.className = "flex-shrink-0";
    wrapper.appendChild(buttonGroup);
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
    const folderControls = document.getElementById("folder-controls");
    createSearchBar(folderControls, (term) => {
      const filtered = term ? allTopFolders.filter((f) => f.name.toLowerCase().includes(term)) : allTopFolders;
      renderFolderButtons(filtered, overviewContainer);
    });
    renderFolderButtons(allTopFolders, overviewContainer);
    initializeCodeTree({
      rootPath: rootNode.path,
      treeContainer: document.getElementById("tree"),
      parentSection: document.querySelector("main > section")
    });
  } catch (err) {
    console.error(err);
    document.getElementById("tree").textContent = "Failed to load directory tree";
  }
}
window.addEventListener("DOMContentLoaded", loadTree);
