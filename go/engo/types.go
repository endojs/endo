package main

import "context"

type ID int

type RunWorker func(
	ctx context.Context,
	cancel func(),
	pid, id ID,
	fetch func(context.Context) ([]Message, error),
	deliver func(context.Context, Message) error,
	getPortClosedCh func(ID, ID) (chan Message, error),
) error

type Meter = struct {
	CurrentHeapCount uint64    `json:"currentHeapCount"`
	Compute          uint64    `json:"compute"`
	Allocate         uint64    `json:"allocate"`
	Timestamps       []float64 `json:"timestamps"`
}

type Headers = struct {
	Type  string `json:"type"` // terminate, system, send, close, open, ok, error, ack
	Sync  bool   `json:"sync"`
	From  ID     `json:"from"`
	To    ID     `json:"to"`
	Port  ID     `json:"port"`
	Error string `json:"error,omitempty"`
}

type Message struct {
	Headers    Headers
	Body       []byte
	ResponseCh chan Message // nil implies one-way send-only
	Meter      *Meter
}
