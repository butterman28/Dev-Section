// main.js

import { showSubfolderModal } from "./modal.js";
import { createSearchBar } from "./assets/components/search.js";

const { invoke } = window.__TAURI__.core;

let rootNode = null;

/**
 * Render a directory tree node lazily
 */
function renderNode(node) {
  const li = document.createElement("li");
  li.className = "ml-4";

  if (node.is_dir) {
    const details = document.createElement("details");
    details.dataset.path = node.path;
    details.dataset.loaded = "false";

    const summary = document.createElement("summary");
    summary.textContent = node.name;
    summary.className =
      "cursor-pointer font-medium text-slate-800 hover:text-blue-600";

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
    li.className =
      "ml-6 text-slate-600 hover:text-slate-900 cursor-default";
    li.dataset.path = node.path;
  }

  return li;
}

// Add this AFTER renderNode(), BEFORE loadTree()
function renderFolderButtons(folders, container) {
  container.innerHTML = ""; // clears only the buttons

  const bar = document.createElement("div");
  bar.className = "flex flex-nowrap gap-2 mb-4  pb-1 ";

  folders.forEach(folder => {
    const wrapper = document.createElement("div");
    wrapper.className = "flex items-center gap-1";

    const eyeBtn = document.createElement("button");
    eyeBtn.type = "button";
    eyeBtn.className =
      "flex items-center gap-1.5 px-2.5 py-1 bg-white rounded border text-xs font-medium text-slate-700 hover:bg-slate-50 max-w-[180px]";

    const eyeIcon = document.createElement("span");
    eyeIcon.textContent = "👁️";
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
        eyeIcon.textContent = details.open ? "👁️" : "🙈";
      }
    });

    const subBtn = document.createElement("button");
    subBtn.className =
      "ml-1 w-6 h-6 flex items-center justify-center text-xs text-slate-500 hover:bg-slate-200 rounded";
    subBtn.textContent = "▼";
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
    const projectDir = await invoke("get_launch_dir");

    rootNode = await invoke("get_tree_for_path", {
      path: projectDir,
    });

    const treeContainer = document.getElementById("tree");
    const overviewContainer = document.getElementById("folder-overview");

    treeContainer.innerHTML = "";
    overviewContainer.innerHTML = "";

    // Render root (collapsed)
    const ul = document.createElement("ul");
    ul.className = "text-sm font-mono";
    ul.appendChild(renderNode(rootNode));
    treeContainer.appendChild(ul);

    // Load top-level folders for overview bar
    const topLevel = await invoke("get_children_for_path", {
      path: rootNode.path,
    });

    const foldersOnly = topLevel.filter(f => f.is_dir);

// Store for filtering
let allTopFolders = topLevel.filter(f => f.is_dir);

// Get the PARENT container (the div with w-[50%])
const parentWrapper = overviewContainer.closest('.w-\\[50\\%\\]');

// Inject search bar + handle search
createSearchBar(parentWrapper, (term) => {
  // Filter logic
  const filtered = term
    ? allTopFolders.filter(f => f.name.toLowerCase().includes(term))
    : allTopFolders;

  // Re-render buttons
  renderFolderButtons(filtered, overviewContainer);
});

// Initial render
renderFolderButtons(allTopFolders, overviewContainer);

    if (foldersOnly.length > 0) {
      const bar = document.createElement("div");
      bar.className = "flex flex-nowrap gap-2 mb-4  pb-1 ";

      foldersOnly.forEach(folder => {
        const wrapper = document.createElement("div");
        wrapper.className = "flex items-center gap-1";

        const eyeBtn = document.createElement("button");
        eyeBtn.type = "button";
        eyeBtn.title = folder.name; // ← native tooltip on hover
        eyeBtn.className =
          "flex items-center gap-1.5 px-2.5 py-1 bg-white rounded border text-xs font-medium text-slate-700 hover:bg-slate-50 max-w-[180px]";

        const eyeIcon = document.createElement("span");
        eyeIcon.textContent = "👁️";
        eyeIcon.setAttribute("aria-hidden", "true");

        const nameSpan = document.createElement("span");
        nameSpan.textContent = folder.name;
        nameSpan.className = "truncate"; // ← Tailwind class

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
        subBtn.className =
          "ml-1 w-6 h-6 flex items-center justify-center text-xs text-slate-500 hover:bg-slate-200 rounded";
        subBtn.textContent = "▼";
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
    document.getElementById("tree").textContent =
      "Failed to load directory tree";
  }
}

window.addEventListener("DOMContentLoaded", loadTree);
