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

// src/assets/components/snackbar.js
var snackbarContainer = null;
function createSnackbarContainer() {
  if (snackbarContainer) return snackbarContainer;
  snackbarContainer = document.createElement("div");
  snackbarContainer.className = "fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[1000]";
  document.body.appendChild(snackbarContainer);
  return snackbarContainer;
}
function showSnackbar(message, { duration = 3e3, type = "success" } = {}) {
  const container = createSnackbarContainer();
  const snackbar = document.createElement("div");
  snackbar.className = `
    px-4 py-2 rounded-lg shadow-lg text-white font-medium text-sm
    ${type === "success" ? "bg-green-600" : "bg-red-600"}
    opacity-0 transition-opacity duration-200
  `;
  snackbar.textContent = message;
  container.appendChild(snackbar);
  setTimeout(() => snackbar.classList.remove("opacity-0"), 10);
  setTimeout(() => {
    snackbar.classList.add("opacity-0");
    setTimeout(() => {
      snackbar.remove();
      if (container.children.length === 0) {
        container.remove();
        snackbarContainer = null;
      }
    }, 200);
  }, duration);
}

// src/assets/components/codeTree.js
var { invoke: invoke2 } = window.__TAURI__.core;
var globalOverlay = null;
var selectedPaths = /* @__PURE__ */ new Set();
var rootPath = "";
var codeTreePanel = null;
var currentPrompt = "";
var loadingStatus;
var loadingText;
var successStatus;
var cancelBtn;
var previewCancelled = false;
var isPreviewLoading;
var isDir;
function ensureGlobalOverlay() {
  if (globalOverlay) return;
  globalOverlay = document.createElement("div");
  globalOverlay.className = `
    fixed inset-0 z-[9999]
    flex items-center justify-center
    bg-black/30 backdrop-blur-sm
  `;
  globalOverlay.style.display = "none";
  globalOverlay.innerHTML = `
    <div class="flex items-center gap-3 bg-white px-5 py-3 rounded shadow">
      <svg class="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <span class="text-sm text-slate-700" id="global-overlay-text">
        Working\u2026
      </span>
    </div>
  `;
  document.body.appendChild(globalOverlay);
}
function showGlobalOverlay(text = "Working\u2026") {
  ensureGlobalOverlay();
  globalOverlay.querySelector("#global-overlay-text").textContent = text;
  globalOverlay.style.display = "flex";
}
function hideGlobalOverlay() {
  if (globalOverlay) {
    globalOverlay.style.display = "none";
  }
}
function lockUI() {
  document.body.style.pointerEvents = "none";
  document.body.style.cursor = "wait";
}
function unlockUI() {
  document.body.style.pointerEvents = "";
  document.body.style.cursor = "";
}
function showLoadingStatus(totalFiles = 0, loadedFiles = 0) {
  if (!loadingStatus) return;
  if (totalFiles > 0) {
    loadingText.textContent = `Loading ${totalFiles} files... (${loadedFiles}/${totalFiles})`;
  } else {
    loadingText.textContent = "Loading files...";
  }
  loadingStatus.style.display = "flex";
  successStatus.style.display = "none";
  cancelBtn.style.display = "flex";
}
function hideLoadingStatus() {
  if (!loadingStatus) return;
  loadingStatus.style.display = "none";
  cancelBtn.style.display = "none";
}
function showSuccessStatus() {
  if (!successStatus) return;
  hideLoadingStatus();
  successStatus.style.display = "flex";
  setTimeout(() => {
    successStatus.style.display = "none";
  }, 3e3);
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
  <h3 class="font-bold text-slate-800 mb-2">Selected Code Preview</h3>
  <div id="code-tree-content" class="flex-1 overflow-auto bg-slate-100 p-3 rounded shadow-sm ">
    <p class="text-slate-500 italic">Select files using checkboxes in the tree.</p>
  </div>
  <div class="mt-2 flex gap-2 flex-wrap items-center">
    <!-- Loading Status with Spinner -->
    <div id="loading-status" class="flex items-center gap-2 px-3 py-1 text-sm text-slate-600" style="display:none;">
      <svg class="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span id="loading-text">Loading files...</span>
    </div>
    
    <!-- Success Checkmark -->
    <div id="success-status" class="flex items-center gap-2 px-3 py-1 text-sm text-green-600 bg-green-50 rounded" style="display:none;">
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
      <span>Ready!</span>
    </div>
    
    <button id="cancel-load" class="px-3 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center gap-1.5 transition-all" style="display:none;">
      <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
      Cancel
    </button>
    
    <button id="copy-md" class="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition">Copy as MD</button>
    <button id="copy-json" class="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition">Copy as JSON</button>
    <button id="copy-txt" class="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-800 text-white rounded transition">Copy as Text</button>
    <button id="clear-all" class="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition">Clear All</button>
  </div>
`;
  cancelBtn = panel.querySelector("#cancel-load");
  loadingStatus = panel.querySelector("#loading-status");
  loadingText = panel.querySelector("#loading-text");
  successStatus = panel.querySelector("#success-status");
  cancelBtn.addEventListener("click", () => {
    previewCancelled = true;
    hideLoadingStatus();
    showSnackbar("Loading cancelled", { type: "info" });
    selectedPaths.clear();
  });
  panel.querySelector("#copy-md").addEventListener("click", () => copyAs("md"));
  panel.querySelector("#copy-json").addEventListener("click", () => copyAs("json"));
  panel.querySelector("#copy-txt").addEventListener("click", () => copyAs("txt"));
  panel.querySelector("#clear-all").addEventListener("click", () => {
    selectedPaths.clear();
    if (!isDir) {
      syncCheckboxes();
    }
    updateCodeTreePreview();
  });
  return panel;
}
var previewRAF = null;
function schedulePreviewUpdate() {
  if (previewRAF) cancelAnimationFrame(previewRAF);
  previewRAF = requestAnimationFrame(() => {
    previewRAF = null;
    updateCodeTreePreview();
  });
}
async function handleCheckboxChange(e) {
  if (!e.target.matches('input[type="checkbox"]')) return;
  const path = e.target.dataset.path;
  const isChecked = e.target.checked;
  isDir = !!document.querySelector(`details[data-path="${CSS.escape(path)}"]`);
  if (isDir) {
    showGlobalOverlay("Scanning directory\u2026");
    lockUI();
    await new Promise(requestAnimationFrame);
    try {
      const allPaths = await invoke2("get_all_paths_in_directory", { path });
      allPaths.push(path);
      await applyPathsChunked(allPaths, isChecked);
    } finally {
      hideGlobalOverlay();
      unlockUI();
    }
  } else {
    if (isChecked) {
      selectedPaths.add(path);
    } else {
      selectedPaths.delete(path);
    }
  }
  if (!isDir) {
    syncCheckboxes();
  }
  schedulePreviewUpdate();
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
function buildUnixTree(paths, root) {
  if (paths.length === 0) return "";
  const rootName = root.split(/[\\/]/).filter((part) => part).pop() || "project";
  const relPaths = paths.map((p) => p.replace(root, "").replace(/^[\\/]/, "")).filter((p) => p).sort();
  const tree = { [rootName]: {} };
  for (const relPath of relPaths) {
    const parts = relPath.split(/[\\/]/);
    let current = tree[rootName];
    for (const part of parts) {
      if (!current[part]) current[part] = {};
      current = current[part];
    }
  }
  function render(node, prefix = "", isRoot = true) {
    const keys = Object.keys(node).sort();
    let output = "";
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const isLast = i === keys.length - 1;
      const linePrefix = prefix + (isRoot ? "" : isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ");
      output += linePrefix + key + "\n";
      if (Object.keys(node[key]).length > 0) {
        const childPrefix = prefix + (isLast ? "    " : "\u2502   ");
        output += render(node[key], childPrefix, false);
      }
    }
    return output;
  }
  return render(tree, "", true).trimEnd();
}
async function updateCodeTreePreview() {
  previewCancelled = false;
  const container = document.getElementById("code-tree-content");
  if (!container) return;
  if (selectedPaths.size === 0) {
    container.innerHTML = '<p class="text-slate-500 italic">Select files using checkboxes in the tree.</p>';
    return;
  }
  isPreviewLoading = false;
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
    const newPrompt = promptInput.value.trim();
    if (newPrompt) {
      currentPrompt = currentPrompt ? `${newPrompt}
${currentPrompt}` : newPrompt;
      promptInput.value = "";
      updateCodeTreePreview();
    }
  });
  const inputRow = document.createElement("div");
  inputRow.className = "flex gap-2 items-center";
  inputRow.appendChild(promptInput);
  inputRow.appendChild(addButton);
  const previewContainer = document.createElement("div");
  previewContainer.className = "relative flex-1 min-h-0";
  const copyButton = document.createElement("button");
  copyButton.className = "absolute top-1 right-5 z-10 px-1.5 py-0.5 text-xs bg-gray-800 text-white rounded opacity-80 hover:opacity-100";
  copyButton.textContent = "Copy";
  copyButton.addEventListener("click", async () => {
    const textToCopy = contentTextarea.value;
    try {
      await navigator.clipboard.writeText(textToCopy);
      copyButton.textContent = "Copied!";
      setTimeout(() => copyButton.textContent = "Copy", 2e3);
    } catch (err) {
      console.error("Failed to copy:", err);
      copyButton.textContent = "Failed!";
      setTimeout(() => copyButton.textContent = "Copy", 2e3);
    }
  });
  const contentTextarea = document.createElement("textarea");
  contentTextarea.className = `font-mono text-sm whitespace-pre w-full h-full p-2 rounded border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none`;
  contentTextarea.value = "Loading summary...";
  contentTextarea.spellcheck = false;
  previewContainer.appendChild(contentTextarea);
  previewContainer.appendChild(copyButton);
  wrapper.appendChild(inputRow);
  wrapper.appendChild(previewContainer);
  container.innerHTML = "";
  container.appendChild(wrapper);
  let baseContent = "";
  if (currentPrompt) {
    baseContent += `${currentPrompt}
---

`;
  }
  const sortedPaths = Array.from(selectedPaths).sort();
  const treeText = buildUnixTree(sortedPaths, rootPath);
  if (treeText) {
    baseContent += `${treeText}

`;
  }
  const filePaths = sortedPaths.filter((path) => {
    return !document.querySelector(`details[data-path="${CSS.escape(path)}"]`);
  });
  if (filePaths.length > 0) {
    contentTextarea.value = `${baseContent}Loading ${filePaths.length} files... (0/${filePaths.length})`;
    await loadPreviewBatch({
      textarea: contentTextarea,
      baseContent,
      filePaths
    });
  } else {
    contentTextarea.value = baseContent || "No files selected.";
    hideLoadingStatus();
  }
}
async function loadPreviewBatch({
  textarea,
  baseContent,
  filePaths
}) {
  await new Promise(requestAnimationFrame);
  showLoadingStatus(filePaths.length, 0);
  await new Promise(requestAnimationFrame);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const fileContents = await invoke2("read_multiple_files", {
    paths: filePaths
  });
  let output = baseContent;
  let loaded = 0;
  for (const file of fileContents) {
    if (previewCancelled) return;
    loaded++;
    const relPath = file.path.replace(rootPath, "").replace(/^[\\/]/, "");
    output += `# ${relPath}
`;
    output += file.error ? `[ERROR: ${file.error}]

` : `${file.content}

`;
    if (loaded % 20 === 0) {
      showLoadingStatus(filePaths.length, loaded);
      await new Promise(requestAnimationFrame);
    }
  }
  textarea.value = output.trimEnd();
  hideLoadingStatus();
  showSuccessStatus();
  hideGlobalOverlay();
}
async function copyAs(format) {
  try {
    let output = "";
    if (currentPrompt) {
      output += `${currentPrompt}
---

`;
    }
    const filePaths = Array.from(selectedPaths).filter((path) => {
      return !document.querySelector(`details[data-path="${CSS.escape(path)}"]`);
    });
    const fileContents = await invoke2("read_multiple_files", {
      paths: filePaths
    });
    const files = fileContents.map((file) => {
      const relPath = file.path.replace(rootPath, "").replace(/^[\\/]/, "");
      return {
        path: relPath,
        content: file.error ? `[ERROR: ${file.error}]` : file.content
      };
    });
    let finalText = "";
    switch (format) {
      case "txt":
      case "md":
        for (const file of files) {
          output += `# ${file.path}
${file.content}

`;
        }
        finalText = output.trimEnd();
        break;
      case "json":
        finalText = JSON.stringify(
          {
            prompt: currentPrompt || null,
            files
          },
          null,
          2
        );
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
    await invoke2("plugin:clipboard|write_text", { text: finalText });
    const formatName = { txt: "Text", md: "Markdown", json: "JSON" }[format];
    showSnackbar(`Copied as ${formatName}!`, { type: "success" });
  } catch (err) {
    console.error("Copy failed:", err);
    showSnackbar("Copy failed! See console.", { type: "error" });
  }
}

// src/main.js
var { invoke: invoke3 } = window.__TAURI__.core;
var rootNode = null;
async function propagateFolderCheckbox(folderPath, checked) {
  try {
    const allPaths = await invoke3("get_all_paths_in_directory", {
      path: folderPath
    });
    allPaths.push(folderPath);
    if (checked) {
      allPaths.forEach((p) => selectedPaths.add(p));
    } else {
      allPaths.forEach((p) => selectedPaths.delete(p));
    }
    syncCheckboxes();
    updateCodeTreePreview();
  } catch (err) {
    console.error("Failed to propagate checkbox:", err);
  }
}
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
    checkbox.addEventListener("change", async (e) => {
      e.stopPropagation();
      await propagateFolderCheckbox(node.path, checkbox.checked);
    });
    details.addEventListener("toggle", async () => {
      if (!details.open) return;
      if (details.dataset.loaded !== "false") return;
      details.dataset.loaded = "loading";
      const loading = document.createElement("li");
      loading.textContent = "Loading\u2026";
      loading.className = "ml-6 text-slate-400 italic";
      ul.appendChild(loading);
      try {
        const children = await invoke3("get_children_for_path", {
          path: node.path
        });
        ul.innerHTML = "";
        node.children = children;
        for (const child of children) {
          ul.appendChild(renderNode(child));
        }
        details.dataset.loaded = "true";
        syncCheckboxes();
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
  bar.className = "flex flex-nowrap gap-2 mb-4 pb-1";
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
    const projectDir = await invoke3("get_launch_dir");
    rootNode = await invoke3("get_tree_for_path", {
      path: projectDir
    });
    const treeContainer = document.getElementById("tree");
    const overviewContainer = document.getElementById("folder-overview");
    treeContainer.innerHTML = "";
    overviewContainer.innerHTML = "";
    selectedPaths.clear();
    const ul = document.createElement("ul");
    ul.className = "text-sm font-mono";
    ul.appendChild(renderNode(rootNode));
    treeContainer.appendChild(ul);
    setTimeout(() => {
      const rootDetails = treeContainer.querySelector("details[data-path]");
      if (rootDetails) {
        rootDetails.open = true;
      }
    }, 100);
    const topLevel = await invoke3("get_children_for_path", {
      path: rootNode.path
    });
    const foldersOnly = topLevel.filter((f) => f.is_dir);
    let allTopFolders = topLevel.filter((f) => f.is_dir);
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
