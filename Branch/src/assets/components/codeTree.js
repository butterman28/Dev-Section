// ./assets/features/codeTree.js

let selectedPaths = new Set();
let rootPath = '';
let codeTreePanel = null;
let currentPrompt = ''; 

// Define what counts as a "script" file
const SCRIPT_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.sh', '.bash', '.rb', '.php', '.pl',
  '.go', '.rs', '.java', '.cs', '.swift', '.kt',
  '.lua', '.r', '.scala', '.clj', '.ex', '.erl',
  '.sql', '.json', '.yaml', '.yml', '.toml', '.md'
]);

function isScriptFile(path) {
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex === -1) return false;
  const ext = path.slice(dotIndex).toLowerCase();
  return SCRIPT_EXTENSIONS.has(ext);
}

async function collectScriptFiles(dirPath) {
  const { invoke } = window.__TAURI__.core;
  const scripts = [];

  try {
    const children = await invoke("get_children_for_path", { path: dirPath });
    for (const child of children) {
      if (child.is_dir) {
        const subScripts = await collectScriptFiles(child.path);
        scripts.push(...subScripts);
      } else if (isScriptFile(child.path)) {
        scripts.push(child.path);
      }
    }
  } catch (err) {
    console.warn(`Failed to read directory: ${dirPath}`, err);
  }

  return scripts;
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
  <h3 class="font-bold text-slate-800 mb-2">Selected Code Tree</h3>
  <div id="code-tree-content" class="flex-1 overflow-auto bg-slate-100 p-3 rounded shadow-sm ">
    <p class="text-slate-500 italic">Select files using checkboxes in the tree.</p>
  </div>
  <div class="mt-2 flex gap-2 flex-wrap">
    <button id="export-md" class="px-2 py-1 text-xs bg-blue-600 text-white rounded">Markdown</button>
    <button id="export-js" class="px-2 py-1 text-xs bg-green-600 text-white rounded">JavaScript</button>
    <button id="export-txt" class="px-2 py-1 text-xs bg-gray-700 text-white rounded">Text</button>
    <button id="clear-all" class="px-2 py-1 text-xs bg-red-600 text-white rounded">Clear All</button>
  </div>
`;

  // Attach export handlers
  panel.querySelector('#export-md').addEventListener('click', () => exportAs('md'));
  panel.querySelector('#export-js').addEventListener('click', () => exportAs('js'));
  panel.querySelector('#export-txt').addEventListener('click', () => exportAs('txt'));

  panel.querySelector('#clear-all').addEventListener('click', () => {
  selectedPaths.clear();
  syncCheckboxes();
  updateCodeTreePreview();
});

  return panel;
}

async function handleCheckboxChange(e) {
  if (!e.target.matches('input[type="checkbox"]')) return;

  const path = e.target.dataset.path;
  const isChecked = e.target.checked;

  // Determine if this path is a directory by checking for <details>
  const isDir = !!document.querySelector(`details[data-path="${CSS.escape(path)}"]`);

  if (isDir) {
    const scriptPaths = await collectScriptFiles(path);
    if (isChecked) {
      scriptPaths.forEach(p => selectedPaths.add(p));
    } else {
      scriptPaths.forEach(p => selectedPaths.delete(p));
    }
  } else {
    // It's a file
    if (isChecked) {
      selectedPaths.add(path);
    } else {
      selectedPaths.delete(path);
    }
  }

  // Sync all checkboxes in the tree to match actual selection
  syncCheckboxes();

  updateCodeTreePreview();
}

function syncCheckboxes() {
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

async function updateCodeTreePreview() {
  const container = document.getElementById('code-tree-content');
  if (!container) return;

  if (selectedPaths.size === 0) {
    container.innerHTML = '<p class="text-slate-500 italic">Select files using checkboxes in the tree.</p>';
    return;
  }

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
    currentPrompt = promptInput.value.trim();
    updateCodeTreePreview(); // re-render with prompt embedded
  });

  // Input + Button row
  const inputRow = document.createElement('div');
  inputRow.className = 'flex gap-2 items-center';
  inputRow.appendChild(promptInput);
  inputRow.appendChild(addButton);

  // Preview area
  const contentPre = document.createElement('pre');
  contentPre.className = 'font-mono text-sm whitespace-pre overflow-auto flex-1 bg-white p-2 rounded';
  contentPre.textContent = 'Loading content…';

  wrapper.appendChild(inputRow);
  wrapper.appendChild(contentPre);
  container.innerHTML = '';
  container.appendChild(wrapper);

  // Load file content
  const { invoke } = window.__TAURI__.core;
  let previewContent = '';

  if (currentPrompt) {
    previewContent += `${currentPrompt}\n---\n\n`;
  }

  const sortedPaths = Array.from(selectedPaths).sort();
  for (const fullPath of sortedPaths) {
    try {
      const stats = await invoke('get_file_stats', { path: fullPath });
      if (stats.is_dir) continue;

      const content = await invoke('read_file', { path: fullPath });
      const relPath = fullPath.replace(rootPath, '').replace(/^[\\/]/, '');
      previewContent += `# ${relPath}\n${content}\n\n`;
    } catch (err) {
      const relPath = fullPath.replace(rootPath, '').replace(/^[\\/]/, '');
      previewContent += `# ${relPath} [ERROR: ${String(err)}]\n\n`;
    }
  }

  previewContent = previewContent.trimEnd();
  contentPre.textContent = previewContent;
}

// Placeholder — you can integrate with your existing modal system
function showPromptModal(path) {
  alert(`Prompt for: ${path}\n(You can replace this with your unified modal)`);
}

async function exportAs(format) {
  const { save } = window.__TAURI__.dialog;
  const { writeTextFile } = window.__TAURI__.fs;

  let output = '';

  if (currentPrompt) {
    output += `${currentPrompt}\n---\n\n`;
  }

  const { invoke } = window.__TAURI__.core;
  const sortedPaths = Array.from(selectedPaths).sort();
  for (const fullPath of sortedPaths) {
    try {
      const stats = await invoke('get_file_stats', { path: fullPath });
      if (stats.is_dir) continue;

      const content = await invoke('read_file', { path: fullPath });
      const relPath = fullPath.replace(rootPath, '').replace(/^[\\/]/, '');
      output += `# ${relPath}\n${content}\n\n`;
    } catch (err) {
      const relPath = fullPath.replace(rootPath, '').replace(/^[\\/]/, '');
      output += `# ${relPath} [ERROR: ${String(err)}]\n\n`;
    }
  }

  output = output.trimEnd() + '\n';

  const filePath = await save({
    filters: [{ name: "Plain Text", extensions: ["txt"] }],
    defaultPath: `code-context.txt`
  });

  if (filePath) {
    await writeTextFile(filePath, output);
  }
}
function buildSelectedTree() {
  const tree = {
    name: rootPath.split(/[\\/]/).pop() || 'root',
    path: rootPath,
    children: {},
    isDir: true
  };

  // Sort paths so parents are processed before children
  const sortedPaths = Array.from(selectedPaths).sort();

  for (const fullPath of sortedPaths) {
    const relPath = fullPath.replace(rootPath, '').replace(/^[\\/]/, '');
    if (!relPath) continue;

    const parts = relPath.split(/[\\/]/);
    let current = tree;

    // Traverse/create intermediate folders
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const key = parts.slice(0, i + 1).join('/');

      if (!current.children[key]) {
        current.children[key] = {
          name: part,
          path: rootPath + '/' + key,
          children: isFile ? null : {},
          isDir: !isFile,
          isSelected: isFile // only files are "selected"
        };
      }

      if (!isFile) {
        current = current.children[key];
      }
    }
  }

  return tree;
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