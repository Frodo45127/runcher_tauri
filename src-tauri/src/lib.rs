// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn launch_game(id: &str) -> Result<String, String> {
    // In a real implementation, this would launch the game with the given ID
    println!("Launching game with ID: {}", id);
    Ok(format!("Game {} launched successfully!", id))
}

#[tauri::command]
fn get_sidebar_icons() -> Vec<SidebarIcon> {
    vec![
        SidebarIcon {
            id: "home".to_string(),
            name: "Home".to_string(),
            icon: "home".to_string(),
        },
        SidebarIcon {
            id: "library".to_string(),
            name: "Library".to_string(),
            icon: "book".to_string(),
        },
        SidebarIcon {
            id: "friends".to_string(),
            name: "Friends".to_string(),
            icon: "users".to_string(),
        },
        SidebarIcon {
            id: "settings".to_string(),
            name: "Settings".to_string(),
            icon: "cog".to_string(),
        },
    ]
}

#[tauri::command]
fn get_tree_data() -> Vec<TreeCategory> {
    vec![
        TreeCategory {
            id: "recent".to_string(),
            name: "Recently Played".to_string(),
            size: "".to_string(),
            status: "".to_string(),
            last_played: "".to_string(),
            children: vec![
                TreeItem {
                    id: "game1".to_string(),
                    name: "Cyberpunk 2077".to_string(),
                    size: "70 GB".to_string(),
                    status: "Installed".to_string(),
                    last_played: "Today".to_string(),
                    is_checked: false,
                },
                TreeItem {
                    id: "game2".to_string(),
                    name: "Half-Life 2".to_string(),
                    size: "15 GB".to_string(),
                    status: "Installed".to_string(),
                    last_played: "Yesterday".to_string(),
                    is_checked: true,
                },
            ],
        },
        TreeCategory {
            id: "installed".to_string(),
            name: "Installed Games".to_string(),
            size: "".to_string(),
            status: "".to_string(),
            last_played: "".to_string(),
            children: vec![
                TreeItem {
                    id: "game3".to_string(),
                    name: "Portal 2".to_string(),
                    size: "10 GB".to_string(),
                    status: "Installed".to_string(),
                    last_played: "Last week".to_string(),
                    is_checked: false,
                },
                TreeItem {
                    id: "game4".to_string(),
                    name: "The Witcher 3".to_string(),
                    size: "50 GB".to_string(),
                    status: "Installed".to_string(),
                    last_played: "2 weeks ago".to_string(),
                    is_checked: false,
                },
            ],
        },
    ]
}

#[tauri::command]
fn handle_checkbox_change(game_id: &str, is_checked: bool) -> Result<String, String> {
    println!("Game {} checkbox changed to: {}", game_id, is_checked);
    // Here you would implement actual logic to handle the checkbox change
    // For example, adding to favorites, marking for download, etc.
    
    if is_checked {
        Ok(format!("Game {} marked", game_id))
    } else {
        Ok(format!("Game {} unmarked", game_id))
    }
}

#[tauri::command]
fn handle_item_drop(source_id: &str, target_id: &str) -> Result<String, String> {
    println!("Item {} dropped onto {}", source_id, target_id);
    // Here you would implement logic to handle the reordering, moving between categories, etc.
    
    Ok(format!("Moved item {} to {}", source_id, target_id))
}

#[derive(serde::Serialize)]
struct SidebarIcon {
    id: String,
    name: String,
    icon: String,
}

#[derive(serde::Serialize)]
struct TreeCategory {
    id: String,
    name: String,
    size: String,
    status: String,
    last_played: String,
    children: Vec<TreeItem>,
}

#[derive(serde::Serialize)]
struct TreeItem {
    id: String,
    name: String,
    size: String,
    status: String,
    last_played: String,
    is_checked: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            launch_game, 
            get_sidebar_icons, 
            get_tree_data,
            handle_checkbox_change,
            handle_item_drop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
