use tokio::sync::mpsc;

use crate::types::Message;

/// Sender half of a worker's message queue. Cloneable, stored in the supervisor.
#[derive(Clone)]
pub struct Mailbox {
    tx: mpsc::UnboundedSender<Message>,
}

/// Receiver half of a worker's message queue. Owned by the worker's write task.
pub struct MailboxReceiver {
    rx: mpsc::UnboundedReceiver<Message>,
}

/// Create a linked mailbox sender/receiver pair.
pub fn mailbox() -> (Mailbox, MailboxReceiver) {
    let (tx, rx) = mpsc::unbounded_channel();
    (Mailbox { tx }, MailboxReceiver { rx })
}

impl Mailbox {
    /// Send a message. Non-blocking, unbounded.
    pub fn deliver(&self, msg: Message) {
        // Ignore send errors (receiver dropped = worker shutting down).
        let _ = self.tx.send(msg);
    }
}

impl MailboxReceiver {
    /// Wait for the next message. Returns None when all senders are dropped.
    pub async fn recv(&mut self) -> Option<Message> {
        self.rx.recv().await
    }

    /// Drain all currently buffered messages without blocking.
    /// Returns an empty vec if nothing is buffered.
    pub fn drain(&mut self) -> Vec<Message> {
        let mut msgs = Vec::new();
        loop {
            match self.rx.try_recv() {
                Ok(msg) => msgs.push(msg),
                Err(_) => break,
            }
        }
        msgs
    }
}
