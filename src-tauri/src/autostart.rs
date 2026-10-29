//! Real Windows startup registration: the `DnsMaster` value under
//! `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
//!
//! The value is a plain `REG_SZ` command line, so no scheduled task or
//! elevation is involved: the current user can always remove it.

use std::path::Path;

use crate::CommandError;

#[cfg(windows)]
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE_NAME: &str = "DnsMaster";

/// The exact `REG_SZ` payload: quoted executable followed by the boot flag.
pub fn format_run_command(exe: &Path) -> String {
    format!("\"{}\" --minimized", exe.display())
}

fn autostart_error(message: impl Into<String>) -> CommandError {
    CommandError {
        code: "AUTOSTART_FAILED".to_string(),
        message: message.into(),
    }
}

#[cfg(windows)]
fn open_run_key(access: u32) -> Result<windows_sys::Win32::System::Registry::HKEY, CommandError> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{RegOpenKeyExW, HKEY, HKEY_CURRENT_USER};

    let path: Vec<u16> = RUN_KEY.encode_utf16().chain(Some(0)).collect();
    let mut key: HKEY = null_mut();
    let status = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, path.as_ptr(), 0, access, &mut key) };
    if status == ERROR_SUCCESS && !key.is_null() {
        Ok(key)
    } else {
        Err(autostart_error(format!(
            "Could not open HKCU\\{RUN_KEY} (Windows error {status})."
        )))
    }
}

#[cfg(windows)]
fn read_value() -> Option<String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{RegCloseKey, RegQueryValueExW, KEY_READ};

    let key = open_run_key(KEY_READ).ok()?;
    let name: Vec<u16> = VALUE_NAME.encode_utf16().chain(Some(0)).collect();
    let mut kind = 0u32;
    let mut bytes = 0u32;
    let status = unsafe {
        RegQueryValueExW(
            key,
            name.as_ptr(),
            null(),
            &mut kind,
            null_mut(),
            &mut bytes,
        )
    };
    if status != ERROR_SUCCESS || bytes == 0 {
        unsafe { RegCloseKey(key) };
        return None;
    }
    let mut buffer = vec![0u16; bytes as usize / 2 + 1];
    let status = unsafe {
        RegQueryValueExW(
            key,
            name.as_ptr(),
            null(),
            &mut kind,
            buffer.as_mut_ptr() as *mut u8,
            &mut bytes,
        )
    };
    unsafe { RegCloseKey(key) };
    if status != ERROR_SUCCESS {
        return None;
    }
    buffer.truncate(bytes as usize / 2);
    Some(
        String::from_utf16_lossy(&buffer)
            .trim_end_matches('\0')
            .to_string(),
    )
}

#[cfg(windows)]
fn write_value(command: &str) -> Result<(), CommandError> {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegSetValueExW, KEY_SET_VALUE, REG_SZ,
    };

    let key = open_run_key(KEY_SET_VALUE)?;
    let name: Vec<u16> = VALUE_NAME.encode_utf16().chain(Some(0)).collect();
    let data: Vec<u16> = command.encode_utf16().chain(Some(0)).collect();
    let status = unsafe {
        RegSetValueExW(
            key,
            name.as_ptr(),
            0,
            REG_SZ,
            data.as_ptr() as *const u8,
            (data.len() * 2) as u32,
        )
    };
    unsafe { RegCloseKey(key) };
    if status == ERROR_SUCCESS {
        Ok(())
    } else {
        Err(autostart_error(format!(
            "Could not write the DnsMaster startup value (Windows error {status})."
        )))
    }
}

#[cfg(windows)]
fn delete_value() -> Result<(), CommandError> {
    use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{RegCloseKey, RegDeleteValueW, KEY_SET_VALUE};

    let key = open_run_key(KEY_SET_VALUE)?;
    let name: Vec<u16> = VALUE_NAME.encode_utf16().chain(Some(0)).collect();
    let status = unsafe { RegDeleteValueW(key, name.as_ptr()) };
    unsafe { RegCloseKey(key) };
    if status == ERROR_SUCCESS || status == ERROR_FILE_NOT_FOUND {
        Ok(())
    } else {
        Err(autostart_error(format!(
            "Could not remove the DnsMaster startup value (Windows error {status})."
        )))
    }
}

/// Debug builds must never register `target\debug\dns-master.exe`. Set
/// `DNSMASTER_TEST_AUTOSTART=1` to exercise the real write path in a test.
#[cfg(windows)]
fn can_write_startup() -> bool {
    !cfg!(debug_assertions) || std::env::var_os("DNSMASTER_TEST_AUTOSTART").is_some()
}

/// True when the startup value exists and is not blank.
pub fn is_enabled() -> bool {
    #[cfg(windows)]
    {
        read_value().is_some_and(|value| !value.trim().is_empty())
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Writes or removes the startup value and returns the verified registry state.
pub fn set_enabled(enabled: bool) -> Result<bool, CommandError> {
    #[cfg(windows)]
    {
        if !can_write_startup() {
            return Ok(is_enabled());
        }
        if enabled {
            let exe = std::env::current_exe().map_err(|error| {
                autostart_error(format!(
                    "Could not locate the Dns Master executable: {error}"
                ))
            })?;
            write_value(&format_run_command(&exe))?;
        } else {
            delete_value()?;
        }
        Ok(is_enabled())
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Err(CommandError {
            code: "AUTOSTART_UNAVAILABLE".to_string(),
            message: "Startup registration is Windows-only.".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_the_run_command_with_quotes_and_the_minimized_flag() {
        let command = format_run_command(Path::new(r"C:\Program Files\Dns Master\dns-master.exe"));
        assert_eq!(
            command,
            r#""C:\Program Files\Dns Master\dns-master.exe" --minimized"#
        );
        assert!(command.starts_with('"') && command.ends_with("--minimized"));
    }

    #[cfg(windows)]
    #[test]
    fn debug_builds_skip_the_run_key_unless_opted_in() {
        if cfg!(debug_assertions) && std::env::var_os("DNSMASTER_TEST_AUTOSTART").is_none() {
            assert!(!can_write_startup());
        }
    }

    #[cfg(windows)]
    #[test]
    fn reads_the_startup_state_without_writing() {
        // Read-only on the live host: the write path is exercised by the app toggle.
        let _ = is_enabled();
    }
}
