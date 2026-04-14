use std::time::SystemTime;

use tokio::sync::oneshot;

pub type Handle = i64;

pub struct Envelope {
    pub handle: Handle,
    pub verb: String,
    pub payload: Vec<u8>,
    pub nonce: i64,
}

pub struct Message {
    pub from: Handle,
    pub to: Handle,
    pub envelope: Envelope,
    pub response_tx: Option<oneshot::Sender<Envelope>>,
}

pub struct WorkerInfo {
    pub handle: Handle,
    pub cmd: String,
    pub args: Vec<String>,
    pub pid: u32,
    pub started: SystemTime,
}
