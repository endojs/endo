use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};

use tokio::task::JoinHandle;

use crate::mailbox::{self, Mailbox, MailboxReceiver};
use crate::types::{Handle, Message, WorkerInfo};

/// State for a suspended worker.
///
/// The worker's XS machine has been dropped but its handle stays
/// registered.  On next inbound message, the supervisor restores
/// the machine from the snapshot.
pub struct SuspendedWorker {
    /// SHA-256 hex digest of the snapshot (CAS key).
    pub sha256: String,
    /// Path to the CAS directory containing the snapshot blob.
    pub cas_dir: std::path::PathBuf,
    /// Worker info (preserved for re-registration on resume).
    pub info: WorkerInfo,
}

pub struct Supervisor {
    inboxes: RwLock<HashMap<Handle, Mailbox>>,
    workers: RwLock<HashMap<Handle, WorkerInfo>>,
    parents: RwLock<HashMap<Handle, Handle>>,
    pending_syncs: Mutex<HashMap<(Handle, i64), Handle>>,
    /// Suspended workers keyed by handle.  The inbox is removed
    /// when the worker suspends; on resume, a new inbox is created.
    suspended: RwLock<HashMap<Handle, SuspendedWorker>>,
    outbox: Mutex<Option<Mailbox>>,
    next_handle: AtomicI64,
    done: Mutex<Option<JoinHandle<()>>>,
}

impl Supervisor {
    /// Create a new supervisor, returning it and the outbox receiver
    /// (which must be passed to `start_routing`).
    pub fn new() -> (Arc<Self>, MailboxReceiver) {
        let (outbox_tx, outbox_rx) = mailbox::mailbox();
        let sup = Arc::new(Supervisor {
            inboxes: RwLock::new(HashMap::new()),
            workers: RwLock::new(HashMap::new()),
            parents: RwLock::new(HashMap::new()),
            pending_syncs: Mutex::new(HashMap::new()),
            suspended: RwLock::new(HashMap::new()),
            outbox: Mutex::new(Some(outbox_tx)),
            next_handle: AtomicI64::new(1),
            done: Mutex::new(None),
        });
        (sup, outbox_rx)
    }

    pub fn alloc_handle(&self) -> Handle {
        self.next_handle.fetch_add(1, Ordering::SeqCst)
    }

    pub fn register(&self, h: Handle, info: Option<WorkerInfo>) -> MailboxReceiver {
        let (tx, rx) = mailbox::mailbox();
        self.inboxes.write().unwrap_or_else(|e| e.into_inner()).insert(h, tx);
        if let Some(info) = info {
            self.workers.write().unwrap_or_else(|e| e.into_inner()).insert(h, info);
        }
        rx
    }

    pub fn unregister(&self, h: Handle) {
        self.inboxes.write().unwrap_or_else(|e| e.into_inner()).remove(&h);
        self.workers.write().unwrap_or_else(|e| e.into_inner()).remove(&h);
        self.parents.write().unwrap_or_else(|e| e.into_inner()).remove(&h);
    }

    pub fn set_parent(&self, child: Handle, parent: Handle) {
        self.parents.write().unwrap_or_else(|e| e.into_inner()).insert(child, parent);
    }

    fn can_block(&self, caller: Handle, callee: Handle) -> bool {
        if callee == 0 {
            return true;
        }
        let parents = self.parents.read().unwrap_or_else(|e| e.into_inner());
        let mut current = caller;
        loop {
            match parents.get(&current) {
                Some(&p) => {
                    if p == callee {
                        return true;
                    }
                    if p == 0 {
                        return false;
                    }
                    current = p;
                }
                None => return false,
            }
        }
    }

    pub fn workers_write(&self) -> std::sync::RwLockWriteGuard<'_, HashMap<Handle, WorkerInfo>> {
        self.workers.write().unwrap_or_else(|e| e.into_inner())
    }

    pub fn workers_snapshot(&self) -> Vec<WorkerInfo> {
        let workers = self.workers.read().unwrap_or_else(|e| e.into_inner());
        workers
            .values()
            .map(|w| WorkerInfo {
                handle: w.handle,
                platform: w.platform.clone(),
                cmd: w.cmd.clone(),
                args: w.args.clone(),
                pid: w.pid,
                started: w.started,
            })
            .collect()
    }

    /// Mark a worker as suspended.
    ///
    /// Stores the snapshot, removes the inbox (the worker thread is
    /// about to exit), and preserves the worker info for re-registration.
    pub fn mark_suspended(
        &self,
        handle: Handle,
        sha256: String,
        cas_dir: std::path::PathBuf,
    ) {
        let info = {
            let workers = self.workers.read().unwrap_or_else(|e| e.into_inner());
            workers.get(&handle).cloned()
        };
        let info = info.unwrap_or(WorkerInfo {
            handle,
            platform: "separate".to_string(),
            cmd: "<suspended>".to_string(),
            args: Vec::new(),
            pid: 0,
            started: std::time::SystemTime::now(),
        });
        // Remove the inbox — the worker thread is exiting.
        self.inboxes.write().unwrap_or_else(|e| e.into_inner()).remove(&handle);
        self.workers.write().unwrap_or_else(|e| e.into_inner()).remove(&handle);
        self.suspended.write().unwrap_or_else(|e| e.into_inner()).insert(
            handle,
            SuspendedWorker {
                sha256,
                cas_dir,
                info,
            },
        );
    }

    /// Check if a handle is suspended.
    pub fn is_suspended(&self, handle: Handle) -> bool {
        self.suspended.read().unwrap_or_else(|e| e.into_inner()).contains_key(&handle)
    }

    /// Take the suspended worker data, removing it from the
    /// suspended set.  Returns `None` if the handle is not
    /// suspended.
    pub fn take_suspended(&self, handle: Handle) -> Option<SuspendedWorker> {
        self.suspended.write().unwrap_or_else(|e| e.into_inner()).remove(&handle)
    }

    pub fn deliver(&self, msg: Message) {
        if let Some(ref outbox) = *self.outbox.lock().unwrap_or_else(|e| e.into_inner()) {
            outbox.deliver(msg);
        }
    }

    pub fn stop(&self) {
        self.outbox.lock().unwrap_or_else(|e| e.into_inner()).take();
    }

    pub async fn wait(&self) {
        let handle = self.done.lock().unwrap_or_else(|e| e.into_inner()).take();
        if let Some(h) = handle {
            let _ = h.await;
        }
    }
}

/// Callbacks for the supervisor routing loop.
pub struct RoutingCallbacks {
    /// Called for control messages (handle 0).
    pub on_control: Box<dyn Fn(Message) + Send>,
    /// Called when a message arrives for a suspended worker.
    /// The callback should restore the worker and re-register
    /// its inbox, then deliver the message.
    pub on_resume: Box<dyn Fn(&Arc<Supervisor>, Handle, SuspendedWorker, Message) + Send>,
}

/// Start the supervisor routing loop as a tokio task.
pub fn start_routing(
    sup: &Arc<Supervisor>,
    mut outbox_rx: MailboxReceiver,
    callbacks: RoutingCallbacks,
) {
    let sup_clone = Arc::clone(sup);
    let handle = tokio::spawn(async move {
        loop {
            let msg = match outbox_rx.recv().await {
                Some(m) => m,
                None => break,
            };
            route_message(&sup_clone, msg, &callbacks);
            for msg in outbox_rx.drain() {
                route_message(&sup_clone, msg, &callbacks);
            }
        }
    });
    *sup.done.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle);
}

fn route_message(sup: &Arc<Supervisor>, msg: Message, callbacks: &RoutingCallbacks) {
    if is_debug() {
        eprintln!(
            "endor: route from={} to={} verb={} nonce={}",
            msg.from, msg.to, msg.envelope.verb, msg.envelope.nonce
        );
    }
    if msg.to == 0 {
        (callbacks.on_control)(msg);
        return;
    }

    // Check if the target is suspended — if so, trigger resume.
    if sup.is_suspended(msg.to) {
        if let Some(suspended) = sup.take_suspended(msg.to) {
            if is_debug() {
                eprintln!(
                    "endor: resuming suspended worker {} (sha256={})",
                    msg.to, suspended.sha256
                );
            }
            (callbacks.on_resume)(sup, msg.to, suspended, msg);
            return;
        }
    }

    if msg.envelope.nonce > 0 && msg.from != 0 {
        let is_response = {
            let mut pending = sup.pending_syncs.lock().unwrap_or_else(|e| e.into_inner());
            let key = (msg.to, msg.envelope.nonce);
            if pending.remove(&key).is_some() {
                true
            } else {
                if !sup.can_block(msg.from, msg.to) {
                    if is_debug() {
                        eprintln!(
                            "endor: sync call denied: {} -> {}",
                            msg.from, msg.to
                        );
                    }
                    return;
                }
                pending.insert((msg.from, msg.envelope.nonce), msg.to);
                false
            }
        };
        let _ = is_response;
    }
    let inboxes = sup.inboxes.read().unwrap_or_else(|e| e.into_inner());
    if let Some(inbox) = inboxes.get(&msg.to) {
        inbox.deliver(msg);
    } else if is_debug() {
        eprintln!("endor: no inbox for handle {}", msg.to);
    }
}

fn is_debug() -> bool {
    static ENDO_TRACE: OnceLock<bool> = OnceLock::new();
    *ENDO_TRACE.get_or_init(|| std::env::var("ENDO_TRACE").is_ok())
}

pub fn is_debug_public() -> bool {
    is_debug()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::SystemTime;

    #[test]
    fn suspend_resume_preserves_platform() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        rt.block_on(async {
            let (sup, _outbox_rx) = Supervisor::new();
            let handle = sup.alloc_handle();
            let info = WorkerInfo {
                handle,
                platform: "shared".to_string(),
                cmd: "<in-process>".to_string(),
                args: Vec::new(),
                pid: 42,
                started: SystemTime::now(),
            };
            let _inbox = sup.register(handle, Some(info));

            // Mark suspended.
            sup.mark_suspended(
                handle,
                "abc123".to_string(),
                std::path::PathBuf::from("/tmp/cas"),
            );
            assert!(sup.is_suspended(handle));

            // Take suspended and verify platform preserved.
            let suspended = sup.take_suspended(handle).unwrap();
            assert_eq!(suspended.info.platform, "shared");
            assert_eq!(suspended.sha256, "abc123");
            assert!(!sup.is_suspended(handle));
        });
    }

    #[test]
    fn suspend_fallback_defaults_to_separate() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        rt.block_on(async {
            let (sup, _outbox_rx) = Supervisor::new();
            let handle = sup.alloc_handle();
            // Register without WorkerInfo.
            let _inbox = sup.register(handle, None);

            sup.mark_suspended(
                handle,
                "def456".to_string(),
                std::path::PathBuf::from("/tmp/cas"),
            );

            let suspended = sup.take_suspended(handle).unwrap();
            assert_eq!(suspended.info.platform, "separate");
        });
    }
}
