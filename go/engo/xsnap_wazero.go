package main

// XSnap WASM Worker - Wazero-based implementation
//
// This provides an alternative to the CGO-based XSnap worker,
// using WebAssembly for better portability and safety.

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"math"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

// Debug instrumentation - enable with DEBUG=ENGO_WASM
var debugWasm = isDebug("ENGO_WASM")
var debugWasmVerbose = isDebug("ENGO_WASM_VERBOSE") // even more detail (host function calls)
var debugWasmTrace = isDebug("ENGO_WASM_TRACE")     // trace WASM function calls (very verbose)

func wasmLog(id ID, format string, args ...interface{}) {
	if debugWasm {
		msg := fmt.Sprintf(format, args...)
		fmt.Fprintf(os.Stderr, "[wasm %d] %s\n", id, msg)
	}
}

func wasmLogVerbose(id ID, format string, args ...interface{}) {
	if debugWasmVerbose {
		msg := fmt.Sprintf(format, args...)
		fmt.Fprintf(os.Stderr, "[wasm %d] %s\n", id, msg)
	}
}

//go:embed xsnap.wasm
var xsnapWasm []byte

// Buffer size constants - the C WASM module now supports dynamic resizing
const defaultWasmBufferSize = 64 * 1024       // Start with 64KB (matches C default)
const maxWasmBufferSize = 4 * 1024 * 1024     // Maximum 4MB (matches C max)

// getInitialBufferSize returns the initial buffer size from environment or default.
// Note: The buffer can grow dynamically up to maxWasmBufferSize as needed.
func getInitialBufferSize() int {
	if sizeStr := os.Getenv("ENGO_BUFFER_SIZE"); sizeStr != "" {
		if size, err := strconv.Atoi(sizeStr); err == nil && size > 0 {
			if size > maxWasmBufferSize {
				wasmLog(0, "ENGO_BUFFER_SIZE=%d exceeds max %d, using max", size, maxWasmBufferSize)
				return maxWasmBufferSize
			}
			wasmLog(0, "using initial ENGO_BUFFER_SIZE=%d", size)
			return size
		}
	}
	return defaultWasmBufferSize
}

// Keep old function for backward compatibility in tests
func getWasmBufferSize() int {
	return getInitialBufferSize()
}

// ErrMessageTooLarge is returned when a message exceeds the buffer size
var ErrMessageTooLarge = errors.New("message exceeds buffer size")

// XSnapWasmWorker manages an XSnap instance running in WebAssembly
type XSnapWasmWorker struct {
	ctx    context.Context
	cancel func()
	id     ID
	pid    ID

	// Message handling
	fetch   func(context.Context) ([]Message, error)
	deliver func(context.Context, Message) error

	// Wazero runtime and module
	runtime wazero.Runtime
	module  api.Module

	// WASM exports
	xsnapBuffer        api.Function
	xsnapResizeBuffer  api.Function
	xsnapCreate        api.Function
	xsnapDestroy       api.Function
	xsnapEvaluate      api.Function
	xsnapCommand       api.Function
	xsnapLoadSnapshot  api.Function
	xsnapWriteSnapshot api.Function

	// Buffer state (may change after resize)
	bufferPtr  uint32
	bufferSize int // Current buffer size (updated after resize)

	// Synchronization
	mu sync.Mutex

	// Instrumentation counters (for debugging)
	hostCalls     atomic.Uint64
	evalCalls     atomic.Uint64
	commandCalls  atomic.Uint64
	strlenCalls   atomic.Uint64
	memcpyCalls   atomic.Uint64
	memsetCalls   atomic.Uint64
	lastActivity  atomic.Int64 // unix timestamp of last host call
}

// =============================================================================
// RunXSnapWasmWorker - Main entry point matching RunWorker interface
// =============================================================================

func RunXSnapWasmWorker(
	ctx context.Context,
	cancel func(),
	pid ID,
	id ID,
	fetch func(context.Context) ([]Message, error),
	deliver func(context.Context, Message) error,
	getPortClosedCh func(ID, ID) (chan Message, error),
) error {
	wasmLog(id, "starting XSnapWasmWorker pid=%d", pid)

	w := &XSnapWasmWorker{
		ctx:     ctx,
		cancel:  cancel,
		id:      id,
		pid:     pid,
		fetch:   fetch,
		deliver: deliver,
		// bufferSize will be set from WASM during initialize()
	}

	wasmLog(id, "initializing WASM runtime...")
	initStart := time.Now()
	if err := w.initialize(); err != nil {
		return fmt.Errorf("failed to initialize WASM runtime: %w", err)
	}
	wasmLog(id, "WASM runtime initialized in %v", time.Since(initStart))
	defer w.Close()

	// Check if we should skip the runtime for testing
	skipRuntime := os.Getenv("ENGO_SKIP_RUNTIME") != ""
	if skipRuntime {
		wasmLog(id, "ENGO_SKIP_RUNTIME set, skipping xsnap runtime evaluation")
		// Install a minimal handleCommand that processes evaluate messages
		testCode := `
globalThis.handleCommand = function(message) {
    var bytes = new Uint8Array(message);
    // Find first separator byte (0x01)
    var sep = -1;
    for (var i = 0; i < bytes.length; i++) {
        if (bytes[i] === 1) { sep = i; break; }
    }
    if (sep < 0) return new ArrayBuffer(0);
    // Decode body as ASCII string
    var bodyStr = '';
    for (var i = sep + 1; i < bytes.length && bytes[i] !== 1; i++) {
        bodyStr += String.fromCharCode(bytes[i]);
    }
    var body = JSON.parse(bodyStr);
    if (body.method === 'evaluate' && body.source) {
        eval(body.source);
    }
    return new ArrayBuffer(0);
};
`
		wasmLog(id, "installing minimal handleCommand")
		evalStart := time.Now()
		if err := w.Evaluate(testCode); err != nil {
			wasmLog(id, "minimal handleCommand installation FAILED: %v", err)
			return fmt.Errorf("failed to install test handleCommand: %w", err)
		}
		wasmLog(id, "minimal handleCommand installed in %v", time.Since(evalStart))
	} else {
		// Evaluate the xsnap runtime
		wasmLog(id, "evaluating xsnap runtime (%d bytes)...", len(xsnapRuntime))
		evalStart := time.Now()

		// Start a goroutine to report progress during long evaluations
		done := make(chan struct{})
		if debugWasm {
			go func() {
				ticker := time.NewTicker(time.Second)
				defer ticker.Stop()
				for {
					select {
					case <-done:
						return
					case <-ticker.C:
						elapsed := time.Since(evalStart)
						wasmLog(id, "  still evaluating... elapsed=%v hostCalls=%d strlen=%d memcpy=%d memset=%d",
							elapsed.Round(time.Millisecond),
							w.hostCalls.Load(),
							w.strlenCalls.Load(),
							w.memcpyCalls.Load(),
							w.memsetCalls.Load())
					}
				}
			}()
		}

		err := w.Evaluate(string(xsnapRuntime))
		close(done)

		if err != nil {
			wasmLog(id, "xsnap runtime evaluation FAILED after %v: %v", time.Since(evalStart), err)
			return fmt.Errorf("failed to load xsnap runtime: %w", err)
		}
		wasmLog(id, "xsnap runtime evaluated successfully in %v (hostCalls=%d)",
			time.Since(evalStart), w.hostCalls.Load())
	}

	wasmLog(id, "entering message loop")
	// Main message loop
	for {
		messages, err := fetch(ctx)
		if err != nil {
			wasmLog(id, "fetch error: %v", err)
			return err
		}
		for _, message := range messages {
			wasmLog(id, "handling message type=%s from=%d to=%d", message.Headers.Type, message.Headers.From, message.Headers.To)
			if err := w.handleCommand(message); err != nil {
				wasmLog(id, "handleCommand error: %v", err)
				return err
			}
		}
	}
}

// initialize sets up the Wazero runtime and instantiates the WASM module
func (w *XSnapWasmWorker) initialize() error {
	wasmLog(w.id, "  creating wazero runtime (compiler mode)...")
	// Create runtime with compiler for better performance
	config := wazero.NewRuntimeConfigCompiler()
	w.runtime = wazero.NewRuntimeWithConfig(w.ctx, config)
	wasmLog(w.id, "  wazero runtime created")

	// Define host functions
	builder := w.runtime.NewHostModuleBuilder("env")

	// Our custom imports
	builder.NewFunctionBuilder().WithFunc(w.wasmTimeNowMs).Export("wasm_time_now_ms")
	builder.NewFunctionBuilder().WithFunc(w.wasmIssueCommand).Export("wasm_issue_command")
	builder.NewFunctionBuilder().WithFunc(w.wasmConsoleLog).Export("wasm_console_log")
	builder.NewFunctionBuilder().WithFunc(w.wasmAlloc).Export("wasm_alloc")
	builder.NewFunctionBuilder().WithFunc(w.wasmFree).Export("wasm_free")

	// setjmp/longjmp - XS exception handling
	// WARNING: These are stubs! Real setjmp/longjmp can't be implemented in WASM without special compiler support.
	// If longjmp is called, XS is trying to throw an exception, which indicates an error in the JS being evaluated.
	setjmpCount := uint64(0)
	longjmpCount := uint64(0)
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf uint32) int32 {
		setjmpCount++
		wasmLog(w.id, "host: setjmp(buf=0x%x) called [#%d]", buf, setjmpCount)
		return 0
	}).Export("setjmp")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf, val uint32) {
		longjmpCount++
		wasmLog(w.id, "host: longjmp(buf=0x%x, val=%d) called [#%d] - XS EXCEPTION!", buf, val, longjmpCount)
		// Real setjmp/longjmp can't be implemented in WASM without special compiler support.
		// Panic cleanly instead of continuing with corrupt state.
		panic(fmt.Sprintf("XS exception triggered longjmp (buf=0x%x, val=%d) - WASM module needs ASYNCIFY support", buf, val))
	}).Export("longjmp")

	// XS platform functions
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, the, status uint32) {
		wasmLog(w.id, "host: fxAbort(the=0x%x, status=%d) - XS FATAL ERROR", the, status)
		fmt.Printf("[xsnap %d] fxAbort status=%d\n", w.id, status)
	}).Export("fxAbort")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, data uint32) {}).Export("fxReleaseSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, data uint32) {}).Export("fxLockSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, data uint32) {}).Export("fxUnlockSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, size uint32) uint32 { return 0 }).Export("fxCreateSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, the, data, count uint32) int32 { return 0 }).Export("fxNotifySharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, the, address uint32, timeout float64, resolveFunction uint32) int32 { return 0 }).Export("fxWaitSharedChunk")

	// C library string functions
	builder.NewFunctionBuilder().WithFunc(w.strlen).Export("strlen")
	builder.NewFunctionBuilder().WithFunc(w.memcpy).Export("memcpy")
	builder.NewFunctionBuilder().WithFunc(w.memset).Export("memset")
	builder.NewFunctionBuilder().WithFunc(w.memmove).Export("memmove")
	builder.NewFunctionBuilder().WithFunc(w.strcmp).Export("strcmp")
	builder.NewFunctionBuilder().WithFunc(w.strcpy).Export("strcpy")
	builder.NewFunctionBuilder().WithFunc(w.strncmp).Export("strncmp")
	builder.NewFunctionBuilder().WithFunc(w.strcat).Export("strcat")
	builder.NewFunctionBuilder().WithFunc(w.strchr).Export("strchr")

	// C library printf functions (stubs)
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf, size, fmtPtr, args uint32) int32 { return 0 }).Export("vsnprintf")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf, size, fmtPtr, arg1 uint32) int32 { return 0 }).Export("snprintf")

	// Math functions
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Trunc(x) }).Export("trunc")
	builder.NewFunctionBuilder().WithFunc(func(x, y float64) float64 { return math.Mod(x, y) }).Export("fmod")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Log(x) }).Export("log")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Ceil(x) }).Export("ceil")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Floor(x) }).Export("floor")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Abs(x) }).Export("fabs")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Round(x) }).Export("round")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Round(x) }).Export("nearbyint")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Acos(x) }).Export("acos")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Acosh(x) }).Export("acosh")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Asin(x) }).Export("asin")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Asinh(x) }).Export("asinh")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Atan(x) }).Export("atan")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Atanh(x) }).Export("atanh")
	builder.NewFunctionBuilder().WithFunc(func(y, x float64) float64 { return math.Atan2(y, x) }).Export("atan2")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Cbrt(x) }).Export("cbrt")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Cos(x) }).Export("cos")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Cosh(x) }).Export("cosh")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Exp(x) }).Export("exp")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Expm1(x) }).Export("expm1")
	builder.NewFunctionBuilder().WithFunc(func(x, y float64) float64 { return math.Hypot(x, y) }).Export("hypot")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Sqrt(x) }).Export("sqrt")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Log1p(x) }).Export("log1p")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Log10(x) }).Export("log10")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Log2(x) }).Export("log2")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Sin(x) }).Export("sin")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Sinh(x) }).Export("sinh")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Tan(x) }).Export("tan")
	builder.NewFunctionBuilder().WithFunc(func(x float64) float64 { return math.Tanh(x) }).Export("tanh")
	builder.NewFunctionBuilder().WithFunc(func(x, y float64) float64 { return math.Pow(x, y) }).Export("pow")

	// stdlib functions
	builder.NewFunctionBuilder().WithFunc(func() int32 { return int32(time.Now().UnixNano() & 0x7FFFFFFF) }).Export("rand")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, base, nel, width, compar uint32) {}).Export("qsort")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, key, base, nel, width, compar uint32) uint32 { return 0 }).Export("bsearch")

	wasmLog(w.id, "  instantiating host module...")
	_, err := builder.Instantiate(w.ctx)
	if err != nil {
		return fmt.Errorf("failed to create host module: %w", err)
	}
	wasmLog(w.id, "  host module instantiated")

	// Compile the WASM module
	wasmLog(w.id, "  compiling WASM module (%d bytes)...", len(xsnapWasm))
	compileStart := time.Now()
	compiled, err := w.runtime.CompileModule(w.ctx, xsnapWasm)
	if err != nil {
		return fmt.Errorf("failed to compile WASM module: %w", err)
	}
	wasmLog(w.id, "  WASM module compiled in %v", time.Since(compileStart))

	// Log imported and exported functions for debugging
	if debugWasm {
		wasmLog(w.id, "  WASM imports:")
		for _, imp := range compiled.ImportedFunctions() {
			moduleName, name, ok := imp.Import()
			if ok {
				wasmLog(w.id, "    import %s.%s", moduleName, name)
			}
		}
		wasmLog(w.id, "  WASM exports:")
		for name, exp := range compiled.ExportedFunctions() {
			wasmLog(w.id, "    export %s (params=%d, results=%d)", name, len(exp.ParamTypes()), len(exp.ResultTypes()))
		}
	}

	// Instantiate
	wasmLog(w.id, "  instantiating WASM module...")
	moduleConfig := wazero.NewModuleConfig().
		WithName("xsnap").
		WithStartFunctions()

	w.module, err = w.runtime.InstantiateModule(w.ctx, compiled, moduleConfig)
	if err != nil {
		return fmt.Errorf("failed to instantiate WASM module: %w", err)
	}
	wasmLog(w.id, "  WASM module instantiated")

	// Get exports
	wasmLog(w.id, "  getting WASM exports...")
	w.xsnapBuffer = w.module.ExportedFunction("xsnap_buffer")
	w.xsnapResizeBuffer = w.module.ExportedFunction("xsnap_resize_buffer")
	w.xsnapCreate = w.module.ExportedFunction("xsnap_create")
	w.xsnapDestroy = w.module.ExportedFunction("xsnap_destroy")
	w.xsnapEvaluate = w.module.ExportedFunction("xsnap_evaluate")
	w.xsnapCommand = w.module.ExportedFunction("xsnap_command")
	w.xsnapLoadSnapshot = w.module.ExportedFunction("xsnap_load_snapshot")
	w.xsnapWriteSnapshot = w.module.ExportedFunction("xsnap_write_snapshot")

	// Also check for legacy xsnap_buffer_size (for old WASM modules without resize support)
	xsnapBufferSize := w.module.ExportedFunction("xsnap_buffer_size")

	if w.xsnapBuffer == nil || w.xsnapCreate == nil || w.xsnapEvaluate == nil {
		return errors.New("missing required WASM exports")
	}
	wasmLog(w.id, "  WASM exports: buffer=%v resizeBuffer=%v bufferSize=%v create=%v destroy=%v evaluate=%v command=%v loadSnapshot=%v writeSnapshot=%v",
		w.xsnapBuffer != nil, w.xsnapResizeBuffer != nil, xsnapBufferSize != nil,
		w.xsnapCreate != nil, w.xsnapDestroy != nil,
		w.xsnapEvaluate != nil, w.xsnapCommand != nil,
		w.xsnapLoadSnapshot != nil, w.xsnapWriteSnapshot != nil)

	// Initialize buffer and get size
	wasmLog(w.id, "  initializing buffer...")
	if w.xsnapResizeBuffer != nil {
		// New WASM: use xsnap_resize_buffer(0) to ensure buffer exists with default size
		results, err := w.xsnapResizeBuffer.Call(w.ctx, 0)
		if err != nil {
			return fmt.Errorf("failed to initialize buffer: %w", err)
		}
		w.bufferSize = int(results[0])
		if w.bufferSize == 0 {
			return errors.New("failed to allocate WASM buffer")
		}
	} else if xsnapBufferSize != nil {
		// Legacy WASM: use xsnap_buffer_size() to get fixed buffer size
		wasmLog(w.id, "  using legacy fixed-size buffer (no resize support)")
		results, err := xsnapBufferSize.Call(w.ctx)
		if err != nil {
			return fmt.Errorf("failed to get buffer size: %w", err)
		}
		w.bufferSize = int(results[0])
	} else {
		// Fallback: assume default size
		wasmLog(w.id, "  no buffer size function, assuming default")
		w.bufferSize = defaultWasmBufferSize
	}

	// Get buffer pointer
	results, err := w.xsnapBuffer.Call(w.ctx)
	if err != nil {
		return fmt.Errorf("failed to get buffer pointer: %w", err)
	}
	w.bufferPtr = uint32(results[0])
	wasmLog(w.id, "  buffer pointer: 0x%x, size: %d", w.bufferPtr, w.bufferSize)

	// Create XS machine
	wasmLog(w.id, "  creating XS machine...")
	createStart := time.Now()
	results, err = w.xsnapCreate.Call(w.ctx)
	if err != nil {
		return fmt.Errorf("failed to create XS machine: %w", err)
	}
	if results[0] != 0 {
		return errors.New("XS machine creation failed")
	}
	wasmLog(w.id, "  XS machine created in %v", time.Since(createStart))

	return nil
}

// Close cleans up the WASM runtime
func (w *XSnapWasmWorker) Close() error {
	if w.xsnapDestroy != nil {
		w.xsnapDestroy.Call(w.ctx)
	}
	if w.runtime != nil {
		return w.runtime.Close(w.ctx)
	}
	return nil
}

// ensureBufferSize resizes the WASM buffer if needed to fit the requested size.
// Returns an error if the size exceeds the maximum or resize fails.
// The caller must hold w.mu.
func (w *XSnapWasmWorker) ensureBufferSize(needed int) error {
	if needed <= w.bufferSize {
		return nil // Already big enough
	}

	if needed > maxWasmBufferSize {
		return fmt.Errorf("%w: need %d bytes (max %d)", ErrMessageTooLarge, needed, maxWasmBufferSize)
	}

	if w.xsnapResizeBuffer == nil {
		return fmt.Errorf("%w: need %d bytes (current %d, resize not supported)", ErrMessageTooLarge, needed, w.bufferSize)
	}

	wasmLog(w.id, "resizing buffer: %d -> %d bytes", w.bufferSize, needed)

	// Call xsnap_resize_buffer(needed)
	results, err := w.xsnapResizeBuffer.Call(w.ctx, uint64(needed))
	if err != nil {
		return fmt.Errorf("buffer resize failed: %w", err)
	}

	newSize := int(results[0])
	if newSize < needed {
		return fmt.Errorf("buffer resize returned %d, need %d", newSize, needed)
	}

	// Update buffer pointer (may have changed after resize)
	results, err = w.xsnapBuffer.Call(w.ctx)
	if err != nil {
		return fmt.Errorf("failed to get new buffer pointer after resize: %w", err)
	}
	w.bufferPtr = uint32(results[0])
	w.bufferSize = newSize

	wasmLog(w.id, "buffer resized to %d bytes at 0x%x", w.bufferSize, w.bufferPtr)
	return nil
}

// Evaluate executes JavaScript code
func (w *XSnapWasmWorker) Evaluate(code string) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.evalCalls.Add(1)
	evalNum := w.evalCalls.Load()

	codeBytes := []byte(code)

	// Auto-resize buffer if needed
	if err := w.ensureBufferSize(len(codeBytes)); err != nil {
		wasmLog(w.id, "Evaluate #%d: %v", evalNum, err)
		return err
	}

	wasmLogVerbose(w.id, "Evaluate #%d: writing %d bytes to buffer at 0x%x", evalNum, len(codeBytes), w.bufferPtr)

	mem := w.module.Memory()
	if !mem.Write(w.bufferPtr, codeBytes) {
		return errors.New("failed to write code to WASM memory")
	}

	wasmLogVerbose(w.id, "Evaluate #%d: calling xsnap_evaluate(%d)...", evalNum, len(codeBytes))
	callStart := time.Now()
	results, err := w.xsnapEvaluate.Call(w.ctx, uint64(len(codeBytes)))
	callDuration := time.Since(callStart)

	if err != nil {
		wasmLog(w.id, "Evaluate #%d: FAILED after %v: %v", evalNum, callDuration, err)
		return fmt.Errorf("evaluate call failed: %w", err)
	}

	result := int32(results[0])
	wasmLogVerbose(w.id, "Evaluate #%d: returned %d after %v", evalNum, result, callDuration)

	if result < 0 {
		errLen := -result
		errBytes, ok := mem.Read(w.bufferPtr, uint32(errLen))
		if ok {
			wasmLog(w.id, "Evaluate #%d: JS error: %s", evalNum, string(errBytes))
			return fmt.Errorf("JS error: %s", string(errBytes))
		}
		return errors.New("JS error (unable to read message)")
	}

	return nil
}

// Command sends a command to the XSnap machine
func (w *XSnapWasmWorker) Command(data []byte) ([]byte, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.commandCalls.Add(1)
	cmdNum := w.commandCalls.Load()

	// Auto-resize buffer if needed
	if err := w.ensureBufferSize(len(data)); err != nil {
		wasmLog(w.id, "Command #%d: %v", cmdNum, err)
		return nil, err
	}

	wasmLog(w.id, "Command #%d: writing %d bytes to buffer at 0x%x", cmdNum, len(data), w.bufferPtr)
	if len(data) < 200 {
		wasmLog(w.id, "Command #%d: data=%q", cmdNum, string(data))
	} else {
		wasmLog(w.id, "Command #%d: data[0:200]=%q...", cmdNum, string(data[:200]))
	}

	mem := w.module.Memory()
	memSize := mem.Size()
	wasmLog(w.id, "Command #%d: memory size=%d (0x%x), bufferPtr+len=%d (0x%x)",
		cmdNum, memSize, memSize, uint32(w.bufferPtr)+uint32(len(data)), uint32(w.bufferPtr)+uint32(len(data)))

	if uint32(w.bufferPtr)+uint32(len(data)) > memSize {
		wasmLog(w.id, "Command #%d: ERROR - data would exceed memory bounds!", cmdNum)
		return nil, fmt.Errorf("command data (%d bytes at 0x%x) exceeds memory size (%d)", len(data), w.bufferPtr, memSize)
	}

	if !mem.Write(w.bufferPtr, data) {
		return nil, errors.New("failed to write command to WASM memory")
	}

	if w.xsnapCommand == nil {
		return nil, errors.New("xsnap_command not exported")
	}

	wasmLogVerbose(w.id, "Command #%d: calling xsnap_command(%d)...", cmdNum, len(data))
	callStart := time.Now()
	results, err := w.xsnapCommand.Call(w.ctx, uint64(len(data)))
	callDuration := time.Since(callStart)

	if err != nil {
		wasmLog(w.id, "Command #%d: FAILED after %v: %v", cmdNum, callDuration, err)
		return nil, fmt.Errorf("command call failed: %w", err)
	}

	result := int32(results[0])
	wasmLogVerbose(w.id, "Command #%d: returned %d after %v", cmdNum, result, callDuration)

	if result < 0 {
		errLen := -result
		errBytes, ok := mem.Read(w.bufferPtr, uint32(errLen))
		if ok {
			wasmLog(w.id, "Command #%d: error: %s", cmdNum, string(errBytes))
			return nil, fmt.Errorf("command error: %s", string(errBytes))
		}
		return nil, errors.New("command error (unable to read message)")
	}

	// If result > 0, it's the response length
	if result > 0 {
		response, ok := mem.Read(w.bufferPtr, uint32(result))
		if !ok {
			return nil, errors.New("failed to read response from WASM memory")
		}
		// Make a copy since the buffer may be reused
		responseCopy := make([]byte, len(response))
		copy(responseCopy, response)
		wasmLogVerbose(w.id, "Command #%d: response %d bytes", cmdNum, len(responseCopy))
		return responseCopy, nil
	}

	return nil, nil
}

// LoadSnapshot loads a previously saved XS machine snapshot.
// This destroys the current machine and creates a new one from the snapshot.
// Returns an error if snapshot support is not available or loading fails.
func (w *XSnapWasmWorker) LoadSnapshot(data []byte) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.xsnapLoadSnapshot == nil {
		return errors.New("snapshot support not available (xsnap_load_snapshot not exported)")
	}

	// Auto-resize buffer if needed
	if err := w.ensureBufferSize(len(data)); err != nil {
		wasmLog(w.id, "LoadSnapshot: %v", err)
		return err
	}

	wasmLog(w.id, "LoadSnapshot: writing %d bytes to buffer at 0x%x", len(data), w.bufferPtr)

	mem := w.module.Memory()
	if !mem.Write(w.bufferPtr, data) {
		return errors.New("failed to write snapshot to WASM memory")
	}

	wasmLog(w.id, "LoadSnapshot: calling xsnap_load_snapshot(%d)...", len(data))
	loadStart := time.Now()
	results, err := w.xsnapLoadSnapshot.Call(w.ctx, uint64(len(data)))
	loadDuration := time.Since(loadStart)

	if err != nil {
		wasmLog(w.id, "LoadSnapshot: FAILED after %v: %v", loadDuration, err)
		return fmt.Errorf("snapshot load call failed: %w", err)
	}

	result := int32(results[0])
	wasmLog(w.id, "LoadSnapshot: returned %d after %v", result, loadDuration)

	if result != 0 {
		// Read error message from buffer if available
		if result < 0 {
			errLen := -result
			errBytes, ok := mem.Read(w.bufferPtr, uint32(errLen))
			if ok && len(errBytes) > 0 {
				return fmt.Errorf("snapshot load error: %s", string(errBytes))
			}
		}
		return fmt.Errorf("snapshot load failed with code %d", result)
	}

	return nil
}

// WriteSnapshot saves the current XS machine state to a snapshot.
// Returns the snapshot data on success, or an error if snapshot support
// is not available or writing fails.
func (w *XSnapWasmWorker) WriteSnapshot() ([]byte, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.xsnapWriteSnapshot == nil {
		return nil, errors.New("snapshot support not available (xsnap_write_snapshot not exported)")
	}

	wasmLog(w.id, "WriteSnapshot: calling xsnap_write_snapshot()...")
	writeStart := time.Now()
	results, err := w.xsnapWriteSnapshot.Call(w.ctx)
	writeDuration := time.Since(writeStart)

	if err != nil {
		wasmLog(w.id, "WriteSnapshot: FAILED after %v: %v", writeDuration, err)
		return nil, fmt.Errorf("snapshot write call failed: %w", err)
	}

	result := int32(results[0])
	wasmLog(w.id, "WriteSnapshot: returned %d after %v", result, writeDuration)

	if result <= 0 {
		return nil, fmt.Errorf("snapshot write failed with code %d", result)
	}

	// result is the snapshot size
	snapshotSize := uint32(result)

	// Get the current buffer pointer (may have changed during write due to auto-grow)
	bufResults, err := w.xsnapBuffer.Call(w.ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get buffer pointer after write: %w", err)
	}
	w.bufferPtr = uint32(bufResults[0])

	// Read snapshot data from buffer
	mem := w.module.Memory()
	snapshotData, ok := mem.Read(w.bufferPtr, snapshotSize)
	if !ok {
		return nil, errors.New("failed to read snapshot from WASM memory")
	}

	// Make a copy since the buffer may be reused
	snapshot := make([]byte, len(snapshotData))
	copy(snapshot, snapshotData)

	wasmLog(w.id, "WriteSnapshot: got %d bytes of snapshot data", len(snapshot))
	return snapshot, nil
}

// =============================================================================
// Message Handling (mirrors xsnap.go)
// =============================================================================

func (w *XSnapWasmWorker) handleCommand(request Message) error {
	if request.Headers.Type == "terminate" {
		w.cancel()
		return nil
	}

	// Format message for XSnap: '?' prefix + headers\x01body
	requestBytes, err := formatMessage([]byte{'?'}, request)
	if err != nil {
		return err
	}

	// Send to XSnap and get response
	// Note: Command may trigger wasm_issue_command callbacks during execution
	responseBytes, err := w.Command(requestBytes)
	if err != nil {
		return err
	}

	if responseBytes == nil || len(responseBytes) == 0 {
		// Even with empty response, we need to unblock sync callers
		if request.ResponseCh != nil {
			request.ResponseCh <- Message{
				Headers: Headers{
					To:   request.Headers.From,
					From: request.Headers.To,
					Port: request.Headers.Port,
				},
			}
		}
		return nil
	}

	// Parse response (WASM version returns headers\x01body without metering)
	var response Message
	if err := parseMessageInto(&response, responseBytes); err != nil {
		return err
	}

	if request.ResponseCh != nil {
		// Synchronous request
		response.Headers.To = request.Headers.From
		response.Headers.From = request.Headers.To
		response.Headers.Port = request.Headers.Port
		request.ResponseCh <- response
	} else if len(response.Body) > 0 {
		// Async response with body - deliver back
		response.Headers.To = request.Headers.From
		response.Headers.From = w.id
		if err := w.deliver(w.ctx, response); err != nil {
			return err
		}
	}

	return nil
}

// =============================================================================
// Host Imports (called by WASM)
// =============================================================================

func (w *XSnapWasmWorker) wasmTimeNowMs(ctx context.Context) int64 {
	w.hostCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())
	wasmLogVerbose(w.id, "host: wasm_time_now_ms()")
	return time.Now().UnixMilli()
}

func (w *XSnapWasmWorker) wasmIssueCommand(ctx context.Context, m api.Module, length uint32) uint32 {
	w.hostCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())
	wasmLog(w.id, "host: wasm_issue_command(length=%d)", length)

	mem := m.Memory()
	cmdBytes, ok := mem.Read(w.bufferPtr, length)
	if !ok {
		wasmLog(w.id, "host: wasm_issue_command: failed to read command bytes")
		return 0
	}

	// Make a copy since the buffer may be overwritten
	cmdBytesCopy := make([]byte, len(cmdBytes))
	copy(cmdBytesCopy, cmdBytes)

	// Parse the command message (headers\x01body format)
	var request Message
	if err := parseMessageInto(&request, cmdBytesCopy); err != nil {
		wasmLog(w.id, "host: wasm_issue_command: parse error: %v", err)
		fmt.Printf("[xsnap %d] issueCommand parse error: %v\n", w.id, err)
		return 0
	}

	wasmLog(w.id, "host: wasm_issue_command: type=%s to=%d", request.Headers.Type, request.Headers.To)

	request.Headers.From = w.id
	request.ResponseCh = make(chan Message, 1)

	if err := w.deliver(w.ctx, request); err != nil {
		wasmLog(w.id, "host: wasm_issue_command: delivery error: %v", err)
		fmt.Printf("[xsnap %d] issueCommand delivery error: %v\n", w.id, err)
		return 0
	}

	wasmLog(w.id, "host: wasm_issue_command: waiting for response...")
	// Wait for response
	select {
	case <-w.ctx.Done():
		wasmLog(w.id, "host: wasm_issue_command: context cancelled")
		return 0
	case response := <-request.ResponseCh:
		wasmLog(w.id, "host: wasm_issue_command: got response type=%s", response.Headers.Type)
		// Format response and write to buffer (no prefix for WASM)
		responseBytes, err := formatMessage(nil, response)
		if err != nil {
			wasmLog(w.id, "host: wasm_issue_command: response format error: %v", err)
			fmt.Printf("[xsnap %d] issueCommand response format error: %v\n", w.id, err)
			return 0
		}
		if len(responseBytes) > w.bufferSize {
			wasmLog(w.id, "host: wasm_issue_command: response too large: %d bytes (max %d)", len(responseBytes), w.bufferSize)
			fmt.Printf("[xsnap %d] issueCommand response too large: %d bytes (max %d)\n", w.id, len(responseBytes), w.bufferSize)
			return 0
		}
		mem.Write(w.bufferPtr, responseBytes)
		return uint32(len(responseBytes))
	}
}

func (w *XSnapWasmWorker) wasmConsoleLog(ctx context.Context, m api.Module, length uint32) {
	w.hostCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())
	mem := m.Memory()
	msgBytes, ok := mem.Read(w.bufferPtr, length)
	if ok {
		// Always print console.log output - it's explicitly requested by JS code
		fmt.Printf("[xsnap %d] %s\n", w.id, string(msgBytes))
		wasmLogVerbose(w.id, "host: wasm_console_log(%d bytes)", length)
	}
}

func (w *XSnapWasmWorker) wasmAlloc(ctx context.Context, size uint32) uint32 {
	w.hostCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())
	wasmLogVerbose(w.id, "host: wasm_alloc(%d)", size)
	return 0 // The WASM module has its own allocator
}

func (w *XSnapWasmWorker) wasmFree(ctx context.Context, ptr uint32) {
	w.hostCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())
	wasmLogVerbose(w.id, "host: wasm_free(0x%x)", ptr)
	// No-op for bump allocator
}

// =============================================================================
// C Library String Functions (called by WASM)
// =============================================================================

func (w *XSnapWasmWorker) strlen(ctx context.Context, m api.Module, s uint32) uint32 {
	w.hostCalls.Add(1)
	w.strlenCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())

	mem := m.Memory()
	var length uint32
	for {
		b, ok := mem.ReadByte(s + length)
		if !ok || b == 0 {
			break
		}
		length++
	}
	return length
}

func (w *XSnapWasmWorker) memcpy(ctx context.Context, m api.Module, dst, src, n uint32) uint32 {
	w.hostCalls.Add(1)
	w.memcpyCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())

	mem := m.Memory()
	data, ok := mem.Read(src, n)
	if ok {
		mem.Write(dst, data)
	}
	return dst
}

func (w *XSnapWasmWorker) memset(ctx context.Context, m api.Module, s uint32, c int32, n uint32) uint32 {
	w.hostCalls.Add(1)
	w.memsetCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())

	mem := m.Memory()
	data := make([]byte, n)
	for i := range data {
		data[i] = byte(c)
	}
	mem.Write(s, data)
	return s
}

func (w *XSnapWasmWorker) memmove(ctx context.Context, m api.Module, dst, src, n uint32) uint32 {
	w.hostCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())

	mem := m.Memory()
	data, ok := mem.Read(src, n)
	if ok {
		// Make a copy to handle overlapping regions
		copied := make([]byte, len(data))
		copy(copied, data)
		mem.Write(dst, copied)
	}
	return dst
}

func (w *XSnapWasmWorker) strcmp(ctx context.Context, m api.Module, s1, s2 uint32) int32 {
	w.hostCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())

	mem := m.Memory()
	for {
		b1, ok1 := mem.ReadByte(s1)
		b2, ok2 := mem.ReadByte(s2)
		if !ok1 || !ok2 {
			return 0
		}
		if b1 != b2 {
			return int32(b1) - int32(b2)
		}
		if b1 == 0 {
			return 0
		}
		s1++
		s2++
	}
}

func (w *XSnapWasmWorker) strcpy(ctx context.Context, m api.Module, dst, src uint32) uint32 {
	w.hostCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())

	mem := m.Memory()
	d := dst
	for {
		b, ok := mem.ReadByte(src)
		if !ok {
			break
		}
		mem.WriteByte(d, b)
		if b == 0 {
			break
		}
		src++
		d++
	}
	return dst
}

func (w *XSnapWasmWorker) strncmp(ctx context.Context, m api.Module, s1, s2, n uint32) int32 {
	w.hostCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())

	mem := m.Memory()
	for i := uint32(0); i < n; i++ {
		b1, ok1 := mem.ReadByte(s1 + i)
		b2, ok2 := mem.ReadByte(s2 + i)
		if !ok1 || !ok2 {
			return 0
		}
		if b1 != b2 {
			return int32(b1) - int32(b2)
		}
		if b1 == 0 {
			return 0
		}
	}
	return 0
}

func (w *XSnapWasmWorker) strcat(ctx context.Context, m api.Module, dst, src uint32) uint32 {
	w.hostCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())

	mem := m.Memory()
	// Find end of dst
	d := dst
	for {
		b, ok := mem.ReadByte(d)
		if !ok || b == 0 {
			break
		}
		d++
	}
	// Copy src
	for {
		b, ok := mem.ReadByte(src)
		if !ok {
			break
		}
		mem.WriteByte(d, b)
		if b == 0 {
			break
		}
		src++
		d++
	}
	return dst
}

func (w *XSnapWasmWorker) strchr(ctx context.Context, m api.Module, s uint32, c int32) uint32 {
	w.hostCalls.Add(1)
	w.lastActivity.Store(time.Now().Unix())

	mem := m.Memory()
	for {
		b, ok := mem.ReadByte(s)
		if !ok {
			return 0
		}
		if b == byte(c) {
			return s
		}
		if b == 0 {
			return 0
		}
		s++
	}
}
