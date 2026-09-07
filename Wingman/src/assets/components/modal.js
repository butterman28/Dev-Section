// modal.js

const { invoke } = window.__TAURI__.core;

let modalInitialized = false;
let currentModal = null;

function ensureModalExists() {
  if (modalInitialized) return;

  const modal = document.createElement("div");
  modal.id = "subfolder-modal";
  modal.className =
    "hidden fixed inset-0 z-50 flex items-center justify-center p-4";

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
  treeEl.innerHTML = "Loading…";

  try {
    const children = await invoke("get_children_for_path", {
      path: folderNode.path,
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

export { showSubfolderModal };
