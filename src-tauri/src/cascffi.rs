use std::ffi::CString;
use std::os::raw::{c_char, c_uint};

#[repr(transparent)]
#[derive(Copy, Clone, Debug)]
pub struct CascHandle(pub usize);

#[link(name = "CascFFI")]
extern "C" {
    fn casc_open(base_path: *const c_char, product: *const c_char, out_handle: *mut usize) -> i32;
    fn casc_read_file(handle: usize, path: *const c_char, out_buf: *mut *mut u8, out_len: *mut c_uint) -> i32;
    fn casc_free_buf(ptr: *mut u8);
    fn casc_close(handle: usize);
}

pub struct CascStorage {
    handle: usize,
}

impl CascStorage {
    pub fn open(base_path: &str, product: &str) -> Result<Self, String> {
        let base_path_c = CString::new(base_path).unwrap();
        let product_c = CString::new(product).unwrap();

        let mut handle = 0usize;
        let result = unsafe { casc_open(base_path_c.as_ptr(), product_c.as_ptr(), &mut handle) };

        if result != 0 {
            return Err("Failed to open CASC storage".into());
        }
        Ok(Self { handle })
    }

    pub fn read_file(&self, file: &str) -> Result<Vec<u8>, String> {
        let path_c = CString::new(file).unwrap();

        let mut buf: *mut u8 = std::ptr::null_mut();
        let mut len: c_uint = 0;

        let result = unsafe { casc_read_file(self.handle, path_c.as_ptr(), &mut buf, &mut len) };

        if result != 0 {
            return Err(format!("CASC cannot read file: {file}"));
        }

        let data = unsafe { std::slice::from_raw_parts(buf, len as usize).to_vec() };

        unsafe { casc_free_buf(buf) };

        Ok(data)
    }
}

impl Drop for CascStorage {
    fn drop(&mut self) {
        unsafe { casc_close(self.handle) };
    }
}
