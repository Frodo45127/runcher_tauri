//---------------------------------------------------------------------------//
// Copyright (c) 2017-2024 Ismael Gutiérrez González. All rights reserved.
//
// This file is part of the Rusted Launcher (Runcher) project,
// which can be found here: https://github.com/Frodo45127/runcher.
//
// This file is licensed under the MIT license, which can be found here:
// https://github.com/Frodo45127/runcher/blob/master/LICENSE.
//---------------------------------------------------------------------------//

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use std::collections::HashMap;
use std::fs::{DirBuilder, File};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use rpfm_lib::games::{GameInfo, supported_games::{KEY_ARENA, SupportedGames}};

const SQL_SCRIPTS_EXTRACTED_FOLDER: &str = "sql_scripts_extracted";
const SQL_SCRIPTS_LOCAL_FOLDER: &str = "sql_scripts_local";
const SQL_SCRIPTS_REMOTE_FOLDER: &str = "sql_scripts_remote";
const TEMP_PACKS_FOLDER: &str = "temp_packs";
const SCHEMAS_FOLDER: &str = "schemas";
const PROFILES_FOLDER: &str = "profiles";
const GAME_CONFIG_FOLDER: &str = "game_config";
const ERROR_FOLDER: &str = "error";
const SETTINGS_FILE: &str = "settings.json";
const PROFILES_FILE: &str = "profiles.json";
const GAME_CONFIG_FILE: &str = "game_config.json";

pub const SLASH_DMY_DATE_FORMAT_STR: &str = "[day]/[month]/[year]";
pub const SLASH_MDY_DATE_FORMAT_STR: &str = "[month]/[day]/[year]";
pub const SLASH_YMD_DATE_FORMAT_STR: &str = "[year]/[month]/[day]";

//-------------------------------------------------------------------------------//
//                             Enums 
//-------------------------------------------------------------------------------//

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AppSettings {
    pub tree_open_state: HashMap<String, bool>,
    pub tree_filter_value: String,
    pub list_filter_value: String,
    pub selected_tree_item: Option<String>,
    pub selected_list_item: Option<String>,
    pub panel_heights: std::collections::HashMap<String, u32>,
    pub right_panel_width: u32,
    pub paths: HashMap<String, String>,
    pub strings: HashMap<String, String>,
}

//-------------------------------------------------------------------------------//
//                             Implementations
//-------------------------------------------------------------------------------//

impl AppSettings {
    pub fn new() -> Self {
        Self {
            tree_open_state: HashMap::new(),
            tree_filter_value: String::new(),
            list_filter_value: String::new(),
            selected_tree_item: None,
            selected_list_item: None,
            panel_heights: HashMap::new(),
            right_panel_width: 300,
            paths: HashMap::new(),
            strings: HashMap::new(),
        }
    }

    pub fn init(&mut self, app_handle: &tauri::AppHandle) -> Result<()> {
        
        // TODO: Make this triggers only once through an OnceCell value.
        init_config_path(app_handle)?;

        let games = SupportedGames::default();
        let games = games.games_sorted();
        for game in games {
            if game.key() != KEY_ARENA {

                // Try to find the game path automatically.
                let game_path = game.find_game_install_location()
                    .ok()
                    .flatten()
                    .map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
    
                // If we got a path and we don't have it saved yet, save it automatically.
                let current_path = self.game_path(&game).ok().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
                if !game_path.is_empty() && current_path != game_path {
                    self.set_game_path(game, &game_path);
                }
            }
        }
        Ok(())
    }

    pub fn game_path(&self, game: &GameInfo) -> Result<PathBuf> {
        let path = self.paths.get(game.key()).ok_or(anyhow!("Game path not found"))?;
        Ok(PathBuf::from(path))
    }

    pub fn set_game_path(&mut self, game: &GameInfo, value: &str) {
        self.paths.insert(game.key().to_owned(), value.to_owned());
    }

    pub fn secondary_mods_path(&self) -> Result<PathBuf> {
        let path = self.paths.get("secondary_mods_path").ok_or(anyhow!("Secondary mods path not found"))?;
        Ok(PathBuf::from(path))
    }

    pub fn string(&self, key: &str) -> Result<String> {
        self.strings.get(key).cloned().ok_or(anyhow!("String not found"))
    }

    pub fn set_string_if_new(&mut self, key: &str, value: &str) {
        if self.strings.get(key).is_none() {
            self.strings.insert(key.to_string(), value.to_string());
        }
    }

    pub fn load(app_handle: &tauri::AppHandle) -> Result<Self> {
        let config_path = get_config_path(&app_handle)?;  
        if !config_path.exists() {
            return Ok(Self::new());
        }
        
        // Read and parse the file
        let content = std::fs::read_to_string(&config_path).map_err(|e| anyhow!("Failed to read config file: {}", e))?;
        serde_json::from_str(&content).map_err(|e| anyhow!("Failed to parse config file: {}", e))
        // Fix so we can edit this file on development without erroring out.
        //if let Ok(settings) = serde_json::from_str(&content).map_err(|e| anyhow!("Failed to parse config file: {}", e)) {
        //    Ok(settings)
        //} else {
        //    Ok(Self::new())
        //}
    }

    pub fn save(self, app_handle: &tauri::AppHandle) -> Result<()> {      
        let path = get_config_path(app_handle)?;
        let content = serde_json::to_string_pretty(&self).map_err(|e| anyhow!("Failed to serialize settings: {}", e))?;
        std::fs::write(&path, content).map_err(|e| anyhow!("Failed to write config file: {}", e))?;
        
        println!("Settings saved to: {}", path.display());
        Ok(())
    }
}

//-------------------------------------------------------------------------------//
//                             Extra Helpers
//-------------------------------------------------------------------------------//

#[must_use = "Many things depend on this folder existing. So better check this worked."]
pub fn init_config_path(app_handle: &tauri::AppHandle) -> Result<()> {
    DirBuilder::new().recursive(true).create(error_path(app_handle)?)?;
    DirBuilder::new().recursive(true).create(game_config_path(app_handle)?)?;
    DirBuilder::new().recursive(true).create(profiles_path(app_handle)?)?;
    DirBuilder::new().recursive(true).create(schemas_path(app_handle)?)?;
    DirBuilder::new().recursive(true).create(sql_scripts_extracted_path(app_handle)?)?;
    DirBuilder::new().recursive(true).create(sql_scripts_remote_path(app_handle)?)?;

    // Within the config path we need to create a folder to store the temp packs of each game.
    // Otherwise they interfere with each other due to being movie packs.
    for game in SupportedGames::default().games_sorted().iter() {
        if game.key() != KEY_ARENA {
            DirBuilder::new().recursive(true).create(temp_packs_folder(app_handle, game)?)?;
            DirBuilder::new().recursive(true).create(sql_scripts_local_path(app_handle)?.join(game.key()))?;
        }
    }

    Ok(())
}

// Get the path to the config file
pub fn get_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    let config_dir = config_path(app_handle)?;   
    Ok(config_dir.join(SETTINGS_FILE))
}

pub fn config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    let path = app_handle.path().app_config_dir().map_err(|e| anyhow!("Failed to get app config directory: {e}"))?;

    // TODO: Make this triggers only once through an OnceCell value.
    if !path.exists() {
        init_config_path(app_handle)?;
    }

    Ok(path)
}

/// This function returns the path where crash logs are stored.
pub fn error_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(config_path(app_handle)?.join(ERROR_FOLDER))
}

pub fn temp_packs_folder(app_handle: &tauri::AppHandle, game: &GameInfo) -> Result<PathBuf> {
    Ok(config_path(app_handle)?.join(TEMP_PACKS_FOLDER).join(game.key()))
}

pub fn sql_scripts_extracted_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(config_path(app_handle)?.join(SQL_SCRIPTS_EXTRACTED_FOLDER))
}

pub fn sql_scripts_extracted_extended_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(config_path(app_handle)?.join(format!("{}/twpatcher/scripts", SQL_SCRIPTS_EXTRACTED_FOLDER)))
}

pub fn sql_scripts_local_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(config_path(app_handle)?.join(SQL_SCRIPTS_LOCAL_FOLDER))
}

pub fn sql_scripts_remote_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(config_path(app_handle)?.join(SQL_SCRIPTS_REMOTE_FOLDER))
}

pub fn schemas_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(config_path(app_handle)?.join(SCHEMAS_FOLDER))
}

pub fn game_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(config_path(app_handle)?.join(GAME_CONFIG_FOLDER))
}

pub fn profiles_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(config_path(app_handle)?.join(PROFILES_FOLDER))
}

pub fn last_game_update_date(game: &GameInfo, game_path: &Path) -> Result<u64> {
    Ok(if let Some(exe_path) = game.executable_path(game_path) {
        if let Ok(exe) = File::open(exe_path) {
            if cfg!(target_os = "windows") {
                exe.metadata()?.created()?.duration_since(UNIX_EPOCH)?.as_secs()
            } else {
                0
            }
        } else {
            0
        }
    } else {
        0
    })
}
