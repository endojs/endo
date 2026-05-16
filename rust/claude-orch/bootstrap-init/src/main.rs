// claude-orch-bootstrap-init
//
// PID 1 in the microVM guest. One-shot privileged setup:
//   1. Mount /proc, /sys, /dev, /dev/pts, /run, /tmp.
//   2. Parse /proc/cmdline for claude.session_id and claude.boot_nonce.
//   3. Open /dev/virtio-ports/orchestrator; send Hello; receive BootConfig.
//   4. Open /dev/virtio-ports/workspace; mount 9P at /workspace (trans=fd).
//   5. Write credentials to /home/claude/.claude/.credentials.json (0600).
//   6. Drop capabilities; setuid/setgid to the claude user.
//   7. exec /usr/local/bin/claude-agent.
//
// See packages/claude-container/DESIGN.md §5.3.

use std::fs;
use std::io::{Read, Write};
use std::os::fd::IntoRawFd;
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::process::CommandExt;
use std::process::Command;

use nix::mount::{mount, MsFlags};
use nix::unistd::{chown, setgid, setgroups, setuid, Gid, Uid};
use serde::{Deserialize, Serialize};

const CLAUDE_UID: u32 = 1000;
const CLAUDE_GID: u32 = 1000;
const CLAUDE_HOME: &str = "/home/claude";
const CREDS_DIR: &str = "/home/claude/.claude";
const CREDS_PATH: &str = "/home/claude/.claude/.credentials.json";
const CTL_PORT_NAME: &str = "orchestrator";
const WORKSPACE_PORT_NAME: &str = "workspace";
const WORKSPACE_MOUNT: &str = "/workspace";
const AGENT_BIN: &str = "/usr/local/bin/claude-agent";

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum BootstrapOut {
    Hello {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "bootNonce")]
        boot_nonce: String,
        #[serde(rename = "agentVersion")]
        agent_version: String,
        hostname: String,
    },
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum BootstrapIn {
    BootConfig {
        credentials: serde_json::Value,
        #[serde(rename = "envExtra", default)]
        env_extra: std::collections::HashMap<String, String>,
        #[serde(rename = "initialPrompt")]
        initial_prompt: Option<String>,
        #[serde(rename = "agentControlPort")]
        agent_control_port: String,
    },
}

fn main() {
    if let Err(e) = run() {
        eprintln!("[bootstrap-init] FATAL: {e}");
        // Let the kernel observe stderr drain before exit; QEMU will print
        // it to the host log.
        std::thread::sleep(std::time::Duration::from_secs(2));
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    mount_filesystems()?;

    let (session_id, boot_nonce) = parse_cmdline()?;
    let hostname = fs::read_to_string("/proc/sys/kernel/hostname")
        .unwrap_or_else(|_| "claude-vm".into())
        .trim()
        .to_string();

    let ctl_path = resolve_virtio_port(CTL_PORT_NAME)?;
    let mut ctl = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&ctl_path)
        .map_err(|e| format!("open {ctl_path}: {e}"))?;

    let hello = BootstrapOut::Hello {
        session_id: session_id.clone(),
        boot_nonce,
        agent_version: env!("CARGO_PKG_VERSION").to_string(),
        hostname,
    };
    let mut line = serde_json::to_vec(&hello).map_err(|e| e.to_string())?;
    line.push(b'\n');
    ctl.write_all(&line).map_err(|e| e.to_string())?;
    ctl.flush().map_err(|e| e.to_string())?;

    let mut buf = Vec::with_capacity(4096);
    read_line(&mut ctl, &mut buf)?;
    let BootstrapIn::BootConfig {
        credentials,
        env_extra,
        initial_prompt,
        agent_control_port,
    } = serde_json::from_slice::<BootstrapIn>(&buf).map_err(|e| e.to_string())?;

    drop(ctl); // bootstrap port done

    mount_workspace()?;
    write_credentials(&credentials)?;
    write_initial_prompt(initial_prompt.as_deref())?;
    chown_home()?;
    drop_privileges()?;

    let mut cmd = Command::new(AGENT_BIN);
    cmd.arg(format!("--control-port={agent_control_port}"));
    cmd.arg(format!("--session-id={session_id}"));
    for (k, v) in env_extra {
        cmd.env(k, v);
    }

    let err = cmd.exec();
    Err(format!("exec {AGENT_BIN}: {err}"))
}

fn mount_filesystems() -> Result<(), String> {
    for d in ["/proc", "/sys", "/dev", "/dev/pts", "/run", "/tmp"] {
        fs::create_dir_all(d).ok();
    }
    // The kernel may have auto-mounted some of these already (e.g.,
    // CONFIG_DEVTMPFS_MOUNT auto-mounts /dev at boot). Tolerate EBUSY
    // and treat it as "already mounted, fine, move on."
    mount_if_unmounted("proc", "/proc", "proc")?;
    mount_if_unmounted("sysfs", "/sys", "sysfs")?;
    mount_if_unmounted("devtmpfs", "/dev", "devtmpfs")?;
    mount_if_unmounted("devpts", "/dev/pts", "devpts")?;
    mount_if_unmounted("tmpfs", "/run", "tmpfs")?;
    mount_if_unmounted("tmpfs", "/tmp", "tmpfs")?;
    Ok(())
}

fn mount_if_unmounted(source: &str, target: &str, fstype: &str) -> Result<(), String> {
    match mount::<str, str, str, str>(Some(source), target, Some(fstype), MsFlags::empty(), None) {
        Ok(()) => Ok(()),
        Err(nix::errno::Errno::EBUSY) => Ok(()), // kernel auto-mounted it
        Err(e) => Err(format!("mount {target}: {e}")),
    }
}

fn mount_workspace() -> Result<(), String> {
    fs::create_dir_all(WORKSPACE_MOUNT).ok();
    let workspace_path = resolve_virtio_port(WORKSPACE_PORT_NAME)?;
    let port = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&workspace_path)
        .map_err(|e| format!("open {workspace_path}: {e}"))?;
    let fd = port.into_raw_fd();
    let opts = format!(
        "trans=fd,rfdno={fd},wfdno={fd},version=9p2000.L,msize=131072,access=any"
    );
    mount::<str, str, str, str>(
        Some("none"),
        WORKSPACE_MOUNT,
        Some("9p"),
        MsFlags::empty(),
        Some(&opts),
    )
    .map_err(|e| format!("mount 9p {WORKSPACE_MOUNT}: {e}"))?;
    // The fd is now owned by the kernel mount; do not close.
    Ok(())
}

fn parse_cmdline() -> Result<(String, String), String> {
    let cmdline = fs::read_to_string("/proc/cmdline").map_err(|e| format!("/proc/cmdline: {e}"))?;
    let mut session_id = None;
    let mut boot_nonce = None;
    for part in cmdline.split_whitespace() {
        if let Some(v) = part.strip_prefix("claude.session_id=") {
            session_id = Some(v.to_string());
        } else if let Some(v) = part.strip_prefix("claude.boot_nonce=") {
            boot_nonce = Some(v.to_string());
        }
    }
    Ok((
        session_id.ok_or("missing claude.session_id on cmdline")?,
        boot_nonce.ok_or("missing claude.boot_nonce on cmdline")?,
    ))
}

fn write_credentials(creds: &serde_json::Value) -> Result<(), String> {
    fs::create_dir_all(CREDS_DIR).ok();
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(CREDS_PATH)
        .map_err(|e| format!("open {CREDS_PATH}: {e}"))?;
    let data = serde_json::to_vec(creds).map_err(|e| e.to_string())?;
    f.write_all(&data).map_err(|e| e.to_string())?;
    Ok(())
}

fn write_initial_prompt(prompt: Option<&str>) -> Result<(), String> {
    let Some(p) = prompt else { return Ok(()) };
    if p.is_empty() {
        return Ok(());
    }
    let path = format!("{CLAUDE_HOME}/.claude/initial-prompt.txt");
    fs::create_dir_all(CREDS_DIR).ok();
    // 0600 + owned by claude:claude — same threat model as the credentials
    // file: an attacker who can read this can see whatever the orchestrator
    // passed in initialPrompt.
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&path)
        .map_err(|e| format!("open {path}: {e}"))?;
    f.write_all(p.as_bytes())
        .map_err(|e| format!("write {path}: {e}"))?;
    chown(
        path.as_str(),
        Some(Uid::from_raw(CLAUDE_UID)),
        Some(Gid::from_raw(CLAUDE_GID)),
    )
    .map_err(|e| format!("chown {path}: {e}"))?;
    Ok(())
}

fn chown_home() -> Result<(), String> {
    let uid = Uid::from_raw(CLAUDE_UID);
    let gid = Gid::from_raw(CLAUDE_GID);
    chown(CLAUDE_HOME, Some(uid), Some(gid))
        .map_err(|e| format!("chown {CLAUDE_HOME}: {e}"))?;
    chown(CREDS_DIR, Some(uid), Some(gid))
        .map_err(|e| format!("chown {CREDS_DIR}: {e}"))?;
    chown(CREDS_PATH, Some(uid), Some(gid))
        .map_err(|e| format!("chown {CREDS_PATH}: {e}"))?;
    Ok(())
}

fn drop_privileges() -> Result<(), String> {
    setgroups(&[Gid::from_raw(CLAUDE_GID)]).map_err(|e| format!("setgroups: {e}"))?;
    setgid(Gid::from_raw(CLAUDE_GID)).map_err(|e| format!("setgid: {e}"))?;
    setuid(Uid::from_raw(CLAUDE_UID)).map_err(|e| format!("setuid: {e}"))?;
    Ok(())
}

/// Resolve a named virtio-serial port to its /dev path by scanning
/// /sys/class/virtio-ports/*/name. The /dev/virtio-ports/<name> symlinks
/// the design doc assumes only exist after a udev runs; an explicit
/// resolver lets bootstrap-init work without any userspace daemon.
fn resolve_virtio_port(name: &str) -> Result<String, String> {
    let entries = fs::read_dir("/sys/class/virtio-ports")
        .map_err(|e| format!("read /sys/class/virtio-ports: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let dev_name = entry.file_name();
        let name_path = entry.path().join("name");
        let port_name = fs::read_to_string(&name_path)
            .map_err(|e| format!("read {}: {e}", name_path.display()))?;
        if port_name.trim() == name {
            return Ok(format!("/dev/{}", dev_name.to_string_lossy()));
        }
    }
    Err(format!(
        "virtio-serial port named {name:?} not found under /sys/class/virtio-ports"
    ))
}

fn read_line<R: Read>(r: &mut R, out: &mut Vec<u8>) -> Result<(), String> {
    out.clear();
    let mut byte = [0u8; 1];
    loop {
        let n = r.read(&mut byte).map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("EOF before newline".into());
        }
        if byte[0] == b'\n' {
            return Ok(());
        }
        out.push(byte[0]);
        if out.len() > 1 << 20 {
            return Err("line too long".into());
        }
    }
}
