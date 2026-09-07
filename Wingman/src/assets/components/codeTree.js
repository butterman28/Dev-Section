// src/assets/components/codeTree.js
import { showSnackbar, createSnackbarContainer } from "./snackbar.js";
import { getProjectState, updateProjectState, getActiveProject } from "./projects.js";

const { invoke } = window.__TAURI__.core;

// Map projectId -> { selectedPaths, knownDirs, fileContentsMap, activeFilePath, rootPath, codeTreePanel, treeContainer }
export const projectStates = new Map();

// Helper to get or create a project's state
// Add a counter at the top of the file
let panelIdCounter = 0;

export function ensureProjectState(projectId) {
  if (!projectStates.has(projectId)) {
    const stored = getProjectState(projectId);
    // Generate a unique, CSS-safe ID for this project's DOM elements
    const panelId = `project-${++panelIdCounter}`;
    projectStates.set(projectId, {
      selectedPaths: stored?.selectedPaths || new Set(),
      knownDirs: stored?.knownDirs || new Set(),
      fileContentsMap: stored?.fileContentsMap || new Map(),
      activeFilePath: stored?.activeFilePath || null,
      rootPath: stored?.rootPath || "",
      codeTreePanel: null,
      treeContainer: null,
      panelId,                       // store it
    });
  }
  return projectStates.get(projectId);
}

export function initializeCodeTree({ projectId, rootPath, treeContainer, parentSection }) {
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
      const state = projectStates.get(projectId);
      if (state && state.activeFilePath) {
        state.fileContentsMap.set(state.activeFilePath, editor.value);
        updateProjectState(projectId, { fileContentsMap: state.fileContentsMap });
      }
    }
  });
  editor.addEventListener("input", () => {
    const state = projectStates.get(projectId);
    if (state && state.activeFilePath) {
      state.fileContentsMap.set(state.activeFilePath, editor.value);
      updateProjectState(projectId, { fileContentsMap: state.fileContentsMap });
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
  const filePaths = Array.from(state.selectedPaths).filter(p => !state.knownDirs.has(p)).sort();
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
        const remaining = Array.from(state.selectedPaths).filter(p => !state.knownDirs.has(p));
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

let progressSnackbar = null;
function showProgress(message) {
  if (progressSnackbar) {
    progressSnackbar.textContent = message;
    return;
  }
  const container = createSnackbarContainer();
  const snackbar = document.createElement("div");
  snackbar.className =
    "px-4 py-2 rounded-lg shadow-lg text-white font-medium text-sm bg-blue-600 opacity-0 transition-opacity duration-200";
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

export async function loadMissingFiles(projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  const filePaths = Array.from(state.selectedPaths).filter(p => !state.knownDirs.has(p));
  const missingPaths = filePaths.filter(p => !state.fileContentsMap.has(p));
  if (missingPaths.length === 0) {
    renderTabs(projectId);
    return;
  }
  showProgress(`Loading ${missingPaths.length} files...`);
  await new Promise(requestAnimationFrame);
  try {
    const fileContents = await invoke("read_multiple_files", { paths: missingPaths });
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
    showGlobalOverlay("Scanning directory…");
    lockUI();
    await new Promise(requestAnimationFrame);
    try {
      const allPaths = await invoke("get_all_paths_in_directory", { path });
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
        const remaining = Array.from(state.selectedPaths).filter(p => !state.knownDirs.has(p));
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

export function syncCheckboxes(projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  document.querySelectorAll('#tree input[type="checkbox"]').forEach(cb => {
    cb.checked = state.selectedPaths.has(cb.dataset.path);
  });
}

// --- Exported Actions (now require projectId) ---
export async function saveCurrentFile(projectId) {
  const state = projectStates.get(projectId);
  if (!state || !state.activeFilePath) {
    showSnackbar("No active file", { type: "info" });
    return;
  }
  const content = state.fileContentsMap.get(state.activeFilePath);
  if (content === undefined) {
    showSnackbar("No content to save", { type: "info" });
    return;
  }
  try {
    await invoke("write_to_file", { path: state.activeFilePath, content });
    showSnackbar("File saved!", { type: "success" });
  } catch (err) {
    showSnackbar("Save failed: " + err.message, { type: "error" });
  }
}

export async function copyCurrentFile(projectId) {
  const state = projectStates.get(projectId);
  if (!state || !state.activeFilePath) {
    showSnackbar("No active file", { type: "info" });
    return;
  }
  try {
    await invoke("write_to_clipboard", { text: state.fileContentsMap.get(state.activeFilePath) || "" });
    showSnackbar("Current file copied!", { type: "success" });
  } catch (err) {
    showSnackbar("Copy failed", { type: "error" });
  }
}

export async function saveAllFiles(projectId) {
  const state = projectStates.get(projectId);
  if (!state) {
    showSnackbar("No active project", { type: "info" });
    return;
  }

  const files = Array.from(state.fileContentsMap.entries());
  if (files.length === 0) {
    showSnackbar("No files to save", { type: "info" });
    return;
  }

  showProgress(`Saving ${files.length} files...`);
  let successCount = 0;
  let errorCount = 0;

  for (const [path, content] of files) {
    try {
      await invoke("write_to_file", { path, content });
      successCount++;
    } catch (err) {
      console.error(`Failed to save ${path}:`, err);
      errorCount++;
    }
  }

  hideProgress();

  if (errorCount === 0) {
    showSnackbar(`All ${successCount} files saved successfully!`, { type: "success" });
  } else {
    showSnackbar(`Saved ${successCount} files, ${errorCount} failed.`, { type: "error" });
  }
}

export async function copyAllFiles(projectId) {
  const state = projectStates.get(projectId);
  if (!state) return;
  const filePaths = Array.from(state.selectedPaths).filter(p => !state.knownDirs.has(p)).sort();
  if (filePaths.length === 0) {
    showSnackbar("No files to copy", { type: "info" });
    return;
  }
  let output = "";
  for (const path of filePaths) {
    const relPath = path.replace(state.rootPath, "").replace(/^[\\/]/, "");
    output += `# ${relPath}\n${state.fileContentsMap.get(path) || ""}\n\n`;
  }
  try {
    await invoke("write_to_clipboard", { text: output.trimEnd() });
    showSnackbar("All files copied!", { type: "success" });
  } catch (err) {
    showSnackbar("Copy failed", { type: "error" });
  }
}

export function clearAllSelections(projectId) {
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

// --- Global overlay helpers (unchanged) ---
let globalOverlay = null;
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
      <span class="text-sm text-slate-700" id="global-overlay-text">Working…</span>
    </div>
  `;
  document.body.appendChild(globalOverlay);
}
function showGlobalOverlay(text = "Working…") {
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
let previewCancelled = false;