// endo-init: PID 1 for Endo OS
//
// Embeds V8 via deno_core, applies SES lockdown, probes device
// capabilities, and runs the Endo daemon bootstrap.
//
// This is the only native process in the system.  All further
// isolation is provided by V8 Isolates and SES Compartments.

use std::rc::Rc;

use anyhow::Result;
use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::Extension;
use deno_core::JsRuntime;
use deno_core::RuntimeOptions;

use endo_os::devices;

/// print(...args) — writes to stdout (serial console on bare metal).
#[op2(fast)]
fn op_print(#[string] msg: &str) {
    println!("{msg}");
}

/// Read an embedded JS source file.  In the final build these are
/// compiled into the binary via include_str!().
fn ses_lockdown_source() -> &'static str {
    include_str!("../js/ses-lockdown.js")
}

fn bootstrap_source() -> &'static str {
    include_str!("../js/bootstrap.js")
}

fn device_wrapper_source() -> &'static str {
    include_str!("../js/devices.js")
}

fn main() -> Result<()> {
    println!("endo-init: Endo OS starting");
    println!("endo-init: Capability-native operating system (Rust)");

    // Build the extension that registers all our ops.
    let endo_ext = Extension {
        name: "endo_os",
        ops: std::borrow::Cow::Borrowed(&[
            // Core
            op_print::DECL,
            // Block device
            devices::block_device::op_open_block_device::DECL,
            devices::block_device::op_block_read::DECL,
            devices::block_device::op_block_write::DECL,
            devices::block_device::op_block_size::DECL,
            devices::block_device::op_block_sync::DECL,
            // Network
            devices::network::op_net_listen::DECL,
            devices::network::op_net_accept::DECL,
            devices::network::op_net_connect::DECL,
            devices::network::op_net_read::DECL,
            devices::network::op_net_write::DECL,
            devices::network::op_net_close::DECL,
            devices::network::op_net_remote_addr::DECL,
            devices::network::op_net_local_port::DECL,
            // Framebuffer
            devices::framebuffer::op_open_framebuffer::DECL,
            devices::framebuffer::op_fb_info::DECL,
            devices::framebuffer::op_fb_write_region::DECL,
            devices::framebuffer::op_fb_fill_rect::DECL,
            devices::framebuffer::op_fb_sync::DECL,
            // Camera
            devices::camera::op_open_camera::DECL,
            devices::camera::op_camera_info::DECL,
            devices::camera::op_camera_start::DECL,
            devices::camera::op_camera_capture::DECL,
            devices::camera::op_camera_stop::DECL,
            devices::camera::op_camera_close::DECL,
            // Microphone
            devices::microphone::op_open_microphone::DECL,
            devices::microphone::op_mic_info::DECL,
            devices::microphone::op_mic_read::DECL,
            devices::microphone::op_mic_close::DECL,
        ]),
        ..Default::default()
    };

    // Create the V8 runtime with our extensions.
    let mut runtime = JsRuntime::new(RuntimeOptions {
        extensions: vec![endo_ext],
        ..Default::default()
    });

    println!("endo-init: V8 runtime initialized (deno_core)");

    // Evaluate SES lockdown.
    println!("endo-init: Loading SES lockdown");
    runtime
        .execute_script("<ses-lockdown>", ses_lockdown_source())
        .map_err(|e| anyhow::anyhow!("SES lockdown failed: {e}"))?;
    println!("endo-init: SES lockdown complete");

    // Load device wrapper layer (JS capability objects over ops).
    println!("endo-init: Loading device capability wrappers");
    runtime
        .execute_script("<devices>", device_wrapper_source())
        .map_err(|e| anyhow::anyhow!("Device wrappers failed: {e}"))?;

    // Run bootstrap.
    println!("endo-init: Running bootstrap");
    runtime
        .execute_script("<bootstrap>", bootstrap_source())
        .map_err(|e| anyhow::anyhow!("Bootstrap failed: {e}"))?;
    println!("endo-init: Bootstrap complete");

    // Run the event loop.  In a full OS this never returns —
    // the daemon's promises and async I/O keep it alive forever.
    // deno_core's event loop handles:
    //   - Promise resolution (microtasks)
    //   - Async op completion (device I/O futures)
    //   - Timer callbacks (setTimeout/setInterval)
    println!("endo-init: Entering event loop");
    let tokio_rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    tokio_rt.block_on(async {
        if let Err(e) = runtime.run_event_loop(Default::default()).await {
            eprintln!("endo-init: Event loop error: {e}");
        }
    });

    println!("endo-init: Shutdown complete");
    Ok(())
}
