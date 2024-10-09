package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
)

type Supervisor struct {
	mx      sync.RWMutex
	wg      sync.WaitGroup
	portWg  sync.WaitGroup
	ctx     context.Context
	cancel  func()
	parents map[ID]ID
	inboxes map[ID]Mailbox
	ports   chan map[ID]map[ID]chan Message
	outbox  Mailbox
	prevId  ID
}

func NewSupervisor(ctx context.Context) *Supervisor {
	ctx, cancel := context.WithCancel(ctx)

	ports := make(chan map[ID]map[ID]chan Message, 1)
	ports <- make(map[ID]map[ID]chan Message)

	return &Supervisor{
		ctx:     ctx,
		cancel:  cancel,
		inboxes: make(map[ID]Mailbox, 1),
		parents: make(map[ID]ID),
		ports:   ports,
		outbox:  NewMailbox(),
	}
}

func (s *Supervisor) PortClosedCh(id ID, port ID) (chan Message, error) {
	select {
	case <-s.ctx.Done():
		return nil, s.ctx.Err()
	case ports := <-s.ports:
		defer func() {
			s.ports <- ports
		}()
		workerPorts := ports[id]
		if workerPorts == nil {
			return nil, fmt.Errorf("no worker=%d", id)
		}
		portCh := workerPorts[port]
		if portCh == nil {
			return nil, fmt.Errorf("no port=%d worker=%d", port, id)
		}
		return portCh, nil
	}
}

func (s *Supervisor) OpenPort(id, port ID) chan Message {
	responseCh := make(chan Message, 1)
	s.outbox.Deliver(s.ctx, Message{
		Headers: Headers{
			From: id,
			Port: port,
			Type: "open",
			Sync: true,
		},
		ResponseCh: responseCh,
	})
	return responseCh
}

func (s *Supervisor) ClosePort(id, port ID) chan Message {
	responseCh := make(chan Message, 1)
	s.outbox.Deliver(s.ctx, Message{
		Headers: Headers{
			From: id,
			Port: port,
			Type: "close",
			Sync: true,
		},
		ResponseCh: responseCh,
	})
	return responseCh
}

func (s *Supervisor) Spawn(pid ID, runWorker RunWorker) ID {
	s.mx.Lock()
	defer s.mx.Unlock()

	trackHandles := isDebug("ENGO_TRACK")

	ctx, cancel := context.WithCancel(s.ctx)

	s.prevId += 1
	id := s.prevId

	inbox := NewMailbox()
	s.inboxes[id] = inbox

	// TODO consider failure to spawn if timely acquisition is not possible in the contxt
	ports := <-s.ports
	ports[id] = make(map[ID]chan Message)
	s.ports <- ports

	if trackHandles {
		fmt.Fprintf(os.Stderr, "+1 worker=%d\n", id)
	}
	s.wg.Add(1)
	go func() {
		defer func() {
			if trackHandles {
				fmt.Fprintf(os.Stderr, "-1 worker=%d\n", id)
			}
			s.wg.Done()
		}()
		err := runWorker(ctx, cancel, pid, id, inbox.Fetch, s.outbox.Deliver, s.PortClosedCh)
		if err != nil && err != context.Canceled && err != io.EOF {
			panic(err)
		}
	}()

	s.parents[id] = pid

	return id
}

func (s *Supervisor) canBlock(caller, callee ID) bool {
	s.mx.RLock()
	defer s.mx.RUnlock()

	if caller < 0 {
		return true
	}

	// ids start at 1, 0 means no parent, -1 means no real parent
	for caller != 0 {
		parent, ok := s.parents[caller]
		if !ok {
			return false
		}
		if callee == parent {
			return true
		}
		caller = parent
	}

	return false
}

func (s *Supervisor) Start() {

	trackHandles := isDebug("ENGO_TRACK")
	traceMessages := isDebug("ENGO_TRACE")

	s.wg.Add(1)
	if trackHandles {
		fmt.Fprintf(os.Stderr, "+1 supervisor\n")
	}
	go func() {
		defer func() {
			if trackHandles {
				fmt.Fprintf(os.Stderr, "-1 supervisor\n")
			}
			s.wg.Done()
		}()
		for {
			if messages, err := s.outbox.Fetch(s.ctx); err != nil {
				break
			} else {
				for _, message := range messages {
					if traceMessages {
						headerBytes, _ := json.Marshal(message.Headers)
						fmt.Fprintf(os.Stderr, "># %s\n", headerBytes)
						fmt.Fprintf(os.Stderr, ">> %s\n", message.Body)
					}

					if message.Headers.To == 0 {
						switch message.Headers.Type {
						case "open":
							select {
							case <-s.ctx.Done():
								return
							case ports := <-s.ports:
								if workerPorts, ok := ports[message.Headers.From]; !ok {
									message.ResponseCh <- Message{
										Headers: Headers{
											Type:  "error",
											Error: fmt.Sprintf("no worker=%d", message.Headers.From),
										},
									}
								} else if _, ok := workerPorts[message.Headers.Port]; ok {
									message.ResponseCh <- Message{
										Headers: Headers{
											Type:  "error",
											Error: fmt.Sprintf("port already open worker=%d port=%id", message.Headers.From, message.Headers.Port),
										},
									}
								} else {
									workerPorts[message.Headers.Port] = make(chan Message, 1)
									message.ResponseCh <- Message{
										Headers: Headers{
											Type: "ok",
										},
									}
								}
								s.portWg.Add(1)
								if trackHandles {
									fmt.Fprintf(os.Stderr, "+1 port=%d worker=%d\n", message.Headers.From, message.Headers.Port)
								}
								s.ports <- ports
							}
						case "close":
							select {
							case <-s.ctx.Done():
								return
							case ports := <-s.ports:
								if workerPorts, ok := ports[message.Headers.From]; !ok {
									message.ResponseCh <- Message{
										Headers: Headers{
											Type:  "error",
											Error: fmt.Sprintf("no worker worker=%d", message.Headers.From),
										},
									}
								} else if portCh, ok := workerPorts[message.Headers.Port]; !ok {
									message.ResponseCh <- Message{
										Headers: Headers{
											Type:  "error",
											Error: fmt.Sprintf("no port worker=%d port=%id", message.Headers.From, message.Headers.Port),
										},
									}
								} else {
									portCh <- message
									delete(workerPorts, message.Headers.Port)
									s.portWg.Done()
									if trackHandles {
										fmt.Fprintf(os.Stderr, "-1 port=%d worker=%d\n", message.Headers.From, message.Headers.Port)
									}
									message.ResponseCh <- Message{
										Headers: Headers{
											Type: "ok",
										},
									}
								}
								s.ports <- ports
							}
						default:
							message.ResponseCh <- Message{
								Headers: Headers{
									Type:  "error",
									Error: fmt.Sprintf("unrecognized message type=%s in message from worker=%d", message.Headers.Type, message.Headers.From),
								},
							}
						}
					} else {
						if message.ResponseCh != nil &&
							!s.canBlock(message.Headers.From, message.Headers.To) {
							// In defense against deadlock, we pre-ack any remaining messages
							if message.Headers.Sync {
								message.ResponseCh <- Message{
									Headers: Headers{
										Type:  "error",
										Error: "can only sync system call parent or ancestor vats",
										To:    message.Headers.From,
									},
								}
								message.ResponseCh = nil
							} else {
								message.ResponseCh <- Message{
									Headers: Headers{
										Type: "ack",
										To:   message.Headers.From,
									},
								}
								message.ResponseCh = nil
							}
						}

						if message.Headers.To < 0 {
							// TODO make the main thread an honorary worker so it can receive
							// messages
						} else if inbox, ok := s.inboxes[message.Headers.To]; !ok {
							fmt.Fprintf(os.Stderr, "! return to sender, address unknown, no such number, no such zone\n")
						} else if err := inbox.Deliver(s.ctx, message); err != nil {
							fmt.Fprintf(os.Stderr, "! %s\n", err)
						}

					}
				}
			}
		}
	}()
}

func (s *Supervisor) Deliver(ctx context.Context, message Message) error {
	return s.outbox.Deliver(ctx, message)
}

func (s *Supervisor) Stop() {
	s.cancel()
}

func (s *Supervisor) WaitPorts() {
	s.portWg.Wait()
}

func (s *Supervisor) Wait() {
	s.wg.Wait()
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
