// src/assets/components/terminal.js
const { invoke } = window.__TAURI__.core;

let currentPath = "";
let rootPath = "";
let history = [];
let historyIndex = -1;

export function initTerminal(container, projectRoot, onClose) {
  rootPath = projectRoot;
  currentPath = projectRoot;
  container.innerHTML = `
<div class="flex flex-col h-full min-h-0 bg-gray-900 text-gray-100 font-mono rounded-lg border border-slate-700 shadow-xl">
    <div class="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 shrink-0 pt-safe">
    <div class="flex items-center gap-2 min-w-0 flex-1">
          <span class="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
          <div class="flex flex-col min-w-0">
            <span class="text-slate-300 text-xs font-bold truncate">Branch Terminal</span>
            <span id="terminal-cwd" class="text-slate-500 text-[10px] font-mono truncate" title=""></span>
          </div>
        </div>
        <div class="flex gap-1 shrink-0">
          <button id="terminal-clear" class="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors">Clear</button>
          <button id="terminal-close" class="text-slate-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-700 transition-colors">&times;</button>
        </div>
      </div>
      <div id="terminal-output" class="flex-1 min-h-0 overflow-y-auto p-3 whitespace-pre-wrap break-all text-xs sm:text-sm overscroll-contain"></div>
    <div class="shrink-0 bg-slate-800 border-t border-slate-700 pb-safe">
        <div class="flex items-center gap-2 px-2 py-2">
          <div class="flex-1 flex items-center bg-slate-900/60 border border-slate-700 rounded-lg px-3 min-h-[44px] focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/30 transition-colors">
            <span class="text-green-500 font-mono text-sm mr-2 select-none">$</span>
            <input id="terminal-input"
                  type="text"
                  inputmode="text"
                  enterkeyhint="send"
                  class="flex-1 bg-transparent border-none outline-none text-green-400 text-sm font-mono min-h-[40px] placeholder:text-slate-600 overflow-x-auto whitespace-nowrap"
                  placeholder="type a command..."
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false" />
          </div>
          <button id="terminal-send"
                  class="shrink-0 w-11 h-11 flex items-center justify-center bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-lg transition-colors"
                  aria-label="Run command">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 5l7 7-7 7M5 12h14"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  const output = container.querySelector("#terminal-output");
  const input = container.querySelector("#terminal-input");
  const clearBtn = container.querySelector("#terminal-clear");
  const closeBtn = container.querySelector("#terminal-close");
  const sendBtn = container.querySelector("#terminal-send");
  const cwdEl = container.querySelector("#terminal-cwd");

  if (onClose) closeBtn.addEventListener("click", onClose);

  input.addEventListener("focus", () => {
    setTimeout(() => {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  });

  // --- Build a prompt string for echoing commands in output ---
  const buildPrompt = () => {
    const projectName = rootPath.split(/[\\/]/).filter(Boolean).pop() || "project";
    if (currentPath === rootPath) {
      return `user@branch:${projectName}$`;
    }
    let rel = currentPath.replace(rootPath, "").replace(/^[\\/]/, "");
    return `user@branch:${projectName}/${rel}$`;
  };

  // --- Update the header CWD display ---
  const updateCwdDisplay = () => {
    if (!cwdEl) return;
    // Show relative path from root, or "~" if at root
    let displayPath;
    if (currentPath === rootPath) {
      displayPath = "~";
    } else {
      displayPath = "~/" + currentPath.replace(rootPath, "").replace(/^[\\/]/, "");
    }
    cwdEl.textContent = displayPath;
    cwdEl.title = currentPath; // full path on hover/long-press
  };

  const print = (text, isError = false) => {
    const div = document.createElement("div");
    div.textContent = text;
    if (isError) div.className = "text-red-400";
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  };

  clearBtn.addEventListener("click", () => { output.innerHTML = ""; });

  updateCwdDisplay();
  print("Welcome to Branch Terminal.");
  print("POSIX: ls, cat, grep, sed, mkdir, find (via busybox.wasm)");
  print("Git: init, clone <url>, status, add, commit -m 'msg', branch, checkout <branch>");

  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const cmdLine = input.value.trim();
      input.value = "";
      if (!cmdLine) return;
      history.push(cmdLine);
      historyIndex = history.length;
      // Echo with full prompt so history is readable
      print(`${buildPrompt()} ${cmdLine}`);
      const args = cmdLine.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg => arg.replace(/^"|"$/g, '')) || [];
      const cmd = args.shift();
      try {
        await executeCommand(cmd, args, print);
      } catch (err) {
        print(`Error: ${err.message || err}`, true);
      }
      updateCwdDisplay(); // refresh header after cd
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex > 0) { historyIndex--; input.value = history[historyIndex]; }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex < history.length - 1) { historyIndex++; input.value = history[historyIndex]; }
      else { historyIndex = history.length; input.value = ""; }
    }
  });

  sendBtn?.addEventListener("click", () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    input.focus();
  });

  container.addEventListener("click", (e) => {
    if (e.target !== sendBtn) input.focus();
  });
}
// The rest of the file (executeCommand, resolvePath) stays unchanged.
// I've included them below for completeness.
async function executeCommand(cmd, args, print) {
  if (cmd === "git") {
    const subcmd = args[0];
    try {
      switch (subcmd) {
        case "init":
          print(await invoke("git_init", { path: currentPath }));
          break;
        case "clone":
          if (args.length < 2) throw new Error("Usage: git clone <url> [directory]");
          const cloneUrl = args[1];
          const cloneDir = args[2] ? resolvePath(args[2]) : currentPath + "/" + cloneUrl.split('/').pop().replace('.git', '');
          print(await invoke("git_clone", { url: cloneUrl, path: cloneDir }));
          break;
        case "status":
          print(await invoke("git_status", { path: currentPath }));
          break;
        case "add":
          const target = args[1] || ".";
          print(await invoke("git_add", { path: currentPath, filepath: target }));
          break;
        case "commit":
          const msgIndex = args.indexOf("-m");
          const msg = msgIndex !== -1 && args[msgIndex + 1] ? args[msgIndex + 1] : "update";
          print(await invoke("git_commit", { path: currentPath, message: msg }));
          break;
        case "branch":
          print(await invoke("git_branch_list", { path: currentPath }));
          break;
        case "checkout":
          if (!args[1]) throw new Error("Usage: git checkout <branch>");
          print(await invoke("git_checkout", { path: currentPath, branch_name: args[1] }));
          break;
        default:
          throw new Error(`Unsupported git command: ${subcmd}`);
      }
    } catch (err) {
      print(`git: ${err}`, true);
    }
    return;
  }

  if (["ls", "cat", "grep", "sed", "mkdir", "find", "pwd", "cd"].includes(cmd)) {
    if (cmd === "cd") {
      const target = args[0] || rootPath;
      try {
        const stat = await invoke("get_file_stats", { path: resolvePath(target) });
        if (stat.is_dir) currentPath = resolvePath(target);
        else print(`cd: ${target}: Not a directory`, true);
      } catch (err) { print(`cd: ${target}: No such file or directory`, true); }
      return;
    }
    if (cmd === "pwd") { print(currentPath); return; }

    const cmdString = args.length > 0 ? `${cmd} ${args.join(" ")}` : cmd;
    try {
      print(await invoke("execute_posix_command", { cmd: cmdString, cwd: currentPath }));
    } catch (err) {
      print(`${cmd}: ${err}`, true);
    }
    return;
  }

  if (cmd === "clear") {
    document.getElementById("terminal-output").innerHTML = "";
    return;
  }

  if (cmd === "help") {
    print("POSIX: ls, cd, cat, grep, sed, mkdir, find, pwd, clear");
    print("Git: git init, git clone <url>, git status, git add, git commit -m 'msg', git branch, git checkout <branch>");
    return;
  }

  print(`${cmd}: command not found`, true);
}

function resolvePath(p) {
  if (!p) return currentPath;
  if (p === "~" || p === "~/") return rootPath;
  if (p.startsWith("~/")) return rootPath + p.slice(1);
  if (p.startsWith("/")) return p;
  
  const baseParts = currentPath.split("/").filter(Boolean);
  const pParts = p.split("/").filter(Boolean);
  for (const part of pParts) {
    if (part === "..") baseParts.pop();
    else if (part !== ".") baseParts.push(part);
  }
  return "/" + baseParts.join("/");
}