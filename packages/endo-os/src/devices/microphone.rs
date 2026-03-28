// Microphone (OSS/ALSA) Capability — Rust binding
//
// Exposes an audio capture device as deno_core ops.
// Uses the OSS-compatible /dev/dsp interface for simplicity
// (ALSA provides OSS emulation via snd-pcm-oss).
//
// Audio flows as Vec<u8> chunks of raw PCM data.  From JS,
// each read() returns a Uint8Array of interleaved samples.
//
// Ownership: the fd is held by MicrophoneResource and closed
// on drop.  No double-close, no use-after-free.

use std::cell::RefCell;
use std::fs::{File, OpenOptions};
use std::io::Read;
use std::os::unix::io::AsRawFd;

use anyhow::{anyhow, Result};
use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpState;
use deno_core::Resource;
use deno_core::ResourceId;
use serde::Serialize;

pub struct MicrophoneResource {
    file: RefCell<File>,
    sample_rate: u32,
    channels: u32,
    bits_per_sample: u32,
}

impl Resource for MicrophoneResource {
    fn name(&self) -> std::borrow::Cow<str> {
        "microphone".into()
    }
}

// OSS ioctl numbers.
const SNDCTL_DSP_SETFMT: libc::c_ulong = 0xC0045005;
const SNDCTL_DSP_CHANNELS: libc::c_ulong = 0xC0045006;
const SNDCTL_DSP_SPEED: libc::c_ulong = 0xC0045002;
const SNDCTL_DSP_RESET: libc::c_ulong = 0x00005000;
const AFMT_S16_LE: i32 = 0x00000010;

#[derive(Serialize)]
pub struct MicInfo {
    pub sample_rate: u32,
    pub channels: u32,
    pub bits_per_sample: u32,
}

/// Open a microphone device.  Returns a resource ID.
#[op2(fast)]
pub fn op_open_microphone(
    state: &mut OpState,
    #[string] path: &str,
) -> Result<u32, AnyError> {
    let file = OpenOptions::new()
        .read(true)
        .open(path)
        .map_err(|e| anyhow!("Failed to open microphone {path}: {e}"))?;

    let fd = file.as_raw_fd();

    // Configure audio format via OSS ioctls.
    let mut format = AFMT_S16_LE;
    let mut channels: i32 = 1; // mono
    let mut sample_rate: i32 = 44100;

    unsafe {
        libc::ioctl(fd, SNDCTL_DSP_SETFMT, &mut format);
        libc::ioctl(fd, SNDCTL_DSP_CHANNELS, &mut channels);
        libc::ioctl(fd, SNDCTL_DSP_SPEED, &mut sample_rate);
    }

    println!(
        "endo-init: Microphone {path}: {sample_rate}Hz {channels}ch 16bit"
    );

    let rid = state.resource_table.add(MicrophoneResource {
        file: RefCell::new(file),
        sample_rate: sample_rate as u32,
        channels: channels as u32,
        bits_per_sample: 16,
    });

    Ok(rid)
}

/// Get microphone info.
#[op2]
#[serde]
pub fn op_mic_info(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<MicInfo, AnyError> {
    let resource = state.resource_table.get::<MicrophoneResource>(rid)?;
    Ok(MicInfo {
        sample_rate: resource.sample_rate,
        channels: resource.channels,
        bits_per_sample: resource.bits_per_sample,
    })
}

/// Read PCM audio frames.  Returns raw bytes (interleaved S16LE).
#[op2]
#[buffer]
pub fn op_mic_read(
    state: &mut OpState,
    #[smi] rid: ResourceId,
    #[smi] frames: u32,
) -> Result<Vec<u8>, AnyError> {
    let resource = state.resource_table.get::<MicrophoneResource>(rid)?;
    let mut file = resource.file.borrow_mut();

    let frame_size = resource.channels * (resource.bits_per_sample / 8);
    let byte_count = (frames as usize) * (frame_size as usize);
    let byte_count = byte_count.min(4 * 1024 * 1024); // 4 MB max

    let mut buf = vec![0u8; byte_count];
    let n = file.read(&mut buf)
        .map_err(|e| anyhow!("microphone read failed: {e}"))?;
    buf.truncate(n);

    Ok(buf)
}

/// Close the microphone.
#[op2(fast)]
pub fn op_mic_close(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<(), AnyError> {
    state.resource_table.close(rid)
        .map_err(|_| anyhow!("invalid microphone resource"))?;
    Ok(())
}
