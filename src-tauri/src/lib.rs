use rpfm_lib::games::supported_games::{SupportedGames, KEY_ARENA};
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use settings::*;

mod mod_manager;
mod settings;

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
    let games = SupportedGames::default();
    let games = games.games_sorted();
    let mut icons = Vec::with_capacity(games.len() - 1);
    for game in games {
        if game.key() != KEY_ARENA {
            icons.push(SidebarIcon {
                id: game.key().to_string(),
                name: game.display_name().to_string(),
                icon: game.icon_small().to_string(),
            });   
        }
    }

    icons
}

#[tauri::command]
fn get_list_items() -> Vec<ListItem> {
    vec![
        ListItem {
            id: "pack1".to_string(),
            pack: "HD Textures".to_string(),
            item_type: "Graphics".to_string(),
            order: 1,
            location: "C:/Games/Packs/HD".to_string(),
        },
        ListItem {
            id: "pack2".to_string(),
            pack: "UI Overhaul".to_string(),
            item_type: "Interface".to_string(),
            order: 2,
            location: "C:/Games/Packs/UI".to_string(),
        },
        ListItem {
            id: "pack3".to_string(),
            pack: "Sound Enhancement".to_string(),
            item_type: "Audio".to_string(),
            order: 3,
            location: "C:/Games/Packs/Audio".to_string(),
        },
        ListItem {
            id: "pack4".to_string(),
            pack: "Gameplay Rebalance".to_string(),
            item_type: "Gameplay".to_string(),
            order: 4,
            location: "C:/Games/Packs/Balance".to_string(),
        },
        ListItem {
            id: "pack5".to_string(),
            pack: "Character Models".to_string(),
            item_type: "Graphics".to_string(),
            order: 5,
            location: "C:/Games/Packs/Models".to_string(),
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

// Load settings from config file
#[tauri::command]
fn load_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    AppSettings::load(&app_handle).map_err(|e| format!("Failed to load settings: {}", e))
}

// Save settings to config file
#[tauri::command]
fn save_settings(app_handle: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    settings.save(&app_handle).map_err(|e| format!("Failed to save settings: {}", e))
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

#[derive(serde::Serialize)]
struct ListItem {
    id: String,
    pack: String,
    item_type: String,
    order: i32,
    location: String,
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
            handle_item_drop,
            load_settings,
            save_settings,
            get_list_items
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
