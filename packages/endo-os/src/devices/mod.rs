// Device capability bindings.
//
// Each module exposes deno_core ops that wrap Linux kernel device
// interfaces.  The ops are registered with the JsRuntime and called
// from JavaScript via Deno.core.ops.
//
// Rust ownership ensures each device fd is properly managed:
// - Opened once, stored in a ResourceTable
// - Borrowed for reads, exclusively borrowed for writes
// - Closed when the resource is dropped

pub mod block_device;
pub mod camera;
pub mod framebuffer;
pub mod microphone;
pub mod network;
