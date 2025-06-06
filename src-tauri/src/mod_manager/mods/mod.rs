//---------------------------------------------------------------------------//
// Copyright (c) 2017-2024 Ismael Gutiérrez González. All rights reserved.
//
// This file is part of the Rusted Launcher (Runcher) project,
// which can be found here: https://github.com/Frodo45127/runcher.
//
// This file is licensed under the MIT license, which can be found here:
// https://github.com/Frodo45127/runcher/blob/master/LICENSE.
//---------------------------------------------------------------------------//

use anyhow::Result;
use getset::*;
use serde::{Deserialize, Serialize};
use sha256::try_digest;

use std::path::{Path, PathBuf};

use rpfm_lib::games::{
    GameInfo,
    pfh_file_type::PFHFileType,
    supported_games::{KEY_ATTILA, KEY_ROME_2, KEY_THRONES_OF_BRITANNIA},
};
use rpfm_lib::utils::{path_to_absolute_path, path_to_absolute_string};

use super::integrations::StoreId;

//pub mod versions;

//-------------------------------------------------------------------------------//
//                              Enums & Structs
//-------------------------------------------------------------------------------//

#[derive(Clone, Debug, Default, Getters, MutGetters, Setters, Serialize, Deserialize)]
#[getset(get = "pub", get_mut = "pub", set = "pub")]
pub struct Mod {
    /// Visual name of the mod. Title if the mod is from the workshop.
    name: String,

    /// Pack name of the mod.
    id: String,

    /// Store id of this mod. May be None if the mod is not uploaded to any store.
    store_id: StoreId,

    /// If the mod is enabled or not.
    #[getset(skip)]
    enabled: bool,

    /// Pack Type of the mod. If there are multiple paths, this corresponds to the first path.
    pack_type: PFHFileType,

    /// Multiple paths in case it's both in data and in a secondary folder. /data always takes priority, then /secondary, then content.
    paths: Vec<PathBuf>,

    /// Numeric Id of the creator/owner of the mod.
    creator: String,

    /// Nick of the creator/owner of the mod.
    creator_name: String,

    /// File name. If present, it's the name we need to give to the file when converting from bin to pack.
    ///
    /// Only present in old games for .bin files. Used as name when moving a .bin file to /data.
    ///
    /// Note that Shogun 2 maps contain here the folder where they should go. CA broke maps loading from a folder, so we convert them to packs.
    /// The pack name is always the folder name, replacing whitespaces with underscores and putting .pack at the end.
    file_name: String,

    /// Size of the file in bytes.
    file_size: u64,

    /// Description of the mod in the workshop.
    description: String,

    /// Time the mod was either created on the workshop, or on the filesystem for local mods.
    time_created: usize,

    /// Time the mod was last updated on the workshop.
    time_updated: usize,
}

#[derive(Clone, Debug, Default, Getters, MutGetters, Setters, Serialize, Deserialize)]
#[getset(get = "pub", get_mut = "pub", set = "pub")]
pub struct ShareableMod {
    name: String,
    id: String,
    store_id: StoreId,
    hash: String,
}

//-------------------------------------------------------------------------------//
//                             Implementations
//-------------------------------------------------------------------------------//

impl From<&Mod> for ShareableMod {
    fn from(value: &Mod) -> Self {
        let hash = try_digest(value.paths()[0].as_path()).unwrap();
        Self {
            name: value.name().to_owned(),
            id: value.id().to_owned(),
            store_id: value.store_id().to_owned(),
            hash,
        }
    }
}

impl Mod {
    /// Returns if the mod is outdated or not. Requires the date of the last update of the game.
    pub fn outdated(&self, game_last_update_date: u64) -> bool {
        game_last_update_date > *self.time_updated() as u64
    }

    pub fn location(
        &self,
        data_path: &str,
        secondary_path: &str,
        content_path: &str,
    ) -> (bool, bool, StoreId) {
        // Shortcut for mods with no paths.
        if self.paths().is_empty() {
            return (false, false, StoreId::None);
        }

        let mut data = false;
        let mut secondary = false;
        let mut content = StoreId::None;

        for path in self.paths() {
            let path = path_to_absolute_string(path);
            if path.starts_with(data_path) {
                data = true;
            } else if !secondary_path.is_empty() && path.starts_with(secondary_path) {
                secondary = true;
            } else if !content_path.is_empty() && path.starts_with(content_path) {
                content = self.store_id.clone();
            }
        }

        (data, secondary, content)
    }

    pub fn priority_dating_flags(
        &self,
        data_path: &str,
        secondary_path: &str,
        content_path: &str,
    ) -> Result<(bool, bool, bool)> {
        // Shortcut for mods only in one place.
        if self.paths().len() == 1 {
            return Ok((false, false, false));
        }

        let mut data_older_than_secondary = false;
        let mut data_older_than_content = false;
        let mut secondary_older_than_content = false;

        let paths = self
            .paths()
            .iter()
            .map(|x| path_to_absolute_string(x))
            .collect::<Vec<_>>();

        if paths.len() == 2 {
            let date_0 = PathBuf::from(&paths[0]).metadata()?.modified()?;
            let date_1 = PathBuf::from(&paths[1]).metadata()?.modified()?;

            if date_1 > date_0 {
                if paths[0].starts_with(data_path) {
                    if !secondary_path.is_empty() && paths[1].starts_with(secondary_path) {
                        data_older_than_secondary = true;
                    } else if !content_path.is_empty() && paths[1].starts_with(content_path) {
                        data_older_than_content = true;
                    }
                } else if !secondary_path.is_empty() && paths[0].starts_with(secondary_path) {
                    secondary_older_than_content = true;
                }
            }
        }

        if paths.len() == 3 {
            let date_0 = PathBuf::from(&paths[0]).metadata()?.modified()?;
            let date_1 = PathBuf::from(&paths[1]).metadata()?.modified()?;
            let date_2 = PathBuf::from(&paths[2]).metadata()?.modified()?;

            if date_1 > date_0 {
                data_older_than_secondary = true;
            }

            if date_2 > date_0 {
                data_older_than_content = true;
            }

            if date_2 > date_1 {
                secondary_older_than_content = true;
            }
        }

        Ok((
            data_older_than_secondary,
            data_older_than_content,
            secondary_older_than_content,
        ))
    }

    /// Returns if the mod is enabled or not.
    pub fn enabled(&self, game: &GameInfo, data_path: &Path) -> bool {
        let data_path = path_to_absolute_path(data_path, false);

        // For mod packs we just return it.
        // For movie packs in Warhammer I and newer games, just return it.
        // For movie packs in older games:
        // - If it's in /data it's always enabled.
        // - If it's in /secondary or /content, we respect the bool.
        if self.pack_type == PFHFileType::Mod {
            self.enabled
        } else if self.pack_type == PFHFileType::Movie {
            if *game.raw_db_version() >= 2
                && (game.key() != KEY_ROME_2
                    && game.key() != KEY_ATTILA
                    && game.key() != KEY_THRONES_OF_BRITANNIA)
            {
                self.enabled
            } else if let Some(path) = self.paths().first() {
                if path.starts_with(&data_path) {
                    true
                } else {
                    self.enabled
                }
            }
            // If no path is found, this is not a mod we have in use.
            else {
                false
            }
        } else {
            false
        }
    }

    // TODO: add some control here so you can't set enabled to false on older movies.
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    pub fn can_be_toggled(&self, game: &GameInfo, data_path: &Path) -> bool {
        let data_path = path_to_absolute_path(data_path, false);

        // Same checks as in the "enabled" function.
        if self.pack_type == PFHFileType::Mod {
            true
        } else if self.pack_type == PFHFileType::Movie {
            if *game.raw_db_version() >= 2
                && (game.key() != KEY_ROME_2
                    && game.key() != KEY_ATTILA
                    && game.key() != KEY_THRONES_OF_BRITANNIA)
            {
                true
            } else if let Some(path) = self.paths().first() {
                !path.starts_with(&data_path)
            } else {
                false
            }
        } else {
            false
        }
    }

    /// Function to get the alternative name for Shogun 2 map binaries.
    pub fn alt_name(&self) -> Option<String> {
        if !self.file_name().is_empty() && !self.file_name().ends_with(".pack") {
            Some(self.file_name().split('/').last()?.replace(" ", "_") + ".pack")
        } else {
            None
        }
    }
}
