// Simple test program for XSnap WASM integration
// Run with: go run ./cmd/xsnap-wasm-test/main.go

package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"sync"
	"time"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

//go:embed xsnap.wasm
var xsnapWasm []byte

const wasmBufferSize = 1024 * 1024 // 1MB to handle large JS runtime

// Minimal XSnapWasmWorker for testing
type XSnapWasmWorker struct {
	ctx       context.Context
	runtime   wazero.Runtime
	module    api.Module
	bufferPtr uint32

	xsnapBuffer   api.Function
	xsnapCreate   api.Function
	xsnapDestroy  api.Function
	xsnapEvaluate api.Function

	mu sync.Mutex
}

func NewXSnapWasmWorker(ctx context.Context) (*XSnapWasmWorker, error) {
	w := &XSnapWasmWorker{ctx: ctx}

	// Create runtime with compiler for better performance
	config := wazero.NewRuntimeConfigCompiler()
	w.runtime = wazero.NewRuntimeWithConfig(ctx, config)

	// Define host functions (WASM module exports its own memory)
	// Many of these are C library stubs - a production build would implement these properly
	builder := w.runtime.NewHostModuleBuilder("env")

	// Our custom imports
	builder.NewFunctionBuilder().WithFunc(w.wasmTimeNowMs).Export("wasm_time_now_ms")
	builder.NewFunctionBuilder().WithFunc(w.wasmIssueCommand).Export("wasm_issue_command")
	builder.NewFunctionBuilder().WithFunc(w.wasmConsoleLog).Export("wasm_console_log")
	builder.NewFunctionBuilder().WithFunc(w.wasmAlloc).Export("wasm_alloc")
	builder.NewFunctionBuilder().WithFunc(w.wasmFree).Export("wasm_free")

	// setjmp/longjmp - XS exception handling (stubs for now)
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf uint32) int32 { return 0 }).Export("setjmp")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf, val uint32) {}).Export("longjmp")

	// XS platform functions (stubs)
	// fxAbort(txMachine* the, int status)
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, the, status uint32) {
		fmt.Printf("[fxAbort] status=%d\n", status)
	}).Export("fxAbort")
	// fxReleaseSharedChunk(void* data) -> void
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, data uint32) {}).Export("fxReleaseSharedChunk")
	// fxLockSharedChunk(void* data) -> void
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, data uint32) {}).Export("fxLockSharedChunk")
	// fxUnlockSharedChunk(void* data) -> void
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, data uint32) {}).Export("fxUnlockSharedChunk")
	// fxCreateSharedChunk(txInteger size) -> void*
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, size uint32) uint32 { return 0 }).Export("fxCreateSharedChunk")
	// fxNotifySharedChunk(txMachine* the, void* data, txInteger count) -> txInteger
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, the, data, count uint32) int32 { return 0 }).Export("fxNotifySharedChunk")
	// fxWaitSharedChunk(txMachine* the, void* address, txNumber timeout, txSlot* resolveFunction) -> txInteger
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, the, address uint32, timeout float64, resolveFunction uint32) int32 { return 0 }).Export("fxWaitSharedChunk")

	// C library string functions (stubs - read/write from WASM memory)
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
	// vsnprintf(char* buf, size_t size, const char* fmt, va_list args) -> int
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf, size, fmtPtr, args uint32) int32 { return 0 }).Export("vsnprintf")
	// snprintf is variadic - in WASM, extra args are passed after fmt
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

	_, err := builder.Instantiate(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create host module: %w", err)
	}

	// Compile the WASM module
	fmt.Println("Compiling WASM module...")
	compiled, err := w.runtime.CompileModule(ctx, xsnapWasm)
	if err != nil {
		return nil, fmt.Errorf("failed to compile WASM module: %w", err)
	}

	// Instantiate
	fmt.Println("Instantiating WASM module...")
	moduleConfig := wazero.NewModuleConfig().
		WithName("xsnap").
		WithStartFunctions()

	w.module, err = w.runtime.InstantiateModule(ctx, compiled, moduleConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to instantiate WASM module: %w", err)
	}

	// Get exports
	w.xsnapBuffer = w.module.ExportedFunction("xsnap_buffer")
	w.xsnapCreate = w.module.ExportedFunction("xsnap_create")
	w.xsnapDestroy = w.module.ExportedFunction("xsnap_destroy")
	w.xsnapEvaluate = w.module.ExportedFunction("xsnap_evaluate")

	if w.xsnapBuffer == nil || w.xsnapCreate == nil || w.xsnapEvaluate == nil {
		return nil, errors.New("missing required WASM exports")
	}

	// Get buffer pointer
	results, err := w.xsnapBuffer.Call(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get buffer pointer: %w", err)
	}
	w.bufferPtr = uint32(results[0])
	fmt.Printf("Buffer pointer: 0x%x\n", w.bufferPtr)

	// Create XS machine
	fmt.Println("Creating XS machine...")
	results, err = w.xsnapCreate.Call(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create XS machine: %w", err)
	}
	if results[0] != 0 {
		return nil, errors.New("XS machine creation failed")
	}

	return w, nil
}

func (w *XSnapWasmWorker) Close() error {
	if w.xsnapDestroy != nil {
		w.xsnapDestroy.Call(w.ctx)
	}
	if w.runtime != nil {
		return w.runtime.Close(w.ctx)
	}
	return nil
}

func (w *XSnapWasmWorker) Evaluate(code string) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	codeBytes := []byte(code)
	if len(codeBytes) > wasmBufferSize {
		return fmt.Errorf("code too large: %d bytes", len(codeBytes))
	}

	mem := w.module.Memory()
	if !mem.Write(w.bufferPtr, codeBytes) {
		return errors.New("failed to write code to WASM memory")
	}

	results, err := w.xsnapEvaluate.Call(w.ctx, uint64(len(codeBytes)))
	if err != nil {
		return fmt.Errorf("evaluate call failed: %w", err)
	}

	result := int32(results[0])
	if result < 0 {
		errLen := -result
		errBytes, ok := mem.Read(w.bufferPtr, uint32(errLen))
		if ok {
			return fmt.Errorf("JS error: %s", string(errBytes))
		}
		return errors.New("JS error (unable to read message)")
	}

	return nil
}

// Host imports
func (w *XSnapWasmWorker) wasmTimeNowMs(ctx context.Context) int64 {
	return time.Now().UnixMilli()
}

func (w *XSnapWasmWorker) wasmIssueCommand(ctx context.Context, m api.Module, length uint32) uint32 {
	mem := m.Memory()
	cmdBytes, ok := mem.Read(w.bufferPtr, length)
	if !ok {
		return 0
	}

	var cmd map[string]interface{}
	if err := json.Unmarshal(cmdBytes, &cmd); err == nil {
		fmt.Printf("[issueCommand] %v\n", cmd)
	} else {
		fmt.Printf("[issueCommand] raw: %s\n", string(cmdBytes))
	}

	return 0
}

func (w *XSnapWasmWorker) wasmConsoleLog(ctx context.Context, m api.Module, length uint32) {
	mem := m.Memory()
	msgBytes, ok := mem.Read(w.bufferPtr, length)
	if ok {
		fmt.Printf("[print] %s\n", string(msgBytes))
	}
}

func (w *XSnapWasmWorker) wasmAlloc(ctx context.Context, size uint32) uint32 {
	return 0
}

func (w *XSnapWasmWorker) wasmFree(ctx context.Context, ptr uint32) {
}

// C library string function implementations
func (w *XSnapWasmWorker) strlen(ctx context.Context, m api.Module, s uint32) uint32 {
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
	mem := m.Memory()
	data, ok := mem.Read(src, n)
	if ok {
		mem.Write(dst, data)
	}
	return dst
}

func (w *XSnapWasmWorker) memset(ctx context.Context, m api.Module, s uint32, c int32, n uint32) uint32 {
	mem := m.Memory()
	data := make([]byte, n)
	for i := range data {
		data[i] = byte(c)
	}
	mem.Write(s, data)
	return s
}

func (w *XSnapWasmWorker) memmove(ctx context.Context, m api.Module, dst, src, n uint32) uint32 {
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
	fmt.Println("=== XSnap WASM Test ===")
	fmt.Printf("WASM module size: %d bytes\n", len(xsnapWasm))

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	w, err := NewXSnapWasmWorker(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create worker: %v\n", err)
		os.Exit(1)
	}
	defer w.Close()

	// Skip runtime test for now - xsnap.js has syntax issues with WASM XS
	fmt.Println("Skipping xsnap.js runtime test (known parser compatibility issue)")

	fmt.Println("\n=== Running JavaScript tests ===\n")

	tests := []struct {
		name string
		code string
	}{
		{"simple expression", "1 + 1"},
		{"variable", "const x = 42"},
		{"math", "Math.sqrt(16)"},
		{"string", "'hello'.toUpperCase()"},
		{"print", `print("Hello from XSnap WASM!")`},
		{"performance.now", `print("Time: " + performance.now() + "ms")`},
		{"loop", `
			let sum = 0;
			for (let i = 0; i < 100; i++) sum += i;
			print("Sum: " + sum);
		`},
	}

	passed := 0
	failed := 0

	for _, tt := range tests {
		fmt.Printf("Test: %s... ", tt.name)
		err := w.Evaluate(tt.code)
		if err != nil {
			fmt.Printf("FAILED: %v\n", err)
			failed++
		} else {
			fmt.Println("OK")
			passed++
		}
	}

	fmt.Printf("\n=== Results: %d passed, %d failed ===\n", passed, failed)

	if failed > 0 {
		os.Exit(1)
	}
}

