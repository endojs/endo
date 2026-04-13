//! Peer engine descriptors.
//!
//! The `Engine` enum generalizes the "how do we run this peer?"
//! decision so `handle_control_message` can dispatch `spawn`
//! requests across transports without the JS side having to know.
//! Today the only active variant is `Process`; the in-process XS
//! variant is scaffolding for a future iteration that teaches the
//! manager JS spawn payload to carry an `engine` field.

use crate::types::{Handle, Message};

/// How a new peer should be instantiated.
#[allow(dead_code)]
pub enum Engine {
    /// Classic child-process peer with fds 3/4 framing.
    Process { command: String, args: Vec<String> },
    /// In-process XS machine on a dedicated `std::thread` with a
    /// channel transport. Not yet reachable from any call site.
    XsInProcess {
        bootstrap: &'static str,
        creation: &'static xsnap::ffi::XsCreation,
        label: &'static str,
    },
    // Wasm { module_bytes: Vec<u8> } — future.
}

/// Choose an engine for a given `spawn` control message.
///
/// Today every `spawn` request resolves to `Engine::Process`. A
/// follow-up will teach the manager JS payload to carry an
/// `engine` field and switch to the XS in-process variant for
/// selected peers.
pub fn engine_for_spawn_request(command: &str, args: &[String], _msg: &Message) -> Engine {
    Engine::Process {
        command: command.to_string(),
        args: args.to_vec(),
    }
}

#[allow(dead_code)]
pub fn parent_handle_of(msg: &Message) -> Handle {
    msg.from
}
