package daemon

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

const pidFileName = "endo.pid"

// WritePID writes the current process PID to the ephemeral directory.
func WritePID(ephemeralPath string) error {
	if err := os.MkdirAll(ephemeralPath, 0o700); err != nil {
		return fmt.Errorf("create ephemeral dir: %w", err)
	}
	path := filepath.Join(ephemeralPath, pidFileName)
	data := []byte(strconv.Itoa(os.Getpid()))
	return os.WriteFile(path, data, 0o600)
}

// ReadPID reads the daemon PID from the ephemeral directory. Returns 0
// if the file does not exist.
func ReadPID(ephemeralPath string) (int, error) {
	path := filepath.Join(ephemeralPath, pidFileName)
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return 0, fmt.Errorf("invalid pid file: %w", err)
	}
	return pid, nil
}

// RemovePID removes the PID file.
func RemovePID(ephemeralPath string) error {
	path := filepath.Join(ephemeralPath, pidFileName)
	err := os.Remove(path)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

// IsProcessRunning checks whether a process with the given PID is alive.
func IsProcessRunning(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// Signal 0 tests for existence without actually sending a signal.
	err = proc.Signal(syscall.Signal(0))
	return err == nil
}
