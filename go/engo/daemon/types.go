package daemon

import "time"

// Handle is an opaque daemon-assigned ID. Handle 0 is reserved for the
// daemon control plane.
type Handle int64

// Envelope is the on-the-wire message format: a 4-element CBOR array
// [handle, verb, payload, nonce]. When nonce is 0 the message is
// fire-and-forget (the 4th element may be omitted on the wire for
// backward compatibility).
type Envelope struct {
	Handle  Handle
	Verb    string
	Payload []byte
	Nonce   int64
}

// Message is the internal routing wrapper that adds sender information
// and an optional response channel.
type Message struct {
	From       Handle
	To         Handle
	Envelope   Envelope
	ResponseCh chan Message
}

// WorkerInfo holds metadata about a spawned worker process.
type WorkerInfo struct {
	Handle  Handle    `json:"handle"`
	Cmd     string    `json:"command"`
	Args    []string  `json:"args"`
	PID     int       `json:"pid"`
	Started time.Time `json:"started"`
}
