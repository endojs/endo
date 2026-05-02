use std::io;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};

/// Create a pipe with `O_CLOEXEC` set, returning `(read_end, write_end)`.
#[cfg(any(target_os = "linux", target_os = "freebsd", target_os = "netbsd", target_os = "openbsd"))]
pub fn pipe() -> io::Result<(OwnedFd, OwnedFd)> {
    let mut fds = [0i32; 2];
    if unsafe { libc::pipe2(fds.as_mut_ptr(), libc::O_CLOEXEC) } != 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: pipe2 returned successfully, so fds[0] and fds[1] are valid open fds.
    let read_end = unsafe { OwnedFd::from_raw_fd(fds[0]) };
    let write_end = unsafe { OwnedFd::from_raw_fd(fds[1]) };
    Ok((read_end, write_end))
}

/// Create a pipe with `FD_CLOEXEC` set, returning `(read_end, write_end)`.
///
/// macOS lacks `pipe2`, so we set `FD_CLOEXEC` via `fcntl` after the fact.
/// There is a small window between `pipe()` and `fcntl()` where a `fork()`
/// on another thread could inherit the fds; callers that fork concurrently
/// should serialize against this.
#[cfg(not(any(target_os = "linux", target_os = "freebsd", target_os = "netbsd", target_os = "openbsd")))]
pub fn pipe() -> io::Result<(OwnedFd, OwnedFd)> {
    let mut fds = [0i32; 2];
    if unsafe { libc::pipe(fds.as_mut_ptr()) } != 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: pipe returned successfully, so fds[0] and fds[1] are valid open fds.
    let read_end = unsafe { OwnedFd::from_raw_fd(fds[0]) };
    let write_end = unsafe { OwnedFd::from_raw_fd(fds[1]) };
    for fd in [&read_end, &write_end] {
        let raw = fd.as_raw_fd();
        let flags = unsafe { libc::fcntl(raw, libc::F_GETFD) };
        if flags < 0 {
            return Err(io::Error::last_os_error());
        }
        if unsafe { libc::fcntl(raw, libc::F_SETFD, flags | libc::FD_CLOEXEC) } < 0 {
            return Err(io::Error::last_os_error());
        }
    }
    Ok((read_end, write_end))
}

/// Set a file descriptor to non-blocking mode.
pub fn set_nonblocking(fd: &impl AsRawFd) -> io::Result<()> {
    let raw = fd.as_raw_fd();
    let flags = unsafe { libc::fcntl(raw, libc::F_GETFL) };
    if flags < 0 {
        return Err(io::Error::last_os_error());
    }
    if unsafe { libc::fcntl(raw, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}
