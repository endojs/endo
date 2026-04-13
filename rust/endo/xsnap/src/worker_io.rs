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

/// Helper: read a string argument from the XS stack frame.
unsafe fn arg_str(the: *mut XsMachine, index: usize) -> &'static str {
    let slot = (*the).frame.sub(2 + index);
    let ptr = fxToString(the, slot);
    CStr::from_ptr(ptr).to_str().unwrap_or("")
}

/// Helper: set xsResult to a string.
unsafe fn set_result_string(the: *mut XsMachine, s: &str) {
    let c_str = std::ffi::CString::new(s).unwrap();
    fxString(the, &mut (*the).scratch, c_str.as_ptr());
    *(*the).frame.add(1) = (*the).scratch;
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

/// Register worker I/O host functions on the machine.
pub unsafe fn register(machine: &crate::Machine) {
    machine.define_function("recvFrame", host_recv_frame, 0);
    machine.define_function("sendFrame", host_send_frame, 1);
    machine.define_function("getDaemonHandle", host_get_daemon_handle, 0);
    machine.define_function("issueCommand", host_issue_command, 1);
    machine.define_function("sendRawFrame", host_send_raw_frame, 1);
    machine.define_function("importArchive", host_import_archive, 1);
    machine.define_function("trace", host_trace, 1);
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
