//---------------------------------------------------------------------------//
// Copyright (c) 2017-2024 Ismael Gutiérrez González. All rights reserved.
//
// This file is part of the Rusted Launcher (Runcher) project,
// which can be found here: https://github.com/Frodo45127/runcher.
//
// This file is licensed under the MIT license, which can be found here:
// https://github.com/Frodo45127/runcher/blob/master/LICENSE.
//---------------------------------------------------------------------------//

/// Updater code. Mostly copied from the tauri docs, that's why it has custom error and result types.

use std::sync::Mutex;
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

//-------------------------------------------------------------------------------//
//                             Structs & Enums
//-------------------------------------------------------------------------------//

type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Updater(#[from] tauri_plugin_updater::Error),
    #[error("there is no pending update")]
    NoPendingUpdate,
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_str())
    }
}

pub struct PendingUpdate(pub Mutex<Option<Update>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    version: String,
    current_version: String,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}


//-------------------------------------------------------------------------------//
//                             Implementations
//-------------------------------------------------------------------------------//

#[tauri::command]
pub async fn fetch_update(app: AppHandle, pending_update: State<'_, PendingUpdate>) -> Result<Option<UpdateMetadata>> {
    let url = Url::parse("https://github.com/Frodo45127/runcher_tauri/releases/latest/download/latest.json").expect("invalid URL");

    let update = app
        .updater_builder()
        .endpoints(vec![url])?
        .build()?
        .check()
        .await?;

    let update_metadata = update.as_ref().map(|update| UpdateMetadata {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
    });

    *pending_update.0.lock().unwrap() = update;

    Ok(update_metadata)
}

#[tauri::command]
pub async fn install_update(pending_update: State<'_, PendingUpdate>, on_event: Channel<DownloadEvent>) -> Result<()> {
    let Some(update) = pending_update.0.lock().unwrap().take() else {
        return Err(Error::NoPendingUpdate);
    };

    let mut started = false;

    // TODO: Replace this with download_and_install when the app is ready. 
    update.download(|chunk_length, content_length| {
        if !started {
            let _ = on_event.send(DownloadEvent::Started { content_length });
            started = true;
        }

        let _ = on_event.send(DownloadEvent::Progress { chunk_length });
    },
    || {
        let _ = on_event.send(DownloadEvent::Finished);
    },).await?;

    Ok(())
}

