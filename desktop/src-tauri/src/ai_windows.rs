// Windows TLS and per-user credential protection, without an extra runtime.
use std::{
    ffi::c_void,
    ptr::{null, null_mut},
};
type Handle = *mut c_void;
#[repr(C)]
struct Blob {
    size: u32,
    data: *mut u8,
}
#[link(name = "crypt32")]
extern "system" {
    fn CryptProtectData(
        input: *const Blob,
        description: *const u16,
        entropy: *const Blob,
        reserved: Handle,
        prompt: Handle,
        flags: u32,
        output: *mut Blob,
    ) -> i32;
    fn CryptUnprotectData(
        input: *const Blob,
        description: *mut *mut u16,
        entropy: *const Blob,
        reserved: Handle,
        prompt: Handle,
        flags: u32,
        output: *mut Blob,
    ) -> i32;
}
#[link(name = "kernel32")]
extern "system" {
    fn LocalFree(memory: Handle) -> Handle;
}
pub fn protect(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    let input = Blob {
        size: bytes.len().try_into().map_err(|_| "Credential too large")?,
        data: bytes.as_ptr() as *mut u8,
    };
    let mut output = Blob {
        size: 0,
        data: null_mut(),
    };
    let ok = unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                null(),
                null(),
                null_mut(),
                null_mut(),
                1,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                null_mut(),
                null(),
                null_mut(),
                null_mut(),
                1,
                &mut output,
            )
        }
    };
    if ok == 0 {
        return Err(
            "Windows could not protect/read this API Key / Windows 无法保护或读取此 API Key".into(),
        );
    }
    let result = unsafe { std::slice::from_raw_parts(output.data, output.size as usize).to_vec() };
    unsafe {
        LocalFree(output.data.cast());
    }
    Ok(result)
}
#[link(name = "winhttp")]
extern "system" {
    fn WinHttpOpen(
        agent: *const u16,
        access: u32,
        proxy: *const u16,
        bypass: *const u16,
        flags: u32,
    ) -> Handle;
    fn WinHttpConnect(session: Handle, server: *const u16, port: u16, reserved: u32) -> Handle;
    fn WinHttpOpenRequest(
        connection: Handle,
        verb: *const u16,
        path: *const u16,
        version: *const u16,
        referer: *const u16,
        accept: *const *const u16,
        flags: u32,
    ) -> Handle;
    fn WinHttpSetTimeouts(
        handle: Handle,
        resolve: i32,
        connect: i32,
        send: i32,
        receive: i32,
    ) -> i32;
    fn WinHttpSetOption(handle: Handle, option: u32, buffer: *const c_void, length: u32) -> i32;
    fn WinHttpSendRequest(
        request: Handle,
        headers: *const u16,
        length: u32,
        body: *const c_void,
        body_size: u32,
        total: u32,
        context: usize,
    ) -> i32;
    fn WinHttpReceiveResponse(request: Handle, reserved: Handle) -> i32;
    fn WinHttpQueryHeaders(
        request: Handle,
        level: u32,
        name: *const u16,
        buffer: *mut c_void,
        length: *mut u32,
        index: *mut u32,
    ) -> i32;
    fn WinHttpReadData(request: Handle, buffer: *mut c_void, size: u32, read: *mut u32) -> i32;
    fn WinHttpCloseHandle(handle: Handle) -> i32;
}
struct Owned(Handle);
impl Owned {
    fn new(h: Handle) -> Result<Self, String> {
        if h.is_null() {
            Err(network_error())
        } else {
            Ok(Self(h))
        }
    }
}
impl Drop for Owned {
    fn drop(&mut self) {
        unsafe {
            WinHttpCloseHandle(self.0);
        }
    }
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
fn network_error() -> String {
    format!(
        "AI connection failed / AI 连接失败（Windows {}）；请检查网络",
        std::io::Error::last_os_error().raw_os_error().unwrap_or(0)
    )
}
pub fn post(host: &str, path: &str, key: &str, body: &[u8]) -> Result<Vec<u8>, String> {
    unsafe {
        if !matches!(
            (host, path),
            ("api.openai.com", "/v1/chat/completions") | ("api.deepseek.com", "/chat/completions")
        ) {
            return Err("Unapproved AI destination".into());
        }
        let session = Owned::new(WinHttpOpen(
            wide("Spektra Studio/1.3.4").as_ptr(),
            4,
            null(),
            null(),
            0,
        ))?;
        if WinHttpSetTimeouts(session.0, 15000, 15000, 30000, 90000) == 0 {
            return Err(network_error());
        }
        let connection = Owned::new(WinHttpConnect(session.0, wide(host).as_ptr(), 443, 0))?;
        let request = Owned::new(WinHttpOpenRequest(
            connection.0,
            wide("POST").as_ptr(),
            wide(path).as_ptr(),
            null(),
            null(),
            null(),
            0x00800000,
        ))?;
        // Never forward the API Key to a redirected destination.
        let policy: u32 = 0;
        if WinHttpSetOption(request.0, 88, (&policy as *const u32).cast(), 4) == 0 {
            return Err(network_error());
        }
        let headers = wide(&format!(
            "Content-Type: application/json\r\nAuthorization: Bearer {key}\r\n"
        ));
        if WinHttpSendRequest(
            request.0,
            headers.as_ptr(),
            (headers.len() - 1) as u32,
            body.as_ptr().cast(),
            body.len() as u32,
            body.len() as u32,
            0,
        ) == 0
            || WinHttpReceiveResponse(request.0, null_mut()) == 0
        {
            return Err(network_error());
        }
        let mut status: u32 = 0;
        let mut length = 4;
        if WinHttpQueryHeaders(
            request.0,
            19 | 0x20000000,
            null(),
            (&mut status as *mut u32).cast(),
            &mut length,
            null_mut(),
        ) == 0
        {
            return Err(network_error());
        }
        if !(200..300).contains(&status) {
            return Err(match status {
                401 | 403 => {
                    "API Key rejected or model access denied / API Key 无效或没有模型权限".into()
                }
                429 => "API quota/rate limit reached / API 额度不足或请求过于频繁".into(),
                404 => "Model or endpoint not found / 模型不存在".into(),
                _ => format!("AI API returned HTTP {status} / 请检查模型名称和 API 服务状态"),
            });
        }
        let mut bytes = Vec::new();
        let mut buffer = [0u8; 8192];
        loop {
            let mut read = 0;
            if WinHttpReadData(
                request.0,
                buffer.as_mut_ptr().cast(),
                buffer.len() as u32,
                &mut read,
            ) == 0
            {
                return Err(network_error());
            }
            if read == 0 {
                break;
            }
            if bytes.len() + read as usize > 1024 * 1024 {
                return Err("AI response exceeds size limit".into());
            }
            bytes.extend_from_slice(&buffer[..read as usize]);
        }
        Ok(bytes)
    }
}
