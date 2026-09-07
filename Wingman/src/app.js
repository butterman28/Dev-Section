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

// src/assets/components/projects.js
var { invoke } = window.__TAURI__.core;
var { open } = window.__TAURI__.dialog;
var STORAGE_KEY = "wingman_projects";
var projects = {};
var activeProjectId = null;
function setActiveProject(projectId) {
  if (projects[projectId]) {
    const wasActive = activeProjectId;
    activeProjectId = projectId;
    localStorage.setItem("wingman_active_project", projectId);
    updateProjectSwitcherUI();
    renderProjectDropdown();
    window.dispatchEvent(new CustomEvent("project-switched", {
      detail: { projectId, previousProjectId: wasActive }
    }));
  }
}
function updateProjectSwitcherUI() {
  const projectNameEl = document.getElementById("current-project-name");
  if (!projectNameEl) return;
  if (activeProjectId && projects[activeProjectId]) {
    projectNameEl.textContent = projects[activeProjectId].name;
    projectNameEl.className = "text-slate-200 font-medium";
  } else {
    projectNameEl.textContent = "No Project";
    projectNameEl.className = "text-slate-400";
  }
}
function renderProjectDropdown() {
  const dropdownList = document.getElementById("project-dropdown-list");
  if (!dropdownList) return;
  dropdownList.innerHTML = "";
  const projectIds = Object.keys(projects);
  if (projectIds.length === 0) {
    const empty = document.createElement("div");
    empty.className = "px-4 py-3 text-sm text-slate-500 text-center";
    empty.textContent = "No projects open";
    dropdownList.appendChild(empty);
    return;
  }
  projectIds.forEach((id) => {
    const proj = projects[id];
    const isActive = id === activeProjectId;
    const item = document.createElement("button");
    item.className = `w-full px-4 py-3 text-left flex items-center gap-3 transition-colors ${isActive ? "bg-blue-50 border-l-4 border-blue-600" : "hover:bg-slate-50 border-l-4 border-transparent"}`;
    item.innerHTML = `
      <svg class="w-5 h-5 ${isActive ? "text-blue-600" : "text-slate-400"}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
      </svg>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium ${isActive ? "text-blue-900" : "text-slate-700"} truncate">
          ${proj.name}
        </div>
        <div class="text-xs text-slate-500 truncate">${proj.rootPath}</div>
      </div>
      ${isActive ? '<span class="text-xs text-blue-600 font-medium">Active</span>' : ""}
      <button class="close-project-btn p-1.5 hover:bg-red-100 rounded-md transition-colors" data-project-id="${id}">
        <svg class="w-4 h-4 text-slate-400 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;
    item.addEventListener("click", (e) => {
      if (!e.target.closest(".close-project-btn")) {
        setActiveProject(id);
        toggleProjectDropdown();
      }
    });
    const closeBtn = item.querySelector(".close-project-btn");
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeProject(id);
    });
    dropdownList.appendChild(item);
  });
}
function toggleProjectDropdown() {
  const dropdown = document.getElementById("project-dropdown");
  if (!dropdown) return;
  const isHidden = dropdown.classList.contains("hidden");
  if (isHidden) {
    renderProjectDropdown();
    dropdown.classList.remove("hidden");
  } else {
    dropdown.classList.add("hidden");
  }
}
function closeProjectDropdown() {
  const dropdown = document.getElementById("project-dropdown");
  if (dropdown) {
    dropdown.classList.add("hidden");
  }
}
function loadProjects() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      for (const [id, data] of Object.entries(parsed)) {
        data.selectedPaths = new Set(data.selectedPaths || []);
        data.knownDirs = new Set(data.knownDirs || []);
        data.fileContentsMap = new Map(Object.entries(data.fileContentsMap || {}));
        projects[id] = data;
      }
    }
    const savedActive = localStorage.getItem("wingman_active_project");
    if (savedActive && projects[savedActive]) {
      activeProjectId = savedActive;
    } else if (Object.keys(projects).length > 0) {
      activeProjectId = Object.keys(projects)[0];
    }
    updateProjectSwitcherUI();
  } catch (e) {
    console.warn("Failed to load projects from localStorage:", e);
  }
}
function saveProjects() {
  try {
    const toStore = {};
    for (const [id, data] of Object.entries(projects)) {
      toStore[id] = {
        rootPath: data.rootPath,
        name: data.name,
        selectedPaths: [...data.selectedPaths],
        knownDirs: [...data.knownDirs],
        fileContentsMap: Object.fromEntries(data.fileContentsMap),
        activeFilePath: data.activeFilePath
      };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (e) {
    console.warn("Failed to save projects:", e);
  }
}
async function addProject() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select project folder"
  });
  if (!selected) return;
  const path = selected;
  const name = path.split(/[\\/]/).pop() || "project";
  if (projects[path]) {
    setActiveProject(path);
    showSnackbar(`Switched to: ${name}`, { type: "info" });
    return;
  }
  projects[path] = {
    rootPath: path,
    name,
    selectedPaths: /* @__PURE__ */ new Set(),
    knownDirs: /* @__PURE__ */ new Set(),
    fileContentsMap: /* @__PURE__ */ new Map(),
    activeFilePath: null
  };
  saveProjects();
  activeProjectId = path;
  updateProjectSwitcherUI();
  renderProjectDropdown();
  window.dispatchEvent(new CustomEvent("project-added", { detail: { projectId: path } }));
  showSnackbar(`Opened project: ${name}`, { type: "success" });
}
function closeProject(projectId) {
  if (!projects[projectId]) return;
  const wasActive = activeProjectId === projectId;
  const projectName = projects[projectId].name;
  delete projects[projectId];
  if (wasActive) {
    const remainingIds = Object.keys(projects);
    activeProjectId = remainingIds.length > 0 ? remainingIds[0] : null;
    localStorage.setItem("wingman_active_project", activeProjectId || "");
  }
  saveProjects();
  updateProjectSwitcherUI();
  renderProjectDropdown();
  window.dispatchEvent(new CustomEvent("project-closed", {
    detail: { projectId, wasActive, newActiveProjectId: activeProjectId }
  }));
  showSnackbar(`Closed project: ${projectName}`, { type: "info" });
}
function getActiveProjectId() {
  return activeProjectId;
}
function getProjectState(projectId) {
  const proj = projects[projectId];
  if (!proj) return null;
  return {
    selectedPaths: proj.selectedPaths,
    knownDirs: proj.knownDirs,
    fileContentsMap: proj.fileContentsMap,
    activeFilePath: proj.activeFilePath,
    rootPath: proj.rootPath
  };
}
function updateProjectState(projectId, updates) {
  const proj = projects[projectId];
  if (!proj) return;
  if (updates.selectedPaths !== void 0) proj.selectedPaths = updates.selectedPaths;
  if (updates.knownDirs !== void 0) proj.knownDirs = updates.knownDirs;
  if (updates.fileContentsMap !== void 0) proj.fileContentsMap = updates.fileContentsMap;
  if (updates.activeFilePath !== void 0) proj.activeFilePath = updates.activeFilePath;
  saveProjects();
}

// src/assets/components/codeTree.js
var { invoke: invoke2 } = window.__TAURI__.core;
var projectStates = /* @__PURE__ */ new Map();
var panelIdCounter = 0;
function ensureProjectState(projectId) {
  if (!projectStates.has(projectId)) {
    const stored = getProjectState(projectId);
    const panelId = `project-${++panelIdCounter}`;
    projectStates.set(projectId, {
      selectedPaths: stored?.selectedPaths || /* @__PURE__ */ new Set(),
      knownDirs: stored?.knownDirs || /* @__PURE__ */ new Set(),
      fileContentsMap: stored?.fileContentsMap || /* @__PURE__ */ new Map(),
      activeFilePath: stored?.activeFilePath || null,
      rootPath: stored?.rootPath || "",
      codeTreePanel: null,
      treeContainer: null,
      panelId
      // store it
    });
  }
  return projectStates.get(projectId);
}
function initializeCodeTree({ projectId, rootPath, treeContainer, parentSection }) {
  const state = ensureProjectState(projectId);
  state.rootPath = rootPath;
  state.treeContainer = treeContainer;
  state.codeTreePanel = createCodeTreePanel(projectId);
  parentSection.prepend(state.codeTreePanel);
  treeContainer.addEventListener("change", (e) => handleCheckboxChange(e, projectId));
  loadMissingFiles(projectId);
}
function createCodeTreePanel(projectId) {
  const state = projectStates.get(projectId);
  const panelId = state.panelId;
  const panel = document.createElement("div");
  panel.className = "w-full h-full flex flex-col bg-slate-900 text-gray-100 rounded-lg shadow-sm overflow-hidden";
  panel.innerHTML = `
    <div id="editor-tabs-${panelId}" class="flex overflow-x-auto bg-slate-800 border-b border-slate-700 shrink-0 hide-scrollbar"></div>
    <div id="editor-area-${panelId}" class="flex-1 relative overflow-hidden flex flex-col">
      <textarea id="code-editor-${panelId}" class="flex-1 w-full bg-slate-900 text-gray-100 font-mono text-xs sm:text-sm p-4 resize-none outline-none border-none leading-5" spellcheck="false" placeholder="Select files from the sidebar to view and edit..."></textarea>
    </div>
  `;
  const editor = panel.querySelector(`#code-editor-${panelId}`);
  editor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const spaces = "  ";
      editor.value = editor.value.substring(0, start) + spaces + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + spaces.length;
      const state2 = projectStates.get(projectId);
      if (state2 && state2.activeFilePath) {
        state2.fileContentsMap.set(state2.activeFilePath, editor.value);
        updateProjectState(projectId, { fileContentsMap: state2.fileContentsMap });
      }
    }
  });
  editor.addEventListener("input", () => {
    const state2 = projectStates.get(projectId);
    if (state2 && state2.activeFilePath) {
      state2.fileContentsMap.set(state2.activeFilePath, editor.value);
      updateProjectState(projectId, { fileContentsMap: state2.fileContentsMap });
    }
  });
  return panel;
}
function renderTabs(projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  const panelId = state.panelId;
  const tabsContainer = state.codeTreePanel?.querySelector(`#editor-tabs-${panelId}`);
  if (!tabsContainer) return;
  tabsContainer.innerHTML = "";
  const filePaths = Array.from(state.selectedPaths).filter((p) => !state.knownDirs.has(p)).sort();
  if (filePaths.length === 0) {
    state.activeFilePath = null;
    renderEditor(projectId);
    return;
  }
  if (!state.activeFilePath || !filePaths.includes(state.activeFilePath)) {
    state.activeFilePath = filePaths[0];
  }
  for (const path of filePaths) {
    const fileName = path.split(/[\\/]/).pop() || "unknown";
    const isActive = path === state.activeFilePath;
    const tab = document.createElement("div");
    tab.className = `flex items-center gap-2 px-3 py-2 text-xs cursor-pointer border-r border-slate-700 shrink-0 transition-colors select-none ${isActive ? "bg-slate-900 text-white border-t-2 border-t-blue-500" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"}`;
    const nameSpan = document.createElement("span");
    nameSpan.textContent = fileName;
    nameSpan.className = "truncate max-w-[120px]";
    const closeBtn = document.createElement("button");
    closeBtn.className = "hover:bg-slate-600 rounded p-0.5 flex items-center justify-center";
    closeBtn.innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selectedPaths.delete(path);
      state.fileContentsMap.delete(path);
      syncCheckboxes(projectId);
      if (state.activeFilePath === path) {
        const remaining = Array.from(state.selectedPaths).filter((p) => !state.knownDirs.has(p));
        state.activeFilePath = remaining.length > 0 ? remaining[0] : null;
      }
      updateProjectState(projectId, { selectedPaths: state.selectedPaths, fileContentsMap: state.fileContentsMap, activeFilePath: state.activeFilePath });
      renderTabs(projectId);
    });
    tab.appendChild(nameSpan);
    tab.appendChild(closeBtn);
    tab.addEventListener("click", () => {
      state.activeFilePath = path;
      updateProjectState(projectId, { activeFilePath: state.activeFilePath });
      renderTabs(projectId);
      renderEditor(projectId);
    });
    tabsContainer.appendChild(tab);
  }
  renderEditor(projectId);
}
function renderEditor(projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  const panelId = state.panelId;
  const editor = state.codeTreePanel?.querySelector(`#code-editor-${panelId}`);
  if (!editor) return;
  if (state.activeFilePath && state.fileContentsMap.has(state.activeFilePath)) {
    editor.value = state.fileContentsMap.get(state.activeFilePath);
    editor.dataset.path = state.activeFilePath;
    editor.disabled = false;
  } else {
    editor.value = "// Select a file from the sidebar to view and edit its contents.";
    editor.dataset.path = "";
    editor.disabled = true;
  }
}
var progressSnackbar = null;
function showProgress(message) {
  if (progressSnackbar) {
    progressSnackbar.textContent = message;
    return;
  }
  const container = createSnackbarContainer();
  const snackbar = document.createElement("div");
  snackbar.className = "px-4 py-2 rounded-lg shadow-lg text-white font-medium text-sm bg-blue-600 opacity-0 transition-opacity duration-200";
  snackbar.textContent = message;
  container.appendChild(snackbar);
  setTimeout(() => snackbar.classList.remove("opacity-0"), 10);
  progressSnackbar = snackbar;
}
function hideProgress() {
  if (progressSnackbar) {
    progressSnackbar.classList.add("opacity-0");
    setTimeout(() => {
      progressSnackbar.remove();
      progressSnackbar = null;
      const container = document.querySelector(".fixed.bottom-4.left-1\\/2");
      if (container && container.children.length === 0) {
        container.remove();
      }
    }, 200);
  }
}
async function loadMissingFiles(projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  const filePaths = Array.from(state.selectedPaths).filter((p) => !state.knownDirs.has(p));
  const missingPaths = filePaths.filter((p) => !state.fileContentsMap.has(p));
  if (missingPaths.length === 0) {
    renderTabs(projectId);
    return;
  }
  showProgress(`Loading ${missingPaths.length} files...`);
  await new Promise(requestAnimationFrame);
  try {
    const fileContents = await invoke2("read_multiple_files", { paths: missingPaths });
    let loaded = 0;
    for (const file of fileContents) {
      if (previewCancelled) return;
      loaded++;
      if (file.error) {
        state.fileContentsMap.set(file.path, `/* ERROR: ${file.error} */`);
      } else {
        state.fileContentsMap.set(file.path, file.content);
      }
      if (loaded % 20 === 0) {
        showProgress(`Loading ${missingPaths.length} files... (${loaded}/${missingPaths.length})`);
        await new Promise(requestAnimationFrame);
      }
    }
    updateProjectState(projectId, { fileContentsMap: state.fileContentsMap });
  } catch (err) {
    console.error("Failed to read files:", err);
    showSnackbar("Failed to load files", { type: "error" });
  } finally {
    hideProgress();
    renderTabs(projectId);
  }
}
async function handleCheckboxChange(e, projectId) {
  if (!e.target.matches('input[type="checkbox"]')) return;
  const path = e.target.dataset.path;
  const isChecked = e.target.checked;
  const state = projectStates.get(projectId);
  if (!state) return;
  const isDir = !!document.querySelector(`details[data-path="${CSS.escape(path)}"]`);
  if (isDir) {
    showGlobalOverlay("Scanning directory\u2026");
    lockUI();
    await new Promise(requestAnimationFrame);
    try {
      const allPaths = await invoke2("get_all_paths_in_directory", { path });
      allPaths.push(path);
      await applyPathsChunked(allPaths, isChecked, projectId);
    } finally {
      hideGlobalOverlay();
      unlockUI();
    }
  } else {
    if (isChecked) {
      state.selectedPaths.add(path);
    } else {
      state.selectedPaths.delete(path);
      state.fileContentsMap.delete(path);
      if (state.activeFilePath === path) {
        const remaining = Array.from(state.selectedPaths).filter((p) => !state.knownDirs.has(p));
        state.activeFilePath = remaining.length > 0 ? remaining[0] : null;
      }
    }
  }
  if (!isDir) syncCheckboxes(projectId);
  updateProjectState(projectId, { selectedPaths: state.selectedPaths, fileContentsMap: state.fileContentsMap, activeFilePath: state.activeFilePath });
  await loadMissingFiles(projectId);
}
async function applyPathsChunked(paths, isChecked, projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  for (const p of paths) {
    if (isChecked) state.selectedPaths.add(p);
    else state.selectedPaths.delete(p);
  }
  updateProjectState(projectId, { selectedPaths: state.selectedPaths });
}
function syncCheckboxes(projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  document.querySelectorAll('#tree input[type="checkbox"]').forEach((cb) => {
    cb.checked = state.selectedPaths.has(cb.dataset.path);
  });
}
async function saveCurrentFile(projectId) {
  const state = projectStates.get(projectId);
  if (!state || !state.activeFilePath) {
    showSnackbar("No active file", { type: "info" });
    return;
  }
  const content = state.fileContentsMap.get(state.activeFilePath);
  if (content === void 0) {
    showSnackbar("No content to save", { type: "info" });
    return;
  }
  try {
    await invoke2("write_to_file", { path: state.activeFilePath, content });
    showSnackbar("File saved!", { type: "success" });
  } catch (err) {
    showSnackbar("Save failed: " + err.message, { type: "error" });
  }
}
async function copyCurrentFile(projectId) {
  const state = projectStates.get(projectId);
  if (!state || !state.activeFilePath) {
    showSnackbar("No active file", { type: "info" });
    return;
  }
  try {
    await invoke2("write_to_clipboard", { text: state.fileContentsMap.get(state.activeFilePath) || "" });
    showSnackbar("Current file copied!", { type: "success" });
  } catch (err) {
    showSnackbar("Copy failed", { type: "error" });
  }
}
async function copyAllFiles(projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  const filePaths = Array.from(state.selectedPaths).filter((p) => !state.knownDirs.has(p)).sort();
  if (filePaths.length === 0) {
    showSnackbar("No files to copy", { type: "info" });
    return;
  }
  let output = "";
  for (const path of filePaths) {
    const relPath = path.replace(state.rootPath, "").replace(/^[\\/]/, "");
    output += `# ${relPath}
${state.fileContentsMap.get(path) || ""}

`;
  }
  try {
    await invoke2("write_to_clipboard", { text: output.trimEnd() });
    showSnackbar("All files copied!", { type: "success" });
  } catch (err) {
    showSnackbar("Copy failed", { type: "error" });
  }
}
function clearAllSelections(projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  state.selectedPaths.clear();
  state.fileContentsMap.clear();
  state.activeFilePath = null;
  syncCheckboxes(projectId);
  renderTabs(projectId);
  updateProjectState(projectId, { selectedPaths: state.selectedPaths, fileContentsMap: state.fileContentsMap, activeFilePath: state.activeFilePath });
  showSnackbar("Cleared all selections", { type: "info" });
}
var globalOverlay = null;
function ensureGlobalOverlay() {
  if (globalOverlay) return;
  globalOverlay = document.createElement("div");
  globalOverlay.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm";
  globalOverlay.style.display = "none";
  globalOverlay.innerHTML = `
    <div class="flex items-center gap-3 bg-white px-5 py-3 rounded shadow">
      <svg class="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <span class="text-sm text-slate-700" id="global-overlay-text">Working\u2026</span>
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
  if (globalOverlay) globalOverlay.style.display = "none";
}
function lockUI() {
  document.body.style.pointerEvents = "none";
  document.body.style.cursor = "wait";
}
function unlockUI() {
  document.body.style.pointerEvents = "";
  document.body.style.cursor = "";
}
var previewCancelled = false;

// src/assets/components/sidebar.js
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggle-sidebar");
  const closeBtn = document.getElementById("close-sidebar");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  function openSidebar() {
    sidebar.classList.remove("-translate-x-full");
    sidebar.classList.add("translate-x-0");
    overlay.classList.remove("opacity-0", "invisible");
    overlay.classList.add("opacity-100", "visible");
    document.body.style.overflow = "hidden";
  }
  function closeSidebar() {
    sidebar.classList.add("-translate-x-full");
    sidebar.classList.remove("translate-x-0");
    overlay.classList.add("opacity-0", "invisible");
    overlay.classList.remove("opacity-100", "visible");
    document.body.style.overflow = "";
  }
  toggleBtn?.addEventListener("click", openSidebar);
  closeBtn?.addEventListener("click", closeSidebar);
  overlay?.addEventListener("click", closeSidebar);
  let touchStartX = 0;
  let touchEndX = 0;
  sidebar?.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  sidebar?.addEventListener("touchend", (e) => {
    touchEndX = e.changedTouches[0].screenX;
    if (touchStartX - touchEndX > 80) {
      closeSidebar();
    }
  }, { passive: true });
});

// src/main.js
var { invoke: invoke3 } = window.__TAURI__.core;
var rootNodes = {};
var currentProjectId = null;
function renderNode(node, projectId) {
  const state = projectStates.get(projectId);
  if (!state) return document.createElement("li");
  const li = document.createElement("li");
  li.className = "ml-4 tree-node";
  const itemContainer = document.createElement("div");
  itemContainer.className = "flex items-center gap-1.5";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.path = node.path;
  checkbox.className = "mt-0.5 h-4 w-4 shrink-0";
  const nameLabel = document.createElement("span");
  nameLabel.textContent = node.name;
  nameLabel.className = node.is_dir ? "cursor-pointer font-medium text-slate-800 hover:text-blue-600 truncate" : "text-slate-600 truncate";
  itemContainer.appendChild(checkbox);
  itemContainer.appendChild(nameLabel);
  if (node.is_dir) {
    state.knownDirs.add(node.path);
    const details = document.createElement("details");
    details.dataset.path = node.path;
    details.dataset.loaded = "false";
    const summary = document.createElement("summary");
    summary.className = "list-none cursor-pointer py-1";
    summary.appendChild(itemContainer);
    const ul = document.createElement("ul");
    ul.className = "border-l border-slate-300 ml-2 pl-2 mt-1";
    details.appendChild(summary);
    details.appendChild(ul);
    li.appendChild(details);
    checkbox.addEventListener("change", async (e) => {
      e.stopPropagation();
      await propagateFolderCheckbox(node.path, checkbox.checked, projectId);
    });
    details.addEventListener("toggle", async () => {
      if (!details.open) return;
      if (details.dataset.loaded !== "false") return;
      details.dataset.loaded = "loading";
      const loading = document.createElement("li");
      loading.textContent = "Loading\u2026";
      loading.className = "ml-6 text-slate-400 italic py-1";
      ul.appendChild(loading);
      try {
        const children = await invoke3("get_children_for_path", { path: node.path });
        ul.innerHTML = "";
        node.children = children;
        for (const child of children) {
          ul.appendChild(renderNode(child, projectId));
        }
        details.dataset.loaded = "true";
        syncCheckboxes(projectId);
      } catch (err) {
        ul.innerHTML = "";
        const error = document.createElement("li");
        error.textContent = "Failed to load";
        error.className = "ml-6 text-red-500 py-1";
        ul.appendChild(error);
        details.dataset.loaded = "false";
      }
    });
  } else {
    li.replaceChildren(itemContainer);
    li.className = "ml-6 text-slate-600 hover:text-slate-900 cursor-default py-1";
    li.dataset.path = node.path;
  }
  return li;
}
async function propagateFolderCheckbox(folderPath, checked, projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  try {
    const allPaths = await invoke3("get_all_paths_in_directory", { path: folderPath });
    allPaths.push(folderPath);
    if (checked) {
      const infos = await invoke3("get_file_info", { paths: allPaths });
      infos.forEach((info) => {
        if (info.is_dir) state.knownDirs.add(info.path);
      });
      allPaths.forEach((p) => state.selectedPaths.add(p));
    } else {
      allPaths.forEach((p) => state.selectedPaths.delete(p));
    }
    syncCheckboxes(projectId);
    await loadMissingFiles(projectId);
  } catch (err) {
    console.error("Failed to propagate checkbox:", err);
  }
}
async function loadTreeForProject(projectId) {
  currentProjectId = projectId;
  const state = ensureProjectState(projectId);
  const projectDir = state.rootPath;
  try {
    const root = await invoke3("get_tree_for_path", { path: projectDir });
    rootNodes[projectId] = root;
    const treeContainer = document.getElementById("tree");
    treeContainer.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "text-sm font-mono";
    ul.appendChild(renderNode(root, projectId));
    treeContainer.appendChild(ul);
    setTimeout(() => {
      const rootDetails = treeContainer.querySelector("details[data-path]");
      if (rootDetails) rootDetails.open = true;
    }, 100);
    initializeCodeTree({
      projectId,
      rootPath: projectDir,
      treeContainer: document.getElementById("tree"),
      parentSection: document.querySelector("main")
    });
  } catch (err) {
    console.error("Tree loading error:", err);
    document.getElementById("tree").textContent = "Failed to load directory tree";
  }
}
window.addEventListener("project-added", (e) => {
  loadTreeForProject(e.detail.projectId);
});
window.addEventListener("project-switched", (e) => {
  loadTreeForProject(e.detail.projectId);
});
window.addEventListener("project-closed", (e) => {
  if (e.detail.wasActive) {
    if (!e.detail.newActiveProjectId) {
      document.getElementById("tree").innerHTML = '<p class="text-slate-400 italic">No project open</p>';
      document.querySelector("main").innerHTML = "";
    }
  }
});
window.addEventListener("DOMContentLoaded", () => {
  loadProjects();
  const projectSwitcher = document.getElementById("project-switcher");
  const projectSwitcherContainer = document.getElementById("project-switcher-container");
  projectSwitcher?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleProjectDropdown();
  });
  document.addEventListener("click", (e) => {
    if (!projectSwitcherContainer.contains(e.target)) {
      closeProjectDropdown();
    }
  });
  document.getElementById("open-project-dropdown")?.addEventListener("click", () => {
    closeProjectDropdown();
    addProject();
  });
  const menuToggle = document.getElementById("menu-toggle");
  const mainMenuDropdown = document.getElementById("main-menu-dropdown");
  menuToggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    mainMenuDropdown.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!menuToggle.contains(e.target) && !mainMenuDropdown.contains(e.target)) {
      mainMenuDropdown.classList.add("hidden");
    }
  });
  document.getElementById("refresh-app")?.addEventListener("click", () => {
    window.location.reload();
  });
  document.getElementById("toggle-sidebar")?.addEventListener("click", () => {
    document.getElementById("toggle-sidebar").click();
  });
  document.getElementById("save-current-file")?.addEventListener("click", () => {
    const activeId = getActiveProjectId();
    if (activeId) saveCurrentFile(activeId);
  });
  document.getElementById("copy-current-file")?.addEventListener("click", () => {
    const activeId = getActiveProjectId();
    if (activeId) copyCurrentFile(activeId);
  });
  document.getElementById("copy-all-files")?.addEventListener("click", () => {
    const activeId = getActiveProjectId();
    if (activeId) copyAllFiles(activeId);
  });
  document.getElementById("clear-all-files")?.addEventListener("click", () => {
    const activeId = getActiveProjectId();
    if (activeId) clearAllSelections(activeId);
  });
  const initialProjectId = getActiveProjectId();
  if (initialProjectId) {
    loadTreeForProject(initialProjectId);
  }
});
