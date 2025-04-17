//---------------------------------------------------------------------------//
// Copyright (c) 2017-2024 Ismael Gutiérrez González. All rights reserved.
//
// This file is part of the Rusted Launcher (Runcher) project,
// which can be found here: https://github.com/Frodo45127/runcher.
//
// This file is licensed under the MIT license, which can be found here:
// https://github.com/Frodo45127/runcher/blob/master/LICENSE.
//---------------------------------------------------------------------------//

//! Online integrations. The intention is so this module acts as a common abstraction of specific integrations.
//!
//! For now we only support steam workshop, so all calls are redirected to the steam module.

use anyhow::{anyhow, Error, Result};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::async_runtime::{Receiver, Sender, channel};

use std::collections::HashMap;
use std::path::Path;
use std::process::exit;

use rpfm_lib::games::GameInfo;

use crate::mod_manager::mods::Mod;
use self::steam::SteamIntegration;

mod steam;

#[cfg(target_os = "windows")]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(target_os = "windows")]
pub const DETACHED_PROCESS: u32 = 0x00000008;
#[cfg(target_os = "windows")]
const CREATE_NEW_CONSOLE: u32 = 0x00000010;

//-------------------------------------------------------------------------------//
//                              Enums & Structs
//-------------------------------------------------------------------------------//

// TODO: Cache user ids, once multi-store support is in.
#[derive(Clone)]
pub struct Integrations {
    sender: Sender<TxStoreSend>,

    steam: SteamIntegration,
}

// Generic trait that all integrations must implement.
trait Integration {

    /// This function is used to open the remote mod url in the browser.
    ///
    /// If in_app is true, it will try to open the url in the store's app (Steam, Epic, etc) instead of the browser.
    fn open_remote_mod_url(
        remote_id: &str,
        in_app: bool,
    ) -> Result<()>;

    /// This function is used to request the current remote metadata of a mod.
    fn request_mod_remote_metadata(
        app: &AppHandle,
        game: &GameInfo,
        remote_id: &str,
    ) -> Result<RemoteMetadata>;

    /// This function requests the public remote data of the mods from the integration.
    /// You'll need to call populate_mods_with_online_data after this to dump the data into the real mods.
    fn request_mods_data(
        app: &AppHandle,
        game: &GameInfo,
        remote_ids: &[String],
    ) -> Result<Vec<Mod>>;

    /// This function populates the mods with the online data retrieved with the integration into a mod list.
    fn populate_mods_with_online_data(
        app: &AppHandle,
        mods: &mut HashMap<String, Mod>,
        remote_mods: &[Mod],
    ) -> Result<()>;

    /// This function populates the mods with the author names of the users that uploaded them.
    /// Otherwise mods will only show the id of the uploader, not their name.
    fn populate_mods_with_author_names(
        mods: &mut HashMap<String, Mod>,
        user_names: &HashMap<String, String>,
    );

    /// This function uploads a mod to the site of the integration.
    ///
    /// If the mod doesn't yet exists in the site, it creates it. If it already exists, it updates it.
    ///
    /// If the site has some logic to avoid re-uploading the same mod file, you can use force_update to bypass it.
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
    ) -> Result<()>;

    /// This function launches a game through the integration, if said integration supports it.
    /// Only for integrations with stores. Will fail for 3rd party modding sites.
    fn launch_game(_app: &AppHandle, _game: &GameInfo, _command_to_pass: &str, _wait_for_finish: bool) -> Result<()> {
        Err(anyhow!("Not implemented for this integration."))
    }

    /// This function returns the user id of the user logged in the integration.
    fn user_id(app: &AppHandle, game: &GameInfo) -> Result<String>;

    /// This function returns if the game can be locked, so it doesn't get updated.
    fn can_game_locked(game: &GameInfo, game_path: &Path) -> Result<bool>;

    /// This function returns if the game is locked, so it doesn't get updated.
    fn is_game_locked(game: &GameInfo, game_path: &Path) -> Result<bool>;

    /// This function is used to toggle the game update state, allowing to prevent the game from being updated.
    ///
    /// NOTE: This will return `Ok(false)` if the game cannot be locked.
    fn toggle_game_locked(game: &GameInfo, game_path: &Path, toggle: bool) -> Result<bool>;
}

pub enum TxStoreSend {
    LaunchGame(Sender<TxStoreResponse>, AppHandle, GameInfo, String, bool),
    RequestRemoteModData(Sender<TxStoreResponse>, AppHandle, GameInfo, Vec<String>),
    RequestModRemoteMetadata(Sender<TxStoreResponse>, AppHandle, GameInfo, StoreId),
    StoreUserId(Sender<TxStoreResponse>, AppHandle, GameInfo),
    UploadMod(Sender<TxStoreResponse>, AppHandle, GameInfo, Mod, String, String, Vec<String>, String, Option<u32>, bool),
}

pub enum TxStoreResponse {
    VecMod(Vec<Mod>),
    U64(u64),
    Success(()),
    Error(Error),
    RemoteMetadata(RemoteMetadata),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub enum PublishedFileVisibilityDerive {
    Public,
    FriendsOnly,
    #[default]
    Private,
    Unlisted,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum StoreId {
    #[default] None,
    Steam(String),
    Epic(String),
    Nexus(String),
    ModDB(String),
    LoversLab(String),
    Github(String)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RemoteMetadata {
    pub remote_id: u64,
    pub title: String,
    pub description: String,
    pub visibility: PublishedFileVisibilityDerive,
    pub tags: Vec<String>,
    //pub preview: String,
}

//-------------------------------------------------------------------------------//
//                             Implementations
//-------------------------------------------------------------------------------//

/// Macro to generate recv functions for each function that returns a receiver, so we don't need to go around unwraping and awaiting the receiver.
/// The params are:
/// - The name of the function to generate the recv for.
/// - The name of the success enum variant that the function returns.
/// - The type of the data that the success function returns.
macro_rules! recv {
    ($l:ident, $m:ident, $n:ty) => {
        paste::item! {
            pub async fn [< recv_ $l >](tx_recv: Receiver<TxStoreResponse>) -> Result<$n> {
                match Integrations::recv(tx_recv).await {
                    TxStoreResponse::$m(data) => Ok(data),
                    TxStoreResponse::Error(data) => Err(data),
                    _ => panic!("Something broke")
                }
            }
        }
    };
}

impl Integrations {
    pub fn new() -> Self {
        let (sender, receiver) = tauri::async_runtime::channel(32);
        tauri::async_runtime::spawn(Self::store_loop(receiver));

        Self {
            sender,
            steam: SteamIntegration::default(),
        }
    }

    pub fn open_remote_mod_url(remote_id: &StoreId, in_app: bool) -> Result<()> {
        match remote_id {
            StoreId::Steam(id) => SteamIntegration::open_remote_mod_url(id, in_app),
            _ => Err(anyhow!("Not implemented for this integration.")),
        }
    }

    recv!(launch_game, Success, ());
    pub async fn launch_game(
        &self,
        app: &AppHandle,
        game: &GameInfo,
        command_to_pass: &str,
        wait_for_finish: bool,
    ) -> Receiver<TxStoreResponse> {
        let (tx_send, tx_recv) = channel(32);
        let _ = self
            .sender
            .send(TxStoreSend::LaunchGame(
                tx_send,
                app.clone(),
                game.clone(),
                command_to_pass.to_owned(),
                wait_for_finish,
            ))
            .await;
        tx_recv
    }

    recv!(request_mod_remote_metadata, RemoteMetadata, RemoteMetadata);
    pub async fn request_mod_remote_metadata(
        &self,
        app: &AppHandle,
        game: &GameInfo,
        remote_id: &StoreId,
    ) -> Receiver<TxStoreResponse> {
        let (tx_send, tx_recv) = channel(32);
        let _ = self
            .sender
            .send(TxStoreSend::RequestModRemoteMetadata(tx_send, app.clone(), game.clone(), remote_id.clone()))
            .await;
        tx_recv
    }

    recv!(remote_mods_data, VecMod, Vec<Mod>);
    pub async fn request_remote_mods_data(
        &self,
        app: &AppHandle,
        game: &GameInfo,
        remote_mod_ids: &[String],
    ) -> Receiver<TxStoreResponse> {
        let (tx_send, tx_recv) = channel(32);
        let _ = self
            .sender
            .send(TxStoreSend::RequestRemoteModData(
                tx_send,
                app.clone(),
                game.clone(),
                remote_mod_ids.to_vec(),
            ))
            .await;
        tx_recv
    }

    recv!(store_user_id, U64, u64);
    pub async fn store_user_id(
        &self,
        app: &AppHandle,
        game: &GameInfo,
    ) -> Receiver<TxStoreResponse> {
        let (tx_send, tx_recv) = channel(32);
        let _ = self
            .sender
            .send(TxStoreSend::StoreUserId(tx_send, app.clone(), game.clone()))
            .await;
        tx_recv
    }

    recv!(upload_mod, Success, ());
    pub async fn upload_mod(
        &self,
        app: &AppHandle,
        game: &GameInfo,
        modd: &Mod,
        title: &str,
        description: &str,
        tags: &[String],
        changelog: &str,
        visibility: &Option<u32>,
        force_update: bool,
    ) -> Receiver<TxStoreResponse> {
        let (tx_send, tx_recv) = channel(32);
        let _ = self
            .sender
            .send(TxStoreSend::UploadMod(tx_send, app.clone(), game.clone(), modd.clone(), title.to_string(), description.to_string(), tags.to_vec(), changelog.to_string(), visibility.clone(), force_update))
            .await;
        tx_recv
    }

    pub fn populate_mods_with_online_data(
        app_handle: &tauri::AppHandle,
        local_mods: &mut HashMap<String, Mod>,
        remote_mods: &[Mod],
    ) -> Result<()> {
        SteamIntegration::populate_mods_with_online_data(app_handle, local_mods, remote_mods)
    }

    //-------------------------------------------------------------------------------//
    //                             Private functions
    //-------------------------------------------------------------------------------//

    async fn store_loop(mut response: Receiver<TxStoreSend>) {
        loop {
            let recv = response.recv().await;
            match recv {
                Some(TxStoreSend::RequestRemoteModData(tx_send, app, game, mod_ids)) => {
                    match Self::wrapper_request_mods_data(&app, &game, &mod_ids) {
                        Ok(data) => {
                            let _ = tx_send.send(TxStoreResponse::VecMod(data)).await;
                        }
                        Err(e) => {
                            let _ = tx_send.send(TxStoreResponse::Error(e)).await;
                        }
                    }
                }

                Some(TxStoreSend::LaunchGame(
                    tx_send,
                    app,
                    game,
                    command_to_pass,
                    wait_for_finish,
                )) => {
                    match Self::wrapper_launch_game(&app, &game, &command_to_pass, wait_for_finish)
                    {
                        Ok(data) => {
                            let _ = tx_send.send(TxStoreResponse::Success(data)).await;
                        }
                        Err(e) => {
                            let _ = tx_send.send(TxStoreResponse::Error(e)).await;
                        }
                    }
                }

                Some(TxStoreSend::RequestModRemoteMetadata(tx_send, app, game, remote_id)) => {
                    match Self::wrapper_request_mod_remote_metadata(&app, &game, &remote_id) {
                        Ok(data) => {
                            let _ = tx_send.send(TxStoreResponse::RemoteMetadata(data)).await;
                        }
                        Err(e) => {
                            let _ = tx_send.send(TxStoreResponse::Error(e)).await;
                        }
                    }
                }

                Some(TxStoreSend::StoreUserId(tx_send, app, game)) => {
                    match Self::wrapper_store_user_id(&app, &game) {
                        Ok(data) => {
                            let _ = tx_send.send(TxStoreResponse::U64(data.parse::<u64>().unwrap())).await;
                        }
                        Err(e) => {
                            let _ = tx_send.send(TxStoreResponse::Error(e)).await;
                        }
                    }
                }

                Some(TxStoreSend::UploadMod(tx_send, app, game, modd, title, description, tags, changelog, visibility, force_update)) => {
                    match Self::wrapper_upload_mod_to_integration(&app, &game, &modd, &title, &description, &tags, &changelog, &visibility, force_update) {
                        Ok(data) => {
                            let _ = tx_send.send(TxStoreResponse::Success(data)).await;
                        }
                        Err(e) => {
                            let _ = tx_send.send(TxStoreResponse::Error(e)).await;
                        }
                    }
                }

                // On none, it means the main thread is dead. Close this thread too.
                None => exit(0),
            }
        }
    }

    async fn recv(mut tx_recv: Receiver<TxStoreResponse>) -> TxStoreResponse {
        match tx_recv.recv().await {
            Some(data) => data,
            None => panic!("Something broke with a receiver."),
        }
    }

    fn wrapper_request_mods_data(
        app_handle: &tauri::AppHandle,
        game: &GameInfo,
        remote_ids: &[String],
    ) -> Result<Vec<Mod>> {
        SteamIntegration::request_mods_data(app_handle, game, remote_ids)
    }

    fn wrapper_request_mod_remote_metadata(
        app_handle: &tauri::AppHandle,
        game: &GameInfo,
        remote_id: &StoreId,
    ) -> Result<RemoteMetadata> {
        match remote_id {
            StoreId::Steam(id) => SteamIntegration::request_mod_remote_metadata(app_handle, game, id),
            StoreId::None => Err(anyhow!("No store id found.")),
            _ => Err(anyhow!("Not implemented for this integration.")),
        }
    }

    fn wrapper_upload_mod_to_integration(
        app_handle: &tauri::AppHandle,
        game: &GameInfo,
        modd: &Mod,
        title: &str,
        description: &str,
        tags: &[String],
        changelog: &str,
        visibility: &Option<u32>,
        force_update: bool,
    ) -> Result<()> {
        SteamIntegration::upload_mod_to_integration(
            app_handle,
            game,
            modd,
            title,
            description,
            tags,
            changelog,
            visibility,
            force_update,
        )
    }

    fn wrapper_launch_game(
        app_handle: &tauri::AppHandle,
        game: &GameInfo,
        command_to_pass: &str,
        wait_for_finish: bool,
    ) -> Result<()> {
        SteamIntegration::launch_game(app_handle, game, command_to_pass, wait_for_finish)
    }
    /*
    fn wrapper_download_subscribed_mods(
        app_handle: &tauri::AppHandle,
        game: &GameInfo,
        published_file_ids: &Option<Vec<String>>,
    ) -> Result<()> {
        SteamIntegration::download_subscribed_mods(app_handle, game, published_file_ids)
    }*/

    fn wrapper_store_user_id(app_handle: &tauri::AppHandle, game: &GameInfo) -> Result<String> {
        SteamIntegration::user_id(app_handle, game)
    }

    fn wrapper_can_game_locked(game: &GameInfo, game_path: &Path) -> bool {
        SteamIntegration::can_game_locked(game, game_path).unwrap_or_default()
    }

    fn wrapper_is_game_locked(game: &GameInfo, game_path: &Path) -> bool {
        SteamIntegration::is_game_locked(game, game_path).unwrap_or_default()
    }

    fn wrapper_toggle_game_locked(game: &GameInfo, game_path: &Path, toggle: bool) -> bool {
        SteamIntegration::toggle_game_locked(game, game_path, toggle).unwrap_or_default()
    }
}


impl StoreId {
    pub fn id(&self) -> Option<String> {
        match self {
            StoreId::None => None,
            StoreId::Steam(id) => Some(id.clone()),
            StoreId::Epic(id) => Some(id.clone()),
            StoreId::Nexus(id) => Some(id.clone()),
            StoreId::ModDB(id) => Some(id.clone()),
            StoreId::LoversLab(id) => Some(id.clone()),
            StoreId::Github(id) => Some(id.clone()),
        }
    }

    pub fn is_steam(&self) -> bool {
        matches!(self, StoreId::Steam(_))
    }
}
