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
use getset::*;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::to_string_pretty;

use std::collections::HashMap;
use std::fs::{DirBuilder, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use rpfm_lib::binary::WriteBytes;
use rpfm_lib::files::{Container, ContainerPath, pack::Pack};
use rpfm_lib::games::{GameInfo, pfh_file_type::PFHFileType, supported_games::*};
use rpfm_lib::utils::{path_to_absolute_path, path_to_absolute_string};

use crate::settings::{game_config_path, sql_scripts_extracted_path};

use super::game_config::GameConfig;
use super::{SECONDARY_FOLDER_NAME, secondary_mods_path};

const FILE_NAME_START: &str = "last_load_order_";
const FILE_NAME_END: &str = ".json";

#[allow(unused)]
const VANILLA_MOD_LIST_FILE_NAME: &str = "used_mods.txt";
pub const CUSTOM_MOD_LIST_FILE_NAME: &str = "mod_list.txt";
pub const USER_SCRIPT_FILE_NAME: &str = "user.script.txt";
pub const USER_SCRIPT_EMPIRE_FILE_NAME: &str = "user.empire_script.txt";

//-------------------------------------------------------------------------------//
//                              Enums & Structs
//-------------------------------------------------------------------------------//

#[derive(Clone, Debug, Getters, MutGetters, Setters, Serialize, Deserialize)]
#[getset(get = "pub", get_mut = "pub", set = "pub")]
pub struct LoadOrder {
    // If the list is to be generated automatically on update or not.
    automatic: bool,

    // Id/Pack name of the mod. To get more data of the mod use this as key on the GameConfig/Mods hashmap.
    mods: Vec<String>,

    // Movie Packs. These are not reorderable, so we keep them in a separate list.
    movies: Vec<String>,

    // List of Packs open for data checking. Not serialized.
    #[serde(skip_deserializing, skip_serializing)]
    packs: HashMap<String, Pack>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LoadOrderDirectionMove {
    Up,
    Down,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ImportedLoadOrderMode {
    Runcher(String),
    Modlist(String),
}

//-------------------------------------------------------------------------------//
//                             Implementations
//-------------------------------------------------------------------------------//

impl Default for LoadOrder {
    fn default() -> Self {
        Self {
            automatic: true,
            mods: vec![],
            movies: vec![],
            packs: HashMap::new(),
        }
    }
}

impl LoadOrder {
    pub fn load(app_handle: &tauri::AppHandle, game: &GameInfo) -> Result<Self> {
        let path = game_config_path(app_handle)?
            .join(format!("{FILE_NAME_START}{}{FILE_NAME_END}", game.key()));

        let mut file = BufReader::new(File::open(path)?);
        let mut data = Vec::with_capacity(file.get_ref().metadata()?.len() as usize);
        file.read_to_end(&mut data)?;

        // Cleanup the loaded order to make sure it's not including not installed packs, or new packs.
        let order: Self = serde_json::from_slice(&data)?;

        Ok(order)
    }

    pub fn save(&mut self, app_handle: &tauri::AppHandle, game: &GameInfo) -> Result<()> {
        let path = game_config_path(app_handle)?
            .join(format!("{FILE_NAME_START}{}{FILE_NAME_END}", game.key()));

        // Make sure the path exists to avoid problems with updating schemas.
        if let Some(parent_folder) = path.parent() {
            DirBuilder::new().recursive(true).create(parent_folder)?;
        }

        let mut file = BufWriter::new(File::create(path)?);
        file.write_all(to_string_pretty(&self)?.as_bytes())?;
        Ok(())
    }

    pub fn save_as_load_order_file(
        file_path: &Path,
        game: &GameInfo,
        folder_list: &str,
        pack_list: &str,
    ) -> anyhow::Result<()> {
        let mut file = BufWriter::new(File::create(file_path)?);

        // Napoleon, Empire and Shogun 2 require the user.script.txt or mod list file (for Shogun's latest update) to be in UTF-16 LE.
        if *game.raw_db_version() < 2 {
            file.write_string_u16(folder_list)?;
            file.write_string_u16(pack_list)?;
        } else {
            file.write_all(folder_list.as_bytes())?;
            file.write_all(pack_list.as_bytes())?;
        }

        file.flush().map_err(From::from)
    }

    pub fn path_as_load_order_file(game: &GameInfo, game_path: &Path) -> Result<PathBuf> {
        // NOTE: On Empire and Napoleon we need to use the user_script, not the custom file, as it doesn't seem to work.
        // Older versions of shogun 2 also used the user_script, but the latest update enabled use of custom mod lists.
        if *game.raw_db_version() >= 1 {
            Ok(game_path.join(CUSTOM_MOD_LIST_FILE_NAME))
        } else {
            // Games may fail to launch if we don't have this path created, which is done the first time we start the game.
            let config_path = game
                .config_path(&game_path)
                .ok_or(anyhow!("Error getting the game's config path."))?;
            let scripts_path = config_path.join("scripts");
            DirBuilder::new()
                .recursive(true)
                .create(&scripts_path)
                .map_err(|e| anyhow!("Error creating the scripts path: {}", e))?;

            // Empire has its own user script.
            if game.key() == KEY_EMPIRE {
                Ok(scripts_path.join(USER_SCRIPT_EMPIRE_FILE_NAME))
            } else {
                Ok(scripts_path.join(USER_SCRIPT_FILE_NAME))
            }
        }
    }

    pub fn update(
        &mut self,
        app_handle: &tauri::AppHandle,
        game_config: &GameConfig,
        game: &GameInfo,
        game_data_path: &Path,
    ) {
        self.movies.clear();

        if self.automatic {
            self.build_automatic(game_config, game, game_data_path);
        } else {
            self.build_manual(game_config, game, game_data_path);
        }

        // After the order is built, reload the enabled packs.
        self.packs.clear();
        self.packs = self
            .mods
            .clone()
            .into_par_iter()
            .chain(self.movies.clone())
            .filter_map(|mod_id| {
                let modd = game_config.mods().get(&mod_id)?;
                let path = modd.paths().first()?;
                Some((
                    mod_id.to_owned(),
                    Pack::read_and_merge(&[path.to_path_buf()], true, false, false, false).ok()?,
                ))
            })
            .collect();

        // Regenerate the extracted sql scripts and patches, based on the new load order.
        if let Ok(sql_path) = sql_scripts_extracted_path(app_handle) {
            let _ = std::fs::remove_dir_all(&sql_path);
            let _ = DirBuilder::new().recursive(true).create(&sql_path);

            for mod_id in self.mods.iter().chain(self.movies.iter()) {
                if let Some(pack) = self.packs.get_mut(mod_id) {
                    let _ = pack.extract(
                        ContainerPath::Folder("twpatcher/".to_string()),
                        &sql_path,
                        true,
                        &None,
                        false,
                        false,
                        &None,
                        false,
                    );
                }
            }
        }
    }

    /// Automatic builds means the user input is ignored, and mods are sorted alphabetically.
    fn build_automatic(
        &mut self,
        game_config: &GameConfig,
        game: &GameInfo,
        game_data_path: &Path,
    ) {
        self.mods.clear();

        self.build_movies(game_config, game, game_data_path);

        // Pre-sort the mods, with movie mods at the end.
        self.mods = game_config
            .mods()
            .values()
            .filter(|modd| {
                modd.enabled(game, game_data_path)
                    && *modd.pack_type() == PFHFileType::Mod
                    && !modd.paths().is_empty()
            })
            .map(|modd| modd.id().to_string())
            .collect::<Vec<_>>();

        // NOTE: The fallbacks are there because they're correct most of the time. But for Shogun 2 we NEED the pack comparison.
        self.mods.sort_by(|a, b| {
            let mod_a = game_config.mods().get(a);
            let mod_b = game_config.mods().get(b);
            if let Some(mod_a) = mod_a {
                if let Some(mod_b) = mod_b {
                    // Paths is always populated, as per the previous filter.
                    let pack_a = mod_a.paths()[0].file_name().unwrap().to_string_lossy();
                    let pack_b = mod_b.paths()[0].file_name().unwrap().to_string_lossy();

                    pack_a.cmp(&pack_b)
                } else {
                    a.cmp(b)
                }
            } else {
                a.cmp(b)
            }
        });

        // TODO: Automatically put parent mods above their children.
        // TODO2: If it works how I think it works, the game loads parent mods twice:
        // - First, when the're loaded as a mod.
        // - Second, when a child mod tries to load.
        //
        // That's what I could find from checking save mods. Need to check if that's true and if it's,
        // remove the parent mod from the final load order so it only loads once.
    }

    /// Manual builds means keep the current order, remove deleted mods, and add new ones to the end.
    ///
    /// The user will take care of the rest of the re-ordering.
    fn build_manual(&mut self, game_config: &GameConfig, game: &GameInfo, game_data_path: &Path) {
        self.build_movies(game_config, game, game_data_path);

        let enabled_mods = game_config
            .mods()
            .values()
            .filter(|modd| {
                modd.enabled(game, game_data_path)
                    && *modd.pack_type() == PFHFileType::Mod
                    && !modd.paths().is_empty()
            })
            .map(|modd| modd.id().to_string())
            .collect::<Vec<_>>();

        // Remove mods deleted or unsubscribed, then add the new ones at the end.
        self.mods.retain(|mod_id| enabled_mods.contains(mod_id));

        enabled_mods.iter().for_each(|mod_id| {
            if !self.mods.contains(mod_id) {
                self.mods.push(mod_id.to_owned());
            }
        })
    }

    fn build_movies(&mut self, game_config: &GameConfig, game: &GameInfo, game_data_path: &Path) {
        // Movies are still automatic, even in manual mode.
        self.movies = game_config
            .mods()
            .values()
            .filter(|modd| {
                modd.enabled(game, game_data_path)
                    && *modd.pack_type() == PFHFileType::Movie
                    && !modd.paths().is_empty()
            })
            .map(|modd| modd.id().to_string())
            .collect::<Vec<_>>();

        // NOTE: The fallbacks are there because they're correct most of the time. But for Shogun 2 we NEED the pack comparison.
        self.movies.sort_by(|a, b| {
            let mod_a = game_config.mods().get(a);
            let mod_b = game_config.mods().get(b);
            if let Some(mod_a) = mod_a {
                if let Some(mod_b) = mod_b {
                    // Paths is always populated, as per the previous filter.
                    let pack_a = mod_a.paths()[0].file_name().unwrap().to_string_lossy();
                    let pack_b = mod_b.paths()[0].file_name().unwrap().to_string_lossy();

                    pack_a.cmp(&pack_b)
                } else {
                    a.cmp(b)
                }
            } else {
                a.cmp(b)
            }
        });
    }

    pub fn build_load_order_string(
        &self,
        app_handle: &tauri::AppHandle,
        game_config: &GameConfig,
        game: &GameInfo,
        game_data_path: &Path,
        pack_string: &mut String,
        folder_paths: &mut String,
    ) {
        let mut added_secondary_folder = false;
        let secondary_mods_path =
            secondary_mods_path(app_handle, game.key()).unwrap_or_else(|_| PathBuf::new());
        let secondary_mods_masks_path =
            path_to_absolute_path(&secondary_mods_path.join(SECONDARY_FOLDER_NAME), true);
        let game_data_path = game_data_path.canonicalize().unwrap();
        let mut folder_paths_mods = String::new();

        for mod_id in self.mods() {
            self.process_mod(
                game_config,
                game,
                &game_data_path,
                pack_string,
                &mut folder_paths_mods,
                mod_id,
                &mut added_secondary_folder,
                &secondary_mods_path,
                &secondary_mods_masks_path,
            );
        }

        // Once we're done loading mods, we need to check for toggleable movie packs and add their paths as working folders if they're enabled.
        for mod_id in self.movies() {
            self.process_mod(
                game_config,
                game,
                &game_data_path,
                pack_string,
                &mut folder_paths_mods,
                mod_id,
                &mut added_secondary_folder,
                &secondary_mods_path,
                &secondary_mods_masks_path,
            );
        }

        // Movie exclusions are done in the last step. We need to go through all the movie mods, and make sure to add an exclusion if they're disabled and in data or in secondary.
        // Note that there are two ways to do exclusions: through masking movie mods, and through exclude_pack_file commands, which are only supported since Warhammer I.
        // In modern games we use the command. In older games we have to rely on masking the movie packs with empty packs. Masking is done on launch, we don't need to do anything here.
        for modd in game_config.mods().values() {
            if !modd.enabled(game, &game_data_path) && *modd.pack_type() == PFHFileType::Movie {
                // This only works for Warhammer I and later games.
                if *game.raw_db_version() >= 2
                    && (game.key() != KEY_ROME_2
                        && game.key() != KEY_ATTILA
                        && game.key() != KEY_THRONES_OF_BRITANNIA)
                {
                    if let Some(path) = modd.paths().first() {
                        let pack_name = path
                            .file_name()
                            .unwrap()
                            .to_string_lossy()
                            .as_ref()
                            .to_owned();

                        let mut folder_path = path_to_absolute_path(path, false);
                        folder_path.pop();

                        // If it's the secondary folder and we're using it for another pack, or it's in data, add an exclusion for it.
                        if (secondary_mods_path.is_dir()
                            && folder_path == secondary_mods_path
                            && added_secondary_folder)
                            || path.starts_with(&game_data_path)
                        {
                            pack_string
                                .push_str(&format!("\nexclude_pack_file \"{}\";", &pack_name));
                        }
                    }
                }
            }
        }

        folder_paths.push_str(&folder_paths_mods);
    }

    pub fn move_mod_in_direction(&mut self, mod_id: &str, direction: LoadOrderDirectionMove) {
        self.automatic = false;
        if let Some(index) = self.mods.iter().position(|id| id == mod_id) {
            match direction {
                LoadOrderDirectionMove::Up => {
                    if index > 0 {
                        self.mods.swap(index, index - 1);
                    }
                }
                LoadOrderDirectionMove::Down => {
                    if index < self.mods.len() - 1 {
                        self.mods.swap(index, index + 1);
                    }
                }
            }
        }
    }

    pub fn move_mod_above_another(&mut self, source_id: &str, target_id: &str) {
        if source_id == target_id {
            return;
        }

        self.automatic = false;
        if let Some(index) = self.mods.iter().position(|id| id == source_id) {
            if let Some(mut index_target) = self.mods.iter().position(|id| id == target_id) {
                // Compensate for the index shift after removing the source mod.
                if index_target > index {
                    index_target -= 1;
                }

                self.mods.remove(index);
                self.mods.insert(index_target, source_id.to_string());
            }
        }
    }

    fn process_mod(
        &self,
        game_config: &GameConfig,
        game: &GameInfo,
        game_data_path: &Path,
        pack_string: &mut String,
        folder_paths: &mut String,
        mod_id: &str,
        added_secondary_folder: &mut bool,
        secondary_mods_path: &PathBuf,
        secondary_mods_masks_path: &PathBuf,
    ) {
        if let Some(modd) = game_config.mods().get(mod_id) {
            // Check if the mod is from /data, /secondary or /content.
            //
            // Loading from content is only supported on Rome2 and later games.
            //
            // Loading from secondary is only supported on a fully updated Shogun 2 and later games.
            //
            // Also, Shogun 2 requires some custom file management to move and convert mods to /data, but that's not done here.
            if let Some(path) = modd.paths().first() {
                let pack_name = path
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .as_ref()
                    .to_owned();
                if !path.starts_with(game_data_path) && *game.raw_db_version() >= 1 {
                    let mut folder_path = path_to_absolute_path(path, false);
                    folder_path.pop();

                    // If it's the secondary folder, just add it once. If it's the contents folder, add one per mod.
                    let folder_path_str = path_to_absolute_string(&folder_path);
                    if secondary_mods_path.is_dir() && folder_path == *secondary_mods_path {
                        if !*added_secondary_folder {
                            folder_paths.insert_str(
                                0,
                                &format!("add_working_directory \"{}\";\n", folder_path_str),
                            );

                            // This is only needed for games relying on masking movie packs.
                            if *game.raw_db_version() <= 1
                                || (*game.raw_db_version() == 2
                                    && (game.key() == KEY_ROME_2
                                        || game.key() == KEY_ATTILA
                                        || game.key() == KEY_THRONES_OF_BRITANNIA))
                            {
                                folder_paths.insert_str(
                                    0,
                                    &format!(
                                        "add_working_directory \"{}\";\n",
                                        secondary_mods_masks_path.to_string_lossy()
                                    ),
                                );
                            }

                            *added_secondary_folder = true;
                        }
                    } else {
                        folder_paths
                            .push_str(&format!("add_working_directory \"{}\";\n", folder_path_str));
                    }
                }

                if !pack_string.is_empty() {
                    pack_string.push('\n');
                }

                // Only mods need to be added to the pack string.
                if *modd.pack_type() == PFHFileType::Mod {
                    pack_string.push_str(&format!("mod \"{}\";", &pack_name));
                }
            }
        }
    }
}
