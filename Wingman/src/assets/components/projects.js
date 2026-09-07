// src/assets/components/projects.js
const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;   // dialog plugin exposes 'open'
import { showSnackbar } from "./snackbar.js";

const STORAGE_KEY = "wingman_projects";

// Project state store: { [projectId]: { rootPath, name, selectedPaths, knownDirs, fileContentsMap, activeFilePath } }
let projects = {};
let activeProjectId = null;

// Update setActiveProject to handle UI updates
export function setActiveProject(projectId) {
  if (projects[projectId]) {
    const wasActive = activeProjectId;
    activeProjectId = projectId;
    
    // Save to localStorage
    localStorage.setItem('wingman_active_project', projectId);
    
    // Update UI
    updateProjectSwitcherUI();
    renderProjectDropdown();
    
    // Dispatch event for main.js to load the tree
    window.dispatchEvent(new CustomEvent("project-switched", { 
      detail: { projectId, previousProjectId: wasActive } 
    }));
  }
}

// New function to update the project switcher button
function updateProjectSwitcherUI() {
  const projectNameEl = document.getElementById('current-project-name');
  if (!projectNameEl) return;
  
  if (activeProjectId && projects[activeProjectId]) {
    projectNameEl.textContent = projects[activeProjectId].name;
    projectNameEl.className = 'text-slate-200 font-medium';
  } else {
    projectNameEl.textContent = 'No Project';
    projectNameEl.className = 'text-slate-400';
  }
}

// New function to render the project dropdown
export function renderProjectDropdown() {
  const dropdownList = document.getElementById('project-dropdown-list');
  if (!dropdownList) return;
  
  dropdownList.innerHTML = '';
  
  const projectIds = Object.keys(projects);
  
  if (projectIds.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'px-4 py-3 text-sm text-slate-500 text-center';
    empty.textContent = 'No projects open';
    dropdownList.appendChild(empty);
    return;
  }
  
  projectIds.forEach(id => {
    const proj = projects[id];
    const isActive = id === activeProjectId;
    
    const item = document.createElement('button');
    item.className = `w-full px-4 py-3 text-left flex items-center gap-3 transition-colors ${
      isActive ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-slate-50 border-l-4 border-transparent'
    }`;
    
    item.innerHTML = `
      <svg class="w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
      </svg>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium ${isActive ? 'text-blue-900' : 'text-slate-700'} truncate">
          ${proj.name}
        </div>
        <div class="text-xs text-slate-500 truncate">${proj.rootPath}</div>
      </div>
      ${isActive ? '<span class="text-xs text-blue-600 font-medium">Active</span>' : ''}
      <button class="close-project-btn p-1.5 hover:bg-red-100 rounded-md transition-colors" data-project-id="${id}">
        <svg class="w-4 h-4 text-slate-400 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;
    
    // Switch project on click (but not on close button)
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.close-project-btn')) {
        setActiveProject(id);
        toggleProjectDropdown();
      }
    });
    
    // Close button handler
    const closeBtn = item.querySelector('.close-project-btn');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeProject(id);
    });
    
    dropdownList.appendChild(item);
  });
}

// New function to toggle dropdown
export function toggleProjectDropdown() {
  const dropdown = document.getElementById('project-dropdown');
  if (!dropdown) return;
  
  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    renderProjectDropdown();
    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
  }
}

// New function to close dropdown
export function closeProjectDropdown() {
  const dropdown = document.getElementById('project-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
}

// Update loadProjects to restore active project
export function loadProjects() {
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
    
    // Restore active project
    const savedActive = localStorage.getItem('wingman_active_project');
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

// Save all projects to localStorage
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
        activeFilePath: data.activeFilePath,
      };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (e) {
    console.warn("Failed to save projects:", e);
  }
}

// Update addProject to set as active
export async function addProject() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select project folder",
  });
  
  if (!selected) return;
  
  const path = selected;
  const name = path.split(/[\\/]/).pop() || "project";
  
  if (projects[path]) {
    // If already open, just switch to it
    setActiveProject(path);
    showSnackbar(`Switched to: ${name}`, { type: "info" });
    return;
  }
  
  projects[path] = {
    rootPath: path,
    name,
    selectedPaths: new Set(),
    knownDirs: new Set(),
    fileContentsMap: new Map(),
    activeFilePath: null,
  };
  
  saveProjects();
  activeProjectId = path;
  
  updateProjectSwitcherUI();
  renderProjectDropdown();
  
  window.dispatchEvent(new CustomEvent("project-added", { detail: { projectId: path } }));
  showSnackbar(`Opened project: ${name}`, { type: "success" });
}

// Update closeProject
export function closeProject(projectId) {
  if (!projects[projectId]) return;
  
  const wasActive = activeProjectId === projectId;
  const projectName = projects[projectId].name;
  
  delete projects[projectId];
  
  if (wasActive) {
    // Switch to another project if available
    const remainingIds = Object.keys(projects);
    activeProjectId = remainingIds.length > 0 ? remainingIds[0] : null;
    localStorage.setItem('wingman_active_project', activeProjectId || '');
  }
  
  saveProjects();
  updateProjectSwitcherUI();
  renderProjectDropdown();
  
  window.dispatchEvent(new CustomEvent("project-closed", { 
    detail: { projectId, wasActive, newActiveProjectId: activeProjectId } 
  }));
  
  showSnackbar(`Closed project: ${projectName}`, { type: "info" });
}

// Export new functions
export function getActiveProjectId() {
  return activeProjectId;
}

export function getActiveProject() {
  return activeProjectId ? projects[activeProjectId] : null;
}

export function getAllProjects() {
  return projects;
}

// Export project state for use by codeTree.js
export function getProjectState(projectId) {
  const proj = projects[projectId];
  if (!proj) return null;
  return {
    selectedPaths: proj.selectedPaths,
    knownDirs: proj.knownDirs,
    fileContentsMap: proj.fileContentsMap,
    activeFilePath: proj.activeFilePath,
    rootPath: proj.rootPath,
  };
}

// Update project state after changes (e.g., from codeTree)
export function updateProjectState(projectId, updates) {
  const proj = projects[projectId];
  if (!proj) return;
  if (updates.selectedPaths !== undefined) proj.selectedPaths = updates.selectedPaths;
  if (updates.knownDirs !== undefined) proj.knownDirs = updates.knownDirs;
  if (updates.fileContentsMap !== undefined) proj.fileContentsMap = updates.fileContentsMap;
  if (updates.activeFilePath !== undefined) proj.activeFilePath = updates.activeFilePath;
  // Save periodically
  saveProjects();
}