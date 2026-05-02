//! XS debug I/O layer.
//!
//! Provides thread-local buffers that bridge the C-side XS debug
//! hooks (fxConnect/fxSend/fxReceive/etc.) with Rust.  The C
//! platform functions in `xsnap-platform.c` call into the
//! `#[no_mangle]` extern functions defined here.
//!
//! ## Data flow
//!
//! ```text
//!   XS VM  ──fxSend──▸  rust_debug_send  ──▸  outbound VecDeque
//!                                                  │
//!                                           drain_outbound()
//!                                                  │
//!                                                  ▼
//!                                          bus / envelope
//!                                                  │
//!                                           push_inbound()
//!                                                  │
//!   XS VM  ◂─fxReceive─  rust_debug_recv  ◂──  inbound VecDeque
//! ```
//!
//! Each worker thread has its own `DebugState`.  The mutex is
//! per-thread (uncontended in practice) — it exists only for
//! `Send`/`Sync` safety.

use std::cell::RefCell;
use std::collections::VecDeque;
use std::os::raw::{c_char, c_int};

/// Per-thread debug I/O state.
struct DebugState {
    /// Whether the debug session has been requested for this thread.
    /// Set by `debug_enable()` before machine creation.
    enabled: bool,
    /// Whether the debug connection is active.
    connected: bool,
    /// Bytes from XS → Rust (debug responses/events from the VM).
    outbound: VecDeque<u8>,
    /// Bytes from Rust → XS (debug commands to the VM).
    inbound: VecDeque<u8>,
}

impl DebugState {
    fn new() -> Self {
        DebugState {
            enabled: false,
            connected: false,
            outbound: VecDeque::new(),
            inbound: VecDeque::new(),
        }
    }
}

thread_local! {
    static DEBUG_STATE: RefCell<DebugState> = RefCell::new(DebugState::new());
}

// ---- Rust-side public API (called from lib.rs / worker_io.rs) ----

/// Mark this thread's debug state as enabled.
/// Must be called before `fxCreateMachine` so that `fxConnect`
/// (which calls `rust_debug_connect`) activates the connection.
pub fn debug_enable() {
    DEBUG_STATE.with(|cell| {
        cell.borrow_mut().enabled = true;
    });
}

/// Check whether debug is enabled and connected on this thread.
pub fn debug_is_active() -> bool {
    DEBUG_STATE.with(|cell| {
        let s = cell.borrow();
        s.enabled && s.connected
    })
}

/// Push debug command bytes into the inbound buffer.
/// The next `fxReceive` call from XS will read these.
pub fn debug_push_inbound(data: &[u8]) {
    DEBUG_STATE.with(|cell| {
        cell.borrow_mut().inbound.extend(data);
    });
}

/// Drain all pending outbound bytes (XS debug responses).
/// Returns `None` if the buffer is empty.
pub fn debug_drain_outbound() -> Option<Vec<u8>> {
    DEBUG_STATE.with(|cell| {
        let mut s = cell.borrow_mut();
        if s.outbound.is_empty() {
            None
        } else {
            Some(s.outbound.drain(..).collect())
        }
    })
}

/// Check if there are outbound bytes waiting to be drained.
pub fn debug_has_outbound() -> bool {
    DEBUG_STATE.with(|cell| !cell.borrow().outbound.is_empty())
}

/// Reset the thread-local debug state.  Call when the machine is
/// destroyed to release buffers.
pub fn debug_reset() {
    DEBUG_STATE.with(|cell| {
        let mut s = cell.borrow_mut();
        s.enabled = false;
        s.connected = false;
        s.outbound.clear();
        s.inbound.clear();
    });
}

// ---- C-callable extern functions (called from xsnap-platform.c) ----

/// Called by `fxConnect` in C.  Activates the debug connection if
/// this thread was previously marked with `debug_enable()`.
#[no_mangle]
pub extern "C" fn rust_debug_connect() {
    DEBUG_STATE.with(|cell| {
        let mut s = cell.borrow_mut();
        if s.enabled {
            s.connected = true;
        }
    });
}

/// Called by `fxDisconnect` in C.  Deactivates the debug connection.
#[no_mangle]
pub extern "C" fn rust_debug_disconnect() {
    DEBUG_STATE.with(|cell| {
        cell.borrow_mut().connected = false;
    });
}

/// Called by `fxIsConnected` in C.
#[no_mangle]
pub extern "C" fn rust_debug_is_connected() -> c_int {
    DEBUG_STATE.with(|cell| {
        let s = cell.borrow();
        if s.enabled && s.connected {
            1
        } else {
            0
        }
    })
}

/// Called by `fxIsReadable` in C.  Returns 1 if the inbound buffer
/// has data waiting for XS to consume.
#[no_mangle]
pub extern "C" fn rust_debug_is_readable() -> c_int {
    DEBUG_STATE.with(|cell| {
        if cell.borrow().inbound.is_empty() {
            0
        } else {
            1
        }
    })
}

/// Called by `fxReceive` in C.  Copies up to `capacity` bytes from
/// the inbound buffer into the provided C buffer.  Returns the
/// number of bytes copied, or 0 if empty.
#[no_mangle]
pub extern "C" fn rust_debug_recv(
    buffer: *mut c_char,
    capacity: c_int,
) -> c_int {
    DEBUG_STATE.with(|cell| {
        let mut s = cell.borrow_mut();
        let n = std::cmp::min(s.inbound.len(), capacity as usize);
        if n == 0 {
            return 0;
        }
        let dst =
            unsafe { std::slice::from_raw_parts_mut(buffer as *mut u8, n) };
        for (i, byte) in s.inbound.drain(..n).enumerate() {
            dst[i] = byte;
        }
        n as c_int
    })
}

/// Called by `fxSend` in C.  Appends the debug output bytes from XS
/// into the outbound buffer for Rust to drain later.
#[no_mangle]
pub extern "C" fn rust_debug_send(data: *const c_char, length: c_int) {
    if length <= 0 {
        return;
    }
    let bytes =
        unsafe { std::slice::from_raw_parts(data as *const u8, length as usize) };
    DEBUG_STATE.with(|cell| {
        cell.borrow_mut().outbound.extend(bytes);
    });
}
