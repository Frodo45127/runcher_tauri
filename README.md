# Tauri + Vanilla TS

This template should help get you started developing with Tauri in vanilla HTML, CSS and Typescript.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)


## Compilation Instructions

- Download and install Rust (latest stable).
- Install [Tauri](https://v2.tauri.app/es/start/prerequisites/) requirements.
- Execute `pnpm install`
- Execute `pnpm run tauri build`
- Either:
    - Download TWPatcher's latest release and extract it in `src-tauri/target/debug`.
    - Download Workshopper's latest release and extract it in `src-tauri/target/debug`.
    - Copy the `steam_api.dll` file from Runcher's latest release into `src-tauri/target/debug`.
- Or:
    - Clone the repos of TWPatcher and Workshopper somewhere on your pc.
    - Edit their paths in `src-tauri/build.rs` to point to them.
- Execute `pnpm run tauri dev`.
- Enjoy! And hope I haven't forget a step. Note you'll have to repeat steps 5-7 if you do a clean and remove the target repo.