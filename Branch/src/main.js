import { showSubfolderModal } from "./assets/components/modal.js";
import { createSearchBar } from "./assets/components/search.js";
import { 
  initializeCodeTree,
  updateCodeTreePreview,
  selectedPaths,
  syncCheckboxes as syncCodeTreeCheckboxes
} from "./assets/components/codeTree.js";
const { invoke } = window.__TAURI__.core;

let rootNode = null;

/**
 * ✅ Propagate to ALL paths (folders + files) within directory
 */
async function propagateFolderCheckbox(folderPath, checked) {
  try {
    // ✅ Get ALL paths including subfolders (not just files)
    const allPaths = await invoke("get_all_paths_in_directory", {
      path: folderPath
    });

    // Also include the folder itself (in case it's not in the list)
    allPaths.push(folderPath);

    if (checked) {
      allPaths.forEach(p => selectedPaths.add(p));
    } else {
      allPaths.forEach(p => selectedPaths.delete(p));
    }
    
    syncCodeTreeCheckboxes();
    updateCodeTreePreview();
    
  } catch (err) {
    console.error("Failed to propagate checkbox:", err);
  }
}

/**
 * Render a directory tree node lazily
 **/
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
  nameLabel.className = node.is_dir
    ? "cursor-pointer font-medium text-slate-800 hover:text-blue-600"
    : "text-slate-600";

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

    // ✅ Folder checkbox click handler
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      await propagateFolderCheckbox(node.path, checkbox.checked);
    });

    details.addEventListener("toggle", async () => {
      if (!details.open) return;
      if (details.dataset.loaded !== "false") return;

      details.dataset.loaded = "loading";

      const loading = document.createElement("li");
      loading.textContent = "Loading…";
      loading.className = "ml-6 text-slate-400 italic";
      ul.appendChild(loading);

      try {
        const children = await invoke("get_children_for_path", {
          path: node.path,
        });

        ul.innerHTML = "";
        node.children = children;

        for (const child of children) {
          ul.appendChild(renderNode(child));
        }

        details.dataset.loaded = "true";

        // ✅ Sync newly loaded nodes
        syncCodeTreeCheckboxes();
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

// ... [rest of renderFolderButtons and loadTree unchanged] ...

function renderFolderButtons(folders, container) {
  container.innerHTML = "";

  const bar = document.createElement("div");
  bar.className = "flex flex-nowrap gap-2 mb-4 pb-1";

  folders.forEach(folder => {
    const buttonGroup = document.createElement("div");
    buttonGroup.className = "flex items-center bg-white border border-slate-300 rounded-md overflow-hidden hover:bg-slate-50";

    const eyeBtn = document.createElement("button");
    eyeBtn.type = "button";
    eyeBtn.className = "flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-700";
    eyeBtn.title = "Toggle folder visibility";

    const eyeIcon = document.createElement("span");
    eyeIcon.textContent = "🙈";
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
        eyeIcon.textContent = details.open ? "👁️" : "🙈";
      }
    });

    const subBtn = document.createElement("button");
    subBtn.className = "w-7 flex items-center justify-center text-xs text-slate-500 hover:bg-slate-200";
    subBtn.textContent = "▼";
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
    const projectDir = await invoke("get_launch_dir");

    rootNode = await invoke("get_tree_for_path", {
      path: projectDir,
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
      const rootDetails = treeContainer.querySelector('details[data-path]');
      if (rootDetails) {
        rootDetails.open = true;
      }
    }, 100);

    const topLevel = await invoke("get_children_for_path", {
      path: rootNode.path,
    });

    const foldersOnly = topLevel.filter(f => f.is_dir);
    let allTopFolders = topLevel.filter(f => f.is_dir);

    const folderControls = document.getElementById("folder-controls");

    createSearchBar(folderControls, (term) => {
      const filtered = term
        ? allTopFolders.filter(f => f.name.toLowerCase().includes(term))
        : allTopFolders;
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