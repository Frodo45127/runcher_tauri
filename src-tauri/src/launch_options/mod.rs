//---------------------------------------------------------------------------//
// Copyright (c) 2017-2024 Ismael Gutiérrez González. All rights reserved.
//
// This file is part of the Rusted Launcher (Runcher) project,
// which can be found here: https://github.com/Frodo45127/runcher.
//
// This file is licensed under the MIT license, which can be found here:
// https://github.com/Frodo45127/runcher/blob/master/LICENSE.
//---------------------------------------------------------------------------//

use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use std::collections::HashMap;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::LazyLock;

use common_utils::sql::{ParamType, Preset, SQLScript};

use rpfm_lib::files::{Container, ContainerPath, FileType};
use rpfm_lib::games::{supported_games::*, *};
use rpfm_lib::utils::files_from_subdir;

#[cfg(target_os = "windows")]
use crate::mod_manager::integrations::DETACHED_PROCESS;
use crate::mod_manager::load_order::*;
use crate::settings::{
    sql_presets_extracted_twpatcher_path, sql_scripts_extracted_twpatcher_path,
    sql_scripts_local_path, sql_scripts_remote_path, temp_packs_folder,
};
use crate::{GAME_CONFIG, GAME_LOAD_ORDER, SETTINGS};

pub const RESERVED_PACK_NAME: &str = "zzzzzzzzzzzzzzzzzzzzrun_you_fool_thron.pack";
pub const RESERVED_PACK_NAME_ALTERNATIVE: &str = "!!!!!!!!!!!!!!!!!!!!!run_you_fool_thron.pack";

#[cfg(target_os = "windows")]
const PATCHER_EXE: &str = "twpatcher.exe";
#[cfg(target_os = "linux")]
const PATCHER_EXE: &str = "twpatcher";

static PATCHER_PATH: LazyLock<String> = LazyLock::new(|| {
    if cfg!(debug_assertions) {
        format!(".\\target\\debug\\{}", PATCHER_EXE)
    } else {
        PATCHER_EXE.to_string()
    }
});

const SUPPORTED_OPTIONS: &[(&str, &[&str])] = &[
    (
        KEY_PHARAOH_DYNASTIES,
        &["enable_logging", "skip_intros", "enable_translations"],
    ),
    (
        KEY_PHARAOH,
        &["enable_logging", "skip_intros", "enable_translations"],
    ),
    (
        KEY_WARHAMMER_3,
        &[
            "enable_logging",
            "skip_intros",
            "remove_trait_limit",
            "remove_siege_attacker",
            "enable_translations",
            "unit_multiplier",
            "universal_rebalancer",
            "enable_dev_only_ui",
        ],
    ),
    (
        KEY_TROY,
        &["enable_logging", "skip_intros", "enable_translations"],
    ),
    (
        KEY_THREE_KINGDOMS,
        &["skip_intros", "enable_translations", "unit_multiplier"],
    ),
    (
        KEY_WARHAMMER_2,
        &["enable_logging", "skip_intros", "enable_translations"],
    ),
    (KEY_WARHAMMER, &["skip_intros", "enable_translations"]),
    (
        KEY_THRONES_OF_BRITANNIA,
        &["skip_intros", "enable_translations"],
    ),
    (KEY_ATTILA, &["skip_intros", "enable_translations"]),
    (KEY_ROME_2, &["skip_intros", "enable_translations"]),
    (KEY_SHOGUN_2, &["skip_intros", "enable_translations"]),
    (KEY_NAPOLEON, &["skip_intros", "enable_translations"]),
    (KEY_EMPIRE, &["skip_intros", "enable_translations"]),
];

//-------------------------------------------------------------------------------//
//                             Structs & Enums
//-------------------------------------------------------------------------------//

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LaunchOptions {
    options: Vec<LaunchOption>,
    scripts: HashMap<String, SQLScript>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOption {
    key: String,
    name: String,
    enabled: bool,
    parameters: Vec<LaunchOptionParameter>,
    is_script: bool,
    presets: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LaunchOptionParameter {
    key: String,
    name: String,
    value: LaunchOptionValue,
    default: LaunchOptionValue,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum LaunchOptionValue {
    Boolean(bool),
    Number(f64),
    Text(String),
    Select(String, Vec<String>),
}

//-------------------------------------------------------------------------------//
//                             Implementations
//-------------------------------------------------------------------------------//

impl LaunchOptions {
    pub fn new() -> Self {
        LaunchOptions {
            options: vec![],
            scripts: HashMap::new(),
        }
    }

    pub fn prepare_launch_options(
        &mut self,
        app: &AppHandle,
        options: &[LaunchOption],
        game: &GameInfo,
        data_path: &Path,
        folder_list: &mut String,
    ) -> Result<()> {
        self.options = options.to_vec();

        if self.options.iter().any(|option| option.enabled) {
            // We need to use an alternative name for Shogun 2, Rome 2, Attila and Thrones because their load order logic for movie packs seems... either different or broken.
            let reserved_pack_name = if game.key() == KEY_SHOGUN_2
                || game.key() == KEY_ROME_2
                || game.key() == KEY_ATTILA
                || game.key() == KEY_THRONES_OF_BRITANNIA
            {
                RESERVED_PACK_NAME_ALTERNATIVE
            } else {
                RESERVED_PACK_NAME
            };

            // If the reserved pack is loaded from a custom folder we need to CLEAR SAID FOLDER before anything else. Otherwise we may end up with old packs messing up stuff.
            if *game.raw_db_version() >= 1 {
                let temp_packs_folder = temp_packs_folder(app, game)?;
                let files = files_from_subdir(&temp_packs_folder, false)?;
                for file in &files {
                    std::fs::remove_file(file)?;
                }
            }

            // Support for add_working_directory seems to be only present in rome 2 and newer games. For older games, we drop the pack into /data.
            let temp_path = if *game.raw_db_version() >= 1 {
                let temp_packs_folder = temp_packs_folder(app, game)?;
                let temp_path = temp_packs_folder.join(reserved_pack_name);
                folder_list.push_str(&format!(
                    "add_working_directory \"{}\";\n",
                    temp_packs_folder.to_string_lossy()
                ));
                temp_path
            } else {
                data_path.join(reserved_pack_name)
            };

            // Prepare the command to generate the temp pack.
            let mut cmd = if cfg!(target_os = "windows") {
                let mut cmd = Command::new("cmd");
                cmd.arg("/C");
                cmd
            } else {
                Command::new("sh")
            };

            cmd.arg(&*PATCHER_PATH);
            cmd.arg("-g");
            cmd.arg(game.key());
            cmd.arg("-l");
            cmd.arg(load_order_file_name(game));
            cmd.arg("-p");
            cmd.arg(temp_path.to_string_lossy().to_string()); // Use a custom path out of /data, if available.
            cmd.arg("-s"); // Skip updates. Updates will be shipped with Runcher updates.

            // Logging check.
            if self
                .options
                .iter()
                .find(|option| option.key == "enable_logging")
                .unwrap()
                .enabled
            {
                cmd.arg("-e");
            }

            // Skip Intros check.
            if self
                .options
                .iter()
                .find(|option| option.key == "skip_intros")
                .unwrap()
                .enabled
            {
                cmd.arg("-i");
            }

            // Remove Trait Limit check.
            if self
                .options
                .iter()
                .find(|option| option.key == "remove_trait_limit")
                .unwrap()
                .enabled
            {
                cmd.arg("-r");
            }

            // Remove Siege Attacker check.
            if self
                .options
                .iter()
                .find(|option| option.key == "remove_siege_attacker")
                .unwrap()
                .enabled
            {
                cmd.arg("-a");
            }

            // Enable Dev-only UI check.
            if self
                .options
                .iter()
                .find(|option| option.key == "enable_dev_only_ui")
                .unwrap()
                .enabled
            {
                cmd.arg("-d");
            }

            // Translations check.
            if let Some(option) = self
                .options
                .iter()
                .find(|option| option.key == "enable_translations")
            {
                if option.enabled {
                    if let Some(param) = option
                        .parameters
                        .iter()
                        .find(|param| param.key == "language")
                    {
                        if let LaunchOptionValue::Select(ref language, _) = param.value {
                            cmd.arg("-t");
                            cmd.arg(language);
                        }
                    }
                }
            }

            // Universal Rebalancer check.
            if let Some(option) = self
                .options
                .iter()
                .find(|option| option.key == "universal_rebalancer")
            {
                if option.enabled {
                    if let Some(param) = option
                        .parameters
                        .iter()
                        .find(|param| param.key == "base_mod")
                    {
                        if let LaunchOptionValue::Select(ref base_mod, _) = param.value {
                            cmd.arg("-u");
                            cmd.arg(base_mod);
                        }
                    }
                }
            }

            // Unit Multiplier check.
            if let Some(option) = self
                .options
                .iter()
                .find(|option| option.key == "unit_multiplier")
            {
                if option.enabled {
                    if let Some(param) = option
                        .parameters
                        .iter()
                        .find(|param| param.key == "multiplier")
                    {
                        if let LaunchOptionValue::Number(multiplier) = param.value {
                            cmd.arg("-m");
                            cmd.arg(multiplier.to_string());
                        }
                    }
                }
            }

            // Script checks.
            let settings = SETTINGS.read().unwrap().clone();
            let sql_folder_extracted = sql_scripts_extracted_twpatcher_path(app)?;
            let sql_folder_presets = sql_presets_extracted_twpatcher_path(app)?;
            let sql_folder_local = sql_scripts_local_path(app)?.join(game.key());
            let sql_folder_remote = sql_scripts_remote_path(app)?.join(game.key());

            self.options
                .iter()
                .filter(|option| option.is_script && option.enabled)
                .filter_map(|option| {
                    if let Some(script) = self.scripts.get(&option.key) {
                        Some((script, option))
                    } else {
                        None
                    }
                })
                .for_each(|(script, option)| {
                    cmd.arg("--sql-script");

                    let script_params = if script.metadata().parameters().is_empty() {
                        vec![]
                    } else {
                        let mut script_params = vec![];

                        // First check if we have a preset set. If not, we can check each param.
                        let preset_key = format!("{}:{}:preset", game.key(), option.key);
                        let preset_value = settings.launch_options.get(&preset_key);
                        let preset = if let Some(preset_value) = preset_value {
                            if preset_value != "none" && sql_folder_presets.is_dir() {
                                files_from_subdir(&sql_folder_presets, false)
                                    .unwrap()
                                    .iter()
                                    .filter_map(|x| Preset::read(x).ok())
                                    .find(|x| x.key() == preset_value)
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
                                        None => {
                                            script_params.push(param.default_value().to_string())
                                        }
                                    }
                                }
                            }
                            None => {
                                for param in script.metadata().parameters() {
                                    let key =
                                        format!("{}:{}:{}", game.key(), option.key, param.key());
                                    if let Some(value) = settings.launch_options.get(&key) {
                                        script_params.push(value.clone());
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
                        cmd.arg(format!(
                            "{};{}",
                            script_path.to_string_lossy().to_string().replace("\\", "/"),
                            script_params.join(";")
                        ));
                    }
                });

            #[cfg(target_os = "windows")]
            cmd.creation_flags(DETACHED_PROCESS);

            let mut h = cmd
                .spawn()
                .map_err(|err| anyhow!("Error when preparing the game patch: {}", err))?;
            if let Ok(status) = h.wait() {
                if !status.success() {
                    return Err(anyhow!(
                        "Something failed while creating the load order patch. Check the patcher terminal to see what happened."
                    ));
                }
            }
        }

        Ok(())
    }

    fn generate_generic_options() -> Vec<LaunchOption> {
        vec![
            LaunchOption {
                key: "enable_logging".to_string(),
                name: "Enable Logging".to_string(),
                enabled: false,
                parameters: vec![],
                is_script: false,
                presets: vec![],
            },
            LaunchOption {
                key: "skip_intros".to_string(),
                name: "Skip Intros".to_string(),
                enabled: false,
                parameters: vec![],
                is_script: false,
                presets: vec![],
            },
            LaunchOption {
                key: "remove_trait_limit".to_string(),
                name: "Remove Trait Limit".to_string(),
                enabled: false,
                parameters: vec![],
                is_script: false,
                presets: vec![],
            },
            LaunchOption {
                key: "remove_siege_attacker".to_string(),
                name: "Remove Siege Attacker".to_string(),
                enabled: false,
                parameters: vec![],
                is_script: false,
                presets: vec![],
            },
            LaunchOption {
                key: "enable_translations".to_string(),
                name: "Enable Translations".to_string(),
                enabled: false,
                parameters: vec![LaunchOptionParameter {
                    key: "language".to_string(),
                    name: "Language".to_string(),
                    value: LaunchOptionValue::Select(String::new(), vec![]),
                    default: LaunchOptionValue::Text(String::new()),
                }],
                is_script: false,
                presets: vec![],
            },
            LaunchOption {
                key: "unit_multiplier".to_string(),
                name: "Unit Multiplier".to_string(),
                enabled: false,
                parameters: vec![LaunchOptionParameter {
                    key: "multiplier".to_string(),
                    name: "Multiplier".to_string(),
                    value: LaunchOptionValue::Number(1.0),
                    default: LaunchOptionValue::Number(1.0),
                }],
                is_script: false,
                presets: vec![],
            },
            LaunchOption {
                key: "universal_rebalancer".to_string(),
                name: "Universal Rebalancer".to_string(),
                enabled: false,
                parameters: vec![LaunchOptionParameter {
                    key: "base_mod".to_string(),
                    name: "Base Mod".to_string(),
                    value: LaunchOptionValue::Select(String::new(), vec![]),
                    default: LaunchOptionValue::Text(String::new()),
                }],
                is_script: false,
                presets: vec![],
            },
            LaunchOption {
                key: "enable_dev_only_ui".to_string(),
                name: "Enable Dev-only UI".to_string(),
                enabled: false,
                parameters: vec![],
                is_script: false,
                presets: vec![],
            },
        ]
    }

    pub fn generate_options(
        &mut self,
        app: &AppHandle,
        game: &GameInfo,
        game_path: &Path,
    ) -> Result<Vec<LaunchOption>> {
        self.options.clear();
        self.scripts.clear();

        let path_is_valid =
            game_path.exists() && game_path.is_dir() && !game_path.to_string_lossy().is_empty();
        if path_is_valid {
            // First we need to generate the generic options that affect most games.
            let game_options = SUPPORTED_OPTIONS
                .iter()
                .find(|(game_key, _)| game.key() == *game_key)
                .unwrap()
                .1;
            let mut default_options = Self::generate_generic_options();
            default_options.retain(|option| {
                game_options
                    .iter()
                    .any(|game_option| *game_option == option.key)
            });
            self.options.extend_from_slice(&default_options);

            // The translations one needs to be populated only with the downloaded game languages.
            if let Some(ref mut translations_option) = self
                .options
                .iter_mut()
                .find(|option| option.key == "enable_translations")
            {
                if let Some(ref mut language_param) = translations_option
                    .parameters
                    .iter_mut()
                    .find(|param| param.key == "language")
                {
                    if let Ok(ca_packs) = game.ca_packs_paths(game_path) {
                        let mut languages = ca_packs
                            .iter()
                            .filter_map(|path| path.file_stem())
                            .filter(|name| name.to_string_lossy().starts_with("local_"))
                            .map(|name| name.to_string_lossy().split_at(6).1.to_uppercase())
                            .collect::<Vec<_>>();

                        // Sort, and remove anything longer than 2 characters to avoid duplicates.
                        languages.retain(|lang| lang.chars().count() == 2);
                        languages.sort();

                        if !languages.is_empty() {
                            language_param.value =
                                LaunchOptionValue::Select(languages[0].clone(), languages.clone());
                            language_param.default = LaunchOptionValue::Text(languages[0].clone());
                        }
                    }
                }
            }

            // Same with the universal rebalancer. We need to find all enabled packs with a copy of land_units.
            if let Some(ref mut universal_rebalancer_option) = self
                .options
                .iter_mut()
                .find(|option| option.key == "universal_rebalancer")
            {
                if let Some(ref mut base_mod_param) = universal_rebalancer_option
                    .parameters
                    .iter_mut()
                    .find(|param| param.key == "base_mod")
                {
                    let mut load_order = GAME_LOAD_ORDER.read().unwrap().clone();
                    let game_config = GAME_CONFIG.lock().unwrap().clone();

                    if let Some(mut game_config) = game_config {
                        if let Ok(game_data_path) = game.data_path(game_path) {
                            load_order.update(app, &mut game_config, game, &game_data_path);

                            let mut packs_for_rebalancer = load_order
                                .packs()
                                .iter()
                                .filter_map(|(key, pack)| {
                                    if !pack
                                        .files_by_type_and_paths(
                                            &[FileType::DB],
                                            &[ContainerPath::Folder(
                                                "db/land_units_tables/".to_owned(),
                                            )],
                                            true,
                                        )
                                        .is_empty()
                                    {
                                        Some(key.to_owned())
                                    } else {
                                        None
                                    }
                                })
                                .collect::<Vec<_>>();

                            packs_for_rebalancer.sort();

                            if !packs_for_rebalancer.is_empty() {
                                base_mod_param.value = LaunchOptionValue::Select(
                                    packs_for_rebalancer[0].clone(),
                                    packs_for_rebalancer.clone(),
                                );
                                base_mod_param.default =
                                    LaunchOptionValue::Text(packs_for_rebalancer[0].clone());
                            }
                        }
                    }
                }
            }

            // Scripts are done in a separate step, because they're dynamic. Priority is:
            // - Local scripts.
            // - Extracted scripts.
            // - Remote scripts.
            let extracted_scripts_folder = sql_scripts_extracted_twpatcher_path(app)?;
            let presets_folder = sql_presets_extracted_twpatcher_path(app)?;

            let local_folder = sql_scripts_local_path(app)?;
            let remote_folder = sql_scripts_remote_path(app)?;
            let mut sql_script_paths = files_from_subdir(&local_folder.join(game.key()), false)?;

            // Only add extracted paths if they don't collide with local paths, as local paths take priority.
            if let Ok(extracted_files) = files_from_subdir(&extracted_scripts_folder, false) {
                for extracted_file in &extracted_files {
                    if let Ok(relative_path) =
                        extracted_file.strip_prefix(&extracted_scripts_folder)
                    {
                        if !local_folder.join(relative_path).is_file() {
                            sql_script_paths.push(extracted_file.to_path_buf());
                        }
                    }
                }
            }

            // Only add remote paths if they don't collide with local or extracted paths, as they take priority.
            if let Ok(remote_files) = files_from_subdir(&remote_folder.join(game.key()), false) {
                for remote_file in &remote_files {
                    if let Ok(relative_path) = remote_file.strip_prefix(&remote_folder) {
                        if !local_folder.join(relative_path).is_file()
                            && !extracted_scripts_folder.join(relative_path).is_file()
                        {
                            sql_script_paths.push(remote_file.to_path_buf());
                        }
                    }
                }
            }

            let presets = files_from_subdir(&presets_folder, false)
                .unwrap_or_default()
                .iter()
                .filter_map(|x| Preset::read(x).ok())
                .collect::<Vec<_>>();

            let mut presets_by_script: HashMap<String, Vec<Preset>> = HashMap::new();
            for preset in &presets {
                match presets_by_script.get_mut(preset.script_key()) {
                    Some(presets) => presets.push(preset.clone()),
                    None => {
                        presets_by_script
                            .insert(preset.script_key().to_owned(), vec![preset.clone()]);
                    }
                }
            }

            for path in sql_script_paths {
                if let Some(extension) = path.extension() {
                    // Only load yml files.
                    if extension == "yml" {
                        if let Ok(script) = SQLScript::from_path(&path) {
                            let presets = presets_by_script
                                .get(script.metadata().key())
                                .map(|x| x.iter().map(|x| x.key().to_owned()).collect())
                                .unwrap_or_default();

                            let mut params = vec![];
                            for param in script.metadata().parameters() {
                                params.push(LaunchOptionParameter {
                                    key: param.key().to_string(),
                                    name: param.name().to_string(),
                                    value: LaunchOptionValue::Select(String::new(), vec![]),
                                    default: match param.r#type() {
                                        ParamType::Bool => LaunchOptionValue::Boolean(
                                            param
                                                .default_value()
                                                .parse::<bool>()
                                                .unwrap_or_default(),
                                        ),
                                        ParamType::Integer => LaunchOptionValue::Number(
                                            param.default_value().parse::<i32>().unwrap_or_default()
                                                as f64,
                                        ),
                                        ParamType::Float => LaunchOptionValue::Number(
                                            param.default_value().parse::<f32>().unwrap_or_default()
                                                as f64,
                                        ),
                                    },
                                });
                            }

                            let option = LaunchOption {
                                key: script.metadata().key().to_string(),
                                name: script.metadata().name().to_string(),
                                enabled: false,
                                parameters: params,
                                is_script: true,
                                presets,
                            };

                            self.options.push(option);
                            self.scripts
                                .insert(script.metadata().key().to_string(), script);
                        }
                    }
                }
            }

            // Set the state of default options.
            let settings = SETTINGS.read().unwrap().clone();
            for option in &mut self.options {
                let key = format!("{}:{}", game.key(), option.key);
                if let Some(value) = settings.launch_options.get(&key) {
                    if let Ok(value) = value.parse::<bool>() {
                        option.enabled = value;
                    }

                    for param in &mut option.parameters {
                        let key = format!("{}:{}", key, param.key);
                        if let Some(value) = settings.launch_options.get(&key) {
                            param.value = match param.value {
                                LaunchOptionValue::Boolean(_) => LaunchOptionValue::Boolean(
                                    value.parse::<bool>().unwrap_or_default(),
                                ),
                                LaunchOptionValue::Number(_) => LaunchOptionValue::Number(
                                    value.parse::<f64>().unwrap_or_default(),
                                ),
                                LaunchOptionValue::Text(_) => {
                                    LaunchOptionValue::Text(value.clone())
                                }
                                LaunchOptionValue::Select(_, _) => {
                                    LaunchOptionValue::Select(value.clone(), vec![])
                                }
                            };
                        } else {
                            param.value = match &param.default {
                                LaunchOptionValue::Boolean(default) => {
                                    LaunchOptionValue::Boolean(*default)
                                }
                                LaunchOptionValue::Number(default) => {
                                    LaunchOptionValue::Number(*default)
                                }
                                LaunchOptionValue::Text(default) => match &param.value {
                                    LaunchOptionValue::Select(_, available_values) => {
                                        if available_values.contains(default) {
                                            LaunchOptionValue::Select(
                                                default.to_owned(),
                                                available_values.clone(),
                                            )
                                        } else {
                                            param.value.clone()
                                        }
                                    }
                                    _ => LaunchOptionValue::Text(default.to_owned()),
                                },

                                // All default selects are just one text value. So this should never happen.
                                LaunchOptionValue::Select(default, _) => {
                                    LaunchOptionValue::Select(default.to_owned(), vec![])
                                }
                            };
                        }
                    }
                }
            }
        }

        Ok(self.options.clone())
    }
}

fn load_order_file_name(game: &GameInfo) -> String {
    if *game.raw_db_version() >= 1 {
        CUSTOM_MOD_LIST_FILE_NAME.to_string()
    } else if game.key() == KEY_EMPIRE {
        USER_SCRIPT_EMPIRE_FILE_NAME.to_string()
    } else {
        USER_SCRIPT_FILE_NAME.to_string()
    }
}
