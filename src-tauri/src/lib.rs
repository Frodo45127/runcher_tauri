use regex::Regex;
use rpfm_lib::games::{
    supported_games::{SupportedGames, KEY_ARENA},
    GameInfo,
};
use rpfm_lib::schema::Schema;
use settings::*;
use std::cell::LazyCell;
use std::sync::{Arc, LazyLock, RwLock};
use tauri::Listener;

mod mod_manager;
mod settings;

/// Sentry client guard, so we can reuse it later on and keep it in scope for the entire duration of the program.
//static ref SENTRY_GUARD: Arc<RwLock<ClientInitGuard>> = Arc::new(RwLock::new(Logger::init(&{
//    init_config_path().expect("Error while trying to initialize config path. We're fucked.");
//    error_path().unwrap_or_else(|_| PathBuf::from("."))
//}, true, true, release_name!()).unwrap()));

/// Currently loaded schema.
static SCHEMA: LazyLock<Option<Schema>> = LazyLock::new(|| None);
static SETTINGS: LazyLock<Arc<RwLock<AppSettings>>> =
    LazyLock::new(|| Arc::new(RwLock::new(AppSettings::default())));
static GAME_SELECTED: LazyLock<GameInfo> =
    LazyLock::new(|| SupportedGames::default().game("arena").unwrap().clone());

const REGEX_MAP_INFO_DISPLAY_NAME: LazyCell<Regex> =
    LazyCell::new(|| Regex::new(r"<display_name>(.*)</display_name>").unwrap());
const REGEX_MAP_INFO_DESCRIPTION: LazyCell<Regex> =
    LazyCell::new(|| Regex::new(r"<description>(.*)</description>").unwrap());
const REGEX_MAP_INFO_TYPE: LazyCell<Regex> =
    LazyCell::new(|| Regex::new(r"<type>(.*)</type>").unwrap());
const REGEX_MAP_INFO_TEAM_SIZE_1: LazyCell<Regex> =
    LazyCell::new(|| Regex::new(r"<team_size_1>(.*)</team_size_1>").unwrap());
const REGEX_MAP_INFO_TEAM_SIZE_2: LazyCell<Regex> =
    LazyCell::new(|| Regex::new(r"<team_size_2>(.*)</team_size_2>").unwrap());
const REGEX_MAP_INFO_DEFENDER_FUNDS_RATIO: LazyCell<Regex> =
    LazyCell::new(|| Regex::new(r"<defender_funds_ratio>(.*)</defender_funds_ratio>").unwrap());
const REGEX_MAP_INFO_HAS_KEY_BUILDINGS: LazyCell<Regex> =
    LazyCell::new(|| Regex::new(r"<has_key_buildings>(.*)</has_key_buildings>").unwrap());

const VERSION: &str = env!("CARGO_PKG_VERSION");
const VERSION_SUBTITLE: &str = " -- When I learned maths";

const GITHUB_URL: &str = "https://github.com/Frodo45127/runcher";
const DISCORD_URL: &str = "https://discord.gg/moddingden";
const PATREON_URL: &str = "https://www.patreon.com/RPFM";

//const FALLBACK_LOCALE_EN: &str = include_str!("../../locale/English_en.ftl");
const SENTRY_DSN_KEY: &str =
    "https://4c058b715c304d55b928c3e44a63b4ff@o152833.ingest.sentry.io/4504851217711104";

const SQL_SCRIPTS_REPO: &str = "https://github.com/Frodo45127/twpatcher-sql-scripts";
const SQL_SCRIPTS_BRANCH: &str = "master";
const SQL_SCRIPTS_REMOTE: &str = "origin";

const REPO_OWNER: &str = "Frodo45127";
const REPO_NAME: &str = "runcher";

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

#[tauri::command]
fn on_window_ready() -> Result<String, String> {
    println!("Window HTML fully loaded and ready!");
    // Aquí puedes colocar cualquier lógica que necesites ejecutar cuando la ventana esté lista
    // Por ejemplo, cargar datos iniciales, verificar actualizaciones, etc.
    Ok("Window ready event received".to_string())
}

#[tauri::command]
fn init_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    AppSettings::init(&app_handle).map_err(|e| format!("Failed to load settings: {}", e))
}

// Load settings from config file
#[tauri::command]
fn load_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    Ok(SETTINGS.read().unwrap().clone())
}

// Save settings to config file
#[tauri::command]
fn save_settings(app_handle: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    settings
        .save(&app_handle)
        .map_err(|e| format!("Failed to save settings: {}", e))?;
    *SETTINGS.write().unwrap() = settings;
    Ok(())
}

#[tauri::command]
fn get_available_languages() -> Vec<String> {
    // Devuelve los idiomas disponibles en la aplicación
    vec![
        "English".to_string(),
        "Español".to_string(),
        "Français".to_string(),
        "Deutsch".to_string(),
        "Italiano".to_string(),
    ]
}

#[tauri::command]
fn get_available_date_formats() -> Vec<String> {
    // Devuelve los formatos de fecha disponibles
    vec![
        "DD/MM/YYYY".to_string(),
        "MM/DD/YYYY".to_string(),
        "YYYY-MM-DD".to_string(),
        "DD.MM.YYYY".to_string(),
        "YYYY/MM/DD".to_string(),
    ]
}

#[tauri::command]
async fn browse_folder(app: tauri::AppHandle, title: String, current_path: String) -> Option<String> {
    use std::path::PathBuf;
    use tauri_plugin_dialog::DialogExt;

    // Si se proporcionó una ruta válida, iniciar el diálogo en esa carpeta
    let start_dir = PathBuf::from(&current_path);
    
    // Mostrar el diálogo y obtener la carpeta seleccionada
    let dialog = app.dialog()
        .file()
        .set_directory(start_dir)
        .set_title(title);
    
    dialog.blocking_pick_folder()
        .map(|path| path.as_path().unwrap().to_string_lossy().to_string())
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle();
            *SETTINGS.write().unwrap() = AppSettings::init(&app_handle).unwrap();

            // Registrar un listener para el evento tauri://ready
            app_handle.listen_any("tauri://ready", move |_| {
                println!("Tauri application ready event triggered");
                // Puedes realizar acciones adicionales si es necesario
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            launch_game,
            get_sidebar_icons,
            get_tree_data,
            handle_checkbox_change,
            handle_item_drop,
            init_settings,
            load_settings,
            save_settings,
            get_list_items,
            on_window_ready,
            get_available_languages,
            get_available_date_formats,
            browse_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
