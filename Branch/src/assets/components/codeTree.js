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
  <h3 class="font-bold text-slate-800 mb-2">Selected Code Preview</h3>
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

  // Determine if this path is a directory
  const isDir = !!document.querySelector(`details[data-path="${CSS.escape(path)}"]`);

  if (isDir) {
    // ✅ Get ALL paths (folders + files) not just script files
    const allPaths = await invoke("get_all_paths_in_directory", {
      path: path
    });
    
    // Include the folder itself
    allPaths.push(path);
    
    if (isChecked) {
      allPaths.forEach(p => selectedPaths.add(p));
    } else {
      allPaths.forEach(p => selectedPaths.delete(p));
    }
  } else {
    // It's a file
    if (isChecked) {
      selectedPaths.add(path);
    } else {
      selectedPaths.delete(path);
    }
  }

  syncCheckboxes();
  updateCodeTreePreview();
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
  copyButton.className = 'absolute top-1 right-1 z-10 px-1.5 py-0.5 text-xs bg-gray-800 text-white rounded opacity-80 hover:opacity-100';
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
  contentTextarea.value = 'Loading content…';
  contentTextarea.spellcheck = false;
  
  previewContainer.appendChild(contentTextarea);
  previewContainer.appendChild(copyButton);

  wrapper.appendChild(inputRow);
  wrapper.appendChild(previewContainer);
  
  container.innerHTML = '';
  container.appendChild(wrapper);

  // ✅ OPTIMIZED: Build preview content
  const { invoke } = window.__TAURI__.core;
  let previewContent = '';

  if (currentPrompt) {
    previewContent += `${currentPrompt}\n---\n\n`;
  }

  // Build Unix tree
  const sortedPaths = Array.from(selectedPaths).sort();
  const treeText = buildUnixTree(sortedPaths, rootPath);
  if (treeText) {
    previewContent += `${treeText}\n\n`;
  }

  // ✅ CRITICAL OPTIMIZATION: Filter out directories FIRST
  // We need to check which paths are files vs directories
  const filePaths = [];
  const dirPaths = [];
  
  for (const path of sortedPaths) {
    const isDir = !!document.querySelector(`details[data-path="${CSS.escape(path)}"]`);
    if (isDir) {
      dirPaths.push(path);
    } else {
      filePaths.push(path);
    }
  }

  // ✅ BATCH READ ALL FILES AT ONCE (single Rust call)
  try {
    const fileContents = await invoke('read_multiple_files', {
      paths: filePaths
    });

    // Build content from batch results
    for (const file of fileContents) {
      const relPath = file.path.replace(rootPath, '').replace(/^[\\/]/, '');
      if (file.error) {
        previewContent += `# ${relPath} [ERROR: ${file.error}]\n\n`;
      } else {
        previewContent += `# ${relPath}\n${file.content}\n\n`;
      }
    }
  } catch (err) {
    console.error('Failed to read files:', err);
    previewContent += `\n[ERROR: Failed to load file contents]`;
  }

  previewContent = previewContent.trimEnd();
  
  // Restore scroll position
  const scrollTop = contentTextarea.scrollTop;
  const scrollLeft = contentTextarea.scrollLeft;
  
  contentTextarea.value = previewContent;
  
  contentTextarea.scrollTop = scrollTop;
  contentTextarea.scrollLeft = scrollLeft;
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

    const { invoke } = window.__TAURI__.core;
    
    // ✅ Filter out directories
    const filePaths = Array.from(selectedPaths).filter(path => {
      return !document.querySelector(`details[data-path="${CSS.escape(path)}"]`);
    });

    // ✅ BATCH READ
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