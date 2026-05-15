// claude-orch-runtime-agent
//
// Long-lived guest-side process. Runs as the unprivileged `claude` user
// after bootstrap-init has dropped privileges. Speaks newline-delimited
// JSON RPC with the host orchestrator over /dev/virtio-ports/agent.
//
// Vocabulary (DESIGN.md §5.4):
//   Agent → Orchestrator:  ready, heartbeat, log, exited
//   Orchestrator → Agent:  attach, detach, rotate_creds, exec, terminate
//
// The agent spawns Claude Code under tmux on first attach and frames its
// stdin/stdout on a separate virtio-serial port (/dev/virtio-ports/stdio).
// v1: stdio multiplexing not yet implemented; we send `ready` and process
// the control vocabulary, but `attach` only logs.

use std::env;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const STDIO_PORT: &str = "/dev/virtio-ports/stdio";
const CREDS_PATH: &str = "/home/claude/.claude/.credentials.json";

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
    let mut ctl_write = OpenOptions::new()
        .read(false)
        .write(true)
        .open(&args.control_port)
        .map_err(|e| format!("open {} for write: {e}", &args.control_port))?;

    send(
        &mut ctl_write,
        &AgentOut::Ready {
            capabilities: vec!["tmux".into(), "exec".into()],
        },
    )?;
    send(
        &mut ctl_write,
        &AgentOut::Log {
            level: "info".into(),
            msg: format!("agent ready (session={})", args.session_id),
        },
    )?;

    // Heartbeat thread (best-effort; no real metrics in v1).
    let (hb_tx, hb_rx) = mpsc::channel::<Vec<u8>>();
    {
        let hb_tx = hb_tx.clone();
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(15));
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let line = serde_json::to_vec(&AgentOut::Heartbeat {
                last_input_at: now.to_string(),
                cpu_pct: 0.0,
                mem_rss: 0,
                idle_seconds: 0,
            })
            .unwrap();
            if hb_tx.send(line).is_err() {
                break;
            }
        });
    }

    let mut reader = BufReader::new(ctl_read);
    let mut line = String::new();

    // Writer thread: serializes heartbeats and command responses to the
    // single control fd so writes don't interleave.
    let (out_tx, out_rx) = mpsc::channel::<Vec<u8>>();
    {
        let mut ctl_write = ctl_write
            .try_clone()
            .map_err(|e| format!("clone ctl_write: {e}"))?;
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
    // Pipe heartbeats into the writer.
    {
        let out_tx = out_tx.clone();
        thread::spawn(move || {
            for line in hb_rx {
                if out_tx.send(line).is_err() {
                    break;
                }
            }
        });
    }

    // Main loop: read JSON lines from orchestrator and dispatch.
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
                let _ = ensure_claude_started(&out_tx);
                log_to(
                    &out_tx,
                    "info",
                    &format!("attach stream={} (stdio mux TODO)", stream_id),
                );
            }
            Ok(OrchIn::Detach { stream_id }) => {
                log_to(&out_tx, "info", &format!("detach stream={}", stream_id));
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
                    &format!("exec {} {} (stdio mux TODO)", cmd, argv.join(" ")),
                );
            }
            Ok(OrchIn::Terminate { grace_ms }) => {
                let _ = out_tx.send(
                    serde_json::to_vec(&AgentOut::Exited {
                        reason: "terminate".into(),
                        exit_code: 0,
                    })
                    .unwrap(),
                );
                thread::sleep(Duration::from_millis(50)); // flush
                terminate_children(grace_ms);
                std::process::exit(0);
            }
            Err(e) => {
                log_to(&out_tx, "warn", &format!("bad RPC: {e}"));
            }
        }
    }
}

fn send<W: Write>(w: &mut W, msg: &AgentOut) -> Result<(), String> {
    let mut buf = serde_json::to_vec(msg).map_err(|e| e.to_string())?;
    buf.push(b'\n');
    w.write_all(&buf).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())?;
    Ok(())
}

fn log_to(out: &mpsc::Sender<Vec<u8>>, level: &str, msg: &str) {
    let _ = out.send(
        serde_json::to_vec(&AgentOut::Log {
            level: level.into(),
            msg: msg.into(),
        })
        .unwrap(),
    );
}

fn rotate_creds(creds: &serde_json::Value) -> Result<(), String> {
    let tmp = format!("{CREDS_PATH}.new");
    fs::write(&tmp, serde_json::to_vec(creds).map_err(|e| e.to_string())?)
        .map_err(|e| format!("write {tmp}: {e}"))?;
    fs::rename(&tmp, CREDS_PATH).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

// v1: track-and-kill is simplistic. tmux session lifecycle and stdio
// multiplexing are TODOs.
static CLAUDE_PID: Mutex<Option<u32>> = Mutex::new(None);

fn ensure_claude_started(out: &mpsc::Sender<Vec<u8>>) -> Result<(), String> {
    let mut guard = CLAUDE_PID.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }
    let _ = fs::File::create(STDIO_PORT); // touch; ignored if absent

    let mut cmd = Command::new("tmux");
    cmd.arg("new-session").arg("-d").arg("-s").arg("claude");
    cmd.arg("claude");
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    match cmd.spawn() {
        Ok(child) => {
            *guard = Some(child.id());
            log_to(out, "info", &format!("claude spawned pid={}", child.id()));
            Ok(())
        }
        Err(e) => Err(format!("spawn tmux/claude: {e}")),
    }
}

fn terminate_children(grace_ms: u64) {
    let _ = Command::new("tmux").arg("kill-server").status();
    thread::sleep(Duration::from_millis(grace_ms.min(2000)));
}
