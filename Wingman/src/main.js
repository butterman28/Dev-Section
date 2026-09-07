import {
  initializeCodeTree,
  loadMissingFiles,
  saveCurrentFile,
  copyCurrentFile,
  copyAllFiles,
  clearAllSelections,
  syncCheckboxes,
  projectStates,
  ensureProjectState,
} from "./assets/components/codeTree.js";

import {
  //initProjectSidebar,
  addProject,
  getActiveProject,
  getActiveProjectId,
  setActiveProject,
  getAllProjects,
  renderProjectDropdown,
  toggleProjectDropdown,
  closeProjectDropdown,
  loadProjects,
} from "./assets/components/projects.js";

import "./assets/components/sidebar.js";

const { invoke } = window.__TAURI__.core;
let rootNodes = {};
let currentProjectId = null;

// Render a tree node for a specific project
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
  nameLabel.className = node.is_dir 
    ? "cursor-pointer font-medium text-slate-800 hover:text-blue-600 truncate" 
    : "text-slate-600 truncate";
  
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
      loading.textContent = "Loading…";
      loading.className = "ml-6 text-slate-400 italic py-1";
      ul.appendChild(loading);
      
      try {
        const children = await invoke("get_children_for_path", { path: node.path });
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
    const allPaths = await invoke("get_all_paths_in_directory", { path: folderPath });
    allPaths.push(folderPath);
    
    if (checked) {
      const infos = await invoke("get_file_info", { paths: allPaths });
      infos.forEach(info => {
        if (info.is_dir) state.knownDirs.add(info.path);
      });
      allPaths.forEach(p => state.selectedPaths.add(p));
    } else {
      allPaths.forEach(p => state.selectedPaths.delete(p));
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
    const root = await invoke("get_tree_for_path", { path: projectDir });
    rootNodes[projectId] = root;
    
    const treeContainer = document.getElementById("tree");
    treeContainer.innerHTML = "";
    
    const ul = document.createElement("ul");
    ul.className = "text-sm font-mono";
    ul.appendChild(renderNode(root, projectId));
    treeContainer.appendChild(ul);
    
    // Auto-expand root
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

// Event listeners
window.addEventListener("project-added", (e) => {
  loadTreeForProject(e.detail.projectId);
});

window.addEventListener("project-switched", (e) => {
  // Clean up previous project's editor if needed
  loadTreeForProject(e.detail.projectId);
});

window.addEventListener("project-closed", (e) => {
  if (e.detail.wasActive) {
    // Clear the UI if no projects left
    if (!e.detail.newActiveProjectId) {
      document.getElementById("tree").innerHTML = '<p class="text-slate-400 italic">No project open</p>';
      document.querySelector("main").innerHTML = '';
    }
  }
});

// Initialize app
window.addEventListener("DOMContentLoaded", () => {
  // Load projects from storage
  loadProjects();
  
  // Initialize sidebar
  //initProjectSidebar();
  
  // Project switcher
  const projectSwitcher = document.getElementById('project-switcher');
  const projectSwitcherContainer = document.getElementById('project-switcher-container');
  
  projectSwitcher?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleProjectDropdown();
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!projectSwitcherContainer.contains(e.target)) {
      closeProjectDropdown();
    }
  });
  
  // Open project from dropdown
  document.getElementById("open-project-dropdown")?.addEventListener("click", () => {
    closeProjectDropdown();
    addProject();
  });
  
  // Main menu toggle
  const menuToggle = document.getElementById('menu-toggle');
  const mainMenuDropdown = document.getElementById('main-menu-dropdown');
  
  menuToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    mainMenuDropdown.classList.toggle('hidden');
  });
  
  document.addEventListener('click', (e) => {
    if (!menuToggle.contains(e.target) && !mainMenuDropdown.contains(e.target)) {
      mainMenuDropdown.classList.add('hidden');
    }
  });
  
  // Menu actions
  document.getElementById("refresh-app")?.addEventListener("click", () => {
    window.location.reload();
  });
  
  document.getElementById("toggle-sidebar")?.addEventListener("click", () => {
    document.getElementById('toggle-sidebar').click(); // This triggers the sidebar component
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
  
  // Load initial project if any
  const initialProjectId = getActiveProjectId();
  if (initialProjectId) {
    loadTreeForProject(initialProjectId);
  }
});