// src/assets/components/terminal.js
const { invoke } = window.__TAURI__.core;

let currentPath = "";
let rootPath = "";
let history = [];
let historyIndex = -1;

export function initTerminal(container, projectRoot) {
  rootPath = projectRoot;
  currentPath = projectRoot;
  
  container.innerHTML = `
    <div class="flex flex-col h-full bg-gray-900 text-gray-100 font-mono rounded-lg border border-slate-700 shadow-xl">
      <div class="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 rounded-t-lg shrink-0">
        <span class="text-slate-300 text-xs font-bold">Branch Terminal</span>
        <button id="terminal-clear" class="text-slate-400 hover:text-white text-xs px-2 py-1 min-h-[44px]">Clear</button>
      </div>
      <div id="terminal-output" class="flex-1 overflow-y-auto p-3 whitespace-pre-wrap break-all text-xs sm:text-sm"></div>
      <div class="flex items-center px-3 py-2 bg-slate-800 border-t border-slate-700 rounded-b-lg shrink-0">
        <span id="terminal-prompt" class="mr-2 text-blue-400 text-xs whitespace-nowrap"></span>
        <!-- 16px (text-base) prevents iOS Safari auto-zoom on focus -->
        <input id="terminal-input" type="text" class="flex-1 bg-transparent border-none outline-none text-green-400 text-base" autocomplete="off" spellcheck="false" autocapitalize="off" />
      </div>
    </div>
  `;

  const output = container.querySelector("#terminal-output");
  const input = container.querySelector("#terminal-input");
  const prompt = container.querySelector("#terminal-prompt");
  const clearBtn = container.querySelector("#terminal-clear");

  const updatePrompt = () => {
    const displayPath = currentPath === rootPath ? "~" : currentPath.replace(rootPath, "~");
    prompt.textContent = `user@branch:${displayPath}$`;
  };

  const print = (text, isError = false) => {
    const div = document.createElement("div");
    div.textContent = text;
    if (isError) div.className = "text-red-400";
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  };

  clearBtn.addEventListener("click", () => { output.innerHTML = ""; });
  updatePrompt();
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
      print(`${prompt.textContent} ${cmdLine}`);

      const args = cmdLine.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg => arg.replace(/^"|"$/g, '')) || [];
      const cmd = args.shift();

      try {
        await executeCommand(cmd, args, print);
      } catch (err) {
        print(`Error: ${err.message || err}`, true);
      }
      updatePrompt();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex > 0) { historyIndex--; input.value = history[historyIndex]; }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex < history.length - 1) { historyIndex++; input.value = history[historyIndex]; }
      else { historyIndex = history.length; input.value = ""; }
    }
  });

  container.addEventListener("click", () => input.focus());
}

async function executeCommand(cmd, args, print) {
  // 1. Git Operations (Native git2-rs)
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

  // 2. POSIX Operations (wasmi + busybox.wasm)
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