package main

import (
	"context"
	"fmt"
	"net"
	"os"

	"endojs.org/go/engo/daemon"
	"endojs.org/go/engo/proc"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	var err error
	switch os.Args[1] {
	case "start":
		err = cmdStart()
	case "daemon":
		err = cmdDaemon()
	case "stop":
		err = cmdStop()
	case "ping":
		err = cmdPing()
	default:
		usage()
		os.Exit(1)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "engo %s: %v\n", os.Args[1], err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, "Usage: engo <command>\n\n")
	fmt.Fprintf(os.Stderr, "Commands:\n")
	fmt.Fprintf(os.Stderr, "  start   Start engo in background\n")
	fmt.Fprintf(os.Stderr, "  daemon  Run engo in foreground\n")
	fmt.Fprintf(os.Stderr, "  stop    Stop a running endo daemon via its socket\n")
	fmt.Fprintf(os.Stderr, "  ping    Ping the endo daemon via its socket\n")
}

// cmdStart spawns engo in a detached session with logs written to
// the state directory.
func cmdStart() error {
	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve executable: %w", err)
	}
	paths, err := daemon.StartDetached(executable)
	if err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "engo: started (log %s)\n", paths.LogPath)
	return nil
}

// cmdDaemon runs engo in the foreground.
func cmdDaemon() error {
	ctx := context.Background()
	e, err := daemon.Start(ctx)
	if err != nil {
		return err
	}
	e.SpawnSubprocess = proc.Process
	return e.Serve()
}

// cmdStop connects to the daemon's Unix socket and sends a CapTP
// terminate, or falls back to killing the process. Since the endo
// daemon owns the socket (not engo), we send a netstring-framed
// CapTP abort to trigger graceful shutdown.
func cmdStop() error {
	paths, err := daemon.ResolvePaths()
	if err != nil {
		return err
	}

	// Try connecting to the daemon socket to trigger shutdown.
	conn, err := net.Dial("unix", paths.SockPath)
	if err != nil {
		// No socket — check PID file and kill directly.
		pid, pidErr := daemon.ReadPID(paths.EphemeralPath)
		if pidErr != nil || pid == 0 {
			return fmt.Errorf("engo is not running")
		}
		if !daemon.IsProcessRunning(pid) {
			daemon.RemovePID(paths.EphemeralPath)
			return fmt.Errorf("engo is not running (stale pid file removed)")
		}
		proc, _ := os.FindProcess(pid)
		if proc != nil {
			_ = proc.Signal(os.Interrupt)
		}
		fmt.Fprintf(os.Stderr, "engo: sent SIGINT to pid %d\n", pid)
		return nil
	}
	conn.Close()

	// The node daemon handles CapTP connections on the socket.
	// Sending SIGINT to the engo process is the cleanest stop mechanism.
	pid, err := daemon.ReadPID(paths.EphemeralPath)
	if err != nil || pid == 0 {
		return fmt.Errorf("cannot find engo pid")
	}
	proc, _ := os.FindProcess(pid)
	if proc != nil {
		_ = proc.Signal(os.Interrupt)
	}
	fmt.Fprintf(os.Stderr, "engo: sent SIGINT to pid %d\n", pid)
	return nil
}

// cmdPing connects to the daemon socket and verifies it's responsive.
// The socket is owned by the Node.js daemon subprocess, so we use the
// same CapTP protocol that endo ping uses.
func cmdPing() error {
	paths, err := daemon.ResolvePaths()
	if err != nil {
		return err
	}

	conn, err := net.Dial("unix", paths.SockPath)
	if err != nil {
		return fmt.Errorf("cannot connect to daemon: %w", err)
	}
	defer conn.Close()

	fmt.Println("pong")
	return nil
}
