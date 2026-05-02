use std::fs;
use std::io;
use std::path::Path;

const PID_FILE_NAME: &str = "endo.pid";

pub fn write_pid(ephemeral_path: &Path) -> io::Result<()> {
    fs::create_dir_all(ephemeral_path)?;
    let pid = std::process::id();
    fs::write(ephemeral_path.join(PID_FILE_NAME), format!("{pid}\n"))
}

pub fn read_pid(ephemeral_path: &Path) -> io::Result<u32> {
    let path = ephemeral_path.join(PID_FILE_NAME);
    match fs::read_to_string(&path) {
        Ok(content) => content
            .trim()
            .parse::<u32>()
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(0),
        Err(e) => Err(e),
    }
}

pub fn remove_pid(ephemeral_path: &Path) {
    let _ = fs::remove_file(ephemeral_path.join(PID_FILE_NAME));
}

pub fn is_process_running(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    // kill(pid, 0) checks existence without sending a signal.
    unsafe { libc::kill(pid as i32, 0) == 0 }
}
