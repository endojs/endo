// Camera (V4L2) Capability — Rust binding
//
// Wraps a Video4Linux2 capture device as deno_core ops.
// Streaming uses mmap'd buffers; each capture() dequeues a frame,
// copies it to a JS-owned buffer, and re-queues the V4L2 buffer.
//
// Safety: all V4L2 ioctls are wrapped in safe Rust functions.
// The mmap'd buffers are tied to CameraResource's lifetime.

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

const NUM_BUFFERS: u32 = 4;

struct MappedBuffer {
    ptr: *mut u8,
    length: usize,
}

pub struct CameraResource {
    file: File,
    width: u32,
    height: u32,
    fourcc: [u8; 4],
    buffers: Vec<MappedBuffer>,
    streaming: bool,
}

// Single-threaded use only (deno_core guarantee).
unsafe impl Send for CameraResource {}
unsafe impl Sync for CameraResource {}

impl Drop for CameraResource {
    fn drop(&mut self) {
        // Stop streaming if active.
        if self.streaming {
            let buf_type: u32 = 1; // V4L2_BUF_TYPE_VIDEO_CAPTURE
            unsafe {
                libc::ioctl(self.file.as_raw_fd(), VIDIOC_STREAMOFF, &buf_type);
            }
        }
        // Unmap buffers.
        for buf in &self.buffers {
            if !buf.ptr.is_null() {
                unsafe {
                    libc::munmap(buf.ptr as *mut libc::c_void, buf.length);
                }
            }
        }
    }
}

impl Resource for CameraResource {
    fn name(&self) -> std::borrow::Cow<str> {
        "camera".into()
    }
}

// V4L2 ioctl numbers (Linux x86_64).
const VIDIOC_QUERYCAP: libc::c_ulong = 0x80685600;
const VIDIOC_S_FMT: libc::c_ulong = 0xC0D05605;
const VIDIOC_G_FMT: libc::c_ulong = 0xC0D05604;
const VIDIOC_REQBUFS: libc::c_ulong = 0xC0145608;
const VIDIOC_QUERYBUF: libc::c_ulong = 0xC0445609;
const VIDIOC_QBUF: libc::c_ulong = 0xC044560F;
const VIDIOC_DQBUF: libc::c_ulong = 0xC0445611;
const VIDIOC_STREAMON: libc::c_ulong = 0x40045612;
const VIDIOC_STREAMOFF: libc::c_ulong = 0x40045613;

// V4L2 pixel formats.
const V4L2_PIX_FMT_MJPEG: u32 = 0x47504A4D;
const V4L2_PIX_FMT_YUYV: u32 = 0x56595559;
const V4L2_BUF_TYPE_VIDEO_CAPTURE: u32 = 1;
const V4L2_MEMORY_MMAP: u32 = 1;

// Minimal V4L2 structs (C ABI compatible).
#[repr(C)]
struct V4l2Capability {
    driver: [u8; 16],
    card: [u8; 32],
    bus_info: [u8; 32],
    version: u32,
    capabilities: u32,
    device_caps: u32,
    reserved: [u32; 3],
}

#[repr(C)]
struct V4l2PixFormat {
    width: u32,
    height: u32,
    pixelformat: u32,
    field: u32,
    bytesperline: u32,
    sizeimage: u32,
    colorspace: u32,
    priv_: u32,
    flags: u32,
    _pad: [u32; 5],
}

#[repr(C)]
struct V4l2Format {
    type_: u32,
    fmt: V4l2PixFormat,
    _pad: [u8; 128],
}

#[repr(C)]
struct V4l2Requestbuffers {
    count: u32,
    type_: u32,
    memory: u32,
    capabilities: u32,
    flags: u8,
    reserved: [u8; 3],
    reserved2: [u32; 3],
}

#[repr(C)]
struct V4l2Buffer {
    index: u32,
    type_: u32,
    bytesused: u32,
    flags: u32,
    field: u32,
    timestamp_sec: i64,
    timestamp_usec: i64,
    timecode: [u32; 4],
    sequence: u32,
    memory: u32,
    offset_or_userptr: u64,  // union: m.offset for mmap
    length: u32,
    reserved2: u32,
    _pad: [u32; 8],
}

fn fourcc_str(fourcc: u32) -> [u8; 4] {
    [
        (fourcc & 0xFF) as u8,
        ((fourcc >> 8) & 0xFF) as u8,
        ((fourcc >> 16) & 0xFF) as u8,
        ((fourcc >> 24) & 0xFF) as u8,
    ]
}

#[derive(Serialize)]
pub struct CameraInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
}

/// Open a camera device.
#[op2(fast)]
pub fn op_open_camera(
    state: &mut OpState,
    #[string] path: &str,
) -> Result<u32, AnyError> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|e| anyhow!("Failed to open camera {path}: {e}"))?;

    let fd = file.as_raw_fd();

    // Check it's a capture device.
    unsafe {
        let mut cap: V4l2Capability = std::mem::zeroed();
        if libc::ioctl(fd, VIDIOC_QUERYCAP, &mut cap) < 0 {
            return Err(anyhow!("VIDIOC_QUERYCAP failed on {path}"));
        }
        if cap.capabilities & 0x01 == 0 {
            // V4L2_CAP_VIDEO_CAPTURE = 0x01
            return Err(anyhow!("{path} is not a video capture device"));
        }
    }

    // Set format: try MJPEG, fall back to YUYV.
    let mut fmt: V4l2Format = unsafe { std::mem::zeroed() };
    fmt.type_ = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    fmt.fmt.width = 640;
    fmt.fmt.height = 480;
    fmt.fmt.pixelformat = V4L2_PIX_FMT_MJPEG;

    unsafe {
        if libc::ioctl(fd, VIDIOC_S_FMT, &mut fmt) < 0 {
            fmt.fmt.pixelformat = V4L2_PIX_FMT_YUYV;
            libc::ioctl(fd, VIDIOC_S_FMT, &mut fmt);
        }
        // Read back actual format.
        libc::ioctl(fd, VIDIOC_G_FMT, &mut fmt);
    }

    let fourcc = fourcc_str(fmt.fmt.pixelformat);
    let fourcc_s = String::from_utf8_lossy(&fourcc);
    println!(
        "endo-init: Camera {path}: {}x{} {fourcc_s}",
        fmt.fmt.width, fmt.fmt.height
    );

    let rid = state.resource_table.add(CameraResource {
        file,
        width: fmt.fmt.width,
        height: fmt.fmt.height,
        fourcc,
        buffers: Vec::new(),
        streaming: false,
    });

    Ok(rid)
}

/// Get camera info.
#[op2]
#[serde]
pub fn op_camera_info(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<CameraInfo, AnyError> {
    let resource = state.resource_table.get::<CameraResource>(rid)?;
    Ok(CameraInfo {
        width: resource.width,
        height: resource.height,
        format: String::from_utf8_lossy(&resource.fourcc).to_string(),
    })
}

/// Start streaming (allocate and queue mmap buffers).
#[op2(fast)]
pub fn op_camera_start(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<(), AnyError> {
    let resource = state.resource_table.get::<CameraResource>(rid)?;
    // We need mutable access via interior trick since Resource is shared.
    // In practice, ops are sequential on a single thread.
    let resource_ptr = &*resource as *const CameraResource as *mut CameraResource;
    let resource = unsafe { &mut *resource_ptr };

    if resource.streaming {
        return Ok(());
    }

    let fd = resource.file.as_raw_fd();

    // Request buffers.
    let mut req: V4l2Requestbuffers = unsafe { std::mem::zeroed() };
    req.count = NUM_BUFFERS;
    req.type_ = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    req.memory = V4L2_MEMORY_MMAP;

    unsafe {
        if libc::ioctl(fd, VIDIOC_REQBUFS, &mut req) < 0 {
            return Err(anyhow!("VIDIOC_REQBUFS failed"));
        }
    }

    // Map each buffer.
    for i in 0..req.count {
        let mut buf: V4l2Buffer = unsafe { std::mem::zeroed() };
        buf.type_ = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory = V4L2_MEMORY_MMAP;
        buf.index = i;

        unsafe {
            if libc::ioctl(fd, VIDIOC_QUERYBUF, &mut buf) < 0 {
                continue;
            }

            let ptr = libc::mmap(
                std::ptr::null_mut(),
                buf.length as usize,
                libc::PROT_READ | libc::PROT_WRITE,
                libc::MAP_SHARED,
                fd,
                buf.offset_or_userptr as i64,
            );

            resource.buffers.push(MappedBuffer {
                ptr: ptr as *mut u8,
                length: buf.length as usize,
            });

            // Queue buffer.
            libc::ioctl(fd, VIDIOC_QBUF, &mut buf);
        }
    }

    // Start streaming.
    let buf_type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    unsafe {
        if libc::ioctl(fd, VIDIOC_STREAMON, &buf_type) < 0 {
            return Err(anyhow!("VIDIOC_STREAMON failed"));
        }
    }

    resource.streaming = true;
    println!("endo-init: Camera streaming started");
    Ok(())
}

/// Capture a single frame. Returns raw frame bytes.
#[op2]
#[buffer]
pub fn op_camera_capture(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<Vec<u8>, AnyError> {
    let resource = state.resource_table.get::<CameraResource>(rid)?;
    let resource_ptr = &*resource as *const CameraResource as *mut CameraResource;
    let resource = unsafe { &mut *resource_ptr };

    if !resource.streaming {
        // Auto-start on first capture.
        drop(state.resource_table.get::<CameraResource>(rid)?);
        op_camera_start(state, rid)?;
        let resource = state.resource_table.get::<CameraResource>(rid)?;
        let resource_ptr = &*resource as *const CameraResource as *mut CameraResource;
        let _ = unsafe { &mut *resource_ptr };
    }

    let fd = resource.file.as_raw_fd();

    // Dequeue a filled buffer.
    let mut buf: V4l2Buffer = unsafe { std::mem::zeroed() };
    buf.type_ = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    buf.memory = V4L2_MEMORY_MMAP;

    unsafe {
        if libc::ioctl(fd, VIDIOC_DQBUF, &mut buf) < 0 {
            return Err(anyhow!("Failed to dequeue camera frame"));
        }
    }

    // Copy frame data.
    let idx = buf.index as usize;
    let frame_size = buf.bytesused as usize;
    let mut data = vec![0u8; frame_size];

    if idx < resource.buffers.len() {
        unsafe {
            std::ptr::copy_nonoverlapping(
                resource.buffers[idx].ptr,
                data.as_mut_ptr(),
                frame_size,
            );
        }
    }

    // Re-queue the buffer.
    unsafe {
        libc::ioctl(fd, VIDIOC_QBUF, &mut buf);
    }

    Ok(data)
}

/// Stop streaming.
#[op2(fast)]
pub fn op_camera_stop(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<(), AnyError> {
    let resource = state.resource_table.get::<CameraResource>(rid)?;
    let resource_ptr = &*resource as *const CameraResource as *mut CameraResource;
    let resource = unsafe { &mut *resource_ptr };

    if !resource.streaming {
        return Ok(());
    }

    let fd = resource.file.as_raw_fd();
    let buf_type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    unsafe {
        libc::ioctl(fd, VIDIOC_STREAMOFF, &buf_type);
    }

    // Unmap buffers.
    for buf in resource.buffers.drain(..) {
        if !buf.ptr.is_null() {
            unsafe {
                libc::munmap(buf.ptr as *mut libc::c_void, buf.length);
            }
        }
    }

    resource.streaming = false;
    println!("endo-init: Camera streaming stopped");
    Ok(())
}

/// Close the camera device.
#[op2(fast)]
pub fn op_camera_close(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<(), AnyError> {
    state.resource_table.close(rid)
        .map_err(|_| anyhow!("invalid camera resource"))?;
    Ok(())
}
