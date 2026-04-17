//! Peer engine descriptors.
//!
//! The `Engine` enum generalizes the "how do we run this peer?"
//! decision so `handle_control_message` can dispatch `spawn`
//! requests across transports without the JS side having to know.

use crate::types::Message;

/// How a new peer should be instantiated.
pub enum Engine {
    /// Child-process peer with fds 3/4 framing.
    /// Used for both "separate" (XS worker) and "node" platforms.
    Separate { platform: String, command: String, args: Vec<String> },
    /// In-process XS machine on a dedicated `std::thread` with a
    /// channel transport.
    Shared {
        bootstrap: &'static str,
        creation: &'static xsnap::ffi::XsCreation,
        label: &'static str,
    },
}

/// Choose an engine for a given `spawn` control message.
///
/// Dispatches based on the `platform` field from the spawn payload:
/// - `"separate"` or `""` → `Engine::Separate` (child process XS worker)
/// - `"shared"` → `Engine::Shared` (in-process XS worker)
/// - `"node"` → `Engine::Separate` (child process Node.js worker)
/// - unknown → `Err`
pub fn engine_for_spawn_request(
    platform: &str,
    command: &str,
    args: &[String],
    _msg: &Message,
) -> Result<Engine, String> {
    match platform {
        "separate" | "" => Ok(Engine::Separate {
            platform: "separate".to_string(),
            command: command.to_string(),
            args: args.to_vec(),
        }),
        "shared" => Ok(Engine::Shared {
            bootstrap: xsnap::WORKER_BOOTSTRAP,
            creation: &xsnap::WORKER_CREATION,
            label: "shared-worker",
        }),
        "node" => {
            if command.is_empty() {
                // The JS side must resolve the Node.js binary and send
                // it as command/args. If missing, error out.
                Err("node platform requires a command".to_string())
            } else {
                Ok(Engine::Separate {
                    platform: "node".to_string(),
                    command: command.to_string(),
                    args: args.to_vec(),
                })
            }
        }
        other => Err(format!("unknown platform: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Envelope, Message};

    fn test_msg() -> Message {
        Message {
            from: 1,
            to: 0,
            envelope: Envelope {
                handle: 0,
                verb: "spawn".to_string(),
                payload: Vec::new(),
                nonce: 0,
            },
            response_tx: None,
        }
    }

    #[test]
    fn separate_platform() {
        let msg = test_msg();
        let args = vec!["arg1".to_string()];
        let result = engine_for_spawn_request("separate", "/bin/worker", &args, &msg);
        match result {
            Ok(Engine::Separate { platform, command, args }) => {
                assert_eq!(platform, "separate");
                assert_eq!(command, "/bin/worker");
                assert_eq!(args, vec!["arg1"]);
            }
            _ => panic!("expected Separate"),
        }
    }

    #[test]
    fn empty_platform_defaults_to_separate() {
        let msg = test_msg();
        let result = engine_for_spawn_request("", "/bin/worker", &[], &msg);
        match result {
            Ok(Engine::Separate { platform, .. }) => assert_eq!(platform, "separate"),
            _ => panic!("expected Separate"),
        }
    }

    #[test]
    fn shared_platform() {
        let msg = test_msg();
        let result = engine_for_spawn_request("shared", "", &[], &msg);
        match result {
            Ok(Engine::Shared { .. }) => {}
            _ => panic!("expected Shared"),
        }
    }

    #[test]
    fn node_platform_with_command() {
        let msg = test_msg();
        let args = vec!["script.js".to_string()];
        let result = engine_for_spawn_request("node", "/usr/bin/node", &args, &msg);
        match result {
            Ok(Engine::Separate { platform, command, .. }) => {
                assert_eq!(platform, "node");
                assert_eq!(command, "/usr/bin/node");
            }
            _ => panic!("expected Separate"),
        }
    }

    #[test]
    fn node_platform_without_command() {
        let msg = test_msg();
        let result = engine_for_spawn_request("node", "", &[], &msg);
        assert!(result.is_err());
    }

    #[test]
    fn unknown_platform() {
        let msg = test_msg();
        let result = engine_for_spawn_request("wasm", "/bin/foo", &[], &msg);
        assert!(result.is_err());
    }
}
