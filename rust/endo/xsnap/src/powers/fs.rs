//! Filesystem host functions backed by cap-std.
//!
//! Each function resolves a directory from either a string token
//! (looked up in `HostPowers.dirs`) or a numeric handle (looked up
//! in `DIR_MAP`), then performs the operation within that directory's
//! capability scope.
//!
//! JS calling convention:
//!   readFileText(dirOrToken, path) -> string
//!   writeFileText(dirOrToken, path, data) -> undefined
//!   readDir(dirOrToken, path) -> string[] (JSON-encoded)
//!   mkdir(dirOrToken, path) -> undefined
//!   remove(dirOrToken, path) -> undefined
//!   rename(dirOrToken, fromPath, toPath) -> undefined
//!   exists(dirOrToken, path) -> boolean
//!   isDir(dirOrToken, path) -> boolean
//!   openDir(dirOrToken, path) -> number (handle)
//!   closeDir(handle) -> undefined
//!   symlink(dirOrToken, target, linkName) -> undefined
//!   link(dirOrToken, srcPath, dstPath) -> undefined

use crate::ffi::*;
use crate::powers::HostPowers;
use crate::worker_io::{arg_str, read_typed_array_bytes, set_result_string};
use std::collections::HashMap;
use std::io::{BufReader, BufWriter, Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

/// Helper: get HostPowers from the machine context.
///
/// # Safety
/// Machine context must have been set to a valid `*mut HostPowers`.
unsafe fn get_powers(the: *mut XsMachine) -> &'static HostPowers {
    &*((*the).context as *const HostPowers)
}

/// Helper: read a raw byte slice argument from the XS stack frame.
///
/// XS stores JavaScript strings as null-terminated byte sequences using
/// a CESU-8-like encoding: surrogate code units in the BMP are emitted
/// as individual 3-byte sequences rather than combined into 4-byte
/// UTF-8. Strings that contain astral-plane characters (e.g. emoji) are
/// therefore not valid UTF-8 after `fxToString`.
///
/// For arguments carrying arbitrary text payloads (file contents,
/// arbitrary strings to hash, etc.) we must read the raw bytes and
/// pass them through unmodified rather than UTF-8-validating them.
///
/// # Safety
/// `the` must be valid, index must be in range, and the slot must be
/// coercible to a string.
unsafe fn arg_bytes(the: *mut XsMachine, index: usize) -> &'static [u8] {
    let slot = (*the).frame.sub(1 + index);
    let ptr = fxToString(the, slot) as *const u8;
    let mut len = 0usize;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    std::slice::from_raw_parts(ptr, len)
}

/// Helper: set xsResult to a string from raw bytes. The bytes must not
/// contain an interior NUL. Used when passing potentially non-UTF-8
/// XS string bytes (CESU-8 surrogate encoding) back to JS intact.
unsafe fn set_result_bytes(the: *mut XsMachine, bytes: &[u8]) {
    // Build a null-terminated buffer without going through CString
    // (which would reject interior NULs but also requires valid UTF-8
    // nowhere — CString itself is fine; we just skip that assertion).
    let mut buf = Vec::with_capacity(bytes.len() + 1);
    buf.extend_from_slice(bytes);
    buf.push(0);
    fxString(the, &mut (*the).scratch, buf.as_ptr() as *const std::os::raw::c_char);
    *(*the).frame.add(1) = (*the).scratch;
}

/// Helper: set xsResult to a boolean.
unsafe fn set_result_bool(the: *mut XsMachine, v: bool) {
    fxBoolean(the, &mut (*the).scratch, if v { 1 } else { 0 });
    *(*the).frame.add(1) = (*the).scratch;
}

// ---------------------------------------------------------------------------
// Handle-based streaming file I/O
// ---------------------------------------------------------------------------

/// An open file resource for streaming reads or writes.
enum FileResource {
    Reader(BufReader<cap_std::fs::File>),
    Writer(BufWriter<cap_std::fs::File>),
}

static NEXT_FILE_HANDLE: AtomicU32 = AtomicU32::new(1);
static FILE_MAP: Mutex<Option<HashMap<u32, FileResource>>> = Mutex::new(None);

fn get_file_map() -> std::sync::MutexGuard<'static, Option<HashMap<u32, FileResource>>> {
    let mut guard = FILE_MAP.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    guard
}

// ---------------------------------------------------------------------------
// Handle-based open directory registry
// ---------------------------------------------------------------------------

static NEXT_DIR_HANDLE: AtomicU32 = AtomicU32::new(1);
static DIR_MAP: Mutex<Option<HashMap<u32, cap_std::fs::Dir>>> = Mutex::new(None);

fn get_dir_map() -> std::sync::MutexGuard<'static, Option<HashMap<u32, cap_std::fs::Dir>>> {
    let mut guard = DIR_MAP.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    guard
}

/// Read the directory-token slot without resolving it to a `Dir`.
///
/// Returns `None` if the slot is a numeric handle (a previously-opened
/// directory that has no associated string token). Used by ambient
/// root-token fallbacks that operate via `std::fs` on absolute paths.
unsafe fn arg_dir_token(the: *mut XsMachine, slot_index: usize) -> Option<String> {
    let slot = (*the).frame.sub(1 + slot_index);
    let ty = fxTypeOf(the, slot);
    if ty == XS_INTEGER_TYPE || ty == XS_NUMBER_TYPE {
        None
    } else {
        Some(arg_str(the, slot_index))
    }
}

/// Turn a root-token relative path (leading slash stripped by the
/// daemon JS) back into an absolute filesystem path.
fn root_to_abs(path: &str) -> std::path::PathBuf {
    if path.starts_with('/') {
        std::path::PathBuf::from(path)
    } else {
        std::path::PathBuf::from("/").join(path)
    }
}

/// Resolve a directory from either a numeric handle (looked up in
/// `DIR_MAP`) or a string token (looked up in `HostPowers.dirs`).
/// Returns an **owned** `Dir` via `try_clone()` so that all locks
/// are released before the caller operates on the directory.
///
/// # Safety
/// `the` must be valid, `slot_index` must be in range.
unsafe fn resolve_dir(
    the: *mut XsMachine,
    slot_index: usize,
) -> Result<cap_std::fs::Dir, String> {
    let slot = (*the).frame.sub(1 + slot_index);
    let ty = fxTypeOf(the, slot);
    if ty == XS_INTEGER_TYPE || ty == XS_NUMBER_TYPE {
        let handle = fxToInteger(the, slot) as u32;
        let map = get_dir_map();
        match map.as_ref().unwrap().get(&handle) {
            Some(dir) => dir
                .try_clone()
                .map_err(|e| format!("Error: {}", e)),
            None => Err(format!(
                "Error: invalid directory handle {}",
                handle
            )),
        }
    } else {
        let token = arg_str(the, slot_index);
        let powers = get_powers(the);
        match powers.get_dir(&token) {
            Some(dir) => dir
                .try_clone()
                .map_err(|e| format!("Error: {}", e)),
            None => Err(format!(
                "Error: unknown directory token '{}'",
                token
            )),
        }
    }
}

/// `openReader(dirOrToken, path) -> number | string`
///
/// Opens a file for reading, wraps in BufReader, returns a handle.
/// Returns an "Error: ..." string on failure.
pub unsafe extern "C" fn host_open_reader(the: *mut XsMachine) {
    let path = arg_str(the, 1);

    match resolve_dir(the, 0) {
        Ok(dir) => match dir.open(path) {
            Ok(file) => {
                let handle = NEXT_FILE_HANDLE.fetch_add(1, Ordering::SeqCst);
                let mut map = get_file_map();
                map.as_mut()
                    .unwrap()
                    .insert(handle, FileResource::Reader(BufReader::new(file)));
                fxInteger(the, &mut (*the).scratch, handle as i32);
                *(*the).frame.add(1) = (*the).scratch;
            }
            Err(e) => set_result_string(the, &format!("Error: {}", e)),
        },
        Err(msg) => set_result_string(the, &msg),
    }
}

/// `read(handle, maxBytes) -> ArrayBuffer | null`
///
/// Reads up to maxBytes from the open reader handle.
/// Returns an ArrayBuffer with the bytes read, or null on EOF.
/// Returns an "Error: ..." string for invalid handles.
pub unsafe extern "C" fn host_read_chunk(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(1);
    let handle = fxToInteger(the, handle_slot) as u32;
    let max_slot = (*the).frame.sub(2);
    let max_bytes = fxToInteger(the, max_slot) as usize;

    let mut map = get_file_map();
    match map.as_mut().unwrap().get_mut(&handle) {
        Some(FileResource::Reader(reader)) => {
            let mut buf = vec![0u8; max_bytes];
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF — return null
                    fxNull(the, &mut (*the).scratch);
                    *(*the).frame.add(1) = (*the).scratch;
                }
                Ok(n) => {
                    fxArrayBuffer(
                        the,
                        &mut (*the).scratch,
                        buf.as_mut_ptr() as *mut _,
                        n as i32,
                        n as i32,
                    );
                    *(*the).frame.add(1) = (*the).scratch;
                }
                Err(e) => set_result_string(the, &format!("Error: {}", e)),
            }
        }
        _ => set_result_string(the, "Error: invalid file handle"),
    }
}

/// `closeReader(handle) -> undefined`
///
/// Closes the reader handle. Idempotent.
pub unsafe extern "C" fn host_close_reader(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(1);
    let handle = fxToInteger(the, handle_slot) as u32;
    let mut map = get_file_map();
    map.as_mut().unwrap().remove(&handle);
}

/// `openWriter(dirOrToken, path) -> number | string`
///
/// Creates/truncates a file for writing, wraps in BufWriter,
/// returns a handle. Returns an "Error: ..." string on failure.
pub unsafe extern "C" fn host_open_writer(the: *mut XsMachine) {
    let path = arg_str(the, 1);

    match resolve_dir(the, 0) {
        Ok(dir) => match dir.create(path) {
            Ok(file) => {
                let handle = NEXT_FILE_HANDLE.fetch_add(1, Ordering::SeqCst);
                let mut map = get_file_map();
                map.as_mut()
                    .unwrap()
                    .insert(handle, FileResource::Writer(BufWriter::new(file)));
                fxInteger(the, &mut (*the).scratch, handle as i32);
                *(*the).frame.add(1) = (*the).scratch;
            }
            Err(e) => set_result_string(the, &format!("Error: {}", e)),
        },
        Err(msg) => set_result_string(the, &msg),
    }
}

/// `write(handle, uint8Array) -> undefined | string`
///
/// Writes bytes from a Uint8Array to the open writer handle.
/// Returns undefined on success, or an "Error: ..." string on failure.
pub unsafe extern "C" fn host_write_chunk(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(1);
    let handle = fxToInteger(the, handle_slot) as u32;
    let data_slot = (*the).frame.sub(2);

    let buf = match read_typed_array_bytes(the, data_slot) {
        Some(b) => b,
        None => return, // empty typed array — no-op
    };

    let mut map = get_file_map();
    match map.as_mut().unwrap().get_mut(&handle) {
        Some(FileResource::Writer(writer)) => {
            if let Err(e) = writer.write_all(&buf) {
                set_result_string(the, &format!("Error: {}", e));
            }
        }
        _ => set_result_string(the, "Error: invalid file handle"),
    }
}

/// `closeWriter(handle) -> undefined`
///
/// Flushes and closes the writer handle. Idempotent.
pub unsafe extern "C" fn host_close_writer(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(1);
    let handle = fxToInteger(the, handle_slot) as u32;

    let mut map = get_file_map();
    if let Some(FileResource::Writer(mut writer)) = map.as_mut().unwrap().remove(&handle) {
        let _ = writer.flush();
    }
}

/// `readFileText(dirOrToken, path) -> string`
///
/// Reads the entire file as a byte sequence and hands it back to XS as
/// a string. File contents are not UTF-8-validated: XS stores
/// JavaScript strings as CESU-8 with surrogate code units preserved as
/// individual 3-byte sequences, so round-tripping a string containing
/// astral-plane characters (e.g. emoji) requires passing the raw bytes
/// through unchanged.
pub unsafe extern "C" fn host_read_file_text(the: *mut XsMachine) {
    let path = arg_str(the, 1);

    if arg_dir_token(the, 0).as_deref() == Some("root") {
        match std::fs::read(root_to_abs(&path)) {
            Ok(contents) => set_result_bytes(the, &contents),
            Err(e) => set_result_string(the, &format!("Error: {}", e)),
        }
        return;
    }

    match resolve_dir(the, 0) {
        Ok(dir) => match dir.open(path) {
            Ok(mut file) => {
                let mut contents = Vec::new();
                match file.read_to_end(&mut contents) {
                    Ok(_) => set_result_bytes(the, &contents),
                    Err(e) => set_result_string(the, &format!("Error: {}", e)),
                }
            }
            Err(e) => set_result_string(the, &format!("Error: {}", e)),
        },
        Err(msg) => set_result_string(the, &msg),
    }
}

/// `writeFileText(dirOrToken, path, data) -> string | undefined`
///
/// Writes data (UTF-8 string) to the file, creating or truncating it.
/// Returns undefined on success, or an "Error: ..." string on failure.
pub unsafe extern "C" fn host_write_file_text(the: *mut XsMachine) {
    let path = arg_str(the, 1);
    // Read the file contents as raw bytes (may be non-UTF-8 CESU-8).
    let data = arg_bytes(the, 2);

    if arg_dir_token(the, 0).as_deref() == Some("root") {
        let abs = root_to_abs(&path);
        if let Err(e) = std::fs::write(&abs, data) {
            set_result_string(the, &format!("Error: {}", e));
        }
        return;
    }

    match resolve_dir(the, 0) {
        Ok(dir) => {
            if let Err(e) = dir.write(path, data) {
                set_result_string(the, &format!("Error: {}", e));
            }
        }
        Err(msg) => set_result_string(the, &msg),
    }
}

/// `readDir(dirOrToken, path) -> string`
///
/// Returns a JSON array of entry names.
pub unsafe extern "C" fn host_read_dir(the: *mut XsMachine) {
    let path = arg_str(the, 1);

    let encode_json = |names: Vec<String>| -> String {
        format!(
            "[{}]",
            names
                .iter()
                .map(|n| format!(
                    "\"{}\"",
                    n.replace('\\', "\\\\").replace('"', "\\\"")
                ))
                .collect::<Vec<_>>()
                .join(",")
        )
    };

    if arg_dir_token(the, 0).as_deref() == Some("root") {
        match std::fs::read_dir(root_to_abs(&path)) {
            Ok(entries) => {
                let names: Vec<String> = entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .collect();
                set_result_string(the, &encode_json(names));
            }
            Err(e) => set_result_string(the, &format!("Error: {}", e)),
        }
        return;
    }

    match resolve_dir(the, 0) {
        Ok(dir) => {
            let sub = if path.is_empty() {
                dir.entries()
            } else {
                match dir.open_dir(path) {
                    Ok(sub) => sub.entries(),
                    Err(e) => {
                        set_result_string(the, &format!("Error: {}", e));
                        return;
                    }
                }
            };
            match sub {
                Ok(entries) => {
                    let names: Vec<String> = entries
                        .filter_map(|e| e.ok())
                        .map(|e| e.file_name().to_string_lossy().into_owned())
                        .collect();
                    set_result_string(the, &encode_json(names));
                }
                Err(e) => set_result_string(the, &format!("Error: {}", e)),
            }
        }
        Err(msg) => set_result_string(the, &msg),
    }
}

/// `mkdir(dirOrToken, path) -> string | undefined`
///
/// Creates the directory and all parent directories.
/// Returns undefined on success, or an "Error: ..." string on failure.
pub unsafe extern "C" fn host_mkdir(the: *mut XsMachine) {
    let path = arg_str(the, 1);

    if arg_dir_token(the, 0).as_deref() == Some("root") {
        if let Err(e) = std::fs::create_dir_all(root_to_abs(&path)) {
            set_result_string(the, &format!("Error: {}", e));
        }
        return;
    }

    match resolve_dir(the, 0) {
        Ok(dir) => {
            if let Err(e) = dir.create_dir_all(path) {
                set_result_string(the, &format!("Error: {}", e));
            }
        }
        Err(msg) => set_result_string(the, &msg),
    }
}

/// `remove(dirOrToken, path) -> string | undefined`
///
/// Removes a file.
/// Returns undefined on success, or an "Error: ..." string on failure.
pub unsafe extern "C" fn host_remove(the: *mut XsMachine) {
    let path = arg_str(the, 1);

    if arg_dir_token(the, 0).as_deref() == Some("root") {
        let abs = root_to_abs(&path);
        let result = match std::fs::symlink_metadata(&abs) {
            Ok(meta) if meta.is_dir() => std::fs::remove_dir(&abs),
            _ => std::fs::remove_file(&abs),
        };
        if let Err(e) = result {
            set_result_string(the, &format!("Error: {}", e));
        }
        return;
    }

    match resolve_dir(the, 0) {
        Ok(dir) => {
            if let Err(e) = dir.remove_file(path) {
                set_result_string(the, &format!("Error: {}", e));
            }
        }
        Err(msg) => set_result_string(the, &msg),
    }
}

/// `rename(dirOrToken, fromPath, toPath) -> string | undefined`
///
/// Renames a file within the same directory scope.
/// Returns undefined on success, or an "Error: ..." string on failure.
pub unsafe extern "C" fn host_rename(the: *mut XsMachine) {
    let from = arg_str(the, 1);
    let to = arg_str(the, 2);

    if arg_dir_token(the, 0).as_deref() == Some("root") {
        if let Err(e) = std::fs::rename(root_to_abs(&from), root_to_abs(&to)) {
            set_result_string(the, &format!("Error: {}", e));
        }
        return;
    }

    match resolve_dir(the, 0) {
        Ok(dir) => {
            if let Err(e) = dir.rename(from, &dir, to) {
                set_result_string(the, &format!("Error: {}", e));
            }
        }
        Err(msg) => set_result_string(the, &msg),
    }
}

/// `exists(dirOrToken, path) -> boolean`
pub unsafe extern "C" fn host_exists(the: *mut XsMachine) {
    let path = arg_str(the, 1);

    if arg_dir_token(the, 0).as_deref() == Some("root") {
        let exists = std::fs::symlink_metadata(root_to_abs(&path)).is_ok();
        set_result_bool(the, exists);
        return;
    }

    let exists = resolve_dir(the, 0)
        .ok()
        .and_then(|dir| dir.try_exists(path).ok())
        .unwrap_or(false);
    set_result_bool(the, exists);
}

/// `isDir(dirOrToken, path) -> boolean`
pub unsafe extern "C" fn host_is_dir(the: *mut XsMachine) {
    let path = arg_str(the, 1);

    if arg_dir_token(the, 0).as_deref() == Some("root") {
        // Follow symlinks — a symlink pointing at a directory should
        // report true, matching Node's `fs.statSync().isDirectory()`.
        let is_dir = std::fs::metadata(root_to_abs(&path))
            .map(|m| m.is_dir())
            .unwrap_or(false);
        set_result_bool(the, is_dir);
        return;
    }

    let is_dir = resolve_dir(the, 0)
        .ok()
        .and_then(|dir| dir.metadata(path).ok())
        .map(|m| m.is_dir())
        .unwrap_or(false);
    set_result_bool(the, is_dir);
}

/// `readLink(dirOrToken, path) -> string | undefined`
///
/// Returns the symlink target string, or undefined if not a symlink.
pub unsafe extern "C" fn host_read_link(the: *mut XsMachine) {
    let path = arg_str(the, 1);

    if arg_dir_token(the, 0).as_deref() == Some("root") {
        if let Ok(target) = std::fs::read_link(root_to_abs(&path)) {
            set_result_string(the, &target.to_string_lossy());
        }
        return;
    }

    if let Ok(dir) = resolve_dir(the, 0) {
        if let Ok(target) = dir.read_link(path) {
            set_result_string(the, &target.to_string_lossy());
        }
        // If not a symlink or error, return undefined (default).
    }
}

// ---------------------------------------------------------------------------
// Open directory handles and link operations
// ---------------------------------------------------------------------------

/// `openDir(dirOrToken, path) -> number | string`
///
/// Opens a subdirectory relative to the resolved dir, stores the
/// resulting `Dir` in `DIR_MAP`, and returns a numeric handle.
/// Returns an "Error: ..." string on failure.
pub unsafe extern "C" fn host_open_dir(the: *mut XsMachine) {
    let path = arg_str(the, 1);

    if arg_dir_token(the, 0).as_deref() == Some("root") {
        // Open ambiently so symlinks are followed.
        match cap_std::fs::Dir::open_ambient_dir(
            root_to_abs(&path),
            cap_std::ambient_authority(),
        ) {
            Ok(sub) => {
                let handle = NEXT_DIR_HANDLE.fetch_add(1, Ordering::SeqCst);
                let mut map = get_dir_map();
                map.as_mut().unwrap().insert(handle, sub);
                fxInteger(the, &mut (*the).scratch, handle as i32);
                *(*the).frame.add(1) = (*the).scratch;
            }
            Err(e) => set_result_string(the, &format!("Error: {}", e)),
        }
        return;
    }

    match resolve_dir(the, 0) {
        Ok(dir) => match dir.open_dir(path) {
            Ok(sub) => {
                let handle = NEXT_DIR_HANDLE.fetch_add(1, Ordering::SeqCst);
                let mut map = get_dir_map();
                map.as_mut().unwrap().insert(handle, sub);
                fxInteger(the, &mut (*the).scratch, handle as i32);
                *(*the).frame.add(1) = (*the).scratch;
            }
            Err(e) => set_result_string(the, &format!("Error: {}", e)),
        },
        Err(msg) => set_result_string(the, &msg),
    }
}

/// `closeDir(handle) -> undefined`
///
/// Removes the directory handle from `DIR_MAP`. Idempotent.
pub unsafe extern "C" fn host_close_dir(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(1);
    let handle = fxToInteger(the, handle_slot) as u32;
    let mut map = get_dir_map();
    map.as_mut().unwrap().remove(&handle);
}

/// `symlink(dirOrToken, target, linkName) -> string | undefined`
///
/// Creates a symlink at `linkName` pointing to `target` within the
/// resolved directory scope.
/// Returns undefined on success, or an "Error: ..." string on failure.
pub unsafe extern "C" fn host_symlink(the: *mut XsMachine) {
    let target = arg_str(the, 1);
    let link_name = arg_str(the, 2);

    match resolve_dir(the, 0) {
        Ok(dir) => {
            #[cfg(unix)]
            let result = dir.symlink(target, link_name);
            #[cfg(not(unix))]
            let result = Err(std::io::Error::new(
                std::io::ErrorKind::Unsupported,
                "symlinks not supported on this platform",
            ));
            if let Err(e) = result {
                set_result_string(the, &format!("Error: {}", e));
            }
        }
        Err(msg) => set_result_string(the, &msg),
    }
}

/// `link(dirOrToken, srcPath, dstPath) -> string | undefined`
///
/// Creates a hard link at `dstPath` pointing to `srcPath` within the
/// resolved directory scope.
/// Returns undefined on success, or an "Error: ..." string on failure.
pub unsafe extern "C" fn host_link(the: *mut XsMachine) {
    let src_path = arg_str(the, 1);
    let dst_path = arg_str(the, 2);

    match resolve_dir(the, 0) {
        Ok(dir) => {
            if let Err(e) = dir.hard_link(src_path, &dir, dst_path) {
                set_result_string(the, &format!("Error: {}", e));
            }
        }
        Err(msg) => set_result_string(the, &msg),
    }
}

/// All host callbacks in registration order for snapshot tables.
pub const CALLBACKS: &[crate::ffi::XsCallback] = &[
    host_read_file_text,
    host_write_file_text,
    host_read_dir,
    host_mkdir,
    host_remove,
    host_rename,
    host_exists,
    host_is_dir,
    host_read_link,
    host_open_reader,
    host_read_chunk,
    host_close_reader,
    host_open_writer,
    host_write_chunk,
    host_close_writer,
    host_open_dir,
    host_close_dir,
    host_symlink,
    host_link,
];

/// Register all filesystem host functions on the machine.
///
/// # Safety
/// Machine must have HostPowers set as its context.
pub unsafe fn register(machine: &crate::Machine) {
    // Whole-file operations (text-only; use openReader/openWriter for bytes)
    machine.define_function("readFileText", host_read_file_text, 2);
    machine.define_function("writeFileText", host_write_file_text, 3);
    machine.define_function("readDir", host_read_dir, 2);
    machine.define_function("mkdir", host_mkdir, 2);
    machine.define_function("remove", host_remove, 2);
    machine.define_function("rename", host_rename, 3);
    machine.define_function("exists", host_exists, 2);
    machine.define_function("isDir", host_is_dir, 2);
    machine.define_function("readLink", host_read_link, 2);
    // Handle-based streaming I/O
    machine.define_function("openReader", host_open_reader, 2);
    machine.define_function("read", host_read_chunk, 2);
    machine.define_function("closeReader", host_close_reader, 1);
    machine.define_function("openWriter", host_open_writer, 2);
    machine.define_function("write", host_write_chunk, 2);
    machine.define_function("closeWriter", host_close_writer, 1);
    // Directory handles and link operations
    machine.define_function("openDir", host_open_dir, 2);
    machine.define_function("closeDir", host_close_dir, 1);
    machine.define_function("symlink", host_symlink, 3);
    machine.define_function("link", host_link, 3);
}
