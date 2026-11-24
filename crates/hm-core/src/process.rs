//! Subprocess helpers shared across modules.

use std::ffi::OsStr;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// A `Command` configured not to flash a console window on Windows.
pub(crate) fn cmd(program: impl AsRef<OsStr>) -> Command {
  let mut c = Command::new(program);
  #[cfg(target_os = "windows")]
  c.creation_flags(CREATE_NO_WINDOW);
  c
}
