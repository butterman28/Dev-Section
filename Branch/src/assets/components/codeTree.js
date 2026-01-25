// ./assets/features/codeTree.js

let selectedPaths = new Set();
let rootPath = '';
let codeTreePanel = null;

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
  rootPath = root;

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
    <div id="code-tree-content" class="flex-1 overflow-auto bg-slate-100 p-3 rounded shadow-sm hide-scrollbar">
      <p class="text-slate-500 italic">Select files using checkboxes in the tree.</p>
    </div>
    <div class="mt-2 flex gap-2">
      <button id="export-md" class="px-2 py-1 text-xs bg-blue-600 text-white rounded">Markdown</button>
      <button id="export-js" class="px-2 py-1 text-xs bg-green-600 text-white rounded">JavaScript</button>
      <button id="export-txt" class="px-2 py-1 text-xs bg-gray-700 text-white rounded">Text</button>
    </div>
  `;

  // Attach export handlers
  panel.querySelector('#export-md').addEventListener('click', () => exportAs('md'));
  panel.querySelector('#export-js').addEventListener('click', () => exportAs('js'));
  panel.querySelector('#export-txt').addEventListener('click', () => exportAs('txt'));

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

  container.innerHTML = '<p class="text-slate-500">Loading content…</p>';

  const { invoke } = window.__TAURI__.core;
  const items = [];

  for (const path of selectedPaths) {
    try {
      const stats = await invoke('get_file_stats', { path });
      if (!stats.is_dir) {
        const content = await invoke('read_file', { path });
        items.push({ path, content, isDir: false });
      } else {
        items.push({ path, content: null, isDir: true });
      }
    } catch (err) {
      items.push({ path, content: `<!-- Error: ${err.message} -->`, isDir: false });
    }
  }

  // Render
  container.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'mb-3';

    const name = item.path.split('/').pop();
    const header = document.createElement('div');
    header.className = 'flex items-center gap-2';
    header.innerHTML = `<strong class="truncate-button">${name}</strong>`;

    if (!item.isDir) {
      const promptBtn = document.createElement('button');
      promptBtn.textContent = '✏️';
      promptBtn.className = 'text-xs text-blue-600';
      promptBtn.title = 'Add custom prompt';
      promptBtn.onclick = () => showPromptModal(item.path);
      header.appendChild(promptBtn);

      const pre = document.createElement('pre');
      pre.className = 'bg-white p-2 rounded text-xs mt-1 max-h-32 overflow-auto font-mono';
      pre.textContent = item.content;
      div.appendChild(pre);
    }

    div.prepend(header);
    container.appendChild(div);
  });
}

// Placeholder — you can integrate with your existing modal system
function showPromptModal(path) {
  alert(`Prompt for: ${path}\n(You can replace this with your unified modal)`);
}

async function exportAs(format) {
  const { save } = window.__TAURI__.dialog;
  const { writeTextFile } = window.__TAURI__.fs;
  const { invoke } = window.__TAURI__.core;

  let output = '';

  if (format === 'md') {
    output = `# Code Tree Export\n\nRoot: \`${rootPath}\`\n\n`;
    for (const path of selectedPaths) {
      try {
        const stats = await invoke('get_file_stats', { path });
        if (!stats.is_dir) {
          const content = await invoke('read_file', { path });
          const relPath = path.replace(rootPath, '').replace(/^\/|\\/, '');
          output += `\n## ${relPath}\n\n\`\`\`js\n${content}\n\`\`\`\n`;
        }
      } catch (err) {
        output += `\n## ${path} (error)\n\n<!-- Failed to read -->\n`;
      }
    }
  } else if (format === 'js') {
    const tree = {};
    for (const path of selectedPaths) {
      try {
        const stats = await invoke('get_file_stats', { path });
        if (!stats.is_dir) {
          const content = await invoke('read_file', { path });
          const key = path.replace(rootPath, '').replace(/^[/\\]/, '');
          tree[key] = content;
        }
      } catch {}
    }
    output = `const codeTree = ${JSON.stringify(tree, null, 2)};`;
  } else {
    output = Array.from(selectedPaths).join('\n');
  }

  const filePath = await save({
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (filePath) {
    await writeTextFile(filePath, output);
  }
}