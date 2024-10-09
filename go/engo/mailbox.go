package main

import "context"

type Mailbox struct {
	Empty    chan []Message
	NonEmpty chan []Message
}

func NewMailbox() Mailbox {
	mailbox := Mailbox{
		Empty:    make(chan []Message, 1),
		NonEmpty: make(chan []Message, 1),
	}
	mailbox.Empty <- nil
	return mailbox
}

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

func (mailbox Mailbox) Fetch(ctx context.Context) ([]Message, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case messages := <-mailbox.NonEmpty:
		mailbox.Empty <- nil
		return messages, nil
	}
}
