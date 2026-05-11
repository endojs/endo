package daemon

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

// Engo ties together the supervisor, the Node.js daemon subprocess, and
// lifecycle management. Unlike the endo-engo prototype's Daemon which
// owns the socket listener directly, Engo delegates socket listening to
// the Node.js daemon subprocess (which serves CapTP over a Unix socket).
// Engo communicates with the daemon and all workers via the envelope
// protocol on fd 3/4.
type Engo struct {
	Supervisor *Supervisor
	Paths      EndoPaths
	ctx        context.Context
	cancel     context.CancelFunc

	// DaemonHandle is the handle assigned to the Node.js daemon subprocess.
	DaemonHandle Handle

	// NodePath is the path to the Node.js executable.
	NodePath string

	// DaemonScriptPath is the path to the daemon entry script.
	// For Phase 0, this is daemon-node.js (unmodified).
	// For Phase 1+, this will be daemon-go.js.
	DaemonScriptPath string

	// SpawnSubprocess is the function used to spawn worker subprocesses.
	// parentHandle is the handle of the process that requested the spawn
	// (typically the daemon), so workers can send exit notifications back.
	SpawnSubprocess func(ctx context.Context, sup *Supervisor, command string, args []string, parentHandle Handle) (Handle, error)
}

// Start creates directories, writes a PID file, starts the supervisor,
// and spawns the Node.js daemon as a subprocess.
func Start(ctx context.Context) (*Engo, error) {
	paths, err := ResolvePaths()
	if err != nil {
		return nil, fmt.Errorf("resolve paths: %w", err)
	}

	// Ensure directories exist.
	for _, dir := range []string{paths.StatePath, paths.EphemeralPath, paths.CachePath} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return nil, fmt.Errorf("mkdir %s: %w", dir, err)
		}
	}

	// Ensure parent of socket path exists.
	if err := os.MkdirAll(filepath.Dir(paths.SockPath), 0o700); err != nil {
		return nil, fmt.Errorf("mkdir sock parent: %w", err)
	}

	if err := WritePID(paths.EphemeralPath); err != nil {
		return nil, fmt.Errorf("write pid: %w", err)
	}

	ctx, cancel := context.WithCancel(ctx)

	e := &Engo{
		Paths:    paths,
		ctx:      ctx,
		cancel:   cancel,
		NodePath: findNode(),
	}

	e.Supervisor = NewSupervisor(ctx, e.handleControlMessage)
	e.Supervisor.Start()

	return e, nil
}

// Serve spawns the Node.js daemon and blocks until the engo process is
// stopped. The Node.js daemon manages the Unix socket and CapTP
// connections; engo supervises it and all workers.
func (e *Engo) Serve() error {
	// Shut down gracefully on SIGINT / SIGTERM.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		select {
		case <-sigCh:
			e.Stop()
		case <-e.ctx.Done():
		}
	}()

	fmt.Fprintf(os.Stderr, "engo: starting (pid %d)\n", os.Getpid())

	// Spawn the Node.js daemon as the first subprocess.
	if err := e.spawnNodeDaemon(); err != nil {
		e.Stop()
		return fmt.Errorf("spawn node daemon: %w", err)
	}

	fmt.Fprintf(os.Stderr, "engo: node daemon started, waiting for socket\n")

	// Wait for the daemon socket to appear.
	if err := e.waitForSocket(10 * time.Second); err != nil {
		e.Stop()
		return fmt.Errorf("wait for socket: %w", err)
	}

	fmt.Fprintf(os.Stderr, "engo: ready (sock %s)\n", e.Paths.SockPath)

	// Block until context is cancelled.
	<-e.ctx.Done()
	return nil
}

// spawnNodeDaemon starts the Node.js daemon as a subprocess. It runs
// daemon-go.js (the engo-aware entry point) by default. The daemon
// receives its config as command-line arguments:
// [sockPath, statePath, ephemeralStatePath, cachePath].
func (e *Engo) spawnNodeDaemon() error {
	scriptPath := e.DaemonScriptPath
	if scriptPath == "" {
		// Default: find daemon-node.js relative to the engo binary or
		// via ENDO_DAEMON_PATH environment variable.
		scriptPath = os.Getenv("ENDO_DAEMON_PATH")
		if scriptPath == "" {
			return fmt.Errorf("ENDO_DAEMON_PATH not set and no DaemonScriptPath configured")
		}
	}

	args := []string{
		scriptPath,
		e.Paths.SockPath,
		e.Paths.StatePath,
		e.Paths.EphemeralPath,
		e.Paths.CachePath,
	}

	// Open log file for daemon stdout/stderr.
	logFile, err := os.OpenFile(e.Paths.LogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return fmt.Errorf("open log: %w", err)
	}

	// Create pipes for the envelope protocol (fd 3/4 in the child).
	childWriteR, childWriteW, err := os.Pipe()
	if err != nil {
		logFile.Close()
		return fmt.Errorf("pipe child→engo: %w", err)
	}
	engoWriteR, engoWriteW, err := os.Pipe()
	if err != nil {
		logFile.Close()
		childWriteR.Close()
		childWriteW.Close()
		return fmt.Errorf("pipe engo→child: %w", err)
	}

	cmd := exec.CommandContext(e.ctx, e.NodePath, args...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	// ExtraFiles[0] → fd 3: child writes envelopes to engo
	// ExtraFiles[1] → fd 4: child reads envelopes from engo
	cmd.ExtraFiles = []*os.File{childWriteW, engoWriteR}

	if err := cmd.Start(); err != nil {
		logFile.Close()
		childWriteR.Close()
		childWriteW.Close()
		engoWriteR.Close()
		engoWriteW.Close()
		return fmt.Errorf("start node daemon: %w", err)
	}

	// Close child-side pipe ends in the parent.
	childWriteW.Close()
	engoWriteR.Close()
	logFile.Close()

	e.DaemonHandle = e.Supervisor.AllocHandle()
	info := &WorkerInfo{
		Handle:  e.DaemonHandle,
		Cmd:     e.NodePath,
		Args:    args,
		PID:     cmd.Process.Pid,
		Started: time.Now(),
	}
	inbox := e.Supervisor.Register(e.DaemonHandle, info)

	// Send init envelope so the daemon knows its handle.
	initData := EncodeEnvelope(Envelope{
		Handle:  e.DaemonHandle,
		Verb:    "init",
		Payload: nil,
	})
	_ = WriteFrame(engoWriteW, initData)

	// Read goroutine: daemon→engo (fd 3)
	go func() {
		defer childWriteR.Close()
		for {
			data, err := ReadFrame(childWriteR)
			if err != nil {
				if err != io.EOF {
					fmt.Fprintf(os.Stderr, "engo: daemon read: %v\n", err)
				}
				return
			}
			env, err := DecodeEnvelope(data)
			if err != nil {
				fmt.Fprintf(os.Stderr, "engo: daemon decode: %v\n", err)
				continue
			}
			_ = e.Supervisor.Deliver(e.ctx, Message{
				From:     e.DaemonHandle,
				To:       env.Handle,
				Envelope: env,
			})
		}
	}()

	// Write goroutine: engo→daemon (fd 4)
	go func() {
		defer engoWriteW.Close()
		for {
			messages, err := inbox.Fetch(e.ctx)
			if err != nil {
				return
			}
			for _, msg := range messages {
				env := msg.Envelope
				if env.Verb != "init" {
					env.Handle = msg.From
				}
				data := EncodeEnvelope(env)
				if err := WriteFrame(engoWriteW, data); err != nil {
					fmt.Fprintf(os.Stderr, "engo: daemon write: %v\n", err)
					return
				}
				if msg.ResponseCh != nil {
					msg.ResponseCh <- Message{
						Envelope: Envelope{Verb: "ack"},
					}
				}
			}
		}
	}()

	// Wait goroutine: process cleanup
	go func() {
		_ = cmd.Wait()
		fmt.Fprintf(os.Stderr, "engo: node daemon exited\n")
		e.Supervisor.Unregister(e.DaemonHandle)
		// When the node daemon exits, stop the whole supervisor.
		e.Stop()
	}()

	return nil
}

// waitForSocket polls until the daemon's Unix socket is accepting
// connections or the timeout expires.
func (e *Engo) waitForSocket(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		select {
		case <-e.ctx.Done():
			return e.ctx.Err()
		default:
		}
		conn, err := net.Dial("unix", e.Paths.SockPath)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(50 * time.Millisecond)
	}
	return fmt.Errorf("socket %s not ready within %s", e.Paths.SockPath, timeout)
}

// Stop shuts down engo: cancels the context, waits for the supervisor
// (with a timeout), and cleans up.
func (e *Engo) Stop() {
	e.cancel()
	done := make(chan struct{})
	go func() {
		e.Supervisor.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		fmt.Fprintf(os.Stderr, "engo: supervisor wait timed out, forcing exit\n")
	}
	RemovePID(e.Paths.EphemeralPath)
}

// handleControlMessage processes messages addressed to handle 0 (the
// engo control plane).
func (e *Engo) handleControlMessage(msg Message) {
	switch msg.Envelope.Verb {
	case "ready":
		fmt.Fprintf(os.Stderr, "engo: daemon reports ready\n")

	case "spawn":
		command, args, err := DecodeSpawnRequest(msg.Envelope.Payload)
		if err != nil {
			e.respond(msg, Envelope{
				Verb:    "error",
				Payload: []byte(fmt.Sprintf("invalid spawn payload: %v", err)),
			})
			return
		}
		if e.SpawnSubprocess == nil {
			e.respond(msg, Envelope{
				Verb:    "error",
				Payload: []byte("subprocess spawner not configured"),
			})
			return
		}
		handle, err := e.SpawnSubprocess(e.ctx, e.Supervisor, command, args, msg.From)
		if err != nil {
			e.respond(msg, Envelope{
				Verb:    "error",
				Payload: []byte(err.Error()),
				Nonce:   msg.Envelope.Nonce,
			})
			return
		}
		e.Supervisor.SetParent(handle, msg.From)
		e.respond(msg, Envelope{
			Verb:    "spawned",
			Payload: EncodeHandle(handle),
			Nonce:   msg.Envelope.Nonce,
		})

	case "list":
		workers := e.Supervisor.Workers()
		e.respond(msg, Envelope{
			Verb:    "workers",
			Payload: EncodeWorkerList(workers),
		})

	default:
		if isDebug("ENGO_TRACE") {
			fmt.Fprintf(os.Stderr, "engo: unhandled control verb: %s\n", msg.Envelope.Verb)
		}
	}
}

// respond sends a reply back to the sender of a control message.
func (e *Engo) respond(msg Message, env Envelope) {
	_ = e.Supervisor.Deliver(e.ctx, Message{
		From:     0,
		To:       msg.From,
		Envelope: env,
	})
}

// EnsureRunning checks whether engo is already running. If not, it
// returns an error.
func EnsureRunning() (EndoPaths, error) {
	paths, err := ResolvePaths()
	if err != nil {
		return EndoPaths{}, err
	}
	pid, err := ReadPID(paths.EphemeralPath)
	if err != nil {
		return paths, fmt.Errorf("read pid: %w", err)
	}
	if pid == 0 || !IsProcessRunning(pid) {
		return paths, fmt.Errorf("engo is not running (start with: engo start)")
	}
	return paths, nil
}

// StartDetached spawns engo in a detached session with stdout and stderr
// redirected to the log file. It returns once the daemon socket is
// accepting connections or an error occurs.
func StartDetached(executable string) (EndoPaths, error) {
	paths, err := ResolvePaths()
	if err != nil {
		return EndoPaths{}, err
	}

	// Check if already running.
	pid, err := ReadPID(paths.EphemeralPath)
	if err == nil && pid != 0 && IsProcessRunning(pid) {
		return paths, nil
	}

	// Ensure state directory exists for the log file.
	if err := os.MkdirAll(paths.StatePath, 0o700); err != nil {
		return paths, fmt.Errorf("mkdir state: %w", err)
	}

	logFile, err := os.OpenFile(paths.LogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return paths, fmt.Errorf("open log: %w", err)
	}

	cmd := exec.Command(executable, "daemon")
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return paths, fmt.Errorf("start engo: %w", err)
	}

	// Detach: we do not wait on the child.
	_ = cmd.Process.Release()
	logFile.Close()

	// Poll until the socket is accepting connections.
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		conn, err := net.Dial("unix", paths.SockPath)
		if err == nil {
			conn.Close()
			return paths, nil
		}
		time.Sleep(50 * time.Millisecond)
	}

	return paths, fmt.Errorf("engo did not start within 10s (log: %s)", paths.LogPath)
}

// findNode locates the Node.js executable.
func findNode() string {
	if nodePath := os.Getenv("ENGO_NODE_PATH"); nodePath != "" {
		return nodePath
	}
	// Try common locations.
	for _, candidate := range []string{"node", "/usr/local/bin/node", "/usr/bin/node"} {
		if path, err := exec.LookPath(candidate); err == nil {
			return path
		}
	}
	return "node"
}
