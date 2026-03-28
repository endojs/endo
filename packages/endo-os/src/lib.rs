// @ts-check (for the JS side — Rust modules below)
//
// Endo OS: Capability-native operating system
//
// This crate builds the `endo-init` binary — PID 1 on the Endo OS
// kernel.  It embeds V8 via deno_core, applies SES lockdown, probes
// hardware devices, and boots the Endo pet daemon.

pub mod devices;
