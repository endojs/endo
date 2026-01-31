// Snapshot Generator
//
// This utility generates a runtime snapshot for XSnap WASM by:
// 1. Loading the xsnap.wasm module
// 2. Evaluating the xsnap.js runtime
// 3. Writing the machine state as a snapshot
//
// The generated snapshot can be embedded in engo to avoid the slow
// runtime evaluation on startup.

package main

import (
	"context"
	_ "embed"
	"errors"
	"flag"
	"fmt"
	"math"
	"os"
	"sync/atomic"
	"time"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

//go:embed xsnap.wasm
var xsnapWasm []byte

//go:embed xsnap.js
var xsnapRuntime []byte

const defaultWasmBufferSize = 64 * 1024
const maxWasmBufferSize = 4 * 1024 * 1024

var verbose bool

func log(format string, args ...interface{}) {
	if verbose {
		fmt.Printf(format+"\n", args...)
	}
}

// Progress counters for monitoring XS activity
type ProgressCounters struct {
	hostCalls   atomic.Uint64
	timeCalls   atomic.Uint64
	strlenCalls atomic.Uint64
	memcpyCalls atomic.Uint64
	memsetCalls atomic.Uint64
}

type SnapshotGenerator struct {
	ctx     context.Context
	runtime wazero.Runtime
	module  api.Module

	// WASM exports
	xsnapBuffer        api.Function
	xsnapResizeBuffer  api.Function
	xsnapCreate        api.Function
	xsnapDestroy       api.Function
	xsnapEvaluate      api.Function
	xsnapWriteSnapshot api.Function

	bufferPtr  uint32
	bufferSize int

	// Progress counters
	counters ProgressCounters
}

func NewSnapshotGenerator(ctx context.Context) (*SnapshotGenerator, error) {
	g := &SnapshotGenerator{ctx: ctx}
	if err := g.initialize(); err != nil {
		return nil, err
	}
	return g, nil
}

func (g *SnapshotGenerator) initialize() error {
	log("Creating wazero runtime...")
	config := wazero.NewRuntimeConfigCompiler()
	g.runtime = wazero.NewRuntimeWithConfig(g.ctx, config)

	// Define host functions
	builder := g.runtime.NewHostModuleBuilder("env")

	// Our custom imports
	builder.NewFunctionBuilder().WithFunc(func() int64 {
		g.counters.hostCalls.Add(1)
		g.counters.timeCalls.Add(1)
		return time.Now().UnixMilli()
	}).Export("wasm_time_now_ms")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, length uint32) uint32 { return 0 }).Export("wasm_issue_command")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, length uint32) {
		mem := m.Memory()
		if msg, ok := mem.Read(g.bufferPtr, length); ok {
			fmt.Printf("[xsnap] %s\n", string(msg))
		}
	}).Export("wasm_console_log")
	builder.NewFunctionBuilder().WithFunc(func(size uint32) uint32 { return 0 }).Export("wasm_alloc")
	builder.NewFunctionBuilder().WithFunc(func(ptr uint32) {}).Export("wasm_free")

	// setjmp/longjmp stubs
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf uint32) int32 { return 0 }).Export("setjmp")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf, val uint32) {
		panic(fmt.Sprintf("longjmp called - XS exception (buf=0x%x, val=%d)", buf, val))
	}).Export("longjmp")

	// XS platform functions
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, the, status uint32) {
		fmt.Printf("fxAbort(status=%d)\n", status)
	}).Export("fxAbort")
	builder.NewFunctionBuilder().WithFunc(func(data uint32) {}).Export("fxReleaseSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(data uint32) {}).Export("fxLockSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(data uint32) {}).Export("fxUnlockSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(size uint32) uint32 { return 0 }).Export("fxCreateSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(the, data, count uint32) int32 { return 0 }).Export("fxNotifySharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(the, address uint32, timeout float64, resolveFunction uint32) int32 { return 0 }).Export("fxWaitSharedChunk")

	// C library string functions
	builder.NewFunctionBuilder().WithFunc(g.strlen).Export("strlen")
	builder.NewFunctionBuilder().WithFunc(g.memcpy).Export("memcpy")
	builder.NewFunctionBuilder().WithFunc(g.memset).Export("memset")
	builder.NewFunctionBuilder().WithFunc(g.memmove).Export("memmove")
	builder.NewFunctionBuilder().WithFunc(g.strcmp).Export("strcmp")
	builder.NewFunctionBuilder().WithFunc(g.strcpy).Export("strcpy")
	builder.NewFunctionBuilder().WithFunc(g.strncmp).Export("strncmp")
	builder.NewFunctionBuilder().WithFunc(g.strcat).Export("strcat")
	builder.NewFunctionBuilder().WithFunc(g.strchr).Export("strchr")

	// C library printf functions (stubs)
	builder.NewFunctionBuilder().WithFunc(func(buf, size, fmtPtr, args uint32) int32 { return 0 }).Export("vsnprintf")
	builder.NewFunctionBuilder().WithFunc(func(buf, size, fmtPtr, arg1 uint32) int32 { return 0 }).Export("snprintf")

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

	log("Instantiating host module...")
	if _, err := builder.Instantiate(g.ctx); err != nil {
		return fmt.Errorf("failed to create host module: %w", err)
	}

	// Compile the WASM module
	log("Compiling WASM module (%d bytes)...", len(xsnapWasm))
	compileStart := time.Now()
	compiled, err := g.runtime.CompileModule(g.ctx, xsnapWasm)
	if err != nil {
		return fmt.Errorf("failed to compile WASM module: %w", err)
	}
	log("WASM module compiled in %v", time.Since(compileStart))

	// Instantiate
	log("Instantiating WASM module...")
	moduleConfig := wazero.NewModuleConfig().
		WithName("xsnap").
		WithStartFunctions()

	g.module, err = g.runtime.InstantiateModule(g.ctx, compiled, moduleConfig)
	if err != nil {
		return fmt.Errorf("failed to instantiate WASM module: %w", err)
	}

	// Get exports
	g.xsnapBuffer = g.module.ExportedFunction("xsnap_buffer")
	g.xsnapResizeBuffer = g.module.ExportedFunction("xsnap_resize_buffer")
	g.xsnapCreate = g.module.ExportedFunction("xsnap_create")
	g.xsnapDestroy = g.module.ExportedFunction("xsnap_destroy")
	g.xsnapEvaluate = g.module.ExportedFunction("xsnap_evaluate")
	g.xsnapWriteSnapshot = g.module.ExportedFunction("xsnap_write_snapshot")

	if g.xsnapBuffer == nil || g.xsnapCreate == nil || g.xsnapEvaluate == nil {
		return errors.New("missing required WASM exports")
	}
	if g.xsnapWriteSnapshot == nil {
		return errors.New("snapshot support not available (xsnap_write_snapshot not exported)")
	}

	// Initialize buffer
	if g.xsnapResizeBuffer != nil {
		results, err := g.xsnapResizeBuffer.Call(g.ctx, 0)
		if err != nil {
			return fmt.Errorf("failed to initialize buffer: %w", err)
		}
		g.bufferSize = int(results[0])
	} else {
		g.bufferSize = defaultWasmBufferSize
	}

	results, err := g.xsnapBuffer.Call(g.ctx)
	if err != nil {
		return fmt.Errorf("failed to get buffer pointer: %w", err)
	}
	g.bufferPtr = uint32(results[0])
	log("Buffer: ptr=0x%x size=%d", g.bufferPtr, g.bufferSize)

	// Create XS machine
	log("Creating XS machine...")
	results, err = g.xsnapCreate.Call(g.ctx)
	if err != nil {
		return fmt.Errorf("failed to create XS machine: %w", err)
	}
	if results[0] != 0 {
		return errors.New("XS machine creation failed")
	}

	return nil
}

func (g *SnapshotGenerator) ensureBufferSize(needed int) error {
	if needed <= g.bufferSize {
		return nil
	}
	if needed > maxWasmBufferSize {
		return fmt.Errorf("buffer too small: need %d (max %d)", needed, maxWasmBufferSize)
	}
	if g.xsnapResizeBuffer == nil {
		return fmt.Errorf("buffer too small: need %d (resize not supported)", needed)
	}

	results, err := g.xsnapResizeBuffer.Call(g.ctx, uint64(needed))
	if err != nil {
		return fmt.Errorf("buffer resize failed: %w", err)
	}
	newSize := int(results[0])
	if newSize < needed {
		return fmt.Errorf("buffer resize returned %d, need %d", newSize, needed)
	}

	results, err = g.xsnapBuffer.Call(g.ctx)
	if err != nil {
		return fmt.Errorf("failed to get new buffer pointer: %w", err)
	}
	g.bufferPtr = uint32(results[0])
	g.bufferSize = newSize
	log("Buffer resized to %d bytes", newSize)
	return nil
}

func (g *SnapshotGenerator) Evaluate(code string) error {
	codeBytes := []byte(code)
	if err := g.ensureBufferSize(len(codeBytes)); err != nil {
		return err
	}

	mem := g.module.Memory()
	if !mem.Write(g.bufferPtr, codeBytes) {
		return errors.New("failed to write code to memory")
	}

	results, err := g.xsnapEvaluate.Call(g.ctx, uint64(len(codeBytes)))
	if err != nil {
		return fmt.Errorf("evaluate call failed: %w", err)
	}

	result := int32(results[0])
	if result < 0 {
		errLen := -result
		errBytes, ok := mem.Read(g.bufferPtr, uint32(errLen))
		if ok {
			return fmt.Errorf("JS error: %s", string(errBytes))
		}
		return errors.New("JS error (unable to read message)")
	}

	return nil
}

func (g *SnapshotGenerator) WriteSnapshot() ([]byte, error) {
	log("Writing snapshot...")
	writeStart := time.Now()
	results, err := g.xsnapWriteSnapshot.Call(g.ctx)
	if err != nil {
		return nil, fmt.Errorf("snapshot write call failed: %w", err)
	}

	result := int32(results[0])
	log("WriteSnapshot returned %d in %v", result, time.Since(writeStart))

	if result <= 0 {
		return nil, fmt.Errorf("snapshot write failed with code %d", result)
	}

	snapshotSize := uint32(result)

	// Get current buffer pointer (may have changed due to auto-grow)
	bufResults, err := g.xsnapBuffer.Call(g.ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get buffer pointer: %w", err)
	}
	g.bufferPtr = uint32(bufResults[0])

	mem := g.module.Memory()
	snapshotData, ok := mem.Read(g.bufferPtr, snapshotSize)
	if !ok {
		return nil, errors.New("failed to read snapshot from memory")
	}

	snapshot := make([]byte, len(snapshotData))
	copy(snapshot, snapshotData)
	return snapshot, nil
}

func (g *SnapshotGenerator) Close() {
	if g.xsnapDestroy != nil {
		g.xsnapDestroy.Call(g.ctx)
	}
	if g.runtime != nil {
		g.runtime.Close(g.ctx)
	}
}

// C library implementations
func (g *SnapshotGenerator) strlen(ctx context.Context, m api.Module, s uint32) uint32 {
	g.counters.hostCalls.Add(1)
	g.counters.strlenCalls.Add(1)
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

func (g *SnapshotGenerator) memcpy(ctx context.Context, m api.Module, dst, src, n uint32) uint32 {
	g.counters.hostCalls.Add(1)
	g.counters.memcpyCalls.Add(1)
	mem := m.Memory()
	if data, ok := mem.Read(src, n); ok {
		mem.Write(dst, data)
	}
	return dst
}

func (g *SnapshotGenerator) memset(ctx context.Context, m api.Module, s uint32, c int32, n uint32) uint32 {
	g.counters.hostCalls.Add(1)
	g.counters.memsetCalls.Add(1)
	mem := m.Memory()
	data := make([]byte, n)
	for i := range data {
		data[i] = byte(c)
	}
	mem.Write(s, data)
	return s
}

func (g *SnapshotGenerator) memmove(ctx context.Context, m api.Module, dst, src, n uint32) uint32 {
	g.counters.hostCalls.Add(1)
	mem := m.Memory()
	if data, ok := mem.Read(src, n); ok {
		copied := make([]byte, len(data))
		copy(copied, data)
		mem.Write(dst, copied)
	}
	return dst
}

func (g *SnapshotGenerator) strcmp(ctx context.Context, m api.Module, s1, s2 uint32) int32 {
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

func (g *SnapshotGenerator) strcpy(ctx context.Context, m api.Module, dst, src uint32) uint32 {
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

func (g *SnapshotGenerator) strncmp(ctx context.Context, m api.Module, s1, s2, n uint32) int32 {
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

func (g *SnapshotGenerator) strcat(ctx context.Context, m api.Module, dst, src uint32) uint32 {
	mem := m.Memory()
	d := dst
	for {
		b, ok := mem.ReadByte(d)
		if !ok || b == 0 {
			break
		}
		d++
	}
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

func (g *SnapshotGenerator) strchr(ctx context.Context, m api.Module, s uint32, c int32) uint32 {
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

func main() {
	output := flag.String("o", "xsnap-runtime.snapshot", "Output snapshot file")
	flag.BoolVar(&verbose, "v", false, "Verbose output")
	flag.Parse()

	ctx := context.Background()

	fmt.Println("XSnap Runtime Snapshot Generator")
	fmt.Println("=================================")
	fmt.Printf("WASM module: %d bytes\n", len(xsnapWasm))
	fmt.Printf("Runtime JS:  %d bytes\n", len(xsnapRuntime))
	fmt.Println()

	fmt.Println("Initializing WASM runtime...")
	initStart := time.Now()
	gen, err := NewSnapshotGenerator(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize: %v\n", err)
		os.Exit(1)
	}
	defer gen.Close()
	fmt.Printf("WASM runtime initialized in %v\n\n", time.Since(initStart).Round(time.Millisecond))

	// Check for simple test mode
	simpleTest := flag.Lookup("simple") != nil && flag.Lookup("simple").Value.String() == "true"
	if simpleTest || os.Getenv("SIMPLE_TEST") != "" {
		fmt.Println("Running simple test (no runtime)...")
		testCode := `
globalThis.testValue = 42;
globalThis.handleCommand = function(msg) { return new ArrayBuffer(0); };
`
		if err := gen.Evaluate(testCode); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to evaluate test code: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Simple test code evaluated successfully")
	} else {
		fmt.Println("Evaluating xsnap runtime...")
		fmt.Println("(This may take 10+ minutes for the large runtime in WASM)")
		evalStart := time.Now()

		// Report progress during evaluation
		done := make(chan struct{})
		go func() {
			ticker := time.NewTicker(10 * time.Second)
			defer ticker.Stop()
			lastHostCalls := uint64(0)
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					elapsed := time.Since(evalStart).Round(time.Second)
					hostCalls := gen.counters.hostCalls.Load()
					timeCalls := gen.counters.timeCalls.Load()
					strlenCalls := gen.counters.strlenCalls.Load()
					memcpyCalls := gen.counters.memcpyCalls.Load()
					memsetCalls := gen.counters.memsetCalls.Load()

					// Calculate rate
					rate := hostCalls - lastHostCalls
					lastHostCalls = hostCalls

					fmt.Printf("  [%v] XS running: %d host calls (%.0f/s) | time=%d strlen=%d memcpy=%d memset=%d\n",
						elapsed, hostCalls, float64(rate)/10.0, timeCalls, strlenCalls, memcpyCalls, memsetCalls)
				}
			}
		}()

		if err := gen.Evaluate(string(xsnapRuntime)); err != nil {
			close(done)
			fmt.Fprintf(os.Stderr, "\nFailed to evaluate runtime: %v\n", err)
			os.Exit(1)
		}
		close(done)

		evalDuration := time.Since(evalStart)
		fmt.Printf("\nRuntime evaluated in %v\n", evalDuration.Round(time.Millisecond))
		fmt.Printf("Total host calls: %d\n\n", gen.counters.hostCalls.Load())
	}

	fmt.Println("Writing snapshot...")
	snapshot, err := gen.WriteSnapshot()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write snapshot: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Snapshot size: %d bytes (%.2f MB)\n", len(snapshot), float64(len(snapshot))/(1024*1024))

	if err := os.WriteFile(*output, snapshot, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write output file: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\nSnapshot written to %s\n", *output)
	fmt.Println("Done!")
}
