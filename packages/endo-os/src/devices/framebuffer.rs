// Framebuffer (Display) Capability — Rust binding
//
// Exposes /dev/fb0 as a drawable surface via deno_core ops.
// The framebuffer memory is mmap'd; the JS side gets an
// ArrayBuffer view that writes directly to video memory.
//
// Safety: the mmap lifetime is tied to FramebufferResource.
// When the resource is dropped, the mapping is unmapped.

use std::cell::RefCell;
use std::fs::{File, OpenOptions};
use std::os::unix::io::AsRawFd;

use anyhow::{anyhow, Result};
use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpState;
use deno_core::Resource;
use deno_core::ResourceId;
use serde::Serialize;

pub struct FramebufferResource {
    _file: File,
    mmap_ptr: *mut u8,
    mmap_len: usize,
    width: u32,
    height: u32,
    bpp: u32,
    line_length: u32,
}

// Safety: FramebufferResource is only used from one thread
// (deno_core is single-threaded per isolate).
unsafe impl Send for FramebufferResource {}
unsafe impl Sync for FramebufferResource {}

impl Drop for FramebufferResource {
    fn drop(&mut self) {
        if !self.mmap_ptr.is_null() {
            unsafe {
                libc::munmap(self.mmap_ptr as *mut libc::c_void, self.mmap_len);
            }
        }
    }
}

impl Resource for FramebufferResource {
    fn name(&self) -> std::borrow::Cow<str> {
        "framebuffer".into()
    }
}

#[derive(Serialize)]
pub struct FbInfo {
    pub width: u32,
    pub height: u32,
    pub bpp: u32,
    pub size: usize,
}

/// Open a framebuffer device.  Returns a resource ID.
#[op2(fast)]
pub fn op_open_framebuffer(
    state: &mut OpState,
    #[string] path: &str,
) -> Result<u32, AnyError> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|e| anyhow!("Failed to open framebuffer {path}: {e}"))?;

    let fd = file.as_raw_fd();

    // Query framebuffer geometry via ioctls.
    let (width, height, bpp, line_length, smem_len) = unsafe {
        // FBIOGET_VSCREENINFO = 0x4600
        let mut vinfo: libc::c_long = 0;
        // We need the actual fb structs. Use raw ioctl with proper structs.
        #[repr(C)]
        struct FbVarScreeninfo {
            xres: u32,
            yres: u32,
            xres_virtual: u32,
            yres_virtual: u32,
            xoffset: u32,
            yoffset: u32,
            bits_per_pixel: u32,
            // ... many more fields we don't need, pad with zeros
            _pad: [u32; 64],
        }

        #[repr(C)]
        struct FbFixScreeninfo {
            id: [u8; 16],
            smem_start: u64,
            smem_len: u32,
            _type: u32,
            _type_aux: u32,
            visual: u32,
            xpanstep: u16,
            ypanstep: u16,
            ywrapstep: u16,
            _pad1: u16,
            line_length: u32,
            // ... more fields
            _pad2: [u32; 32],
        }

        let mut vinfo = std::mem::zeroed::<FbVarScreeninfo>();
        let mut finfo = std::mem::zeroed::<FbFixScreeninfo>();

        // FBIOGET_VSCREENINFO = 0x4600, FBIOGET_FSCREENINFO = 0x4602
        if libc::ioctl(fd, 0x4600, &mut vinfo) < 0 {
            return Err(anyhow!("FBIOGET_VSCREENINFO failed"));
        }
        if libc::ioctl(fd, 0x4602, &mut finfo) < 0 {
            return Err(anyhow!("FBIOGET_FSCREENINFO failed"));
        }

        (
            vinfo.xres,
            vinfo.yres,
            vinfo.bits_per_pixel,
            finfo.line_length,
            finfo.smem_len as usize,
        )
    };

    // mmap the framebuffer.
    let mmap_ptr = unsafe {
        libc::mmap(
            std::ptr::null_mut(),
            smem_len,
            libc::PROT_READ | libc::PROT_WRITE,
            libc::MAP_SHARED,
            fd,
            0,
        )
    };

    if mmap_ptr == libc::MAP_FAILED {
        return Err(anyhow!("Failed to mmap framebuffer"));
    }

    println!(
        "endo-init: Framebuffer {path}: {width}x{height} @ {bpp}bpp ({smem_len} bytes)"
    );

    let rid = state.resource_table.add(FramebufferResource {
        _file: file,
        mmap_ptr: mmap_ptr as *mut u8,
        mmap_len: smem_len,
        width,
        height,
        bpp,
        line_length,
    });

    Ok(rid)
}

/// Get framebuffer info.
#[op2]
#[serde]
pub fn op_fb_info(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<FbInfo, AnyError> {
    let resource = state.resource_table.get::<FramebufferResource>(rid)?;
    Ok(FbInfo {
        width: resource.width,
        height: resource.height,
        bpp: resource.bpp,
        size: resource.mmap_len,
    })
}

/// Write pixel data to a region of the framebuffer.
/// data is raw BGRA bytes, written starting at (x, y).
#[op2(fast)]
pub fn op_fb_write_region(
    state: &mut OpState,
    #[smi] rid: ResourceId,
    #[smi] x: u32,
    #[smi] y: u32,
    #[smi] w: u32,
    #[smi] h: u32,
    #[buffer] data: &[u8],
) -> Result<(), AnyError> {
    let resource = state.resource_table.get::<FramebufferResource>(rid)?;
    let bytes_pp = resource.bpp / 8;
    let fb = resource.mmap_ptr;

    for row in 0..h {
        let py = y + row;
        if py >= resource.height {
            break;
        }
        for col in 0..w {
            let px = x + col;
            if px >= resource.width {
                break;
            }

            let src_offset = ((row * w + col) * bytes_pp) as usize;
            let dst_offset = (py * resource.line_length + px * bytes_pp) as usize;

            if src_offset + bytes_pp as usize > data.len() {
                break;
            }
            if dst_offset + bytes_pp as usize > resource.mmap_len {
                break;
            }

            unsafe {
                std::ptr::copy_nonoverlapping(
                    data.as_ptr().add(src_offset),
                    fb.add(dst_offset),
                    bytes_pp as usize,
                );
            }
        }
    }

    Ok(())
}

/// Fill a rectangle with a solid color (BGRA).
#[op2(fast)]
pub fn op_fb_fill_rect(
    state: &mut OpState,
    #[smi] rid: ResourceId,
    #[smi] x: u32,
    #[smi] y: u32,
    #[smi] w: u32,
    #[smi] h: u32,
    #[smi] r: u8,
    #[smi] g: u8,
    #[smi] b: u8,
) -> Result<(), AnyError> {
    let resource = state.resource_table.get::<FramebufferResource>(rid)?;
    let bytes_pp = resource.bpp / 8;
    let fb = resource.mmap_ptr;

    let pixel: [u8; 4] = [b, g, r, 0xFF]; // BGRA

    for row in 0..h {
        let py = y + row;
        if py >= resource.height {
            break;
        }
        for col in 0..w {
            let px = x + col;
            if px >= resource.width {
                break;
            }
            let offset = (py * resource.line_length + px * bytes_pp) as usize;
            if offset + bytes_pp as usize <= resource.mmap_len {
                unsafe {
                    std::ptr::copy_nonoverlapping(
                        pixel.as_ptr(),
                        fb.add(offset),
                        bytes_pp as usize,
                    );
                }
            }
        }
    }

    Ok(())
}

/// Sync the framebuffer to the display.
#[op2(fast)]
pub fn op_fb_sync(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<(), AnyError> {
    let resource = state.resource_table.get::<FramebufferResource>(rid)?;
    unsafe {
        libc::msync(
            resource.mmap_ptr as *mut libc::c_void,
            resource.mmap_len,
            libc::MS_SYNC,
        );
    }
    Ok(())
}
