use serde::Serialize;
use std::fs;
use std::path::Path;
use walkdir::WalkDir; // Add at top of file

pub fn get_all_files_in_directory(path: &Path) -> Vec<String> {
    let mut files = Vec::new();
    
    if !path.exists() || !path.is_dir() {
        return files;
    }

    // WalkDir is extremely fast - native Rust performance
    for entry in WalkDir::new(path)
        .follow_links(false)
        .max_depth(10) // Prevent infinite loops
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        // Skip ignored directories
        let entry_path = entry.path();
        if let Some(parent) = entry_path.parent() {
            if let Some(dir_name) = parent.file_name() {
                if IGNORED_DIRS.contains(&dir_name.to_string_lossy().as_ref()) {
                    continue;
                }
            }
        }
        
        if let Some(path_str) = entry_path.to_str() {
            files.push(path_str.to_string());
        }
    }

    files
}

pub const IGNORED_DIRS: &[&str] = &[".git", "target", "node_modules"];

#[derive(Serialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<TreeNode>,
}

#[derive(Serialize)]
pub struct FileStat {
    pub is_dir: bool,
}

pub fn build_tree(path: &Path) -> Option<TreeNode> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());

    if IGNORED_DIRS.contains(&name.as_str()) {
        return None;
    }

    let mut node = TreeNode {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir: path.is_dir(),
        children: Vec::new(),
    };

    if node.is_dir {
        if let Ok(entries) = fs::read_dir(path) {
            let mut entries: Vec<_> = entries.filter_map(Result::ok).collect();
            entries.sort_by_key(|e| (!e.path().is_dir(), e.file_name()));

            for entry in entries {
                if let Some(child) = build_tree(&entry.path()) {
                    node.children.push(child);
                }
            }
        }
    }

    Some(node)
}
