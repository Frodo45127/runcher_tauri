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
use tauri::AppHandle;

#[cfg(target_os = "windows")]use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::LazyLock;

use common_utils::sql::{ParamType, SQLScript};

use rpfm_lib::files::{Container, ContainerPath, FileType};
use rpfm_lib::games::{*, supported_games::*};
use rpfm_lib::utils::files_from_subdir;

#[cfg(target_os = "windows")]use crate::mod_manager::integrations::DETACHED_PROCESS;
use crate::SCHEMA;
use crate::settings::{temp_packs_folder, sql_scripts_local_path, sql_scripts_remote_path};

pub const RESERVED_PACK_NAME: &str = "zzzzzzzzzzzzzzzzzzzzrun_you_fool_thron.pack";
pub const RESERVED_PACK_NAME_ALTERNATIVE: &str = "!!!!!!!!!!!!!!!!!!!!!run_you_fool_thron.pack";

#[cfg(target_os = "windows")]const PATCHER_EXE: &str = "twpatcher.exe";
#[cfg(target_os = "linux")]const PATCHER_EXE: &str = "twpatcher";

static PATCHER_PATH: LazyLock<String> =
    LazyLock::new(|| if cfg!(debug_assertions) {
        format!(".\\target\\debug\\{}", PATCHER_EXE)
    } else {
        PATCHER_EXE.to_string()
    });

const SUPPORTED_OPTIONS: &[(&str, &[&str])] = &[
    (KEY_PHARAOH_DYNASTIES, &["enable_logging", "skip_intros", "enable_translations"]),
    (KEY_PHARAOH, &["enable_logging", "skip_intros", "enable_translations"]),
    (KEY_WARHAMMER_3, &["enable_logging", "skip_intros", "remove_trait_limit", "remove_siege_attacker", "enable_translations", "unit_multiplier", "universal_rebalancer", "enable_dev_only_ui"]),
    (KEY_TROY, &["enable_logging", "skip_intros", "enable_translations"]),
    (KEY_THREE_KINGDOMS, &["skip_intros", "enable_translations", "unit_multiplier"]),
    (KEY_WARHAMMER_2, &["enable_logging", "skip_intros", "enable_translations"]),
    (KEY_WARHAMMER, &["skip_intros", "enable_translations"]),
    (KEY_THRONES_OF_BRITANNIA, &["skip_intros", "enable_translations"]),
    (KEY_ATTILA, &["skip_intros", "enable_translations"]),
    (KEY_ROME_2, &["skip_intros", "enable_translations"]),
    (KEY_SHOGUN_2, &["skip_intros", "enable_translations"]),
    (KEY_NAPOLEON, &["skip_intros", "enable_translations"]),
    (KEY_EMPIRE, &["skip_intros", "enable_translations"]),
];

//-------------------------------------------------------------------------------//
//                             Structs & Enums
//-------------------------------------------------------------------------------//

#[derive(Clone, Debug, Serialize)]
pub struct LaunchOption {
    key: String,
    name: String,
    enabled: bool,
    parameters: Vec<LaunchOptionParameter>,
}

#[derive(Clone, Debug, Serialize)]
pub struct LaunchOptionParameter {
    key: String,
    name: String,
    value: LaunchOptionValue,
    default: LaunchOptionValue,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", content = "value")]
pub enum LaunchOptionValue {
    Boolean(bool),
    Number(f64),
    Text(String),
    Select(Vec<String>),
}

//-------------------------------------------------------------------------------//
//                             Implementations
//-------------------------------------------------------------------------------//

pub fn prepare_launch_options(game: &GameInfo, data_path: &Path, folder_list: &mut String) -> Result<()> {
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

                    script_params
                };

                // When there's a collision, default to the local script path.
                let script_name = format!("{}.yml", script.metadata().key());
                let local_script_path = sql_folder_local.join(&script_name);
                let remote_script_path = sql_folder_remote.join(&script_name);
                let script_path = if PathBuf::from(&local_script_path).is_file() {
                    local_script_path
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
    }
*/
    Ok(())
}

fn generate_generic_options() -> Vec<LaunchOption> {
    vec![
        LaunchOption {
            key: "enable_logging".to_string(),
            name: "Enable Logging".to_string(),
            enabled: false,
            parameters: vec![],
        },
        LaunchOption {
            key: "skip_intros".to_string(),
            name: "Skip Intros".to_string(),
            enabled: false,
            parameters: vec![],
        },
        LaunchOption {
            key: "remove_trait_limit".to_string(),
            name: "Remove Trait Limit".to_string(),
            enabled: false,
            parameters: vec![],
        },
        LaunchOption {
            key: "remove_siege_attacker".to_string(),
            name: "Remove Siege Attacker".to_string(),
            enabled: false,
            parameters: vec![],
        },
        LaunchOption {
            key: "enable_translations".to_string(),
            name: "Enable Translations".to_string(),
            enabled: false,
            parameters: vec![
                LaunchOptionParameter {
                    key: "language".to_string(),
                    name: "Language".to_string(),
                    value: LaunchOptionValue::Select(vec![]),
                    default: LaunchOptionValue::Select(vec![]),
                },
            ],
        },
        LaunchOption {
            key: "unit_multiplier".to_string(),
            name: "Unit Multiplier".to_string(),
            enabled: false,
            parameters: vec![
                LaunchOptionParameter {
                    key: "multiplier".to_string(),
                    name: "Multiplier".to_string(),
                    value: LaunchOptionValue::Number(1.0),
                    default: LaunchOptionValue::Number(1.0),
                },
            ],
        },
        LaunchOption {
            key: "universal_rebalancer".to_string(),
            name: "Universal Rebalancer".to_string(),
            enabled: false,
            parameters: vec![
                LaunchOptionParameter {
                    key: "base_mod".to_string(),
                    name: "Base Mod".to_string(),
                    value: LaunchOptionValue::Select(vec![]),
                    default: LaunchOptionValue::Select(vec![]),
                },
            ],
        },
        LaunchOption {
            key: "enable_dev_only_ui".to_string(),
            name: "Enable Dev-only UI".to_string(),
            enabled: false,
            parameters: vec![],
        },
    ]
}

pub fn generate_options(app: &AppHandle, game: &GameInfo, game_path: &Path) -> Result<Vec<LaunchOption>> {
    let mut options = vec![];

    let path_is_valid = game_path.exists() && game_path.is_dir() && !game_path.to_string_lossy().is_empty();
    if path_is_valid {

        // First we need to generate the generic options that affect most games.
        let game_options = SUPPORTED_OPTIONS.iter().find(|(game_key, _)| game.key() == *game_key).unwrap().1;
        let mut default_options = generate_generic_options();
        default_options.retain(|option| game_options.iter().any(|game_option| *game_option == option.key));
        options.extend_from_slice(&default_options);

        // The translations one needs to be populated only with the downloaded game languages.
        if let Some(ref mut translations_option) = options.iter_mut().find(|option| option.key == "enable_translations") {
            if let Some(ref mut language_param) = translations_option.parameters.iter_mut().find(|param| param.key == "language") {
                if let Ok(ca_packs) = game.ca_packs_paths(game_path) {
                    let mut languages = ca_packs.iter()
                        .filter_map(|path| path.file_stem())
                        .filter(|name| name.to_string_lossy().starts_with("local_"))
                        .map(|name| name.to_string_lossy().split_at(6).1.to_uppercase())
                        .collect::<Vec<_>>();

                    // Sort, and remove anything longer than 2 characters to avoid duplicates.
                    languages.retain(|lang| lang.chars().count() == 2);
                    languages.sort();

                    language_param.value = LaunchOptionValue::Select(languages.clone());

                    if !languages.is_empty() {
                        language_param.default = LaunchOptionValue::Select(vec![languages[0].clone()]);
                    }
                }
            }
        }

        // Same with the universal rebalancer. We need to find all enabled packs with a copy of land_units.
        if let Some(ref mut universal_rebalancer_option) = options.iter_mut().find(|option| option.key == "universal_rebalancer") {
            if let Some(ref mut base_mod_param) = universal_rebalancer_option.parameters.iter_mut().find(|param| param.key == "base_mod") {
                /*
                let mut load_order = app_ui.game_load_order().read().unwrap().clone();
                if let Ok(game_data_path) = game.data_path(game_path) {
                    if let Some(ref game_config) = *app_ui.game_config().read().unwrap() {
                        load_order.update(game_config, game, &game_data_path);

                        let mut packs_for_rebalancer = load_order.packs().iter()
                            .filter_map(|(key, pack)| {
                                if !pack.files_by_type_and_paths(&[FileType::DB], &[ContainerPath::Folder("db/land_units_tables/".to_owned())], true).is_empty() {
                                    Some(key)
                                } else {
                                    None
                                }
                            }).collect::<Vec<_>>();

                        packs_for_rebalancer.sort();
                        for pack in &packs_for_rebalancer {
                            app_ui.actions_ui().universal_rebalancer_combobox().add_item_q_string(&QString::from_std_str(pack));
                        }

                        // Only apply it if it's still valid.
                        let pack_to_select = setting_string(&format!("universal_rebalancer_{}", game.key()));
                        if app_ui.actions_ui().universal_rebalancer_combobox().find_text_1a(&QString::from_std_str(&pack_to_select)) != -1 {
                            app_ui.actions_ui().universal_rebalancer_combobox().set_current_text(&QString::from_std_str(&pack_to_select));
                        }
                    }
                }*/
            }
        }

        // Scripts are done in a separate step, because they're dynamic.
        let local_folder = sql_scripts_local_path(app)?;
        let remote_folder = sql_scripts_remote_path(app)?;
        let mut sql_script_paths = files_from_subdir(&local_folder.join(game.key()), false)?;

        // Only add remote paths if they don't collide with local paths, as local paths take priority.
        if let Ok(remote_files) = files_from_subdir(&remote_folder.join(game.key()), false) {
            for remote_file in &remote_files {
                if let Ok(relative_path) = remote_file.strip_prefix(&remote_folder) {
                    if !local_folder.join(relative_path).is_file() {
                        sql_script_paths.push(remote_file.to_path_buf());
                    }
                }
            }
        }

        for path in sql_script_paths {
            if let Some(extension) = path.extension() {

                // Only load yml files.
                if extension == "yml" {
                    if let Ok(script) = SQLScript::from_path(&path) {

                        let mut params = vec![];
                        for param in script.metadata().parameters() {
                            params.push(LaunchOptionParameter {
                                key: param.key().to_string(),
                                name: param.name().to_string(),
                                value: LaunchOptionValue::Select(vec![]),
                                default: match param.r#type() {
                                    ParamType::Bool => LaunchOptionValue::Boolean(param.default_value().parse::<bool>().unwrap_or_default()),
                                    ParamType::Integer => LaunchOptionValue::Number(param.default_value().parse::<i32>().unwrap_or_default() as f64),
                                    ParamType::Float => LaunchOptionValue::Number(param.default_value().parse::<f32>().unwrap_or_default() as f64),
                                    _ => LaunchOptionValue::Text(param.default_value().to_string()),
                                },
                            });
                        }

                        let option = LaunchOption {
                            key: script.metadata().key().to_string(),
                            name: script.metadata().name().to_string(),
                            enabled: false,
                            parameters: params,
                        };

                        options.push(option);
                    }
                }
            }
        }
    }

    Ok(options)
}
