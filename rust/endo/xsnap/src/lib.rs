//! # xsnap
//!
//! Rust bindings for the XS JavaScript engine (Moddable).
//! Provides a safe API for creating XS machines, evaluating JavaScript,
//! and registering host functions.

pub mod archive;
pub mod envelope;
pub mod ffi;
pub mod powers;
pub mod worker_io;

use ffi::*;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_void};
use std::ptr;

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
            Some(Machine { raw })
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
                JsValue::String(
                    CStr::from_ptr(s).to_string_lossy().into_owned(),
                )
            }
        }
        // For references and other types, coerce to string
        _ => {
            let s = fxToString(the, slot);
            if s.is_null() {
                JsValue::Undefined
            } else {
                JsValue::String(
                    CStr::from_ptr(s).to_string_lossy().into_owned(),
                )
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
fn eval_wrapped(machine: &Machine, code: &str, label: &str) -> bool {
    let json = serde_json::to_string(code).unwrap();
    let wrapped = format!(
        "var __e = undefined; try {{ eval({}) }} catch(e) {{ __e = e; }} \
         __e ? ('ERROR: ' + __e.message + '\\nSTACK: ' + __e.stack) : 'ok'",
        json
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
    eprintln!("{label}: cluster ready, creating machine");

    let machine = Machine::new(creation, label)
        .ok_or_else(|| XsnapError::MachineInit("failed to create XS machine".to_string()))?;
    eprintln!("{label}: machine created");

    let supervised = transport.is_some();

    // 1. Install transport + register worker-I/O host functions
    //    (always installed so that bundles that reference
    //    sendRawFrame/trace/etc. resolve; in standalone mode, only
    //    trace is exercised).
    if let Some(mut t) = transport {
        t.init_handshake()
            .map_err(|e| XsnapError::Io(format!("init handshake failed: {e}")))?;
        eprintln!("{label}: init handshake complete");
        worker_io::install_transport(t);
    }
    machine.register_worker_io();
    eprintln!("{label}: worker I/O registered");

    // 2. Register all powers (fs, crypto, modules, process)
    let powers_ptr = register_host_powers(&machine);
    eprintln!("{label}: host powers registered");

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

    // 3. Bootstrap: polyfills → SES boot → role-specific program
    bootstrap_ses(&machine, label);
    eprintln!("{label}: SES bootstrapped");

    // 4. Install globalThis.Base64 so that @endo/base64 picks up the
    //    native Rust-backed codec instead of the pure-JS fallback
    //    (which is orders of magnitude too slow on XS for large data).
    machine.eval(
        "globalThis.Base64 = harden({ \
            decode(s) { return new Uint8Array(hostBase64Decode(s)); }, \
            encode(b) { return hostBase64Encode(b); }, \
        });",
    );
    eprintln!("{label}: Base64 native binding installed");

    match program {
        XsProgram::Bundle(src) => {
            eprintln!("{label}: about to eval bundle ({} bytes)", src.len());
            // The bundle is a top-level expression that may throw
            // (e.g. module init errors). XS JS exceptions use C
            // longjmp which is UB across Rust frames, so we wrap
            // the eval in a JS try/catch and inspect the result.
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

    if supervised {
        eprintln!("{label}: entering main loop");
        'outer: loop {
            // Block until the next envelope arrives.
            let frame = worker_io::with_transport(|t| t.recv_raw_envelope());
            match frame {
                Ok(Some(data)) => {
                    dispatch_envelope(&machine, &data);
                }
                Ok(None) => break,
                Err(e) => {
                    eprintln!("{label}: recv error: {e}");
                    break;
                }
            }

            // Reactive pump: interleave promise-job processing with
            // non-blocking envelope dispatch so that CapTP round-trips
            // that occur during quiescence (e.g. storeBlob iterating a
            // remote reader) can complete without deadlocking.
            let mut pump_iter = 0u32;
            loop {
                unsafe { fxRunPromiseJobs(machine.raw) };

                // Drain any envelopes that arrived while JS was running.
                loop {
                    match worker_io::with_transport(|t| t.try_recv_raw_envelope()) {
                        Ok(Some(data)) => {
                            dispatch_envelope(&machine, &data);
                        }
                        Ok(None) => break,
                        Err(e) => {
                            eprintln!("{label}: try_recv error: {e}");
                            break 'outer;
                        }
                    }
                }

                let pending = unsafe { ffi::fxHasPendingJobs() };
                if pending == 0 {
                    break;
                }

                pump_iter += 1;

                // Jobs are pending but no envelopes available yet.
                // Briefly yield to let the bridge tasks deliver
                // responses, then try again.
                std::thread::sleep(std::time::Duration::from_millis(1));
            }

            if let Some(JsValue::Boolean(true)) =
                machine.eval("__shouldTerminate()")
            {
                break;
            }
        }
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
            // xsArg(0) = the->frame[-2 - 0] = the->frame[-2]
            // xsArg(1) = the->frame[-2 - 1] = the->frame[-3]
            let a = fxToInteger(the, (*the).frame.sub(2));
            let b = fxToInteger(the, (*the).frame.sub(3));
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
            let s = fxToString(the, (*the).frame.sub(2));
            let len = CStr::from_ptr(s).to_bytes().len() as i32;
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
}
