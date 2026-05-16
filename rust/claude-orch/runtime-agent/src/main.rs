// claude-orch-runtime-agent
//
// Long-lived guest-side process. Runs as the unprivileged `claude` user
// after bootstrap-init has dropped privileges. Speaks newline-delimited
// JSON RPC with the host orchestrator over /dev/virtio-ports/agent and
// frames Claude Code's stdio on /dev/virtio-ports/stdio.
//
// Vocabulary (DESIGN.md §5.4):
//   Agent → Orchestrator:  ready, heartbeat, log, exited
//   Orchestrator → Agent:  attach, detach, rotate_creds, exec, terminate
//
// Stdio framing (DESIGN.md §6.3):
//   <streamId:8 bytes><len:4 bytes big-endian><payload:len bytes>
//
// On `attach`, the agent spawns `claude` with --print and stream-json I/O,
// pipes its stdin from the matching streamId on the stdio port, and pipes
// its stdout back as frames with the same streamId.

use std::env;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

mod seccomp;

const STDIO_PORT: &str = "/dev/virtio-ports/stdio";
const CREDS_PATH: &str = "/home/claude/.claude/.credentials.json";
const STREAM_ID_LEN: usize = 8;
const HEADER_LEN: usize = STREAM_ID_LEN + 4;

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AgentOut {
    Ready {
        capabilities: Vec<String>,
    },
    Heartbeat {
        #[serde(rename = "lastInputAt")]
        last_input_at: String,
        #[serde(rename = "cpuPct")]
        cpu_pct: f32,
        #[serde(rename = "memRss")]
        mem_rss: u64,
        #[serde(rename = "idleSeconds")]
        idle_seconds: u64,
    },
    Log {
        level: String,
        msg: String,
    },
    Exited {
        reason: String,
        #[serde(rename = "exitCode")]
        exit_code: i32,
    },
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum OrchIn {
    Attach {
        #[serde(rename = "streamId")]
        stream_id: String,
    },
    Detach {
        #[serde(rename = "streamId")]
        stream_id: String,
    },
    RotateCreds {
        credentials: serde_json::Value,
    },
    #[allow(dead_code)]
    Exec {
        cmd: String,
        argv: Vec<String>,
        #[serde(rename = "timeoutMs")]
        timeout_ms: u64,
        #[serde(rename = "streamId")]
        stream_id: String,
    },
    Terminate {
        #[serde(rename = "graceMs")]
        grace_ms: u64,
    },
}

struct Args {
    control_port: String,
    session_id: String,
}

fn parse_args() -> Result<Args, String> {
    let mut control_port = None;
    let mut session_id = None;
    for arg in env::args().skip(1) {
        if let Some(v) = arg.strip_prefix("--control-port=") {
            control_port = Some(v.to_string());
        } else if let Some(v) = arg.strip_prefix("--session-id=") {
            session_id = Some(v.to_string());
        } else {
            return Err(format!("unknown argument: {arg}"));
        }
    }
    Ok(Args {
        control_port: control_port.ok_or("missing --control-port")?,
        session_id: session_id.ok_or("missing --session-id")?,
    })
}

fn main() {
    if let Err(e) = run() {
        eprintln!("[claude-agent] FATAL: {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = parse_args()?;

    let ctl_read = OpenOptions::new()
        .read(true)
        .write(false)
        .open(&args.control_port)
        .map_err(|e| format!("open {} for read: {e}", &args.control_port))?;
    let ctl_write = OpenOptions::new()
        .read(false)
        .write(true)
        .open(&args.control_port)
        .map_err(|e| format!("open {} for write: {e}", &args.control_port))?;

    // Writer thread: single point of egress to the control fd.
    let (out_tx, out_rx) = mpsc::channel::<Vec<u8>>();
    {
        let mut ctl_write = ctl_write;
        thread::spawn(move || {
            for mut buf in out_rx {
                buf.push(b'\n');
                if ctl_write.write_all(&buf).is_err() {
                    break;
                }
                let _ = ctl_write.flush();
            }
        });
    }

    send_out(
        &out_tx,
        &AgentOut::Ready {
            capabilities: vec!["stdio-mux".into()],
        },
    );
    send_out(
        &out_tx,
        &AgentOut::Log {
            level: "info".into(),
            msg: format!("agent ready (session={})", args.session_id),
        },
    );

    // Install the seccomp filter (no-op without the `seccomp` feature).
    // After this point dangerous syscalls (ptrace, BPF, kexec, module
    // loading, ...) are rejected with SECCOMP_RET_KILL_PROCESS.
    if let Err(e) = seccomp::install() {
        log_to(&out_tx, "error", &format!("seccomp install failed: {e}"));
    }

    // Heartbeat thread.
    {
        let out_tx = out_tx.clone();
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(15));
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            send_out(
                &out_tx,
                &AgentOut::Heartbeat {
                    last_input_at: now.to_string(),
                    cpu_pct: 0.0,
                    mem_rss: 0,
                    idle_seconds: 0,
                },
            );
        });
    }

    // Lazily-opened stdio port. Open it the first time we need to start
    // framing; the host orchestrator's stdio chardev exists from QEMU
    // launch but may not be connected to a host endpoint until markReady
    // wires the multiplexer.
    let stdio_state: Arc<Mutex<Option<StdioState>>> = Arc::new(Mutex::new(None));
    let claude_child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let claude_streams: Arc<Mutex<Option<ClaudeStreams>>> = Arc::new(Mutex::new(None));

    let mut reader = BufReader::new(ctl_read);
    let mut line = String::new();

    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => return Err("control channel closed".into()),
            Ok(_) => {}
            Err(e) => return Err(format!("read control: {e}")),
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<OrchIn>(trimmed) {
            Ok(OrchIn::Attach { stream_id }) => {
                if let Err(e) = start_attach(
                    &stream_id,
                    &stdio_state,
                    &claude_child,
                    &claude_streams,
                    &out_tx,
                ) {
                    log_to(&out_tx, "error", &format!("attach: {e}"));
                }
            }
            Ok(OrchIn::Detach { stream_id }) => {
                if let Err(e) = stop_attach(&claude_child, &claude_streams) {
                    log_to(&out_tx, "warn", &format!("detach: {e}"));
                }
                log_to(&out_tx, "info", &format!("detached stream={}", stream_id));
            }
            Ok(OrchIn::RotateCreds { credentials }) => {
                if let Err(e) = rotate_creds(&credentials) {
                    log_to(&out_tx, "error", &format!("rotate_creds: {e}"));
                } else {
                    log_to(&out_tx, "info", "credentials rotated");
                }
            }
            Ok(OrchIn::Exec { cmd, argv, .. }) => {
                log_to(
                    &out_tx,
                    "info",
                    &format!("exec {} {} (multi-stream TODO)", cmd, argv.join(" ")),
                );
            }
            Ok(OrchIn::Terminate { grace_ms }) => {
                send_out(
                    &out_tx,
                    &AgentOut::Exited {
                        reason: "terminate".into(),
                        exit_code: 0,
                    },
                );
                thread::sleep(Duration::from_millis(50));
                let _ = stop_attach(&claude_child, &claude_streams);
                thread::sleep(Duration::from_millis(grace_ms.min(2000)));
                std::process::exit(0);
            }
            Err(e) => {
                log_to(&out_tx, "warn", &format!("bad RPC: {e}"));
            }
        }
    }
}

// -----------------------------------------------------------------------------

#[allow(dead_code)]
struct StdioState {
    write: Arc<Mutex<File>>,
    // Reader thread runs forever; its handle isn't joined.
    _reader: thread::JoinHandle<()>,
}

struct ClaudeStreams {
    #[allow(dead_code)]
    stdin: Arc<Mutex<ChildStdin>>,
}

fn ensure_stdio_open(
    stdio_state: &Arc<Mutex<Option<StdioState>>>,
    claude_streams: &Arc<Mutex<Option<ClaudeStreams>>>,
    target_stream_id: &str,
) -> Result<Arc<Mutex<File>>, String> {
    {
        let g = stdio_state.lock().map_err(|e| e.to_string())?;
        if let Some(s) = g.as_ref() {
            return Ok(s.write.clone());
        }
    }

    let rd = OpenOptions::new()
        .read(true)
        .write(false)
        .open(STDIO_PORT)
        .map_err(|e| format!("open {} read: {e}", STDIO_PORT))?;
    let wr = OpenOptions::new()
        .read(false)
        .write(true)
        .open(STDIO_PORT)
        .map_err(|e| format!("open {} write: {e}", STDIO_PORT))?;

    let write = Arc::new(Mutex::new(wr));
    let claude_streams_for_thread = claude_streams.clone();
    let target = target_stream_id.to_string();

    let reader = thread::spawn(move || {
        let mut rd = rd;
        let mut buf: Vec<u8> = Vec::with_capacity(8192);
        loop {
            let mut tmp = [0u8; 4096];
            match rd.read(&mut tmp) {
                Ok(0) => break,
                Ok(n) => buf.extend_from_slice(&tmp[..n]),
                Err(_) => break,
            }
            buf = consume_frames(buf, |id, payload| {
                if id != target {
                    return;
                }
                if let Ok(g) = claude_streams_for_thread.lock() {
                    if let Some(s) = g.as_ref() {
                        if let Ok(mut stdin) = s.stdin.lock() {
                            let _ = stdin.write_all(payload);
                            let _ = stdin.flush();
                        }
                    }
                }
            });
        }
    });

    let state = StdioState {
        write: write.clone(),
        _reader: reader,
    };
    {
        let mut g = stdio_state.lock().map_err(|e| e.to_string())?;
        *g = Some(state);
    }
    Ok(write)
}

fn start_attach(
    stream_id: &str,
    stdio_state: &Arc<Mutex<Option<StdioState>>>,
    claude_child: &Arc<Mutex<Option<Child>>>,
    claude_streams: &Arc<Mutex<Option<ClaudeStreams>>>,
    out_tx: &mpsc::Sender<Vec<u8>>,
) -> Result<(), String> {
    // Idempotent: if claude is already running, leave it.
    if claude_child.lock().map_err(|e| e.to_string())?.is_some() {
        log_to(out_tx, "info", &format!("attach (already running) stream={}", stream_id));
        return Ok(());
    }

    let write = ensure_stdio_open(stdio_state, claude_streams, stream_id)?;

    let mut child = Command::new("claude")
        .arg("--print")
        .arg("--input-format")
        .arg("stream-json")
        .arg("--output-format")
        .arg("stream-json")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("spawn claude: {e}"))?;

    let stdin = child.stdin.take().ok_or("no claude stdin")?;
    let stdout = child.stdout.take().ok_or("no claude stdout")?;

    {
        let mut g = claude_streams.lock().map_err(|e| e.to_string())?;
        *g = Some(ClaudeStreams {
            stdin: Arc::new(Mutex::new(stdin)),
        });
    }

    // Pump claude stdout → framed write back to host.
    let out_tx_clone = out_tx.clone();
    let stream_id_owned = stream_id.to_string();
    thread::spawn(move || {
        pump_stdout(stdout, write, &stream_id_owned, &out_tx_clone);
    });

    log_to(out_tx, "info", &format!("attach claude pid={} stream={}", child.id(), stream_id));
    let mut g = claude_child.lock().map_err(|e| e.to_string())?;
    *g = Some(child);
    Ok(())
}

fn pump_stdout(
    mut stdout: ChildStdout,
    write: Arc<Mutex<File>>,
    stream_id: &str,
    out_tx: &mpsc::Sender<Vec<u8>>,
) {
    let mut buf = [0u8; 4096];
    loop {
        match stdout.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let frame = build_frame(stream_id, &buf[..n]);
                if let Ok(mut w) = write.lock() {
                    if w.write_all(&frame).is_err() {
                        break;
                    }
                    let _ = w.flush();
                }
            }
            Err(e) => {
                log_to(out_tx, "warn", &format!("claude stdout read: {e}"));
                break;
            }
        }
    }
}

fn stop_attach(
    claude_child: &Arc<Mutex<Option<Child>>>,
    claude_streams: &Arc<Mutex<Option<ClaudeStreams>>>,
) -> Result<(), String> {
    let child_opt = {
        let mut g = claude_child.lock().map_err(|e| e.to_string())?;
        g.take()
    };
    if let Some(mut c) = child_opt {
        let _ = c.kill();
        let _ = c.wait();
    }
    let mut g = claude_streams.lock().map_err(|e| e.to_string())?;
    *g = None;
    Ok(())
}

// -----------------------------------------------------------------------------
// Stdio framing.

fn build_frame(stream_id: &str, payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(HEADER_LEN + payload.len());
    let mut id_bytes = [0u8; STREAM_ID_LEN];
    let id_src = stream_id.as_bytes();
    let take = id_src.len().min(STREAM_ID_LEN);
    id_bytes[..take].copy_from_slice(&id_src[..take]);
    out.extend_from_slice(&id_bytes);
    out.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    out.extend_from_slice(payload);
    out
}

fn consume_frames<F: FnMut(&str, &[u8])>(mut buf: Vec<u8>, mut on_frame: F) -> Vec<u8> {
    let mut off = 0;
    while buf.len() - off >= HEADER_LEN {
        let len_bytes = &buf[off + STREAM_ID_LEN..off + HEADER_LEN];
        let payload_len =
            u32::from_be_bytes([len_bytes[0], len_bytes[1], len_bytes[2], len_bytes[3]]) as usize;
        if buf.len() - off < HEADER_LEN + payload_len {
            break;
        }
        let id_buf = &buf[off..off + STREAM_ID_LEN];
        let id_end = id_buf.iter().position(|b| *b == 0).unwrap_or(STREAM_ID_LEN);
        let id = std::str::from_utf8(&id_buf[..id_end]).unwrap_or("");
        let payload = &buf[off + HEADER_LEN..off + HEADER_LEN + payload_len];
        on_frame(id, payload);
        off += HEADER_LEN + payload_len;
    }
    if off > 0 {
        buf.drain(..off);
    }
    buf
}

// -----------------------------------------------------------------------------

fn send_out(out: &mpsc::Sender<Vec<u8>>, msg: &AgentOut) {
    let _ = out.send(serde_json::to_vec(msg).unwrap_or_default());
}

fn log_to(out: &mpsc::Sender<Vec<u8>>, level: &str, msg: &str) {
    send_out(
        out,
        &AgentOut::Log {
            level: level.into(),
            msg: msg.into(),
        },
    );
}

fn rotate_creds(creds: &serde_json::Value) -> Result<(), String> {
    use std::os::unix::fs::OpenOptionsExt;
    let tmp = format!("{CREDS_PATH}.new");
    let data = serde_json::to_vec(creds).map_err(|e| e.to_string())?;
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&tmp)
        .map_err(|e| format!("open {tmp}: {e}"))?;
    f.write_all(&data).map_err(|e| format!("write {tmp}: {e}"))?;
    f.sync_all().map_err(|e| format!("fsync {tmp}: {e}"))?;
    fs::rename(&tmp, CREDS_PATH).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

// -----------------------------------------------------------------------------
// Tests (host-side; framing logic only)

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_roundtrip() {
        let f1 = build_frame("default0", b"hello");
        let f2 = build_frame("exec-1", b"world");
        let buf = [f1, f2].concat();
        let collected = std::sync::Mutex::new(Vec::<(String, Vec<u8>)>::new());
        let tail = consume_frames(buf, |id, p| {
            collected.lock().unwrap().push((id.to_string(), p.to_vec()));
        });
        assert_eq!(tail.len(), 0);
        let c = collected.lock().unwrap().clone();
        assert_eq!(c.len(), 2);
        assert_eq!(c[0].0, "default0");
        assert_eq!(c[0].1, b"hello");
        assert_eq!(c[1].0, "exec-1");
        assert_eq!(c[1].1, b"world");
    }

    #[test]
    fn partial_frame_left_in_tail() {
        let f = build_frame("default0", b"abcdef");
        let truncated = f[..f.len() - 2].to_vec();
        let count = std::sync::Mutex::new(0usize);
        let tail = consume_frames(truncated.clone(), |_, _| {
            *count.lock().unwrap() += 1;
        });
        assert_eq!(*count.lock().unwrap(), 0);
        assert_eq!(tail.len(), truncated.len());
    }
}
