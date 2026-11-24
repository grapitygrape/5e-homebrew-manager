//! Core backend logic for the Homebrew Manager, decoupled from Tauri so both
//! the desktop/portable Tauri binary (`src-tauri`) and the headless backend
//! daemon (`crates/hm-backend`) share the exact same implementation.

pub mod config;
pub mod data_folder;
pub mod deploy_scripts;
pub mod foundry;
pub mod item_prices;
pub mod migrations;
pub mod modules;
pub mod new_sources;
pub mod patch_ops;
pub mod patch_runner;
pub mod pipeline;
pub mod process;
pub mod publish;
pub mod repos;
pub mod run_history;
pub mod runtime;
pub mod script_names;
pub mod server;
pub mod setup;
pub mod shops;
pub mod site_browser;
pub mod site_icons;
#[doc(hidden)]
pub mod test_util;
pub mod upstream;
