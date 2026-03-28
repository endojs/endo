// Endo OS — seL4 Microkit Protection Domain
//
// This is PID 1 on the verified kernel.  It initializes QuickJS,
// applies SES lockdown, and runs the Endo bootstrap.
//
// The Microkit runtime provides three entry points:
//   init()            — called once at boot
//   notified(channel) — called when a notification arrives
//   protected(channel, msg) — called for protected procedure calls
//
// In later phases, device drivers run in separate PDs and
// communicate via channels.  The channel ID IS the capability
// — mediated by the formally verified seL4 kernel.

#![no_std]
#![no_main]

extern crate alloc;

use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;
use sel4_microkit::{
    debug_println, protection_domain, Channel, Handler, MessageInfo,
};

mod js_runtime;

/// The Microkit handler for the Endo daemon PD.
struct EndoHandler {
    js: js_runtime::JsEngine,
}

impl Handler for EndoHandler {
    type Error = sel4_microkit::Infallible;

    /// Called once when the system boots.
    fn init(&mut self) -> Result<(), Self::Error> {
        debug_println!("endo-init: Endo OS starting (seL4 Microkit)");
        debug_println!("endo-init: Formally verified capability-native OS");

        // Initialize the QuickJS engine and run bootstrap.
        match self.js.boot() {
            Ok(()) => {
                debug_println!("endo-init: Bootstrap complete");
            }
            Err(e) => {
                debug_println!("endo-init: Bootstrap FAILED: {}", e);
            }
        }

        Ok(())
    }

    /// Called when a notification arrives on a channel.
    /// In later phases, this dispatches device I/O completions.
    fn notified(&mut self, channel: Channel) -> Result<(), Self::Error> {
        debug_println!(
            "endo-init: Notification on channel {}",
            channel.index()
        );

        // Phase 1+: dispatch to device driver handlers
        // match channel.index() {
        //     DISK_CHANNEL => self.js.on_disk_event(),
        //     NET_CHANNEL  => self.js.on_net_event(),
        //     _ => {}
        // }

        Ok(())
    }

    /// Called for protected procedure calls from other PDs.
    /// This is the seL4-native equivalent of CapTP — a PD
    /// invokes a capability and the handler runs here.
    fn protected(
        &mut self,
        channel: Channel,
        msg: MessageInfo,
    ) -> Result<MessageInfo, Self::Error> {
        debug_println!(
            "endo-init: Protected call on channel {} (label={})",
            channel.index(),
            msg.label()
        );

        // Phase 2+: dispatch capability invocations
        Ok(MessageInfo::new(0, 0))
    }
}

#[protection_domain]
fn pd_main() -> impl Handler {
    debug_println!("endo-init: Protection domain starting");

    EndoHandler {
        js: js_runtime::JsEngine::new(),
    }
}
