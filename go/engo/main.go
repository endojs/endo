package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	flags "github.com/jessevdk/go-flags"
)

// #cgo LDFLAGS: xsnap-worker.a
// int xsnapMain(int argc, char* argv[]);
import "C"

func main() {
	if os.Getenv("RUN_AS_XSNAP") != "" {
		C.xsnapMain(0, nil)
		return
	}

	var opts struct {
		Eval              []string `short:"e"`
		Bundle            []string `short:"b"`
		PrecompiledBundle []string `short:"B"`
		UseWasm           bool     `long:"wasm" description:"Use WASM-based XSnap instead of CGO"`
	}

	args, err := flags.ParseArgs(&opts, os.Args)
	if err != nil {
		os.Exit(1)
	}

	ctx := context.Background()

	supervisor := NewSupervisor(ctx)

	supervisor.Start()

	bindingsId := supervisor.Spawn(0, RunBindingsWorker)

	// Choose XSnap implementation: WASM (pure Go) or CGO
	var xsnapRunner RunWorker
	if opts.UseWasm || os.Getenv("ENGO_USE_WASM") != "" {
		xsnapRunner = RunXSnapWasmWorker
	} else {
		xsnapRunner = RunXsnapWorker
	}
	xsnapId := supervisor.Spawn(bindingsId, xsnapRunner)

	evalSource := func(source string) {
		responseCh := make(chan Message, 1)
		body := struct {
			Method string `json:"method"`
			Source string `json:"source"`
		}{
			Method: "evaluate",
			Source: source,
		}
		bodyBytes, _ := json.Marshal(&body)
		supervisor.Deliver(ctx, Message{
			Headers: Headers{
				Type: "system",
				Sync: true,
				To:   xsnapId,
				From: -1,
			},
			Body:       append(bodyBytes, 1),
			ResponseCh: responseCh,
		})
		select {
		case <-responseCh:
			// txt, _ := json.Marshal(res.Headers)
			// fmt.Printf("> %s (%s)\n", res.Body, txt)
		case <-supervisor.Done():
			// Supervisor is shutting down (worker crash or graceful shutdown)
			return
		}
	}

	importModule := func(path string) {
		// TODO err handling
		wd, _ := os.Getwd()
		absPath := filepath.Join(wd, path)
		location := fmt.Sprintf("file://%s", absPath)

		responseCh := make(chan Message, 1)
		body := struct {
			Method   string `json:"method"`
			Location string `json:"location"`
		}{
			Method:   "import",
			Location: location,
		}
		bodyBytes, _ := json.Marshal(&body)
		supervisor.Deliver(ctx, Message{
			Headers: Headers{
				Type: "system",
				Sync: true,
				To:   xsnapId,
				From: -1,
				Port: 1,
			},
			Body:       append(bodyBytes, 1),
			ResponseCh: responseCh,
		})
		select {
		case <-responseCh:
			// txt, _ := json.Marshal(res.Headers)
			// fmt.Printf("> %s (%s)\n", res.Body, txt)
		case <-supervisor.Done():
			return
		}
	}

	importBundle := func(path string, native bool) {
		// TODO err handling
		wd, _ := os.Getwd()
		absPath := filepath.Join(wd, path)
		location := fmt.Sprintf("file://%s", absPath)

		responseCh := make(chan Message, 1)
		body := struct {
			Method   string `json:"method"`
			Location string `json:"location"`
			Native   bool   `json:"native"`
		}{
			Method:   "importBundle",
			Location: location,
			Native:   native,
		}
		bodyBytes, _ := json.Marshal(&body)
		supervisor.Deliver(ctx, Message{
			Headers: Headers{
				Type: "system",
				Sync: true,
				To:   xsnapId,
				From: -1,
				Port: 1,
			},
			Body:       append(bodyBytes, 1),
			ResponseCh: responseCh,
		})
		select {
		case <-responseCh:
			// txt, _ := json.Marshal(res.Headers)
			// fmt.Printf("> %s (%s)\n", res.Body, txt)
		case <-supervisor.Done():
			return
		}
	}

	for _, arg := range opts.Eval {
		evalSource(arg)
	}
	for _, arg := range opts.PrecompiledBundle {
		importBundle(arg, false)
	}
	for _, arg := range opts.Bundle {
		importBundle(arg, true)
	}
	for _, arg := range args[1:] {
		importModule(arg)
	}

	supervisor.WaitPorts()

	supervisor.Stop()
	supervisor.Wait()
}
