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
//!
//! Here are also generic functions for mod managing.

use anyhow::{Result, anyhow};
use regex::Regex;

use std::cell::LazyCell;
use std::collections::HashMap;
use std::fs::DirBuilder;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use rpfm_lib::binary::ReadBytes;
use rpfm_lib::files::{
    Container, FileType, RFile, RFileDecoded, db::DB, loc::Loc, pack::Pack, table::DecodedData,
};
use rpfm_lib::games::{GameInfo, pfh_file_type::PFHFileType, supported_games::SupportedGames};
use rpfm_lib::utils::{files_from_subdir, path_to_absolute_path, path_to_absolute_string};

use crate::SCHEMA;
use crate::settings::AppSettings;

use self::game_config::GameConfig;
use self::mods::Mod;

pub mod game_config;
pub mod integrations;
pub mod load_order;
pub mod mods;
pub mod profiles;
pub mod saves;

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

pub const SECONDARY_FOLDER_NAME: &str = "masks";

pub fn copy_to_secondary(
    app_handle: &tauri::AppHandle,
    game: &GameInfo,
    game_config: &GameConfig,
    mod_ids: &[String],
) -> Result<Vec<String>> {
    let mut mods_failed = vec![];

    let settings = AppSettings::load(app_handle)?;
    let game_path = settings.game_path(game)?;
    let secondary_path = secondary_mods_path(app_handle, game.key())?;
    let content_path = path_to_absolute_path(&game.content_path(&game_path)?, true);
    let secondary_path_str = path_to_absolute_string(&secondary_path);
    let content_path_str = path_to_absolute_string(&content_path);

    for mod_id in mod_ids {
        if let Some(modd) = game_config.mods().get(mod_id) {
            // Apply only to mods on content, or both on content and secondary.
            if modd.paths().len() <= 2 {
                let decannon_paths = modd
                    .paths()
                    .iter()
                    .map(|path| path_to_absolute_string(path))
                    .collect::<Vec<_>>();

                // If there's only one path, check if it's in content.
                if decannon_paths.len() == 1 && decannon_paths[0].starts_with(&content_path_str) {
                    let new_path = secondary_path.join(modd.paths()[0].file_name().unwrap());
                    if std::fs::copy(&modd.paths()[0], new_path).is_err() {
                        mods_failed.push(modd.id().to_string());
                    }
                    // Copy the png too.
                    else {
                        let mut old_image_path = PathBuf::from(&decannon_paths[0]);
                        old_image_path.set_extension("png");

                        let mut new_image_path =
                            secondary_path.join(modd.paths()[0].file_name().unwrap());
                        new_image_path.set_extension("png");

                        let _ = std::fs::copy(&old_image_path, &new_image_path);
                    }
                }
                // If it's a file in content and secondary, allow to copy it to update the secondary one.
                else if decannon_paths.len() == 2
                    && decannon_paths[0].starts_with(&secondary_path_str)
                    && decannon_paths[1].starts_with(&content_path_str)
                {
                    if std::fs::copy(&modd.paths()[1], &modd.paths()[0]).is_err() {
                        mods_failed.push(modd.id().to_string());
                    }
                    // Copy the png too.
                    else {
                        let mut old_image_path = PathBuf::from(&decannon_paths[1]);
                        old_image_path.set_extension("png");

                        let mut new_image_path = PathBuf::from(&decannon_paths[0]);
                        new_image_path.set_extension("png");

                        let _ = std::fs::copy(&old_image_path, &new_image_path);
                    }
                }
                // Any other case is not supported.
                else {
                    mods_failed.push(modd.id().to_string());
                }
            }
        }
    }

    Ok(mods_failed)
}

pub fn move_to_secondary(
    app_handle: &tauri::AppHandle,
    game: &GameInfo,
    game_config: &GameConfig,
    mod_ids: &[String],
) -> Result<Vec<String>> {
    let mut mods_failed = vec![];

    let settings = AppSettings::load(app_handle)?;
    let game_path = settings.game_path(game)?;
    let secondary_path = settings.secondary_mods_path()?;
    let data_path = game.data_path(&game_path)?;
    let data_path_str = path_to_absolute_string(&data_path);

    for mod_id in mod_ids {
        if let Some(modd) = game_config.mods().get(mod_id) {
            // Apply only to mods on content, or both on content and secondary.
            let decannon_paths = modd
                .paths()
                .iter()
                .map(|path| path_to_absolute_string(path))
                .collect::<Vec<_>>();

            // If the first path is /data, proceed. If not, we cannot move this mod.
            if decannon_paths[0].starts_with(&data_path_str) {
                let new_path = secondary_path.join(modd.paths()[0].file_name().unwrap());
                if std::fs::copy(&modd.paths()[0], new_path).is_err() {
                    mods_failed.push(modd.id().to_string());
                }
                // Move the png too, and delete the originals if it worked.
                else {
                    let mut old_image_path = PathBuf::from(&decannon_paths[0]);
                    old_image_path.set_extension("png");

                    let mut new_image_path =
                        secondary_path.join(modd.paths()[0].file_name().unwrap());
                    new_image_path.set_extension("png");

                    if std::fs::copy(&old_image_path, &new_image_path).is_ok() {
                        let _ = std::fs::remove_file(&modd.paths()[0]);
                        let _ = std::fs::remove_file(&old_image_path);
                    }
                }
            }
            // Any other case is not supported.
            else {
                mods_failed.push(modd.id().to_string());
            }
        }
    }

    Ok(mods_failed)
}

/// Function to move files from /content to /secondary, or /data.
fn move_to_destination(
    data_path: &Path,
    secondary_path: &Option<PathBuf>,
    steam_user_id: &str,
    game: &GameInfo,
    modd: &mut Mod,
    mod_name: &str,
    pack: &mut Pack,
    new_pack_type: bool,
) -> Result<()> {
    // Sometimes they come canonicalized, sometimes dont. This kinda fixes it.
    let new_path_in_data = data_path.join(mod_name);
    let new_path_in_data =
        std::fs::canonicalize(new_path_in_data.clone()).unwrap_or(new_path_in_data);
    let mut in_secondary = false;

    // First try to move it to secondary if it's not in /data. Only if it's not in /data already.
    if let Some(ref secondary_path) = &secondary_path {
        if !new_path_in_data.is_file() {
            let new_path_in_secondary = secondary_path.join(mod_name);

            // Copy the files unless it exists and its ours.
            if (!new_path_in_secondary.is_file()
                || (new_path_in_secondary.is_file() && steam_user_id != modd.creator()))
                && pack.save(Some(&new_path_in_secondary), game, &None).is_ok()
            {
                if !modd.paths().contains(&new_path_in_secondary) {
                    modd.paths_mut().insert(0, new_path_in_secondary);
                }

                if new_pack_type {
                    modd.set_pack_type(pack.pfh_file_type());
                }

                in_secondary = true;
            }
        }
    }

    // If the move to secondary failed, try to do the same with /data.
    if !in_secondary {
        // Copy the files unless it exists and its ours.
        if (!new_path_in_data.is_file()
            || (new_path_in_data.is_file() && steam_user_id != modd.creator()))
            && pack.save(Some(&new_path_in_data), game, &None).is_ok()
        {
            if !modd.paths().contains(&new_path_in_data) {
                modd.paths_mut().insert(0, new_path_in_data);
            }

            if new_pack_type {
                modd.set_pack_type(pack.pfh_file_type());
            }
        }
    }

    Ok(())
}

pub fn secondary_mods_path(app_handle: &tauri::AppHandle, game: &str) -> Result<PathBuf> {
    match SupportedGames::default().game(game) {
        Some(game_info) => {
            if game_info.raw_db_version() < &1 {
                return Err(anyhow!(
                    "This game ({}) doesn't support secondary mod folders.",
                    game
                ));
            }
        }
        None => return Err(anyhow!("What kind of game is {}?", game)),
    }

    let settings = AppSettings::load(app_handle)?;
    let base_path = settings.secondary_mods_path()?;
    let base_path_str = path_to_absolute_string(&base_path);
    if base_path_str.is_empty() {
        return Err(anyhow!("Secondary Mods Path not set."));
    }

    // Canonicalization is required due to some issues with the game not loading not properly formatted paths.
    let path = std::fs::canonicalize(PathBuf::from(base_path_str))?;
    let game_path = path.join(game);

    if !path.is_dir() {
        DirBuilder::new().recursive(true).create(&path)?;
    }

    if !game_path.is_dir() {
        DirBuilder::new().recursive(true).create(&game_path)?;
    }

    Ok(game_path)
}

pub fn secondary_mods_packs_paths(
    app_handle: &tauri::AppHandle,
    game: &str,
) -> Option<Vec<PathBuf>> {
    let path = secondary_mods_path(app_handle, game).ok()?;
    let mut paths = vec![];

    for path in files_from_subdir(&path, false).ok()?.iter() {
        match path.extension() {
            Some(extension) => {
                if extension == "pack" || extension == "bin" {
                    paths.push(path.to_path_buf());
                }
            }
            None => continue,
        }
    }

    paths.sort();

    Some(paths)
}

/// Function to generate a pack from a Shogun 2 map bin data.
fn generate_map_pack(
    game: &GameInfo,
    data_dec: &[u8],
    pack_name: &str,
    map_name: &str,
) -> Result<Pack> {
    // Get all the files into memory to generate its pack.
    let mut files = HashMap::new();
    let mut data_dec = Cursor::new(data_dec);
    loop {
        // At the end of the last file there's a 0A 00 00 00 that doesn't seem to be part of a file.
        let len = data_dec.len()?;
        if len < 4 || data_dec.position() >= len - 4 {
            break;
        }

        let file_name = data_dec.read_string_u16_0terminated()?;
        let size = data_dec.read_u64()?;
        let data = data_dec.read_slice(size as usize, false)?;

        files.insert(file_name, data);
    }

    let mut pack =
        Pack::new_with_name_and_version(pack_name, game.pfh_version_by_file_type(PFHFileType::Mod));
    let spec_path = format!("battleterrain/presets/{}/", &map_name);

    // We need to add the files under /BattleTerrain/presets/map_name
    for (file_name, file_data) in &files {
        let rfile_path = spec_path.to_owned() + file_name;
        let mut rfile = RFile::new_from_vec(file_data, FileType::Unknown, 0, &rfile_path);
        let _ = rfile.guess_file_type();
        let _ = pack.insert(rfile);
    }

    // We also need to generate a battles table for our mod, so it shows up ingame, and a loc table, so it has a name ingame.
    //
    // The data for all of this needs to be parsed from the map_info.xml file.
    if let Some(map_info) = files.get("map_info.xml") {
        if let Ok(map_info) = String::from_utf8(map_info.to_vec()) {
            if let Some(ref schema) = *SCHEMA.read().unwrap() {
                let table_name = "battles_tables";
                let table_version = 4;
                if let Some(definition) =
                    schema.definition_by_name_and_version(table_name, table_version)
                {
                    // DB
                    let patches = schema.patches_for_table(table_name);
                    let mut file = DB::new(definition, patches, table_name);
                    let mut row = file.new_row();

                    if let Some(column) = file.column_position_by_name("key") {
                        if let Some(DecodedData::StringU16(key)) = row.get_mut(column) {
                            *key = map_name.to_string();
                        }
                    }

                    if let Some(column) = file.column_position_by_name("type") {
                        if let Some(DecodedData::StringU16(battle_type)) = row.get_mut(column) {
                            if let Some(battle_type_xml) = REGEX_MAP_INFO_TYPE.captures(&map_info) {
                                if let Some(battle_type_xml) = battle_type_xml.get(1) {
                                    if battle_type_xml.as_str() == "land" {
                                        *battle_type = "classic".to_string();
                                    } else {
                                        *battle_type = battle_type_xml.as_str().to_string();
                                    }
                                }
                            }
                        }
                    }

                    if let Some(column) = file.column_position_by_name("specification") {
                        if let Some(DecodedData::StringU16(specification_path)) =
                            row.get_mut(column)
                        {
                            *specification_path = spec_path.to_owned();
                        }
                    }

                    if let Some(column) = file.column_position_by_name("screenshot_path") {
                        if let Some(DecodedData::OptionalStringU16(screenshot_path)) =
                            row.get_mut(column)
                        {
                            *screenshot_path = spec_path + "icon.tga";
                        }
                    }

                    if let Some(column) = file.column_position_by_name("team_size_1") {
                        if let Some(DecodedData::I32(team_size_1)) = row.get_mut(column) {
                            if let Some(team_size_1_xml) =
                                REGEX_MAP_INFO_TEAM_SIZE_1.captures(&map_info)
                            {
                                if let Some(team_size_1_xml) = team_size_1_xml.get(1) {
                                    if let Ok(team_size_1_xml) =
                                        team_size_1_xml.as_str().parse::<i32>()
                                    {
                                        *team_size_1 = team_size_1_xml;
                                    }
                                }
                            }
                        }
                    }

                    if let Some(column) = file.column_position_by_name("team_size_2") {
                        if let Some(DecodedData::I32(team_size_2)) = row.get_mut(column) {
                            if let Some(team_size_2_xml) =
                                REGEX_MAP_INFO_TEAM_SIZE_2.captures(&map_info)
                            {
                                if let Some(team_size_2_xml) = team_size_2_xml.get(1) {
                                    if let Ok(team_size_2_xml) =
                                        team_size_2_xml.as_str().parse::<i32>()
                                    {
                                        *team_size_2 = team_size_2_xml;
                                    }
                                }
                            }
                        }
                    }

                    if let Some(column) = file.column_position_by_name("release") {
                        if let Some(DecodedData::Boolean(value)) = row.get_mut(column) {
                            *value = true;
                        }
                    }

                    if let Some(column) = file.column_position_by_name("multiplayer") {
                        if let Some(DecodedData::Boolean(value)) = row.get_mut(column) {
                            *value = true;
                        }
                    }

                    if let Some(column) = file.column_position_by_name("singleplayer") {
                        if let Some(DecodedData::Boolean(value)) = row.get_mut(column) {
                            *value = true;
                        }
                    }

                    if let Some(column) = file.column_position_by_name("defender_funds_ratio") {
                        if let Some(DecodedData::F32(funds_ratio)) = row.get_mut(column) {
                            if let Some(funds_ratio_xml) =
                                REGEX_MAP_INFO_DEFENDER_FUNDS_RATIO.captures(&map_info)
                            {
                                if let Some(funds_ratio_xml) = funds_ratio_xml.get(1) {
                                    if let Ok(funds_ratio_xml) =
                                        funds_ratio_xml.as_str().parse::<f32>()
                                    {
                                        *funds_ratio = funds_ratio_xml;
                                    }
                                }
                            }
                        }
                    }

                    if let Some(column) = file.column_position_by_name("has_key_buildings") {
                        if let Some(DecodedData::Boolean(value)) = row.get_mut(column) {
                            if let Some(has_key_buildings_xml) =
                                REGEX_MAP_INFO_HAS_KEY_BUILDINGS.captures(&map_info)
                            {
                                if let Some(has_key_buildings_xml) = has_key_buildings_xml.get(1) {
                                    if let Ok(has_key_buildings_xml) =
                                        has_key_buildings_xml.as_str().parse::<bool>()
                                    {
                                        *value = has_key_buildings_xml;
                                    }
                                }
                            }
                        }
                    }

                    if let Some(column) = file.column_position_by_name("matchmaking") {
                        if let Some(DecodedData::Boolean(value)) = row.get_mut(column) {
                            *value = true;
                        }
                    }

                    file.data_mut().push(row);
                    let rfile_decoded = RFileDecoded::DB(file);
                    let rfile_path = format!("db/battles_tables/{}", map_name);
                    let rfile = RFile::new_from_decoded(&rfile_decoded, 0, &rfile_path);
                    let _ = pack.insert(rfile);

                    // Loc
                    let mut file = Loc::new();

                    if let Some(display_name) = REGEX_MAP_INFO_DISPLAY_NAME.captures(&map_info) {
                        if let Some(display_name) = display_name.get(1) {
                            let mut row = file.new_row();

                            row[0] = DecodedData::StringU16(format!(
                                "battles_localised_name_{}",
                                map_name
                            ));
                            row[1] = DecodedData::StringU16(display_name.as_str().to_string());

                            file.data_mut().push(row);
                        }
                    }

                    if let Some(description) = REGEX_MAP_INFO_DESCRIPTION.captures(&map_info) {
                        if let Some(description) = description.get(1) {
                            let mut row = file.new_row();

                            row[0] =
                                DecodedData::StringU16(format!("battles_description_{}", map_name));
                            row[1] = DecodedData::StringU16(description.as_str().to_string());

                            file.data_mut().push(row);
                        }
                    }

                    let rfile_decoded = RFileDecoded::Loc(file);
                    let rfile_path = format!("text/db/{}.loc", map_name);
                    let rfile = RFile::new_from_decoded(&rfile_decoded, 0, &rfile_path);
                    let _ = pack.insert(rfile);
                }
            }
        }
    }

    Ok(pack)
}
