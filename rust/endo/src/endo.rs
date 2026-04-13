use std::fs::{self, OpenOptions};
use std::os::unix::process::CommandExt;
use std::sync::Arc;
use std::time::Duration;
use std::time::SystemTime;

use tokio::net::UnixStream;
use tokio::sync::Notify;

use crate::codec;
use crate::engine::{self, Engine};
use crate::error::EndoError;
use crate::inproc;
use crate::mailbox::MailboxReceiver;
use crate::paths::{resolve_paths, EndoPaths};
use crate::pidfile;
use crate::proc::{spawn_with_pipes, wire_worker_tasks};
use crate::socket;
use crate::supervisor::{self, Supervisor};
use crate::types::{Envelope, Handle, Message, WorkerInfo};

/// How the daemon should host the manager.
///
/// `InProcessXs` is the default: a dedicated `std::thread` inside
/// `endor daemon` runs the XS manager machine and talks to the
/// supervisor through a channel transport. `NodeChild` is the
/// legacy Node.js daemon child, retained for one release behind
/// `ENDO_MANAGER_NODE=1`.
enum ManagerMode {
    InProcessXs,
    NodeChild,
}

impl ManagerMode {
    fn from_env() -> Self {
        if std::env::var_os("ENDO_MANAGER_NODE").is_some() {
            ManagerMode::NodeChild
        } else {
            ManagerMode::InProcessXs
        }
    }
}

pub struct Endo {
    supervisor: Arc<Supervisor>,
    outbox_rx: Option<MailboxReceiver>,
    paths: EndoPaths,
    daemon_handle: Handle,
    node_path: String,
    daemon_script_path: String,
    shutdown_notify: Arc<Notify>,
}

impl Endo {
    /// Initialize the daemon: resolve paths, create directories, write PID, start supervisor.
    pub fn start() -> Result<Self, EndoError> {
        let paths = resolve_paths()?;

        for dir in [&paths.state_path, &paths.ephemeral_path, &paths.cache_path] {
            fs::create_dir_all(dir)
                .map_err(|e| EndoError::Config(format!("mkdir {}: {e}", dir.display())))?;
        }
        if let Some(parent) = paths.sock_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| EndoError::Config(format!("mkdir sock parent: {e}")))?;
        }

        pidfile::write_pid(&paths.ephemeral_path)?;

        let (supervisor, outbox_rx) = Supervisor::new();

        Ok(Endo {
            supervisor,
            outbox_rx: Some(outbox_rx),
            paths,
            daemon_handle: 0,
            node_path: find_node(),
            daemon_script_path: String::new(),
            shutdown_notify: Arc::new(Notify::new()),
        })
    }

    /// Host the manager (in-process XS by default; Node.js child when
    /// `ENDO_MANAGER_NODE=1`), install signal handlers, and block
    /// until shutdown.
    ///
    /// The in-process XS manager runs on a dedicated `std::thread`
    /// inside this process and communicates with the supervisor via a
    /// channel transport — byte-identical on the wire to the legacy
    /// pipe path.
    pub async fn serve(&mut self) -> Result<(), EndoError> {
        eprintln!(
            "endor: starting (pid {})",
            std::process::id()
        );

        // Start supervisor routing with control message handler.
        let sup_for_control = Arc::clone(&self.supervisor);
        let spawn_sup = Arc::clone(&self.supervisor);
        let outbox_rx = self.outbox_rx.take().expect("serve() called twice");
        supervisor::start_routing(&self.supervisor, outbox_rx, move |msg| {
            handle_control_message(&sup_for_control, &spawn_sup, msg);
        });

        match ManagerMode::from_env() {
            ManagerMode::InProcessXs => {
                self.daemon_handle = inproc::spawn_inproc_xs_manager(
                    &self.supervisor,
                    Arc::clone(&self.shutdown_notify),
                    &self.paths,
                )?;
                eprintln!("endor: in-process XS manager started, waiting for socket");
            }
            ManagerMode::NodeChild => {
                self.spawn_node_daemon()?;
                eprintln!("endor: node daemon started, waiting for socket");
            }
        }

        // Wait for socket.
        wait_for_socket(&self.paths.sock_path, Duration::from_secs(10)).await?;

        eprintln!(
            "endor: ready (sock {})",
            self.paths.sock_path.display()
        );

        // Block until signal or manager exit.
        let shutdown = self.shutdown_notify.clone();
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = async {
                let mut sigterm = tokio::signal::unix::signal(
                    tokio::signal::unix::SignalKind::terminate()
                ).expect("failed to install SIGTERM handler");
                sigterm.recv().await;
            } => {}
            _ = shutdown.notified() => {}
        }

        Ok(())
    }

    /// Stop the daemon: cancel context, wait for supervisor, remove PID.
    pub async fn stop(&mut self) {
        self.supervisor.stop();
        match tokio::time::timeout(Duration::from_secs(5), self.supervisor.wait()).await {
            Ok(()) => {}
            Err(_) => {
                eprintln!("endor: supervisor wait timed out, forcing exit");
            }
        }
        pidfile::remove_pid(&self.paths.ephemeral_path);
    }

    fn spawn_node_daemon(&mut self) -> Result<(), EndoError> {
        let script_path = if !self.daemon_script_path.is_empty() {
            self.daemon_script_path.clone()
        } else {
            std::env::var("ENDO_DAEMON_PATH").map_err(|_| {
                EndoError::Config(
                    "ENDO_DAEMON_PATH not set and no daemon_script_path configured".to_string(),
                )
            })?
        };

        let args: Vec<String> = vec![
            script_path,
            self.paths.sock_path.to_string_lossy().to_string(),
            self.paths.state_path.to_string_lossy().to_string(),
            self.paths.ephemeral_path.to_string_lossy().to_string(),
            self.paths.cache_path.to_string_lossy().to_string(),
        ];

        let log_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.paths.log_path)?;

        let mut cmd = tokio::process::Command::new(&self.node_path);
        cmd.stdout(log_file.try_clone()?);
        cmd.stderr(log_file);

        let spawned = spawn_with_pipes(&self.node_path, &args, &mut cmd)?;

        let pid = spawned.child.id().unwrap_or(0);

        self.daemon_handle = self.supervisor.alloc_handle();
        let daemon_handle = self.daemon_handle;

        let info = WorkerInfo {
            handle: daemon_handle,
            cmd: self.node_path.clone(),
            args: args.clone(),
            pid,
            started: SystemTime::now(),
        };
        let inbox = self.supervisor.register(daemon_handle, Some(info));

        // The daemon exit triggers a full shutdown via the Notify.
        let shutdown_notify = Arc::clone(&self.shutdown_notify);
        let sup_for_exit = Arc::clone(&self.supervisor);
        let on_exit: Box<dyn FnOnce() + Send> = Box::new(move || {
            eprintln!("endor: node daemon exited");
            shutdown_notify.notify_one();
            sup_for_exit.stop();
        });

        wire_worker_tasks(spawned, daemon_handle, 0, &self.supervisor, inbox, Some(on_exit))?;

        Ok(())
    }
}

fn handle_control_message(sup: &Arc<Supervisor>, spawn_sup: &Arc<Supervisor>, msg: Message) {
    match msg.envelope.verb.as_str() {
        "ready" => {
            eprintln!("endor: daemon reports ready");
        }
        "listen" => {
            // Daemon requests socket listener.
            // Payload is JSON: {"path": "/path/to/sock"}
            let payload_str = std::str::from_utf8(&msg.envelope.payload).unwrap_or("{}");
            let sock_path = match serde_json::from_str::<serde_json::Value>(payload_str) {
                Ok(v) => v.get("path").and_then(|p| p.as_str()).unwrap_or("").to_string(),
                Err(_) => String::new(),
            };
            if sock_path.is_empty() {
                eprintln!("endor: listen request with empty path");
                return;
            }
            let daemon_handle = msg.from;
            match socket::start_socket_listener(
                Arc::clone(sup),
                daemon_handle,
                std::path::PathBuf::from(&sock_path),
            ) {
                Ok(()) => {
                    // Send listening acknowledgement.
                    sup.deliver(Message {
                        from: 0,
                        to: msg.from,
                        envelope: Envelope {
                            handle: 0,
                            verb: "listening".to_string(),
                            payload: Vec::new(),
                            nonce: msg.envelope.nonce,
                        },
                        response_tx: None,
                    });
                    eprintln!("endor: socket listener started at {sock_path}");
                }
                Err(e) => {
                    sup.deliver(Message {
                        from: 0,
                        to: msg.from,
                        envelope: Envelope {
                            handle: 0,
                            verb: "error".to_string(),
                            payload: format!("listen failed: {e}").into_bytes(),
                            nonce: msg.envelope.nonce,
                        },
                        response_tx: None,
                    });
                    eprintln!("endor: socket listener failed: {e}");
                }
            }
        }
        "spawn" => {
            match codec::decode_spawn_request(&msg.envelope.payload) {
                Ok((command, args)) => {
                    // Dispatch through the Engine enum. Today every
                    // spawn resolves to Engine::Process; a follow-up
                    // will teach the JS spawn payload to carry an
                    // `engine` field and add the in-process XS arm.
                    let engine = engine::engine_for_spawn_request(&command, &args, &msg);
                    let spawn_result = match engine {
                        Engine::Process { command, args } => {
                            crate::proc::spawn_process(spawn_sup, &command, &args, msg.from)
                        }
                        Engine::XsInProcess { .. } => {
                            // Scaffolding only — no call site yet.
                            Err(std::io::Error::new(
                                std::io::ErrorKind::Unsupported,
                                "in-process XS workers not yet wired up",
                            ))
                        }
                    };
                    match spawn_result {
                        Ok(worker_handle) => {
                            sup.set_parent(worker_handle, msg.from);
                            sup.deliver(Message {
                                from: 0,
                                to: msg.from,
                                envelope: Envelope {
                                    handle: 0,
                                    verb: "spawned".to_string(),
                                    payload: codec::encode_handle(worker_handle),
                                    nonce: msg.envelope.nonce,
                                },
                                response_tx: None,
                            });
                        }
                        Err(e) => {
                            sup.deliver(Message {
                                from: 0,
                                to: msg.from,
                                envelope: Envelope {
                                    handle: 0,
                                    verb: "error".to_string(),
                                    payload: e.to_string().into_bytes(),
                                    nonce: msg.envelope.nonce,
                                },
                                response_tx: None,
                            });
                        }
                    }
                }
                Err(e) => {
                    sup.deliver(Message {
                        from: 0,
                        to: msg.from,
                        envelope: Envelope {
                            handle: 0,
                            verb: "error".to_string(),
                            payload: format!("invalid spawn payload: {e}").into_bytes(),
                            nonce: msg.envelope.nonce,
                        },
                        response_tx: None,
                    });
                }
            }
        }
        "list" => {
            let workers = sup.workers_snapshot();
            sup.deliver(Message {
                from: 0,
                to: msg.from,
                envelope: Envelope {
                    handle: 0,
                    verb: "workers".to_string(),
                    payload: codec::encode_worker_list(&workers),
                    nonce: 0,
                },
                response_tx: None,
            });
        }
        other => {
            if crate::supervisor::is_debug_public() {
                eprintln!("endor: unhandled control verb: {other}");
            }
        }
    }
}

async fn wait_for_socket(sock_path: &std::path::Path, timeout: Duration) -> Result<(), EndoError> {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        if UnixStream::connect(sock_path).await.is_ok() {
            return Ok(());
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(EndoError::Timeout(format!(
                "socket {} not ready within {}s",
                sock_path.display(),
                timeout.as_secs()
            )));
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

fn find_node() -> String {
    if let Ok(p) = std::env::var("ENDO_NODE_PATH") {
        return p;
    }
    for candidate in &["node", "/usr/local/bin/node", "/usr/bin/node"] {
        if let Some(path) = which(candidate) {
            return path;
        }
    }
    "node".to_string()
}

fn which(name: &str) -> Option<String> {
    if name.contains('/') {
        if std::path::Path::new(name).exists() {
            return Some(name.to_string());
        }
        return None;
    }
    // Fall back to a default search path when $PATH is not set, matching
    // the behavior of Go's exec.LookPath (which uses confstr(_CS_PATH)).
    let default_path = "/usr/local/bin:/usr/bin:/bin";
    let path_var = std::env::var("PATH").unwrap_or_else(|_| default_path.to_string());
    for dir in path_var.split(':') {
        let candidate = format!("{dir}/{name}");
        if std::path::Path::new(&candidate).exists() {
            return Some(candidate);
        }
    }
    None
}

pub fn start_detached(executable: &str) -> Result<EndoPaths, EndoError> {
    let paths = resolve_paths()?;

    if let Ok(pid) = pidfile::read_pid(&paths.ephemeral_path) {
        if pid != 0 && pidfile::is_process_running(pid) {
            return Ok(paths);
        }
    }

    fs::create_dir_all(&paths.state_path)
        .map_err(|e| EndoError::Config(format!("mkdir state: {e}")))?;

    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&paths.log_path)?;

    let mut cmd = std::process::Command::new(executable);
    cmd.arg("daemon");
    cmd.stdout(log_file.try_clone()?);
    cmd.stderr(log_file);

    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }

    cmd.spawn()?;

    // Poll until socket is accepting connections.
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    while std::time::Instant::now() < deadline {
        if let Ok(conn) = std::os::unix::net::UnixStream::connect(&paths.sock_path) {
            let _ = conn.shutdown(std::net::Shutdown::Both);
            return Ok(paths);
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    Err(EndoError::Timeout(format!(
        "daemon did not start within 10s (log: {})",
        paths.log_path.display()
    )))
}

pub fn ensure_running() -> Result<EndoPaths, EndoError> {
    let paths = resolve_paths()?;
    let pid = pidfile::read_pid(&paths.ephemeral_path)?;
    if pid == 0 || !pidfile::is_process_running(pid) {
        return Err(EndoError::NotRunning);
    }
    Ok(paths)
}
