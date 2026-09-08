// src/assets/components/modal.js
import { showSnackbar } from "./snackbar.js";

const { invoke } = window.__TAURI__.core;

let modalInitialized = false;
let currentModal = null;
let createModalInitialized = false;
let createModal = null;
let textModalInitialized = false;
let textModal = null;
let confirmModalInitialized = false;
let confirmModal = null;
let confirmCallback = null;

// --- Subfolder Modal (legacy, but keep z-index consistent) ---
function ensureModalExists() {
  if (modalInitialized) return;

  const modal = document.createElement("div");
  modal.id = "subfolder-modal";
  modal.className = "hidden fixed inset-0 z-[10000] flex items-center justify-center p-4";

  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" id="modal-backdrop"></div>
    <div class="relative bg-white rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col z-50">
      <div class="px-4 py-3 border-b flex justify-between items-center">
        <h3 id="modal-folder-name" class="font-medium text-slate-800"></h3>
        <button id="modal-close" class="text-slate-500 hover:text-slate-800 text-xl leading-none">&times;</button>
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

// --- Create Item Modal ---
export function showCreateItemModal(parentPath, projectId, onCreated) {
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
      const nameInput = document.getElementById("create-item-name");
      if (nameInput) nameInput.value = "";
    };

    createModal.querySelector("#create-modal-backdrop").addEventListener("click", close);
    createModal.querySelector("#create-modal-close").addEventListener("click", close);
    createModal.querySelector("#create-modal-cancel").addEventListener("click", close);

    createModal.querySelector("#create-modal-ok").addEventListener("click", async () => {
      const nameInput = document.getElementById("create-item-name");
      const name = nameInput.value.trim();
      const type = createModal.querySelector('input[name="item-type"]:checked').value;

      if (!name) {
        showSnackbar("Please enter a name", { type: "error" });
        nameInput.focus();
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
          await invoke("create_directory", { path: fullPath });
        } else {
          await invoke("create_file", { path: fullPath });
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

// --- Text Modal (for viewing tree etc.) ---
export function showTextModal(title, text) {
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

// --- Confirmation Modal (for delete) ---
export function showConfirmationModal(title, message, onConfirm) {
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

// (keep the subfolder modal export if needed)
export { ensureModalExists as showSubfolderModal };