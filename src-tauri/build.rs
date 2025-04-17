// Runcher requires workshopper for SteamWorks Integration and TWPatcher for launch options patching.
// This script copies the necessary files to the target directory. Change the paths to where you downloaded the repos.
// And remember to run `cargo build` so the executables exist when this tries to copy them.
const WORKSHOPPER_REPO_PATH: &str = "../../workshopper";
const TWPATCHER_REPO_PATH: &str = "../../twpatcher";

/// Windows Build Script.
#[cfg(target_os = "windows")]
fn main() {
    let _ = std::fs::copy(format!("{}/3rdparty/steam_api64.dll", WORKSHOPPER_REPO_PATH), "./target/debug/steam_api64.dll");
    let _ = std::fs::copy(format!("{}/3rdparty/steam_api64.dll", WORKSHOPPER_REPO_PATH), "./target/release/steam_api64.dll");
    let _ = std::fs::copy(format!("{}/target/debug/workshopper.exe", WORKSHOPPER_REPO_PATH), "./target/debug/workshopper.exe");
    let _ = std::fs::copy(format!("{}/target/release/workshopper.exe", WORKSHOPPER_REPO_PATH), "./target/release/workshopper.exe");
    let _ = std::fs::copy(format!("{}/target/debug/twpatcher.exe", TWPATCHER_REPO_PATH), "./target/debug/twpatcher.exe");
    let _ = std::fs::copy(format!("{}/target/release/twpatcher.exe", TWPATCHER_REPO_PATH), "./target/release/twpatcher.exe");
    tauri_build::build()
}

/// Linux Build Script.
#[cfg(target_os = "linux")]
fn main() {
    let _ = std::fs::copy(format!("{}/3rdparty/libsteam_api.so", WORKSHOPPER_REPO_PATH), "./target/debug/libsteam_api.so");
    let _ = std::fs::copy(format!("{}/3rdparty/libsteam_api.so", WORKSHOPPER_REPO_PATH), "./target/release/libsteam_api.so");
    let _ = std::fs::copy(format!("{}/target/debug/workshopper", WORKSHOPPER_REPO_PATH), "./target/debug/workshopper");
    let _ = std::fs::copy(format!("{}/target/release/workshopper", WORKSHOPPER_REPO_PATH), "./target/release/workshopper");
    let _ = std::fs::copy(format!("{}/target/debug/twpatcher", TWPATCHER_REPO_PATH), "./target/debug/twpatcher");
    let _ = std::fs::copy(format!("{}/target/release/twpatcher", TWPATCHER_REPO_PATH), "./target/release/twpatcher");

    tauri_build::build()
}

/// MacOS Build Script.
#[cfg(target_os = "macos")]
fn main() {
    let _ = std::fs::copy(format!("{}/3rdparty/libsteam_api.dylib", WORKSHOPPER_REPO_PATH), "./target/debug/libsteam_api.dylib");
    let _ = std::fs::copy(format!("{}/3rdparty/libsteam_api.dylib", WORKSHOPPER_REPO_PATH), "./target/release/libsteam_api.dylib");
    let _ = std::fs::copy(format!("{}/target/debug/workshopper", WORKSHOPPER_REPO_PATH), "./target/debug/workshopper");
    let _ = std::fs::copy(format!("{}/target/release/workshopper", WORKSHOPPER_REPO_PATH), "./target/release/workshopper");
    let _ = std::fs::copy(format!("{}/target/debug/twpatcher", TWPATCHER_REPO_PATH), "./target/debug/twpatcher");
    let _ = std::fs::copy(format!("{}/target/release/twpatcher", TWPATCHER_REPO_PATH), "./target/release/twpatcher");

    tauri_build::build()
}
