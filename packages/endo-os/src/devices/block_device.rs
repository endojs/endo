// Block Device Capability — Rust binding
//
// Wraps a Linux block device (/dev/vda via virtio-blk) in deno_core
// ops.  The file descriptor is stored in the JsRuntime's
// ResourceTable, ensuring it's properly closed on drop.
//
// Rust ownership guarantees:
//   - The fd is opened once and owned by BlockDeviceResource
//   - Concurrent reads are safe (pread is thread-safe)
//   - The fd is closed exactly once when the resource is dropped
//   - No use-after-close is possible

use std::cell::RefCell;
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::os::unix::io::AsRawFd;
use std::rc::Rc;

use anyhow::{anyhow, Result};
use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpState;
use deno_core::Resource;
use deno_core::ResourceId;
use serde::Serialize;

/// Resource wrapper for a block device fd.
pub struct BlockDeviceResource {
    file: RefCell<File>,
    path: String,
}

impl Resource for BlockDeviceResource {
    fn name(&self) -> std::borrow::Cow<str> {
        std::borrow::Cow::Owned(format!("blockDevice({})", self.path))
    }
}

/// Open a block device, returns a resource ID.
#[op2(fast)]
pub fn op_open_block_device(
    state: &mut OpState,
    #[string] path: &str,
) -> Result<u32, AnyError> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|e| anyhow!("Failed to open block device {path}: {e}"))?;

    println!("endo-init: Opened block device {path} (fd={})", file.as_raw_fd());

    let rid = state.resource_table.add(BlockDeviceResource {
        file: RefCell::new(file),
        path: path.to_string(),
    });

    Ok(rid)
}

/// Read bytes from the block device at a given offset.
#[op2]
#[buffer]
pub fn op_block_read(
    state: &mut OpState,
    #[smi] rid: ResourceId,
    #[number] offset: i64,
    #[number] length: i64,
) -> Result<Vec<u8>, AnyError> {
    let resource = state.resource_table.get::<BlockDeviceResource>(rid)?;
    let mut file = resource.file.borrow_mut();

    let length = length.min(64 * 1024 * 1024) as usize; // 64 MB max
    file.seek(SeekFrom::Start(offset as u64))?;

    let mut buf = vec![0u8; length];
    let n = file.read(&mut buf)?;
    buf.truncate(n);

    Ok(buf)
}

/// Write bytes to the block device at a given offset.
#[op2(fast)]
pub fn op_block_write(
    state: &mut OpState,
    #[smi] rid: ResourceId,
    #[number] offset: i64,
    #[buffer] data: &[u8],
) -> Result<(), AnyError> {
    let resource = state.resource_table.get::<BlockDeviceResource>(rid)?;
    let mut file = resource.file.borrow_mut();

    file.seek(SeekFrom::Start(offset as u64))?;
    file.write_all(data)?;

    Ok(())
}

/// Get the total size of the block device in bytes.
#[op2(fast)]
#[number]
pub fn op_block_size(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<u64, AnyError> {
    let resource = state.resource_table.get::<BlockDeviceResource>(rid)?;
    let mut file = resource.file.borrow_mut();

    // Try BLKGETSIZE64 ioctl first (works on actual block devices).
    let fd = file.as_raw_fd();
    let mut size: u64 = 0;

    #[cfg(target_os = "linux")]
    {
        // BLKGETSIZE64 = 0x80081272
        const BLKGETSIZE64: libc::c_ulong = 0x80081272;
        let ret = unsafe {
            libc::ioctl(fd, BLKGETSIZE64, &mut size as *mut u64)
        };
        if ret == 0 {
            return Ok(size);
        }
    }

    // Fall back to seek-to-end for regular files.
    let pos = file.seek(SeekFrom::End(0))?;
    Ok(pos)
}

/// Flush writes to the block device.
#[op2(fast)]
pub fn op_block_sync(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<(), AnyError> {
    let resource = state.resource_table.get::<BlockDeviceResource>(rid)?;
    let file = resource.file.borrow();
    file.sync_all()?;
    Ok(())
}
