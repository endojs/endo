package daemon

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"time"
)

// CBOR major types.
const (
	cborUint   = 0 << 5 // major 0: unsigned integer
	cborNegInt = 1 << 5 // major 1: negative integer (-1-n)
	cborBytes  = 2 << 5 // major 2: byte string
	cborText   = 3 << 5 // major 3: text string
	cborArray  = 4 << 5 // major 4: array
	cborMap    = 5 << 5 // major 5: map
)

// ---------------------------------------------------------------------------
// Low-level CBOR encoding (append to []byte)
// ---------------------------------------------------------------------------

func cborAppendHead(buf []byte, major byte, n uint64) []byte {
	switch {
	case n < 24:
		return append(buf, major|byte(n))
	case n <= 0xff:
		return append(buf, major|24, byte(n))
	case n <= 0xffff:
		return append(buf, major|25, byte(n>>8), byte(n))
	case n <= 0xffffffff:
		return append(buf, major|26, byte(n>>24), byte(n>>16), byte(n>>8), byte(n))
	default:
		return append(buf, major|27,
			byte(n>>56), byte(n>>48), byte(n>>40), byte(n>>32),
			byte(n>>24), byte(n>>16), byte(n>>8), byte(n))
	}
}

func cborAppendInt(buf []byte, n int64) []byte {
	if n >= 0 {
		return cborAppendHead(buf, cborUint, uint64(n))
	}
	return cborAppendHead(buf, cborNegInt, uint64(-1-n))
}

func cborAppendBytes(buf, data []byte) []byte {
	buf = cborAppendHead(buf, cborBytes, uint64(len(data)))
	return append(buf, data...)
}

func cborAppendText(buf []byte, s string) []byte {
	buf = cborAppendHead(buf, cborText, uint64(len(s)))
	return append(buf, s...)
}

func cborAppendArrayHeader(buf []byte, n int) []byte {
	return cborAppendHead(buf, cborArray, uint64(n))
}

func cborAppendMapHeader(buf []byte, n int) []byte {
	return cborAppendHead(buf, cborMap, uint64(n))
}

// ---------------------------------------------------------------------------
// Low-level CBOR decoding (from io.Reader)
// ---------------------------------------------------------------------------

func cborReadHead(r io.Reader) (major byte, val uint64, err error) {
	var b [1]byte
	if _, err = io.ReadFull(r, b[:]); err != nil {
		return 0, 0, err
	}
	major = b[0] & 0xe0
	info := b[0] & 0x1f
	if info < 24 {
		return major, uint64(info), nil
	}
	var size int
	switch info {
	case 24:
		size = 1
	case 25:
		size = 2
	case 26:
		size = 4
	case 27:
		size = 8
	default:
		return 0, 0, fmt.Errorf("cbor: unsupported additional info %d", info)
	}
	var tmp [8]byte
	if _, err = io.ReadFull(r, tmp[:size]); err != nil {
		return 0, 0, err
	}
	switch size {
	case 1:
		val = uint64(tmp[0])
	case 2:
		val = uint64(binary.BigEndian.Uint16(tmp[:2]))
	case 4:
		val = uint64(binary.BigEndian.Uint32(tmp[:4]))
	case 8:
		val = binary.BigEndian.Uint64(tmp[:8])
	}
	return major, val, nil
}

func cborReadInt(r io.Reader) (int64, error) {
	major, val, err := cborReadHead(r)
	if err != nil {
		return 0, err
	}
	switch major {
	case cborUint:
		return int64(val), nil
	case cborNegInt:
		return -1 - int64(val), nil
	default:
		return 0, fmt.Errorf("cbor: expected int, got major %d", major>>5)
	}
}

func cborReadBytes(r io.Reader) ([]byte, error) {
	major, val, err := cborReadHead(r)
	if err != nil {
		return nil, err
	}
	if major != cborBytes {
		return nil, fmt.Errorf("cbor: expected bytes (major 2), got major %d", major>>5)
	}
	data := make([]byte, val)
	_, err = io.ReadFull(r, data)
	return data, err
}

func cborReadText(r io.Reader) (string, error) {
	major, val, err := cborReadHead(r)
	if err != nil {
		return "", err
	}
	if major != cborText {
		return "", fmt.Errorf("cbor: expected text (major 3), got major %d", major>>5)
	}
	data := make([]byte, val)
	_, err = io.ReadFull(r, data)
	return string(data), err
}

func cborReadArrayHeader(r io.Reader) (int, error) {
	major, val, err := cborReadHead(r)
	if err != nil {
		return 0, err
	}
	if major != cborArray {
		return 0, fmt.Errorf("cbor: expected array (major 4), got major %d", major>>5)
	}
	return int(val), nil
}

func cborReadMapHeader(r io.Reader) (int, error) {
	major, val, err := cborReadHead(r)
	if err != nil {
		return 0, err
	}
	if major != cborMap {
		return 0, fmt.Errorf("cbor: expected map (major 5), got major %d", major>>5)
	}
	return int(val), nil
}

// cborSkip reads and discards one complete CBOR data item.
func cborSkip(r io.Reader) error {
	major, val, err := cborReadHead(r)
	if err != nil {
		return err
	}
	switch major {
	case cborUint, cborNegInt:
		// Already consumed.
	case cborBytes, cborText:
		_, err = io.CopyN(io.Discard, r, int64(val))
	case cborArray:
		for i := 0; i < int(val); i++ {
			if err = cborSkip(r); err != nil {
				return err
			}
		}
	case cborMap:
		for i := 0; i < int(val); i++ {
			if err = cborSkip(r); err != nil {
				return err
			}
			if err = cborSkip(r); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("cbor: cannot skip major %d", major>>5)
	}
	return err
}

// ---------------------------------------------------------------------------
// Wire framing — each message is a CBOR byte string (major 2) whose
// content is the CBOR-encoded envelope. This gives us length-prefixed
// framing that is itself valid sequential CBOR.
// ---------------------------------------------------------------------------

// WriteFrame writes data wrapped as a CBOR byte string.
func WriteFrame(w io.Writer, data []byte) error {
	header := cborAppendHead(nil, cborBytes, uint64(len(data)))
	if _, err := w.Write(header); err != nil {
		return err
	}
	_, err := w.Write(data)
	return err
}

// ReadFrame reads one CBOR byte string from the reader and returns its
// content.
func ReadFrame(r io.Reader) ([]byte, error) {
	return cborReadBytes(r)
}

// ---------------------------------------------------------------------------
// Envelope codec — 4-element CBOR array [handle, verb, payload, nonce]
// ---------------------------------------------------------------------------

// EncodeEnvelope marshals an Envelope as a 4-element CBOR array:
// [handle (int), verb (text), payload (bytes), nonce (int)].
func EncodeEnvelope(env Envelope) []byte {
	buf := cborAppendArrayHeader(nil, 4)
	buf = cborAppendInt(buf, int64(env.Handle))
	buf = cborAppendText(buf, env.Verb)
	if env.Payload == nil {
		buf = cborAppendBytes(buf, []byte{})
	} else {
		buf = cborAppendBytes(buf, env.Payload)
	}
	buf = cborAppendInt(buf, env.Nonce)
	return buf
}

// DecodeEnvelope unmarshals a 3- or 4-element CBOR array into an Envelope.
// If the array has 3 elements, Nonce defaults to 0.
func DecodeEnvelope(data []byte) (Envelope, error) {
	r := bytes.NewReader(data)
	n, err := cborReadArrayHeader(r)
	if err != nil {
		return Envelope{}, fmt.Errorf("decode envelope: %w", err)
	}
	if n != 3 && n != 4 {
		return Envelope{}, fmt.Errorf("decode envelope: expected 3 or 4 elements, got %d", n)
	}
	handle, err := cborReadInt(r)
	if err != nil {
		return Envelope{}, fmt.Errorf("decode envelope handle: %w", err)
	}
	verb, err := cborReadText(r)
	if err != nil {
		return Envelope{}, fmt.Errorf("decode envelope verb: %w", err)
	}
	payload, err := cborReadBytes(r)
	if err != nil {
		return Envelope{}, fmt.Errorf("decode envelope payload: %w", err)
	}
	var nonce int64
	if n == 4 {
		nonce, err = cborReadInt(r)
		if err != nil {
			return Envelope{}, fmt.Errorf("decode envelope nonce: %w", err)
		}
	}
	return Envelope{Handle: Handle(handle), Verb: verb, Payload: payload, Nonce: nonce}, nil
}

// ---------------------------------------------------------------------------
// Typed payload codecs for daemon control messages
// ---------------------------------------------------------------------------

// EncodeSpawnRequest encodes the payload for a "spawn" verb.
func EncodeSpawnRequest(command string, args []string) []byte {
	buf := cborAppendMapHeader(nil, 2)
	buf = cborAppendText(buf, "command")
	buf = cborAppendText(buf, command)
	buf = cborAppendText(buf, "args")
	buf = cborAppendArrayHeader(buf, len(args))
	for _, a := range args {
		buf = cborAppendText(buf, a)
	}
	return buf
}

// DecodeSpawnRequest decodes the payload from a "spawn" verb.
func DecodeSpawnRequest(data []byte) (command string, args []string, err error) {
	r := bytes.NewReader(data)
	n, err := cborReadMapHeader(r)
	if err != nil {
		return "", nil, err
	}
	for i := 0; i < n; i++ {
		key, err := cborReadText(r)
		if err != nil {
			return "", nil, err
		}
		switch key {
		case "command":
			command, err = cborReadText(r)
			if err != nil {
				return "", nil, err
			}
		case "args":
			arrLen, err := cborReadArrayHeader(r)
			if err != nil {
				return "", nil, err
			}
			args = make([]string, arrLen)
			for j := range args {
				args[j], err = cborReadText(r)
				if err != nil {
					return "", nil, err
				}
			}
		default:
			if err := cborSkip(r); err != nil {
				return "", nil, err
			}
		}
	}
	return command, args, nil
}

// EncodeHandle encodes a single Handle as a CBOR integer.
func EncodeHandle(h Handle) []byte {
	return cborAppendInt(nil, int64(h))
}

// DecodeHandle decodes a single Handle from a CBOR integer.
func DecodeHandle(data []byte) (Handle, error) {
	r := bytes.NewReader(data)
	n, err := cborReadInt(r)
	if err != nil {
		return 0, err
	}
	return Handle(n), nil
}

// EncodeWorkerList encodes a slice of WorkerInfo as a CBOR array of maps.
func EncodeWorkerList(workers []WorkerInfo) []byte {
	buf := cborAppendArrayHeader(nil, len(workers))
	for _, w := range workers {
		buf = cborAppendMapHeader(buf, 5)
		buf = cborAppendText(buf, "handle")
		buf = cborAppendInt(buf, int64(w.Handle))
		buf = cborAppendText(buf, "command")
		buf = cborAppendText(buf, w.Cmd)
		buf = cborAppendText(buf, "args")
		buf = cborAppendArrayHeader(buf, len(w.Args))
		for _, a := range w.Args {
			buf = cborAppendText(buf, a)
		}
		buf = cborAppendText(buf, "pid")
		buf = cborAppendInt(buf, int64(w.PID))
		buf = cborAppendText(buf, "started")
		buf = cborAppendText(buf, w.Started.Format(time.RFC3339))
	}
	return buf
}

// DecodeWorkerList decodes a CBOR array of maps into a slice of WorkerInfo.
func DecodeWorkerList(data []byte) ([]WorkerInfo, error) {
	r := bytes.NewReader(data)
	n, err := cborReadArrayHeader(r)
	if err != nil {
		return nil, err
	}
	workers := make([]WorkerInfo, n)
	for i := range workers {
		mapLen, err := cborReadMapHeader(r)
		if err != nil {
			return nil, err
		}
		for j := 0; j < mapLen; j++ {
			key, err := cborReadText(r)
			if err != nil {
				return nil, err
			}
			switch key {
			case "handle":
				v, err := cborReadInt(r)
				if err != nil {
					return nil, err
				}
				workers[i].Handle = Handle(v)
			case "command":
				v, err := cborReadText(r)
				if err != nil {
					return nil, err
				}
				workers[i].Cmd = v
			case "args":
				arrLen, err := cborReadArrayHeader(r)
				if err != nil {
					return nil, err
				}
				workers[i].Args = make([]string, arrLen)
				for k := range workers[i].Args {
					workers[i].Args[k], err = cborReadText(r)
					if err != nil {
						return nil, err
					}
				}
			case "pid":
				v, err := cborReadInt(r)
				if err != nil {
					return nil, err
				}
				workers[i].PID = int(v)
			case "started":
				v, err := cborReadText(r)
				if err != nil {
					return nil, err
				}
				workers[i].Started, err = time.Parse(time.RFC3339, v)
				if err != nil {
					return nil, err
				}
			default:
				if err := cborSkip(r); err != nil {
					return nil, err
				}
			}
		}
	}
	return workers, nil
}
