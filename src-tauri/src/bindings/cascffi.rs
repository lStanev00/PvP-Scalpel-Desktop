use std::os::raw::{c_char, c_uint};
use libloading::{Library, Symbol};
use tauri::{AppHandle, Manager};
use std::path::PathBuf;

pub type CascOpenFn = unsafe extern "C" fn(
    base_path: *const c_char,
    product: *const c_char,
    out_handle: *mut usize,  // usize = uintptr_t on 64-bit
) -> ::std::os::raw::c_int;

pub type CascReadFileFn = unsafe extern "C" fn(
    handle: usize,
    path: *const c_char,
    out_buf: *mut *mut u8,
    out_len: *mut c_uint,
) -> ::std::os::raw::c_int;

pub type CascFreeBufFn = unsafe extern "C" fn(ptr: *mut u8);
pub type CascCloseFn  = unsafe extern "C" fn(handle: usize);

pub struct CascFFI {
    pub open: CascOpenFn,
    pub read_file: CascReadFileFn,
    pub free_buf: CascFreeBufFn,
    pub close: CascCloseFn,
    _lib: Library,
}

impl CascFFI {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let dll_path: PathBuf = app
            .path()
            .resolve("resources/cascffi/CascFFI.dll", tauri::path::BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve CascFFI.dll: {e}"))?;

        unsafe {
            let lib = Library::new(&dll_path)
                .map_err(|e| format!("Failed to load CascFFI.dll: {e}"))?;

            let open: Symbol<CascOpenFn> =
                lib.get(b"casc_open\0")
                .map_err(|e| format!("Missing export casc_open: {e}"))?;

            let read_file: Symbol<CascReadFileFn> =
                lib.get(b"casc_read_file\0")
                .map_err(|e| format!("Missing export casc_read_file: {e}"))?;

            let free_buf: Symbol<CascFreeBufFn> =
                lib.get(b"casc_free_buf\0")
                .map_err(|e| format!("Missing export casc_free_buf: {e}"))?;

            let close: Symbol<CascCloseFn> =
                lib.get(b"casc_close\0")
                .map_err(|e| format!("Missing export casc_close: {e}"))?;

            Ok(Self {
                open: *open,
                read_file: *read_file,
                free_buf: *free_buf,
                close: *close,
                _lib: lib,
            })
        }
    }
}
