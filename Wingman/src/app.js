// src/assets/components/snackbar.js
var snackbarContainer = null;
function createSnackbarContainer() {
  if (snackbarContainer) return snackbarContainer;
  snackbarContainer = document.createElement("div");
  snackbarContainer.className = "fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[10000]";
  document.body.appendChild(snackbarContainer);
  return snackbarContainer;
}
function showSnackbar(message, { duration = 3e3, type = "success", actions = [] } = {}) {
  const container = createSnackbarContainer();
  const snackbar = document.createElement("div");
  snackbar.className = `
    px-4 py-2 rounded-lg shadow-lg text-white font-medium text-sm
    ${type === "success" ? "bg-green-600" : "bg-red-600"}
    opacity-0 transition-opacity duration-200
    flex items-center gap-3
  `;
  const msgSpan = document.createElement("span");
  msgSpan.textContent = message;
  snackbar.appendChild(msgSpan);
  if (actions.length > 0) {
    const btnGroup = document.createElement("div");
    btnGroup.className = "flex gap-2";
    actions.forEach(({ label, callback }) => {
      const btn = document.createElement("button");
      btn.className = "bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-xs font-medium transition-colors";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        callback();
        closeSnackbar(snackbar);
      });
      btnGroup.appendChild(btn);
    });
    snackbar.appendChild(btnGroup);
    if (actions.length > 0) duration = Math.max(duration, 8e3);
  }
  container.appendChild(snackbar);
  setTimeout(() => snackbar.classList.remove("opacity-0"), 10);
  const timeoutId = setTimeout(() => {
    closeSnackbar(snackbar);
  }, duration);
  snackbar.dataset.timeoutId = timeoutId;
  function closeSnackbar(el) {
    if (!el || el.parentNode === null) return;
    clearTimeout(parseInt(el.dataset.timeoutId));
    el.classList.add("opacity-0");
    setTimeout(() => {
      el.remove();
      if (container.children.length === 0) {
        container.remove();
        snackbarContainer = null;
      }
    }, 200);
  }
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

// src/assets/components/modal.js
var { invoke: invoke2 } = window.__TAURI__.core;
var createModalInitialized = false;
var createModal = null;
var textModalInitialized = false;
var textModal = null;
var confirmModalInitialized = false;
var confirmModal = null;
var confirmCallback = null;
function showCreateItemModal(parentPath, projectId, onCreated) {
  if (!createModalInitialized) {
    createModal = document.createElement("div");
    createModal.id = "create-item-modal";
    createModal.className = "hidden fixed inset-0 z-[10000] flex items-center justify-center p-4";
    createModal.innerHTML = `
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" id="create-modal-backdrop"></div>
      <div class="relative bg-white rounded-lg shadow-xl max-w-md w-full flex flex-col z-50">
        <div class="px-4 py-3 border-b flex justify-between items-center">
          <h3 class="font-medium text-slate-800">Create New Item</h3>
          <button id="create-modal-close" class="text-slate-500 hover:text-slate-800 text-xl leading-none">&times;</button>
        </div>
        <div class="p-4 flex flex-col gap-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Parent Directory</label>
            <div id="create-modal-parent" class="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-1.5 rounded truncate"></div>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Type</label>
            <div class="flex gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="item-type" value="file" checked class="accent-blue-600 w-4 h-4">
                <span class="text-sm text-slate-700">File</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="item-type" value="folder" class="accent-blue-600 w-4 h-4">
                <span class="text-sm text-slate-700">Folder</span>
              </label>
            </div>
          </div>
          <div>
            <label for="create-item-name" class="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input type="text" id="create-item-name" class="w-full px-3 py-2 text-sm border rounded-md border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="e.g., new-file.js or new-folder">
          </div>
        </div>
        <div class="px-4 py-3 border-t bg-slate-50 flex justify-end gap-2 rounded-b-lg">
          <button id="create-modal-cancel" class="px-4 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">Cancel</button>
          <button id="create-modal-ok" class="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(createModal);
    const close = () => {
      createModal.classList.add("hidden");
      document.body.style.overflow = "";
      const nameInput2 = document.getElementById("create-item-name");
      if (nameInput2) nameInput2.value = "";
    };
    createModal.querySelector("#create-modal-backdrop").addEventListener("click", close);
    createModal.querySelector("#create-modal-close").addEventListener("click", close);
    createModal.querySelector("#create-modal-cancel").addEventListener("click", close);
    createModal.querySelector("#create-modal-ok").addEventListener("click", async () => {
      const nameInput2 = document.getElementById("create-item-name");
      const name = nameInput2.value.trim();
      const type = createModal.querySelector('input[name="item-type"]:checked').value;
      if (!name) {
        showSnackbar("Please enter a name", { type: "error" });
        nameInput2.focus();
        return;
      }
      if (/[<>:"/\\|?*]/.test(name)) {
        showSnackbar("Name contains invalid characters", { type: "error" });
        return;
      }
      const separator = parentPath.endsWith("/") || parentPath.endsWith("\\") ? "" : "/";
      const fullPath = `${parentPath}${separator}${name}`;
      const okBtn = createModal.querySelector("#create-modal-ok");
      const originalText = okBtn.textContent;
      okBtn.textContent = "Creating...";
      okBtn.disabled = true;
      try {
        if (type === "folder") {
          await invoke2("create_directory", { path: fullPath });
        } else {
          await invoke2("create_file", { path: fullPath });
        }
        close();
        if (onCreated) onCreated();
        showSnackbar(`Created ${type}: ${name}`, { type: "success" });
      } catch (err) {
        showSnackbar(`Failed to create ${type}: ${err.message || err}`, { type: "error" });
      } finally {
        okBtn.textContent = originalText;
        okBtn.disabled = false;
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !createModal.classList.contains("hidden")) {
        close();
      }
    });
    createModalInitialized = true;
  }
  const parentEl = document.getElementById("create-modal-parent");
  const nameInput = document.getElementById("create-item-name");
  if (parentEl) parentEl.textContent = parentPath;
  if (nameInput) nameInput.value = "";
  createModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => {
    if (nameInput) nameInput.focus();
  }, 50);
}
function showTextModal(title, text) {
  if (!textModalInitialized) {
    textModal = document.createElement("div");
    textModal.className = "hidden fixed inset-0 z-[10000] flex items-center justify-center p-4";
    textModal.innerHTML = `
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" id="text-modal-backdrop"></div>
      <div class="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col z-50">
        <div class="px-4 py-3 border-b flex justify-between items-center shrink-0">
          <h3 class="font-medium text-slate-800" id="text-modal-title"></h3>
          <button id="text-modal-close" class="text-slate-500 hover:text-slate-800 text-xl leading-none">&times;</button>
        </div>
        <div class="flex-1 overflow-auto p-4 bg-slate-50">
          <pre id="text-modal-content" class="text-sm font-mono whitespace-pre-wrap break-all text-slate-800"></pre>
        </div>
      </div>
    `;
    document.body.appendChild(textModal);
    const close = () => {
      textModal.classList.add("hidden");
      document.body.style.overflow = "";
    };
    textModal.querySelector("#text-modal-backdrop").addEventListener("click", close);
    textModal.querySelector("#text-modal-close").addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !textModal.classList.contains("hidden")) close();
    });
    textModalInitialized = true;
  }
  document.getElementById("text-modal-title").textContent = title;
  document.getElementById("text-modal-content").textContent = text;
  textModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function showConfirmationModal(title, message, onConfirm) {
  if (!confirmModalInitialized) {
    confirmModal = document.createElement("div");
    confirmModal.className = "hidden fixed inset-0 z-[10000] flex items-center justify-center p-4";
    confirmModal.innerHTML = `
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" id="confirm-modal-backdrop"></div>
      <div class="relative bg-white rounded-lg shadow-xl max-w-md w-full flex flex-col z-50">
        <div class="px-4 py-3 border-b flex justify-between items-center">
          <h3 class="font-medium text-slate-800" id="confirm-modal-title"></h3>
          <button id="confirm-modal-close" class="text-slate-500 hover:text-slate-800 text-xl leading-none">&times;</button>
        </div>
        <div class="p-4">
          <p id="confirm-modal-message" class="text-sm text-slate-600"></p>
        </div>
        <div class="px-4 py-3 border-t bg-slate-50 flex justify-end gap-2 rounded-b-lg">
          <button id="confirm-modal-cancel" class="px-4 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">Cancel</button>
          <button id="confirm-modal-ok" class="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(confirmModal);
    const close = () => {
      confirmModal.classList.add("hidden");
      document.body.style.overflow = "";
      confirmCallback = null;
    };
    confirmModal.querySelector("#confirm-modal-backdrop").addEventListener("click", close);
    confirmModal.querySelector("#confirm-modal-close").addEventListener("click", close);
    confirmModal.querySelector("#confirm-modal-cancel").addEventListener("click", close);
    confirmModal.querySelector("#confirm-modal-ok").addEventListener("click", () => {
      if (typeof confirmCallback === "function") confirmCallback();
      close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !confirmModal.classList.contains("hidden")) close();
    });
    confirmModalInitialized = true;
  }
  document.getElementById("confirm-modal-title").textContent = title;
  document.getElementById("confirm-modal-message").textContent = message;
  confirmCallback = onConfirm;
  confirmModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

// src/assets/components/codeTree.js
var { invoke: invoke3 } = window.__TAURI__.core;
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
function initializeCodeTree({ projectId, rootPath: rootPath2, treeContainer, parentSection }) {
  const state = ensureProjectState(projectId);
  state.rootPath = rootPath2;
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
    const fileContents = await invoke3("read_multiple_files", { paths: missingPaths });
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
      const allPaths = await invoke3("get_all_paths_in_directory", { path });
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
    await invoke3("write_to_file", { path: state.activeFilePath, content });
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
    await invoke3("write_to_clipboard", { text: state.fileContentsMap.get(state.activeFilePath) || "" });
    showSnackbar("Current file copied!", { type: "success" });
  } catch (err) {
    showSnackbar("Copy failed", { type: "error" });
  }
}
async function copyAllFiles(projectId) {
  const state = projectStates.get(projectId);
  if (!state) {
    showSnackbar("No active project", { type: "info" });
    return;
  }
  showProgress("Scanning project files...");
  try {
    const allPaths = await invoke3("get_all_files_in_directory", { path: state.rootPath });
    if (allPaths.length === 0) {
      hideProgress();
      showSnackbar("No files found in project", { type: "info" });
      return;
    }
    showProgress(`Reading ${allPaths.length} files...`);
    const fileContents = await invoke3("read_multiple_files", { paths: allPaths });
    let output = "";
    const treeText = buildUnixTree(allPaths, state.rootPath);
    if (treeText) {
      output += "Directory Tree:\n";
      output += treeText;
      output += "\n\n";
    }
    for (const file of fileContents) {
      const relPath = file.path.replace(state.rootPath, "").replace(/^[\\/]/, "");
      output += `# ${relPath}
`;
      output += file.content || (file.error ? `/* ERROR: ${file.error} */` : "");
      output += "\n\n";
    }
    await invoke3("write_to_clipboard", { text: output.trimEnd() });
    showSnackbar(`Copied all ${allPaths.length} files + directory tree to clipboard.`, {
      type: "success",
      duration: 6e3
    });
  } catch (err) {
    showSnackbar("Copy all failed: " + err.message, { type: "error" });
  } finally {
    hideProgress();
  }
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
async function copySelectedFiles(projectId) {
  const state = projectStates.get(projectId);
  if (!state) {
    showSnackbar("No active project", { type: "info" });
    return;
  }
  const allSelected = Array.from(state.selectedPaths).sort();
  if (allSelected.length === 0) {
    showSnackbar("No files or folders selected", { type: "info" });
    return;
  }
  const treeText = buildUnixTree(allSelected, state.rootPath);
  let output = "";
  if (treeText) {
    output += "Directory Tree:\n";
    output += treeText;
    output += "\n\n";
  }
  const filePaths = allSelected.filter((p) => !state.knownDirs.has(p));
  if (filePaths.length === 0) {
    try {
      await invoke3("write_to_clipboard", { text: output.trimEnd() });
      showSnackbar("Copied directory tree only.", { type: "success" });
    } catch (err) {
      showSnackbar("Copy failed: " + err.message, { type: "error" });
    }
    return;
  }
  for (const path of filePaths) {
    const relPath = path.replace(state.rootPath, "").replace(/^[\\/]/, "");
    output += `# ${relPath}
`;
    output += state.fileContentsMap.get(path) || "";
    output += "\n\n";
  }
  try {
    await invoke3("write_to_clipboard", { text: output.trimEnd() });
    showSnackbar(`Copied ${filePaths.length} selected files + full directory tree.`, {
      type: "success",
      duration: 6e3,
      actions: [
        {
          label: "View Tree",
          callback: () => showTextModal("Full Directory Tree", treeText)
        }
      ]
    });
  } catch (err) {
    showSnackbar("Copy selected failed: " + err.message, { type: "error" });
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
async function loadSingleFile(projectId, filePath) {
  const state = projectStates.get(projectId);
  if (!state) return;
  if (state.fileContentsMap.has(filePath)) return;
  try {
    const content = await invoke3("read_file", { path: filePath });
    state.fileContentsMap.set(filePath, content);
    updateProjectState(projectId, { fileContentsMap: state.fileContentsMap });
  } catch (err) {
    state.fileContentsMap.set(filePath, `/* ERROR: ${err.message} */`);
    updateProjectState(projectId, { fileContentsMap: state.fileContentsMap });
  }
}
async function openFileAtLine(projectId, filePath, lineNumber) {
  const state = projectStates.get(projectId);
  if (!state) return;
  state.selectedPaths.add(filePath);
  await loadSingleFile(projectId, filePath);
  state.activeFilePath = filePath;
  updateProjectState(projectId, {
    selectedPaths: state.selectedPaths,
    activeFilePath: state.activeFilePath
  });
  renderTabs(projectId);
  renderEditor(projectId);
  const panelId = state.panelId;
  const editor = document.querySelector(`#code-editor-${panelId}`);
  if (editor && editor.value) {
    const lines = editor.value.split("\n");
    if (lineNumber <= lines.length) {
      let offset = 0;
      for (let i = 0; i < lineNumber - 1; i++) {
        offset += lines[i].length + 1;
      }
      editor.selectionStart = editor.selectionEnd = offset;
      editor.focus();
      const lineHeight = 20;
      editor.scrollTop = (lineNumber - 1) * lineHeight;
    }
  }
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

// src/assets/components/terminal.js
var { invoke: invoke4 } = window.__TAURI__.core;
var currentPath = "";
var rootPath = "";
var history = [];
var historyIndex = -1;
function initTerminal(container, projectRoot, onClose) {
  rootPath = projectRoot;
  currentPath = projectRoot;
  container.innerHTML = `
<div class="flex flex-col h-full min-h-0 bg-gray-900 text-gray-100 font-mono rounded-lg border border-slate-700 shadow-xl">
    <div class="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 shrink-0 pt-safe">
    <div class="flex items-center gap-2 min-w-0 flex-1">
          <span class="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
          <div class="flex flex-col min-w-0">
            <span class="text-slate-300 text-xs font-bold truncate">Branch Terminal</span>
            <span id="terminal-cwd" class="text-slate-500 text-[10px] font-mono truncate" title=""></span>
          </div>
        </div>
        <div class="flex gap-1 shrink-0">
          <button id="terminal-clear" class="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors">Clear</button>
          <button id="terminal-close" class="text-slate-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-700 transition-colors">&times;</button>
        </div>
      </div>
      <div id="terminal-output" class="flex-1 min-h-0 overflow-y-auto p-3 whitespace-pre-wrap break-all text-xs sm:text-sm overscroll-contain"></div>
    <div class="shrink-0 bg-slate-800 border-t border-slate-700 pb-safe">
        <div class="flex items-center gap-2 px-2 py-2">
          <div class="flex-1 flex items-center bg-slate-900/60 border border-slate-700 rounded-lg px-3 min-h-[44px] focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/30 transition-colors">
            <span class="text-green-500 font-mono text-sm mr-2 select-none">$</span>
            <input id="terminal-input"
                  type="text"
                  inputmode="text"
                  enterkeyhint="send"
                  class="flex-1 bg-transparent border-none outline-none text-green-400 text-sm font-mono min-h-[40px] placeholder:text-slate-600 overflow-x-auto whitespace-nowrap"
                  placeholder="type a command..."
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false" />
          </div>
          <button id="terminal-send"
                  class="shrink-0 w-11 h-11 flex items-center justify-center bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-lg transition-colors"
                  aria-label="Run command">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 5l7 7-7 7M5 12h14"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
  const output = container.querySelector("#terminal-output");
  const input = container.querySelector("#terminal-input");
  const clearBtn = container.querySelector("#terminal-clear");
  const closeBtn = container.querySelector("#terminal-close");
  const sendBtn = container.querySelector("#terminal-send");
  const cwdEl = container.querySelector("#terminal-cwd");
  if (onClose) closeBtn.addEventListener("click", onClose);
  input.addEventListener("focus", () => {
    setTimeout(() => {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  });
  const buildPrompt = () => {
    const projectName = rootPath.split(/[\\/]/).filter(Boolean).pop() || "project";
    if (currentPath === rootPath) {
      return `user@branch:${projectName}$`;
    }
    let rel = currentPath.replace(rootPath, "").replace(/^[\\/]/, "");
    return `user@branch:${projectName}/${rel}$`;
  };
  const updateCwdDisplay = () => {
    if (!cwdEl) return;
    let displayPath;
    if (currentPath === rootPath) {
      displayPath = "~";
    } else {
      displayPath = "~/" + currentPath.replace(rootPath, "").replace(/^[\\/]/, "");
    }
    cwdEl.textContent = displayPath;
    cwdEl.title = currentPath;
  };
  const print = (text, isError = false) => {
    const div = document.createElement("div");
    div.textContent = text;
    if (isError) div.className = "text-red-400";
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  };
  clearBtn.addEventListener("click", () => {
    output.innerHTML = "";
  });
  updateCwdDisplay();
  print("Welcome to Branch Terminal.");
  print("POSIX: ls, cat, grep, sed, mkdir, find (via busybox.wasm)");
  print("Git: init, clone <url>, status, add, commit -m 'msg', branch, checkout <branch>");
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const cmdLine = input.value.trim();
      input.value = "";
      if (!cmdLine) return;
      history.push(cmdLine);
      historyIndex = history.length;
      print(`${buildPrompt()} ${cmdLine}`);
      const args = cmdLine.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((arg) => arg.replace(/^"|"$/g, "")) || [];
      const cmd = args.shift();
      try {
        await executeCommand(cmd, args, print);
      } catch (err) {
        print(`Error: ${err.message || err}`, true);
      }
      updateCwdDisplay();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = history[historyIndex];
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex++;
        input.value = history[historyIndex];
      } else {
        historyIndex = history.length;
        input.value = "";
      }
    }
  });
  sendBtn?.addEventListener("click", () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    input.focus();
  });
  container.addEventListener("click", (e) => {
    if (e.target !== sendBtn) input.focus();
  });
}
async function executeCommand(cmd, args, print) {
  if (cmd === "git") {
    const subcmd = args[0];
    try {
      switch (subcmd) {
        case "init":
          print(await invoke4("git_init", { path: currentPath }));
          break;
        case "clone":
          if (args.length < 2) throw new Error("Usage: git clone <url> [directory]");
          const cloneUrl = args[1];
          const cloneDir = args[2] ? resolvePath(args[2]) : currentPath + "/" + cloneUrl.split("/").pop().replace(".git", "");
          print(await invoke4("git_clone", { url: cloneUrl, path: cloneDir }));
          break;
        case "status":
          print(await invoke4("git_status", { path: currentPath }));
          break;
        case "add":
          const target = args[1] || ".";
          print(await invoke4("git_add", { path: currentPath, filepath: target }));
          break;
        case "commit":
          const msgIndex = args.indexOf("-m");
          const msg = msgIndex !== -1 && args[msgIndex + 1] ? args[msgIndex + 1] : "update";
          print(await invoke4("git_commit", { path: currentPath, message: msg }));
          break;
        case "branch":
          print(await invoke4("git_branch_list", { path: currentPath }));
          break;
        case "checkout":
          if (!args[1]) throw new Error("Usage: git checkout <branch>");
          print(await invoke4("git_checkout", { path: currentPath, branch_name: args[1] }));
          break;
        default:
          throw new Error(`Unsupported git command: ${subcmd}`);
      }
    } catch (err) {
      print(`git: ${err}`, true);
    }
    return;
  }
  if (["ls", "cat", "grep", "sed", "mkdir", "find", "pwd", "cd"].includes(cmd)) {
    if (cmd === "cd") {
      const target = args[0] || rootPath;
      try {
        const stat = await invoke4("get_file_stats", { path: resolvePath(target) });
        if (stat.is_dir) currentPath = resolvePath(target);
        else print(`cd: ${target}: Not a directory`, true);
      } catch (err) {
        print(`cd: ${target}: No such file or directory`, true);
      }
      return;
    }
    if (cmd === "pwd") {
      print(currentPath);
      return;
    }
    const cmdString = args.length > 0 ? `${cmd} ${args.join(" ")}` : cmd;
    try {
      print(await invoke4("execute_posix_command", { cmd: cmdString, cwd: currentPath }));
    } catch (err) {
      print(`${cmd}: ${err}`, true);
    }
    return;
  }
  if (cmd === "clear") {
    document.getElementById("terminal-output").innerHTML = "";
    return;
  }
  if (cmd === "help") {
    print("POSIX: ls, cd, cat, grep, sed, mkdir, find, pwd, clear");
    print("Git: git init, git clone <url>, git status, git add, git commit -m 'msg', git branch, git checkout <branch>");
    return;
  }
  print(`${cmd}: command not found`, true);
}
function resolvePath(p) {
  if (!p) return currentPath;
  if (p === "~" || p === "~/") return rootPath;
  if (p.startsWith("~/")) return rootPath + p.slice(1);
  if (p.startsWith("/")) return p;
  const baseParts = currentPath.split("/").filter(Boolean);
  const pParts = p.split("/").filter(Boolean);
  for (const part of pParts) {
    if (part === "..") baseParts.pop();
    else if (part !== ".") baseParts.push(part);
  }
  return "/" + baseParts.join("/");
}

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
var { invoke: invoke5 } = window.__TAURI__.core;
var rootNodes = {};
var currentProjectId = null;
function createDropdownPortal(menuBtn, items) {
  let dropdown = null;
  function closeDropdown() {
    if (dropdown && dropdown.parentNode) {
      dropdown.parentNode.removeChild(dropdown);
      dropdown = null;
    }
    document.removeEventListener("click", closeDropdown);
  }
  function openDropdown() {
    document.querySelectorAll(".portal-dropdown").forEach((el) => el.remove());
    dropdown = document.createElement("div");
    dropdown.className = "portal-dropdown fixed bg-white rounded-lg shadow-lg border border-slate-200 z-[10000] min-w-[120px] py-1";
    dropdown.style.display = "block";
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2";
      btn.innerHTML = item.html;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (item.action) item.action();
        closeDropdown();
      });
      dropdown.appendChild(btn);
    });
    const rect = menuBtn.getBoundingClientRect();
    dropdown.style.top = rect.bottom + 4 + "px";
    dropdown.style.left = rect.right - 120 + "px";
    document.body.appendChild(dropdown);
    document.addEventListener("click", closeDropdown);
  }
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdown && dropdown.parentNode) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });
}
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
  if (node.is_dir || node.path !== state.rootPath) {
    const menuBtn = document.createElement("button");
    menuBtn.className = "p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors shrink-0";
    menuBtn.innerHTML = `
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 6a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4z"/>
      </svg>
    `;
    menuBtn.title = "More actions";
    const items = [];
    if (node.is_dir) {
      items.push({
        html: `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
    </svg>
    <span>New Item</span>
  `,
        action: () => {
          showCreateItemModal(node.path, projectId, () => {
            const details = document.querySelector(`details[data-path="${CSS.escape(node.path)}"]`);
            if (details && details.open) {
              details.dataset.loaded = "false";
              details.open = false;
              setTimeout(() => {
                details.open = true;
              }, 50);
            }
          });
        }
      });
    }
    if (node.path !== state.rootPath) {
      items.push({
        html: `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          <span>Delete</span>
        `,
        action: () => {
          showConfirmationModal(
            "Delete Confirmation",
            `Are you sure you want to delete "${node.name}"? This action cannot be undone.`,
            () => deleteItem(node.path, projectId)
          );
        }
      });
    }
    createDropdownPortal(menuBtn, items);
    itemContainer.appendChild(menuBtn);
  }
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
        const children = await invoke5("get_children_for_path", { path: node.path });
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
    li.appendChild(itemContainer);
    li.className = "ml-6 text-slate-600 hover:text-slate-900 cursor-default py-1";
    li.dataset.path = node.path;
  }
  return li;
}
async function propagateFolderCheckbox(folderPath, checked, projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  try {
    const allPaths = await invoke5("get_all_paths_in_directory", { path: folderPath });
    allPaths.push(folderPath);
    if (checked) {
      const infos = await invoke5("get_file_info", { paths: allPaths });
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
var searchInput = document.getElementById("search-input");
var searchResults = document.getElementById("search-results");
var searchClear = document.getElementById("search-clear");
var searchTimeout = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  const query = searchInput.value.trim();
  if (!query) {
    searchResults.classList.add("hidden");
    searchClear.classList.add("hidden");
    return;
  }
  searchClear.classList.remove("hidden");
  searchTimeout = setTimeout(() => performSearch(query), 300);
});
searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchResults.classList.add("hidden");
  searchClear.classList.add("hidden");
});
searchInput.addEventListener("blur", () => {
  setTimeout(() => {
    if (!searchResults.matches(":hover") && !searchInput.matches(":focus")) {
      searchResults.classList.add("hidden");
    }
  }, 200);
});
async function performSearch(query) {
  const projectId = getActiveProjectId();
  if (!projectId) {
    showSnackbar("No active project", { type: "info" });
    return;
  }
  const state = projectStates.get(projectId);
  if (!state) {
    showSnackbar("Project state not found", { type: "error" });
    return;
  }
  try {
    const results = await invoke5("search_project_files", {
      pattern: query,
      rootPath: state.rootPath,
      caseSensitive: false
    });
    renderSearchResults(results, projectId);
  } catch (err) {
    const errorMsg = err?.message || err || "Unknown error";
    console.error("Search error:", err);
    showSnackbar("Search failed: " + errorMsg, { type: "error" });
  }
}
function renderSearchResults(results, projectId) {
  const container = searchResults;
  container.innerHTML = "";
  if (results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "px-4 py-3 text-sm text-slate-500 text-center";
    empty.textContent = "No matches found";
    container.appendChild(empty);
    container.classList.remove("hidden");
    return;
  }
  const grouped = results.reduce((acc, match) => {
    if (!acc[match.file_path]) acc[match.file_path] = [];
    acc[match.file_path].push(match);
    return acc;
  }, {});
  for (const [filePath, matches] of Object.entries(grouped)) {
    const fileEntry = document.createElement("div");
    fileEntry.className = "border-b border-slate-100 last:border-b-0";
    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    const header = document.createElement("div");
    header.className = "px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-50 truncate";
    header.textContent = fileName;
    fileEntry.appendChild(header);
    const displayMatches = matches.slice(0, 10);
    for (const match of displayMatches) {
      const item = document.createElement("div");
      item.className = "px-3 py-1.5 hover:bg-blue-50 cursor-pointer text-sm flex items-start gap-2 border-l-2 border-transparent hover:border-blue-500";
      item.innerHTML = `
        <span class="text-slate-400 text-xs font-mono min-w-[2rem]">${match.line_number}</span>
        <span class="text-slate-700 font-mono text-xs truncate">${escapeHtml(match.line_content)}</span>
      `;
      item.addEventListener("click", () => {
        openFileAtLine(projectId, filePath, match.line_number);
        searchResults.classList.add("hidden");
        searchInput.blur();
      });
      fileEntry.appendChild(item);
    }
    if (matches.length > 10) {
      const more = document.createElement("div");
      more.className = "px-3 py-1 text-xs text-slate-400 italic";
      more.textContent = `+ ${matches.length - 10} more matches`;
      fileEntry.appendChild(more);
    }
    container.appendChild(fileEntry);
  }
  container.classList.remove("hidden");
}
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
async function deleteItem(path, projectId) {
  try {
    const state = projectStates.get(projectId);
    if (!state) {
      showSnackbar("Project state not found", { type: "error" });
      return;
    }
    if (path === state.rootPath) {
      showSnackbar("Cannot delete the root project folder", { type: "error" });
      return;
    }
    await invoke5("delete_item", { path });
    const prefix = path + (path.endsWith("/") || path.endsWith("\\") ? "" : "/");
    for (const p of state.selectedPaths) {
      if (p === path || p.startsWith(prefix)) state.selectedPaths.delete(p);
    }
    for (const p of state.knownDirs) {
      if (p === path || p.startsWith(prefix)) state.knownDirs.delete(p);
    }
    for (const [key] of state.fileContentsMap) {
      if (key === path || key.startsWith(prefix)) state.fileContentsMap.delete(key);
    }
    if (state.activeFilePath && (state.activeFilePath === path || state.activeFilePath.startsWith(prefix))) {
      state.activeFilePath = null;
    }
    updateProjectState(projectId, {
      selectedPaths: state.selectedPaths,
      knownDirs: state.knownDirs,
      fileContentsMap: state.fileContentsMap,
      activeFilePath: state.activeFilePath
    });
    const element = document.querySelector(`[data-path="${CSS.escape(path)}"]`);
    if (element) {
      let targetNode;
      if (element.tagName === "LI" && !element.classList.contains("tree-node")) {
        targetNode = element;
      } else {
        targetNode = element.closest(".tree-node");
      }
      if (targetNode) {
        targetNode.remove();
      } else {
        console.warn("No target node found for path:", path);
      }
    } else {
      console.warn("Element with data-path not found:", path);
    }
    renderTabs(projectId);
    syncCheckboxes(projectId);
    showSnackbar(`Deleted: ${path}`, { type: "success" });
  } catch (err) {
    showSnackbar(`Failed to delete: ${err}`, { type: "error" });
  }
}
async function loadTreeForProject(projectId) {
  currentProjectId = projectId;
  const state = ensureProjectState(projectId);
  const projectDir = state.rootPath;
  try {
    const root = await invoke5("get_tree_for_path", { path: projectDir });
    rootNodes[projectId] = root;
    state.rootNode = root;
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
  document.getElementById("copy-selected-files")?.addEventListener("click", () => {
    const activeId = getActiveProjectId();
    if (activeId) copySelectedFiles(activeId);
  });
  const initialProjectId = getActiveProjectId();
  if (initialProjectId) {
    loadTreeForProject(initialProjectId);
  }
  const terminalContainer = document.getElementById("terminal-container");
  let terminalInitialized = false;
  let terminalProjectId = null;
  function toggleTerminal() {
    if (!terminalContainer) return;
    const isOpen = !terminalContainer.classList.contains("translate-y-full");
    if (isOpen) {
      terminalContainer.classList.add("translate-y-full");
    } else {
      const projectId = getActiveProjectId();
      if (!projectId) {
        showSnackbar("Open a project first", { type: "info" });
        return;
      }
      if (!terminalInitialized || terminalProjectId !== projectId) {
        const state = projectStates.get(projectId);
        if (!state) {
          showSnackbar("Project state not loaded", { type: "error" });
          return;
        }
        terminalContainer.querySelector("#terminal-output").innerHTML = "";
        terminalContainer.querySelector("#terminal-input").value = "";
        initTerminal(terminalContainer, state.rootPath, () => {
          terminalContainer.classList.add("translate-y-full");
        });
        terminalInitialized = true;
        terminalProjectId = projectId;
      }
      terminalContainer.classList.remove("translate-y-full");
    }
  }
  document.getElementById("toggle-terminal")?.addEventListener("click", toggleTerminal);
});
