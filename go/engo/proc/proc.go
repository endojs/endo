package proc

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"

	"endojs.org/go/engo/daemon"
)

// Process starts an external process with two extra pipe pairs wired
// to fd 3 (child writes to daemon) and fd 4 (daemon writes to child).
// It registers the worker with the supervisor and starts read/write/wait
// goroutines.
func Process(ctx context.Context, sup *daemon.Supervisor, command string, args []string, parentHandle daemon.Handle) (daemon.Handle, error) {
	handle := sup.AllocHandle()

	// Pipe pair 1: child writes (fd 3) → daemon reads
	childWriteR, childWriteW, err := os.Pipe()
	if err != nil {
		return 0, fmt.Errorf("pipe child→daemon: %w", err)
	}

	// Pipe pair 2: daemon writes → child reads (fd 4)
	daemonWriteR, daemonWriteW, err := os.Pipe()
	if err != nil {
		childWriteR.Close()
		childWriteW.Close()
		return 0, fmt.Errorf("pipe daemon→child: %w", err)
	}

	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	// fd 0=stdin, 1=stdout, 2=stderr are inherited.
	// ExtraFiles[0] → fd 3: child writes to daemon via this pipe end
	// ExtraFiles[1] → fd 4: child reads from daemon via this pipe end
	cmd.ExtraFiles = []*os.File{childWriteW, daemonWriteR}

	if err := cmd.Start(); err != nil {
		childWriteR.Close()
		childWriteW.Close()
		daemonWriteR.Close()
		daemonWriteW.Close()
		return 0, fmt.Errorf("start worker: %w", err)
	}

	// Close the child-side pipe ends in the parent process.
	childWriteW.Close()
	daemonWriteR.Close()

	info := &daemon.WorkerInfo{
		Handle:  handle,
		Cmd:     command,
		Args:    args,
		PID:     cmd.Process.Pid,
		Started: time.Now(),
	}
	inbox := sup.Register(handle, info)

	// Send initial "init" envelope to the worker so it knows its handle.
	initData := daemon.EncodeEnvelope(daemon.Envelope{
		Handle:  handle,
		Verb:    "init",
		Payload: nil,
	})
	_ = daemon.WriteFrame(daemonWriteW, initData)

	// Read goroutine: child→daemon (fd 3)
	go func() {
		defer childWriteR.Close()
		for {
			data, err := daemon.ReadFrame(childWriteR)
			if err != nil {
				if err != io.EOF {
					fmt.Fprintf(os.Stderr, "worker %d read: %v\n", handle, err)
				}
				return
			}
			env, err := daemon.DecodeEnvelope(data)
			if err != nil {
				fmt.Fprintf(os.Stderr, "worker %d decode: %v\n", handle, err)
				continue
			}
			_ = sup.Deliver(ctx, daemon.Message{
				From:     handle,
				To:       env.Handle,
				Envelope: env,
			})
		}
	}()

	// Write goroutine: daemon→child (fd 4)
	go func() {
		defer daemonWriteW.Close()
		for {
			messages, err := inbox.Fetch(ctx)
			if err != nil {
				return
			}
			for _, msg := range messages {
				// Rewrite Handle to the sender's handle so the worker
				// knows who sent the message. The init message is a
				// special case: it keeps Handle = worker's own handle.
				env := msg.Envelope
				if env.Verb != "init" {
					env.Handle = msg.From
				}
				data := daemon.EncodeEnvelope(env)
				if err := daemon.WriteFrame(daemonWriteW, data); err != nil {
					fmt.Fprintf(os.Stderr, "worker %d write: %v\n", handle, err)
					return
				}
				if msg.ResponseCh != nil {
					msg.ResponseCh <- daemon.Message{
						Envelope: daemon.Envelope{Verb: "ack"},
					}
				}
			}
		}
	}()

	// Wait goroutine: process cleanup and exit notification
	go func() {
		_ = cmd.Wait()
		// Notify the parent (daemon) that this worker exited.
		_ = sup.Deliver(ctx, daemon.Message{
			From:     handle,
			To:       parentHandle,
			Envelope: daemon.Envelope{Handle: handle, Verb: "exited"},
		})
		sup.Unregister(handle)
	}()

	return handle, nil
}
