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

use anyhow::{Error, Result};
use serde::Deserialize;
use tauri::AppHandle;
use tauri::async_runtime::{Receiver, Sender, channel};

use std::collections::HashMap;
use std::path::Path;
use std::process::exit;

use rpfm_lib::games::GameInfo;

use crate::mod_manager::mods::Mod;

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
}

pub enum TxStoreSend {
    LaunchGame(Sender<TxStoreResponse>, AppHandle, GameInfo, String, bool),
    RequestRemoteModData(Sender<TxStoreResponse>, AppHandle, GameInfo, Vec<String>),
    StoreUserId(Sender<TxStoreResponse>, AppHandle, GameInfo),
}

pub enum TxStoreResponse {
    VecMod(Vec<Mod>),
    U64(u64),
    Success(()),
    Error(Error),
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
pub enum PublishedFileVisibilityDerive {
    Public,
    FriendsOnly,
    #[default]
    Private,
    Unlisted,
}

#[derive(Debug, Clone, Default)]
pub struct PreUploadInfo {
    pub published_file_id: u64,
    pub title: String,
    pub description: String,
    pub visibility: PublishedFileVisibilityDerive,
    pub tags: Vec<String>,
}

//-------------------------------------------------------------------------------//
//                             Implementations
//-------------------------------------------------------------------------------//

/// Macro to generate recv functions for each function that returns a receiver, so we don't need to go around unwraping and awaiting the receiver.
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

        Self { sender }
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

    pub fn populate_mods_with_online_data(
        app_handle: &tauri::AppHandle,
        local_mods: &mut HashMap<String, Mod>,
        remote_mods: &[Mod],
    ) -> Result<()> {
        steam::populate_mods_with_online_data(app_handle, local_mods, remote_mods)
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

                Some(TxStoreSend::StoreUserId(tx_send, app, game)) => {
                    match Self::wrapper_store_user_id(&app, &game) {
                        Ok(data) => {
                            let _ = tx_send.send(TxStoreResponse::U64(data)).await;
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
        mod_ids: &[String],
    ) -> Result<Vec<Mod>> {
        steam::request_mods_data(app_handle, game, mod_ids)
    }

    fn wrapper_request_pre_upload_info(
        app_handle: &tauri::AppHandle,
        game: &GameInfo,
        mod_id: &str,
    ) -> Result<PreUploadInfo> {
        steam::request_pre_upload_info(app_handle, game, mod_id)
    }

    fn wrapper_upload_mod_to_workshop(
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
        steam::upload_mod_to_workshop(
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
        steam::launch_game(app_handle, game, command_to_pass, wait_for_finish)
    }

    fn wrapper_download_subscribed_mods(
        app_handle: &tauri::AppHandle,
        game: &GameInfo,
        published_file_ids: &Option<Vec<String>>,
    ) -> Result<()> {
        steam::download_subscribed_mods(app_handle, game, published_file_ids)
    }

    fn wrapper_store_user_id(app_handle: &tauri::AppHandle, game: &GameInfo) -> Result<u64> {
        steam::user_id(app_handle, game)
    }

    fn wrapper_can_game_locked(game: &GameInfo, game_path: &Path) -> bool {
        steam::can_game_locked(game, game_path).unwrap_or_default()
    }

    fn wrapper_is_game_locked(game: &GameInfo, game_path: &Path) -> bool {
        steam::is_game_locked(game, game_path).unwrap_or_default()
    }

    fn wrapper_toggle_game_locked(game: &GameInfo, game_path: &Path, toggle: bool) -> bool {
        steam::toggle_game_locked(game, game_path, toggle).unwrap_or_default()
    }
}
