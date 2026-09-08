// src/main.js
import {
  initializeCodeTree,
  loadMissingFiles,
  saveCurrentFile,
  copyCurrentFile,
  copyAllFiles,
  copySelectedFiles,
  clearAllSelections,
  syncCheckboxes,
  projectStates,
  ensureProjectState,
  renderTabs,
  openFileAtLine,
} from "./assets/components/codeTree.js";

import {
  addProject,
  getActiveProject,
  getActiveProjectId,
  setActiveProject,
  getAllProjects,
  renderProjectDropdown,
  toggleProjectDropdown,
  closeProjectDropdown,
  loadProjects,
  updateProjectState
} from "./assets/components/projects.js";

// Add these two imports:
import { showCreateItemModal} from "./assets/components/modal.js";
import { showConfirmationModal } from "./assets/components/modal.js";
import { initTerminal } from "./assets/components/terminal.js";
import { showSnackbar } from "./assets/components/snackbar.js";
import "./assets/components/sidebar.js";

const { invoke } = window.__TAURI__.core;
let rootNodes = {};
let currentProjectId = null;

// Render a tree node for a specific project
// src/main.js (inside the renderNode function)

// ==================== DROPDOWN PORTAL HELPER ====================
function createDropdownPortal(menuBtn, items) {
  let dropdown = null;

  function closeDropdown() {
    if (dropdown && dropdown.parentNode) {
      dropdown.parentNode.removeChild(dropdown);
      dropdown = null;
    }
    document.removeEventListener('click', closeDropdown);
  }

  function openDropdown() {
    // Close any other open dropdowns (optional, but prevents stacking)
    document.querySelectorAll('.portal-dropdown').forEach(el => el.remove());

    dropdown = document.createElement('div');
    dropdown.className = 'portal-dropdown fixed bg-white rounded-lg shadow-lg border border-slate-200 z-[10000] min-w-[120px] py-1';
    dropdown.style.display = 'block';

    items.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2';
      btn.innerHTML = item.html;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.action) item.action();
        closeDropdown();
      });
      dropdown.appendChild(btn);
    });

    // Position the dropdown relative to the menu button
    const rect = menuBtn.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = (rect.right - 120) + 'px'; // right‑align with button

    document.body.appendChild(dropdown);

    // Close when clicking outside
    document.addEventListener('click', closeDropdown);
  }

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown && dropdown.parentNode) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });
}

// ==================== UPDATED renderNode ====================
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

  // --- Menu button (three dots) ---
  if (node.is_dir || node.path !== state.rootPath) {
    const menuBtn = document.createElement("button");
    menuBtn.className = "p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors shrink-0";
    menuBtn.innerHTML = `
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 6a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4z"/>
      </svg>
    `;
    menuBtn.title = "More actions";

    // Build menu items
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
        setTimeout(() => { details.open = true; }, 50);
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

    // Create the portal dropdown – this handles all open/close logic
    createDropdownPortal(menuBtn, items);

    // Append the menu button once
    itemContainer.appendChild(menuBtn);
  }

  // --- Rest of the function: directory/file handling ---
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


// ---------- Search ----------
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchClear = document.getElementById('search-clear');

let searchTimeout = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const query = searchInput.value.trim();
  if (!query) {
    searchResults.classList.add('hidden');
    searchClear.classList.add('hidden');
    return;
  }
  searchClear.classList.remove('hidden');
  searchTimeout = setTimeout(() => performSearch(query), 300);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchResults.classList.add('hidden');
  searchClear.classList.add('hidden');
});

// Close results on blur, but not if clicking inside results
searchInput.addEventListener('blur', () => {
  setTimeout(() => {
    if (!searchResults.matches(':hover') && !searchInput.matches(':focus')) {
      searchResults.classList.add('hidden');
    }
  }, 200);
});

async function performSearch(query) {
  const projectId = getActiveProjectId();
  if (!projectId) {
    showSnackbar('No active project', { type: 'info' });
    return;
  }
  const state = projectStates.get(projectId);
  if (!state) {
    showSnackbar('Project state not found', { type: 'error' });
    return;
  }

  try {
    const results = await invoke('search_project_files', {
      pattern: query,
      rootPath: state.rootPath, 
      caseSensitive: false, 
    });
    renderSearchResults(results, projectId);
  } catch (err) {
    // Handle both Error objects and plain strings
    const errorMsg = err?.message || err || 'Unknown error';
    console.error('Search error:', err);
    showSnackbar('Search failed: ' + errorMsg, { type: 'error' });
  }
}

function renderSearchResults(results, projectId) {
  const container = searchResults;
  container.innerHTML = '';

  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'px-4 py-3 text-sm text-slate-500 text-center';
    empty.textContent = 'No matches found';
    container.appendChild(empty);
    container.classList.remove('hidden');
    return;
  }

  // Group by file path
  const grouped = results.reduce((acc, match) => {
    if (!acc[match.file_path]) acc[match.file_path] = [];
    acc[match.file_path].push(match);
    return acc;
  }, {});

  for (const [filePath, matches] of Object.entries(grouped)) {
    const fileEntry = document.createElement('div');
    fileEntry.className = 'border-b border-slate-100 last:border-b-0';

    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    const header = document.createElement('div');
    header.className = 'px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-50 truncate';
    header.textContent = fileName;
    fileEntry.appendChild(header);

    // Show first few matches (limit 10 per file to avoid clutter)
    const displayMatches = matches.slice(0, 10);
    for (const match of displayMatches) {
      const item = document.createElement('div');
      item.className = 'px-3 py-1.5 hover:bg-blue-50 cursor-pointer text-sm flex items-start gap-2 border-l-2 border-transparent hover:border-blue-500';
      item.innerHTML = `
        <span class="text-slate-400 text-xs font-mono min-w-[2rem]">${match.line_number}</span>
        <span class="text-slate-700 font-mono text-xs truncate">${escapeHtml(match.line_content)}</span>
      `;
      item.addEventListener('click', () => {
        // Open file and scroll to that line
        openFileAtLine(projectId, filePath, match.line_number);
        // Close results
        searchResults.classList.add('hidden');
        searchInput.blur();
      });
      fileEntry.appendChild(item);
    }

    if (matches.length > 10) {
      const more = document.createElement('div');
      more.className = 'px-3 py-1 text-xs text-slate-400 italic';
      more.textContent = `+ ${matches.length - 10} more matches`;
      fileEntry.appendChild(more);
    }

    container.appendChild(fileEntry);
  }

  container.classList.remove('hidden');
}

// Simple escape to prevent XSS (just in case)
function escapeHtml(text) {
  const div = document.createElement('div');
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

    // Safety: prevent deleting the root
    if (path === state.rootPath) {
      showSnackbar("Cannot delete the root project folder", { type: "error" });
      return;
    }

    await invoke("delete_item", { path });

    // Clean state (selected paths, known dirs, file contents)
    const prefix = path + (path.endsWith('/') || path.endsWith('\\') ? '' : '/');
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
      activeFilePath: state.activeFilePath,
    });

    // Remove the DOM node
    // Find the element with matching data-path
    const element = document.querySelector(`[data-path="${CSS.escape(path)}"]`);
    if (element) {
      let targetNode;
      // If it's an LI without the tree-node class, it's a file node
      if (element.tagName === 'LI' && !element.classList.contains('tree-node')) {
        targetNode = element;          // remove the file's own LI
      } else {
        // For directories, the element is the details; remove its parent LI (tree-node)
        targetNode = element.closest('.tree-node');
      }
      if (targetNode) {
        targetNode.remove();
      } else {
        console.warn("No target node found for path:", path);
      }
    } else {
      console.warn("Element with data-path not found:", path);
    }

    // Update editor tabs and sync checkboxes
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
    const root = await invoke("get_tree_for_path", { path: projectDir });
    rootNodes[projectId] = root;
    state.rootNode = root; 
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
  document.getElementById("copy-selected-files")?.addEventListener("click", () => {
    const activeId = getActiveProjectId();
    if (activeId) copySelectedFiles(activeId);
  });
  
  // Load initial project if any
  const initialProjectId = getActiveProjectId();
  if (initialProjectId) {
    loadTreeForProject(initialProjectId);
  }

  // ---- Terminal toggle ----
const terminalContainer = document.getElementById("terminal-container");
let terminalInitialized = false;
let terminalProjectId = null;

function toggleTerminal() {
  if (!terminalContainer) return;

  const isOpen = !terminalContainer.classList.contains("translate-y-full");

  if (isOpen) {
    // Close it
    terminalContainer.classList.add("translate-y-full");
    // Optionally reset content? we keep it as is.
  } else {
    // Open it: ensure a project is active
    const projectId = getActiveProjectId();
    if (!projectId) {
      showSnackbar("Open a project first", { type: "info" });
      return;
    }
    // If terminal not initialised or project changed, reinit
    if (!terminalInitialized || terminalProjectId !== projectId) {
      const state = projectStates.get(projectId);
      if (!state) {
        showSnackbar("Project state not loaded", { type: "error" });
        return;
      }
      // Clear previous content
      terminalContainer.querySelector("#terminal-output").innerHTML = "";
      terminalContainer.querySelector("#terminal-input").value = "";
      // Reinitialise
      initTerminal(terminalContainer, state.rootPath, () => {
        // onClose: close the terminal
        terminalContainer.classList.add("translate-y-full");
      });
      terminalInitialized = true;
      terminalProjectId = projectId;
    }
    terminalContainer.classList.remove("translate-y-full");
  }
}

// Menu button
document.getElementById("toggle-terminal")?.addEventListener("click", toggleTerminal);

});