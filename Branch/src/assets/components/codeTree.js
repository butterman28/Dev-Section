// ./assets/features/codeTree.js
import { showSnackbar } from "./snackbar.js";
const { invoke } = window.__TAURI__.core;
let globalOverlay = null;
let selectedPaths = new Set();
let rootPath = '';
let codeTreePanel = null;
let currentPrompt = ''; 
let loadingStatus;
let loadingText;
let successStatus;
let cancelBtn;
let previewCancelled = false 
let isPreviewLoading
let isDir

function ensureGlobalOverlay() {
  if (globalOverlay) return;

  globalOverlay = document.createElement('div');
  globalOverlay.className = `
    fixed inset-0 z-[9999]
    flex items-center justify-center
    bg-black/30 backdrop-blur-sm
  `;
  globalOverlay.style.display = 'none';

  globalOverlay.innerHTML = `
    <div class="flex items-center gap-3 bg-white px-5 py-3 rounded shadow">
      <svg class="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <span class="text-sm text-slate-700" id="global-overlay-text">
        Working…
      </span>
    </div>
  `;

  document.body.appendChild(globalOverlay);
}
function showGlobalOverlay(text = 'Working…') {
  ensureGlobalOverlay();
  globalOverlay.querySelector('#global-overlay-text').textContent = text;
  globalOverlay.style.display = 'flex';
}

function hideGlobalOverlay() {
  if (globalOverlay) {
    globalOverlay.style.display = 'none';
  }
}

function lockUI() {
  document.body.style.pointerEvents = 'none';
  document.body.style.cursor = 'wait';
}

function unlockUI() {
  document.body.style.pointerEvents = '';
  document.body.style.cursor = '';
}

function showLoadingStatus(totalFiles = 0, loadedFiles = 0) {
  if (!loadingStatus) return;

  if (totalFiles > 0) {
    loadingText.textContent = `Loading ${totalFiles} files... (${loadedFiles}/${totalFiles})`;
  } else {
    loadingText.textContent = 'Loading files...';
  }

  loadingStatus.style.display = 'flex';
  successStatus.style.display = 'none';
  cancelBtn.style.display = 'flex';
}

function showDirectoryScanStatus() {
  if (!loadingStatus) return;
  loadingText.textContent = 'Scanning directory…';
  loadingStatus.style.display = 'flex';
  cancelBtn.style.display = 'none'; // cannot cancel yet
}


function hideLoadingStatus() {
  if (!loadingStatus) return;

  loadingStatus.style.display = 'none';
  cancelBtn.style.display = 'none';
}

function showSuccessStatus() {
  if (!successStatus) return;

  hideLoadingStatus();
  successStatus.style.display = 'flex';

  setTimeout(() => {
    successStatus.style.display = 'none';
  }, 3000);
}
export function initializeCodeTree({ rootPath: root, treeContainer, parentSection }) {
  rootPath = root.replace(/[\\/]+$/, '');

  // Inject UI into parentSection as first child (so it appears left)
  codeTreePanel = createCodeTreePanel();
  parentSection.prepend(codeTreePanel); // puts it on the left in flex-row

  // Listen for checkbox changes in the file tree
  treeContainer.addEventListener('change', handleCheckboxChange);
}

function createCodeTreePanel() {
  const panel = document.createElement('div');
  panel.className = 'w-1/2 flex flex-col';
  panel.innerHTML = `
  <h3 class="font-bold text-slate-800 mb-2">Selected Code Preview</h3>
  <div id="code-tree-content" class="flex-1 overflow-auto bg-slate-100 p-3 rounded shadow-sm ">
    <p class="text-slate-500 italic">Select files using checkboxes in the tree.</p>
  </div>
  <div class="mt-2 flex gap-2 flex-wrap items-center">
    <!-- Loading Status with Spinner -->
    <div id="loading-status" class="flex items-center gap-2 px-3 py-1 text-sm text-slate-600" style="display:none;">
      <svg class="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span id="loading-text">Loading files...</span>
    </div>
    
    <!-- Success Checkmark -->
    <div id="success-status" class="flex items-center gap-2 px-3 py-1 text-sm text-green-600 bg-green-50 rounded" style="display:none;">
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
      <span>Ready!</span>
    </div>
    
    <button id="cancel-load" class="px-3 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center gap-1.5 transition-all" style="display:none;">
      <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
      Cancel
    </button>
    
    <button id="copy-md" class="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition">Copy as MD</button>
    <button id="copy-json" class="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition">Copy as JSON</button>
    <button id="copy-txt" class="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-800 text-white rounded transition">Copy as Text</button>
    <button id="clear-all" class="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition">Clear All</button>
  </div>
`;

  cancelBtn = panel.querySelector('#cancel-load');
  loadingStatus = panel.querySelector('#loading-status');
  loadingText = panel.querySelector('#loading-text');
  successStatus = panel.querySelector('#success-status');

  
  cancelBtn.addEventListener('click', () => {
    previewCancelled = true;
    hideLoadingStatus();
    showSnackbar('Loading cancelled', { type: 'info' });
    selectedPaths.clear();
    //syncCheckboxes();
    //updateCodeTreePreview();
  });  
  panel.querySelector('#copy-md').addEventListener('click', () => copyAs('md'));
  panel.querySelector('#copy-json').addEventListener('click', () => copyAs('json'));
  panel.querySelector('#copy-txt').addEventListener('click', () => copyAs('txt'));
  panel.querySelector('#clear-all').addEventListener('click', () => {
    selectedPaths.clear();
    if (!isDir) {
    syncCheckboxes();
    }
    updateCodeTreePreview();
  });

  return panel;
}
// --- Preview update scheduling (debounce per frame) ---
let previewRAF = null;

function schedulePreviewUpdate() {
  if (previewRAF) cancelAnimationFrame(previewRAF);
  previewRAF = requestAnimationFrame(() => {
    previewRAF = null;
    updateCodeTreePreview();
  });
}



async function handleCheckboxChange(e) {
  if (!e.target.matches('input[type="checkbox"]')) return;

  const path = e.target.dataset.path;
  const isChecked = e.target.checked;
  isDir = !!document.querySelector(`details[data-path="${CSS.escape(path)}"]`);

  if (isDir) {
  showGlobalOverlay('Scanning directory…');
  lockUI();

  // CRITICAL: force paint BEFORE invoke
  await new Promise(requestAnimationFrame);

  try {
    const allPaths = await invoke("get_all_paths_in_directory", { path });
    allPaths.push(path);
    await applyPathsChunked(allPaths, isChecked);
  } finally {
    hideGlobalOverlay();
    unlockUI();
  }
  }else {
      if (isChecked) {
      selectedPaths.add(path);
    } else {
      selectedPaths.delete(path);
    }
  }

  if (!isDir) {
    syncCheckboxes();
  }
  schedulePreviewUpdate();

}
export function syncCheckboxes() {
  // Reset all checkboxes
  document.querySelectorAll('#tree input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });

  // Re-check only selected paths
  selectedPaths.forEach(path => {
    const cb = document.querySelector(`#tree input[type="checkbox"][data-path="${CSS.escape(path)}"]`);
    if (cb) cb.checked = true;
  });
}

function buildUnixTree(paths, root) {
  if (paths.length === 0) return '';

  // Extract root folder name (e.g. "/Users/you/my-project" → "my-project")
  const rootName = root.split(/[\\/]/).filter(part => part).pop() || 'project';

  // Normalize paths to be relative to root
  const relPaths = paths
    .map(p => p.replace(root, '').replace(/^[\\/]/, ''))
    .filter(p => p)
    .sort();

  // Build nested object starting from rootName
  const tree = { [rootName]: {} };

  for (const relPath of relPaths) {
    const parts = relPath.split(/[\\/]/);
    let current = tree[rootName];
    for (const part of parts) {
      if (!current[part]) current[part] = {};
      current = current[part];
    }
  }

  // Render recursively
  function render(node, prefix = '', isRoot = true) {
    const keys = Object.keys(node).sort();
    let output = '';
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const isLast = i === keys.length - 1;
      const linePrefix = prefix + (isRoot ? '' : isLast ? '└── ' : '├── ');
      output += linePrefix + key + '\n';
      if (Object.keys(node[key]).length > 0) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        output += render(node[key], childPrefix, false);
      }
    }
    return output;
  }

  return render(tree, '', true).trimEnd();
}

async function updateCodeTreePreview() {
  previewCancelled = false;
  const container = document.getElementById('code-tree-content');
  if (!container) return;

  if (selectedPaths.size === 0) {
    container.innerHTML = '<p class="text-slate-500 italic">Select files using checkboxes in the tree.</p>';
    return;
  }

  // Cancel any ongoing preview load
  isPreviewLoading = false;
  
  // Create wrapper for input + button + preview
  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col h-full gap-2';

  // Prompt input
  const promptInput = document.createElement('input');
  promptInput.type = 'text';
  promptInput.placeholder = 'Enter a prompt for this code context...';
  promptInput.value = currentPrompt;
  promptInput.className = 'px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500';

  // Add Prompt button
  const addButton = document.createElement('button');
  addButton.textContent = 'Add Prompt';
  addButton.className = 'px-2 py-1 text-xs bg-blue-600 text-white rounded w-fit';
  addButton.addEventListener('click', () => {
    const newPrompt = promptInput.value.trim();
    if (newPrompt) {
      currentPrompt = currentPrompt ? `${newPrompt}\n${currentPrompt}` : newPrompt;
      promptInput.value = '';
      updateCodeTreePreview();
    }
  });

  // Input + Button row
  const inputRow = document.createElement('div');
  inputRow.className = 'flex gap-2 items-center';
  inputRow.appendChild(promptInput);
  inputRow.appendChild(addButton);

  // Preview area container
  const previewContainer = document.createElement('div');
  previewContainer.className = 'relative flex-1 min-h-0';

  // Copy button
  const copyButton = document.createElement('button');
  copyButton.className = 'absolute top-1 right-5 z-10 px-1.5 py-0.5 text-xs bg-gray-800 text-white rounded opacity-80 hover:opacity-100';
  copyButton.textContent = 'Copy';
  copyButton.addEventListener('click', async () => {
    const textToCopy = contentTextarea.value;
    try {
      await navigator.clipboard.writeText(textToCopy);
      copyButton.textContent = 'Copied!';
      setTimeout(() => copyButton.textContent = 'Copy', 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      copyButton.textContent = 'Failed!';
      setTimeout(() => copyButton.textContent = 'Copy', 2000);
    }
  });

  // Editable preview area
  const contentTextarea = document.createElement('textarea');
  contentTextarea.className = `font-mono text-sm whitespace-pre w-full h-full p-2 rounded border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none`;
  contentTextarea.value = 'Loading summary...';
  contentTextarea.spellcheck = false;
  
  previewContainer.appendChild(contentTextarea);
  previewContainer.appendChild(copyButton);

  wrapper.appendChild(inputRow);
  wrapper.appendChild(previewContainer);
  
  container.innerHTML = '';
  container.appendChild(wrapper);
  // Build base content (prompt + tree structure)
  let baseContent = '';
  
  if (currentPrompt) {
    baseContent += `${currentPrompt}\n---\n\n`;
  }

  // Build Unix tree structure
  const sortedPaths = Array.from(selectedPaths).sort();
  const treeText = buildUnixTree(sortedPaths, rootPath);
  if (treeText) {
    baseContent += `${treeText}\n\n`;
  }

  //  Filter out directories - only load files
  const filePaths = sortedPaths.filter(path => {
    return !document.querySelector(`details[data-path="${CSS.escape(path)}"]`);
  })

  //  Show file count summary immediately
  if (filePaths.length > 0) {
    contentTextarea.value = `${baseContent}Loading ${filePaths.length} files... (0/${filePaths.length})`;
    
    await loadPreviewBatch({
      textarea: contentTextarea,
      baseContent,
      filePaths
    });
  } else {
    contentTextarea.value = baseContent || 'No files selected.';
    hideLoadingStatus();
  }
}

//  Load ONE file at a time with proper yielding
//  Load ONE file at a time with proper yielding
async function loadPreviewBatch({
  textarea,
  baseContent,
  filePaths
}) {
  //showGlobalOverlay(`Loading ${filePaths.length} files…`);
  await new Promise(requestAnimationFrame);
  
  showLoadingStatus(filePaths.length, 0);

  // Yield once so spinner paints immediately
  await new Promise(requestAnimationFrame);
  await new Promise(resolve => setTimeout(resolve, 0));
  //  Rust does parallel IO here
  const fileContents = await invoke('read_multiple_files', {
    paths: filePaths
  });

  // Build everything OFF-DOM
  let output = baseContent;
  let loaded = 0;

  for (const file of fileContents) {
    if (previewCancelled) return;
    loaded++;

    const relPath = file.path
      .replace(rootPath, '')
      .replace(/^[\\/]/, '');

    output += `# ${relPath}\n`;
    output += file.error
      ? `[ERROR: ${file.error}]\n\n`
      : `${file.content}\n\n`;

    // UI progress only (cheap)
    if (loaded % 20 === 0) {
      showLoadingStatus(filePaths.length, loaded);
      await new Promise(requestAnimationFrame);
    }
  }

  //  ONE DOM WRITE (this is the key)
  textarea.value = output.trimEnd();

  hideLoadingStatus();
  showSuccessStatus();
  hideGlobalOverlay()
}
export function createPromptBar(container, onSearch) {
  // Don’t create twice
  if (container.querySelector('#folder-search')) return;

  const promptBar = document.createElement('div');
  promptBar.className = 'mb-3';
  promptBar.innerHTML = `
    <input
      type="text"
      id="promptbar"
      placeholder="Search folders..."
      class="w-full px-3 py-1.5 text-sm border rounded-md border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  `;

  container.insertBefore(promptBar, container.firstChild);

  const input = searchBar.querySelector('#promptbar');
  input.addEventListener('input', (e) => {
    const term = e.target.value.trim().toLowerCase();
    onSearch(term);
  });

  return input;
}

async function copyAs(format) {
  try {
    let output = '';
    if (currentPrompt) {
      output += `${currentPrompt}\n---\n\n`;
    }
    //  Filter out directories
    const filePaths = Array.from(selectedPaths).filter(path => {
      return !document.querySelector(`details[data-path="${CSS.escape(path)}"]`);
    });

    //  BATCH READ
    const fileContents = await invoke('read_multiple_files', {
      paths: filePaths
    });

    // Collect file data
    const files = fileContents.map(file => {
      const relPath = file.path.replace(rootPath, '').replace(/^[\\/]/, '');
      return { 
        path: relPath, 
        content: file.error ? `[ERROR: ${file.error}]` : file.content 
      };
    });

    // Format based on `format`
    let finalText = '';
    switch (format) {
      case 'txt':
      case 'md':
        for (const file of files) {
          output += `# ${file.path}\n${file.content}\n\n`;
        }
        finalText = output.trimEnd();
        break;

      case 'json':
        finalText = JSON.stringify(
          {
            prompt: currentPrompt || null,
            files: files
          },
          null,
          2
        );
        break;

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
    
    // Copy to clipboard
    await invoke('plugin:clipboard|write_text', { text: finalText });
    
    const formatName = { txt: 'Text', md: 'Markdown', json: 'JSON' }[format];
    showSnackbar(`Copied as ${formatName}!`, { type: 'success' });
  } catch (err) {
    console.error('Copy failed:', err);
    showSnackbar('Copy failed! See console.', { type: 'error' });
  }
}
export { 
  updateCodeTreePreview, 
  selectedPaths, 
  syncCheckboxes as syncCodeTreeCheckboxes 
};