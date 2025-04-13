//---------------------------------------------------------------------------//
// Copyright (c) 2017-2024 Ismael Gutiérrez González. All rights reserved.
//
// This file is part of the Rusted Launcher (Runcher) project,
// which can be found here: https://github.com/Frodo45127/runcher.
//
// This file is licensed under the MIT license, which can be found here:
// https://github.com/Frodo45127/runcher/blob/master/LICENSE.
//---------------------------------------------------------------------------//

//! Module containing the centralized code for mod and load order management.

use anyhow::{Result, anyhow};
use flate2::read::ZlibDecoder;
use getset::*;
use rayon::{iter::Either, prelude::*};
use serde::{Deserialize, Serialize};
use serde_json::to_string_pretty;
use tauri::async_runtime::{channel, Receiver};

use std::collections::{BTreeMap, HashMap};
use std::fs::{DirBuilder, File};
use std::io::{BufReader, BufWriter, Cursor, Read, Write};
use std::path::Path;
use std::time::UNIX_EPOCH;

use rpfm_lib::files::pack::Pack;
use rpfm_lib::games::{GameInfo, pfh_file_type::PFHFileType, supported_games::KEY_SHOGUN_2};
use rpfm_lib::integrations::log::error;

//use crate::games::{RESERVED_PACK_NAME, RESERVED_PACK_NAME_ALTERNATIVE};
use crate::mod_manager::{load_order::LoadOrder, mods::Mod};
use crate::{settings::*, GAME_SELECTED, SETTINGS, STORE_THREAD_COMMS};
use crate::{RESERVED_PACK_NAME, RESERVED_PACK_NAME_ALTERNATIVE};

use super::integrations::populate_mods_with_online_data;
use super::{generate_map_pack, move_to_destination, secondary_mods_packs_paths, secondary_mods_path};

//mod versions;

const GAME_CONFIG_FILE_NAME_START: &str = "game_config_";
const GAME_CONFIG_FILE_NAME_END: &str = ".json";
pub const DEFAULT_CATEGORY: &str = "Unassigned";

//-------------------------------------------------------------------------------//
//                              Enums & Structs
//-------------------------------------------------------------------------------//

#[derive(Clone, Debug, Default, Getters, MutGetters, Setters, Serialize, Deserialize)]
#[getset(get = "pub", get_mut = "pub", set = "pub")]
pub struct GameConfig {
    // Key of the game.
    game_key: String,

    // Mods found for the game. Pack name is the key. This list contains all mods ever seen,
    // so if you reinstall a mod, it's data is reused.
    mods: HashMap<String, Mod>,

    // List of categories, and the pack names in each category.
    //
    // They are in order. Meaning if you want to change their order, you need to change them here.
    // And make sure only valid packs (with paths) are added.
    categories: BTreeMap<String, Vec<String>>,

    // List of categories in order.
    categories_order: Vec<String>,
}

//-------------------------------------------------------------------------------//
//                             Implementations
//-------------------------------------------------------------------------------//

impl GameConfig {
    pub fn load(
        app_handle: &tauri::AppHandle,
        game: &GameInfo,
        new_if_missing: bool,
    ) -> Result<Self> {
        let path = game_config_path(app_handle)?.join(format!(
            "{GAME_CONFIG_FILE_NAME_START}{}{GAME_CONFIG_FILE_NAME_END}",
            game.key()
        ));
        if !path.is_file() && new_if_missing {
            let mut config = Self {
                game_key: game.key().to_string(),
                ..Default::default()
            };

            config
                .categories_mut()
                .insert(DEFAULT_CATEGORY.to_owned(), vec![]);
            config
                .categories_order_mut()
                .push(DEFAULT_CATEGORY.to_owned());

            return Ok(config);
        }

        let mut file = BufReader::new(File::open(path)?);
        let mut data = Vec::with_capacity(file.get_ref().metadata()?.len() as usize);
        file.read_to_end(&mut data)?;

        let mut config: Self = serde_json::from_slice(&data)?;

        // Just in case we don't have a default category yet.
        if config.categories().get(DEFAULT_CATEGORY).is_none() {
            config
                .categories_mut()
                .insert(DEFAULT_CATEGORY.to_owned(), vec![]);
            config
                .categories_order_mut()
                .retain(|category| category != DEFAULT_CATEGORY);
            config
                .categories_order_mut()
                .push(DEFAULT_CATEGORY.to_owned());
        }

        Ok(config)
    }

    pub fn save(&mut self, app_handle: &tauri::AppHandle, game: &GameInfo) -> Result<()> {
        let path = game_config_path(app_handle)?.join(format!(
            "{GAME_CONFIG_FILE_NAME_START}{}{GAME_CONFIG_FILE_NAME_END}",
            game.key()
        ));

        // Make sure the path exists to avoid problems with updating schemas.
        if let Some(parent_folder) = path.parent() {
            DirBuilder::new().recursive(true).create(parent_folder)?;
        }

        let mut file = BufWriter::new(File::create(path)?);
        file.write_all(to_string_pretty(&self)?.as_bytes())?;
        file.flush()?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn update(_game_name: &str) -> Result<()> {
        //let _ = versions::v0::GameConfigV0::update(game_name);
        //let _ = versions::v1::GameConfigV1::update(game_name);
        //let _ = versions::v2::GameConfigV2::update(game_name);
        //let _ = versions::v3::GameConfigV3::update(game_name);
        //let _ = versions::v4::GameConfigV4::update(game_name);

        Ok(())
    }

    // TODO: Optimize this if it gets too slow.
    pub fn category_for_mod(&self, id: &str) -> String {
        let mut category = DEFAULT_CATEGORY.to_string();
        let mut found = false;
        for (cat, packs) in &self.categories {
            for pack in packs {
                if pack == id {
                    category = cat.to_owned();
                    found = true;
                    break;
                }
            }
        }

        // If the mod wasn't found, it's a bug.
        if !found {
            error!(
                "Mod {} not found in a category. This is a bug in the code that parses the mods, or you passed a mod which is not installed.",
                id
            );
        }

        category
    }

    pub fn create_category(&mut self, category: &str) -> Result<()> {
        if category == DEFAULT_CATEGORY {
            return Err(anyhow!("Cannot create default category."));
        }

        if self.categories().get(category).is_some() {
            return Err(anyhow!("Category already exists."));
        }

        self.categories_mut().insert(category.to_owned(), vec![]);

        let pos = if !self.categories_order().is_empty() {
            self.categories_order().len() - 1
        } else {
            0
        };
        self.categories_order_mut().insert(pos, category.to_owned());

        Ok(())
    }

    pub fn rename_category(&mut self, category: &str, new_name: &str) -> Result<()> {
        if category == new_name {
            return Ok(());
        }

        if category == DEFAULT_CATEGORY {
            return Err(anyhow!("Cannot rename default category."));
        }

        if new_name == DEFAULT_CATEGORY {
            return Err(anyhow!("Cannot rename category to default category."));
        }

        if new_name.is_empty() {
            return Err(anyhow!("New name cannot be empty."));
        }

        if self.categories().get(new_name).is_some() {
            return Err(anyhow!("Category with new name already exists."));
        }

        if let Some(packs) = self.categories_mut().remove(category) {
            self.categories_mut().insert(new_name.to_owned(), packs);

            if let Some(pos) = self.categories_order().iter().position(|x| x == &category) {
                self.categories_order_mut()[pos] = new_name.to_owned();
            }
        }

        Ok(())
    }

    pub fn delete_category(&mut self, category: &str) -> Result<()> {
        if category == DEFAULT_CATEGORY {
            return Err(anyhow!("Cannot delete default category."));
        }

        if let Some(mods) = self.categories_mut().remove(category) {
            self.categories_order_mut().retain(|x| x != category);

            // Reparent all mods to the default category.
            if let Some(default_cat) = self.categories_mut().get_mut(DEFAULT_CATEGORY) {
                default_cat.extend(mods);
            }
        }

        Ok(())
    }

    /// NOTE: This returns a channel receiver for the workshop/equivalent service data request.
    /// This is done so the request doesn't hang the entire load process, as it usually takes 2 or 3 seconds to complete.
    pub async fn update_mod_list(
        &mut self,
        app_handle: &tauri::AppHandle,
        game: &GameInfo,
        game_path: &Path,
        load_order: &mut LoadOrder,
        skip_network_update: bool,
    ) -> Result<Option<Receiver<Result<Vec<Mod>>>>> {
        let mut receiver = None;

        // Clear the mod paths, just in case a failure while loading them leaves them unclean.
        self.mods_mut()
            .values_mut()
            .for_each(|modd| modd.paths_mut().clear());

        // If we have a path, load all the mods to the UI.
        if game_path.components().count() > 1 && game_path.is_dir() {
            // Vanilla paths may fail if the game path is incorrect, or the game is not properly installed.
            // In that case, we assume there are no packs nor mods to load to avoid further errors.
            if let Ok(vanilla_packs) = game.ca_packs_paths(game_path) {
                let data_paths = game.data_packs_paths(game_path);
                let content_path = game
                    .content_path(game_path)
                    .map(|path| std::fs::canonicalize(path.clone()).unwrap_or(path));
                let content_paths = game.content_packs_paths(game_path);
                let secondary_mods_paths = secondary_mods_packs_paths(app_handle, game.key());

                let mut steam_ids = vec![];

                // Initialize the mods in the contents folders first.
                //
                // These have less priority.
                if let Ok(ref content_path) = content_path {
                    if let Some(ref paths) = content_paths {
                        let (packs, maps): (Vec<_>, Vec<_>) =
                            paths.par_iter().partition_map(|path| {
                                match Pack::read_and_merge(
                                    &[path.to_path_buf()],
                                    true,
                                    false,
                                    false,
                                    false,
                                ) {
                                    Ok(pack) => Either::Left((path, pack)),
                                    Err(_) => Either::Right(path),
                                }
                            });

                        for (path, pack) in packs {
                            let pack_name = path
                                .file_name()
                                .unwrap()
                                .to_string_lossy()
                                .as_ref()
                                .to_owned();
                            if pack.pfh_file_type() == PFHFileType::Mod
                                || pack.pfh_file_type() == PFHFileType::Movie
                            {
                                match self.mods_mut().get_mut(&pack_name) {
                                    Some(modd) => {
                                        if !modd.paths().contains(path) {
                                            modd.paths_mut().push(path.to_path_buf());
                                        }

                                        modd.set_pack_type(pack.pfh_file_type());

                                        let metadata = modd.paths().last().unwrap().metadata()?;
                                        #[cfg(target_os = "windows")]
                                        modd.set_time_created(
                                            metadata
                                                .created()?
                                                .duration_since(UNIX_EPOCH)?
                                                .as_secs()
                                                as usize,
                                        );
                                        modd.set_time_updated(
                                            metadata
                                                .modified()?
                                                .duration_since(UNIX_EPOCH)?
                                                .as_secs()
                                                as usize,
                                        );

                                        // Get the steam id from the path, if possible.
                                        let path_strip = path
                                            .strip_prefix(content_path)?
                                            .to_string_lossy()
                                            .replace("\\", "/");
                                        let path_strip_split =
                                            path_strip.split("/").collect::<Vec<_>>();
                                        if !path_strip_split.is_empty() {
                                            let steam_id = path_strip_split[0].to_owned();
                                            steam_ids.push(steam_id.to_owned());
                                            modd.set_steam_id(Some(steam_id));
                                        }
                                    }
                                    None => {
                                        let mut modd = Mod::default();
                                        modd.set_name(pack_name.to_owned());
                                        modd.set_id(pack_name.to_owned());
                                        modd.set_paths(vec![path.to_path_buf()]);
                                        modd.set_pack_type(pack.pfh_file_type());

                                        let metadata = modd.paths()[0].metadata()?;
                                        #[cfg(target_os = "windows")]
                                        modd.set_time_created(
                                            metadata
                                                .created()?
                                                .duration_since(UNIX_EPOCH)?
                                                .as_secs()
                                                as usize,
                                        );
                                        modd.set_time_updated(
                                            metadata
                                                .modified()?
                                                .duration_since(UNIX_EPOCH)?
                                                .as_secs()
                                                as usize,
                                        );

                                        // Get the steam id from the path, if possible.
                                        let path_strip = path
                                            .strip_prefix(content_path)?
                                            .to_string_lossy()
                                            .replace("\\", "/");
                                        let path_strip_split =
                                            path_strip.split("/").collect::<Vec<_>>();
                                        if !path_strip_split.is_empty() {
                                            let steam_id = path_strip_split[0].to_owned();
                                            steam_ids.push(steam_id.to_owned());
                                            modd.set_steam_id(Some(steam_id));
                                        }

                                        self.mods_mut().insert(pack_name, modd);
                                    }
                                }
                            }
                        }

                        // Maps use their own logic.
                        for path in &maps {
                            let pack_name = path
                                .file_name()
                                .unwrap()
                                .to_string_lossy()
                                .as_ref()
                                .to_owned();
                            if let Some(extension) = path.extension() {
                                if extension == "bin" {
                                    let mut file = BufReader::new(File::open(path)?);
                                    let mut data = Vec::with_capacity(
                                        file.get_ref().metadata()?.len() as usize,
                                    );
                                    file.read_to_end(&mut data)?;

                                    let reader = BufReader::new(Cursor::new(data.to_vec()));
                                    let mut decompressor = flate2::read::ZlibDecoder::new(reader);
                                    let mut data_dec = vec![];

                                    // If they got decompressed correctly, we assume is a map. Shogun 2 64-bit update not only broke extracting the maps, but also
                                    // loading them from /maps. So instead we treat them like mods, and we generate their Pack once we get their Steam.
                                    if decompressor.read_to_end(&mut data_dec).is_ok() {
                                        match self.mods_mut().get_mut(&pack_name) {
                                            Some(modd) => {
                                                if !modd.paths().contains(path) {
                                                    modd.paths_mut().push(path.to_path_buf());
                                                }

                                                modd.set_pack_type(PFHFileType::Mod);

                                                let metadata =
                                                    modd.paths().last().unwrap().metadata()?;
                                                #[cfg(target_os = "windows")]
                                                modd.set_time_created(
                                                    metadata
                                                        .created()?
                                                        .duration_since(UNIX_EPOCH)?
                                                        .as_secs()
                                                        as usize,
                                                );
                                                modd.set_time_updated(
                                                    metadata
                                                        .modified()?
                                                        .duration_since(UNIX_EPOCH)?
                                                        .as_secs()
                                                        as usize,
                                                );

                                                // Get the steam id from the path, if possible.
                                                let path_strip = path
                                                    .strip_prefix(content_path)?
                                                    .to_string_lossy()
                                                    .replace("\\", "/");
                                                let path_strip_split =
                                                    path_strip.split("/").collect::<Vec<_>>();
                                                if !path_strip_split.is_empty() {
                                                    let steam_id = path_strip_split[0].to_owned();
                                                    steam_ids.push(steam_id.to_owned());
                                                    modd.set_steam_id(Some(steam_id));
                                                }
                                            }
                                            None => {
                                                let mut modd = Mod::default();
                                                modd.set_name(pack_name.to_owned());
                                                modd.set_id(pack_name.to_owned());
                                                modd.set_paths(vec![path.to_path_buf()]);
                                                modd.set_pack_type(PFHFileType::Mod);

                                                let metadata = modd.paths()[0].metadata()?;
                                                #[cfg(target_os = "windows")]
                                                modd.set_time_created(
                                                    metadata
                                                        .created()?
                                                        .duration_since(UNIX_EPOCH)?
                                                        .as_secs()
                                                        as usize,
                                                );
                                                modd.set_time_updated(
                                                    metadata
                                                        .modified()?
                                                        .duration_since(UNIX_EPOCH)?
                                                        .as_secs()
                                                        as usize,
                                                );

                                                // Get the steam id from the path, if possible.
                                                let path_strip = path
                                                    .strip_prefix(content_path)?
                                                    .to_string_lossy()
                                                    .replace("\\", "/");
                                                let path_strip_split =
                                                    path_strip.split("/").collect::<Vec<_>>();
                                                if !path_strip_split.is_empty() {
                                                    let steam_id = path_strip_split[0].to_owned();
                                                    steam_ids.push(steam_id.to_owned());
                                                    modd.set_steam_id(Some(steam_id));
                                                }

                                                self.mods_mut().insert(pack_name, modd);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Ignore network population errors for now.
                if !skip_network_update {
                    let sender = STORE_THREAD_COMMS.lock().unwrap().clone().unwrap();
                    let (tx_send, tx_recv) = channel(32);
                    let _ = sender.send((tx_send, app_handle.clone(), game.clone(), steam_ids.clone())).await;
                    receiver = Some(tx_recv);
                }

                // Then, if the game supports secondary mod path (only since Shogun 2) we check for mods in there. These have middle priority.
                //
                // Non supported games will simply return "None" here.
                if let Some(ref paths) = secondary_mods_paths {
                    let paths = paths
                        .iter()
                        .filter(|path| {
                            if let Ok(canon_path) = std::fs::canonicalize(path) {
                                !vanilla_packs.contains(&canon_path)
                                    && canon_path
                                        .file_name()
                                        .map(|x| x.to_string_lossy().to_string())
                                        .unwrap_or_else(String::new)
                                        != RESERVED_PACK_NAME
                                    && canon_path
                                        .file_name()
                                        .map(|x| x.to_string_lossy().to_string())
                                        .unwrap_or_else(String::new)
                                        != RESERVED_PACK_NAME_ALTERNATIVE
                            } else {
                                false
                            }
                        })
                        .collect::<Vec<_>>();

                    let packs = paths
                        .par_iter()
                        .map(|path| {
                            (
                                path,
                                Pack::read_and_merge(
                                    &[path.to_path_buf()],
                                    true,
                                    false,
                                    false,
                                    false,
                                ),
                            )
                        })
                        .collect::<Vec<_>>();

                    for (path, pack) in packs {
                        let pack_name = path
                            .file_name()
                            .unwrap()
                            .to_string_lossy()
                            .as_ref()
                            .to_owned();
                        if let Ok(pack) = pack {
                            if pack.pfh_file_type() == PFHFileType::Mod
                                || pack.pfh_file_type() == PFHFileType::Movie
                            {
                                match self.mods_mut().get_mut(&pack_name) {
                                    Some(modd) => {
                                        if !modd.paths().contains(path) {
                                            modd.paths_mut().insert(0, path.to_path_buf());
                                        }
                                        modd.set_pack_type(pack.pfh_file_type());

                                        let metadata = modd.paths()[0].metadata()?;
                                        #[cfg(target_os = "windows")]
                                        modd.set_time_created(
                                            metadata
                                                .created()?
                                                .duration_since(UNIX_EPOCH)?
                                                .as_secs()
                                                as usize,
                                        );
                                        modd.set_time_updated(
                                            metadata
                                                .modified()?
                                                .duration_since(UNIX_EPOCH)?
                                                .as_secs()
                                                as usize,
                                        );
                                    }
                                    None => {
                                        // If the mod fails to be found, is possible is a legacy mod. Find it by alt name.
                                        match self
                                            .mods_mut()
                                            .values_mut()
                                            .filter(|modd| modd.alt_name().is_some())
                                            .find(|modd| modd.alt_name().unwrap() == pack_name)
                                        {
                                            Some(modd) => {
                                                if !modd.paths().contains(path) {
                                                    modd.paths_mut().insert(0, path.to_path_buf());
                                                }
                                                modd.set_pack_type(pack.pfh_file_type());

                                                let metadata = modd.paths()[0].metadata()?;
                                                #[cfg(target_os = "windows")]
                                                modd.set_time_created(
                                                    metadata
                                                        .created()?
                                                        .duration_since(UNIX_EPOCH)?
                                                        .as_secs()
                                                        as usize,
                                                );
                                                modd.set_time_updated(
                                                    metadata
                                                        .modified()?
                                                        .duration_since(UNIX_EPOCH)?
                                                        .as_secs()
                                                        as usize,
                                                );
                                            }

                                            None => {
                                                let mut modd = Mod::default();
                                                modd.set_name(pack_name.to_owned());
                                                modd.set_id(pack_name.to_owned());
                                                modd.set_paths(vec![path.to_path_buf()]);
                                                modd.set_pack_type(pack.pfh_file_type());

                                                let metadata = modd.paths()[0].metadata()?;
                                                #[cfg(target_os = "windows")]
                                                modd.set_time_created(
                                                    metadata
                                                        .created()?
                                                        .duration_since(UNIX_EPOCH)?
                                                        .as_secs()
                                                        as usize,
                                                );
                                                modd.set_time_updated(
                                                    metadata
                                                        .modified()?
                                                        .duration_since(UNIX_EPOCH)?
                                                        .as_secs()
                                                        as usize,
                                                );

                                                self.mods_mut().insert(pack_name, modd);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Then finally we process /data packs. These have the highest priority.
                if let Some(ref paths) = data_paths {
                    let paths = paths
                        .iter()
                        .filter(|path| {
                            if let Ok(canon_path) = std::fs::canonicalize(path) {
                                let file_name = canon_path
                                    .file_name()
                                    .map(|x| x.to_string_lossy().to_string())
                                    .unwrap_or_else(String::new);
                                !vanilla_packs.contains(&canon_path)
                                    && file_name != RESERVED_PACK_NAME
                                    && file_name != RESERVED_PACK_NAME_ALTERNATIVE
                            } else {
                                false
                            }
                        })
                        .collect::<Vec<_>>();

                    let packs = paths
                        .par_iter()
                        .map(|path| {
                            (
                                path,
                                Pack::read_and_merge(
                                    &[path.to_path_buf()],
                                    true,
                                    false,
                                    false,
                                    false,
                                ),
                            )
                        })
                        .collect::<Vec<_>>();

                    for (path, pack) in packs {
                        let pack_name = path
                            .file_name()
                            .unwrap()
                            .to_string_lossy()
                            .as_ref()
                            .to_owned();
                        if let Ok(pack) = pack {
                            if pack.pfh_file_type() == PFHFileType::Mod
                                || pack.pfh_file_type() == PFHFileType::Movie
                            {
                                // These are not cannonicalized by default.
                                let path = std::fs::canonicalize(path)?;

                                // Check if the pack corresponds to a bin.
                                if let Some((_, modd)) =
                                    self.mods_mut().iter_mut().find(|(_, modd)| {
                                        !modd.file_name().is_empty()
                                            && modd.file_name().split('/').last().unwrap()
                                                == pack_name
                                    })
                                {
                                    if !modd.paths().contains(&path) {
                                        modd.paths_mut().insert(0, path.to_path_buf());
                                    }

                                    let metadata = modd.paths()[0].metadata()?;
                                    #[cfg(target_os = "windows")]
                                    modd.set_time_created(
                                        metadata.created()?.duration_since(UNIX_EPOCH)?.as_secs()
                                            as usize,
                                    );
                                    modd.set_time_updated(
                                        metadata.modified()?.duration_since(UNIX_EPOCH)?.as_secs()
                                            as usize,
                                    );
                                } else {
                                    match self.mods_mut().get_mut(&pack_name) {
                                        Some(modd) => {
                                            if !modd.paths().contains(&path) {
                                                modd.paths_mut().insert(0, path.to_path_buf());
                                            }
                                            modd.set_pack_type(pack.pfh_file_type());

                                            let metadata = modd.paths()[0].metadata()?;
                                            #[cfg(target_os = "windows")]
                                            modd.set_time_created(
                                                metadata
                                                    .created()?
                                                    .duration_since(UNIX_EPOCH)?
                                                    .as_secs()
                                                    as usize,
                                            );
                                            modd.set_time_updated(
                                                metadata
                                                    .modified()?
                                                    .duration_since(UNIX_EPOCH)?
                                                    .as_secs()
                                                    as usize,
                                            );
                                        }

                                        // Same as with secondaries for legacy mods.
                                        None => {
                                            match self
                                                .mods_mut()
                                                .values_mut()
                                                .filter(|modd| modd.alt_name().is_some())
                                                .find(|modd| modd.alt_name().unwrap() == pack_name)
                                            {
                                                Some(modd) => {
                                                    if !modd.paths().contains(&path) {
                                                        modd.paths_mut()
                                                            .insert(0, path.to_path_buf());
                                                    }
                                                    modd.set_pack_type(pack.pfh_file_type());

                                                    let metadata = modd.paths()[0].metadata()?;
                                                    #[cfg(target_os = "windows")]
                                                    modd.set_time_created(
                                                        metadata
                                                            .created()?
                                                            .duration_since(UNIX_EPOCH)?
                                                            .as_secs()
                                                            as usize,
                                                    );
                                                    modd.set_time_updated(
                                                        metadata
                                                            .modified()?
                                                            .duration_since(UNIX_EPOCH)?
                                                            .as_secs()
                                                            as usize,
                                                    );
                                                }

                                                None => {
                                                    let mut modd = Mod::default();
                                                    modd.set_name(pack_name.to_owned());
                                                    modd.set_id(pack_name.to_owned());
                                                    modd.set_paths(vec![path.to_path_buf()]);
                                                    modd.set_pack_type(pack.pfh_file_type());

                                                    let metadata = modd.paths()[0].metadata()?;
                                                    #[cfg(target_os = "windows")]
                                                    modd.set_time_created(
                                                        metadata
                                                            .created()?
                                                            .duration_since(UNIX_EPOCH)?
                                                            .as_secs()
                                                            as usize,
                                                    );
                                                    modd.set_time_updated(
                                                        metadata
                                                            .modified()?
                                                            .duration_since(UNIX_EPOCH)?
                                                            .as_secs()
                                                            as usize,
                                                    );

                                                    self.mods_mut().insert(pack_name, modd);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Update the categories list to remove any mod that has no path, and add any new mod to the default category.
        for mods in self.categories.values_mut() {
            mods.retain(|mod_id| match self.mods.get(mod_id) {
                Some(modd) => !modd.paths().is_empty(),
                None => false,
            });
        }

        let mut mods_to_add = vec![];
        for modd in self.mods.values() {
            if !modd.paths().is_empty()
                && self
                    .categories()
                    .iter()
                    .all(|(_, mods)| !mods.contains(modd.id()))
            {
                mods_to_add.push(modd.id().to_owned());
            }
        }

        match self.categories_mut().get_mut(DEFAULT_CATEGORY) {
            Some(mods) => mods.append(&mut mods_to_add),
            None => {
                self.categories_mut()
                    .insert(DEFAULT_CATEGORY.to_owned(), mods_to_add);
            }
        }

        // If we got a default category, make sure it's always at the end.
        if let Some(cat) = self.categories_order().last() {
            if cat != DEFAULT_CATEGORY && self.categories().get(DEFAULT_CATEGORY).is_some() {
                if let Some(mods) = self.categories_mut().remove(DEFAULT_CATEGORY) {
                    self.categories_mut()
                        .insert(DEFAULT_CATEGORY.to_owned(), mods);
                }
            }
        }

        // Update the current load order to reflect any change related to mods no longer being installed or being added as new.
        let game_data_path = game.data_path(game_path)?;
        load_order.update(app_handle, self, game, &game_data_path);
        load_order.save(app_handle, game)?;

        // Save the GameConfig or we may lost the population.
        self.save(app_handle, game)?;

        Ok(receiver)
    }

    pub async fn update_mod_list_with_online_data(&mut self, mut tx_recv: Receiver<Result<Vec<Mod>>>, app: &tauri::AppHandle) -> Result<()> {
        let response = tx_recv.recv().await.unwrap();
        match response {
            Ok(workshop_items) => {
                        
                let game = GAME_SELECTED.read().unwrap().clone();
                let game_path = SETTINGS.read().unwrap().game_path(&game)?;
                
                if populate_mods_with_online_data(app, self.mods_mut(), &workshop_items).is_ok() {
                    
                    // Shogun 2 uses two types of mods:
                    // - Pack mods turned binary: they're pack mods with a few extra bytes at the beginning. RPFM lib is capable to open them, save them as Packs, then do one of these:
                    //   - If the mod pack is in /data, we copy it there.
                    //   - If the mod pack is not /data and we have a secondary folder configured, we copy it there.
                    //   - If the mod pack is not /data and we don't have a secondary folder configured, we copy it to /data.
                    // - Map mods. These are zlib-compressed lists of files. Their encoding turned to be quite simple:
                    //   - Null-terminated StringU16: File name.
                    //   - u64: File data size.
                    //   - [u8; size]: File data.
                    //   - Then at the end there is an u32 with a 0A that we ignore.
                    //
                    // Other games may also use the first type, but most modern uploads are normal Packs.
                    //
                    // So, once population is done, we need to do some post-processing. Our mods need to be moved to either /data or /secondary if we don't have them there.
                    // Shogun 2 mods need to be turned into packs and moved to either /data or /secondary.
                    let steam_user_id = crate::mod_manager::integrations::store_user_id(app, &game)?.to_string();
                    let secondary_path = secondary_mods_path(app, game.key()).ok();
                    let game_data_path = game.data_path(&game_path);
                    
                    for modd in self.mods_mut().values_mut() {
                        if let Some(last_path) = modd.paths().last() {
                            
                            // Only copy bins which are not yet in the destination folder and which are not made by the steam user.
                            let legacy_mod = modd.id().ends_with(".bin") && !modd.file_name().is_empty();
                            if legacy_mod && modd.file_name().ends_with(".pack"){
                                
                                // This is for Packs. Map mods use a different process.
                                if let Ok(mut pack) = Pack::read_and_merge(&[last_path.to_path_buf()], true, false, false, false) {
                                    if let Ok(ref data_path) = game_data_path {
                                        
                                        let mod_name = if legacy_mod {
                                            if let Some(name) = modd.file_name().split('/').last() {
                                                name.to_string()
                                            } else {
                                                modd.id().to_string()
                                            }
                                        } else {
                                            modd.id().to_string()
                                        };
                                        
                                        let _ = move_to_destination(data_path, &secondary_path, &steam_user_id, &game, modd, &mod_name, &mut pack, false);
                                    }
                                }
                            }
                            
                            // If it's not a pack, but is reported as a legacy mod, is a map mod from Shogun 2.
                            else if legacy_mod && game.key() == KEY_SHOGUN_2 {
                                if let Some(name) = modd.file_name().clone().split('/').last() {
                                    
                                    // Maps only contain a folder name. We need to change it into a pack name.
                                    let name = name.replace(" ", "_");
                                    let pack_name = name.to_owned() + ".pack";
                                    
                                    if let Ok(ref data_path) = game_data_path {
                                        if let Ok(file) = File::open(last_path) {
                                            let mut file = BufReader::new(file);
                                            if let Ok(metadata) = file.get_ref().metadata() {
                                                let mut data = Vec::with_capacity(metadata.len() as usize);
                                                if file.read_to_end(&mut data).is_ok() {
                                                    
                                                    let reader = BufReader::new(Cursor::new(data.to_vec()));
                                                    let mut decompressor = ZlibDecoder::new(reader);
                                                    let mut data_dec = vec![];
                                                    
                                                    if decompressor.read_to_end(&mut data_dec).is_ok() {
                                                        let mut pack = generate_map_pack(&game, &data_dec, &pack_name, &name)?;
                                                        
                                                        // Once done generating the pack, just do the same as with normal mods.
                                                        let _ = move_to_destination(data_path, &secondary_path, &steam_user_id, &game, modd, &pack_name, &mut pack, false);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // Before continuing, we need to do some cleaning. There's a chance that due to the order of operations done to populate the mod list
                    // Some legacy packs get split into two distinct mods. We need to detect them and clean them up here.
                    let alt_names = self.mods()
                        .par_iter()
                        .filter_map(|(_, modd)| modd.alt_name())
                        .collect::<Vec<_>>();
                    
                    for alt_name in &alt_names {
                        self.mods_mut().remove(alt_name);
                        self.categories_mut().iter_mut().for_each(|(_, mods)| {
                            mods.retain(|modd| modd != alt_name);
                        });
                    }
                    
                    self.save(app, &game)?;
                }
            },
            Err(error) => return Err(anyhow!("Failed to get data from store: {}", error)),
        }

        Ok(())
    }
}
