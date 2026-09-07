#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tree;
use tree::{TreeNode, IGNORED_DIRS};
use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use walkdir::WalkDir;
use rayon::prelude::*;

// --- WASM & WASI Imports (iOS Compliant) ---
use wasmi::{Engine, Linker, Module, Store};
use wasmi_wasi::sync::add_to_linker;
use wasi_common::pipe::WritePipe;
use wasi_common::sync::WasiCtxBuilder;
// --- Git Imports ---
use git2::{Repository, build::RepoBuilder, FetchOptions, RemoteCallbacks, Signature, IndexAddOption};

#[derive(Serialize)]
struct FileContent {
    path: String,
    content: String,
    error: Option<String>,
}

#[derive(Serialize)]
struct FileInfo {
    path: String,
    size: u64,
    is_dir: bool,
}

fn is_ignored(path: &std::path::Path) -> bool {
    path.ancestors().any(|p| {
        p.file_name()
            .map(|n| IGNORED_DIRS.contains(&n.to_string_lossy().as_ref()))
            .unwrap_or(false)
    })
}

#[tauri::command]
fn get_file_info(paths: Vec<String>) -> Result<Vec<FileInfo>, String> {
    let mut results = Vec::new();
    
    for path in paths {
        match std::fs::metadata(&path) {
            Ok(metadata) => results.push(FileInfo {
                path: path.clone(),
                size: metadata.len(),
                is_dir: metadata.is_dir(),
            }),
            Err(_) => {
                // Skip files that can't be read
            }
        }
    }
    
    Ok(results)
}

#[tauri::command]
async fn read_multiple_files(paths: Vec<String>) -> Result<Vec<FileContent>, String> {
    tokio::task::spawn_blocking(move || {
        paths
            .par_iter()
            .map(|path| {
                match std::fs::read_to_string(path) {
                    Ok(content) => FileContent {
                        path: path.clone(),
                        content,
                        error: None,
                    },
                    Err(e) => FileContent {
                        path: path.clone(),
                        content: String::new(),
                        error: Some(e.to_string()),
                    },
                }
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_all_files_in_directory(path: String) -> Result<Vec<String>, String> {
    let path = std::path::PathBuf::from(&path);
    
    if !path.exists() || !path.is_dir() {
        return Err("Directory does not exist".to_string());
    }

    let mut files = Vec::new();
    
    for entry in WalkDir::new(&path)
        .follow_links(false)
        .max_depth(10)
        .into_iter()
        .filter_entry(|e| !is_ignored(e.path()))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        if let Some(path_str) = entry.path().to_str() {
            files.push(path_str.to_string());
        }
    }

    Ok(files)
}

#[derive(Serialize)]
pub struct FileStat {
    pub is_dir: bool,
}

#[tauri::command]
fn get_tree_for_path(path: String) -> Result<TreeNode, String> {
    let path = std::path::PathBuf::from(path);

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    Ok(TreeNode {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir: path.is_dir(),
        children: Vec::new(),
    })
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_file_stats(path: String) -> Result<FileStat, String> {
    let metadata = fs::metadata(&path)
        .map_err(|e| e.to_string())?;
    
    Ok(FileStat {
        is_dir: metadata.is_dir(),
    })
}

#[tauri::command]
fn get_launch_dir() -> Result<String, String> {
    if let Ok(dev_dir) = std::env::var("BRANCH_DEV_DIR") {
        return Ok(dev_dir);
    }

    std::env::current_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn get_children_for_path(path: String) -> Result<Vec<TreeNode>, String> {
    let path = std::path::PathBuf::from(path);
    if !path.is_dir() {
        return Ok(vec![]);
    }

    let mut children = Vec::new();

    let entries = std::fs::read_dir(&path)
        .map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let entry_path = entry.path();

        let name = entry
            .file_name()
            .to_string_lossy()
            .to_string();

        if IGNORED_DIRS.contains(&name.as_str()) {
            continue;
        }

        children.push(TreeNode {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir: entry_path.is_dir(),
            children: Vec::new(),
        });
    }

    children.sort_by_key(|n| (!n.is_dir, n.name.clone()));

    Ok(children)
}

#[tauri::command]
async fn get_all_paths_in_directory(path: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&path);

        if !path.exists() || !path.is_dir() {
            return Err("Directory does not exist".to_string());
        }

        let mut paths = Vec::new();

        for entry in WalkDir::new(&path)
            .follow_links(false)
            .max_depth(10)
            .into_iter()
            .filter_entry(|e| !is_ignored(e.path()))
            .filter_map(|e| e.ok())
        {
            if let Some(path_str) = entry.path().to_str() {
                paths.push(path_str.to_string());
            }
        }

        Ok(paths)
    })
    .await
    .map_err(|e| e.to_string())?
}

use std::io::Write;
use std::process::{Command, Stdio};

#[tauri::command]
fn write_to_clipboard(text: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        if text.is_empty() {
            let _ = Command::new("wl-copy").arg("--clear").status()
                .or_else(|_| Command::new("xclip").args(["-selection", "clipboard", "/dev/null"]).status());
            return Ok(());
        }

        let mut child = Command::new("wl-copy")
            .stdin(Stdio::piped())
            .spawn()
            .or_else(|_| {
                Command::new("xclip")
                    .arg("-selection")
                    .arg("clipboard")
                    .stdin(Stdio::piped())
                    .spawn()
            })
            .map_err(|e| format!("Clipboard binary missing (install wl-clipboard or xclip): {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let mut clipboard = arboard::Clipboard::new()
            .map_err(|e| format!("Failed to initialize clipboard: {}", e))?;
        
        if text.is_empty() {
            clipboard.clear().map_err(|e| format!("Failed to clear clipboard: {}", e))
        } else {
            clipboard.set_text(text).map_err(|e| format!("Failed to set text in clipboard: {}", e))
        }
    }
}

// ==========================================
// 1. POSIX Commands via busybox.wasm (wasmi)
// ==========================================

/// Small shell-like tokenizer for the terminal backend.
///
/// This intentionally handles the common cases we need here:
/// - whitespace separates arguments
/// - single and double quotes preserve whitespace
/// - backslash escapes the next character outside single quotes
///
/// It is not intended to be a full POSIX shell parser; pipelines,
/// redirection, glob expansion, etc. should be handled by the shell
/// layer rather than passed to BusyBox as one opaque argument.
fn parse_command_line(input: &str) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut chars = input.chars().peekable();

    let mut quote: Option<char> = None;
    let mut token_started = false;

    while let Some(ch) = chars.next() {
        match quote {
            Some('\'') => {
                if ch == '\'' {
                    quote = None;
                } else {
                    current.push(ch);
                }
            }
            Some('"') => {
                match ch {
                    '"' => quote = None,
                    '\\' => {
                        let next = chars.next().ok_or_else(|| {
                            "Unterminated escape sequence in double-quoted argument".to_string()
                        })?;
                        current.push(next);
                    }
                    _ => current.push(ch),
                }
            }
            None => {
                match ch {
                    '\'' | '"' => {
                        quote = Some(ch);
                        token_started = true;
                    }
                    '\\' => {
                        let next = chars.next().ok_or_else(|| {
                            "Unterminated escape sequence at end of command".to_string()
                        })?;
                        current.push(next);
                        token_started = true;
                    }
                    c if c.is_whitespace() => {
                        if token_started {
                            args.push(std::mem::take(&mut current));
                            token_started = false;
                        }
                    }
                    _ => {
                        current.push(ch);
                        token_started = true;
                    }
                }
            }
            _ => unreachable!(),
        }
    }

    if quote.is_some() {
        return Err("Unterminated quoted argument".to_string());
    }

    if token_started {
        args.push(current);
    }

    Ok(args)
}

#[tauri::command]
async fn execute_posix_command(cmd: String, cwd: String) -> Result<String, String> {
    let engine = Engine::default();
    let mut linker = Linker::new(&engine);

    add_to_linker(&mut linker, |ctx| ctx).map_err(|e| e.to_string())?;

    let wasm_path = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join("busybox.wasm");

    let wasm_bytes = std::fs::read(&wasm_path)
        .map_err(|e| format!("Failed to read busybox.wasm: {}", e))?;

    let module = Module::new(&engine, &wasm_bytes[..])
        .map_err(|e| format!("Failed to load busybox.wasm: {}", e))?;

    let command_args = parse_command_line(&cmd)?;

    if command_args.is_empty() {
        return Ok(String::new());
    }

    // BusyBox expects argv[0] to be the program name.
    let mut args = Vec::with_capacity(command_args.len() + 1);
    args.push("busybox".to_string());
    args.extend(command_args);

    let dir = cap_std::fs::Dir::open_ambient_dir(
        &cwd,
        cap_std::ambient_authority(),
    )
    .map_err(|e| format!("Failed to open directory '{}': {}", cwd, e))?;

    // wasi-common already provides a correct WasiFile implementation for
    // capturing stdout/stderr. This avoids implementing the async WasiFile
    // trait ourselves and keeps the ABI/version coupling in one place.
    let stdout = WritePipe::new_in_memory();
    let stderr = WritePipe::new_in_memory();

    let mut builder = WasiCtxBuilder::new();

    builder
        .stdout(Box::new(stdout.clone()))
        .stderr(Box::new(stderr.clone()))
        .args(&args)
        .map_err(|e| e.to_string())?
        .preopened_dir(dir, ".")
        .map_err(|e| e.to_string())?;

    let wasi_ctx = builder.build();
    let mut store = Store::new(&engine, wasi_ctx);

    let instance = linker
        .instantiate(&mut store, &module)
        .map_err(|e| e.to_string())?
        .start(&mut store)
        .map_err(|e| e.to_string())?;

    let start = instance
        .get_func(&store, "_start")
        .ok_or_else(|| "No _start function found in busybox.wasm".to_string())?;

    start
        .call(&mut store, &[], &mut [])
        .map_err(|e| e.to_string())?;

    // WritePipe stores the output behind an Arc. Drop everything that holds
    // a reference before extracting the final Vec<u8>.
    drop(start);
    drop(instance);
    drop(store);

    let out = stdout
        .try_into_inner()
        .map_err(|_| "Failed to collect stdout from WASM process".to_string())?
        .into_inner();

    let err = stderr
        .try_into_inner()
        .map_err(|_| "Failed to collect stderr from WASM process".to_string())?
        .into_inner();

    let out = String::from_utf8_lossy(&out).to_string();
    let err = String::from_utf8_lossy(&err).to_string();

    if !err.is_empty() && out.is_empty() {
        return Err(err.trim().to_string());
    }

    if out.trim().is_empty() && err.trim().is_empty() {
        Ok("Command executed successfully.".to_string())
    } else {
        Ok(format!("{}{}", out, err))
    }
}

// ==========================================
// 2. Git Operations via git2-rs (Native)
// ==========================================
#[tauri::command]
fn git_init(path: String) -> Result<String, String> {
    Repository::init(&path).map_err(|e| e.to_string())?;
    Ok("Initialized empty Git repository.".to_string())
}

#[tauri::command]
fn git_clone(url: String, path: String) -> Result<String, String> {
    let callbacks = RemoteCallbacks::new();
    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(callbacks);
    
    let mut builder = RepoBuilder::new();
    builder.fetch_options(fetch_opts);
    
    builder.clone(&url, std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    Ok(format!("Cloned {} into {}", url, path))
}

#[tauri::command]
fn git_status(path: String) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let statuses = repo.statuses(None).map_err(|e| e.to_string())?;
    
    if statuses.is_empty() {
        return Ok("On branch main\nNothing to commit, working tree clean".to_string());
    }

    let mut output = String::from("On branch main\nChanges not staged for commit:\n");
    for entry in statuses.iter() {
        let p = entry.path().unwrap_or("unknown");
        let s = entry.status();
        if s.is_wt_new() { output.push_str(&format!("  (new)      {}\n", p)); }
        else if s.is_wt_modified() { output.push_str(&format!("  (modified) {}\n", p)); }
        else if s.is_wt_deleted() { output.push_str(&format!("  (deleted)  {}\n", p)); }
        else if s.is_index_new() || s.is_index_modified() { output.push_str(&format!("  (staged)   {}\n", p)); }
    }
    Ok(output)
}

#[tauri::command]
fn git_add(path: String, filepath: String) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    
    let target = if filepath == "." || filepath.is_empty() { "." } else { &filepath };
    index.add_all([target].iter(), IndexAddOption::DEFAULT, None).map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    
    Ok(format!("Added '{}' to staging.", filepath))
}

#[tauri::command]
fn git_commit(path: String, message: String) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
    let sig = Signature::now("Branch User", "user@branch.local").map_err(|e| e.to_string())?;
    
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents = if let Some(p) = &parent { vec![p] } else { vec![] };
    
    let oid = repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.to_string())?;
        
    Ok(format!("Committed {} {}", &oid.to_string()[..7], message))
}

#[tauri::command]
fn git_branch_list(path: String) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let current = repo.head().ok().and_then(|h| h.shorthand().map(|s| s.to_string()));
    let branches = repo.branches(None).map_err(|e| e.to_string())?;
    
    let mut result = String::new();
    for branch in branches {
        let (b, _) = branch.map_err(|e| e.to_string())?;
        let name = b.name().map_err(|e| e.to_string())?.unwrap_or("unknown");
        if current.as_deref() == Some(name) {
            result.push_str(&format!("* {}\n", name));
        } else {
            result.push_str(&format!("  {}\n", name));
        }
    }
    Ok(if result.is_empty() { "No branches found.".to_string() } else { result.trim_end().to_string() })
}

#[tauri::command]
fn git_checkout(path: String, branch_name: String) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let (object, reference) = repo.revparse_ext(&branch_name).map_err(|e| e.to_string())?;
    
    repo.checkout_tree(&object, None).map_err(|e| e.to_string())?;
    
    match reference {
        Some(gref) => repo.set_head(gref.name().unwrap()).map_err(|e| e.to_string())?,
        None => repo.set_head_detached(object.id()).map_err(|e| e.to_string())?,
    }
    Ok(format!("Switched to branch '{}'", branch_name))
}
#[tauri::command]
fn write_to_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard::init()) 
        .invoke_handler(tauri::generate_handler![
            get_tree_for_path,
            get_launch_dir,
            get_children_for_path,
            read_file,
            get_file_stats,
            get_all_files_in_directory,
            get_all_paths_in_directory,
            read_multiple_files,
            get_file_info,
            write_to_clipboard,
            write_to_file,
            execute_posix_command,
            git_init,
            git_clone,
            git_status,
            git_add,
            git_commit,
            git_branch_list,
            git_checkout
        ])
        .run(tauri::generate_context!())
        .expect("error while running Branch");
}
