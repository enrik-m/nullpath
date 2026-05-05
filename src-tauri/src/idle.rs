//! OS-level user idle detection.
//!
//! Returns the number of seconds since the last keyboard/mouse input was
//! observed by the OS. The frontend polls this from a long-lived interval
//! while a session is active and decides whether to auto-pause based on the
//! configured threshold.

#[tauri::command]
pub fn idle_supported_on_platform() -> bool {
    cfg!(any(target_os = "windows", target_os = "macos", target_os = "linux"))
}

#[tauri::command]
pub fn get_idle_seconds() -> Result<u64, String> {
    platform::idle_seconds().map_err(|e| e.to_string())
}

// --------------------------------------------------------------------------
// Windows: GetLastInputInfo + GetTickCount64.
// --------------------------------------------------------------------------
#[cfg(target_os = "windows")]
mod platform {
    use windows_sys::Win32::System::SystemInformation::GetTickCount64;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    pub fn idle_seconds() -> std::io::Result<u64> {
        unsafe {
            let mut info = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };
            if GetLastInputInfo(&mut info) == 0 {
                return Err(std::io::Error::last_os_error());
            }
            let now: u64 = GetTickCount64();
            let last: u64 = info.dwTime as u64;
            Ok((now.saturating_sub(last)) / 1000)
        }
    }
}

// --------------------------------------------------------------------------
// macOS: CGEventSourceSecondsSinceLastEventType.
// --------------------------------------------------------------------------
#[cfg(target_os = "macos")]
mod platform {
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    pub fn idle_seconds() -> std::io::Result<u64> {
        // 0xFFFFFFFF == kCGAnyInputEventType — secondsSinceLastEventType
        // returns the wall-clock seconds since the last input of any kind.
        const ANY_INPUT_EVENT: u32 = 0xFFFFFFFF;
        let secs = CGEventSource::seconds_since_last_event_type(
            CGEventSourceStateID::HIDSystemState,
            ANY_INPUT_EVENT,
        );
        Ok(secs as u64)
    }
}

// --------------------------------------------------------------------------
// Linux (X11): XScreenSaverQueryInfo.
// Wayland sessions will return an error and the frontend falls back to
// in-window idle detection.
// --------------------------------------------------------------------------
#[cfg(target_os = "linux")]
mod platform {
    use std::ptr;
    use x11::xlib::{XCloseDisplay, XDefaultRootWindow, XOpenDisplay};
    use x11::xss::{XScreenSaverAllocInfo, XScreenSaverQueryInfo};

    pub fn idle_seconds() -> std::io::Result<u64> {
        unsafe {
            let display = XOpenDisplay(ptr::null());
            if display.is_null() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "could not open X display (Wayland session?)",
                ));
            }
            let info = XScreenSaverAllocInfo();
            if info.is_null() {
                XCloseDisplay(display);
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "XScreenSaverAllocInfo failed",
                ));
            }
            let root = XDefaultRootWindow(display);
            XScreenSaverQueryInfo(display, root, info);
            let idle_ms = (*info).idle as u64;
            // Note: we deliberately leak `info` here — XCloseDisplay takes
            // care of cleanup at process shutdown and this is called frequently.
            XCloseDisplay(display);
            Ok(idle_ms / 1000)
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod platform {
    pub fn idle_seconds() -> std::io::Result<u64> {
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "OS idle detection not implemented on this platform",
        ))
    }
}
