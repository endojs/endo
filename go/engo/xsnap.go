package main

// every pair of messages is a syscall with headers and body

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"

	"github.com/markdingo/netstring"
)

//go:embed xsnap.js
var xsnapRuntime []byte

type XsnapWorker struct {
	ctx     context.Context
	cancel  func()
	id      ID
	pid     ID
	fetch   func(context.Context) ([]Message, error)
	deliver func(context.Context, Message) error
	nsdec   *netstring.Decoder
	nsenc   *netstring.Encoder
	writer  *os.File
}

func RunXsnapWorker(
	ctx context.Context,
	cancel func(),
	pid ID,
	id ID,
	fetch func(context.Context) ([]Message, error),
	deliver func(context.Context, Message) error,
	getPortClosedCh func(ID, ID) (chan Message, error),
) error {
	w := &XsnapWorker{
		ctx:     ctx,
		cancel:  cancel,
		id:      id,
		pid:     pid,
		fetch:   fetch,
		deliver: deliver,
	}

	cmd := exec.CommandContext(ctx, os.Args[0])
	cmd.Env = append([]string{"RUN_AS_XSNAP=1"}, os.Environ()...)

	r1, w1, err := os.Pipe()
	if err != nil {
		return err
	}
	r2, w2, err := os.Pipe()
	if err != nil {
		return err
	}

	cmd.WaitDelay = time.Second * 5
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	cmd.ExtraFiles = []*os.File{r1, w2}

	cmd.Start()

	go func() {
		<-ctx.Done()
		w1.Close()
	}()

	// Release our side of the file writer (the child process must also close for
	// our reader to EOF
	w2.Close()

	w.nsenc = netstring.NewEncoder(w1)
	w.nsdec = netstring.NewDecoder(r2)
	w.writer = w1

	w.nsenc.Encode(netstring.NoKey, append([]byte(`e`), xsnapRuntime...))
	if _, err := w.readResponseBytes(); err != nil {
		return err
	}

	for {
		if messages, err := fetch(ctx); err != nil {
			return err
		} else {
			for _, message := range messages {
				w.handleCommand(message)
			}
		}
	}

	return nil
}

func parseMeteredBody(meteredBodyBytes []byte) (*Meter, []byte, error) {
	index := bytes.Index(meteredBodyBytes, []byte{'\x01'})
	if index < 0 {
		return nil, nil, fmt.Errorf("invalid metered message, must have \\x01 delimiter")
	}
	meterBytes := meteredBodyBytes[:index]
	bodyBytes := meteredBodyBytes[index+1:]
	var meter Meter
	if err := json.Unmarshal(meterBytes, &meter); err != nil {
		return nil, nil, fmt.Errorf("invalid metered message, cannot parse JSON meter: %w", err)
	}
	return &meter, bodyBytes, nil
}

func parseMeteredMessageBytesInto(message *Message, meteredMessageBytes []byte) error {
	if meter, messageBytes, err := parseMeteredBody(meteredMessageBytes); err != nil {
		return err
	} else {
		message.Meter = meter
		return parseMessageInto(message, messageBytes)
	}
}

func parseMessageInto(message *Message, messageBytes []byte) error {
	index := bytes.Index(messageBytes, []byte{'\x01'})
	if index < 0 {
		return fmt.Errorf("invalid message, must have \\x01 delimiter")
	}
	headersBytes := messageBytes[:index]
	bodyBytes := messageBytes[index+1:]
	if err := json.Unmarshal(headersBytes, &message.Headers); err != nil {
		return fmt.Errorf("invalid message, cannot parse JSON headers: %w", err)
	}
	message.Body = bodyBytes
	return nil
}

func formatMessage(messageBytes []byte, msg Message) ([]byte, error) {
	headersBytes, err := json.Marshal(msg.Headers)
	if err != nil {
		return nil, err
	}
	messageBytes = append(messageBytes, headersBytes...)
	messageBytes = append(messageBytes, '\x01')
	messageBytes = append(messageBytes, msg.Body...)
	return messageBytes, nil
}

func (w *XsnapWorker) readResponseBytes() ([]byte, error) {
	prefixedResponseBytes, err := w.nsdec.Decode()
	if err != nil {
		return nil, err
	}
	if len(prefixedResponseBytes) < 1 {
		return nil, errors.New("expected command prefix from xsnap-worker")
	}
	prefix := prefixedResponseBytes[0]
	messageBytes := prefixedResponseBytes[1:]

	switch prefix {
	case '!':
		return nil, errors.New(string(messageBytes))
	case '.':
		return messageBytes, nil
	case '?':
		w.issueCommand(messageBytes)
		return w.readResponseBytes()
	default:
		return nil, fmt.Errorf("unexpected command prefix %q from xsnap-worker", prefix)
	}
}

func (w *XsnapWorker) readResponseInto(response *Message) error {
	if messageBytes, err := w.readResponseBytes(); err != nil {
		return err
	} else if err := parseMeteredMessageBytesInto(response, messageBytes); err != nil {
		return err
	}
	return nil
}

func (w *XsnapWorker) issueCommand(messageBytes []byte) {
	var request, response Message

	if err := parseMessageInto(&request, messageBytes); err != nil {
		panic(err)
	}

	request.Headers.From = w.id
	request.ResponseCh = make(chan Message, 1)

	if err := w.deliver(w.ctx, request); err != nil {
		fmt.Printf("delivery error %s\n", err)
		return
	}

	select {
	case <-w.ctx.Done():
		return
	case response = <-request.ResponseCh:
	}

	if responseBytes, err := formatMessage([]byte{'/'}, response); err != nil {
		panic(err)
	} else if err := w.nsenc.Encode(netstring.NoKey, responseBytes); err != nil {
		panic(err)
	}
}

func (w *XsnapWorker) handleCommand(request Message) {
	err := w.handleCommandError(request)
	if err != nil && err != io.EOF && err != context.Canceled {
		panic(err)
	}
}

func (w *XsnapWorker) handleCommandError(request Message) error {
	if request.Headers.Type == "terminate" {
		w.cancel()
		return nil
	}
	var response Message

	if requestBytes, err := formatMessage([]byte{'?'}, request); err != nil {
		return err
	} else if err := w.nsenc.Encode(netstring.NoKey, requestBytes); err != nil {
		return err
	} else if err := w.readResponseInto(&response); err != nil {
		return err
	} else if request.ResponseCh != nil {
		// synchronous request
		response.Headers.To = request.Headers.From
		response.Headers.From = request.Headers.To
		response.Headers.Port = request.Headers.Port
		request.ResponseCh <- response
	} else if len(response.Body) > 0 {
		// return fmt.Errorf("unexpected response body for request type=%s from=%d to=%d body: %s", request.Headers.Type, request.Headers.From, request.Headers.To, string(response.Body))
		// TODO if the request is asynchronous but responded with a non-empty body,
		// that body is getting dropped and should not have been sent.
		// consider sending a message back to to xsnap to note the error, or just log
	}
	return nil
}
