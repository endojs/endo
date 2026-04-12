package daemon

import "context"

// Mailbox is a lock-free dual-channel mailbox for delivering and fetching
// batches of messages. Exactly one of the two channels always holds the
// current batch: Empty when there are no pending messages, NonEmpty when
// there are.
type Mailbox struct {
	Empty    chan []Message
	NonEmpty chan []Message
}

// NewMailbox returns a ready-to-use Mailbox.
func NewMailbox() Mailbox {
	mailbox := Mailbox{
		Empty:    make(chan []Message, 1),
		NonEmpty: make(chan []Message, 1),
	}
	mailbox.Empty <- nil
	return mailbox
}

// Deliver appends a message to the mailbox. It blocks only until the
// current batch can be swapped, or the context is cancelled.
func (mailbox Mailbox) Deliver(ctx context.Context, message Message) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case messages := <-mailbox.Empty:
		mailbox.NonEmpty <- append(messages, message)
	case messages := <-mailbox.NonEmpty:
		mailbox.NonEmpty <- append(messages, message)
	}
	return nil
}

// Fetch waits for and returns the current batch of messages, then resets
// the mailbox to empty.
func (mailbox Mailbox) Fetch(ctx context.Context) ([]Message, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case messages := <-mailbox.NonEmpty:
		mailbox.Empty <- nil
		return messages, nil
	}
}
