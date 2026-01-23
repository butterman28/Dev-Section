use serde::Serialize;
use std::fs;
use std::path::Path;

pub const IGNORED_DIRS: &[&str] = &[".git", "target", "node_modules"];

#[derive(Serialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<TreeNode>,
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
