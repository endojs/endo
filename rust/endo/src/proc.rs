use std::fs::File;
use std::io;
use std::os::fd::AsRawFd;
use std::sync::Arc;
use std::time::SystemTime;

use tokio::io::unix::AsyncFd;

use crate::codec;
use crate::mailbox::MailboxReceiver;
use crate::supervisor::Supervisor;
use crate::types::{Envelope, Handle, Message, WorkerInfo};
use crate::util;

/// State produced by `spawn_with_pipes`.
pub struct SpawnedWorker {
    pub child: tokio::process::Child,
    pub read_file: File,
    pub write_file: File,
}

/// Spawn a child process with fd 3 (child writes) and fd 4 (child reads) pipes.
pub fn spawn_with_pipes(command: &str, args: &[String], cmd: &mut tokio::process::Command) -> io::Result<SpawnedWorker> {
    let (child_write_r, child_write_w) = util::pipe()?;
    let (sup_write_r, sup_write_w) = util::pipe()?;

    let child_write_w_raw = child_write_w.as_raw_fd();
    let sup_write_r_raw = sup_write_r.as_raw_fd();

    cmd.args(args);
    unsafe {
        cmd.pre_exec(move || {
            if libc::dup2(child_write_w_raw, 3) < 0 {
                return Err(io::Error::last_os_error());
            }
            if libc::dup2(sup_write_r_raw, 4) < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        });
    }

    let child = cmd.spawn()?;

    drop(child_write_w);
    drop(sup_write_r);

    let read_file = File::from(child_write_r);
    let write_file = File::from(sup_write_w);

    let _ = command;

    Ok(SpawnedWorker {
        child,
        read_file,
        write_file,
    })
}

/// Wire up async read/write/wait tasks for a spawned worker.
pub fn wire_worker_tasks(
    spawned: SpawnedWorker,
    handle: Handle,
    parent_handle: Handle,
    sup: &Arc<Supervisor>,
    mut inbox: MailboxReceiver,
    on_exit: Option<Box<dyn FnOnce() + Send>>,
    init_verb: &str,
    init_payload: Vec<u8>,
) -> io::Result<()> {
    let SpawnedWorker {
        child,
        read_file,
        write_file,
    } = spawned;

    // Set pipe fds to non-blocking for AsyncFd.
    util::set_nonblocking(&read_file)?;
    util::set_nonblocking(&write_file)?;

    // Send init envelope. The pipe is empty and has kernel buffer space,
    // so this non-blocking write will succeed immediately. The handle
    // field carries the parent (requester) handle so the worker knows
    // where to address its outbound messages.
    let init_data = codec::encode_envelope(&Envelope {
        handle: parent_handle,
        verb: init_verb.to_string(),
        payload: init_payload,
        nonce: 0,
    });
    {
        let mut header = Vec::new();
        // Manually build the frame bytes so we can do a single write.
        codec::write_frame(&mut header, &init_data)?;
        let raw_fd = write_file.as_raw_fd();
        let mut offset = 0;
        while offset < header.len() {
            let n = unsafe {
                libc::write(
                    raw_fd,
                    header[offset..].as_ptr() as *const libc::c_void,
                    header.len() - offset,
                )
            };
            if n < 0 {
                return Err(io::Error::last_os_error());
            }
            offset += n as usize;
        }
    }

    let async_read = AsyncFd::new(read_file)?;
    let async_write = AsyncFd::new(write_file)?;

    // Read task: child -> supervisor.
    let sup_read = Arc::clone(sup);
    tokio::spawn(async move {
        let mut reader = PipeReader(async_read);
        loop {
            match codec::async_read_frame(&mut reader).await {
                Ok(Some(data)) => match codec::decode_envelope(&data) {
                    Ok(env) => {
                        let to = env.handle;
                        sup_read.deliver(Message {
                            from: handle,
                            to,
                            envelope: env,
                            response_tx: None,
                        });
                    }
                    Err(e) => eprintln!("worker {handle} decode: {e}"),
                },
                Ok(None) => return,
                Err(e) => {
                    if e.kind() != io::ErrorKind::UnexpectedEof {
                        eprintln!("worker {handle} read: {e}");
                    }
                    return;
                }
            }
        }
    });

    // Write task: supervisor -> child.
    tokio::spawn(async move {
        let mut writer = PipeWriter(async_write);
        loop {
            match inbox.recv().await {
                Some(msg) => {
                    if let Err(e) = write_message(&mut writer, handle, msg).await {
                        eprintln!("worker {handle} write: {e}");
                        return;
                    }
                    for msg in inbox.drain() {
                        if let Err(e) = write_message(&mut writer, handle, msg).await {
                            eprintln!("worker {handle} write: {e}");
                            return;
                        }
                    }
                }
                None => return,
            }
        }
    });

    // Wait task: child exit notification.
    let sup_wait = Arc::clone(sup);
    tokio::spawn(async move {
        let mut child = child;
        eprintln!("endor: wait task for handle={handle} started");
        let status = child.wait().await;
        eprintln!("endor: wait task for handle={handle} child exited: {status:?}, delivering to parent={parent_handle}");
        sup_wait.deliver(Message {
            from: handle,
            to: parent_handle,
            envelope: Envelope {
                handle,
                verb: "exited".to_string(),
                payload: Vec::new(),
                nonce: 0,
            },
            response_tx: None,
        });
        eprintln!("endor: wait task for handle={handle} delivered exited to parent={parent_handle}");
        sup_wait.unregister(handle);
        if let Some(f) = on_exit {
            f();
        }
    });

    Ok(())
}

async fn write_message(writer: &mut PipeWriter, _handle: Handle, msg: Message) -> io::Result<()> {
    let mut env = msg.envelope;
    if env.verb != "init" {
        env.handle = msg.from;
    }
    let data = codec::encode_envelope(&env);
    codec::async_write_frame(writer, &data).await?;
    if let Some(tx) = msg.response_tx {
        let _ = tx.send(Envelope {
            handle: 0,
            verb: "ack".to_string(),
            payload: Vec::new(),
            nonce: 0,
        });
    }
    Ok(())
}

/// Spawn a worker subprocess with pipes on fd 3/4.
pub fn spawn_process(
    sup: &Arc<Supervisor>,
    platform: &str,
    command: &str,
    args: &[String],
    parent_handle: Handle,
) -> io::Result<Handle> {
    let handle = sup.alloc_handle();

    let mut cmd = tokio::process::Command::new(command);
    let spawned = spawn_with_pipes(command, args, &mut cmd)?;

    let pid = spawned.child.id().unwrap_or(0);

    let info = WorkerInfo {
        handle,
        platform: platform.to_string(),
        cmd: command.to_string(),
        args: args.to_vec(),
        pid,
        started: SystemTime::now(),
    };
    let inbox = sup.register(handle, Some(info));

    wire_worker_tasks(spawned, handle, parent_handle, sup, inbox, None, "init", Vec::new())?;

    Ok(handle)
}

// ---------------------------------------------------------------------------
// AsyncFd-based pipe adapters
// ---------------------------------------------------------------------------

/// Async reader for a pipe fd, using readiness-based IO.
struct PipeReader(AsyncFd<File>);

impl tokio::io::AsyncRead for PipeReader {
    fn poll_read(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<io::Result<()>> {
        loop {
            let mut guard = match self.0.poll_read_ready(cx) {
                std::task::Poll::Ready(Ok(g)) => g,
                std::task::Poll::Ready(Err(e)) => return std::task::Poll::Ready(Err(e)),
                std::task::Poll::Pending => return std::task::Poll::Pending,
            };

            let raw_fd = self.0.get_ref().as_raw_fd();
            let unfilled = buf.initialize_unfilled();
            match guard.try_io(|_| {
                let n = unsafe {
                    libc::read(raw_fd, unfilled.as_mut_ptr() as *mut libc::c_void, unfilled.len())
                };
                if n < 0 {
                    Err(io::Error::last_os_error())
                } else {
                    Ok(n as usize)
                }
            }) {
                Ok(Ok(n)) => {
                    buf.advance(n);
                    return std::task::Poll::Ready(Ok(()));
                }
                Ok(Err(e)) => return std::task::Poll::Ready(Err(e)),
                Err(_would_block) => continue,
            }
        }
    }
}

/// Async writer for a pipe fd, using readiness-based IO.
struct PipeWriter(AsyncFd<File>);

impl tokio::io::AsyncWrite for PipeWriter {
    fn poll_write(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<io::Result<usize>> {
        loop {
            let mut guard = match self.0.poll_write_ready(cx) {
                std::task::Poll::Ready(Ok(g)) => g,
                std::task::Poll::Ready(Err(e)) => return std::task::Poll::Ready(Err(e)),
                std::task::Poll::Pending => return std::task::Poll::Pending,
            };

            let raw_fd = self.0.get_ref().as_raw_fd();
            match guard.try_io(|_| {
                let n = unsafe {
                    libc::write(raw_fd, buf.as_ptr() as *const libc::c_void, buf.len())
                };
                if n < 0 {
                    Err(io::Error::last_os_error())
                } else {
                    Ok(n as usize)
                }
            }) {
                Ok(Ok(n)) => return std::task::Poll::Ready(Ok(n)),
                Ok(Err(e)) => return std::task::Poll::Ready(Err(e)),
                Err(_would_block) => continue,
            }
        }
    }

    fn poll_flush(
        self: std::pin::Pin<&mut Self>,
        _cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<io::Result<()>> {
        std::task::Poll::Ready(Ok(()))
    }

    fn poll_shutdown(
        self: std::pin::Pin<&mut Self>,
        _cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<io::Result<()>> {
        std::task::Poll::Ready(Ok(()))
    }
}
