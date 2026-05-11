package daemon

import (
	"os"
	"os/user"
	"path/filepath"
	"runtime"
)

// EndoPaths holds the resolved filesystem paths for the daemon.
type EndoPaths struct {
	StatePath     string // durable state (applications, capabilities, logs)
	EphemeralPath string // ephemeral state (PID files)
	SockPath      string // Unix domain socket
	CachePath     string // caches
	LogPath       string // daemon log file
}

// ResolvePaths returns platform-appropriate paths for the daemon,
// respecting XDG environment variables. Ported from packages/where/index.js.
//
// When ENDO_STATE_PATH is set, all paths are taken from environment
// variables (ENDO_STATE_PATH, ENDO_EPHEMERAL_STATE_PATH, ENDO_SOCK_PATH,
// ENDO_CACHE_PATH). This allows the test harness to direct engo to
// test-specific temporary directories.
func ResolvePaths() (EndoPaths, error) {
	if statePath := os.Getenv("ENDO_STATE_PATH"); statePath != "" {
		return EndoPaths{
			StatePath:     statePath,
			EphemeralPath: os.Getenv("ENDO_EPHEMERAL_STATE_PATH"),
			SockPath:      os.Getenv("ENDO_SOCK_PATH"),
			CachePath:     os.Getenv("ENDO_CACHE_PATH"),
			LogPath:       filepath.Join(statePath, "endo.log"),
		}, nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return EndoPaths{}, err
	}

	u, err := user.Current()
	if err != nil {
		return EndoPaths{}, err
	}
	username := u.Username

	statePath := resolveStatePath(home)
	return EndoPaths{
		StatePath:     statePath,
		EphemeralPath: resolveEphemeralPath(home, username),
		SockPath:      resolveSockPath(home, username),
		CachePath:     resolveCachePath(home),
		LogPath:       filepath.Join(statePath, "endo.log"),
	}, nil
}

func resolveStatePath(home string) string {
	if xdg := os.Getenv("XDG_STATE_HOME"); xdg != "" {
		return filepath.Join(xdg, "endo")
	}
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "Endo")
	}
	return filepath.Join(home, ".local", "state", "endo")
}

func resolveEphemeralPath(home, username string) string {
	if xdg := os.Getenv("XDG_RUNTIME_DIR"); xdg != "" {
		return filepath.Join(xdg, "endo")
	}
	if runtime.GOOS == "darwin" {
		tmpdir := os.Getenv("TMPDIR")
		if tmpdir == "" {
			tmpdir = os.TempDir()
		}
		return filepath.Join(tmpdir, "endo-"+username)
	}
	tmpdir := os.Getenv("TMPDIR")
	if tmpdir == "" {
		tmpdir = os.TempDir()
	}
	return filepath.Join(tmpdir, "endo-"+username)
}

func resolveSockPath(home, username string) string {
	if sock := os.Getenv("ENDO_SOCK"); sock != "" {
		return sock
	}
	if xdg := os.Getenv("XDG_RUNTIME_DIR"); xdg != "" {
		return filepath.Join(xdg, "endo", "captp0.sock")
	}
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "Endo", "captp0.sock")
	}
	tmpdir := os.Getenv("TMPDIR")
	if tmpdir == "" {
		tmpdir = os.TempDir()
	}
	return filepath.Join(tmpdir, "endo-"+username, "captp0.sock")
}

func resolveCachePath(home string) string {
	if xdg := os.Getenv("XDG_CACHE_HOME"); xdg != "" {
		return filepath.Join(xdg, "endo")
	}
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Caches", "Endo")
	}
	return filepath.Join(home, ".cache", "endo")
}
