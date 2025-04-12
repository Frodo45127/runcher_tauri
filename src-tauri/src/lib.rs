use anyhow::anyhow;
use base64::prelude::BASE64_STANDARD;
use regex::Regex;
use rpfm_lib::schema::Schema;
use rpfm_lib::{
    binary::WriteBytes,
    games::{
        GameInfo,
        supported_games::{KEY_ARENA, KEY_EMPIRE, SupportedGames},
    },
};
use serde::{Deserialize, Serialize};
use settings::*;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, LazyLock, Mutex, RwLock};
use std::{cell::LazyCell, fs::DirBuilder};
use tauri::{Emitter, Listener, Manager};

use crate::mod_manager::game_config::GameConfig;
use crate::mod_manager::load_order::{LoadOrder, LoadOrderDirectionMove};
use crate::mod_manager::profiles::Profile;

mod mod_manager;
mod settings;
mod updater;

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

static GAME_SELECTED: LazyLock<Arc<RwLock<GameInfo>>> = LazyLock::new(|| {
    Arc::new(RwLock::new(
        SupportedGames::default().game("arena").unwrap().clone(),
    ))
});

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

const VANILLA_MOD_LIST_FILE_NAME: &str = "used_mods.txt";
const CUSTOM_MOD_LIST_FILE_NAME: &str = "mod_list.txt";
const USER_SCRIPT_FILE_NAME: &str = "user.script.txt";
const USER_SCRIPT_EMPIRE_FILE_NAME: &str = "user.empire_script.txt";

/// Progress payload for the progress event. Basically, it's for providing a way to update the progress bar from the Rust side.
/// The id is:
/// - 0: Generic 0-100 loading process.
#[derive(Serialize, Clone)]
struct ProgressPayload {
    id: i32,
    progress: i32,
    total: i32,
}

#[tauri::command]
fn launch_game(app: tauri::AppHandle, id: &str) -> Result<String, String> {
    use base64::Engine;

    let mut folder_list = String::new();
    let mut pack_list = String::new();

    let game = GAME_SELECTED.read().unwrap().clone();
    let game_path = SETTINGS
        .read()
        .unwrap()
        .game_path(&game)
        .map_err(|e| format!("Error getting the game's path: {}", e))?;
    let data_path = game
        .data_path(&game_path)
        .map_err(|e| format!("Error getting the game's data path: {}", e))?;
    let game_config = GAME_CONFIG.lock().unwrap().clone().unwrap();
    let load_order = GAME_LOAD_ORDER.read().unwrap().clone();

    load_order.build_load_order_string(
        &app,
        &game_config,
        &game,
        &data_path,
        &mut pack_list,
        &mut folder_list,
    );

    // Check if we are loading a save. First option is no save load. Any index above that is a save.
    let mut extra_args: Vec<String> = vec![];
    /*let save_index = self.actions_ui.save_combobox().current_index();
    if self.actions_ui.save_combobox().current_index() > 0 {
        if let Some(save) = self.game_saves.read().unwrap().get(save_index as usize - 1) {
            extra_args.push("game_startup_mode".to_owned());
            extra_args.push("campaign_load".to_owned());
            extra_args.push(save.name().to_owned());
        }
    }*/

    // NOTE: On Empire and Napoleon we need to use the user_script, not the custom file, as it doesn't seem to work.
    // Older versions of shogun 2 also used the user_script, but the latest update enabled use of custom mod lists.
    let file_path = if *game.raw_db_version() >= 1 {
        game_path.join(CUSTOM_MOD_LIST_FILE_NAME)
    } else {
        // Games may fail to launch if we don't have this path created, which is done the first time we start the game.
        let config_path = game
            .config_path(&game_path)
            .ok_or(format!("Error getting the game's config path."))?;
        let scripts_path = config_path.join("scripts");
        DirBuilder::new()
            .recursive(true)
            .create(&scripts_path)
            .map_err(|e| format!("Error creating the scripts path: {}", e))?;

        // Empire has its own user script.
        if game.key() == KEY_EMPIRE {
            scripts_path.join(USER_SCRIPT_EMPIRE_FILE_NAME)
        } else {
            scripts_path.join(USER_SCRIPT_FILE_NAME)
        }
    };

    // Setup the launch options stuff. This may add a line to the folder list, so we need to resave the load order file after this.
    let folder_list_pre = folder_list.to_owned();
    save_load_order_file(&file_path, &game, &folder_list, &pack_list)
        .map_err(|e| format!("Error saving the load order file: {}", e))?;
    prepare_launch_options(&game, &data_path, &mut folder_list)
        .map_err(|e| format!("Error preparing launch options: {}", e))?;

    if folder_list != folder_list_pre {
        save_load_order_file(&file_path, &game, &folder_list, &pack_list)
            .map_err(|e| format!("Error saving the load order file: {}", e))?;
    }

    // Launch is done through workshopper to getup the Steam Api.
    //
    // Here we just build the commands and pass them to workshopper.
    match game.executable_path(&game_path) {
        Some(exec_game) => {
            if cfg!(target_os = "windows") {
                let mut command = format!(
                    "cmd /C start /W /d \"{}\" \"{}\" \"{}\";",
                    game_path.to_string_lossy().replace('\\', "/"),
                    exec_game.file_name().unwrap().to_string_lossy(),
                    // Custom load order file is only supported by Shogun 2 and later games.
                    if *game.raw_db_version() >= 1 {
                        CUSTOM_MOD_LIST_FILE_NAME.to_owned()
                    } else {
                        file_path.to_string_lossy().replace('\\', "/")
                    }
                );

                // Only Shogun 2 and later games support extra arguments.
                if *game.raw_db_version() >= 1 {
                    for arg in &extra_args {
                        command.push(' ');
                        command.push_str(arg);
                    }
                }

                let command = BASE64_STANDARD.encode(command);
                crate::mod_manager::integrations::launch_game(&app, &game, &command, false)
                    .map_err(|e| format!("Error launching the game: {}", e))?;
                Ok(format!("Game {} launched successfully!", id))
            } else if cfg!(target_os = "linux") {
                Err(format!("Unsupported OS."))
            } else {
                Err(format!("Unsupported OS."))
            }
        }
        None => Err(format!(
            "Executable path not found. Is the game folder configured correctly in the settings?"
        )),
    }
}

fn save_load_order_file(
    file_path: &Path,
    game: &GameInfo,
    folder_list: &str,
    pack_list: &str,
) -> anyhow::Result<()> {
    use std::fs::File;
    use std::io::BufWriter;
    use std::io::Write;

    let mut file = BufWriter::new(File::create(file_path)?);

    // Napoleon, Empire and Shogun 2 require the user.script.txt or mod list file (for Shogun's latest update) to be in UTF-16 LE. What the actual fuck.
    if *game.raw_db_version() < 2 {
        file.write_string_u16(folder_list)?;
        file.write_string_u16(pack_list)?;
    } else {
        file.write_all(folder_list.as_bytes())?;
        file.write_all(pack_list.as_bytes())?;
    }

    file.flush().map_err(From::from)
}

fn prepare_launch_options(
    game: &GameInfo,
    data_path: &Path,
    folder_list: &mut String,
) -> anyhow::Result<()> {
    /*
    let actions_ui = app_ui.actions_ui();

    // We only use the reserved pack if we need to.
    if (actions_ui.enable_logging_checkbox().is_enabled() && actions_ui.enable_logging_checkbox().is_checked()) ||
        (actions_ui.enable_skip_intro_checkbox().is_enabled() && actions_ui.enable_skip_intro_checkbox().is_checked()) ||
        (actions_ui.remove_trait_limit_checkbox().is_enabled() && actions_ui.remove_trait_limit_checkbox().is_checked()) ||
        (actions_ui.remove_siege_attacker_checkbox().is_enabled() && actions_ui.remove_siege_attacker_checkbox().is_checked()) ||
        (actions_ui.enable_translations_combobox().is_enabled() && actions_ui.enable_translations_combobox().current_index() != 0) ||
        (actions_ui.universal_rebalancer_combobox().is_enabled() && actions_ui.universal_rebalancer_combobox().current_index() != 0) ||
        (actions_ui.enable_dev_only_ui_checkbox().is_enabled() && actions_ui.enable_dev_only_ui_checkbox().is_checked()) ||
        (actions_ui.unit_multiplier_spinbox().is_enabled() && actions_ui.unit_multiplier_spinbox().value() != 1.00) ||
        actions_ui.scripts_to_execute().read().unwrap().iter().any(|(_, item)| item.is_checked()) {

        // We need to use an alternative name for Shogun 2, Rome 2, Attila and Thrones because their load order logic for movie packs seems... either different or broken.
        let reserved_pack_name = if game.key() == KEY_SHOGUN_2 || game.key() == KEY_ROME_2 || game.key() == KEY_ATTILA || game.key() == KEY_THRONES_OF_BRITANNIA {
            RESERVED_PACK_NAME_ALTERNATIVE
        } else {
            RESERVED_PACK_NAME
        };

        // If the reserved pack is loaded from a custom folder we need to CLEAR SAID FOLDER before anything else. Otherwise we may end up with old packs messing up stuff.
        if *game.raw_db_version() >= 1 {
            let temp_packs_folder = temp_packs_folder(game)?;
            let files = files_from_subdir(&temp_packs_folder, false)?;
            for file in &files {
                std::fs::remove_file(file)?;
            }
        }

        // Support for add_working_directory seems to be only present in rome 2 and newer games. For older games, we drop the pack into /data.
        let temp_path = if *game.raw_db_version() >= 1 {
            let temp_packs_folder = temp_packs_folder(game)?;
            let temp_path = temp_packs_folder.join(reserved_pack_name);
            folder_list.push_str(&format!("add_working_directory \"{}\";\n", temp_packs_folder.to_string_lossy()));
            temp_path
        } else {
            data_path.join(reserved_pack_name)
        };

        // Prepare the command to generate the temp pack.
        let mut cmd = Command::new("cmd");
        cmd.arg("/C");
        cmd.arg(&*PATCHER_PATH);
        cmd.arg("-g");
        cmd.arg(game.key());
        cmd.arg("-l");
        cmd.arg(CUSTOM_MOD_LIST_FILE_NAME);
        cmd.arg("-p");
        cmd.arg(temp_path.to_string_lossy().to_string());   // Use a custom path out of /data, if available.
        cmd.arg("-s");                                      // Skip updates. Updates will be shipped with Runcher updates.

        // Logging check.
        if actions_ui.enable_logging_checkbox().is_enabled() && actions_ui.enable_logging_checkbox().is_checked() {
            cmd.arg("-e");
        }

        // Skip Intros check.
        if actions_ui.enable_skip_intro_checkbox().is_enabled() && actions_ui.enable_skip_intro_checkbox().is_checked() {
            cmd.arg("-i");
        }

        // Remove Trait Limit check.
        if actions_ui.remove_trait_limit_checkbox().is_enabled() && actions_ui.remove_trait_limit_checkbox().is_checked() {
            cmd.arg("-r");
        }

        // Remove Siege Attacker check.
        if actions_ui.remove_siege_attacker_checkbox().is_enabled() && actions_ui.remove_siege_attacker_checkbox().is_checked() {
            cmd.arg("-a");
        }

        // Enable Dev-only UI check.
        if actions_ui.enable_dev_only_ui_checkbox().is_enabled() && actions_ui.enable_dev_only_ui_checkbox().is_checked() {
            cmd.arg("-d");
        }

        // Translations check.
        if actions_ui.enable_translations_combobox().is_enabled() && actions_ui.enable_translations_combobox().current_index() != 0 {
            cmd.arg("-t");
            cmd.arg(app_ui.actions_ui().enable_translations_combobox().current_text().to_std_string());
        }

        // Universal Rebalancer check.
        if actions_ui.universal_rebalancer_combobox().is_enabled() && actions_ui.universal_rebalancer_combobox().current_index() != 0 {
            cmd.arg("-u");
            cmd.arg(app_ui.actions_ui().universal_rebalancer_combobox().current_text().to_std_string());
        }

        // Unit Multiplier check.
        if actions_ui.unit_multiplier_spinbox().is_enabled() && actions_ui.unit_multiplier_spinbox().value() != 1.00 {
            cmd.arg("-m");
            cmd.arg(app_ui.actions_ui().unit_multiplier_spinbox().value().to_string());
        }

        // Script checks.
        let sql_folder_extracted = sql_scripts_extracted_extended_path()?;
        let sql_folder_local = sql_scripts_local_path()?.join(game.key());
        let sql_folder_remote = sql_scripts_remote_path()?.join(game.key());
        actions_ui.scripts_to_execute().read().unwrap()
            .iter()
            .filter(|(_, item)| item.is_checked())
            .for_each(|(script, item)| {
                cmd.arg("--sql-script");

                let script_params = if script.metadata().parameters().is_empty() {
                    vec![]
                } else {
                    let mut script_params = vec![];
                    let script_container = item.parent_widget().parent_widget();

                    // First check if we have a preset set. If not, we can check each param.
                    let preset_combo_name = format!("{}_preset_combo", script.metadata().key());
                    let preset_key = if let Ok(widget) = script_container.find_child::<QComboBox>(&preset_combo_name) {
                        widget.current_text().to_std_string()
                    } else {
                        String::new()
                    };

                    let preset = if !preset_key.is_empty() {
                        let preset_path = sql_scripts_extracted_path().unwrap().join("twpatcher/presets");
                        if preset_path.is_dir() {
                            files_from_subdir(&preset_path, false).unwrap()
                                .iter()
                                .filter_map(|x| Preset::read(x).ok())
                                .find(|x| *x.key() == preset_key)
                        } else {
                            None
                        }
                    } else {
                        None
                    };

                    match preset {
                        Some(preset) => {
                            for param in script.metadata().parameters() {
                                match preset.params().get(param.key()) {
                                    Some(value) => script_params.push(value.to_string()),
                                    None => script_params.push(param.default_value().to_string()),
                                }
                            }
                        }
                        None => {
                            for param in script.metadata().parameters() {
                                let object_name = format!("{}_{}", script.metadata().key(), param.key());
                                match param.r#type() {
                                    ParamType::Bool => {
                                        if let Ok(widget) = script_container.find_child::<QCheckBox>(&object_name) {
                                            script_params.push(widget.is_checked().to_string());
                                        }
                                    },
                                    ParamType::Integer => {
                                        if let Ok(widget) = script_container.find_child::<QSpinBox>(&object_name) {
                                            script_params.push(widget.value().to_string());
                                        }
                                    },
                                    ParamType::Float => {
                                        if let Ok(widget) = script_container.find_child::<QDoubleSpinBox>(&object_name) {
                                            script_params.push(widget.value().to_string());
                                        }
                                    },
                                }
                            }
                        }
                    }


                    script_params
                };

                // When there's a collision, default to the local script path.
                let script_name = format!("{}.yml", script.metadata().key());
                let local_script_path = sql_folder_local.join(&script_name);
                let extracted_script_path = sql_folder_extracted.join(&script_name);
                let remote_script_path = sql_folder_remote.join(&script_name);
                let script_path = if PathBuf::from(&local_script_path).is_file() {
                    local_script_path
                } else if PathBuf::from(&extracted_script_path).is_file() {
                    extracted_script_path
                } else {
                    remote_script_path
                };

                if script_params.is_empty() {
                    cmd.arg(script_path);
                } else {
                    cmd.arg(format!("{};{}", script_path.to_string_lossy().to_string().replace("\\", "/"), script_params.join(";")));
                }
            });

        cmd.creation_flags(DETACHED_PROCESS);

        let mut h = cmd.spawn().map_err(|err| anyhow!("Error when preparing the game patch: {}", err))?;
        if let Ok(status) = h.wait() {
            if !status.success() {
                return Err(anyhow!("Something failed while creating the load order patch. Check the patcher terminal to see what happened."))
            }
        }
    }*/

    Ok(())
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
async fn handle_mod_toggled(
    app: tauri::AppHandle,
    mod_id: &str,
    is_checked: bool,
) -> Result<Vec<ListItem>, String> {
    let mod_id = unescape(mod_id);

    println!("Mod {} checkbox changed to: {}", mod_id, is_checked);

    let game_info = GAME_SELECTED.read().unwrap().clone();
    let game_path = SETTINGS.read().unwrap().game_path(&game_info).unwrap();
    let mut game_config = GAME_CONFIG.lock().unwrap().clone().unwrap();
    let mut load_order = GAME_LOAD_ORDER.read().unwrap().clone();

    game_config
        .mods_mut()
        .get_mut(&mod_id)
        .unwrap()
        .set_enabled(is_checked);

    let _ = game_config
        .update_mod_list(&app, &game_info, &game_path, &mut load_order, false)
        .map_err(|e| format!("Error loading data: {}", e))?;
    let items = load_packs(&app, &game_config, &game_info, &game_path, &load_order)
        .await
        .map_err(|e| format!("Error loading data: {}", e))?;

    game_config
        .save(&app, &game_info)
        .map_err(|e| format!("Error saving data: {}", e))?;

    *GAME_LOAD_ORDER.write().unwrap() = load_order;
    *GAME_CONFIG.lock().unwrap() = Some(game_config);

    Ok(items)
}

#[tauri::command]
fn handle_mod_category_change(
    app: tauri::AppHandle,
    mut mod_ids: Vec<String>,
    category_id: &str,
) -> Result<(), String> {
    let mod_ids = mod_ids
        .iter_mut()
        .map(|id| unescape(id))
        .collect::<Vec<String>>();

    let category_id = unescape(category_id);

    let game_info = GAME_SELECTED.read().unwrap().clone();
    let mut game_config = GAME_CONFIG.lock().unwrap().clone().unwrap();

    // Only proceed if the category is valid.
    if !game_config.categories().contains_key(&category_id) {
        return Err(format!("Category {} not found", &category_id));
    }

    for mods in game_config.categories_mut().values_mut() {
        mods.retain(|x| !mod_ids.contains(x));
    }

    if let Some(target_mods) = game_config.categories_mut().get_mut(&category_id) {
        target_mods.extend(mod_ids);
    }

    game_config
        .save(&app, &game_info)
        .map_err(|e| format!("Error saving data: {}", e))?;
    *GAME_CONFIG.lock().unwrap() = Some(game_config);

    Ok(())
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
fn load_settings() -> Result<AppSettings, String> {
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
async fn browse_folder(
    app: tauri::AppHandle,
    title: String,
    current_path: String,
) -> Option<String> {
    use std::path::PathBuf;
    use tauri_plugin_dialog::DialogExt;

    // Si se proporcionó una ruta válida, iniciar el diálogo en esa carpeta
    let start_dir = PathBuf::from(&current_path);

    // Mostrar el diálogo y obtener la carpeta seleccionada
    let dialog = app
        .dialog()
        .file()
        .set_directory(start_dir)
        .set_title(title);

    dialog
        .blocking_pick_folder()
        .map(|path| path.as_path().unwrap().to_string_lossy().to_string())
}

#[tauri::command]
async fn open_mod_folder(id: String) -> Result<(), String> {
    let mod_id = unescape(&id);

    let game_config = GAME_CONFIG.lock().unwrap().clone().unwrap();
    let mod_info = game_config.mods().get(&mod_id).unwrap();
    match mod_info.paths().first().cloned() {
        Some(mut path) => {
            path.pop();
            let _ = open::that(path);
            Ok(())
        }
        None => Err("No path found".to_string()),
    }
}

#[tauri::command]
async fn open_mod_url(id: String) -> Result<(), String> {
    let mod_id = unescape(&id);
    if mod_id.is_empty() {
        return Err("No mod ID found".to_string());
    }

    let game_config = GAME_CONFIG.lock().unwrap().clone().unwrap();
    let mod_info = game_config.mods().get(&mod_id).unwrap();
    let remote_id = mod_info.steam_id().clone().unwrap_or_default();

    // TODO: Rewrite this so it's not steam-exclusive.
    if !remote_id.is_empty() {
        let _ = open::that(
            "https://steamcommunity.com/sharedfiles/filedetails/?id=".to_string() + &remote_id,
        );
    } else {
        return Err("No remote ID found".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn handle_change_game_selected(
    app: tauri::AppHandle,
    game_id: String,
) -> Result<(Vec<TreeCategory>, Vec<ListItem>), String> {
    let old_game = GAME_SELECTED.read().unwrap().clone();
    let old_game_id = old_game.key();
    change_game_selected(app, &game_id, old_game_id == game_id, false)
        .await
        .map_err(|e| format!("Error loading data: {}", e))
}

async fn change_game_selected(
    app: tauri::AppHandle,
    game_id: &str,
    reload_same_game: bool,
    skip_network_update: bool,
) -> Result<(Vec<TreeCategory>, Vec<ListItem>), String> {
    let old_game = GAME_SELECTED.read().unwrap().clone();
    let old_game_id = old_game.key();
    use futures_util::TryFutureExt;
    // If the game changed or we're initializing the program, change the game selected.
    //
    // This works because by default, the initially stored game selected is arena, and that one can never set manually.
    if reload_same_game || game_id != old_game_id {
        let result = load_data(&app, &game_id, skip_network_update);
        result
            .map_err(|e| format!("Error loading data: {}", e))
            .await
    } else {
        Ok((vec![], vec![]))
    }
}

async fn load_data(
    app: &tauri::AppHandle,
    game_id: &str,
    skip_network_update: bool,
) -> anyhow::Result<(Vec<TreeCategory>, Vec<ListItem>)> {
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
            let mut load_order = LoadOrder::load(app, game).unwrap_or_else(|_| Default::default());
            let mut game_config = GameConfig::load(app, game, true)?;

            let settings = SETTINGS.read().unwrap().clone();
            let game_path = settings.game_path(game)?;

            game_config.update_mod_list(
                app,
                &game,
                &game_path,
                &mut load_order,
                skip_network_update,
            )?;

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

            send_progress_event(&app, 10, 100);

            let mut load_order = GAME_LOAD_ORDER.read().unwrap().clone();

            let _ = game_config.update_mod_list(&app, &game, &game_path, &mut load_order, false)?;

            let mods = load_mods(&app, &game, &game_config).await?;

            send_progress_event(&app, 50, 100);

            let items = load_packs(&app, &game_config, &game, &game_path, &load_order).await?;

            send_progress_event(&app, 90, 100);

            *GAME_LOAD_ORDER.write().unwrap() = load_order;
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

            send_progress_event(&app, 100, 100);

            Ok((mods, items))
        }
        None => Err(anyhow!("Game {} is not a valid game.", game_id)),
    }
}

async fn load_mods(
    app: &tauri::AppHandle,
    game: &GameInfo,
    game_config: &GameConfig,
) -> anyhow::Result<Vec<TreeCategory>> {
    use crate::mod_manager::secondary_mods_path;
    use rpfm_lib::utils::path_to_absolute_string;
    use std::time::UNIX_EPOCH;

    let settings = SETTINGS.read().unwrap().clone();
    let game_path = settings.game_path(game)?;
    let game_last_update_date = last_game_update_date(game, &game_path)?;
    let game_data_path = game.data_path(&game_path)?;

    let data_path = path_to_absolute_string(&game_data_path);
    let secondary_path =
        path_to_absolute_string(&secondary_mods_path(app, game.key()).unwrap_or_default());
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
    let mut categories: Vec<TreeCategory> = vec![];
    for category in game_config.categories_order() {
        let mut cat_item = TreeCategory::default();
        cat_item.id = "cat:".to_owned() + category;
        cat_item.name = category.to_string();

        if let Some(mods) = game_config.categories().get(category) {
            for mod_id in mods {
                if let Some(modd) = game_config.mods().get(mod_id) {
                    // Ignore registered mods with no path.
                    if !modd.paths().is_empty() {
                        let mut item = TreeItem::default();
                        item.id = "mod:".to_owned() + mod_id;
                        item.name = if modd.name() != modd.id() {
                            if !modd.file_name().is_empty() {
                                // Map filenames are folder names which we have to turn into packs.
                                let pack_name = if let Some(alt_name) = modd.alt_name() {
                                    alt_name.to_string()
                                } else {
                                    modd.file_name().split('/').last().unwrap().to_owned()
                                };

                                format!(
                                    "<b>{}</b> <i>({} - {})</i>",
                                    modd.name(),
                                    pack_name,
                                    modd.id()
                                )
                            } else {
                                format!("<b>{}</b> <i>({})</i>", modd.name(), modd.id())
                            }
                        } else {
                            format!("<i>{}</i>", modd.name())
                        };

                        item.creator = modd.creator_name().to_owned();
                        item.r#type = modd.pack_type().to_string();
                        item.description = modd.description().to_owned();

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
                            let date = modd.paths()[0]
                                .metadata()?
                                .created()?
                                .duration_since(UNIX_EPOCH)?;
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
                        let (l_data, l_secondary, l_content) =
                            modd.location(&data_path, &secondary_path, &content_path);
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

                        item.is_checked = modd.enabled(game, &game_data_path);

                        cat_item.children.push(item);
                    }
                }
            }
        }
        categories.push(cat_item);
    }

    Ok(categories)
}

async fn load_packs(
    app: &tauri::AppHandle,
    game_config: &GameConfig,
    game_info: &GameInfo,
    game_path: &Path,
    load_order: &LoadOrder,
) -> anyhow::Result<Vec<ListItem>> {
    use crate::mod_manager::secondary_mods_path;
    use rpfm_lib::files::pack::Pack;

    let mut items = vec![];

    let secondary_mods_path = secondary_mods_path(app, game_config.game_key()).unwrap_or_default();
    if !game_path.to_string_lossy().is_empty() {
        if let Ok(game_data_folder) = game_info.data_path(game_path) {
            let game_data_folder = std::fs::canonicalize(game_data_folder.clone())
                .unwrap_or_else(|_| game_data_folder.clone());

            // Chain so movie packs are always last.
            let mods = load_order.mods().iter().chain(load_order.movies().iter());
            for (index, mod_id) in mods.enumerate() {
                if let Some(modd) = game_config.mods().get(mod_id) {
                    let pack_name = modd.paths()[0]
                        .file_name()
                        .unwrap()
                        .to_string_lossy()
                        .as_ref()
                        .to_owned();

                    // This is needed to avoid errors with map packs before we process them.
                    //
                    // In practice if a bin pack loads here, there's a bug elsewhere.
                    if pack_name.ends_with(".pack") {
                        let pack = Pack::read_and_merge(
                            &[modd.paths()[0].to_path_buf()],
                            true,
                            false,
                            false,
                            false,
                        )?;

                        let mut item = ListItem::default();
                        item.id = mod_id.to_string();
                        item.pack = pack_name;
                        item.r#type = modd.pack_type().to_string();
                        item.order = index as i32;
                        item.location = if modd.paths()[0].starts_with(&game_data_folder) {
                            "Data".to_string()
                        } else if secondary_mods_path.is_dir()
                            && modd.paths()[0].starts_with(&secondary_mods_path)
                        {
                            if let Some(ref id) = modd.steam_id() {
                                format!("Secondary ({})", id)
                            } else {
                                "Secondary (Non-Steam)".to_string()
                            }
                        } else if let Some(ref id) = modd.steam_id() {
                            format!("Content ({})", id)
                        } else {
                            "Where the fuck is this pack?".to_string()
                        };

                        item.steam_id = modd.steam_id().clone().unwrap_or_default();
                        items.push(item);
                    } else {
                        // TODO: fix this case in shogun 2.
                        //error!("Error loading Pack to UI: {}", modd.paths()[0].to_string_lossy())
                    }
                }
            }
        }
    }

    Ok(items)
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
    description: String,
    is_checked: bool,
}

#[derive(serde::Serialize, Default)]
struct ListItem {
    id: String,
    pack: String,
    r#type: String,
    order: i32,
    location: String,
    steam_id: String,
}

#[tauri::command]
async fn move_pack_in_load_order_in_direction(
    app: tauri::AppHandle,
    mod_id: &str,
    direction: LoadOrderDirectionMove,
) -> Result<Vec<ListItem>, String> {
    let game_info = GAME_SELECTED.read().unwrap().clone();
    let game_path = SETTINGS.read().unwrap().game_path(&game_info).unwrap();
    let game_config = GAME_CONFIG.lock().unwrap().clone().unwrap();
    let mut load_order = GAME_LOAD_ORDER.read().unwrap().clone();
    let mod_id = unescape(mod_id);

    load_order.move_mod_in_direction(&mod_id, direction);
    let items = load_packs(&app, &game_config, &game_info, &game_path, &load_order)
        .await
        .map_err(|e| format!("Error loading data: {}", e))?;

    *GAME_LOAD_ORDER.write().unwrap() = load_order;

    Ok(items)
}

#[tauri::command]
async fn move_pack_in_load_order(
    app: tauri::AppHandle,
    source_id: &str,
    target_id: &str,
) -> Result<Vec<ListItem>, String> {
    let game_info = GAME_SELECTED.read().unwrap().clone();
    let game_path = SETTINGS.read().unwrap().game_path(&game_info).unwrap();
    let game_config = GAME_CONFIG.lock().unwrap().clone().unwrap();
    let mut load_order = GAME_LOAD_ORDER.read().unwrap().clone();
    let source_id = unescape(source_id);
    let target_id = unescape(target_id);

    load_order.move_mod_above_another(&source_id, &target_id);
    let items = load_packs(&app, &game_config, &game_info, &game_path, &load_order)
        .await
        .map_err(|e| format!("Error loading data: {}", e))?;

    *GAME_LOAD_ORDER.write().unwrap() = load_order;

    Ok(items)
}

#[tauri::command]
async fn reorder_categories(
    app: tauri::AppHandle,
    source_id: &str,
    target_id: &str,
) -> Result<Vec<String>, String> {
    // TODO: Move this to a sanitizer function.
    let source_id = unescape(source_id);
    let target_id = unescape(target_id);

    let game_info = GAME_SELECTED.read().unwrap().clone();
    let mut game_config = GAME_CONFIG.lock().unwrap().clone().unwrap();

    let mut categories_order = game_config.categories_order().to_vec();
    let source_index = categories_order
        .iter()
        .position(|id| id == &source_id)
        .ok_or_else(|| format!("Source category '{}' not found", source_id))?;
    let target_index = categories_order
        .iter()
        .position(|id| id == &target_id)
        .ok_or_else(|| format!("Target category '{}' not found", target_id))?;

    // Do nothing if they are the same category or already in the desired order.
    if source_index == target_index {
        return Ok(categories_order);
    }

    let source_category = categories_order.remove(source_index);
    let new_target_index = if source_index < target_index {
        target_index - 1
    } else {
        target_index
    };

    categories_order.insert(new_target_index, source_category);
    game_config.set_categories_order(categories_order.to_vec());
    game_config
        .save(&app, &game_info)
        .map_err(|e| format!("Error al guardar la configuración: {}", e))?;

    *GAME_CONFIG.lock().unwrap() = Some(game_config);

    Ok(categories_order)
}

#[tauri::command]
async fn create_category(app: tauri::AppHandle, category: &str) -> Result<Vec<String>, String> {
    let game_info = GAME_SELECTED.read().unwrap().clone();
    let mut game_config = GAME_CONFIG.lock().unwrap().clone().unwrap();

    // Create the category
    game_config
        .create_category(category)
        .map_err(|e| format!("Error creating category: {}", e))?;

    // Save the changes
    game_config
        .save(&app, &game_info)
        .map_err(|e| format!("Error saving configuration: {}", e))?;

    let new_order = game_config.categories_order().to_vec();

    // Update the game config in memory
    *GAME_CONFIG.lock().unwrap() = Some(game_config);

    Ok(new_order)
}

#[tauri::command]
async fn rename_category(
    app: tauri::AppHandle,
    category: &str,
    new_name: &str,
) -> Result<(), String> {
    let game_info = GAME_SELECTED.read().unwrap().clone();
    let mut game_config = GAME_CONFIG.lock().unwrap().clone().unwrap();

    // Create the category
    game_config
        .rename_category(category, new_name)
        .map_err(|e| format!("Error renaming category: {}", e))?;

    // Save the changes
    game_config
        .save(&app, &game_info)
        .map_err(|e| format!("Error saving configuration: {}", e))?;

    // Update the game config in memory
    *GAME_CONFIG.lock().unwrap() = Some(game_config);

    Ok(())
}

#[tauri::command]
async fn remove_category(app: tauri::AppHandle, category: &str) -> Result<(), String> {
    let game_info = GAME_SELECTED.read().unwrap().clone();
    let mut game_config = GAME_CONFIG.lock().unwrap().clone().unwrap();

    // Create the category
    game_config
        .delete_category(category)
        .map_err(|e| format!("Error deleting category: {}", e))?;

    // Save the changes
    game_config
        .save(&app, &game_info)
        .map_err(|e| format!("Error saving configuration: {}", e))?;

    // Update the game config in memory
    *GAME_CONFIG.lock().unwrap() = Some(game_config);

    Ok(())
}

/// Util to send progress events to the webview.
fn send_progress_event(app: &tauri::AppHandle, progress: i32, total: i32) {
    let _ = app
        .get_webview_window("main")
        .unwrap()
        .emit("loading://progress", ProgressPayload {
            id: 0,
            progress,
            total,
        });
}

/// Util function to de-escape ui-coming ids so they can be used in the backend.
///
/// This is needed because UI-coming IDs have some rules that the backend doesn't, like:
/// - Can't start with numbers.
/// - Can't contain a lot of common characters.
fn unescape(id: &str) -> String {
    id.replace("\\", "").replace("mod:", "").replace("cat:", "")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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

            // State for the updater.
            app.manage(updater::PendingUpdate(Mutex::new(None)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            launch_game,
            get_sidebar_icons,
            handle_mod_toggled,
            handle_mod_category_change,
            init_settings,
            load_settings,
            save_settings,
            on_window_ready,
            get_available_languages,
            get_available_date_formats,
            browse_folder,
            handle_change_game_selected,
            move_pack_in_load_order_in_direction,
            move_pack_in_load_order,
            reorder_categories,
            open_mod_folder,
            open_mod_url,
            create_category,
            rename_category,
            remove_category,
            #[cfg(desktop)] updater::fetch_update,
            #[cfg(desktop)] updater::install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
