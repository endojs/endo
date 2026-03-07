package daemon

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
)

// syncCallKey identifies a pending synchronous call by the caller's handle
// and the caller-assigned nonce.
type syncCallKey struct {
	caller Handle
	nonce  int64
}

// Supervisor is a handle-based message router. Workers send messages to the
// shared outbox; the supervisor's routing loop dispatches them to per-handle
// inboxes. Messages addressed to handle 0 are control-plane commands handled
// by the daemon itself.
type Supervisor struct {
	mu           sync.RWMutex
	wg           sync.WaitGroup
	ctx          context.Context
	cancel       context.CancelFunc
	inboxes      map[Handle]Mailbox
	workers      map[Handle]*WorkerInfo
	parents      map[Handle]Handle
	pendingSyncs map[syncCallKey]Handle // callee handle for pending sync calls
	outbox       Mailbox
	nextHandle   atomic.Int64
	onControl    func(Message) // handler for handle-0 messages
}

// NewSupervisor creates a Supervisor with the given context. The onControl
// callback is invoked for every message addressed to handle 0 (the daemon
// control plane).
func NewSupervisor(ctx context.Context, onControl func(Message)) *Supervisor {
	ctx, cancel := context.WithCancel(ctx)
	s := &Supervisor{
		ctx:          ctx,
		cancel:       cancel,
		inboxes:      make(map[Handle]Mailbox),
		workers:      make(map[Handle]*WorkerInfo),
		parents:      make(map[Handle]Handle),
		pendingSyncs: make(map[syncCallKey]Handle),
		outbox:       NewMailbox(),
		onControl:    onControl,
	}
	return s
}

// AllocHandle returns the next monotonically increasing handle.
func (s *Supervisor) AllocHandle() Handle {
	return Handle(s.nextHandle.Add(1))
}

// Register creates an inbox for a handle and records worker metadata.
// The caller is responsible for reading from the returned Mailbox.
func (s *Supervisor) Register(h Handle, info *WorkerInfo) Mailbox {
	s.mu.Lock()
	defer s.mu.Unlock()
	inbox := NewMailbox()
	s.inboxes[h] = inbox
	if info != nil {
		s.workers[h] = info
	}
	return inbox
}

// Unregister removes the inbox, metadata, and parent record for a handle.
func (s *Supervisor) Unregister(h Handle) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.inboxes, h)
	delete(s.workers, h)
	delete(s.parents, h)
}

// SetParent records that child was spawned by parent. This is used by
// canBlock to determine whether synchronous calls are permitted.
func (s *Supervisor) SetParent(child, parent Handle) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.parents[child] = parent
}

// canBlock returns true if caller is allowed to make a synchronous call
// to callee. A sync call is permitted only if callee is an ancestor of
// caller in the spawn tree, or if callee is handle 0 (the control plane).
func (s *Supervisor) canBlock(caller, callee Handle) bool {
	// Control plane (handle 0) — always allowed.
	if callee == 0 {
		return true
	}
	// Walk ancestor chain.
	s.mu.RLock()
	defer s.mu.RUnlock()
	current := caller
	for current != 0 {
		parent, ok := s.parents[current]
		if !ok {
			return false
		}
		if callee == parent {
			return true
		}
		current = parent
	}
	return false
}

// Workers returns a snapshot of all registered worker metadata.
func (s *Supervisor) Workers() []WorkerInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]WorkerInfo, 0, len(s.workers))
	for _, w := range s.workers {
		out = append(out, *w)
	}
	return out
}

// Start launches the supervisor's routing goroutine. It reads batches from
// the outbox and dispatches each message to the appropriate inbox.
func (s *Supervisor) Start() {
	trace := isDebug("ENGO_TRACE")

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		for {
			messages, err := s.outbox.Fetch(s.ctx)
			if err != nil {
				return
			}
			for _, msg := range messages {
				if trace {
					fmt.Fprintf(os.Stderr, "route: from=%d to=%d verb=%s\n",
						msg.From, msg.To, msg.Envelope.Verb)
				}

				if msg.To == 0 {
					if s.onControl != nil {
						s.onControl(msg)
					}
					continue
				}

				s.mu.RLock()
				inbox, ok := s.inboxes[msg.To]
				s.mu.RUnlock()

				if !ok {
					if trace {
						fmt.Fprintf(os.Stderr, "route: no inbox for handle=%d\n", msg.To)
					}
					if msg.ResponseCh != nil {
						msg.ResponseCh <- Message{
							Envelope: Envelope{
								Verb:    "error",
								Payload: []byte(fmt.Sprintf("no such handle %d", msg.To)),
							},
						}
					}
					continue
				}

				// Enforce canBlock for synchronous calls (Nonce > 0).
				if msg.Envelope.Nonce > 0 && msg.From != 0 {
					// Check if this is a response to a pending sync call.
					respKey := syncCallKey{caller: msg.To, nonce: msg.Envelope.Nonce}
					if callee, pending := s.pendingSyncs[respKey]; pending && callee == msg.From {
						// This is a response — allow it through and clean up.
						delete(s.pendingSyncs, respKey)
					} else if !s.canBlock(msg.From, msg.To) {
						if trace {
							fmt.Fprintf(os.Stderr, "route: canBlock denied from=%d to=%d\n", msg.From, msg.To)
						}
						if msg.ResponseCh != nil {
							msg.ResponseCh <- Message{
								Envelope: Envelope{
									Verb:    "error",
									Payload: []byte(fmt.Sprintf("sync call from %d to %d denied: not an ancestor", msg.From, msg.To)),
								},
							}
						}
						continue
					} else {
						// Allowed sync call — record it so we recognize the response.
						callKey := syncCallKey{caller: msg.From, nonce: msg.Envelope.Nonce}
						s.pendingSyncs[callKey] = msg.To
					}
				}

				if err := inbox.Deliver(s.ctx, msg); err != nil {
					if trace {
						fmt.Fprintf(os.Stderr, "route: deliver error: %v\n", err)
					}
				}
			}
		}
	}()
}

// Deliver enqueues a message into the supervisor's outbox for routing.
func (s *Supervisor) Deliver(ctx context.Context, msg Message) error {
	return s.outbox.Deliver(ctx, msg)
}

// Stop cancels the supervisor context, which will cause the routing loop
// and all workers to wind down.
func (s *Supervisor) Stop() {
	s.cancel()
}

// Wait blocks until the routing goroutine has exited.
func (s *Supervisor) Wait() {
	s.wg.Wait()
}

// Done returns the supervisor's context done channel.
func (s *Supervisor) Done() <-chan struct{} {
	return s.ctx.Done()
}

// Context returns the supervisor's context.
func (s *Supervisor) Context() context.Context {
	return s.ctx
}

func isDebug(term string) bool {
	debug := os.Getenv("DEBUG")
	for _, token := range strings.Split(debug, ",") {
		if token == term {
			return true
		}
	}
	return false
}
