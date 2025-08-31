// Runcher requires workshopper for SteamWorks Integration and TWPatcher for launch options patching.
// This script copies the necessary files to the target directory. Change the paths to where you downloaded the repos.
// And remember to run `cargo build` so the executables exist when this tries to copy them.
const WORKSHOPPER_REPO_PATH: &str = "../../workshopper";
const TWPATCHER_REPO_PATH: &str = "../../twpatcher";

const BSE: &str = "Build Script Error: ";

/// Windows Build Script.
#[cfg(target_os = "windows")]
fn main() {
    if cfg!(debug_assertions) {
        std::fs::copy(format!("{}/3rdparty/steam_api64.dll", WORKSHOPPER_REPO_PATH), "./target/debug/steam_api64.dll").expect(&format!("{}Missing steam_api64.dll in {}/3rdparty/steam_api64.dll.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/debug/workshopper.exe", WORKSHOPPER_REPO_PATH), "./target/debug/workshopper.exe").expect(&format!("{}Missing workshopper.exe in {}/target/debug/workshopper.exe.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/debug/twpatcher.exe", TWPATCHER_REPO_PATH), "./target/debug/twpatcher.exe").expect(&format!("{}Missing twpatcher.exe in {}/target/debug/twpatcher.exe.", BSE, TWPATCHER_REPO_PATH));
    } else {
        std::fs::copy(format!("{}/3rdparty/steam_api64.dll", WORKSHOPPER_REPO_PATH), "./target/release/steam_api64.dll").expect(&format!("{}Missing steam_api64.dll in {}/3rdparty/steam_api64.dll.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/release/workshopper.exe", WORKSHOPPER_REPO_PATH), "./target/release/workshopper.exe").expect(&format!("{}Missing workshopper.exe in {}/target/release/workshopper.exe.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/release/twpatcher.exe", TWPATCHER_REPO_PATH), "./target/release/twpatcher.exe").expect(&format!("{}Missing twpatcher.exe in {}/target/release/twpatcher.exe.", BSE, TWPATCHER_REPO_PATH));
    }

    tauri_build::build()
}

/// Linux Build Script.
#[cfg(target_os = "linux")]
fn main() {
    if cfg!(debug_assertions) {
        std::fs::copy(format!("{}/3rdparty/libsteam_api.so", WORKSHOPPER_REPO_PATH), "./target/debug/libsteam_api.so").expect(&format!("{}Missing libsteam_api.so in {}/3rdparty/libsteam_api.so.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/debug/workshopper", WORKSHOPPER_REPO_PATH), "./target/debug/workshopper").expect(&format!("{}Missing workshopper in {}/target/debug/workshopper.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/debug/twpatcher", TWPATCHER_REPO_PATH), "./target/debug/twpatcher").expect(&format!("{}Missing twpatcher in {}/target/debug/twpatcher.", BSE, TWPATCHER_REPO_PATH));
    } else {
        std::fs::copy(format!("{}/3rdparty/libsteam_api.so", WORKSHOPPER_REPO_PATH), "./target/release/libsteam_api.so").expect(&format!("{}Missing libsteam_api.so in {}/3rdparty/libsteam_api.so.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/release/workshopper", WORKSHOPPER_REPO_PATH), "./target/release/workshopper").expect(&format!("{}Missing workshopper in {}/target/release/workshopper.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/release/twpatcher", TWPATCHER_REPO_PATH), "./target/release/twpatcher").expect(&format!("{}Missing twpatcher in {}/target/release/twpatcher.", BSE, TWPATCHER_REPO_PATH));
    }

    tauri_build::build()
}

/// MacOS Build Script.
#[cfg(target_os = "macos")]
fn main() {
    if cfg!(debug_assertions) {
        std::fs::copy(format!("{}/3rdparty/libsteam_api.dylib", WORKSHOPPER_REPO_PATH), "./target/debug/libsteam_api.dylib").expect(&format!("{}Missing libsteam_api.dylib in {}/3rdparty/libsteam_api.dylib.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/debug/workshopper", WORKSHOPPER_REPO_PATH), "./target/debug/workshopper").expect(&format!("{}Missing workshopper in {}/target/debug/workshopper.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/debug/twpatcher", TWPATCHER_REPO_PATH), "./target/debug/twpatcher").expect(&format!("{}Missing twpatcher in {}/target/debug/twpatcher.", BSE, TWPATCHER_REPO_PATH));
    } else {
        std::fs::copy(format!("{}/3rdparty/libsteam_api.dylib", WORKSHOPPER_REPO_PATH), "./target/release/libsteam_api.dylib").expect(&format!("{}Missing libsteam_api.dylib in {}/3rdparty/libsteam_api.dylib.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/release/workshopper", WORKSHOPPER_REPO_PATH), "./target/release/workshopper").expect(&format!("{}Missing workshopper in {}/target/release/workshopper.", BSE, WORKSHOPPER_REPO_PATH));
        std::fs::copy(format!("{}/target/release/twpatcher", TWPATCHER_REPO_PATH), "./target/release/twpatcher").expect(&format!("{}Missing twpatcher in {}/target/release/twpatcher.", BSE, TWPATCHER_REPO_PATH));
    }

    tauri_build::build()
}
