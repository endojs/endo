package main

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"
)

// TestBufferSizeConfiguration verifies that the initial buffer size can be configured
// via environment variable
func TestBufferSizeConfiguration(t *testing.T) {
	// Save original env
	original := os.Getenv("ENGO_BUFFER_SIZE")
	defer os.Setenv("ENGO_BUFFER_SIZE", original)

	tests := []struct {
		name     string
		envValue string
		expected int
	}{
		{"default", "", defaultWasmBufferSize},           // 64KB default
		{"custom small", "1000", 1000},
		{"custom 64k", "65536", 65536},
		{"custom 1MB", "1048576", 1048576},
		{"exceeds max", "5000000", maxWasmBufferSize},    // Should cap at 4MB max
		{"invalid", "notanumber", defaultWasmBufferSize},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			os.Setenv("ENGO_BUFFER_SIZE", tc.envValue)
			got := getInitialBufferSize()
			if got != tc.expected {
				t.Errorf("getInitialBufferSize() = %d, want %d", got, tc.expected)
			}
		})
	}
}

// TestErrMessageTooLarge verifies the error type is correct
func TestErrMessageTooLarge(t *testing.T) {
	// Create an error wrapping ErrMessageTooLarge
	err := errors.Join(ErrMessageTooLarge, errors.New("some detail"))

	if !errors.Is(err, ErrMessageTooLarge) {
		t.Error("errors.Is should recognize ErrMessageTooLarge")
	}
}

// TestGracefulShutdownError verifies that ErrMessageTooLarge triggers graceful shutdown
func TestGracefulShutdownError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{"ErrMessageTooLarge", ErrMessageTooLarge, true},
		{"wrapped ErrMessageTooLarge", errors.Join(errors.New("wrapper"), ErrMessageTooLarge), true},
		{"message contains error string", errors.New("message exceeds buffer size: too big"), true},
		{"unrelated error", errors.New("some other error"), false},
		{"context canceled", context.Canceled, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := isGracefulShutdownError(tc.err)
			if got != tc.expected {
				t.Errorf("isGracefulShutdownError(%v) = %v, want %v", tc.err, got, tc.expected)
			}
		})
	}
}

// TestSupervisorGracefulShutdown verifies that supervisor.Done() returns a channel
// that closes when shutdown is triggered
func TestSupervisorGracefulShutdown(t *testing.T) {
	ctx := context.Background()
	s := NewSupervisor(ctx)
	s.Start()

	// Done channel should not be closed yet
	select {
	case <-s.Done():
		t.Error("Done() should not be closed before Stop()")
	default:
		// Expected
	}

	// Trigger shutdown
	s.Stop()

	// Done channel should close
	select {
	case <-s.Done():
		// Expected
	case <-time.After(100 * time.Millisecond):
		t.Error("Done() should close after Stop()")
	}

	s.Wait()
}
