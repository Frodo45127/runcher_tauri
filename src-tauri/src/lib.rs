use regex::Regex;
use rpfm_lib::games::{
    supported_games::{SupportedGames, KEY_ARENA},
    GameInfo,
};
use rpfm_lib::schema::Schema;
use anyhow::anyhow;
use settings::*;
use std::cell::LazyCell;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex, RwLock};
use tauri::Listener;

use crate::mod_manager::game_config::GameConfig;
use crate::mod_manager::load_order::LoadOrder;
use crate::mod_manager::profiles::Profile;

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

static GAME_LOAD_ORDER: LazyLock<Arc<RwLock<LoadOrder>>> =
    LazyLock::new(|| Arc::new(RwLock::new(LoadOrder::default())));

static GAME_CONFIG: LazyLock<Arc<Mutex<Option<GameConfig>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(None)));

static GAME_PROFILES: LazyLock<Arc<RwLock<HashMap<String, Profile>>>> =
    LazyLock::new(|| Arc::new(RwLock::new(HashMap::new())));
    
static GAME_SELECTED: LazyLock<Arc<RwLock<GameInfo>>> =
    LazyLock::new(|| Arc::new(RwLock::new(SupportedGames::default().game("arena").unwrap().clone())));

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

const RESERVED_PACK_NAME: &str = "zzzzzzzzzzzzzzzzzzzzrun_you_fool_thron.pack";
const RESERVED_PACK_NAME_ALTERNATIVE: &str = "!!!!!!!!!!!!!!!!!!!!!run_you_fool_thron.pack";


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

#[tauri::command]
async fn handle_change_game_selected(app: tauri::AppHandle, game_id: String) -> Result<Vec<TreeCategory>, String> {
    let old_game = GAME_SELECTED.read().unwrap().clone();
    let old_game_id = old_game.key();
    change_game_selected(app, &game_id, old_game_id == game_id, false).await.map_err(|e| format!("Error loading data: {}", e))
}

async fn change_game_selected(app: tauri::AppHandle, game_id: &str, reload_same_game: bool, skip_network_update: bool) -> Result<Vec<TreeCategory>, String> {
    let old_game = GAME_SELECTED.read().unwrap().clone();
    let old_game_id = old_game.key();
    use futures_util::TryFutureExt;
    // If the game changed or we're initializing the program, change the game selected.
    //
    // This works because by default, the initially stored game selected is arena, and that one can never set manually.
    if reload_same_game || game_id != old_game_id {
        let result = load_data(&app, &game_id, skip_network_update);
        result.map_err(|e| format!("Error loading data: {}", e)).await
    } else {
        Ok(vec![])
    }
}

async fn load_data(app: &tauri::AppHandle, game_id: &str, skip_network_update: bool) -> anyhow::Result<Vec<TreeCategory>> {

    // We may receive invalid games here, so rule out the invalid ones.
    let supported_games = SupportedGames::default();
    match supported_games.game(game_id) {
        Some(game) => {

            // Schemas are optional, so don't interrupt loading due to they not being present.
            //let schema_path = schemas_path().unwrap().join(game.schema_file_name());
            //*SCHEMA.write().unwrap() = Schema::load(&schema_path, None).ok();
            *GAME_SELECTED.write().unwrap() = game.clone();

            // Trigger an update of all game configs, just in case one needs update.
            let _ = GameConfig::update(game.key());

            // Load the game's config and last known load order.
            let mut load_order = LoadOrder::load(app,game).unwrap_or_else(|_| Default::default());
            let mut game_config = GameConfig::load(app,game, true)?;

            let settings = SETTINGS.read().unwrap().clone();
            let game_path = settings.game_path(game)?;
            
            game_config.update_mod_list(app, &game, &game_path, &mut load_order, skip_network_update)?;
            
            *GAME_LOAD_ORDER.write().unwrap() = load_order;
            *GAME_CONFIG.lock().unwrap() = Some(game_config.clone());

            // Trigger an update of all game profiles, just in case one needs update.
            let _ = Profile::update(&game_config, game);

            // Load the profile's list.
            match Profile::profiles_for_game(app, game) {
                Ok(profiles) => *GAME_PROFILES.write().unwrap() = profiles,
                Err(error) => return Err(anyhow!("Error loading profiles: {}", error)),
            }
/*
            self.actions_ui().profile_model().clear();
            for profile in self.game_profiles().read().unwrap().keys().sorted() {
                self.actions_ui().profile_combobox().add_item_q_string(&QString::from_std_str(profile));
            }

            // Load the saves list for the selected game.
            let game_path_str = setting_string(game.key());
            let game_path = PathBuf::from(&game_path_str);
            if let Err(error) = self.load_saves_to_ui(game, &game_path) {
                show_dialog(self.main_window(), error, false);
            }
*/

            let mods = load_mods(&app, &game, &game_config).await?;
/*
            // Load the mods to the UI. This does an early return, just in case you add something after this.
            match self.load_mods_to_ui(game, &game_path, skip_network_update) {
                Ok(network_receiver) => {

                    // Load the launch options for the game selected, as some of them may depend on mods we just loaded.
                    let _ = setup_actions(self, game, self.game_config().read().unwrap().as_ref().unwrap(), &game_path, &self.game_load_order().read().unwrap());

                    return Ok(network_receiver)
                },
                Err(error) => show_dialog(self.main_window(), error, false),
            }
*/

            Ok(mods)
        },
        None => Err(anyhow!("Game {} is not a valid game.", game_id)),
    }
}


async fn load_mods(app: &tauri::AppHandle, game: &GameInfo, game_config: &GameConfig) -> anyhow::Result<Vec<TreeCategory>> {
    use rpfm_lib::utils::path_to_absolute_string;
    use std::time::UNIX_EPOCH;
    use crate::mod_manager::secondary_mods_path;
    
    let settings = SETTINGS.read().unwrap().clone();
    let game_path = settings.game_path(game)?;
    let game_last_update_date = last_game_update_date(game, &game_path)?;
    let game_data_path = game.data_path(&game_path)?;

    let data_path = path_to_absolute_string(&game_data_path);
    let secondary_path = path_to_absolute_string(&secondary_mods_path(app, game.key()).unwrap_or_default());
    let content_path = path_to_absolute_string(&game.content_path(&game_path).unwrap_or_default());
/*
    // Initialize these here so they can be re-use.
    let outdated_icon = icon_data("outdated.png").unwrap_or_else(|_| vec![]);
    let outdated = tre("mod_outdated_description", &[&BASE64_STANDARD.encode(outdated_icon)]);

    let data_older_than_secondary_icon = icon_data("data_older_than_secondary.png").unwrap_or_else(|_| vec![]);
    let data_older_than_secondary = tre("mod_data_older_than_secondary", &[&BASE64_STANDARD.encode(data_older_than_secondary_icon)]);

    let data_older_than_content_icon = icon_data("data_older_than_content.png").unwrap_or_else(|_| vec![]);
    let data_older_than_content = tre("mod_data_older_than_content", &[&BASE64_STANDARD.encode(data_older_than_content_icon)]);

    let secondary_older_than_content_icon = icon_data("secondary_older_than_content.png").unwrap_or_else(|_| vec![]);
    let secondary_older_than_content = tre("mod_secondary_older_than_content", &[&BASE64_STANDARD.encode(secondary_older_than_content_icon)]);
*/
    // This loads mods per category, meaning all installed mod have to be in the categories list!!!!
dbg!(&game_config);
    let mut categories: Vec<TreeCategory> = vec![];
    for category in game_config.categories_order() {
        let mut cat_item = TreeCategory::default();
        cat_item.id = category.to_string();

        if let Some(mods) = game_config.categories().get(category) {
            for mod_id in mods {
                if let Some(modd) = game_config.mods().get(mod_id) {

                    // Ignore registered mods with no path.
                    if !modd.paths().is_empty() {
                        let mut item = TreeItem::default();
                        item.id = mod_id.to_string();
                        item.name = if modd.name() != modd.id() {
                            if !modd.file_name().is_empty() {

                                // Map filenames are folder names which we have to turn into packs.
                                let pack_name = if let Some(alt_name) = modd.alt_name() {
                                    alt_name.to_string()
                                } else {
                                    modd.file_name().split('/').last().unwrap().to_owned()
                                };

                                format!("<b>{}</b> <i>({} - {})</i>", modd.name(), pack_name, modd.id())
                            } else {
                                format!("<b>{}</b> <i>({})</i>", modd.name(), modd.id())
                            }
                        } else {
                            format!("<i>{}</i>", modd.name())
                        };

                        item.creator = modd.creator_name().to_owned();
                        item.r#type = modd.pack_type().to_string();

                        // TODO: show discrepancies between steam's reported data and real data.
                        item.size = if *modd.file_size() != 0 {
                            format!("{:.2} MB", *modd.file_size() as f64 / 1024.0 / 1024.0)
                        } else {
                            let size = modd.paths()[0].metadata()?.len();
                            format!("{:.2} MB", size as f64 / 1024.0 / 1024.0)
                        };

                        item.created = if *modd.time_created() != 0 {
                            *modd.time_created() as u64
                        } else if cfg!(target_os = "windows") {
                            let date = modd.paths()[0].metadata()?.created()?.duration_since(UNIX_EPOCH)?;
                            date.as_secs() as u64
                        } else {
                            0
                        };

                        item.updated = *modd.time_updated() as u64;
/*
                        let mut flags_description = String::new();
                        if modd.outdated(game_last_update_date) {
                            item_flags.set_data_2a(&QVariant::from_bool(true), FLAG_MOD_IS_OUTDATED);
                            flags_description.push_str(&outdated);
                        }

                        if let Ok(flags) = modd.priority_dating_flags(&data_path, &secondary_path, &content_path) {
                            item_flags.set_data_2a(&QVariant::from_bool(flags.0), FLAG_MOD_DATA_IS_OLDER_THAN_SECONDARY);
                            item_flags.set_data_2a(&QVariant::from_bool(flags.1), FLAG_MOD_DATA_IS_OLDER_THAN_CONTENT);
                            item_flags.set_data_2a(&QVariant::from_bool(flags.2), FLAG_MOD_SECONDARY_IS_OLDER_THAN_CONTENT);

                            if flags.0 {
                                flags_description.push_str(&data_older_than_secondary);
                            }

                            if flags.1 {
                                flags_description.push_str(&data_older_than_content);
                            }

                            if flags.2 {
                                flags_description.push_str(&secondary_older_than_content);
                            }
                        }

                        if !flags_description.is_empty() {
                            flags_description = tr("mod_flags_description") + "<ul>" + &flags_description + "<ul/>";
                            item_flags.set_tool_tip(&QString::from_std_str(&flags_description));
                        }
*/
                        let (l_data, l_secondary, l_content) = modd.location(&data_path, &secondary_path, &content_path);
                        let mut locations = vec![];

                        if l_data {
                            locations.push("Data".to_owned());
                        }
                        if l_secondary {
                            locations.push("Secondary".to_owned());
                        }
                        if let Some(id) = l_content {
                            locations.push(format!("Content ({})", id));
                        }

                        item.location = locations.join(",");

                        /*
                        if modd.can_be_toggled(game, &game_data_path) {
                            item_mod_name.set_checkable(true);

                            if modd.enabled(game, &game_data_path) {
                                item_mod_name.set_check_state(CheckState::Checked);
                            }
                        }

                        // This is for movie mods in /data.
                        else {
                            item_mod_name.set_checkable(true);
                            item_mod_name.set_check_state(CheckState::Checked);

                            let mut flags = item_mod_name.flags().to_int();
                            flags &= !ItemFlag::ItemIsUserCheckable.to_int();
                            item_mod_name.set_flags(QFlags::from(flags));
                        }*/

                        cat_item.children.push(item);
                    }
                }
            }
        }
        categories.push(cat_item);
    }

    Ok(categories)
}

#[derive(serde::Serialize)]
struct SidebarIcon {
    id: String,
    name: String,
    icon: String,
}

#[derive(serde::Serialize, Default)]
struct TreeCategory {
    id: String,
    name: String,
    size: String,
    status: String,
    last_played: String,
    children: Vec<TreeItem>,
}

#[derive(serde::Serialize, Default)]
struct TreeItem {
    id: String,
    name: String,
    flags: String,
    location: String,
    creator: String,
    r#type: String,
    size: String,
    created: u64,
    updated: u64,
    is_checked: bool,
}

#[derive(serde::Serialize, Default)]
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
            handle_checkbox_change,
            handle_item_drop,
            init_settings,
            load_settings,
            save_settings,
            get_list_items,
            on_window_ready,
            get_available_languages,
            get_available_date_formats,
            browse_folder,
            handle_change_game_selected
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
