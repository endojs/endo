//! # xsnap
//!
//! Rust bindings for the XS JavaScript engine (Moddable).
//! Provides a safe API for creating XS machines, evaluating JavaScript,
//! and registering host functions.

pub mod archive;
pub mod cesu8;
pub mod envelope;
pub mod ffi;
pub mod powers;
pub mod worker_io;

use ffi::*;
use std::cell::RefCell;
use std::ffi::CString;
use std::os::raw::{c_char, c_int, c_void};
use std::ptr;

/// Snapshot signature — must change when the host callback table
/// layout changes.  Includes the XS version implicitly (the
/// snapshot VERS atom carries it).
pub const SNAPSHOT_SIGNATURE: &[u8] = b"endo-xs 1";

/// Default machine creation parameters.
/// Sized for a general-purpose worker — not microcontroller-constrained.
pub const DEFAULT_CREATION: XsCreation = XsCreation {
    initial_chunk_size: 128 * 1024,
    incremental_chunk_size: 64 * 1024,
    initial_heap_count: 8192,
    incremental_heap_count: 4096,
    stack_count: 4096,
    initial_key_count: 2048,
    incremental_key_count: 512,
    name_modulo: 127,
    symbol_modulo: 127,
    parser_buffer_size: 8192 * 1024,
    parser_table_modulo: 1993,
    static_size: 0,
    native_stack_size: 0,
};

/// Initialize the XS shared cluster. Must be called once before
/// creating any machines, and `terminate_shared_cluster` must be
/// called on shutdown.
pub fn initialize_shared_cluster() {
    unsafe { fxInitializeSharedCluster() }
}

/// Tear down the XS shared cluster.
pub fn terminate_shared_cluster() {
    unsafe { fxTerminateSharedCluster() }
}

/// Idempotently initialize the XS shared cluster.
///
/// Safe to call from every supervised entry point; the underlying
/// `fxInitializeSharedCluster` only runs once. Termination is the
/// daemon shutdown path's responsibility.
pub fn ensure_shared_cluster() {
    use std::sync::Once;
    static CLUSTER_INIT: Once = Once::new();
    CLUSTER_INIT.call_once(|| unsafe { fxInitializeSharedCluster() });
}

/// An XS JavaScript machine.
///
/// Wraps `xsMachine*` with RAII — the machine is deleted on drop.
pub struct Machine {
    pub(crate) raw: *mut XsMachine,
    /// Host callbacks registered via `define_function`, in
    /// registration order.  Used as the external callback table
    /// for snapshot write/read.  Append-only — order is material.
    registered_callbacks: RefCell<Vec<XsCallback>>,
}

// XS machines are single-threaded — not Send or Sync.
// This is intentional: each worker gets its own machine.

/// Result of evaluating JavaScript.
pub enum JsValue {
    Undefined,
    Null,
    Boolean(bool),
    Integer(i32),
    Number(f64),
    String(String),
}

impl Machine {
    /// Create a new XS machine with the given creation parameters.
    pub fn new(creation: &XsCreation, name: &str) -> Option<Machine> {
        let c_name = CString::new(name).ok()?;
        let raw = unsafe {
            fxCreateMachine(
                creation as *const XsCreation,
                c_name.as_ptr(),
                ptr::null_mut(),
                XS_NO_ID,
            )
        };
        if raw.is_null() {
            None
        } else {
            Some(Machine {
                raw,
                registered_callbacks: RefCell::new(Vec::new()),
            })
        }
    }

    /// Get the raw machine pointer for FFI use.
    pub fn raw(&self) -> *mut XsMachine {
        self.raw
    }

    /// Set the host context pointer (retrievable from host functions).
    pub fn set_context<T>(&self, ctx: *mut T) {
        unsafe { (*self.raw).context = ctx as *mut c_void };
    }

    /// Get the host context pointer.
    ///
    /// # Safety
    /// Caller must ensure T matches the type that was set.
    pub unsafe fn context<T>(&self) -> *mut T {
        (*self.raw).context as *mut T
    }

    /// Evaluate a JavaScript expression.
    ///
    /// Uses `eval()` via the XS call mechanism:
    /// `xsCall1(xsGlobal, xsID("eval"), xsString(source))`
    ///
    /// Returns `None` if the evaluation throws.
    pub fn eval(&self, source: &str) -> Option<JsValue> {
        let c_source = CString::new(source).ok()?;

        unsafe {
            let the = fxBeginHost(self.raw);
            if the.is_null() {
                return None;
            }

            // Equivalent to: xsCall1(xsGlobal, xsID("eval"), xsString(source))
            //
            // Expanded:
            //   xsOverflow(-XS_FRAME_COUNT-1)
            //   fxPush(xsGlobal)        — push `this`
            //   fxCallID(the, evalID)    — set up call frame
            //   fxPush(xsString(src))    — push argument
            //   fxRunCount(the, 1)       — execute with 1 arg
            //   result = fxPop()         — pop result

            let eval_id = fxID(the, b"eval\0".as_ptr() as *const c_char);

            fxOverflow(the, -(XS_FRAME_COUNT + 1), ptr::null(), 0);

            // Push global as `this`
            fx_push(the, xs_global(the));

            // Set up the call frame for eval
            fxCallID(the, eval_id);

            // Push the source string as the argument
            fxString(
                the,
                &mut (*the).scratch,
                c_source.as_ptr(),
            );
            fx_push(the, (*the).scratch);

            // Execute with 1 argument
            fxRunCount(the, 1);

            // Pop the result
            let result_slot = fx_pop(the);
            (*the).scratch = result_slot;

            let ty = fxTypeOf(the, &mut (*the).scratch);
            let value = slot_to_value(the, &mut (*the).scratch, ty);

            fxEndHost(the);

            Some(value)
        }
    }

    /// Evaluate JavaScript source. Returns the result as a String,
    /// coercing non-string values via JS `String()`.
    /// Returns `None` if the evaluation throws.
    pub fn eval_to_string(&self, source: &str) -> Option<String> {
        match self.eval(source)? {
            JsValue::Undefined => Some("undefined".to_string()),
            JsValue::Null => Some("null".to_string()),
            JsValue::Boolean(b) => Some(if b { "true" } else { "false" }.to_string()),
            JsValue::Integer(n) => Some(n.to_string()),
            JsValue::Number(n) => Some(n.to_string()),
            JsValue::String(s) => Some(s),
        }
    }

    /// Look up or create an identifier (symbol) for the given name.
    pub fn id(&self, name: &str) -> i32 {
        let c_name = CString::new(name).unwrap();
        unsafe {
            let the = fxBeginHost(self.raw);
            let id = fxID(the, c_name.as_ptr());
            fxEndHost(the);
            id
        }
    }

    /// Define a host function on the global object.
    ///
    /// The callback receives `the: *mut XsMachine` and can access
    /// arguments via the XS stack (frame[-2 - index]).
    pub fn define_function(
        &self,
        name: &str,
        callback: XsCallback,
        length: i32,
    ) {
        // Track for snapshot callback table (dedup by pointer).
        {
            let mut cbs = self.registered_callbacks.borrow_mut();
            if !cbs.iter().any(|&c| c == callback) {
                cbs.push(callback);
            }
        }
        let c_name = CString::new(name).unwrap();
        unsafe {
            let the = fxBeginHost(self.raw);
            let id = fxID(the, c_name.as_ptr());

            // Equivalent to:
            //   xsDefine(xsGlobal, xsID(name),
            //     xsNewHostFunction(callback, length), xsDontEnum)
            //
            // xsDefine expands to:
            //   fxPush(value)        — push value first
            //   fxPush(this)         — push target object
            //   fxDefineID(the, id, attrs, mask)
            //   the->stack++         — pop
            fxOverflow(the, -8, ptr::null(), 0);

            // Create host function — pushes value onto stack
            fxNewHostFunction(the, callback, length, id, XS_NO_ID);
            // Stack: [function]  (value is on top)

            // Push global (the target object) on top of the value
            fx_push(the, xs_global(the));
            // Stack: [function, global]

            // xsDontEnum = 4
            let attrs: u8 = 4;
            let mask: u8 = attrs | 2 | 4 | 8; // xsDontDelete | xsDontEnum | xsDontSet
            fxDefineID(the, id, attrs, mask);

            // Pop (xsDefine does the->stack++)
            (*the).stack = (*the).stack.add(1);

            fxEndHost(the);
        }
    }

    /// Process all pending promise reactions (microtask queue).
    ///
    /// XS has no built-in event loop. After evaluating JS that creates
    /// promises, call this to drain the microtask queue. This is
    /// essential for the Rust-driven main loop pattern where Rust
    /// reads messages, dispatches them to JS, then processes all
    /// resulting async work before reading the next message.
    pub fn run_promise_jobs(&self) {
        unsafe { fxRunPromiseJobs(self.raw) }
    }

    /// Drain the microtask queue completely.
    ///
    /// Repeatedly runs promise jobs until no new reactions are queued.
    /// This handles CapTP's multi-level async chains where resolving
    /// one promise queues new microtasks (e.g., method call → promise
    /// resolve → serialization → send → further reactions).
    pub fn quiesce(&self) {
        unsafe {
            loop {
                fxRunPromiseJobs(self.raw);
                if ffi::fxHasPendingJobs() == 0 {
                    break;
                }
            }
        }
    }

    /// Run the platform event loop until idle.
    ///
    /// Drains promise jobs, fires due timers, and repeats until both
    /// the promise queue and timer list are empty.  This gives
    /// standalone `endor run` proper run-until-idle semantics:
    /// programs with no async work exit immediately, programs with
    /// promises drain to completion, and programs with setTimeout run
    /// until all timers fire.
    pub fn run_loop(&self) {
        unsafe { ffi::fxRunLoop(self.raw) }
    }

    /// Run garbage collection.
    pub fn collect_garbage(&self) {
        unsafe { fxCollectGarbage(self.raw) };
    }

    // ---- Metering API ----

    /// Enable metering with the given check interval (in computrons).
    ///
    /// The `callback` fires every `interval` computrons.  It receives
    /// the current meter index (computrons = value >> 16) and returns
    /// true to continue or false to abort with
    /// `XS_TOO_MUCH_COMPUTATION_EXIT`.
    ///
    /// Use [`set_crank_limit`] to set the per-crank hard limit that
    /// the default [`metering_callback`] checks against.
    pub fn begin_metering(&self, interval: u64) {
        unsafe {
            ffi::fxBeginMetering(self.raw, Some(metering_callback), interval);
        }
    }

    /// Disable metering and clear meter state.
    pub fn end_metering(&self) {
        unsafe { ffi::fxEndMetering(self.raw) }
    }

    /// Read the current raw meterIndex.
    /// Computrons = value >> 16.
    pub fn current_meter(&self) -> u64 {
        unsafe { ffi::fxGetCurrentMeter(self.raw) }
    }

    /// Read the current meter in computrons (meterIndex >> 16).
    pub fn current_computrons(&self) -> u64 {
        self.current_meter() >> 16
    }

    /// Reset the meter to a given raw value (typically 0 at crank
    /// start).
    pub fn set_meter(&self, value: u64) {
        unsafe { ffi::fxSetCurrentMeter(self.raw, value) }
    }

    /// Run promise jobs under metering protection.
    ///
    /// Like [`run_promise_jobs`] but wrapped in a C-level
    /// `mxTry`/`mxCatch` so that a metering abort (longjmp) does
    /// not cross into Rust stack frames.
    ///
    /// Returns `Ok(())` on normal completion, or `Err(status)` if
    /// XS aborted (e.g., `XS_TOO_MUCH_COMPUTATION_EXIT`).
    pub fn run_promise_jobs_metered(&self) -> Result<(), i32> {
        let status = unsafe { ffi::fxRunPromiseJobsMetered(self.raw) };
        if status == 0 {
            Ok(())
        } else {
            Err(status)
        }
    }

    /// Write the machine's heap to a snapshot.
    ///
    /// The machine must be quiescent — no running JS, no pending
    /// host entries.  Returns the snapshot bytes on success.
    ///
    /// The `callbacks` slice must contain all host function pointers
    /// that have been registered on this machine.
    pub fn write_snapshot(
        &self,
        signature: &[u8],
        callbacks: &mut [ffi::XsCallback],
    ) -> Result<Vec<u8>, SnapshotError> {
        let mut stream = MemWriteStream {
            data: Vec::with_capacity(256 * 1024),
        };
        let mut snapshot = ffi::XsSnapshot {
            signature: signature.as_ptr() as *mut c_char,
            signature_length: signature.len() as c_int,
            callbacks: callbacks.as_mut_ptr(),
            callbacks_length: callbacks.len() as c_int,
            read: None,
            write: Some(mem_write),
            stream: &mut stream as *mut MemWriteStream as *mut c_void,
            error: 0,
            first_chunk: ptr::null_mut(),
            first_projection: ptr::null_mut(),
            first_slot: ptr::null_mut(),
            slot_size: 0,
            slots: ptr::null_mut(),
        };
        let ok = unsafe { ffi::fxWriteSnapshot(self.raw, &mut snapshot) };
        if ok == 1 {
            Ok(stream.data)
        } else {
            Err(SnapshotError::Write(snapshot.error))
        }
    }

    /// Create a machine from a snapshot.
    ///
    /// The snapshot must have been written with a compatible
    /// signature and callback table.
    pub fn from_snapshot(
        data: &[u8],
        name: &str,
        signature: &[u8],
        callbacks: &mut [ffi::XsCallback],
    ) -> Result<Machine, SnapshotError> {
        let c_name = CString::new(name).map_err(|_| SnapshotError::InvalidName)?;
        let mut stream = MemReadStream { data, pos: 0 };
        let mut snapshot = ffi::XsSnapshot {
            signature: signature.as_ptr() as *mut c_char,
            signature_length: signature.len() as c_int,
            callbacks: callbacks.as_mut_ptr(),
            callbacks_length: callbacks.len() as c_int,
            read: Some(mem_read),
            write: None,
            stream: &mut stream as *mut MemReadStream as *mut c_void,
            error: 0,
            first_chunk: ptr::null_mut(),
            first_projection: ptr::null_mut(),
            first_slot: ptr::null_mut(),
            slot_size: 0,
            slots: ptr::null_mut(),
        };
        let raw = unsafe {
            ffi::fxReadSnapshot(&mut snapshot, c_name.as_ptr(), ptr::null_mut())
        };
        if raw.is_null() {
            Err(SnapshotError::Read(snapshot.error))
        } else {
            Ok(Machine {
                raw,
                registered_callbacks: RefCell::new(callbacks.to_vec()),
            })
        }
    }
    /// Write the machine's heap snapshot using tracked callbacks.
    ///
    /// Returns a `SuspendData` containing the snapshot bytes and the
    /// callback table needed to restore.  The machine must be
    /// quiescent (no running JS).
    pub fn suspend(&self, signature: &[u8]) -> Result<SuspendData, SnapshotError> {
        let mut cbs = self.registered_callbacks.borrow().clone();
        let snap = self.write_snapshot(signature, &mut cbs)?;
        Ok(SuspendData {
            snapshot: snap,
            callbacks: cbs,
            signature: signature.to_vec(),
        })
    }

    /// Restore a machine from `SuspendData`.
    ///
    /// Convenience wrapper around `from_snapshot` that unpacks the
    /// suspend data.
    pub fn resume(
        data: &SuspendData,
        name: &str,
    ) -> Result<Machine, SnapshotError> {
        let mut cbs = data.callbacks.clone();
        Machine::from_snapshot(
            &data.snapshot,
            name,
            &data.signature,
            &mut cbs,
        )
    }
}

/// Data needed to resume a suspended machine.
///
/// Bundles the raw snapshot bytes, the callback table, and the
/// signature.  Produced by `Machine::suspend()`, consumed by
/// `Machine::resume()`.
#[derive(Clone)]
pub struct SuspendData {
    /// Raw XS heap snapshot bytes.
    pub snapshot: Vec<u8>,
    /// Host callback table (same order as registration).
    pub callbacks: Vec<XsCallback>,
    /// Snapshot signature.
    pub signature: Vec<u8>,
}

// ---------------------------------------------------------------------------
// Snapshot I/O helpers
// ---------------------------------------------------------------------------

/// Collect the deterministic callback table for a worker.
///
/// Returns all host function pointers in the exact order they are
/// registered by `register_worker_io` + `register_powers`.  This
/// list is used as the external snapshot callback table for both
/// `write_snapshot` and `from_snapshot`.
///
/// The order is material and append-only — never reorder.
pub fn worker_snapshot_callbacks() -> Vec<ffi::XsCallback> {
    let mut cbs = Vec::new();
    // worker_io callbacks (registered by register_worker_io)
    cbs.extend_from_slice(worker_io::WORKER_IO_CALLBACKS);
    // powers callbacks (registered by register_powers, in order:
    // fs, crypto, modules, process, sqlite)
    cbs.extend_from_slice(powers::fs::CALLBACKS);
    cbs.extend_from_slice(powers::crypto::CALLBACKS);
    cbs.extend_from_slice(powers::modules::CALLBACKS);
    cbs.extend_from_slice(powers::process::CALLBACKS);
    cbs.extend_from_slice(powers::sqlite::CALLBACKS);
    cbs
}

/// Error type for snapshot operations.
#[derive(Debug)]
pub enum SnapshotError {
    /// fxWriteSnapshot failed with the given error code.
    Write(c_int),
    /// fxReadSnapshot failed with the given error code.
    Read(c_int),
    /// Machine name contained a null byte.
    InvalidName,
    /// File I/O error during streaming snapshot.
    Io(std::io::Error),
}

impl std::fmt::Display for SnapshotError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SnapshotError::Write(e) => write!(f, "snapshot write failed (error {})", e),
            SnapshotError::Read(e) => write!(f, "snapshot read failed (error {})", e),
            SnapshotError::InvalidName => write!(f, "machine name contains null byte"),
            SnapshotError::Io(e) => write!(f, "snapshot I/O: {}", e),
        }
    }
}

struct MemWriteStream {
    data: Vec<u8>,
}

struct MemReadStream<'a> {
    data: &'a [u8],
    pos: usize,
}

unsafe extern "C" fn mem_write(
    stream: *mut c_void,
    ptr: *mut c_void,
    size: usize,
) -> c_int {
    let s = &mut *(stream as *mut MemWriteStream);
    let bytes = std::slice::from_raw_parts(ptr as *const u8, size);
    s.data.extend_from_slice(bytes);
    0
}

unsafe extern "C" fn mem_read(
    stream: *mut c_void,
    ptr: *mut c_void,
    size: usize,
) -> c_int {
    let s = &mut *(stream as *mut MemReadStream);
    if s.pos + size > s.data.len() {
        return 1; // error: not enough data
    }
    let dst = std::slice::from_raw_parts_mut(ptr as *mut u8, size);
    dst.copy_from_slice(&s.data[s.pos..s.pos + size]);
    s.pos += size;
    0
}

// ---------------------------------------------------------------------------
// File-backed snapshot I/O — stream chunks to/from disk without
// buffering the entire snapshot in memory.
// ---------------------------------------------------------------------------

use sha2::{Digest, Sha256};
use std::io::Write as IoWrite;

/// Stream that writes snapshot chunks to a file while computing
/// SHA-256 on the fly.
struct FileWriteStream {
    file: std::fs::File,
    hasher: Sha256,
    err: Option<std::io::Error>,
}

/// Stream that reads snapshot chunks from a file.
struct FileReadStream {
    file: std::fs::File,
}

unsafe extern "C" fn file_write(
    stream: *mut c_void,
    ptr: *mut c_void,
    size: usize,
) -> c_int {
    let s = &mut *(stream as *mut FileWriteStream);
    if s.err.is_some() {
        return 1;
    }
    let bytes = std::slice::from_raw_parts(ptr as *const u8, size);
    s.hasher.update(bytes);
    match s.file.write_all(bytes) {
        Ok(()) => 0,
        Err(e) => {
            s.err = Some(e);
            1
        }
    }
}

unsafe extern "C" fn file_read(
    stream: *mut c_void,
    ptr: *mut c_void,
    size: usize,
) -> c_int {
    use std::io::Read;
    let s = &mut *(stream as *mut FileReadStream);
    let dst = std::slice::from_raw_parts_mut(ptr as *mut u8, size);
    let mut total = 0;
    while total < size {
        match s.file.read(&mut dst[total..]) {
            Ok(0) => return 1, // unexpected EOF
            Ok(n) => total += n,
            Err(_) => return 1,
        }
    }
    0
}

impl Machine {
    /// Write the machine's heap snapshot directly to a file,
    /// computing SHA-256 on the fly.
    ///
    /// Returns the hex-encoded SHA-256 digest on success.
    /// The snapshot is never buffered fully in memory — each
    /// chunk from `fxWriteSnapshot` is written through to the
    /// file and fed to the hasher.
    pub fn write_snapshot_to_file(
        &self,
        signature: &[u8],
        callbacks: &mut [ffi::XsCallback],
        file: std::fs::File,
    ) -> Result<String, SnapshotError> {
        let mut fws = FileWriteStream {
            file,
            hasher: Sha256::new(),
            err: None,
        };
        let mut snapshot = ffi::XsSnapshot {
            signature: signature.as_ptr() as *mut c_char,
            signature_length: signature.len() as c_int,
            callbacks: callbacks.as_mut_ptr(),
            callbacks_length: callbacks.len() as c_int,
            read: None,
            write: Some(file_write),
            stream: &mut fws as *mut FileWriteStream as *mut c_void,
            error: 0,
            first_chunk: ptr::null_mut(),
            first_projection: ptr::null_mut(),
            first_slot: ptr::null_mut(),
            slot_size: 0,
            slots: ptr::null_mut(),
        };
        let ok = unsafe { ffi::fxWriteSnapshot(self.raw, &mut snapshot) };
        if ok != 1 {
            return Err(SnapshotError::Write(snapshot.error));
        }
        if let Some(e) = fws.err {
            return Err(SnapshotError::Io(e));
        }
        // Flush to ensure all data hits disk before we rename.
        fws.file.flush().map_err(SnapshotError::Io)?;
        fws.file.sync_all().map_err(SnapshotError::Io)?;
        let hash = format!("{:x}", fws.hasher.finalize());
        Ok(hash)
    }

    /// Create a machine from a snapshot file, streaming chunks
    /// from disk without buffering.
    pub fn from_snapshot_file(
        file: std::fs::File,
        name: &str,
        signature: &[u8],
        callbacks: &mut [ffi::XsCallback],
    ) -> Result<Machine, SnapshotError> {
        let c_name = CString::new(name).map_err(|_| SnapshotError::InvalidName)?;
        let mut frs = FileReadStream { file };
        let mut snapshot = ffi::XsSnapshot {
            signature: signature.as_ptr() as *mut c_char,
            signature_length: signature.len() as c_int,
            callbacks: callbacks.as_mut_ptr(),
            callbacks_length: callbacks.len() as c_int,
            read: Some(file_read),
            write: None,
            stream: &mut frs as *mut FileReadStream as *mut c_void,
            error: 0,
            first_chunk: ptr::null_mut(),
            first_projection: ptr::null_mut(),
            first_slot: ptr::null_mut(),
            slot_size: 0,
            slots: ptr::null_mut(),
        };
        let raw = unsafe {
            ffi::fxReadSnapshot(&mut snapshot, c_name.as_ptr(), ptr::null_mut())
        };
        if raw.is_null() {
            Err(SnapshotError::Read(snapshot.error))
        } else {
            Ok(Machine {
                raw,
                registered_callbacks: RefCell::new(callbacks.to_vec()),
            })
        }
    }

    /// Write snapshot to CAS directory, streaming to disk.
    ///
    /// Writes to a temp file in `cas_dir`, then renames to
    /// `{cas_dir}/{sha256_hex}`.  Returns the hex digest.
    pub fn suspend_to_cas(
        &self,
        signature: &[u8],
        cas_dir: &std::path::Path,
    ) -> Result<String, SnapshotError> {
        std::fs::create_dir_all(cas_dir).map_err(SnapshotError::Io)?;
        let tmp_path = cas_dir.join(".snapshot.tmp");
        let file = std::fs::File::create(&tmp_path)
            .map_err(SnapshotError::Io)?;
        let mut cbs = self.registered_callbacks.borrow().clone();
        let hash = self.write_snapshot_to_file(signature, &mut cbs, file)?;
        let final_path = cas_dir.join(&hash);
        std::fs::rename(&tmp_path, &final_path).map_err(SnapshotError::Io)?;
        Ok(hash)
    }

    /// Restore a machine from a CAS-stored snapshot file.
    pub fn resume_from_cas(
        cas_dir: &std::path::Path,
        sha256: &str,
        name: &str,
        signature: &[u8],
        callbacks: &mut [ffi::XsCallback],
    ) -> Result<Machine, SnapshotError> {
        let path = cas_dir.join(sha256);
        let file = std::fs::File::open(&path).map_err(SnapshotError::Io)?;
        Machine::from_snapshot_file(file, name, signature, callbacks)
    }
}

/// Convert an XS slot to a Rust JsValue based on its type tag.
unsafe fn slot_to_value(
    the: *mut XsMachine,
    slot: *mut XsSlot,
    ty: i8,
) -> JsValue {
    match ty {
        XS_UNDEFINED_TYPE => JsValue::Undefined,
        XS_NULL_TYPE => JsValue::Null,
        XS_BOOLEAN_TYPE => JsValue::Boolean(fxToBoolean(the, slot) != 0),
        XS_INTEGER_TYPE => JsValue::Integer(fxToInteger(the, slot)),
        XS_NUMBER_TYPE => JsValue::Number(fxToNumber(the, slot)),
        XS_STRING_TYPE | XS_STRING_X_TYPE => {
            let s = fxToString(the, slot);
            if s.is_null() {
                JsValue::Undefined
            } else {
                JsValue::String(worker_io::xs_string_to_utf8(s))
            }
        }
        // For references and other types, coerce to string
        _ => {
            let s = fxToString(the, slot);
            if s.is_null() {
                JsValue::Undefined
            } else {
                JsValue::String(worker_io::xs_string_to_utf8(s))
            }
        }
    }
}

impl Machine {
    /// Set up host powers and register all host functions.
    ///
    /// The HostPowers pointer must outlive the Machine.
    /// Registers filesystem, crypto, and module loading host functions.
    pub fn register_powers(&self, powers: *mut powers::HostPowers) {
        self.set_context(powers);
        unsafe {
            powers::fs::register(self);
            powers::crypto::register(self);
            powers::modules::register(self);
            powers::process::register(self);
            powers::sqlite::register(self);
        }
    }

    /// Register worker I/O host functions (envelope bridge).
    ///
    /// Call this after `worker_io::install_transport()` has been
    /// called on the active thread.
    pub fn register_worker_io(&self) {
        unsafe {
            worker_io::register(self);
        }
    }

    /// Run one round of the XS debugger command loop.
    ///
    /// Calls `fxRunDebugger(the)`, which internally calls
    /// `fxDebugCommand(the)` when `mxDebug` is enabled.  This
    /// triggers `fxReceive` → reads from the inbound debug buffer,
    /// processes any debug commands, and `fxSend` → writes responses
    /// to the outbound debug buffer.
    ///
    /// When `mxDebug` is not enabled (default build), this is a
    /// no-op.
    pub fn run_debugger(&self) {
        unsafe { ffi::fxRunDebugger(self.raw) };
    }

    /// Load and execute an archive (endoZipBase64 or raw zip).
    ///
    /// Parses the compartment map, registers all module sources,
    /// creates XS Compartments, and imports the entry module.
    /// Returns the entry module's namespace as a JsValue.
    pub fn import_archive(&self, loaded: &archive::LoadedArchive) -> bool {
        archive::install_archive(self, loaded)
    }
}

impl Drop for Machine {
    fn drop(&mut self) {
        if !self.raw.is_null() {
            unsafe { fxDeleteMachine(self.raw) };
            self.raw = ptr::null_mut();
        }
    }
}

// --------------------------------------------------------------------
// Embedded bundles
//
// Exposed as public constants so alternate embeddings (tests,
// supervisor, etc.) can reuse them without rebuilding the bin.
// --------------------------------------------------------------------

/// Harden/assert/TextEncoder polyfills. Must be evaluated BEFORE any
/// bundles so that module-level destructuring of `assert` works.
pub const POLYFILLS: &str = include_str!("polyfills.js");

/// Creates `globalThis.host<Name>` aliases for the unprefixed
/// host functions registered in Rust so that bundled code which
/// expects `hostReadFile`, `hostSendRawFrame`, etc. resolves to
/// the real implementations. Evaluated after host powers are
/// registered and before SES lockdown.
pub const HOST_ALIASES: &str = include_str!("host_aliases.js");

/// HandledPromise shim + harden upgrade.
pub const SES_BOOT: &str = include_str!("ses_boot.js");

/// The bundled worker JavaScript. Self-executing IIFE that installs
/// `globalThis.handleCommand` via bus-xs-core and registers a single
/// CapTP session on the parent daemon handle.
pub const WORKER_BOOTSTRAP: &str = include_str!("worker_bootstrap.js");

/// The bundled manager JavaScript. Self-executing IIFE that installs
/// `globalThis.handleCommand` via bus-xs-core and multiplexes many
/// CapTP sessions over the envelope protocol. The "manager" is the
/// specialized child of the top-level endo daemon (the capability
/// bus) that bootstraps the pet-name store, formula graph, and host
/// agent. Kept under the legacy file name `daemon_bootstrap.js` to
/// minimize churn in the bundler scripts.
pub const MANAGER_BOOTSTRAP: &str = include_str!("daemon_bootstrap.js");

// --------------------------------------------------------------------
// XS process entry points
//
// These functions contain the full bootstrap/dispatch logic that used
// to live in the `endo-rust-xs` binary. The unified `endor` binary
// in the `endo` crate calls into these from its subcommand dispatch.
// --------------------------------------------------------------------

/// Machine creation parameters sized for the ~1MB worker bundle.
pub const WORKER_CREATION: ffi::XsCreation = ffi::XsCreation {
    initial_chunk_size: 1024 * 1024,
    incremental_chunk_size: 256 * 1024,
    initial_heap_count: 32768,
    incremental_heap_count: 16384,
    stack_count: 16384,
    initial_key_count: 8192,
    incremental_key_count: 2048,
    name_modulo: 1993,
    symbol_modulo: 127,
    parser_buffer_size: 16 * 1024 * 1024,
    parser_table_modulo: 1993,
    static_size: 0,
    native_stack_size: 0,
};

/// Machine creation parameters for the manager child — larger than
/// the worker to accommodate the ~2MB manager bundle and formula
/// graph.
pub const MANAGER_CREATION: ffi::XsCreation = ffi::XsCreation {
    initial_chunk_size: 2 * 1024 * 1024,
    incremental_chunk_size: 512 * 1024,
    initial_heap_count: 65536,
    incremental_heap_count: 32768,
    stack_count: 32768,
    initial_key_count: 16384,
    incremental_key_count: 4096,
    name_modulo: 1993,
    symbol_modulo: 127,
    parser_buffer_size: 32 * 1024 * 1024,
    parser_table_modulo: 1993,
    static_size: 0,
    native_stack_size: 0,
};

/// Errors that can escape from the xsnap entry points.
#[derive(Debug)]
pub enum XsnapError {
    MachineInit(String),
    Io(String),
    Archive(String),
    Bootstrap(String),
}

impl std::fmt::Display for XsnapError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            XsnapError::MachineInit(s) => write!(f, "machine init: {s}"),
            XsnapError::Io(s) => write!(f, "io: {s}"),
            XsnapError::Archive(s) => write!(f, "archive: {s}"),
            XsnapError::Bootstrap(s) => write!(f, "bootstrap: {s}"),
        }
    }
}

impl std::error::Error for XsnapError {}

/// Evaluate JS code with try-catch error reporting.
/// Returns true if evaluation succeeded (no error), false otherwise.
/// Evaluate JS code with try-catch error reporting.
///
/// Returns true if evaluation succeeded (no error), false otherwise.
///
/// IMPORTANT: The code is inlined directly into the try-catch block,
/// NOT passed through an inner `eval()` call.  Using `eval(string)`
/// creates a nested evaluation context in XS which could shift the
/// stack frame layout.  Inlining avoids this by keeping the host
/// call in the same evaluation context as `machine.eval()`.
fn eval_wrapped(machine: &Machine, code: &str, label: &str) -> bool {
    let wrapped = format!(
        "var __e = undefined; try {{ {} }} catch(e) {{ __e = e; }} \
         __e ? ('ERROR: ' + __e.message + '\\nSTACK: ' + __e.stack) : 'ok'",
        code
    );
    match machine.eval(&wrapped) {
        Some(JsValue::String(ref s)) if s.starts_with("ERROR") => {
            eprintln!("{label}: eval error:");
            for line in s.lines() {
                eprintln!("  {line}");
            }
            false
        }
        Some(_) => true,
        None => {
            eprintln!("{label}: crashed (eval returned None)");
            false
        }
    }
}

/// Flush any pending debug outbound data as a `"debug"` envelope
/// on the bus transport.  The handle is 0 (daemon/supervisor).
fn flush_debug_outbound() {
    if let Some(data) = powers::debug::debug_drain_outbound() {
        let env = envelope::Envelope {
            handle: 0,
            verb: "debug".to_string(),
            payload: data,
            nonce: 0,
        };
        let encoded = envelope::encode_envelope(&env);
        let _ = worker_io::with_transport(|t| t.send_raw_frame(&encoded));
    }
}

/// Send an envelope back to the daemon/supervisor (handle 0).
fn send_control_response(verb: &str, nonce: i64) {
    let env = envelope::Envelope {
        handle: 0,
        verb: verb.to_string(),
        payload: Vec::new(),
        nonce,
    };
    let encoded = envelope::encode_envelope(&env);
    let _ = worker_io::with_transport(|t| t.send_raw_frame(&encoded));
}

/// Result of handling an envelope.
enum EnvelopeAction {
    /// Normal dispatch or debug traffic — continue the loop.
    Continue,
    /// Worker should suspend: snapshot written, exit the loop.
    Suspend,
}

/// Handle an incoming envelope: intercept control verbs
/// (`debug-attach`, `debug-detach`, `debug`, `suspend`) and
/// route them; otherwise dispatch to JS.
fn handle_envelope(machine: &Machine, data: &[u8]) -> EnvelopeAction {
    if let Ok(env) = envelope::decode_envelope(data) {
        match env.verb.as_str() {
            "debug-attach" => {
                powers::debug::debug_enable();
                machine.run_debugger();
                flush_debug_outbound();
                send_control_response("debug-attached", env.nonce);
                return EnvelopeAction::Continue;
            }
            "debug-detach" => {
                powers::debug::debug_reset();
                send_control_response("debug-detached", env.nonce);
                return EnvelopeAction::Continue;
            }
            "debug" if powers::debug::debug_is_active() => {
                powers::debug::debug_push_inbound(&env.payload);
                machine.run_debugger();
                flush_debug_outbound();
                return EnvelopeAction::Continue;
            }
            "suspend" => {
                return handle_suspend(machine, env.nonce, &env.payload);
            }
            "meter-config" => {
                // Decode CBOR map: {"hard_limit": u64}
                if let Some(limit) = decode_meter_config(&env.payload) {
                    CRANK_HARD_LIMIT.with(|c| c.set(limit));
                    eprintln!("metering: hard_limit set to {limit}");
                }
                return EnvelopeAction::Continue;
            }
            _ => {}
        }
    }
    dispatch_envelope(machine, data);
    EnvelopeAction::Continue
}

/// Handle a suspend request: stream snapshot to CAS, send back hash.
///
/// The `cas_dir` payload tells the worker where the content-
/// addressable store lives.  The snapshot is written chunk-by-chunk
/// to a temp file in that directory while computing SHA-256, then
/// renamed to `{cas_dir}/{hex_hash}`.  Only the hash string is
/// sent back to the supervisor — the snapshot never transits the
/// envelope bus.
fn handle_suspend(machine: &Machine, nonce: i64, cas_dir: &[u8]) -> EnvelopeAction {
    let cas_path = match std::str::from_utf8(cas_dir) {
        Ok(s) if !s.is_empty() => std::path::PathBuf::from(s),
        _ => {
            send_suspend_error(nonce, "suspend: missing or invalid cas_dir");
            return EnvelopeAction::Continue;
        }
    };
    match machine.suspend_to_cas(SNAPSHOT_SIGNATURE, &cas_path) {
        Ok(hash) => {
            let env = envelope::Envelope {
                handle: 0,
                verb: "suspended".to_string(),
                payload: hash.into_bytes(),
                nonce,
            };
            let encoded = envelope::encode_envelope(&env);
            let _ = worker_io::with_transport(|t| t.send_raw_frame(&encoded));
            EnvelopeAction::Suspend
        }
        Err(e) => {
            send_suspend_error(nonce, &format!("{e}"));
            EnvelopeAction::Continue
        }
    }
}

fn send_suspend_error(nonce: i64, msg: &str) {
    let env = envelope::Envelope {
        handle: 0,
        verb: "suspend-error".to_string(),
        payload: msg.as_bytes().to_vec(),
        nonce,
    };
    let encoded = envelope::encode_envelope(&env);
    let _ = worker_io::with_transport(|t| t.send_raw_frame(&encoded));
}

/// Deliver a raw envelope to the JS `handleCommand` function.
///
/// Pass raw envelope bytes to JS `handleCommand(Uint8Array)`.
///
/// We store the bytes in a thread-local and retrieve them via the
/// `getPendingEnvelope()` host function, which returns an ArrayBuffer
/// directly — no hex encoding. This is O(n) instead of the previous
/// O(n²) hex-parse approach, which is critical for large envelopes
/// (e.g. 1 MB CapTP payloads from storeBlob).
fn dispatch_envelope(machine: &Machine, data: &[u8]) {
    worker_io::set_pending_envelope(data.to_vec());
    machine.eval(
        "try { \
            var __buf = getPendingEnvelope(); \
            var __bytes = new Uint8Array(__buf); \
            handleCommand(__bytes); \
         } catch(e) { trace('handleCommand error: ' + e.message) }",
    );
}

/// Bootstrap an XS machine with polyfills and SES lockdown.
/// Shared by all three entry points.
fn bootstrap_ses(machine: &Machine, label: &str) {
    machine
        .eval(POLYFILLS)
        .expect("polyfills evaluation failed");

    if !eval_wrapped(machine, SES_BOOT, "ses-boot") {
        eprintln!("{label}: SES boot failed");
    }
    machine.run_promise_jobs();
}

/// Register host powers (fs, crypto, modules, process) on the machine.
/// Returns the raw pointer for later cleanup.
fn register_host_powers(machine: &Machine) -> *mut powers::HostPowers {
    let mut host_powers = powers::HostPowers::new();
    if let Ok(root) = cap_std::fs::Dir::open_ambient_dir(
        "/",
        cap_std::ambient_authority(),
    ) {
        host_powers.add_dir("root", root);
    }
    let powers_ptr = Box::into_raw(Box::new(host_powers));
    machine.register_powers(powers_ptr);
    powers_ptr
}

// ---------------------------------------------------------------------------
// Metering — thread-local state and callback
// ---------------------------------------------------------------------------

use std::cell::Cell;

/// Default metering check interval in computrons.
/// Higher values reduce callback overhead at the cost of granularity.
pub const DEFAULT_METERING_INTERVAL: u64 = 10_000;

thread_local! {
    /// Per-crank hard limit (computrons). 0 = no enforcement.
    static CRANK_LIMIT: Cell<u64> = Cell::new(0);
    /// Set to true when the metering callback aborted execution.
    static METERING_ABORTED: Cell<bool> = Cell::new(false);
    /// Hard limit received via `meter-config` envelope. 0 = no
    /// enforcement.  Persists across cranks; updated only when the
    /// supervisor sends a new config.
    static CRANK_HARD_LIMIT: Cell<u64> = Cell::new(0);
}

/// Metering callback invoked by XS every `interval` computrons.
/// Returns 1 (continue) or 0 (abort).
///
/// # Safety
/// Called from C during XS bytecode execution.
unsafe extern "C" fn metering_callback(
    _the: *mut ffi::XsMachine,
    index: u64,
) -> i32 {
    CRANK_LIMIT.with(|limit| {
        let lim = limit.get();
        if lim > 0 && index > lim {
            METERING_ABORTED.with(|a| a.set(true));
            0 // abort — XS will call fxAbort(TOO_MUCH_COMPUTATION)
        } else {
            1 // continue
        }
    })
}

/// Set the per-crank hard limit for the calling thread's machine.
pub fn set_crank_limit(limit: u64) {
    CRANK_LIMIT.with(|c| c.set(limit));
}

/// Check and clear the metering-aborted flag.
pub fn take_metering_aborted() -> bool {
    METERING_ABORTED.with(|a| {
        let was = a.get();
        a.set(false);
        was
    })
}

/// Send a meter-report control envelope to the supervisor (handle 0).
fn send_meter_report(steps: u64, outcome: &str) {
    // Encode a small CBOR map: {"steps": <u64>, "outcome": <text>}
    let mut payload = Vec::with_capacity(32);
    // CBOR map(2)
    payload.push(0xa2);
    // key "steps" (text, 5 bytes)
    payload.push(0x65);
    payload.extend_from_slice(b"steps");
    // value: u64
    if steps <= 23 {
        payload.push(steps as u8);
    } else if steps <= 0xff {
        payload.push(0x18);
        payload.push(steps as u8);
    } else if steps <= 0xffff {
        payload.push(0x19);
        payload.extend_from_slice(&(steps as u16).to_be_bytes());
    } else if steps <= 0xffff_ffff {
        payload.push(0x1a);
        payload.extend_from_slice(&(steps as u32).to_be_bytes());
    } else {
        payload.push(0x1b);
        payload.extend_from_slice(&steps.to_be_bytes());
    }
    // key "outcome" (text, 7 bytes)
    payload.push(0x67);
    payload.extend_from_slice(b"outcome");
    // value: text
    let outcome_bytes = outcome.as_bytes();
    let len = outcome_bytes.len();
    if len <= 23 {
        payload.push(0x60 | len as u8);
    } else {
        payload.push(0x78);
        payload.push(len as u8);
    }
    payload.extend_from_slice(outcome_bytes);

    let env = envelope::Envelope {
        handle: 0,
        verb: "meter-report".to_string(),
        payload,
        nonce: 0,
    };
    let encoded = envelope::encode_envelope(&env);
    let _ = worker_io::with_transport(|t| t.send_raw_frame(&encoded));
}

/// Decode a meter-config CBOR payload: {"hard_limit": u64}.
fn decode_meter_config(data: &[u8]) -> Option<u64> {
    // Minimal CBOR map decoder — look for "hard_limit" key.
    let mut pos = 0;
    if pos >= data.len() {
        return None;
    }
    let first = data[pos];
    pos += 1;
    // Expect map (major type 5)
    if (first >> 5) != 5 {
        return None;
    }
    let n_entries = (first & 0x1f) as usize;
    for _ in 0..n_entries {
        let (key, new_pos) = cbor_read_text(data, pos)?;
        pos = new_pos;
        if key == "hard_limit" {
            let (val, _) = cbor_read_uint(data, pos)?;
            return Some(val);
        }
        // Skip the value
        pos = cbor_skip(data, pos)?;
    }
    None
}

/// Read a CBOR text string at `pos`, return (string, next_pos).
fn cbor_read_text(data: &[u8], pos: usize) -> Option<(&str, usize)> {
    if pos >= data.len() {
        return None;
    }
    let first = data[pos];
    if (first >> 5) != 3 {
        return None; // not text
    }
    let (len, hdr_end) = cbor_read_length(data, pos)?;
    let end = hdr_end + len;
    if end > data.len() {
        return None;
    }
    let s = std::str::from_utf8(&data[hdr_end..end]).ok()?;
    Some((s, end))
}

/// Read a CBOR unsigned integer at `pos`, return (value, next_pos).
fn cbor_read_uint(data: &[u8], pos: usize) -> Option<(u64, usize)> {
    if pos >= data.len() {
        return None;
    }
    let first = data[pos];
    if (first >> 5) != 0 {
        return None; // not unsigned int
    }
    let additional = first & 0x1f;
    match additional {
        0..=23 => Some((additional as u64, pos + 1)),
        24 => {
            if pos + 2 > data.len() { return None; }
            Some((data[pos + 1] as u64, pos + 2))
        }
        25 => {
            if pos + 3 > data.len() { return None; }
            let v = u16::from_be_bytes([data[pos + 1], data[pos + 2]]);
            Some((v as u64, pos + 3))
        }
        26 => {
            if pos + 5 > data.len() { return None; }
            let v = u32::from_be_bytes(data[pos + 1..pos + 5].try_into().ok()?);
            Some((v as u64, pos + 5))
        }
        27 => {
            if pos + 9 > data.len() { return None; }
            let v = u64::from_be_bytes(data[pos + 1..pos + 9].try_into().ok()?);
            Some((v as u64, pos + 9))
        }
        _ => None,
    }
}

/// Read the length from a CBOR item header, return (length, pos
/// after header).
fn cbor_read_length(data: &[u8], pos: usize) -> Option<(usize, usize)> {
    let additional = data[pos] & 0x1f;
    match additional {
        0..=23 => Some((additional as usize, pos + 1)),
        24 => {
            if pos + 2 > data.len() { return None; }
            Some((data[pos + 1] as usize, pos + 2))
        }
        25 => {
            if pos + 3 > data.len() { return None; }
            let v = u16::from_be_bytes([data[pos + 1], data[pos + 2]]);
            Some((v as usize, pos + 3))
        }
        26 => {
            if pos + 5 > data.len() { return None; }
            let v = u32::from_be_bytes(data[pos + 1..pos + 5].try_into().ok()?);
            Some((v as usize, pos + 5))
        }
        _ => None,
    }
}

/// Skip one CBOR item at `pos`, return next_pos.
fn cbor_skip(data: &[u8], pos: usize) -> Option<usize> {
    if pos >= data.len() {
        return None;
    }
    let major = data[pos] >> 5;
    match major {
        0 | 1 => {
            // unsigned / negative int
            let (_, next) = cbor_read_length(data, pos)?;
            Some(next)
        }
        2 | 3 => {
            // bytes / text
            let (len, hdr_end) = cbor_read_length(data, pos)?;
            Some(hdr_end + len)
        }
        4 => {
            // array
            let (count, mut p) = cbor_read_length(data, pos)?;
            for _ in 0..count {
                p = cbor_skip(data, p)?;
            }
            Some(p)
        }
        5 => {
            // map
            let (count, mut p) = cbor_read_length(data, pos)?;
            for _ in 0..count {
                p = cbor_skip(data, p)?;
                p = cbor_skip(data, p)?;
            }
            Some(p)
        }
        7 => {
            // simple / float
            let additional = data[pos] & 0x1f;
            match additional {
                0..=23 => Some(pos + 1),
                24 => Some(pos + 2),
                25 => Some(pos + 3),
                26 => Some(pos + 5),
                27 => Some(pos + 9),
                _ => None,
            }
        }
        _ => None,
    }
}

/// Source for an XS program driven by [`run_xs_program`].
pub enum XsProgram<'a> {
    /// Inline IIFE/script source. Evaluated at realm top-level.
    Bundle(&'a str),
    /// Compartment-map zip archive bytes (on disk or embedded).
    Archive(&'a [u8]),
}

/// Unified XS runner.
///
/// The `(program, transport)` matrix encodes the four modes the
/// Endo daemon needs:
///
/// | Program | Transport | Mode |
/// |---|---|---|
/// | `Bundle` | `Some` | Supervised XS peer (workers, manager).   |
/// | `Archive` | `Some` | Supervised archive (future: in-process). |
/// | `Archive` | `None`  | Standalone run-to-idle (`endor run`).    |
/// | `Bundle`  | `None`  | Run-to-idle for an embedded bundle.     |
///
/// Supervised modes run the main loop dispatching envelopes into
/// JS `handleCommand`; standalone modes drain promises/timers to
/// quiescence and return.
pub fn run_xs_program(
    program: XsProgram<'_>,
    creation: &ffi::XsCreation,
    label: &str,
    transport: Option<Box<dyn worker_io::WorkerTransport>>,
) -> Result<(), XsnapError> {
    eprintln!("{label}: starting");
    ensure_shared_cluster();

    let supervised = transport.is_some();
    let mut restore_path: Option<String> = None;

    // 1. Install transport + register worker-I/O host functions
    //    (always installed so that bundles that reference
    //    sendRawFrame/trace/etc. resolve; in standalone mode, only
    //    trace is exercised).
    if let Some(mut t) = transport {
        let init_result = t.init_handshake()
            .map_err(|e| XsnapError::Io(format!("init handshake failed: {e}")))?;
        if let worker_io::InitResult::Restore(_, path_bytes) = init_result {
            let path_str = String::from_utf8(path_bytes)
                .map_err(|e| XsnapError::Io(format!("restore path not UTF-8: {e}")))?;
            restore_path = Some(path_str);
        }
        eprintln!("{label}: init handshake complete");
        worker_io::install_transport(t);
    }

    // 2. Create the machine: either fresh or from snapshot file.
    let is_restore = restore_path.is_some();
    let machine = if let Some(ref snap_path) = restore_path {
        eprintln!("{label}: restoring from snapshot file {snap_path}");
        let file = std::fs::File::open(snap_path)
            .map_err(|e| XsnapError::Io(format!("open snapshot: {e}")))?;
        let mut callbacks = worker_snapshot_callbacks();
        let m = Machine::from_snapshot_file(
            file,
            label,
            SNAPSHOT_SIGNATURE,
            &mut callbacks,
        ).map_err(|e| XsnapError::MachineInit(format!("snapshot restore failed: {e}")))?;
        eprintln!("{label}: machine restored from snapshot");
        m
    } else {
        eprintln!("{label}: cluster ready, creating machine");
        let m = Machine::new(creation, label)
            .ok_or_else(|| XsnapError::MachineInit("failed to create XS machine".to_string()))?;
        eprintln!("{label}: machine created");
        m
    };

    // For fresh machines, register host functions and bootstrap.
    // For restored machines, the snapshot already has the globals —
    // we only need to set up the host context pointer for powers.
    if !is_restore {
        machine.register_worker_io();
        eprintln!("{label}: worker I/O registered");
    }

    // Register host powers context (needed for both fresh and
    // restored machines — the context pointer is not in the
    // snapshot).
    let powers_ptr = register_host_powers(&machine);

    if !is_restore {
        // Standalone runs get a print() alias for basic console output.
        if !supervised {
            machine.define_function("print", worker_io::host_trace, 1);
        }

        // Install host<Name> aliases so bundled code that references
        // hostReadFile / hostSendRawFrame / hostGetDaemonHandle / ...
        // resolves to the unprefixed implementations. This runs BEFORE
        // SES lockdown so it can write to globalThis.
        machine
            .eval(HOST_ALIASES)
            .expect("host aliases evaluation failed");

        // Install native TextEncoder/TextDecoder replacements before SES
        // lockdown so that the bundled `new TextEncoder()` picks up the
        // fast native implementation instead of XS's built-in which is
        // extremely slow for large strings (>100KB).
        machine.eval(
            "(function() { \
                var OrigEncoder = globalThis.TextEncoder; \
                var OrigDecoder = globalThis.TextDecoder; \
                function NativeTextEncoder() {} \
                NativeTextEncoder.prototype.encode = function(s) { \
                    return new Uint8Array(hostEncodeUtf8(s)); \
                }; \
                globalThis.TextEncoder = NativeTextEncoder; \
                function NativeTextDecoder() {} \
                NativeTextDecoder.prototype.decode = function(buf) { \
                    if (buf instanceof ArrayBuffer) { \
                        return hostDecodeUtf8(new Uint8Array(buf)); \
                    } \
                    return hostDecodeUtf8(buf); \
                }; \
                globalThis.TextDecoder = NativeTextDecoder; \
            })();",
        );

        // Bootstrap: polyfills → SES boot → role-specific program
        bootstrap_ses(&machine, label);
        eprintln!("{label}: SES bootstrapped");

        // Install globalThis.Base64 so that @endo/base64 picks up the
        // native Rust-backed codec instead of the pure-JS fallback.
        machine.eval(
            "globalThis.Base64 = harden({ \
                decode(s) { return new Uint8Array(hostBase64Decode(s)); }, \
                encode(b) { return hostBase64Encode(b); }, \
            });",
        );
        eprintln!("{label}: Base64 native binding installed");
    }

    if !is_restore {
        match program {
            XsProgram::Bundle(src) => {
                // The bundle is an IIFE that:
                // (a) defines all `const`s in a function scope, and
                // (b) calls async `main()` with `.catch()` — no
                //     synchronous throws to worry about.
                // We use eval_wrapped (inline try/catch) as a safety
                // net for any unexpected synchronous errors.
                if !eval_wrapped(&machine, src, &format!("{label}/bundle")) {
                    return Err(XsnapError::Bootstrap(format!(
                        "{label}: bundle eval threw"
                    )));
                }
                eprintln!("{label}: bundle eval returned, quiescing");
                machine.quiesce();
                eprintln!("{label}: quiesce complete");
            }
            XsProgram::Archive(bytes) => {
                // Provide globals visible inside archive Compartments.
                machine.eval(
                    "globalThis.__archiveEndowments = { \
                        print: trace, trace, \
                        readFileText, writeFileText, readDir, mkdir, \
                        remove, rename, exists, isDir, readLink, \
                        openReader, read, closeReader, \
                        openWriter, write, closeWriter, \
                        openDir, closeDir, symlink, link, \
                        sha256, sha256Init, sha256Update, sha256Finish, \
                        randomHex256, ed25519Keygen, ed25519Sign, \
                        getPid, getEnv, joinPath, realPath \
                    };",
                );
                let cursor = std::io::Cursor::new(bytes);
                let archive = archive::load_archive(cursor)
                    .map_err(|e| XsnapError::Archive(format!("cannot read archive: {e}")))?;
                if !archive::install_archive(&machine, &archive) {
                    return Err(XsnapError::Archive(
                        "archive installation failed".to_string(),
                    ));
                }
                machine.quiesce();
            }
        }
        eprintln!("{label}: bootstrap eval complete");
    }

    if supervised {
        eprintln!("{label}: entering main loop");

        // Enable metering — the callback checks the thread-local
        // CRANK_LIMIT and aborts if exceeded.
        machine.begin_metering(DEFAULT_METERING_INTERVAL);

        'outer: loop {
            // ---- Crank start ----
            // Reset the step counter and apply the hard limit.
            machine.set_meter(0);
            METERING_ABORTED.with(|a| a.set(false));
            let hard_limit = CRANK_HARD_LIMIT.with(|c| c.get());
            set_crank_limit(hard_limit);

            // Block until the next envelope arrives.
            let frame = worker_io::with_transport(|t| t.recv_raw_envelope());
            match frame {
                Ok(Some(data)) => {
                    if matches!(handle_envelope(&machine, &data), EnvelopeAction::Suspend) {
                        eprintln!("{label}: suspended");
                        break;
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    eprintln!("{label}: recv error: {e}");
                    break;
                }
            }

            // Reactive pump: drain promise jobs and interleave with
            // non-blocking envelope dispatch so that CapTP round-trips
            // can complete without deadlocking.
            //
            // fxHasPendingJobs() is check-and-reset: returns 1 if any
            // promise job was queued since the last call, then clears
            // the flag. We loop `fxRunPromiseJobs` until no new jobs
            // are queued, then drain inbound envelopes. If after
            // draining we still have fresh jobs, repeat. When both
            // promise jobs and envelopes are exhausted, break.
            let mut metering_abort = false;
            loop {
                // Drain all ready promise jobs (multiple turns may be
                // needed as resolving one promise can queue another).
                // Use the metered wrapper so that a metering abort
                // (longjmp) stays within C and doesn't cross Rust
                // stack frames.
                loop {
                    match machine.run_promise_jobs_metered() {
                        Ok(()) => {}
                        Err(status) => {
                            eprintln!(
                                "{label}: metering abort (status {status}) \
                                 after {} computrons",
                                machine.current_computrons()
                            );
                            metering_abort = true;
                            break;
                        }
                    }
                    if unsafe { ffi::fxHasPendingJobs() } == 0 {
                        break;
                    }
                }

                if metering_abort {
                    break;
                }

                // Drain any envelopes that arrived while JS was running.
                let mut got_envelope = false;
                loop {
                    match worker_io::with_transport(|t| t.try_recv_raw_envelope()) {
                        Ok(Some(data)) => {
                            got_envelope = true;
                            if matches!(handle_envelope(&machine, &data), EnvelopeAction::Suspend) {
                                eprintln!("{label}: suspended (during pump)");
                                break 'outer;
                            }
                        }
                        Ok(None) => break,
                        Err(e) => {
                            eprintln!("{label}: try_recv error: {e}");
                            break 'outer;
                        }
                    }
                }

                // Flush any debug output generated during this pump
                // cycle (breakpoint hits, step responses, etc.).
                flush_debug_outbound();

                // If we processed envelopes, loop back to drain the
                // promise jobs they may have triggered.
                if got_envelope {
                    continue;
                }

                // No envelopes and no ready promise jobs. Check if
                // any new jobs were queued during envelope handling
                // (e.g., by sendRawFrame callbacks).
                if unsafe { ffi::fxHasPendingJobs() } != 0 {
                    continue;
                }

                // Truly idle — break to the outer loop which will
                // block for the next envelope.
                break;
            }

            // ---- Crank end ----
            let steps = machine.current_computrons();
            set_crank_limit(0);

            if metering_abort {
                send_meter_report(steps, "terminated");
                eprintln!("{label}: terminated by metering (used {steps} computrons)");
                break 'outer;
            }

            // Report steps to the supervisor.
            send_meter_report(steps, "ok");

            if let Some(JsValue::Boolean(true)) =
                machine.eval("__shouldTerminate()")
            {
                break;
            }
        }

        machine.end_metering();
    } else {
        // Run until idle: drain promise jobs and fire timers until
        // both queues are empty.
        machine.run_loop();
    }

    unsafe { drop(Box::from_raw(powers_ptr)) };
    drop(machine);
    Ok(())
}

/// Run as a supervised XS worker: the envelope peer speaks on fds
/// 3/4 and the worker bundle runs a single CapTP session on the
/// parent daemon handle.
///
/// Used by `endor worker`.
///
/// # Safety
///
/// Must only be called once per process (acquires fds 3/4).
pub unsafe fn run_xs_worker() -> Result<(), XsnapError> {
    let t = worker_io::PipeTransport::from_fds()
        .map_err(|e| XsnapError::Io(format!("failed to open worker pipes: {e}")))?;
    run_xs_program(
        XsProgram::Bundle(WORKER_BOOTSTRAP),
        &WORKER_CREATION,
        "endor[worker]",
        Some(Box::new(t)),
    )
}

/// Run the manager bundle inside the current thread over an
/// in-process channel transport.
///
/// Called from the daemon process on a dedicated `std::thread`
/// spawned by `endo::inproc::spawn_inproc_xs_manager`.
pub fn run_xs_manager_inproc(
    transport: Box<dyn worker_io::WorkerTransport>,
) -> Result<(), XsnapError> {
    run_xs_program(
        XsProgram::Bundle(MANAGER_BOOTSTRAP),
        &MANAGER_CREATION,
        "endor[manager]",
        Some(transport),
    )
}

/// Run the worker bundle inside the current thread over an
/// in-process channel transport.
///
/// Used for both fresh in-process workers and resumed (restored)
/// workers.  When the transport's init handshake returns a
/// "restore" verb, `run_xs_program` skips the bundle eval and
/// restores from the snapshot instead.
pub fn run_xs_worker_inproc(
    transport: Box<dyn worker_io::WorkerTransport>,
) -> Result<(), XsnapError> {
    run_xs_program(
        XsProgram::Bundle(WORKER_BOOTSTRAP),
        &WORKER_CREATION,
        "endor[worker]",
        Some(transport),
    )
}

/// Standalone archive runner: load a compartment-map zip archive,
/// import its entry module, drain promise jobs and timers, and
/// return.
///
/// Used by `endor run`.
pub fn run_xs_archive(archive_path: &std::path::Path) -> Result<(), XsnapError> {
    eprintln!("endor[run]: {}", archive_path.display());
    let bytes = std::fs::read(archive_path)
        .map_err(|e| XsnapError::Io(format!("cannot open {}: {e}", archive_path.display())))?;
    run_xs_program(
        XsProgram::Archive(&bytes),
        &WORKER_CREATION,
        "endor[run]",
        None,
    )
}

/// Run a pre-loaded archive (e.g., loaded from CAS).
///
/// Same as `run_xs_archive` but skips the ZIP parsing step.
pub fn run_xs_archive_loaded(loaded: &archive::LoadedArchive) -> Result<(), XsnapError> {
    eprintln!("endor[run]: from pre-loaded archive");
    ensure_shared_cluster();

    let machine = Machine::new(&WORKER_CREATION, "endor[run]")
        .ok_or_else(|| XsnapError::MachineInit("failed to create XS machine".to_string()))?;

    machine.register_worker_io();
    register_host_powers(&machine);

    // Provide archive endowments.
    machine.eval(
        "globalThis.__archiveEndowments = { \
            print: trace, trace, \
            readFileText, writeFileText, readDir, mkdir, \
            remove, rename, exists, isDir, readLink, \
            openReader, read, closeReader, \
            openWriter, write, closeWriter, \
            openDir, closeDir, symlink, link, \
            sha256, sha256Init, sha256Update, sha256Finish, \
            randomHex256, ed25519Keygen, ed25519Sign, \
            getPid, getEnv, joinPath, realPath \
        };",
    );

    if !archive::install_archive(&machine, loaded) {
        return Err(XsnapError::Archive(
            "archive installation failed".to_string(),
        ));
    }
    machine.quiesce();
    Ok(())
}

#[cfg(test)]
mod debug_protocol_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::worker_io::WorkerTransport;
    use std::sync::Once;

    static INIT: Once = Once::new();

    fn setup() {
        INIT.call_once(|| {
            initialize_shared_cluster();
        });
    }

    fn new_machine() -> Machine {
        setup();
        Machine::new(&DEFAULT_CREATION, "test").expect("failed to create machine")
    }

    #[test]
    fn create_and_destroy_machine() {
        let _machine = new_machine();
    }

    #[test]
    fn eval_arithmetic() {
        let machine = new_machine();
        match machine.eval("1 + 1").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 2),
            JsValue::Number(n) => assert_eq!(n, 2.0),
            other => panic!("expected number, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn promise_resolve() {
        let machine = new_machine();
        machine.eval("Promise.resolve(42); undefined").expect("Promise.resolve failed");
        machine.eval("new Promise(function(resolve) { resolve(42); }); undefined")
            .expect("new Promise failed");
        match machine.eval("typeof Promise.resolve(42).then") {
            Some(JsValue::String(s)) => assert_eq!(s, "function"),
            other => panic!("expected 'function', got {:?}", other.map(|v| js_value_debug(&v))),
        }
        machine.eval("Promise.resolve(42).then(function(v) { return v; }); undefined")
            .expect(".then(fn) crashed");
    }

    #[test]
    fn eval_string() {
        let machine = new_machine();
        match machine.eval("'hello' + ' ' + 'world'").unwrap() {
            JsValue::String(s) => assert_eq!(s, "hello world"),
            other => panic!("expected string, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn eval_boolean() {
        let machine = new_machine();
        match machine.eval("true").unwrap() {
            JsValue::Boolean(b) => assert!(b),
            other => panic!("expected boolean, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn eval_undefined() {
        let machine = new_machine();
        match machine.eval("undefined").unwrap() {
            JsValue::Undefined => {}
            other => panic!("expected undefined, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn eval_to_string_coercion() {
        let machine = new_machine();
        assert_eq!(machine.eval_to_string("1 + 2").unwrap(), "3");
        assert_eq!(
            machine.eval_to_string("'hello'").unwrap(),
            "hello"
        );
    }

    #[test]
    fn host_function_define() {
        let machine = new_machine();

        unsafe extern "C" fn noop(_the: *mut XsMachine) {}

        machine.define_function("noop", noop, 0);
        // Just check that define doesn't crash
        // and the function exists as a callable
        match machine.eval("typeof noop").unwrap() {
            JsValue::String(s) => assert_eq!(s, "function"),
            other => panic!("expected 'function', got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn host_function_call() {
        let machine = new_machine();

        unsafe extern "C" fn return_42(the: *mut XsMachine) {
            fxInteger(the, &mut (*the).scratch, 42);
            *(*the).frame.add(1) = (*the).scratch;
        }

        machine.define_function("hostReturn42", return_42, 0);

        match machine.eval("hostReturn42()").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 42),
            other => panic!("expected 42, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn host_function_with_args() {
        let machine = new_machine();

        // Host function that adds two numbers
        unsafe extern "C" fn add(the: *mut XsMachine) {
            // mxArgv(0) = frame - 1, mxArgv(1) = frame - 2
            let a = fxToInteger(the, (*the).frame.sub(1));
            let b = fxToInteger(the, (*the).frame.sub(2));
            fxInteger(the, &mut (*the).scratch, a + b);
            // xsResult = the->frame[1]
            *(*the).frame.add(1) = (*the).scratch;
        }

        machine.define_function("hostAdd", add, 2);

        match machine.eval("hostAdd(17, 25)").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 42),
            other => panic!("expected 42, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn host_function_with_string_arg() {
        let machine = new_machine();

        // Host function that returns the length of a string
        unsafe extern "C" fn strlen(the: *mut XsMachine) {
            let s = fxToString(the, (*the).frame.sub(1));
            let len = std::ffi::CStr::from_ptr(s).to_bytes().len() as i32;
            fxInteger(the, &mut (*the).scratch, len);
            *(*the).frame.add(1) = (*the).scratch;
        }

        machine.define_function("hostStrlen", strlen, 1);

        match machine.eval("hostStrlen('hello')").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 5),
            other => panic!("expected 5, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn global_state_persists() {
        let machine = new_machine();
        machine.eval("var x = 10").unwrap();
        match machine.eval("x + 5").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 15),
            JsValue::Number(n) => assert_eq!(n, 15.0),
            other => panic!("expected 15, got {:?}", js_value_debug(&other)),
        }
    }

    fn js_value_debug(v: &JsValue) -> String {
        match v {
            JsValue::Undefined => "undefined".to_string(),
            JsValue::Null => "null".to_string(),
            JsValue::Boolean(b) => format!("boolean({})", b),
            JsValue::Integer(n) => format!("integer({})", n),
            JsValue::Number(n) => format!("number({})", n),
            JsValue::String(s) => format!("string({:?})", s),
        }
    }

    // --- Phase 2: Host Powers Tests ---

    fn new_machine_with_powers(
        powers: &mut powers::HostPowers,
    ) -> Machine {
        let machine = new_machine();
        machine.register_powers(powers as *mut powers::HostPowers);
        machine
    }

    #[test]
    fn fs_write_and_read() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = cap_std::fs::Dir::open_ambient_dir(
            tmp.path(),
            cap_std::ambient_authority(),
        )
        .unwrap();

        let mut powers = powers::HostPowers::new();
        powers.add_dir("test", dir);

        let machine = new_machine_with_powers(&mut powers);

        // Write a file
        machine
            .eval("writeFileText('test', 'hello.txt', 'Hello from XS!')")
            .unwrap();

        // Read it back
        match machine.eval("readFileText('test', 'hello.txt')").unwrap() {
            JsValue::String(s) => assert_eq!(s, "Hello from XS!"),
            other => panic!("expected string, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn fs_exists_and_is_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = cap_std::fs::Dir::open_ambient_dir(
            tmp.path(),
            cap_std::ambient_authority(),
        )
        .unwrap();

        let mut powers = powers::HostPowers::new();
        powers.add_dir("test", dir);

        let machine = new_machine_with_powers(&mut powers);

        // Initially doesn't exist
        match machine.eval("exists('test', 'sub')").unwrap() {
            JsValue::Boolean(b) => assert!(!b),
            other => panic!("expected false, got {:?}", js_value_debug(&other)),
        }

        // Create directory
        machine.eval("mkdir('test', 'sub')").unwrap();

        // Now exists and is a directory
        match machine.eval("exists('test', 'sub')").unwrap() {
            JsValue::Boolean(b) => assert!(b),
            other => panic!("expected true, got {:?}", js_value_debug(&other)),
        }
        match machine.eval("isDir('test', 'sub')").unwrap() {
            JsValue::Boolean(b) => assert!(b),
            other => panic!("expected true, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn fs_readdir() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = cap_std::fs::Dir::open_ambient_dir(
            tmp.path(),
            cap_std::ambient_authority(),
        )
        .unwrap();

        let mut powers = powers::HostPowers::new();
        powers.add_dir("test", dir);

        let machine = new_machine_with_powers(&mut powers);

        // Create some files
        machine
            .eval("writeFileText('test', 'a.txt', 'a')")
            .unwrap();
        machine
            .eval("writeFileText('test', 'b.txt', 'b')")
            .unwrap();

        // Read directory — returns JSON array
        match machine.eval("readDir('test', '')").unwrap() {
            JsValue::String(s) => {
                assert!(s.contains("a.txt"), "expected a.txt in {}", s);
                assert!(s.contains("b.txt"), "expected b.txt in {}", s);
            }
            other => panic!("expected string, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn fs_remove_and_rename() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = cap_std::fs::Dir::open_ambient_dir(
            tmp.path(),
            cap_std::ambient_authority(),
        )
        .unwrap();

        let mut powers = powers::HostPowers::new();
        powers.add_dir("test", dir);

        let machine = new_machine_with_powers(&mut powers);

        // Write, rename, read
        machine
            .eval("writeFileText('test', 'old.txt', 'data')")
            .unwrap();
        machine
            .eval("rename('test', 'old.txt', 'new.txt')")
            .unwrap();

        match machine.eval("exists('test', 'old.txt')").unwrap() {
            JsValue::Boolean(b) => assert!(!b),
            _ => panic!("old.txt should not exist"),
        }
        match machine.eval("readFileText('test', 'new.txt')").unwrap() {
            JsValue::String(s) => assert_eq!(s, "data"),
            other => panic!("expected 'data', got {:?}", js_value_debug(&other)),
        }

        // Remove
        machine.eval("remove('test', 'new.txt')").unwrap();
        match machine.eval("exists('test', 'new.txt')").unwrap() {
            JsValue::Boolean(b) => assert!(!b),
            _ => panic!("new.txt should not exist after remove"),
        }
    }

    #[test]
    fn crypto_sha256() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        // SHA-256 of empty string
        match machine.eval("sha256('')").unwrap() {
            JsValue::String(s) => assert_eq!(
                s,
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            ),
            other => panic!("expected hash string, got {:?}", js_value_debug(&other)),
        }

        // SHA-256 of "hello"
        match machine.eval("sha256('hello')").unwrap() {
            JsValue::String(s) => assert_eq!(
                s,
                "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
            ),
            other => panic!("expected hash string, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn crypto_random_hex() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        match machine.eval("randomHex256()").unwrap() {
            JsValue::String(s) => {
                assert_eq!(s.len(), 64, "expected 64 hex chars, got {}", s.len());
                assert!(
                    s.chars().all(|c| c.is_ascii_hexdigit()),
                    "expected hex string, got {}",
                    s
                );
            }
            other => panic!("expected string, got {:?}", js_value_debug(&other)),
        }

        // Two calls should produce different values
        let a = machine.eval_to_string("randomHex256()").unwrap();
        let b = machine.eval_to_string("randomHex256()").unwrap();
        assert_ne!(a, b, "random should produce different values");
    }

    // --- Phase 3: Compartment and Module Loading Tests ---

    #[test]
    fn compartment_basic_evaluate() {
        let machine = new_machine();
        machine.eval("var c = new Compartment({});").unwrap();
        match machine.eval("c.evaluate('1 + 1')").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 2),
            other => panic!("expected 2, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn compartment_global_isolation() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        // sha256 should be visible in the main global
        match machine.eval("typeof sha256").unwrap() {
            JsValue::String(s) => assert_eq!(s, "function"),
            other => panic!("expected 'function', got {:?}", js_value_debug(&other)),
        }

        // But NOT visible inside a bare compartment
        machine.eval("var guestC = new Compartment({});").unwrap();
        match machine.eval("guestC.evaluate('typeof sha256')").unwrap() {
            JsValue::String(s) => assert_eq!(s, "undefined",
                "guest compartment should NOT see host functions"),
            other => panic!("expected 'undefined', got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn compartment_custom_globals() {
        let machine = new_machine();
        // Pass custom globals into the compartment — two separate evals
        // to avoid re-entrant eval issues
        machine.eval(
            "var c2 = new Compartment({ globals: { x: 42, greeting: 'hello' } });"
        ).unwrap();

        match machine.eval("c2.evaluate('x + 8')").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 50),
            other => panic!("expected 50, got {:?}", js_value_debug(&other)),
        }

        // Verify string global
        match machine.eval("c2.evaluate('greeting')").unwrap() {
            JsValue::String(s) => assert_eq!(s, "hello"),
            other => panic!("expected 'hello', got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn compartment_cannot_mutate_host_globals() {
        let machine = new_machine();
        machine.eval("var sentinel = 'original'").unwrap();

        // Guest compartment has its own sentinel — should not affect host
        machine.eval(
            "var c3 = new Compartment({ globals: { sentinel: 'modified' } });"
        ).unwrap();
        machine.eval("c3.evaluate('sentinel')").unwrap();

        match machine.eval("sentinel").unwrap() {
            JsValue::String(s) => assert_eq!(s, "original",
                "host global should not be modified by guest compartment"),
            other => panic!("expected 'original', got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn compartment_selective_endowments() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        // Create a compartment that only gets sha256, not other host fns
        machine.eval(
            "var endowed = new Compartment({ \
                globals: { sha256: sha256 } \
             });"
        ).unwrap();

        match machine.eval(
            "endowed.evaluate('sha256(\"hello\")')"
        ).unwrap() {
            JsValue::String(s) => assert_eq!(
                s, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
            ),
            other => panic!("expected hash, got {:?}", js_value_debug(&other)),
        }

        // But randomHex256 should NOT be available
        match machine.eval(
            "endowed.evaluate('typeof randomHex256')"
        ).unwrap() {
            JsValue::String(s) => assert_eq!(s, "undefined"),
            other => panic!("expected 'undefined', got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn module_registry_and_load() {
        let mut powers = powers::HostPowers::new();
        powers.add_module("math-utils", "var exports = { double: function(x) { return x * 2; } }; exports;");

        let machine = new_machine_with_powers(&mut powers);

        // Verify the host function can look up module source
        match machine.eval("loadModuleSource('math-utils')").unwrap() {
            JsValue::String(s) => assert!(s.contains("double"),
                "expected module source containing 'double', got {}", s),
            other => panic!("expected string, got {:?}", js_value_debug(&other)),
        }

        // Unknown module returns undefined
        match machine.eval("loadModuleSource('nonexistent')").unwrap() {
            JsValue::Undefined => {}
            other => panic!("expected undefined for missing module, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn module_resolve_specifiers() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        // Absolute specifier passes through
        match machine.eval("resolveModule('@endo/far', 'anything')").unwrap() {
            JsValue::String(s) => assert_eq!(s, "@endo/far"),
            other => panic!("expected '@endo/far', got {:?}", js_value_debug(&other)),
        }

        // Relative specifier resolves against referrer
        match machine.eval("resolveModule('./utils', 'lib/main')").unwrap() {
            JsValue::String(s) => assert_eq!(s, "lib/utils"),
            other => panic!("expected 'lib/utils', got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn compartment_with_load_now_hook() {
        let mut powers = powers::HostPowers::new();
        // Register a module that exports a value
        powers.add_module(
            "greeter",
            "export default function greet(name) { return 'Hello, ' + name + '!'; }"
        );

        let machine = new_machine_with_powers(&mut powers);

        // Create a compartment with resolveHook and loadNowHook
        // that uses our host functions. The loadNowHook must return
        // { source: new ModuleSource(code) } — XS treats a string
        // source as a specifier alias, not source text.
        machine.eval("\
            var modComp = new Compartment({ \
                resolveHook: function(specifier, referrer) { \
                    return resolveModule(specifier, referrer || ''); \
                }, \
                loadNowHook: function(specifier) { \
                    var src = loadModuleSource(specifier); \
                    if (src === undefined) \
                        throw new Error('Module not found: ' + specifier); \
                    return { source: new ModuleSource(src) }; \
                } \
            });"
        ).unwrap();

        // Import the module synchronously
        machine.eval("var mod = modComp.importNow('greeter');").unwrap();

        match machine.eval("mod.default('XS')").unwrap() {
            JsValue::String(s) => assert_eq!(s, "Hello, XS!"),
            other => panic!("expected 'Hello, XS!', got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn compartment_evaluate_with_endowments_factory() {
        let machine = new_machine();

        // Simulate the Endo pattern: a factory function that receives powers
        // and returns a capability object
        machine.eval("\
            var guestFactory = new Compartment({ \
                globals: { \
                    makeGreeter: function(prefix) { \
                        return { \
                            greet: function(name) { return prefix + ' ' + name; } \
                        }; \
                    } \
                } \
             });"
        ).unwrap();

        machine.eval(
            "var greeter = guestFactory.evaluate('makeGreeter(\"Hi\")');"
        ).unwrap();

        match machine.eval("greeter.greet('World')").unwrap() {
            JsValue::String(s) => assert_eq!(s, "Hi World"),
            other => panic!("expected 'Hi World', got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn compartment_nested_isolation() {
        let machine = new_machine();

        // Outer compartment creates inner compartment — inner should not
        // see outer's globals
        machine.eval("\
            var outer = new Compartment({ \
                globals: { secret: 'outer-secret' } \
             });"
        ).unwrap();

        // Evaluate code in outer that creates and queries inner
        match machine.eval(
            "outer.evaluate( \
                'var inner = new Compartment({}); ' + \
                'inner.evaluate(\"typeof secret\")' \
             )"
        ).unwrap() {
            JsValue::String(s) => assert_eq!(s, "undefined",
                "inner compartment should not see outer's globals"),
            other => panic!("expected 'undefined', got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn module_with_dependencies() {
        let mut powers = powers::HostPowers::new();
        // Register two modules: utils depends on nothing, app depends on utils
        powers.add_module(
            "utils",
            "export function double(x) { return x * 2; }"
        );
        powers.add_module(
            "app",
            "import { double } from 'utils'; \
             export default function compute(x) { return double(x) + 1; }"
        );

        let machine = new_machine_with_powers(&mut powers);

        machine.eval("\
            var depComp = new Compartment({ \
                resolveHook: function(specifier, referrer) { \
                    return resolveModule(specifier, referrer || ''); \
                }, \
                loadNowHook: function(specifier) { \
                    var src = loadModuleSource(specifier); \
                    if (src === undefined) \
                        throw new Error('Module not found: ' + specifier); \
                    return { source: new ModuleSource(src) }; \
                } \
            });"
        ).unwrap();

        machine.eval("var app = depComp.importNow('app');").unwrap();

        match machine.eval("app.default(5)").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 11), // double(5) + 1
            other => panic!("expected 11, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn module_compartment_isolation() {
        let mut powers = powers::HostPowers::new();
        // Register a module that tries to access host globals
        powers.add_module(
            "sneaky",
            "export var hasHash = typeof sha256 !== 'undefined'; \
             export var hasRandom = typeof randomHex256 !== 'undefined';"
        );

        let machine = new_machine_with_powers(&mut powers);

        // Create compartment WITHOUT host function endowments
        machine.eval("\
            var isolatedComp = new Compartment({ \
                resolveHook: function(specifier) { return specifier; }, \
                loadNowHook: function(specifier) { \
                    var src = loadModuleSource(specifier); \
                    if (src === undefined) \
                        throw new Error('Module not found: ' + specifier); \
                    return { source: new ModuleSource(src) }; \
                } \
            });"
        ).unwrap();

        machine.eval("var sneaky = isolatedComp.importNow('sneaky');").unwrap();

        // Module code runs in the compartment's scope — should NOT see host fns
        match machine.eval("sneaky.hasHash").unwrap() {
            JsValue::Boolean(b) => assert!(!b,
                "module in isolated compartment should NOT see sha256"),
            other => panic!("expected false, got {:?}", js_value_debug(&other)),
        }
        match machine.eval("sneaky.hasRandom").unwrap() {
            JsValue::Boolean(b) => assert!(!b,
                "module in isolated compartment should NOT see randomHex256"),
            other => panic!("expected false, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn crypto_ed25519_keygen_and_sign() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        // Generate keypair
        let json = machine.eval_to_string("ed25519Keygen()").unwrap();
        assert!(json.contains("publicKey"), "expected publicKey in {}", json);
        assert!(
            json.contains("privateKey"),
            "expected privateKey in {}",
            json
        );

        // Parse the keys in JS and sign a message
        machine.eval(&format!(
            "var keys = JSON.parse('{}'); var pk = keys.privateKey;",
            json.replace('\'', "\\'")
        )).unwrap();

        // Sign hex-encoded message "hello" = 68656c6c6f
        match machine
            .eval("ed25519Sign(pk, '68656c6c6f')")
            .unwrap()
        {
            JsValue::String(sig) => {
                assert_eq!(
                    sig.len(),
                    128,
                    "Ed25519 signature should be 64 bytes (128 hex chars), got {}",
                    sig.len()
                );
            }
            other => panic!("expected signature, got {:?}", js_value_debug(&other)),
        }
    }

    // --- Phase 4: Envelope Bridge Tests ---

    #[test]
    fn worker_io_host_functions_registered() {
        let machine = new_machine();
        // Install a dummy WorkerIo for the host functions
        let init_env = envelope::Envelope {
            handle: 10,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        };
        let deliver_env = envelope::Envelope {
            handle: 10,
            verb: "deliver".to_string(),
            payload: b"test-frame".to_vec(),
            nonce: 0,
        };
        // Build buffer with init + deliver
        let mut buf = Vec::new();
        envelope::write_envelope(&mut buf, &init_env).unwrap();
        envelope::write_envelope(&mut buf, &deliver_env).unwrap();

        let tmp_read = tempfile::tempfile().unwrap();
        {
            use std::io::Write;
            let mut w = &tmp_read;
            w.write_all(&buf).unwrap();
        }
        use std::io::Seek;
        let mut tmp_read = tmp_read;
        tmp_read.seek(std::io::SeekFrom::Start(0)).unwrap();

        let tmp_write = tempfile::tempfile().unwrap();

        let mut transport = worker_io::PipeTransport::from_streams(
            std::io::BufReader::new(tmp_read),
            std::io::BufWriter::new(tmp_write),
        );
        transport.init_handshake().unwrap();
        worker_io::install_transport(Box::new(transport));
        machine.register_worker_io();

        // Verify host functions exist
        match machine.eval("typeof recvFrame").unwrap() {
            JsValue::String(s) => assert_eq!(s, "function"),
            other => panic!("expected 'function', got {:?}", js_value_debug(&other)),
        }
        match machine.eval("typeof sendFrame").unwrap() {
            JsValue::String(s) => assert_eq!(s, "function"),
            other => panic!("expected 'function', got {:?}", js_value_debug(&other)),
        }
        match machine.eval("typeof getDaemonHandle").unwrap() {
            JsValue::String(s) => assert_eq!(s, "function"),
            other => panic!("expected 'function', got {:?}", js_value_debug(&other)),
        }

        // Get daemon handle
        match machine.eval("getDaemonHandle()").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 10),
            other => panic!("expected 10, got {:?}", js_value_debug(&other)),
        }

        // Receive the deliver frame (hex-encoded)
        match machine.eval("recvFrame()").unwrap() {
            JsValue::String(s) => {
                assert_eq!(s, hex::encode(b"test-frame"));
            }
            other => panic!("expected hex string, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn worker_io_send_and_verify() {
        let machine = new_machine();
        // Set up WorkerIo with just an init envelope
        let init_env = envelope::Envelope {
            handle: 5,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        };
        let mut buf = Vec::new();
        envelope::write_envelope(&mut buf, &init_env).unwrap();

        let tmp_read = tempfile::tempfile().unwrap();
        {
            use std::io::Write;
            let mut w = &tmp_read;
            w.write_all(&buf).unwrap();
        }
        use std::io::Seek;
        let mut tmp_read = tmp_read;
        tmp_read.seek(std::io::SeekFrom::Start(0)).unwrap();

        let tmp_write = tempfile::tempfile().unwrap();
        let tmp_write_clone = tmp_write.try_clone().unwrap();

        let mut transport = worker_io::PipeTransport::from_streams(
            std::io::BufReader::new(tmp_read),
            std::io::BufWriter::new(tmp_write),
        );
        transport.init_handshake().unwrap();
        worker_io::install_transport(Box::new(transport));
        machine.register_worker_io();

        // Send a frame from JS
        // "hello" in hex = 68656c6c6f
        machine.eval("sendFrame('68656c6c6f')").unwrap();

        // Read back the written envelope
        let mut reader = std::io::BufReader::new(tmp_write_clone);
        reader.seek(std::io::SeekFrom::Start(0)).unwrap();
        let env = envelope::read_envelope(&mut reader).unwrap().unwrap();

        assert_eq!(env.handle, 5); // daemon handle from init
        assert_eq!(env.verb, "deliver");
        assert_eq!(env.payload, b"hello");
    }

    #[test]
    fn worker_io_js_echo_loop() {
        let machine = new_machine();
        // Simulate: supervisor sends 3 deliver envelopes, JS echoes each back
        let init_env = envelope::Envelope {
            handle: 1,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        };
        let frames: Vec<&[u8]> = vec![b"msg-1", b"msg-2", b"msg-3"];
        let mut buf = Vec::new();
        envelope::write_envelope(&mut buf, &init_env).unwrap();
        for frame in &frames {
            let env = envelope::Envelope {
                handle: 1,
                verb: "deliver".to_string(),
                payload: frame.to_vec(),
                nonce: 0,
            };
            envelope::write_envelope(&mut buf, &env).unwrap();
        }

        let tmp_read = tempfile::tempfile().unwrap();
        {
            use std::io::Write;
            let mut w = &tmp_read;
            w.write_all(&buf).unwrap();
        }
        use std::io::Seek;
        let mut tmp_read = tmp_read;
        tmp_read.seek(std::io::SeekFrom::Start(0)).unwrap();

        let tmp_write = tempfile::tempfile().unwrap();
        let tmp_write_clone = tmp_write.try_clone().unwrap();

        let mut transport = worker_io::PipeTransport::from_streams(
            std::io::BufReader::new(tmp_read),
            std::io::BufWriter::new(tmp_write),
        );
        transport.init_handshake().unwrap();
        worker_io::install_transport(Box::new(transport));
        machine.register_worker_io();

        // JS echo loop: receive frame, send it back
        machine.eval("\
            var frame; \
            while ((frame = recvFrame()) !== undefined) { \
                sendFrame(frame); \
            }"
        ).unwrap();

        // Read back the 3 echoed envelopes
        let mut reader = std::io::BufReader::new(tmp_write_clone);
        reader.seek(std::io::SeekFrom::Start(0)).unwrap();

        for expected in &frames {
            let env = envelope::read_envelope(&mut reader).unwrap().unwrap();
            assert_eq!(env.verb, "deliver");
            assert_eq!(env.handle, 1);
            assert_eq!(env.payload, *expected);
        }
    }

    // --- Archive Import Tests ---

    fn make_test_zip(
        map: &archive::CompartmentMap,
        files: &[(&str, &str)],
    ) -> Vec<u8> {
        use std::io::Write;
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);

            zip.start_file("compartment-map.json", options).unwrap();
            let map_json = serde_json::to_string(map).unwrap();
            zip.write_all(map_json.as_bytes()).unwrap();

            for (path, content) in files {
                zip.start_file(path.to_string(), options).unwrap();
                zip.write_all(content.as_bytes()).unwrap();
            }
            zip.finish().unwrap();
        }
        buf.into_inner()
    }

    fn make_archive_map(
        compartments: Vec<(&str, &str, Vec<(&str, archive::ModuleDescriptor)>)>,
        entry_compartment: &str,
        entry_module: &str,
    ) -> archive::CompartmentMap {
        let mut comps = std::collections::HashMap::new();
        for (comp_key, comp_name, modules) in compartments {
            let mut mods = std::collections::HashMap::new();
            for (spec, desc) in modules {
                mods.insert(spec.to_string(), desc);
            }
            comps.insert(
                comp_key.to_string(),
                archive::CompartmentDescriptor {
                    name: comp_name.to_string(),
                    label: None,
                    modules: mods,
                },
            );
        }
        archive::CompartmentMap {
            entry: archive::EntryDescriptor {
                compartment: entry_compartment.to_string(),
                module: entry_module.to_string(),
            },
            compartments: comps,
        }
    }

    #[test]
    fn import_archive_single_module() {
        let map = make_archive_map(
            vec![(
                "app-v1",
                "app",
                vec![(".", archive::ModuleDescriptor::File {
                    parser: "mjs".to_string(),
                    location: Some("index.js".to_string()),
                    sha512: None,
                })],
            )],
            "app-v1",
            ".",
        );

        let zip = make_test_zip(&map, &[(
            "app-v1/index.js",
            "export const answer = 42;",
        )]);

        let loaded = archive::load_archive(std::io::Cursor::new(zip)).unwrap();
        let machine = new_machine();
        assert!(machine.import_archive(&loaded));

        match machine.eval("__entryNs.answer").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 42),
            other => panic!("expected 42, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn import_archive_with_cross_compartment_link() {
        let map = make_archive_map(
            vec![
                (
                    "app-v1",
                    "app",
                    vec![
                        (".", archive::ModuleDescriptor::File {
                            parser: "mjs".to_string(),
                            location: Some("index.js".to_string()),
                            sha512: None,
                        }),
                        ("utils", archive::ModuleDescriptor::Link {
                            compartment: "utils-v2".to_string(),
                            module: ".".to_string(),
                        }),
                    ],
                ),
                (
                    "utils-v2",
                    "utils",
                    vec![(".", archive::ModuleDescriptor::File {
                        parser: "mjs".to_string(),
                        location: Some("index.js".to_string()),
                        sha512: None,
                    })],
                ),
            ],
            "app-v1",
            ".",
        );

        let zip = make_test_zip(&map, &[
            (
                "app-v1/index.js",
                "import { triple } from 'utils'; export const result = triple(7);",
            ),
            (
                "utils-v2/index.js",
                "export function triple(x) { return x * 3; }",
            ),
        ]);

        let loaded = archive::load_archive(std::io::Cursor::new(zip)).unwrap();
        let machine = new_machine();
        assert!(machine.import_archive(&loaded));

        match machine.eval("__entryNs.result").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 21), // triple(7)
            other => panic!("expected 21, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn import_archive_make_pattern() {
        // Test the Endo convention: entry module exports make(powers)
        let map = make_archive_map(
            vec![(
                "plugin-v1",
                "plugin",
                vec![(".", archive::ModuleDescriptor::File {
                    parser: "mjs".to_string(),
                    location: Some("index.js".to_string()),
                    sha512: None,
                })],
            )],
            "plugin-v1",
            ".",
        );

        let zip = make_test_zip(&map, &[(
            "plugin-v1/index.js",
            "export function make(powers) { \
                return { \
                    greet: function(name) { \
                        return 'Hello from ' + name + '!'; \
                    } \
                }; \
            }",
        )]);

        let loaded = archive::load_archive(std::io::Cursor::new(zip)).unwrap();
        let machine = new_machine();
        assert!(machine.import_archive(&loaded));

        // Call make() with dummy powers, then call greet()
        machine.eval("var plugin = __entryNs.make({});").unwrap();
        match machine.eval("plugin.greet('XS')").unwrap() {
            JsValue::String(s) => assert_eq!(s, "Hello from XS!"),
            other => panic!("expected greeting, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn import_archive_base64() {
        use base64::Engine;

        let map = make_archive_map(
            vec![(
                "app-v1",
                "app",
                vec![(".", archive::ModuleDescriptor::File {
                    parser: "mjs".to_string(),
                    location: Some("index.js".to_string()),
                    sha512: None,
                })],
            )],
            "app-v1",
            ".",
        );

        let zip = make_test_zip(&map, &[(
            "app-v1/index.js",
            "export const pi = 3;",
        )]);

        let b64 = base64::engine::general_purpose::STANDARD.encode(&zip);
        let loaded = archive::load_archive_base64(&b64).unwrap();
        let machine = new_machine();
        assert!(machine.import_archive(&loaded));

        match machine.eval("__entryNs.pi").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 3),
            other => panic!("expected 3, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn eval_worker_bootstrap() {
        // Use larger machine params for the big bundle
        setup();
        let creation = XsCreation {
            initial_chunk_size: 1024 * 1024,
            incremental_chunk_size: 256 * 1024,
            initial_heap_count: 32768,
            incremental_heap_count: 16384,
            stack_count: 16384,
            initial_key_count: 8192,
            incremental_key_count: 2048,
            name_modulo: 1993,
            symbol_modulo: 127,
            parser_buffer_size: 16 * 1024 * 1024,
            parser_table_modulo: 1993,
            static_size: 0,
            native_stack_size: 0,
        };
        let machine = Machine::new(&creation, "bootstrap-test")
            .expect("machine");
        let bootstrap = include_str!("worker_bootstrap.js");
        eprintln!("bootstrap length: {}", bootstrap.len());

        // Register worker I/O host functions.
        // The bootstrap calls issueCommand which needs WorkerIo.
        // For testing, install a dummy WorkerIo with tempfiles.
        let init_env = envelope::Envelope {
            handle: 1,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        };
        let mut buf = Vec::new();
        envelope::write_envelope(&mut buf, &init_env).unwrap();
        let tmp_read = tempfile::tempfile().unwrap();
        {
            use std::io::Write;
            let mut w = &tmp_read;
            w.write_all(&buf).unwrap();
        }
        use std::io::Seek;
        let mut tmp_read = tmp_read;
        tmp_read.seek(std::io::SeekFrom::Start(0)).unwrap();
        let tmp_write = tempfile::tempfile().unwrap();
        let mut transport = worker_io::PipeTransport::from_streams(
            std::io::BufReader::new(tmp_read),
            std::io::BufWriter::new(tmp_write),
        );
        transport.init_handshake().unwrap();
        worker_io::install_transport(Box::new(transport));
        machine.register_worker_io();

        // Step 0: Evaluate polyfills (assert, harden, TextEncoder)
        let polyfills = include_str!("polyfills.js");
        machine.eval(polyfills).expect("polyfills failed");

        // Step 1: Evaluate SES boot (lockdown + HandledPromise)
        let ses_boot = include_str!("ses_boot.js");
        eprintln!("ses_boot length: {}", ses_boot.len());
        // Use a very fine-grained error handler to get line info
        let ses_as_str = serde_json::to_string(ses_boot).unwrap();
        let ses_wrapped = format!(
            "var __err = undefined; try {{ eval({}) }} catch(e) {{ __err = e; }} __err ? ('ERROR: ' + __err.message + '\\nSTACK: ' + __err.stack) : 'ok'",
            ses_as_str
        );
        match machine.eval(&ses_wrapped) {
            Some(JsValue::String(ref s)) if s.starts_with("ERROR") => {
                for line in s.lines() { eprintln!("  {}", line); }
                panic!("SES boot failed");
            }
            Some(v) => eprintln!("ses_boot result: {}", js_value_debug(&v)),
            None => panic!("ses_boot returned None"),
        }
        machine.run_promise_jobs();

        // Step 2: Evaluate the worker bootstrap
        eprintln!("executing worker bootstrap...");
        let wrapped = format!(
            "var __err2 = undefined; try {{ {} }} catch(e) {{ __err2 = e; }} __err2 ? ('ERROR: ' + __err2.message + '\\nSTACK: ' + __err2.stack) : 'ok'",
            bootstrap
        );
        let result = machine.eval(&wrapped);
        if let Some(JsValue::String(ref s)) = result {
            if s.starts_with("ERROR") {
                for line in s.lines() {
                    eprintln!("  {}", line);
                }
            }
        }
        machine.run_promise_jobs();
        match &result {
            Some(v) => eprintln!("eval result: {}", js_value_debug(v)),
            None => eprintln!("eval returned None (threw)"),
        }
        // Check if handleCommand was defined
        match machine.eval("typeof handleCommand") {
            Some(JsValue::String(s)) => {
                eprintln!("typeof handleCommand = {}", s);
                assert_eq!(s, "function", "handleCommand should be a function");
            }
            other => panic!("typeof handleCommand: {:?}", other.map(|v| js_value_debug(&v))),
        }
        // Diagnostic: check closure-captured fromString.
        let enc_test = "(function() {\
            try {\
              if (typeof globalThis.__abfs_saved !== 'function') return 'saved-not-fn:' + typeof globalThis.__abfs_saved;\
              try { var b = globalThis.__abfs_saved('hi'); return 'ok-saved:' + (b && b.byteLength); }\
              catch(e) { return 'saved-call-err:' + e.message; }\
            } catch(e) { return 'outer:' + e.message; }\
          })()".to_string();
        match machine.eval(&enc_test) {
            Some(JsValue::String(s)) => {
                eprintln!("TextEncoder probe: {}", s);
            }
            other => panic!("TextEncoder probe failed: {:?}", other.map(|v| js_value_debug(&v))),
        }
        // Check __shouldTerminate
        match machine.eval("typeof __shouldTerminate") {
            Some(JsValue::String(s)) => {
                eprintln!("typeof __shouldTerminate = {}", s);
                assert_eq!(s, "function");
            }
            other => panic!("typeof __shouldTerminate: {:?}", other.map(|v| js_value_debug(&v))),
        }
    }

    // --- Phase 5: SQLite Tests ---

    #[test]
    fn sqlite_open_close() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        // Open in-memory db — returns a number handle
        match machine.eval("sqliteOpen(':memory:')").unwrap() {
            JsValue::Integer(n) => assert!(n > 0, "handle should be positive"),
            other => panic!("expected integer handle, got {:?}", js_value_debug(&other)),
        }

        // Close it
        machine.eval("sqliteClose(sqliteOpen(':memory:'))").unwrap();
    }

    #[test]
    fn sqlite_exec_create_table() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        // exec should return undefined on success
        match machine
            .eval("sqliteExec(db, 'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')")
            .unwrap()
        {
            JsValue::Undefined => {}
            other => panic!("expected undefined, got {:?}", js_value_debug(&other)),
        }
        machine.eval("sqliteClose(db)").unwrap();
    }

    #[test]
    fn sqlite_exec_error() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        // Invalid SQL should return an error string
        match machine
            .eval("sqliteExec(db, 'NOT VALID SQL')")
            .unwrap()
        {
            JsValue::String(s) => assert!(
                s.starts_with("Error: "),
                "expected error string, got {}",
                s,
            ),
            other => panic!("expected error string, got {:?}", js_value_debug(&other)),
        }
        machine.eval("sqliteClose(db)").unwrap();
    }

    #[test]
    fn sqlite_prepare_and_run() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        machine
            .eval("sqliteExec(db, 'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')")
            .unwrap();

        // Prepare and run an INSERT
        machine.eval("var ins = sqlitePrepare(db, 'INSERT INTO t (id, name) VALUES (?, ?)')").unwrap();
        match machine.eval("sqliteStmtRun(ins, '[1, \"alice\"]')").unwrap() {
            JsValue::String(s) => {
                assert!(s.contains("\"changes\":\"1\""), "expected changes=1, got {}", s);
            }
            other => panic!("expected JSON result, got {:?}", js_value_debug(&other)),
        }

        machine.eval("sqliteStmtFinalize(ins)").unwrap();
        machine.eval("sqliteClose(db)").unwrap();
    }

    #[test]
    fn sqlite_get_returns_row_with_bigint_tags() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        machine
            .eval("sqliteExec(db, 'CREATE TABLE t (id INTEGER, val REAL, name TEXT)')")
            .unwrap();
        machine.eval("var ins = sqlitePrepare(db, 'INSERT INTO t VALUES (?, ?, ?)')").unwrap();
        machine.eval("sqliteStmtRun(ins, '[42, 3.14, \"hello\"]')").unwrap();
        machine.eval("sqliteStmtFinalize(ins)").unwrap();

        // Query the row back
        machine.eval("var sel = sqlitePrepare(db, 'SELECT * FROM t')").unwrap();
        match machine.eval("sqliteStmtGet(sel, 'null')").unwrap() {
            JsValue::String(s) => {
                // INTEGER 42 should be tagged as $bigint
                assert!(
                    s.contains("\"$bigint\":\"42\""),
                    "expected $bigint tag for integer, got {}",
                    s,
                );
                // REAL 3.14 should be a plain number
                assert!(
                    s.contains("3.14"),
                    "expected plain number for real, got {}",
                    s,
                );
                // TEXT should be a plain string
                assert!(
                    s.contains("\"hello\""),
                    "expected string for text, got {}",
                    s,
                );
            }
            other => panic!("expected JSON row, got {:?}", js_value_debug(&other)),
        }

        machine.eval("sqliteStmtFinalize(sel)").unwrap();
        machine.eval("sqliteClose(db)").unwrap();
    }

    #[test]
    fn sqlite_get_returns_null_for_no_rows() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        machine
            .eval("sqliteExec(db, 'CREATE TABLE t (id INTEGER)')")
            .unwrap();
        machine.eval("var sel = sqlitePrepare(db, 'SELECT * FROM t')").unwrap();
        match machine.eval("sqliteStmtGet(sel, 'null')").unwrap() {
            JsValue::String(s) => assert_eq!(s, "null"),
            other => panic!("expected 'null' string, got {:?}", js_value_debug(&other)),
        }

        machine.eval("sqliteStmtFinalize(sel)").unwrap();
        machine.eval("sqliteClose(db)").unwrap();
    }

    #[test]
    fn sqlite_all_returns_array() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        machine
            .eval("sqliteExec(db, 'CREATE TABLE t (id INTEGER, name TEXT)')")
            .unwrap();
        machine.eval("var ins = sqlitePrepare(db, 'INSERT INTO t VALUES (?, ?)')").unwrap();
        machine.eval("sqliteStmtRun(ins, '[1, \"alice\"]')").unwrap();
        machine.eval("sqliteStmtRun(ins, '[2, \"bob\"]')").unwrap();
        machine.eval("sqliteStmtFinalize(ins)").unwrap();

        machine.eval("var sel = sqlitePrepare(db, 'SELECT * FROM t ORDER BY id')").unwrap();
        match machine.eval("sqliteStmtAll(sel, 'null')").unwrap() {
            JsValue::String(s) => {
                let parsed: serde_json::Value = serde_json::from_str(&s).unwrap();
                let arr = parsed.as_array().unwrap();
                assert_eq!(arr.len(), 2, "expected 2 rows, got {}", arr.len());
                // First row: id=1 as $bigint, name="alice"
                assert_eq!(arr[0]["id"]["$bigint"], "1");
                assert_eq!(arr[0]["name"], "alice");
                // Second row: id=2 as $bigint, name="bob"
                assert_eq!(arr[1]["id"]["$bigint"], "2");
                assert_eq!(arr[1]["name"], "bob");
            }
            other => panic!("expected JSON array, got {:?}", js_value_debug(&other)),
        }

        machine.eval("sqliteStmtFinalize(sel)").unwrap();
        machine.eval("sqliteClose(db)").unwrap();
    }

    #[test]
    fn sqlite_blob_round_trip() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        machine
            .eval("sqliteExec(db, 'CREATE TABLE blobs (data BLOB)')")
            .unwrap();

        // Insert a blob via $bytes tag (base64 of [0xDE, 0xAD, 0xBE, 0xEF])
        machine.eval("var ins = sqlitePrepare(db, 'INSERT INTO blobs VALUES (?)')").unwrap();
        machine
            .eval("sqliteStmtRun(ins, '[{\"$bytes\": \"3q2+7w==\"}]')")
            .unwrap();
        machine.eval("sqliteStmtFinalize(ins)").unwrap();

        // Read it back
        machine.eval("var sel = sqlitePrepare(db, 'SELECT data FROM blobs')").unwrap();
        match machine.eval("sqliteStmtGet(sel, 'null')").unwrap() {
            JsValue::String(s) => {
                let parsed: serde_json::Value = serde_json::from_str(&s).unwrap();
                assert_eq!(
                    parsed["data"]["$bytes"], "3q2+7w==",
                    "expected base64 blob, got {}",
                    s,
                );
            }
            other => panic!("expected JSON row, got {:?}", js_value_debug(&other)),
        }

        machine.eval("sqliteStmtFinalize(sel)").unwrap();
        machine.eval("sqliteClose(db)").unwrap();
    }

    #[test]
    fn sqlite_bigint_param_round_trip() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        machine
            .eval("sqliteExec(db, 'CREATE TABLE big (val INTEGER)')")
            .unwrap();

        // Insert a large integer via $bigint tag
        machine.eval("var ins = sqlitePrepare(db, 'INSERT INTO big VALUES (?)')").unwrap();
        machine
            .eval("sqliteStmtRun(ins, '[{\"$bigint\": \"9007199254740993\"}]')")
            .unwrap();
        machine.eval("sqliteStmtFinalize(ins)").unwrap();

        // Read it back — should come back as $bigint
        machine.eval("var sel = sqlitePrepare(db, 'SELECT val FROM big')").unwrap();
        match machine.eval("sqliteStmtGet(sel, 'null')").unwrap() {
            JsValue::String(s) => {
                let parsed: serde_json::Value = serde_json::from_str(&s).unwrap();
                assert_eq!(
                    parsed["val"]["$bigint"], "9007199254740993",
                    "expected large bigint, got {}",
                    s,
                );
            }
            other => panic!("expected JSON row, got {:?}", js_value_debug(&other)),
        }

        machine.eval("sqliteStmtFinalize(sel)").unwrap();
        machine.eval("sqliteClose(db)").unwrap();
    }

    #[test]
    fn sqlite_null_values() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        machine
            .eval("sqliteExec(db, 'CREATE TABLE t (a INTEGER, b TEXT)')")
            .unwrap();
        machine.eval("var ins = sqlitePrepare(db, 'INSERT INTO t VALUES (?, ?)')").unwrap();
        machine.eval("sqliteStmtRun(ins, '[null, null]')").unwrap();
        machine.eval("sqliteStmtFinalize(ins)").unwrap();

        machine.eval("var sel = sqlitePrepare(db, 'SELECT * FROM t')").unwrap();
        match machine.eval("sqliteStmtGet(sel, 'null')").unwrap() {
            JsValue::String(s) => {
                let parsed: serde_json::Value = serde_json::from_str(&s).unwrap();
                assert!(parsed["a"].is_null(), "expected null for a, got {}", s);
                assert!(parsed["b"].is_null(), "expected null for b, got {}", s);
            }
            other => panic!("expected JSON row, got {:?}", js_value_debug(&other)),
        }

        machine.eval("sqliteStmtFinalize(sel)").unwrap();
        machine.eval("sqliteClose(db)").unwrap();
    }

    #[test]
    fn sqlite_named_params() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        machine
            .eval("sqliteExec(db, 'CREATE TABLE t (id INTEGER, name TEXT)')")
            .unwrap();
        machine.eval(
            "var ins = sqlitePrepare(db, 'INSERT INTO t VALUES (:id, :name)')",
        ).unwrap();
        machine
            .eval("sqliteStmtRun(ins, '{\":id\": {\"$bigint\": \"1\"}, \":name\": \"alice\"}')")
            .unwrap();
        machine.eval("sqliteStmtFinalize(ins)").unwrap();

        machine.eval("var sel = sqlitePrepare(db, 'SELECT * FROM t')").unwrap();
        match machine.eval("sqliteStmtGet(sel, 'null')").unwrap() {
            JsValue::String(s) => {
                let parsed: serde_json::Value = serde_json::from_str(&s).unwrap();
                assert_eq!(parsed["id"]["$bigint"], "1");
                assert_eq!(parsed["name"], "alice");
            }
            other => panic!("expected JSON row, got {:?}", js_value_debug(&other)),
        }

        machine.eval("sqliteStmtFinalize(sel)").unwrap();
        machine.eval("sqliteClose(db)").unwrap();
    }

    #[test]
    fn sqlite_columns() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        machine
            .eval("sqliteExec(db, 'CREATE TABLE t (id INTEGER, name TEXT, score REAL)')")
            .unwrap();
        machine.eval("var sel = sqlitePrepare(db, 'SELECT id, name, score FROM t')").unwrap();
        match machine.eval("sqliteStmtColumns(sel)").unwrap() {
            JsValue::String(s) => {
                let parsed: serde_json::Value = serde_json::from_str(&s).unwrap();
                let arr = parsed.as_array().unwrap();
                assert_eq!(arr.len(), 3);
                assert_eq!(arr[0]["name"], "id");
                assert_eq!(arr[1]["name"], "name");
                assert_eq!(arr[2]["name"], "score");
            }
            other => panic!("expected JSON array, got {:?}", js_value_debug(&other)),
        }

        machine.eval("sqliteStmtFinalize(sel)").unwrap();
        machine.eval("sqliteClose(db)").unwrap();
    }

    #[test]
    fn sqlite_close_cleans_up_statements() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        machine
            .eval("sqliteExec(db, 'CREATE TABLE t (id INTEGER)')")
            .unwrap();
        machine.eval("var s1 = sqlitePrepare(db, 'SELECT * FROM t')").unwrap();
        machine.eval("var s2 = sqlitePrepare(db, 'INSERT INTO t VALUES (?)')").unwrap();

        // Close db — should clean up both statements
        machine.eval("sqliteClose(db)").unwrap();

        // Using the statement handles should now produce errors
        match machine.eval("sqliteStmtGet(s1, 'null')").unwrap() {
            JsValue::String(s) => assert!(
                s.starts_with("Error: "),
                "expected error after close, got {}",
                s,
            ),
            other => panic!("expected error string, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn sqlite_transaction() {
        let mut powers = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers);

        machine.eval("var db = sqliteOpen(':memory:')").unwrap();
        machine
            .eval("sqliteExec(db, 'CREATE TABLE t (id INTEGER)')")
            .unwrap();

        // Begin transaction, insert, rollback
        machine.eval("sqliteExec(db, 'BEGIN')").unwrap();
        machine.eval("var ins = sqlitePrepare(db, 'INSERT INTO t VALUES (?)')").unwrap();
        machine.eval("sqliteStmtRun(ins, '[{\"$bigint\": \"1\"}]')").unwrap();
        machine.eval("sqliteExec(db, 'ROLLBACK')").unwrap();

        // Should have no rows
        machine.eval("var sel = sqlitePrepare(db, 'SELECT COUNT(*) as cnt FROM t')").unwrap();
        match machine.eval("sqliteStmtGet(sel, 'null')").unwrap() {
            JsValue::String(s) => {
                let parsed: serde_json::Value = serde_json::from_str(&s).unwrap();
                assert_eq!(
                    parsed["cnt"]["$bigint"], "0",
                    "expected 0 rows after rollback, got {}",
                    s,
                );
            }
            other => panic!("expected JSON row, got {:?}", js_value_debug(&other)),
        }

        machine.eval("sqliteStmtFinalize(ins)").unwrap();
        machine.eval("sqliteStmtFinalize(sel)").unwrap();
        machine.eval("sqliteClose(db)").unwrap();
    }

    // --- Phase 6: Debug Tests ---

    /// Verify that enabling debug mode and creating a machine
    /// produces `<login>` XML in the outbound debug buffer.
    ///
    /// This requires both the `debug` cargo feature AND building
    /// from XS C sources (not the prebuilt libxs.a).  When either
    /// condition is false, `fxConnect` never calls
    /// `rust_debug_connect()`, so `debug_is_active()` stays false
    /// and we skip the XML assertion.
    #[test]
    fn debug_login_on_connect() {
        use powers::debug;

        // Enable debug on this thread before machine creation.
        debug::debug_enable();

        let mut powers_store = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers_store);

        // If mxDebug was compiled into libxs.a, fxConnect called
        // rust_debug_connect() and debug_is_active() is now true.
        if debug::debug_is_active() {
            // Drain whatever XS sent during initialization.
            machine.run_debugger();

            if let Some(data) = debug::debug_drain_outbound() {
                let xml = String::from_utf8_lossy(&data);
                eprintln!("debug outbound ({} bytes): {}", data.len(), &xml[..std::cmp::min(xml.len(), 500)]);
                assert!(
                    xml.contains("<login"),
                    "expected <login> element in debug output, got: {}",
                    &xml[..std::cmp::min(xml.len(), 200)]
                );
            } else {
                panic!("expected debug output after machine creation, got nothing");
            }
        } else {
            // Either debug feature is off, or using prebuilt
            // libxs.a without mxDebug.
            eprintln!(
                "debug not active (feature={}, prebuilt?) — skipping login check",
                cfg!(feature = "debug")
            );
        }

        debug::debug_reset();
    }

    /// Verify that sending a `<go/>` command via the inbound buffer
    /// doesn't crash the machine.  When debug is not compiled in,
    /// this is just a no-op smoke test.
    #[test]
    fn debug_send_go_command() {
        use powers::debug;

        debug::debug_enable();

        let mut powers_store = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers_store);

        // Push a go command into the inbound buffer.
        debug::debug_push_inbound(b"\xEF\xBB\xBF<go/>\n");

        // Run the debugger — this should consume the command.
        machine.run_debugger();

        // Drain any output (we don't assert on content, just
        // verify no crash).
        let _ = debug::debug_drain_outbound();

        debug::debug_reset();
    }

    #[test]
    fn debug_attach_via_envelope() {
        use powers::debug;

        // Start with debug NOT enabled.
        debug::debug_reset();
        assert!(!debug::debug_is_active(), "debug should be inactive initially");

        let mut powers_store = powers::HostPowers::new();
        let machine = new_machine_with_powers(&mut powers_store);

        // Create a debug-attach envelope.
        let attach_env = envelope::Envelope {
            handle: 1,
            verb: "debug-attach".to_string(),
            payload: Vec::new(),
            nonce: 42,
        };
        let attach_bytes = envelope::encode_envelope(&attach_env);

        // Set up a mock transport to capture outbound envelopes.
        let sent = std::sync::Arc::new(std::sync::Mutex::new(Vec::<Vec<u8>>::new()));
        let sent_clone = std::sync::Arc::clone(&sent);
        let transport = MockTransport { sent: sent_clone };
        worker_io::install_transport(Box::new(transport));

        // Process the debug-attach envelope.
        let action = handle_envelope(&machine, &attach_bytes);
        assert!(matches!(action, EnvelopeAction::Continue), "debug-attach should be handled");

        // Check that debug is now active (only if mxDebug is in
        // the binary).
        if debug::debug_is_active() {
            // Should have sent outbound envelopes: debug output
            // (login XML) and debug-attached ack.
            let frames = sent.lock().unwrap();
            assert!(
                frames.len() >= 1,
                "expected at least 1 outbound frame, got {}",
                frames.len()
            );

            // Find the debug-attached ack.
            let mut found_ack = false;
            for frame in frames.iter() {
                if let Ok(env) = envelope::decode_envelope(frame) {
                    if env.verb == "debug-attached" {
                        assert_eq!(env.nonce, 42, "ack nonce should match");
                        found_ack = true;
                    }
                }
            }
            assert!(found_ack, "expected debug-attached ack");
        }

        debug::debug_reset();
        worker_io::clear_transport();
    }

    /// Mock transport that captures sent frames.
    struct MockTransport {
        sent: std::sync::Arc<std::sync::Mutex<Vec<Vec<u8>>>>,
    }

    impl WorkerTransport for MockTransport {
        fn init_handshake(&mut self) -> Result<worker_io::InitResult, std::io::Error> {
            Ok(worker_io::InitResult::Init(0))
        }
        fn recv_raw_envelope(&mut self) -> Result<Option<Vec<u8>>, std::io::Error> {
            Ok(None)
        }
        fn try_recv_raw_envelope(&mut self) -> Result<Option<Vec<u8>>, std::io::Error> {
            Ok(None)
        }
        fn send_raw_frame(&mut self, data: &[u8]) -> Result<(), std::io::Error> {
            self.sent.lock().unwrap().push(data.to_vec());
            Ok(())
        }
        fn send_frame(&mut self, _payload: &[u8]) -> Result<(), std::io::Error> {
            Ok(())
        }
        fn recv_frame(&mut self) -> Result<Option<Vec<u8>>, std::io::Error> {
            Ok(None)
        }
        fn daemon_handle(&self) -> envelope::Handle {
            0
        }
    }

    // --- Snapshot round-trip tests ---

    const TEST_SNAPSHOT_SIG: &[u8] = b"test-snap 1";

    // --- Snapshot round-trip tests ---

    #[test]
    fn snapshot_round_trip_integer() {
        let machine = new_machine();
        machine.eval("var x = 42").unwrap();

        let mut callbacks: Vec<ffi::XsCallback> = Vec::new();
        let snap = machine
            .write_snapshot(TEST_SNAPSHOT_SIG, &mut callbacks)
            .expect("write_snapshot failed");

        assert!(!snap.is_empty(), "snapshot should not be empty");

        let restored = Machine::from_snapshot(
            &snap,
            "restored",
            TEST_SNAPSHOT_SIG,
            &mut callbacks,
        )
        .expect("from_snapshot failed");

        match restored.eval("x").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 42),
            JsValue::Number(n) => assert_eq!(n, 42.0),
            other => panic!("expected 42, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn snapshot_round_trip_string() {
        let machine = new_machine();
        machine.eval("var greeting = 'hello snapshot'").unwrap();

        let mut callbacks: Vec<ffi::XsCallback> = Vec::new();
        let snap = machine
            .write_snapshot(TEST_SNAPSHOT_SIG, &mut callbacks)
            .expect("write_snapshot failed");

        let restored = Machine::from_snapshot(
            &snap,
            "restored",
            TEST_SNAPSHOT_SIG,
            &mut callbacks,
        )
        .expect("from_snapshot failed");

        match restored.eval("greeting").unwrap() {
            JsValue::String(s) => assert_eq!(s, "hello snapshot"),
            other => panic!("expected string, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn snapshot_round_trip_object() {
        let machine = new_machine();
        machine
            .eval("var obj = { a: 1, b: 'two', c: true }")
            .unwrap();

        let mut callbacks: Vec<ffi::XsCallback> = Vec::new();
        let snap = machine
            .write_snapshot(TEST_SNAPSHOT_SIG, &mut callbacks)
            .expect("write_snapshot failed");

        let restored = Machine::from_snapshot(
            &snap,
            "restored",
            TEST_SNAPSHOT_SIG,
            &mut callbacks,
        )
        .expect("from_snapshot failed");

        match restored.eval("obj.a").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 1),
            other => panic!("expected 1, got {:?}", js_value_debug(&other)),
        }
        match restored.eval("obj.b").unwrap() {
            JsValue::String(s) => assert_eq!(s, "two"),
            other => panic!("expected 'two', got {:?}", js_value_debug(&other)),
        }
        match restored.eval("obj.c").unwrap() {
            JsValue::Boolean(b) => assert!(b),
            other => panic!("expected true, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn snapshot_round_trip_closure() {
        let machine = new_machine();
        machine
            .eval("var counter = 0; function inc() { return ++counter; }")
            .unwrap();
        // Advance the counter
        machine.eval("inc(); inc(); inc()").unwrap();

        let mut callbacks: Vec<ffi::XsCallback> = Vec::new();
        let snap = machine
            .write_snapshot(TEST_SNAPSHOT_SIG, &mut callbacks)
            .expect("write_snapshot failed");

        let restored = Machine::from_snapshot(
            &snap,
            "restored",
            TEST_SNAPSHOT_SIG,
            &mut callbacks,
        )
        .expect("from_snapshot failed");

        // Counter should resume from 3
        match restored.eval("inc()").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 4),
            other => panic!("expected 4, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn snapshot_signature_mismatch_fails() {
        let machine = new_machine();
        machine.eval("var x = 1").unwrap();

        let mut callbacks: Vec<ffi::XsCallback> = Vec::new();
        let snap = machine
            .write_snapshot(TEST_SNAPSHOT_SIG, &mut callbacks)
            .expect("write_snapshot failed");

        // Try to restore with a different signature
        let result = Machine::from_snapshot(
            &snap,
            "restored",
            b"wrong-sig 9",
            &mut callbacks,
        );
        assert!(result.is_err(), "mismatched signature should fail");
    }

    #[test]
    fn snapshot_with_host_function() {
        let machine = new_machine();

        unsafe extern "C" fn return_99(the: *mut XsMachine) {
            fxInteger(the, &mut (*the).scratch, 99);
            *(*the).frame.add(1) = (*the).scratch;
        }

        machine.define_function("hostReturn99", return_99, 0);
        machine.eval("var cached = hostReturn99()").unwrap();

        let mut callbacks: Vec<ffi::XsCallback> = vec![return_99];
        let snap = machine
            .write_snapshot(TEST_SNAPSHOT_SIG, &mut callbacks)
            .expect("write_snapshot failed");

        let restored = Machine::from_snapshot(
            &snap,
            "restored",
            TEST_SNAPSHOT_SIG,
            &mut callbacks,
        )
        .expect("from_snapshot failed");

        // The cached value should survive
        match restored.eval("cached").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 99),
            other => panic!("expected 99, got {:?}", js_value_debug(&other)),
        }

        // The host function should still work after restore
        match restored.eval("hostReturn99()").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 99),
            other => panic!("expected 99, got {:?}", js_value_debug(&other)),
        }
    }

    // ---------------------------------------------------------------
    // Suspend / Resume API tests
    // ---------------------------------------------------------------

    #[test]
    fn suspend_resume_preserves_state() {
        let machine = new_machine();
        machine.eval("var counter = 0; function inc() { return ++counter; }").unwrap();
        machine.eval("inc(); inc(); inc()").unwrap(); // counter = 3

        let suspend_data = machine
            .suspend(TEST_SNAPSHOT_SIG)
            .expect("suspend failed");

        assert!(!suspend_data.snapshot.is_empty());

        // Drop the original machine.
        drop(machine);

        // Resume from the suspend data.
        let restored = Machine::resume(&suspend_data, "resumed")
            .expect("resume failed");

        // Counter should continue from 3.
        match restored.eval("inc()").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 4),
            other => panic!("expected 4, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn suspend_resume_with_host_function() {
        let machine = new_machine();

        unsafe extern "C" fn return_7(the: *mut XsMachine) {
            fxInteger(the, &mut (*the).scratch, 7);
            *(*the).frame.add(1) = (*the).scratch;
        }

        machine.define_function("hostSeven", return_7, 0);
        machine.eval("var saved = hostSeven()").unwrap();

        let suspend_data = machine
            .suspend(TEST_SNAPSHOT_SIG)
            .expect("suspend failed");
        drop(machine);

        let restored = Machine::resume(&suspend_data, "resumed")
            .expect("resume failed");

        // Cached value survives.
        match restored.eval("saved").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 7),
            other => panic!("expected 7, got {:?}", js_value_debug(&other)),
        }

        // Host function still callable after resume.
        match restored.eval("hostSeven()").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 7),
            other => panic!("expected 7, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn suspend_resume_multiple_cycles() {
        let machine = new_machine();
        machine.eval("var n = 0").unwrap();

        // Suspend/resume three times, incrementing each time.
        let mut data = machine
            .suspend(TEST_SNAPSHOT_SIG)
            .expect("first suspend");
        drop(machine);

        for i in 1..=3 {
            let m = Machine::resume(&data, "cycle")
                .expect("resume failed");
            m.eval("n++").unwrap();
            data = m.suspend(TEST_SNAPSHOT_SIG)
                .expect("suspend failed");
            drop(m);
        }

        let final_m = Machine::resume(&data, "final")
            .expect("final resume");
        match final_m.eval("n").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 3),
            other => panic!("expected 3, got {:?}", js_value_debug(&other)),
        }
    }

    // ---------------------------------------------------------------
    // File-streaming CAS tests
    // ---------------------------------------------------------------

    #[test]
    fn suspend_to_cas_streams_to_disk() {
        let machine = new_machine();
        machine.eval("var x = 42; var s = 'hello CAS'").unwrap();

        let tmp = tempfile::tempdir().unwrap();
        let cas_dir = tmp.path().join("store-sha256");

        let hash = machine
            .suspend_to_cas(TEST_SNAPSHOT_SIG, &cas_dir)
            .expect("suspend_to_cas failed");

        // The CAS file should exist.
        let cas_file = cas_dir.join(&hash);
        assert!(cas_file.exists(), "CAS file should exist at {}", cas_file.display());
        let file_size = std::fs::metadata(&cas_file).unwrap().len();
        assert!(file_size > 0, "CAS file should not be empty");

        // Restore from the CAS file and verify state.
        let mut callbacks: Vec<ffi::XsCallback> = Vec::new();
        let restored = Machine::resume_from_cas(
            &cas_dir,
            &hash,
            "restored",
            TEST_SNAPSHOT_SIG,
            &mut callbacks,
        ).expect("resume_from_cas failed");

        match restored.eval("x").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 42),
            other => panic!("expected 42, got {:?}", js_value_debug(&other)),
        }
        match restored.eval("s").unwrap() {
            JsValue::String(s) => assert_eq!(s, "hello CAS"),
            other => panic!("expected 'hello CAS', got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn cas_round_trip_with_host_functions() {
        let machine = new_machine();

        unsafe extern "C" fn return_11(the: *mut XsMachine) {
            fxInteger(the, &mut (*the).scratch, 11);
            *(*the).frame.add(1) = (*the).scratch;
        }

        machine.define_function("hostEleven", return_11, 0);
        machine.eval("var cached = hostEleven()").unwrap();

        let tmp = tempfile::tempdir().unwrap();
        let cas_dir = tmp.path().join("store-sha256");

        let hash = machine
            .suspend_to_cas(TEST_SNAPSHOT_SIG, &cas_dir)
            .expect("suspend_to_cas failed");
        drop(machine);

        let mut callbacks: Vec<ffi::XsCallback> = vec![return_11];
        let restored = Machine::resume_from_cas(
            &cas_dir,
            &hash,
            "restored",
            TEST_SNAPSHOT_SIG,
            &mut callbacks,
        ).expect("resume_from_cas failed");

        match restored.eval("cached").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 11),
            other => panic!("expected 11, got {:?}", js_value_debug(&other)),
        }
        match restored.eval("hostEleven()").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 11),
            other => panic!("expected 11, got {:?}", js_value_debug(&other)),
        }
    }

    #[test]
    fn cas_multiple_suspend_resume_cycles() {
        let tmp = tempfile::tempdir().unwrap();
        let cas_dir = tmp.path().join("store-sha256");

        let machine = new_machine();
        machine.eval("var n = 0").unwrap();

        let mut last_hash = machine
            .suspend_to_cas(TEST_SNAPSHOT_SIG, &cas_dir)
            .expect("first suspend");
        drop(machine);

        for _ in 0..3 {
            let mut cbs: Vec<ffi::XsCallback> = Vec::new();
            let m = Machine::resume_from_cas(
                &cas_dir,
                &last_hash,
                "cycle",
                TEST_SNAPSHOT_SIG,
                &mut cbs,
            ).expect("resume failed");
            m.eval("n++").unwrap();
            last_hash = m
                .suspend_to_cas(TEST_SNAPSHOT_SIG, &cas_dir)
                .expect("suspend failed");
            drop(m);
        }

        // Each cycle creates a distinct CAS entry.
        let entries: Vec<_> = std::fs::read_dir(&cas_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert!(
            entries.len() >= 2,
            "expected multiple CAS entries, got {}",
            entries.len()
        );

        let mut cbs: Vec<ffi::XsCallback> = Vec::new();
        let final_m = Machine::resume_from_cas(
            &cas_dir,
            &last_hash,
            "final",
            TEST_SNAPSHOT_SIG,
            &mut cbs,
        ).expect("final resume");
        match final_m.eval("n").unwrap() {
            JsValue::Integer(n) => assert_eq!(n, 3),
            other => panic!("expected 3, got {:?}", js_value_debug(&other)),
        }
    }

    // ---- Metering tests ----

    #[test]
    fn metering_counts_steps() {
        let machine = new_machine();
        machine.begin_metering(DEFAULT_METERING_INTERVAL);
        machine.set_meter(0);

        machine
            .eval("var s = 0; for (var i = 0; i < 1000; i++) { s += i; }")
            .expect("loop should succeed");

        let computrons = machine.current_computrons();
        assert!(
            computrons > 0,
            "expected computrons > 0, got {computrons}"
        );
        machine.end_metering();
    }

    #[test]
    fn metering_no_limit_runs_freely() {
        let machine = new_machine();
        machine.begin_metering(DEFAULT_METERING_INTERVAL);
        set_crank_limit(0); // no enforcement

        machine
            .eval("var s = 0; for (var i = 0; i < 100000; i++) { s += i; }")
            .expect("no-limit loop should succeed");

        let computrons = machine.current_computrons();
        assert!(computrons > 0);
        machine.end_metering();
    }

    #[test]
    fn metering_set_and_reset() {
        let machine = new_machine();
        machine.begin_metering(DEFAULT_METERING_INTERVAL);

        machine.eval("1+1").expect("eval");
        assert!(machine.current_computrons() > 0);

        machine.set_meter(0);
        assert_eq!(machine.current_computrons(), 0);

        machine.end_metering();
    }

    #[test]
    fn metering_hard_limit_abort() {
        let machine = new_machine();
        machine.begin_metering(1); // check every step

        // First, queue a promise with an expensive callback.
        // Do this with NO limit so the eval itself succeeds.
        set_crank_limit(0);
        machine.set_meter(0);
        machine.eval(
            "Promise.resolve().then(function() { \
                var s = 0; \
                for (var i = 0; i < 1000000; i++) { s += i; } \
            })"
        ).expect("promise creation should succeed");

        // Now set a low limit and run the promise jobs.
        machine.set_meter(0);
        set_crank_limit(100);

        let result = machine.run_promise_jobs_metered();
        assert!(
            result.is_err(),
            "expected metering abort, got Ok"
        );
        let status = result.unwrap_err();
        assert_eq!(
            status,
            ffi::XS_TOO_MUCH_COMPUTATION_EXIT,
            "expected TOO_MUCH_COMPUTATION, got {status}"
        );

        // Machine should still be usable after abort.
        set_crank_limit(0); // disable limit
        machine.set_meter(0);
        match machine.eval("1 + 1") {
            Some(JsValue::Integer(2)) => {}
            other => panic!(
                "expected 2 after abort, got {:?}",
                other.map(|v| js_value_debug(&v))
            ),
        }

        machine.end_metering();
    }

    #[test]
    fn metering_abort_flag_set() {
        let machine = new_machine();
        machine.begin_metering(1);

        // Queue work without a limit.
        set_crank_limit(0);
        machine.set_meter(0);
        machine.eval(
            "Promise.resolve().then(function() { \
                for (var i = 0; i < 1000000; i++) {} \
            })"
        ).expect("promise creation");

        // Run with a low limit.
        machine.set_meter(0);
        set_crank_limit(100);
        METERING_ABORTED.with(|a| a.set(false));

        let _ = machine.run_promise_jobs_metered();
        assert!(take_metering_aborted(), "abort flag should be set");

        set_crank_limit(0);
        machine.end_metering();
    }

    #[test]
    fn meter_report_cbor_round_trip() {
        // Test that send_meter_report produces valid CBOR by
        // encoding and decoding a few values.
        fn encode_report(steps: u64, outcome: &str) -> Vec<u8> {
            let mut payload = Vec::with_capacity(32);
            payload.push(0xa2);
            payload.push(0x65);
            payload.extend_from_slice(b"steps");
            if steps <= 23 {
                payload.push(steps as u8);
            } else if steps <= 0xff {
                payload.push(0x18);
                payload.push(steps as u8);
            } else if steps <= 0xffff {
                payload.push(0x19);
                payload.extend_from_slice(&(steps as u16).to_be_bytes());
            } else if steps <= 0xffff_ffff {
                payload.push(0x1a);
                payload.extend_from_slice(&(steps as u32).to_be_bytes());
            } else {
                payload.push(0x1b);
                payload.extend_from_slice(&steps.to_be_bytes());
            }
            payload.push(0x67);
            payload.extend_from_slice(b"outcome");
            let ob = outcome.as_bytes();
            payload.push(0x60 | ob.len() as u8);
            payload.extend_from_slice(ob);
            payload
        }

        let p1 = encode_report(0, "ok");
        assert_eq!(p1[0], 0xa2); // map(2)

        let p2 = encode_report(42, "terminated");
        assert_eq!(p2[0], 0xa2);

        let p3 = encode_report(1_000_000, "ok");
        assert_eq!(p3[0], 0xa2);
    }

    #[test]
    fn meter_config_decode() {
        // Encode {"hard_limit": 50000} manually
        let mut data = Vec::new();
        data.push(0xa1); // map(1)
        // key: "hard_limit" (10 bytes)
        data.push(0x6a);
        data.extend_from_slice(b"hard_limit");
        // value: 50000 (u16)
        data.push(0x19);
        data.extend_from_slice(&50000u16.to_be_bytes());

        let result = decode_meter_config(&data);
        assert_eq!(result, Some(50000));
    }

    #[test]
    fn meter_config_decode_large() {
        // Encode {"hard_limit": 10000000} manually
        let mut data = Vec::new();
        data.push(0xa1);
        data.push(0x6a);
        data.extend_from_slice(b"hard_limit");
        data.push(0x1a);
        data.extend_from_slice(&10_000_000u32.to_be_bytes());

        let result = decode_meter_config(&data);
        assert_eq!(result, Some(10_000_000));
    }

    #[test]
    fn meter_config_decode_missing_key() {
        let mut data = Vec::new();
        data.push(0xa1);
        data.push(0x63);
        data.extend_from_slice(b"foo");
        data.push(0x01);

        assert_eq!(decode_meter_config(&data), None);
    }
}
