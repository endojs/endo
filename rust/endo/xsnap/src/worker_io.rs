//! Worker I/O bridge between the envelope protocol and the XS machine.
//!
//! The Rust/XS worker communicates with a supervisor via CBOR
//! envelopes. Transport is abstracted by the [`WorkerTransport`] trait
//! so that a single XS runner can drive either:
//!
//! - [`PipeTransport`] — a child process speaking over fds 3/4.
//! - [`ChannelTransport`] — a co-process thread inside the supervisor
//!   swapping envelopes through tokio mpsc channels (byte-identical
//!   framing to the pipe path).
//!
//! Host functions that the XS bootstrap calls resolve the active
//! transport through a thread-local slot installed by the runner
//! before entering the machine loop. Every in-process XS machine runs
//! on its own dedicated `std::thread`, so one active transport per
//! thread is sufficient.
//!
//! The worker lifecycle is:
//! 1. Read init envelope → learn daemon handle
//! 2. Bootstrap XS machine with host powers and modules
//! 3. Enter main loop: read deliver envelopes → dispatch CapTP
//!    frames to XS → collect outbound frames → write deliver
//!    envelopes
//!
//! JS calling convention:
//!   recvFrame() -> ArrayBuffer | undefined (blocks until frame arrives)
//!   sendFrame(data: string) -> undefined
//!   getDaemonHandle() -> number

use crate::envelope::{self, Envelope, Handle};
use crate::ffi::*;
use std::cell::RefCell;
use std::collections::VecDeque;
use std::ffi::CStr;
use std::io::{self, BufReader, BufWriter};
use std::os::unix::io::FromRawFd;
use std::sync::mpsc as std_mpsc;

// ---------------------------------------------------------------------------
// WorkerTransport trait
// ---------------------------------------------------------------------------

/// Transport-agnostic peer communication for an XS machine running
/// under the Endo envelope protocol.
///
/// Implementations must carry byte-identical CBOR envelope frames
/// on the wire so that the daemon routing logic is oblivious to
/// whether the peer is a child process or an in-process thread.
pub trait WorkerTransport: Send {
    /// Perform the init handshake: consume a pre-seeded init envelope
    /// and return the parent daemon handle it carries.
    fn init_handshake(&mut self) -> io::Result<Handle>;

    /// Read one raw envelope frame (CBOR byte-string payload).
    /// Returns `Ok(None)` on clean EOF.
    fn recv_raw_envelope(&mut self) -> io::Result<Option<Vec<u8>>>;

    /// Non-blocking variant of `recv_raw_envelope`.  Returns
    /// `Ok(None)` when no envelope is immediately available (or on
    /// EOF).  Used by the reactive main loop to drain pending
    /// inbound envelopes between promise-job runs.
    fn try_recv_raw_envelope(&mut self) -> io::Result<Option<Vec<u8>>>;

    /// Write one raw CBOR byte-string frame.
    fn send_raw_frame(&mut self, data: &[u8]) -> io::Result<()>;

    /// Wrap `payload` in a `deliver` envelope and send it.
    fn send_frame(&mut self, payload: &[u8]) -> io::Result<()>;

    /// Consume the next buffered deliver-envelope payload, blocking
    /// until one arrives. Returns `Ok(None)` on EOF. Non-deliver
    /// envelopes are silently skipped.
    fn recv_frame(&mut self) -> io::Result<Option<Vec<u8>>>;

    /// Parent daemon handle as learned by `init_handshake`.
    fn daemon_handle(&self) -> Handle;
}

// ---------------------------------------------------------------------------
// PipeTransport (child-process peer, fds 3/4)
// ---------------------------------------------------------------------------

/// Child-process transport: reads from fd 4, writes to fd 3.
pub struct PipeTransport {
    reader: BufReader<std::fs::File>,
    writer: BufWriter<std::fs::File>,
    daemon_handle: Handle,
    inbound: VecDeque<Vec<u8>>,
}

impl PipeTransport {
    /// Create a new PipeTransport from raw fd 3 (write) and fd 4 (read).
    ///
    /// # Safety
    /// The caller must ensure fd 3 and fd 4 are valid, open pipe
    /// file descriptors owned by this process.
    pub unsafe fn from_fds() -> io::Result<Self> {
        let read_file = std::fs::File::from_raw_fd(4);
        let write_file = std::fs::File::from_raw_fd(3);
        Ok(PipeTransport {
            reader: BufReader::new(read_file),
            writer: BufWriter::new(write_file),
            daemon_handle: 0,
            inbound: VecDeque::new(),
        })
    }

    /// Create a PipeTransport from arbitrary readers/writers (for testing).
    pub fn from_streams(
        reader: BufReader<std::fs::File>,
        writer: BufWriter<std::fs::File>,
    ) -> Self {
        PipeTransport {
            reader,
            writer,
            daemon_handle: 0,
            inbound: VecDeque::new(),
        }
    }
}

impl WorkerTransport for PipeTransport {
    fn init_handshake(&mut self) -> io::Result<Handle> {
        let env = envelope::read_envelope(&mut self.reader)?
            .ok_or_else(|| io::Error::new(io::ErrorKind::UnexpectedEof, "no init envelope"))?;
        if env.verb != "init" {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("expected init envelope, got verb '{}'", env.verb),
            ));
        }
        self.daemon_handle = env.handle;
        Ok(self.daemon_handle)
    }

    fn recv_raw_envelope(&mut self) -> io::Result<Option<Vec<u8>>> {
        envelope::read_frame(&mut self.reader)
    }

    fn try_recv_raw_envelope(&mut self) -> io::Result<Option<Vec<u8>>> {
        // Pipe workers do not currently need non-blocking recv.
        // If a child-process worker encounters the same quiesce
        // deadlock, this must be replaced with poll(2)/non-blocking I/O.
        Ok(None)
    }

    fn send_raw_frame(&mut self, data: &[u8]) -> io::Result<()> {
        envelope::write_frame(&mut self.writer, data)
    }

    fn send_frame(&mut self, payload: &[u8]) -> io::Result<()> {
        let env = Envelope {
            handle: self.daemon_handle,
            verb: "deliver".to_string(),
            payload: payload.to_vec(),
            nonce: 0,
        };
        envelope::write_envelope(&mut self.writer, &env)
    }

    fn recv_frame(&mut self) -> io::Result<Option<Vec<u8>>> {
        if let Some(frame) = self.inbound.pop_front() {
            return Ok(Some(frame));
        }
        loop {
            match envelope::read_envelope(&mut self.reader)? {
                None => return Ok(None),
                Some(env) => match env.verb.as_str() {
                    "deliver" => return Ok(Some(env.payload)),
                    _ => continue,
                },
            }
        }
    }

    fn daemon_handle(&self) -> Handle {
        self.daemon_handle
    }
}

// ---------------------------------------------------------------------------
// ChannelTransport (in-process peer, mpsc channels)
// ---------------------------------------------------------------------------

/// In-process transport: exchanges raw CBOR envelope bytes with the
/// supervisor through std mpsc channels.
///
/// The bytes on each channel are byte-identical to what the pipe
/// transport would read/write, so there is no parallel code path to
/// drift.
///
/// `init_handshake` consumes a pre-seeded init envelope that the
/// supervisor writes into the inbound channel before spawning the
/// machine thread, so there is no handshake roundtrip.
pub struct ChannelTransport {
    inbound: std_mpsc::Receiver<Vec<u8>>,
    outbound: std_mpsc::Sender<Vec<u8>>,
    daemon_handle: Handle,
    inbound_payloads: VecDeque<Vec<u8>>,
}

impl ChannelTransport {
    /// Create a new ChannelTransport. The `inbound` receiver carries
    /// raw CBOR envelope frames from the supervisor; the `outbound`
    /// sender carries raw CBOR envelope frames back to the
    /// supervisor.
    pub fn new(
        inbound: std_mpsc::Receiver<Vec<u8>>,
        outbound: std_mpsc::Sender<Vec<u8>>,
    ) -> Self {
        ChannelTransport {
            inbound,
            outbound,
            daemon_handle: 0,
            inbound_payloads: VecDeque::new(),
        }
    }

    fn recv_frame_blocking(&mut self) -> io::Result<Option<Vec<u8>>> {
        match self.inbound.recv() {
            Ok(bytes) => Ok(Some(bytes)),
            Err(_) => Ok(None),
        }
    }
}

impl WorkerTransport for ChannelTransport {
    fn init_handshake(&mut self) -> io::Result<Handle> {
        // The supervisor pre-seeds the inbound channel with the init
        // envelope before starting the machine thread, so this
        // recv blocks only momentarily on the wake-up path.
        let bytes = match self.recv_frame_blocking()? {
            Some(b) => b,
            None => {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "channel closed before init",
                ));
            }
        };
        let env = envelope::decode_envelope(&bytes)?;
        if env.verb != "init" {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("expected init envelope, got verb '{}'", env.verb),
            ));
        }
        self.daemon_handle = env.handle;
        Ok(self.daemon_handle)
    }

    fn recv_raw_envelope(&mut self) -> io::Result<Option<Vec<u8>>> {
        self.recv_frame_blocking()
    }

    fn try_recv_raw_envelope(&mut self) -> io::Result<Option<Vec<u8>>> {
        match self.inbound.try_recv() {
            Ok(bytes) => Ok(Some(bytes)),
            Err(std_mpsc::TryRecvError::Empty) => Ok(None),
            Err(std_mpsc::TryRecvError::Disconnected) => Ok(None),
        }
    }

    fn send_raw_frame(&mut self, data: &[u8]) -> io::Result<()> {
        self.outbound
            .send(data.to_vec())
            .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "outbound channel closed"))
    }

    fn send_frame(&mut self, payload: &[u8]) -> io::Result<()> {
        let env = Envelope {
            handle: self.daemon_handle,
            verb: "deliver".to_string(),
            payload: payload.to_vec(),
            nonce: 0,
        };
        let bytes = envelope::encode_envelope(&env);
        self.outbound
            .send(bytes)
            .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "outbound channel closed"))
    }

    fn recv_frame(&mut self) -> io::Result<Option<Vec<u8>>> {
        if let Some(p) = self.inbound_payloads.pop_front() {
            return Ok(Some(p));
        }
        loop {
            let bytes = match self.recv_frame_blocking()? {
                Some(b) => b,
                None => return Ok(None),
            };
            let env = envelope::decode_envelope(&bytes)?;
            match env.verb.as_str() {
                "deliver" => return Ok(Some(env.payload)),
                _ => continue,
            }
        }
    }

    fn daemon_handle(&self) -> Handle {
        self.daemon_handle
    }
}

// ---------------------------------------------------------------------------
// Thread-local active transport
// ---------------------------------------------------------------------------

thread_local! {
    static ACTIVE_TRANSPORT: RefCell<Option<Box<dyn WorkerTransport>>> = RefCell::new(None);
    static PENDING_ENVELOPE: RefCell<Option<Vec<u8>>> = RefCell::new(None);
}

/// Store envelope bytes in the thread-local for retrieval by `host_get_pending_envelope`.
pub fn set_pending_envelope(data: Vec<u8>) {
    PENDING_ENVELOPE.with(|cell| {
        *cell.borrow_mut() = Some(data);
    });
}

/// Take the pending envelope bytes (used by `host_get_pending_envelope`).
fn take_pending_envelope() -> Option<Vec<u8>> {
    PENDING_ENVELOPE.with(|cell| cell.borrow_mut().take())
}

/// Install the given transport into the calling thread's slot.
///
/// Each in-process XS machine runs on its own dedicated
/// `std::thread`, so one active transport per thread is sufficient.
pub fn install_transport(transport: Box<dyn WorkerTransport>) {
    ACTIVE_TRANSPORT.with(|cell| {
        *cell.borrow_mut() = Some(transport);
    });
}

/// Remove the transport from this thread's slot.
pub fn clear_transport() {
    ACTIVE_TRANSPORT.with(|cell| {
        *cell.borrow_mut() = None;
    });
}

/// Access the currently installed transport on this thread.
pub fn with_transport<F, R>(f: F) -> R
where
    F: FnOnce(&mut dyn WorkerTransport) -> R,
{
    ACTIVE_TRANSPORT.with(|cell| {
        let mut borrow = cell.borrow_mut();
        let t = borrow
            .as_mut()
            .expect("WorkerTransport not installed on this thread");
        f(t.as_mut())
    })
}

// ---------------------------------------------------------------------------
// XS host functions
// ---------------------------------------------------------------------------

/// Read a string argument from the XS stack frame.
///
/// XS stores strings in CESU-8.  This function decodes surrogate
/// pairs into proper UTF-8 so that Rust string operations work
/// correctly on supplementary characters (emoji, etc.).
///
/// # Safety
/// Caller must ensure `the` is a valid XS machine pointer and
/// `index` is within the argument count.
pub(crate) unsafe fn arg_str(the: *mut XsMachine, index: usize) -> String {
    let slot = (*the).frame.sub(2 + index);
    let ptr = fxToString(the, slot);
    xs_string_to_utf8(ptr)
}

/// Set xsResult to a string.
///
/// Encodes the UTF-8 input as CESU-8 before passing to XS so that
/// supplementary characters round-trip correctly.
///
/// # Safety
/// Caller must ensure `the` is a valid XS machine pointer.
pub(crate) unsafe fn set_result_string(the: *mut XsMachine, s: &str) {
    let cesu = crate::cesu8::encode(s);
    let c_str = std::ffi::CString::new(cesu).unwrap_or_default();
    fxString(the, &mut (*the).scratch, c_str.as_ptr());
    *(*the).frame.add(1) = (*the).scratch;
}

/// Convert an XS C string (CESU-8) to a Rust UTF-8 `String`.
///
/// # Safety
/// `ptr` must be a valid null-terminated C string from XS.
pub(crate) unsafe fn xs_string_to_utf8(ptr: *const std::os::raw::c_char) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let bytes = CStr::from_ptr(ptr).to_bytes();
    crate::cesu8::decode_lossy(bytes)
}

/// `recvFrame() -> string | undefined`
///
/// Blocks until the next CapTP frame arrives from the supervisor.
/// Returns the frame payload as a hex string, or undefined on EOF.
pub unsafe extern "C" fn host_recv_frame(the: *mut XsMachine) {
    let result = with_transport(|t| t.recv_frame());
    match result {
        Ok(Some(data)) => {
            set_result_string(the, &hex::encode(&data));
        }
        Ok(None) => {
            // EOF — leave result as undefined
        }
        Err(e) => {
            let msg = format!("Error: {}", e);
            set_result_string(the, &msg);
        }
    }
}

/// `sendFrame(hexData: string) -> undefined`
pub unsafe extern "C" fn host_send_frame(the: *mut XsMachine) {
    let hex_data = arg_str(the, 0);
    match hex::decode(hex_data) {
        Ok(data) => {
            let _ = with_transport(|t| t.send_frame(&data));
        }
        Err(_) => {}
    }
}

/// `getDaemonHandle() -> number`
pub unsafe extern "C" fn host_get_daemon_handle(the: *mut XsMachine) {
    let handle = with_transport(|t| t.daemon_handle());
    fxInteger(the, &mut (*the).scratch, handle as i32);
    *(*the).frame.add(1) = (*the).scratch;
}

/// `issueCommand(uint8Array) -> undefined`
pub unsafe extern "C" fn host_issue_command(the: *mut XsMachine) {
    let slot = (*the).frame.sub(2);
    if let Some(buf) = read_typed_array_bytes(the, slot) {
        if let Err(e) = with_transport(|t| t.send_frame(&buf)) {
            eprintln!("endor: issueCommand error: {}", e);
        }
    }
}

/// `sendRawFrame(uint8Array) -> undefined`
pub unsafe extern "C" fn host_send_raw_frame(the: *mut XsMachine) {
    let slot = (*the).frame.sub(2);
    if let Some(buf) = read_typed_array_bytes(the, slot) {
        if let Err(e) = with_transport(|t| t.send_raw_frame(&buf)) {
            eprintln!("endor: sendRawFrame error: {}", e);
        }
    }
}

/// Read bytes from a TypedArray (e.g. Uint8Array) argument slot.
pub unsafe fn read_typed_array_bytes(the: *mut XsMachine, slot: *mut XsSlot) -> Option<Vec<u8>> {
    fx_push(the, *slot);
    let byte_length_id = fxID(the, c"byteLength".as_ptr());
    fxGetID(the, byte_length_id);
    let byte_length = fxToInteger(the, (*the).stack) as usize;
    fx_pop(the);

    if byte_length == 0 {
        return None;
    }

    fx_push(the, *slot);
    let byte_offset_id = fxID(the, c"byteOffset".as_ptr());
    fxGetID(the, byte_offset_id);
    let byte_offset = fxToInteger(the, (*the).stack) as i32;
    fx_pop(the);

    fx_push(the, *slot);
    let buffer_id = fxID(the, c"buffer".as_ptr());
    fxGetID(the, buffer_id);
    let buffer_slot = (*the).stack;

    let mut buf = vec![0u8; byte_length];
    fxGetArrayBufferData(
        the,
        buffer_slot,
        byte_offset,
        buf.as_mut_ptr() as *mut std::os::raw::c_void,
        byte_length as i32,
    );
    fx_pop(the);

    Some(buf)
}

/// `importArchive(uint8Array) -> boolean`
pub unsafe extern "C" fn host_import_archive(the: *mut XsMachine) {
    let slot = (*the).frame.sub(2);
    let buf = match read_typed_array_bytes(the, slot) {
        Some(b) => b,
        None => {
            fxBoolean(the, &mut (*the).scratch, 0);
            *(*the).frame.add(1) = (*the).scratch;
            return;
        }
    };
    let cursor = std::io::Cursor::new(buf);
    match crate::archive::load_archive(cursor) {
        Ok(loaded) => {
            let machine = std::mem::ManuallyDrop::new(crate::Machine { raw: the });
            let ok = crate::archive::install_archive(&machine, &loaded);
            fxBoolean(the, &mut (*the).scratch, if ok { 1 } else { 0 });
            *(*the).frame.add(1) = (*the).scratch;
        }
        Err(_) => {
            fxBoolean(the, &mut (*the).scratch, 0);
            *(*the).frame.add(1) = (*the).scratch;
        }
    }
}

/// `trace(msg: string) -> undefined`
pub unsafe extern "C" fn host_trace(the: *mut XsMachine) {
    let msg = arg_str(the, 0);
    eprintln!("endor: [trace] {}", msg);
}

/// `getPendingEnvelope() -> ArrayBuffer | undefined`
///
/// Returns the pending envelope bytes (set by `set_pending_envelope`)
/// as an ArrayBuffer, or undefined if none is pending.
/// Used by `dispatch_envelope` to pass binary data to JS without
/// hex-encoding (which is O(n²) for large payloads).
pub unsafe extern "C" fn host_get_pending_envelope(the: *mut XsMachine) {
    if let Some(mut data) = take_pending_envelope() {
        fxArrayBuffer(
            the,
            &mut (*the).scratch,
            data.as_mut_ptr() as *mut std::ffi::c_void,
            data.len() as i32,
            data.len() as i32,
        );
        *(*the).frame.add(1) = (*the).scratch;
    }
    // If no pending envelope, result stays undefined.
}

/// `hostBase64Decode(string) -> ArrayBuffer`
///
/// Decode a base64-encoded string and return the raw bytes as an
/// ArrayBuffer. This provides the native `Base64.decode` that
/// `@endo/base64` checks for, avoiding the pure-JS fallback which is
/// orders of magnitude too slow in XS for large inputs.
pub unsafe extern "C" fn host_base64_decode(the: *mut XsMachine) {
    let input = arg_str(the, 0);
    // Use the base64 standard engine with padding.
    use base64::Engine as _;
    match base64::engine::general_purpose::STANDARD.decode(input) {
        Ok(mut data) => {
            fxArrayBuffer(
                the,
                &mut (*the).scratch,
                data.as_mut_ptr() as *mut std::ffi::c_void,
                data.len() as i32,
                data.len() as i32,
            );
            *(*the).frame.add(1) = (*the).scratch;
        }
        Err(e) => {
            let msg = format!("Error: invalid base64: {}", e);
            set_result_string(the, &msg);
        }
    }
}

/// `hostBase64Encode(uint8Array) -> string`
///
/// Encode raw bytes as a base64 string. Paired with `hostBase64Decode`.
pub unsafe extern "C" fn host_base64_encode(the: *mut XsMachine) {
    let slot = (*the).frame.sub(2);
    if let Some(buf) = read_typed_array_bytes(the, slot) {
        use base64::Engine as _;
        let encoded = base64::engine::general_purpose::STANDARD.encode(&buf);
        let c_str = std::ffi::CString::new(encoded).unwrap_or_default();
        fxString(the, &mut (*the).scratch, c_str.as_ptr());
        *(*the).frame.add(1) = (*the).scratch;
    }
}

/// `hostDecodeUtf8(uint8Array) -> string`
///
/// Decode a Uint8Array as UTF-8 and return it as a JavaScript string.
/// This bypasses XS's TextDecoder which is extremely slow for large
/// buffers (>100KB), causing the daemon to hang on large CapTP
/// payloads like bundled source code in storeBlob.
pub unsafe extern "C" fn host_decode_utf8(the: *mut XsMachine) {
    let slot = (*the).frame.sub(2);
    if let Some(buf) = read_typed_array_bytes(the, slot) {
        match std::str::from_utf8(&buf) {
            Ok(s) => {
                // The input is valid UTF-8.  XS expects CESU-8, so
                // re-encode supplementary characters as surrogate pairs.
                set_result_string(the, s);
            }
            Err(e) => {
                let msg = format!("Error: invalid UTF-8: {}", e);
                set_result_string(the, &msg);
            }
        }
    }
}

/// `hostEncodeUtf8(string) -> ArrayBuffer`
///
/// Encode a JavaScript string as UTF-8 and return the raw bytes as an
/// ArrayBuffer. This bypasses XS's TextEncoder which is extremely slow
/// for large strings (>100KB), causing the daemon to hang when
/// serializing large CapTP payloads like bundled source code.
pub unsafe extern "C" fn host_encode_utf8(the: *mut XsMachine) {
    let s = arg_str(the, 0);
    let bytes = s.as_bytes();
    let len = bytes.len();
    let mut data = bytes.to_vec();
    fxArrayBuffer(
        the,
        &mut (*the).scratch,
        data.as_mut_ptr() as *mut std::ffi::c_void,
        len as i32,
        len as i32,
    );
    *(*the).frame.add(1) = (*the).scratch;
}

/// `debugPoll() -> undefined`
///
/// Run the XS debugger command loop once, flushing any pending
/// debug output to the bus.  Called from JS bootstrap to drain
/// initial debug commands (e.g. set-all-breakpoints) that arrive
/// before the first eval.
///
/// When mxDebug is not compiled in, `run_debugger()` is a no-op.
pub unsafe extern "C" fn host_debug_poll(the: *mut XsMachine) {
    let machine = std::mem::ManuallyDrop::new(crate::Machine { raw: the });
    machine.run_debugger();
    crate::flush_debug_outbound();
}

/// Register worker I/O host functions on the machine.
pub unsafe fn register(machine: &crate::Machine) {
    machine.define_function("recvFrame", host_recv_frame, 0);
    machine.define_function("sendFrame", host_send_frame, 1);
    machine.define_function("getDaemonHandle", host_get_daemon_handle, 0);
    machine.define_function("issueCommand", host_issue_command, 1);
    machine.define_function("sendRawFrame", host_send_raw_frame, 1);
    machine.define_function("importArchive", host_import_archive, 1);
    machine.define_function("trace", host_trace, 1);
    machine.define_function("getPendingEnvelope", host_get_pending_envelope, 0);
    machine.define_function("hostDecodeUtf8", host_decode_utf8, 1);
    machine.define_function("hostEncodeUtf8", host_encode_utf8, 1);
    machine.define_function("hostBase64Decode", host_base64_decode, 1);
    machine.define_function("hostBase64Encode", host_base64_encode, 1);
    machine.define_function("debugPoll", host_debug_poll, 0);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::envelope;
    use std::sync::mpsc as std_mpsc;

    /// Build a fake pipe pair from in-memory buffers for testing.
    fn make_test_pipe(inbound_envelopes: &[Envelope]) -> PipeTransport {
        let mut buf = Vec::new();
        for env in inbound_envelopes {
            envelope::write_envelope(&mut buf, env).unwrap();
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

        PipeTransport::from_streams(
            BufReader::new(tmp_read),
            BufWriter::new(tmp_write),
        )
    }

    #[test]
    fn pipe_init_handshake() {
        let init = Envelope {
            handle: 5,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        };
        let mut t = make_test_pipe(&[init]);
        let handle = t.init_handshake().unwrap();
        assert_eq!(handle, 5);
        assert_eq!(t.daemon_handle(), 5);
    }

    #[test]
    fn pipe_recv_deliver_frame() {
        let init = Envelope {
            handle: 3,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        };
        let deliver = Envelope {
            handle: 3,
            verb: "deliver".to_string(),
            payload: b"captp-message".to_vec(),
            nonce: 0,
        };
        let mut t = make_test_pipe(&[init, deliver]);
        t.init_handshake().unwrap();

        let frame = t.recv_frame().unwrap().unwrap();
        assert_eq!(frame, b"captp-message");
    }

    #[test]
    fn pipe_send_frame_wraps_in_deliver() {
        let init = Envelope {
            handle: 7,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        };
        let mut t = make_test_pipe(&[init]);
        t.init_handshake().unwrap();

        t.send_frame(b"response-data").unwrap();

        use std::io::Seek;
        let PipeTransport { writer, .. } = t;
        let mut file = writer.into_inner().unwrap();
        file.seek(std::io::SeekFrom::Start(0)).unwrap();
        let mut reader = BufReader::new(file);
        let env = envelope::read_envelope(&mut reader).unwrap().unwrap();

        assert_eq!(env.handle, 7); // daemon handle
        assert_eq!(env.verb, "deliver");
        assert_eq!(env.payload, b"response-data");
    }

    #[test]
    fn pipe_eof_returns_none() {
        let init = Envelope {
            handle: 1,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        };
        let mut t = make_test_pipe(&[init]);
        t.init_handshake().unwrap();

        let frame = t.recv_frame().unwrap();
        assert!(frame.is_none());
    }

    // ChannelTransport tests

    fn make_channel_pair() -> (ChannelTransport, std_mpsc::Sender<Vec<u8>>, std_mpsc::Receiver<Vec<u8>>) {
        let (sup_to_machine_tx, sup_to_machine_rx) = std_mpsc::channel();
        let (machine_to_sup_tx, machine_to_sup_rx) = std_mpsc::channel();
        let t = ChannelTransport::new(sup_to_machine_rx, machine_to_sup_tx);
        (t, sup_to_machine_tx, machine_to_sup_rx)
    }

    #[test]
    fn channel_init_envelope_preseeded() {
        let (mut t, tx, _rx) = make_channel_pair();
        // Pre-seed the init envelope into the inbound channel.
        let init_bytes = envelope::encode_envelope(&Envelope {
            handle: 42,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        });
        tx.send(init_bytes).unwrap();

        let handle = t.init_handshake().unwrap();
        assert_eq!(handle, 42);
        assert_eq!(t.daemon_handle(), 42);
    }

    #[test]
    fn channel_init_precedes_subsequent_envelopes() {
        let (mut t, tx, _rx) = make_channel_pair();
        // Seed init first, then a deliver. init_handshake() must
        // return the seeded init handle before any later envelope
        // reaches the machine via recv_raw_envelope().
        let init = envelope::encode_envelope(&Envelope {
            handle: 9,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        });
        let deliver = envelope::encode_envelope(&Envelope {
            handle: 9,
            verb: "deliver".to_string(),
            payload: b"first".to_vec(),
            nonce: 0,
        });
        tx.send(init).unwrap();
        tx.send(deliver).unwrap();

        // init_handshake() must consume the init frame before the
        // next recv returns the deliver frame.
        let h = t.init_handshake().unwrap();
        assert_eq!(h, 9);

        let bytes = t.recv_raw_envelope().unwrap().unwrap();
        let env = envelope::decode_envelope(&bytes).unwrap();
        assert_eq!(env.verb, "deliver");
        assert_eq!(env.payload, b"first");
    }

    #[test]
    fn channel_send_frame_encodes_deliver() {
        let (mut t, tx, rx) = make_channel_pair();
        let init = envelope::encode_envelope(&Envelope {
            handle: 11,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        });
        tx.send(init).unwrap();
        t.init_handshake().unwrap();

        t.send_frame(b"hello").unwrap();
        let bytes = rx.recv().unwrap();
        let env = envelope::decode_envelope(&bytes).unwrap();
        assert_eq!(env.handle, 11);
        assert_eq!(env.verb, "deliver");
        assert_eq!(env.payload, b"hello");
    }

    #[test]
    fn channel_closed_returns_none() {
        let (mut t, tx, _rx) = make_channel_pair();
        let init = envelope::encode_envelope(&Envelope {
            handle: 1,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        });
        tx.send(init).unwrap();
        t.init_handshake().unwrap();
        drop(tx);

        let frame = t.recv_frame().unwrap();
        assert!(frame.is_none());
    }
}
