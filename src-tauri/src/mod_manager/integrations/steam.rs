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
use base64::prelude::*;
use interprocess::local_socket::{GenericNamespaced, ListenerOptions, prelude::*};
use regex::Regex;
use serde::Deserialize;
use steam_workshop_api::{client::Workshop, interfaces::i_steam_user::*};
use tauri::AppHandle;

use std::cell::LazyCell;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufWriter, Read, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use rpfm_lib::files::{EncodeableExtraData, pack::Pack};
use rpfm_lib::games::GameInfo;
use rpfm_lib::utils::path_to_absolute_string;

use crate::SETTINGS;
use crate::mod_manager::mods::Mod;
use crate::settings::config_path;

#[cfg(target_os = "windows")]
use super::{CREATE_NEW_CONSOLE, CREATE_NO_WINDOW, DETACHED_PROCESS};
use super::{Integration, RemoteMetadata, PublishedFileVisibilityDerive};

#[cfg(any(target_os = "linux", target_os = "macos"))]
use std::os::unix::fs::PermissionsExt;

const REGEX_URL: LazyCell<Regex> =
    LazyCell::new(|| Regex::new(r"(\[url=)(.*)(\])(.*)(\[/url\])").unwrap());
const WORKSHOPPER_PATH: LazyCell<String> = LazyCell::new(|| {
    if cfg!(debug_assertions) {
        format!("./target/debug/{}", WORKSHOPPER_EXE)
    } else {
        WORKSHOPPER_EXE.to_string()
    }
});

#[cfg(target_os = "windows")] const STEAM_PROCESS_NAME: &str = "steam.exe";
#[cfg(target_os = "windows")] const WORKSHOPPER_EXE: &str = "workshopper.exe";
#[cfg(target_os = "windows")] const SCRIPT_UPLOAD_TO_WORKSHOP: &str = "upload-to-workshop.bat";
#[cfg(target_os = "windows")] const SCRIPT_GET_PUBLISHED_FILE_DETAILS: &str = "get-published-file-details.bat";
#[cfg(target_os = "windows")] const SCRIPT_GET_USER_ID: &str = "get-user-id.bat";
#[cfg(target_os = "windows")] const SCRIPT_LAUNCH_GAME: &str = "launch-game.bat";

#[cfg(any(target_os = "linux", target_os = "macos"))] const STEAM_PROCESS_NAME: &str = "steam";
#[cfg(any(target_os = "linux", target_os = "macos"))] const WORKSHOPPER_EXE: &str = "workshopper";
#[cfg(any(target_os = "linux", target_os = "macos"))] const SCRIPT_UPLOAD_TO_WORKSHOP: &str = "upload-to-workshop.sh";
#[cfg(any(target_os = "linux", target_os = "macos"))] const SCRIPT_GET_PUBLISHED_FILE_DETAILS: &str = "get-published-file-details.sh";
#[cfg(any(target_os = "linux", target_os = "macos"))] const SCRIPT_GET_USER_ID: &str = "get-user-id.sh";
#[cfg(any(target_os = "linux", target_os = "macos"))] const SCRIPT_LAUNCH_GAME: &str = "launch-game.sh";
//-------------------------------------------------------------------------------//
//                              Enums & Structs
//-------------------------------------------------------------------------------//

#[derive(Clone, Default)]
pub struct SteamIntegration {}

#[derive(Debug, Clone, Deserialize)]
pub struct QueryResultDerive {
    pub published_file_id: u64,
    pub title: String,
    pub description: String,
    pub owner: u64,
    pub time_created: u32,
    pub time_updated: u32,
    pub visibility: PublishedFileVisibilityDerive,
    pub tags: Vec<String>,
    pub file_name: String,
    pub file_size: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum FileTypeDerive {
    Community,
    Microtransaction,
    Collection,
    Art,
    Video,
    Screenshot,
    Game,
    Software,
    Concept,
    WebGuide,
    IntegratedGuide,
    Merch,
    ControllerBinding,
    SteamworksAccessInvite,
    SteamVideo,
    GameManagedItem,
}

//-------------------------------------------------------------------------------//
//                             Implementations
//-------------------------------------------------------------------------------//

impl From<&QueryResultDerive> for RemoteMetadata {
    fn from(value: &QueryResultDerive) -> Self {
        Self {
            remote_id: value.published_file_id.clone(),
            title: value.title.clone(),
            description: value.description.clone(),
            visibility: value.visibility.clone(),
            tags: value.tags.to_vec(),
            //preview: value.preview.clone(),
        }
    }
}

impl Integration for SteamIntegration {

    fn request_mod_remote_metadata(
        app: &AppHandle,
        game: &GameInfo,
        remote_id: &str,
    ) -> Result<RemoteMetadata> {
        if !is_steam_running() {
            return Err(anyhow!("Steam is not running."));
        }

        let workshop_items = request_mods_data_raw(app, game, &[remote_id.to_owned()])?;
        if workshop_items.is_empty() {
            return Err(anyhow!(
                "Mod with SteamId {} not found in the Workshop.",
                remote_id
            ));
        }

        // If we're not the author, do not even let us upload it.
        //let steam_user_id = user_id(game)?.to_string();
        //if steam_user_id.is_empty() || owner_id != steam_user_id {
        //    return Err(anyhow!("You're not the original uploader of this mod, or steam hasn't been detected on your system."));
        //}

        let workshop_item = workshop_items.first().unwrap();
        let data = RemoteMetadata::from(workshop_item);

        Ok(data)
    }

    fn request_mods_data(
        app: &AppHandle,
        game: &GameInfo,
        remote_ids: &[String],
    ) -> Result<Vec<Mod>> {
        // Do not call the cmd if there are no mods.
        if remote_ids.is_empty() {
            return Ok(vec![]);
        }

        if !is_steam_running() {
            return Err(anyhow!("Steam is not running."));
        }

        let workshop_items = request_mods_data_raw(app, game, remote_ids)?;

        let mut mods = vec![];
        for workshop_item in &workshop_items {
            let mut modd = Mod::default();
            modd.set_steam_id(Some(workshop_item.published_file_id.to_string()));

            modd.set_name(workshop_item.title.to_owned());
            modd.set_creator(workshop_item.owner.to_string());
            modd.set_file_name(workshop_item.file_name.to_owned());
            modd.set_file_size(workshop_item.file_size as u64);
            modd.set_description(workshop_item.description.to_owned());
            modd.set_time_created(workshop_item.time_created as usize);
            modd.set_time_updated(workshop_item.time_updated as usize);

            mods.push(modd);
        }

        Ok(mods)
    }
    /*
    pub fn request_user_names(
        app: &AppHandle,
        user_ids: &[String],
    ) -> Result<HashMap<String, String>> {
        // Do not call the cmd if there are no users.
        if user_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let settings = SETTINGS.read().unwrap().clone();
        let api_key = settings.string("steam_api_key")?;
        if !api_key.is_empty() {
            let mut client = Workshop::new(None);
            client.set_apikey(Some(api_key));
            get_player_names(&client, user_ids)
        } else {
            Ok(HashMap::new())
        }
    }*/

    fn populate_mods_with_online_data(
        app: &AppHandle,
        mods: &mut HashMap<String, Mod>,
        remote_mods: &[Mod],
    ) -> Result<()> {
        for workshop_item in remote_mods {
            if let Some(modd) = mods
                .values_mut()
                .filter(|modd| modd.steam_id().is_some())
                .find(|modd| modd.steam_id() == workshop_item.steam_id())
            {
                modd.set_name(workshop_item.name().to_string());
                modd.set_creator(workshop_item.creator().to_string());
                modd.set_file_name(workshop_item.file_name().to_string());
                modd.set_file_size(*workshop_item.file_size());
                modd.set_description(workshop_item.description().to_string());
                modd.set_time_created(*workshop_item.time_created());
                modd.set_time_updated(*workshop_item.time_updated());
            }
        }

        let user_ids = mods
            .values()
            .filter_map(|modd| {
                if !modd.creator().is_empty() {
                    Some(modd.creator().to_owned())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();

        if user_ids.is_empty() {
            return Ok(());
        }

        // TODO: Remove this.
        //if let Ok(user_names) = Self::request_user_names(app, &user_ids) {
        //    Self::populate_mods_with_author_names(mods, &user_names);
        //}

        Ok(())
    }

    fn populate_mods_with_author_names(
        mods: &mut HashMap<String, Mod>,
        user_names: &HashMap<String, String>,
    ) {
        for modd in mods.values_mut() {
            if let Some(creator_name) = user_names.get(modd.creator()) {
                modd.set_creator_name(creator_name.to_string());
            }
        }
    }

    fn upload_mod_to_integration(
        app: &AppHandle,
        game: &GameInfo,
        modd: &Mod,
        title: &str,
        description: &str,
        tags: &[String],
        changelog: &str,
        visibility: &Option<u32>,
        force_update: bool,
    ) -> Result<()> {
        if !is_steam_running() {
            return Err(anyhow!("Steam is not running."));
        }

        let settings = SETTINGS.read().unwrap().clone();
        let game_path = settings.game_path(game)?;
        let steam_id = game.steam_id(&game_path)? as u32;

        let pack_path = if modd.paths().is_empty() {
            return Err(anyhow!("Mod Path not found."));
        } else {
            path_to_absolute_string(&modd.paths()[0])
        };

        // If we're force-updating (the default) we just open and resave the pack to update the timestamp so steam detects it as different.
        if force_update {
            let extra_data = Some(EncodeableExtraData::new_from_game_info(game));
            let mut pack =
                Pack::read_and_merge(&[PathBuf::from(&pack_path)], true, false, false, false)?;
            pack.save(None, game, &extra_data)?;
        }

        // If we have a published_file_id, it means this file exists in the workshop.
        //
        // So, instead of uploading, we just update it.
        let mut command_string = format!(
            "{} {} -b -s {steam_id} -f \"{pack_path}\" -t {} --tags {}",
            &*WORKSHOPPER_PATH,
            match modd.steam_id() {
                Some(published_file_id) => format!("update --published-file-id {published_file_id}"),
                None => "upload".to_string(),
            },
            BASE64_STANDARD.encode(title),
            tags.join(",")
        );

        if !description.is_empty() {
            command_string.push_str(&format!(" -d {}", BASE64_STANDARD.encode(description)));
        }

        if !changelog.is_empty() {
            command_string.push_str(&format!(" -c {}", BASE64_STANDARD.encode(changelog)));
        }

        if let Some(visibility) = visibility {
            command_string.push_str(&format!(" --visibility {visibility}"));
        }

        command_string.push_str(" & exit");

        let script_path = create_script(app, SCRIPT_UPLOAD_TO_WORKSHOP, &command_string)?;
        let mut command = workshopper_command(app, false, false, true)?;
        command.arg(&script_path);
        workshopper_command_post(&mut command, false, false, true);
        command.spawn()?;

        Ok(())
    }

    fn launch_game(
        app: &AppHandle,
        game: &GameInfo,
        command_to_pass: &str,
        wait_for_finish: bool,
    ) -> Result<()> {
        if !is_steam_running() {
            return Err(anyhow!("Steam is not running."));
        }

        let settings = SETTINGS.read().unwrap().clone();
        let game_path = settings.game_path(game)?;
        let steam_id = game.steam_id(&game_path)? as u32;

        let command_string = format!(
            "{} launch -b -s {steam_id} -c {command_to_pass}",
            &*WORKSHOPPER_PATH,
        );

        let script_path = create_script(app, SCRIPT_LAUNCH_GAME, &command_string)?;
        let mut command = workshopper_command(app, false, false, true)?;
        command.arg(&script_path);
        workshopper_command_post(&mut command, false, false, true);
        let mut handle = command.spawn()?;

        if wait_for_finish {
            let _ = handle.wait();
        }

        Ok(())
    }
    /*
    /// This function asks workshopper to get all subscribed items, check which ones are missing, and tell steam to re-download them.
    pub fn download_subscribed_mods(
        app: &AppHandle,
        game: &GameInfo,
        published_file_ids: &Option<Vec<String>>,
    ) -> Result<()> {
        let settings = SETTINGS.read().unwrap().clone();
        let game_path = settings.game_path(game)?;
        let steam_id = game.steam_id(&game_path)? as u32;

        let mut command = workshopper_command(app, false, true, false)?;
        command.arg(&*WORKSHOPPER_PATH);

        command.arg("download-subscribed-items");
        command.arg("-s");
        command.arg(steam_id.to_string());

        if let Some(published_file_ids) = published_file_ids {
            command.arg("-p");
            command.arg(published_file_ids.join(","));
        }

        workshopper_command_post(&mut command, false, true, false);
        let mut handle = command.spawn()?;
        handle.wait()?;

        Ok(())
    }*/

    fn user_id(app: &AppHandle, game: &GameInfo) -> Result<String> {
        if !is_steam_running() {
            return Err(anyhow!("Steam is not running."));
        }

        let settings = SETTINGS.read().unwrap().clone();
        let game_path = settings.game_path(game)?;
        let steam_id = game.steam_id(&game_path)? as u32;
        let ipc_channel = rand::random::<u64>().to_string();

        let command_string = format!(
            "{} user-id -s {steam_id} -i {ipc_channel} & exit",
            &*WORKSHOPPER_PATH
        );

        let script_path = create_script(app, SCRIPT_GET_USER_ID, &command_string)?;
        let mut command = workshopper_command(app, true, true, false)?;
        command.arg(&script_path);
        workshopper_command_post(&mut command, true, true, false);
        command.spawn()?;

        let channel = ipc_channel.to_ns_name::<GenericNamespaced>()?;
        let server = ListenerOptions::new().name(channel).create_sync()?;
        let mut stream = server.accept()?;

        let mut bytes = vec![];
        stream.read_to_end(&mut bytes)?;

        let array: [u8; 8] = bytes
            .try_into()
            .map_err(|_| anyhow!("Error when trying to get the Steam User ID."))?;

        Ok(u64::from_le_bytes(array).to_string())
    }

    fn can_game_locked(game: &GameInfo, game_path: &Path) -> Result<bool> {
        let app_path = app_manifest_path(game, game_path)?;
        Ok(app_path.is_file())
    }

    fn is_game_locked(game: &GameInfo, game_path: &Path) -> Result<bool> {
        let app_path = app_manifest_path(game, game_path)?;
        if !app_path.is_file() {
            return Ok(false);
        }

        let metadata = app_path.metadata()?;
        let permissions = metadata.permissions();

        Ok(permissions.readonly())
    }

    fn toggle_game_locked(game: &GameInfo, game_path: &Path, toggle: bool) -> Result<bool> {
        let app_path = app_manifest_path(game, game_path)?;
        if !app_path.is_file() {
            return Ok(false);
        }

        let metadata = app_path.metadata()?;
        let mut permissions = metadata.permissions();
        permissions.set_readonly(toggle);

        std::fs::set_permissions(app_path, permissions.clone())?;

        Ok(permissions.readonly())
    }
}

//-------------------------------------------------------------------------------//
//                      Utils used by this integration
//-------------------------------------------------------------------------------//

/// This function creates a command to run workshopper in any OS.
fn workshopper_command(app: &AppHandle, hide_terminal: bool, detached: bool, new_console: bool) -> Result<Command> {
    if cfg!(target_os = "windows") {
        let mut command = Command::new("cmd");
        command.arg("/C");

        #[cfg(target_os = "windows")] {
            // This is for creating the terminal window. Without it, the entire process runs in the background and there's no feedback on when it's done.
            if hide_terminal {
                if cfg!(debug_assertions) {
                    command.creation_flags(DETACHED_PROCESS);
                } else {
                    command.creation_flags(CREATE_NO_WINDOW);
                }
            }

            if detached {
                command.creation_flags(DETACHED_PROCESS);
            }

            if new_console {
                command.creation_flags(CREATE_NEW_CONSOLE);
            }
        }

        Ok(command)
    } else {

        // We use nohup directly to disconnect the steamworks session from the main process.
        let command = Command::new("nohup");
        Ok(command)
    }
}

/// This function finishes the command to run workshopper in any OS.
fn workshopper_command_post(command: &mut Command, hide_terminal: bool, detached: bool, new_console: bool) {
    if !cfg!(target_os = "windows") {
        command.arg("&");
    }
}

/// This function creates a script to run workshopper in any OS.
fn create_script(app: &AppHandle, script_name: &str, command_string: &str) -> Result<PathBuf> {
    let config_path = config_path(app)?;
    let script_path = config_path.join(script_name);

    let mut file = BufWriter::new(File::create(&script_path)?);
    file.write_all(command_string.as_bytes())?;
    file.flush()?;

    // Fix for missing executable permissions.
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755))?;

    Ok(script_path)
}

/// This function checks if Steam is running.
fn is_steam_running() -> bool {
    let refresh_kind = sysinfo::RefreshKind::everything()
        .with_processes(sysinfo::ProcessRefreshKind::everything());
    let sys = sysinfo::System::new_with_specifics(refresh_kind);
    sys.processes_by_exact_name(STEAM_PROCESS_NAME.as_ref()).count() > 0
}

/// This function returns the path to the app manifest file for a given game.
fn app_manifest_path(game: &GameInfo, game_path: &Path) -> Result<PathBuf> {
    let steam_id = game.steam_id(game_path)? as u32;
    let mut app_path = game_path.to_path_buf();
    app_path.pop();
    app_path.pop();

    app_path.push(format!("appmanifest_{}.acf", steam_id));
    Ok(app_path)
}

/// This function requests the public remote data data of the mods from the workshop.
fn request_mods_data_raw(
    app: &AppHandle,
    game: &GameInfo,
    mod_ids: &[String],
) -> Result<Vec<QueryResultDerive>> {
    // Do not call the cmd if there are no mods.
    if mod_ids.is_empty() {
        return Ok(vec![]);
    }

    let settings = SETTINGS.read().unwrap();
    let game_path = settings.game_path(game)?;
    let steam_id = game.steam_id(&game_path)? as u32;
    let published_file_ids = mod_ids.join(",");
    let ipc_channel = rand::random::<u64>().to_string();

    let command_string = format!(
        "{} get-published-file-details -s {steam_id} -p {published_file_ids} -i {ipc_channel} & exit",
        &*WORKSHOPPER_PATH
    );

    let script_path = create_script(app, SCRIPT_GET_PUBLISHED_FILE_DETAILS, &command_string)?;
    let mut command = workshopper_command(app, true, true, false)?;
    command.arg(&script_path);
    workshopper_command_post(&mut command, true, true, false);

    command.spawn()?;

    let channel = ipc_channel.to_ns_name::<GenericNamespaced>()?;
    let server = ListenerOptions::new().name(channel).create_sync()?;

    let mut stream = server.accept()?;
    let mut message = String::new();

    stream.read_to_string(&mut message)?;
    if message == "{}" {
        Err(anyhow!("Error retrieving Steam Workshop data."))
    } else {
        serde_json::from_str(&message).map_err(From::from)
    }
}