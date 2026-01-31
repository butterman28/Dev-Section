#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod tree;
use tree::{build_tree, TreeNode,IGNORED_DIRS};
use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use walkdir::WalkDir;
use rayon::prelude::*;

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

// Keep read_multiple_files as is
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
    
    // Native Rust file traversal - extremely fast
    for entry in WalkDir::new(&path)
        .follow_links(false)
        .max_depth(10)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        // Skip ignored directories
        let entry_path = entry.path();
        if let Some(parent) = entry_path.parent() {
            if let Some(dir_name) = parent.file_name() {
                if tree::IGNORED_DIRS.contains(&dir_name.to_string_lossy().as_ref()) {
                    continue;
                }
            }
        }
        
        if let Some(path_str) = entry_path.to_str() {
            files.push(path_str.to_string());
        }
    }

    Ok(files)
}



#[derive(Serialize)]
pub struct FileStat {
    pub is_dir: bool,
    // You can add more fields later if needed (size, modified, etc.)
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
        children: Vec::new(), // IMPORTANT: empty
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
    // DEV override
    if let Ok(dev_dir) = std::env::var("BRANCH_DEV_DIR") {
        return Ok(dev_dir);
    }

    // PROD / real execution
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
            children: Vec::new(), // ALWAYS empty
        });
    }

    // dirs first, then files
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
            .filter_map(|e| e.ok())
        {
            let entry_path = entry.path();

            if let Some(parent) = entry_path.parent() {
                if let Some(dir_name) = parent.file_name() {
                    if IGNORED_DIRS.contains(&dir_name.to_string_lossy().as_ref()) {
                        continue;
                    }
                }
            }

            if let Some(path_str) = entry_path.to_str() {
                paths.push(path_str.to_string());
            }
        }

        Ok(paths)
    })
    .await
    .map_err(|e| e.to_string())?
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
            get_file_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running Branch");
}
