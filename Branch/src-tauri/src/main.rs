#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod tree;
use tree::{build_tree, TreeNode,IGNORED_DIRS};
use std::fs;
use std::path::PathBuf;
use serde::Serialize;

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


fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_tree_for_path,
            get_launch_dir,
            get_children_for_path,
            read_file,
            get_file_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Branch");
}
