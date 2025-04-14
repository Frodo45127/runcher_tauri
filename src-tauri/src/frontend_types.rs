use serde::Serialize;

#[derive(Serialize)]
pub struct SidebarIcon {
    pub id: String,
    pub name: String,
    pub icon: String,
}

#[derive(Serialize, Default)]
pub struct TreeCategory {
    pub id: String,
    pub name: String,
    pub size: String,
    pub status: String,
    pub last_played: String,
    pub children: Vec<TreeItem>,
}

#[derive(Serialize, Default)]
pub struct TreeItem {
    pub id: String,
    pub name: String,
    pub flags: String,
    pub location: String,
    pub creator: String,
    pub r#type: String,
    pub size: String,
    pub created: u64,
    pub updated: u64,
    pub description: String,
    pub is_checked: bool,
}

#[derive(Serialize, Default)]
pub struct ListItem {
    pub id: String,
    pub pack: String,
    pub r#type: String,
    pub order: i32,
    pub location: String,
    pub steam_id: String,
}

/// Progress payload for the progress event. Basically, it's for providing a way to update the progress bar from the Rust side.
/// The id is:
/// - 0: Generic 0-100 loading process.
#[derive(Serialize, Clone)]
pub struct ProgressPayload {
    pub id: i32,
    pub progress: i32,
    pub total: i32,
}