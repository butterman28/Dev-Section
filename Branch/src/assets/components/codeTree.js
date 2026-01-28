// ./assets/features/codeTree.js
import { showSnackbar } from "./snackbar.js";
//import clipboard from "tauri-plugin-clipboard-api";

//import clipboard from 
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
    <button id="copy-md" class="px-2 py-1 text-xs bg-blue-600 text-white rounded">Copy as MD</button>
    <button id="copy-json" class="px-2 py-1 text-xs bg-purple-600 text-white rounded">Copy as JSON</button>
    <button id="copy-txt" class="px-2 py-1 text-xs bg-gray-700 text-white rounded">Copy as Text</button>
    <button id="clear-all" class="px-2 py-1 text-xs bg-red-600 text-white rounded">Clear All</button>
  </div>
`;
  panel.querySelector('#copy-md').addEventListener('click', () => copyAs('md'));
  panel.querySelector('#copy-json').addEventListener('click', () => copyAs('json'));
  panel.querySelector('#copy-txt').addEventListener('click', () => copyAs('txt'));
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
  // Preview area container (relative for absolute positioning)
const previewContainer = document.createElement('div');
previewContainer.className = 'relative flex-1';

// Copy button (top-left, above pre)
const copyButton = document.createElement('button');
copyButton.className = 'absolute top-1 right-1 z-10 px-1.5 py-0.5 text-xs bg-gray-800 text-white rounded opacity-80 hover:opacity-100';
copyButton.textContent = 'Copy';
copyButton.addEventListener('click', async () => {
  const textToCopy = contentPre.textContent;
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

// Actual preview content
const contentPre = document.createElement('pre');
contentPre.className = 'font-mono text-sm whitespace-pre overflow-auto flex-1 bg-white p-2 rounded';
contentPre.textContent = 'Loading content…';

previewContainer.appendChild(contentPre);
previewContainer.appendChild(copyButton);

  wrapper.appendChild(inputRow);
  wrapper.appendChild(previewContainer);
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
  try {
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

    const formatConfig = {
      md: { ext: 'md', name: 'Markdown' },
      js: { ext: 'js', name: 'JavaScript' },
      txt: { ext: 'txt', name: 'Plain Text' }
    };

    const config = formatConfig[format] || formatConfig.txt;
    const defaultPath = `code-context.${config.ext}`;

    const filePath = await save({
      filters: [{ name: config.name, extensions: [config.ext] }],
      defaultPath: defaultPath
    });

    if (filePath) {
      await writeTextFile(filePath, output);
      showSnackbar(`Exported as ${config.name}!`, { type: 'success' });
    } else {
      // User canceled save dialog
      showSnackbar('Export canceled.', { type: 'info', duration: 2000 });
    }
  } catch (err) {
    console.error('Export failed:', err);
    showSnackbar('Export failed! See console.', { type: 'error' });
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

async function copyAs(format) {
  try {
    // Generate base content: prompt + files
    let output = '';
    if (currentPrompt) {
      output += `${currentPrompt}\n---\n\n`;
    }

    const { invoke } = window.__TAURI__.core;
    const sortedPaths = Array.from(selectedPaths).sort();

    // Collect file data
    const files = [];
    for (const fullPath of sortedPaths) {
      try {
        const stats = await invoke('get_file_stats', { path: fullPath });
        if (stats.is_dir) continue;
        const content = await invoke('read_file', { path: fullPath });
        const relPath = fullPath.replace(rootPath, '').replace(/^[\\/]/, '');
        files.push({ path: relPath, content });
      } catch (err) {
        const relPath = fullPath.replace(rootPath, '').replace(/^[\\/]/, '');
        files.push({ path: relPath, content: `[ERROR: ${String(err)}]` });
      }
    }

    // Format based on `format`
    let finalText = '';
    switch (format) {
      case 'txt':
      case 'md':
        // Same as before: # path\ncontent\n\n
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
    
// This bypasses the need for the 'window.__TAURI__.clipboard' helper
await invoke('plugin:clipboard|write_text', { text: finalText});
    //await writeText(finalText);
    const formatName = { txt: 'Text', md: 'Markdown', json: 'JSON' }[format];
    showSnackbar(`Copied as ${formatName}!`, { type: 'success' });
  } catch (err) {
    console.error('Copy failed:', err);
    showSnackbar('Copy failed! See console.', { type: 'error' });
  }
}