use std::fs::{self, OpenOptions};
use std::os::unix::process::CommandExt;
use std::sync::Arc;
use std::time::Duration;
use std::time::SystemTime;

use tokio::net::UnixStream;
use tokio::sync::Notify;

use crate::cas::ContentStore;
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
        let resume_sup = Arc::clone(&self.supervisor);
        let cas_dir = self.paths.state_path.join("store-sha256");
        let cas = Arc::new(
            ContentStore::open(&cas_dir)
                .map_err(|e| EndoError::Config(format!("CAS open: {e}")))?,
        );
        let cas_for_control = Arc::clone(&cas);
        let cas_dir_for_resume = cas_dir;
        let outbox_rx = self.outbox_rx.take().expect("serve() called twice");
        supervisor::start_routing(
            &self.supervisor,
            outbox_rx,
            supervisor::RoutingCallbacks {
                on_control: Box::new(move |msg| {
                    handle_control_message(&sup_for_control, &spawn_sup, &cas_for_control, msg);
                }),
                on_resume: Box::new(move |sup, handle, suspended, pending_msg| {
                    handle_resume(&resume_sup, sup, handle, suspended, &cas_dir_for_resume, pending_msg);
                }),
            },
        );

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
            platform: "node".to_string(),
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

        wire_worker_tasks(spawned, daemon_handle, 0, &self.supervisor, inbox, Some(on_exit), "init", Vec::new())?;

        Ok(())
    }
}

/// Send a meter-config envelope to a worker.
fn send_meter_config(sup: &Arc<Supervisor>, target: Handle, hard_limit: u64) {
    sup.deliver(Message {
        from: 0,
        to: target,
        envelope: Envelope {
            handle: 0,
            verb: "meter-config".to_string(),
            payload: codec::encode_meter_config(hard_limit),
            nonce: 0,
        },
        response_tx: None,
    });
}

fn handle_control_message(sup: &Arc<Supervisor>, spawn_sup: &Arc<Supervisor>, cas: &Arc<ContentStore>, msg: Message) {
    let cas_dir = cas.dir();
    match msg.envelope.verb.as_str() {
        "ready" => {
            eprintln!("endor: daemon reports ready");
        }
        "listen-path" => {
            // Daemon requests socket listener on a Unix path.
            // Payload is CBOR map: {"path": "/path/to/sock"}
            let sock_path = match codec::decode_listen_path_request(&msg.envelope.payload) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("endor: listen request decode error: {e}");
                    return;
                }
            };
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
                            verb: "listening-path".to_string(),
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
                Ok((platform, command, args)) => {
                    let engine = engine::engine_for_spawn_request(&platform, &command, &args, &msg);
                    let spawn_result = match engine {
                        Ok(Engine::Separate { platform, command, args }) => {
                            crate::proc::spawn_process(spawn_sup, &platform, &command, &args, msg.from)
                        }
                        Ok(Engine::Shared { .. }) => {
                            crate::inproc::spawn_shared_worker(spawn_sup, msg.from)
                        }
                        Err(e) => {
                            Err(std::io::Error::new(
                                std::io::ErrorKind::InvalidInput,
                                e,
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
        "suspend" => {
            // Payload: CBOR map {"handle": <worker_handle>}
            let target_handle = match codec::decode_suspend_request(&msg.envelope.payload) {
                Ok(h) => h,
                Err(e) => {
                    sup.deliver(Message {
                        from: 0,
                        to: msg.from,
                        envelope: Envelope {
                            handle: 0,
                            verb: "error".to_string(),
                            payload: format!("suspend: {e}").into_bytes(),
                            nonce: msg.envelope.nonce,
                        },
                        response_tx: None,
                    });
                    return;
                }
            };
            // Forward "suspend" to the target worker with CAS dir
            // path as payload — the worker streams the snapshot
            // directly to the CAS.
            sup.deliver(Message {
                from: 0,
                to: target_handle,
                envelope: Envelope {
                    handle: 0,
                    verb: "suspend".to_string(),
                    payload: cas_dir.to_string_lossy().into_owned().into_bytes(),
                    nonce: msg.envelope.nonce,
                },
                response_tx: None,
            });
        }
        "suspended" => {
            // Worker streamed the snapshot to CAS and sent back
            // the SHA-256 hash.
            let worker_handle = msg.from;
            let sha256 = String::from_utf8_lossy(&msg.envelope.payload).into_owned();
            eprintln!(
                "endor: worker {} suspended (sha256={})",
                worker_handle,
                &sha256[..sha256.len().min(16)]
            );
            sup.mark_suspended(worker_handle, sha256, cas_dir.to_path_buf());
        }
        "meter-report" => {
            // Worker reports steps consumed after a crank.
            if let Ok((handle, steps, outcome)) =
                codec::decode_meter_report(&msg.envelope.payload)
            {
                sup.process_meter_report(handle, steps, &outcome);
            }
        }
        "meter-query" => {
            if let Ok(target) = codec::decode_handle_request(&msg.envelope.payload) {
                let state = sup.meter_state(target);
                let payload = codec::encode_meter_query_response(target, state.as_ref());
                sup.deliver(Message {
                    from: 0,
                    to: msg.from,
                    envelope: Envelope {
                        handle: 0,
                        verb: "meter-state".to_string(),
                        payload,
                        nonce: msg.envelope.nonce,
                    },
                    response_tx: None,
                });
            }
        }
        "meter-reset" => {
            if let Ok(target) = codec::decode_handle_request(&msg.envelope.payload) {
                sup.meter_reset(target);
                sup.deliver(Message {
                    from: 0,
                    to: msg.from,
                    envelope: Envelope {
                        handle: 0,
                        verb: "meter-reset-ack".to_string(),
                        payload: codec::encode_handle(target),
                        nonce: msg.envelope.nonce,
                    },
                    response_tx: None,
                });
            }
        }
        "meter-set-quota" => {
            if let Ok((target, hard_limit, budget)) =
                codec::decode_meter_set_quota(&msg.envelope.payload)
            {
                sup.set_meter_quota(target, hard_limit, budget);
                // Send meter-config to the worker so it knows the
                // hard limit for its metering callback.
                send_meter_config(sup, target, hard_limit);
            }
        }
        "meter-set-rate" => {
            if let Ok((target, hard_limit, rate, burst)) =
                codec::decode_meter_set_rate(&msg.envelope.payload)
            {
                sup.set_meter_rate(target, hard_limit, rate, burst);
                send_meter_config(sup, target, hard_limit);
            }
        }
        "meter-refill" => {
            if let Ok((target, amount)) =
                codec::decode_meter_refill(&msg.envelope.payload)
            {
                let new_budget = sup.meter_refill(target, amount);
                sup.deliver(Message {
                    from: 0,
                    to: msg.from,
                    envelope: Envelope {
                        handle: 0,
                        verb: "meter-refill-ack".to_string(),
                        payload: codec::encode_meter_refill_response(target, new_budget),
                        nonce: msg.envelope.nonce,
                    },
                    response_tx: None,
                });
            }
        }
        "cas-store" => {
            match codec::decode_cas_store(&msg.envelope.payload) {
                Ok((data, content_type)) => {
                    match cas.store(&data, &content_type) {
                        Ok(hash) => {
                            sup.deliver(Message {
                                from: 0,
                                to: msg.from,
                                envelope: Envelope {
                                    handle: 0,
                                    verb: "cas-stored".to_string(),
                                    payload: codec::encode_cas_stored(&hash),
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
                                    payload: format!("cas-store: {e}").into_bytes(),
                                    nonce: msg.envelope.nonce,
                                },
                                response_tx: None,
                            });
                        }
                    }
                }
                Err(e) => {
                    eprintln!("endor: cas-store decode error: {e}");
                }
            }
        }
        "cas-fetch" => {
            match codec::decode_cas_hash_request(&msg.envelope.payload) {
                Ok(hash) => {
                    match cas.fetch(&hash) {
                        Ok(data) => {
                            sup.deliver(Message {
                                from: 0,
                                to: msg.from,
                                envelope: Envelope {
                                    handle: 0,
                                    verb: "cas-content".to_string(),
                                    payload: codec::encode_cas_content(&data),
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
                                    payload: format!("cas-fetch: {e}").into_bytes(),
                                    nonce: msg.envelope.nonce,
                                },
                                response_tx: None,
                            });
                        }
                    }
                }
                Err(e) => {
                    eprintln!("endor: cas-fetch decode error: {e}");
                }
            }
        }
        "cas-has" => {
            if let Ok(hash) = codec::decode_cas_hash_request(&msg.envelope.payload) {
                let exists = cas.has(&hash);
                sup.deliver(Message {
                    from: 0,
                    to: msg.from,
                    envelope: Envelope {
                        handle: 0,
                        verb: "cas-exists".to_string(),
                        payload: codec::encode_cas_exists(exists),
                        nonce: msg.envelope.nonce,
                    },
                    response_tx: None,
                });
            }
        }
        "cas-retain" => {
            if let Ok(hash) = codec::decode_cas_hash_request(&msg.envelope.payload) {
                cas.retain(&hash);
            }
        }
        "cas-release" => {
            if let Ok(hash) = codec::decode_cas_hash_request(&msg.envelope.payload) {
                cas.release(&hash);
            }
        }
        "cas-gc" => {
            // Run GC with live roots from the payload (if any).
            let live_roots = std::collections::HashSet::new();
            match cas.gc(&live_roots) {
                Ok(report) => {
                    eprintln!(
                        "endor: GC freed {} entries ({} bytes)",
                        report.freed_count, report.freed_bytes
                    );
                    sup.deliver(Message {
                        from: 0,
                        to: msg.from,
                        envelope: Envelope {
                            handle: 0,
                            verb: "cas-gc-done".to_string(),
                            payload: codec::encode_gc_report(report.freed_count, report.freed_bytes),
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
                            payload: format!("cas-gc: {e}").into_bytes(),
                            nonce: msg.envelope.nonce,
                        },
                        response_tx: None,
                    });
                }
            }
        }
        "cas-store-tree" => {
            // Payload is the tree JSON directly as bytes.
            match cas.store_tree(&msg.envelope.payload) {
                Ok(hash) => {
                    sup.deliver(Message {
                        from: 0,
                        to: msg.from,
                        envelope: Envelope {
                            handle: 0,
                            verb: "cas-stored".to_string(),
                            payload: codec::encode_cas_stored(&hash),
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
                            payload: format!("cas-store-tree: {e}").into_bytes(),
                            nonce: msg.envelope.nonce,
                        },
                        response_tx: None,
                    });
                }
            }
        }
        other => {
            if crate::supervisor::is_debug_public() {
                eprintln!("endor: unhandled control verb: {other}");
            }
        }
    }
}

/// Resume a suspended worker, dispatching based on platform.
///
/// - `"shared"` or `""` → in-process XS via channel transport
/// - `"separate"`, `"node"`, or other → child process via pipes
fn handle_resume(
    _resume_sup: &Arc<Supervisor>,
    sup: &Arc<Supervisor>,
    handle: Handle,
    suspended: supervisor::SuspendedWorker,
    _cas_dir: &std::path::Path,
    pending_msg: Message,
) {
    let cas_file_path = suspended.cas_dir.join(&suspended.sha256);
    let info = suspended.info;

    // Restore meter state from before suspend.
    if let Some(meter) = suspended.meter {
        sup.restore_meter(handle, meter);
    }

    match info.platform.as_str() {
        "shared" | "" => resume_shared(sup, handle, info, cas_file_path, pending_msg),
        _ => resume_process(sup, handle, info, cas_file_path, pending_msg),
    }
}

/// Resume a shared (in-process XS) worker via channel transport.
fn resume_shared(
    sup: &Arc<Supervisor>,
    handle: Handle,
    info: WorkerInfo,
    cas_file_path: std::path::PathBuf,
    pending_msg: Message,
) {
    // Re-register the handle with a fresh inbox.
    let mut inbox = sup.register(
        handle,
        Some(WorkerInfo {
            handle,
            platform: info.platform.clone(),
            cmd: info.cmd,
            args: info.args,
            pid: std::process::id(),
            started: SystemTime::now(),
        }),
    );

    // Build channels for the restored worker.
    let (sup_to_machine_tx, sup_to_machine_rx) = std::sync::mpsc::channel::<Vec<u8>>();
    let (machine_to_sup_tx, machine_to_sup_rx) = std::sync::mpsc::channel::<Vec<u8>>();

    // Pre-seed with "restore" init carrying the CAS file path
    // (not the snapshot bytes — the worker streams from disk).
    let parent_handle: Handle = 0;
    let init_bytes = codec::encode_envelope(&Envelope {
        handle: parent_handle,
        verb: "restore".to_string(),
        payload: cas_file_path.to_string_lossy().into_owned().into_bytes(),
        nonce: 0,
    });
    if sup_to_machine_tx.send(init_bytes).is_err() {
        eprintln!("endor: resume: failed to send restore init");
        return;
    }

    // Send the pending message that triggered the resume.
    {
        let mut env = pending_msg.envelope;
        if env.verb != "init" {
            env.handle = pending_msg.from;
        }
        let bytes = codec::encode_envelope(&env);
        if sup_to_machine_tx.send(bytes).is_err() {
            eprintln!("endor: resume: failed to send pending message");
            return;
        }
    }

    // Inbound bridge: supervisor inbox → machine channel.
    let sup_to_machine_tx_bridge = sup_to_machine_tx;
    tokio::spawn(async move {
        loop {
            match inbox.recv().await {
                Some(msg) => {
                    let mut env = msg.envelope;
                    if env.verb != "init" {
                        env.handle = msg.from;
                    }
                    let bytes = codec::encode_envelope(&env);
                    if sup_to_machine_tx_bridge.send(bytes).is_err() {
                        return;
                    }
                    for msg in inbox.drain() {
                        let mut env = msg.envelope;
                        if env.verb != "init" {
                            env.handle = msg.from;
                        }
                        let bytes = codec::encode_envelope(&env);
                        if sup_to_machine_tx_bridge.send(bytes).is_err() {
                            return;
                        }
                    }
                }
                None => return,
            }
        }
    });

    // Outbound bridge: machine → supervisor.
    let sup_outbound = Arc::clone(sup);
    tokio::task::spawn_blocking(move || {
        loop {
            match machine_to_sup_rx.recv() {
                Ok(bytes) => match codec::decode_envelope(&bytes) {
                    Ok(env) => {
                        let to = env.handle;
                        sup_outbound.deliver(Message {
                            from: handle,
                            to,
                            envelope: env,
                            response_tx: None,
                        });
                    }
                    Err(e) => {
                        eprintln!("endor: resume decode error: {e}");
                    }
                },
                Err(_) => return,
            }
        }
    });

    // Spawn the machine thread.
    let sup_for_exit = Arc::clone(sup);
    let thread_builder = std::thread::Builder::new()
        .name(format!("resumed-worker-{handle}"))
        .stack_size(32 * 1024 * 1024);
    let _ = thread_builder.spawn(move || {
        let transport: Box<dyn xsnap::worker_io::WorkerTransport> =
            Box::new(xsnap::worker_io::ChannelTransport::new(
                sup_to_machine_rx,
                machine_to_sup_tx,
            ));
        let result = xsnap::run_xs_worker_inproc(transport);
        if let Err(e) = result {
            eprintln!("endor: resumed worker {handle} exited with error: {e}");
        } else {
            eprintln!("endor: resumed worker {handle} exited cleanly");
        }
        sup_for_exit.unregister(handle);
    });
}

/// Resume a process-based worker (separate or node) by re-spawning
/// the child process with a "restore" init envelope.
fn resume_process(
    sup: &Arc<Supervisor>,
    handle: Handle,
    info: WorkerInfo,
    cas_file_path: std::path::PathBuf,
    pending_msg: Message,
) {
    let platform = info.platform.clone();
    let command = info.cmd;
    let args = info.args;

    // Re-register the handle with a fresh inbox.
    let inbox = sup.register(
        handle,
        Some(WorkerInfo {
            handle,
            platform: platform.clone(),
            cmd: command.clone(),
            args: args.clone(),
            pid: 0, // updated after spawn
            started: SystemTime::now(),
        }),
    );

    let mut cmd = tokio::process::Command::new(&command);
    let spawned = match spawn_with_pipes(&command, &args, &mut cmd) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("endor: resume_process: spawn failed: {e}");
            sup.unregister(handle);
            return;
        }
    };

    let pid = spawned.child.id().unwrap_or(0);
    // Update the WorkerInfo with the actual pid.
    {
        let mut workers = sup.workers_write();
        if let Some(w) = workers.get_mut(&handle) {
            w.pid = pid;
        }
    }

    let restore_payload = cas_file_path.to_string_lossy().into_owned().into_bytes();

    // Wire up with "restore" verb so the worker loads from snapshot.
    if let Err(e) = wire_worker_tasks(
        spawned,
        handle,
        pending_msg.from,
        sup,
        inbox,
        None,
        "restore",
        restore_payload,
    ) {
        eprintln!("endor: resume_process: wire_worker_tasks failed: {e}");
        sup.unregister(handle);
        return;
    }

    // Deliver the pending message that triggered resume.
    sup.deliver(pending_msg);
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
