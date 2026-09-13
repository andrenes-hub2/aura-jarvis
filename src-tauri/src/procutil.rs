//! Every helper subprocess we spawn (claude, npm, node, winget, tailscale,
//! ...) is a Windows console-subsystem executable. AURA's release build has
//! no console of its own (`windows_subsystem = "windows"`), so without
//! `CREATE_NO_WINDOW`, Windows allocates and briefly flashes a brand new
//! console window for each one — harmless in `tauri dev` only because that
//! debug build keeps its own console for the child to inherit into. Every
//! `Command` we build for a silent helper process should go through here
//! instead of `Command::new` directly, so this fix can't be missed at a new
//! call site.

pub(crate) fn tokio_command(program: impl AsRef<std::ffi::OsStr>) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

pub(crate) fn std_command(program: impl AsRef<std::ffi::OsStr>) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
