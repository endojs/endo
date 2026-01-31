// Snapshot test - Tests bare machine snapshot to isolate the issue
package main

import (
	"context"
	_ "embed"
	"fmt"
	"math"
	"os"
	"time"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

//go:embed xsnap.wasm
var xsnapWasm []byte

func main() {
	fmt.Println("XS Snapshot Test")
	fmt.Println("=================")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Create runtime
	config := wazero.NewRuntimeConfigCompiler()
	runtime := wazero.NewRuntimeWithConfig(ctx, config)
	defer runtime.Close(ctx)

	// Set up host functions
	var bufferPtr uint32
	builder := runtime.NewHostModuleBuilder("env")
	builder.NewFunctionBuilder().WithFunc(func() int64 { return time.Now().UnixMilli() }).Export("wasm_time_now_ms")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, length uint32) uint32 { return 0 }).Export("wasm_issue_command")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, length uint32) {
		mem := m.Memory()
		if msg, ok := mem.Read(bufferPtr, length); ok {
			fmt.Printf("[CONSOLE] %s\n", string(msg))
		}
	}).Export("wasm_console_log")
	builder.NewFunctionBuilder().WithFunc(func(size uint32) uint32 { return 0 }).Export("wasm_alloc")
	builder.NewFunctionBuilder().WithFunc(func(ptr uint32) {}).Export("wasm_free")

	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf uint32) int32 { return 0 }).Export("setjmp")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf, val uint32) {
		panic(fmt.Sprintf("longjmp: XS exception (buf=0x%x, val=%d)", buf, val))
	}).Export("longjmp")

	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, ptr, length uint32) {
		mem := m.Memory()
		if msg, ok := mem.Read(ptr, length); ok {
			fmt.Printf("[DEBUG] %s", string(msg))
		}
	}).Export("wasm_debug_print")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, the, status uint32) {}).Export("fxAbort")
	builder.NewFunctionBuilder().WithFunc(func(data uint32) {}).Export("fxReleaseSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(data uint32) {}).Export("fxLockSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(data uint32) {}).Export("fxUnlockSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(size uint32) uint32 { return 0 }).Export("fxCreateSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(the, data, count uint32) int32 { return 0 }).Export("fxNotifySharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(the, address uint32, timeout float64, resolveFunction uint32) int32 { return 0 }).Export("fxWaitSharedChunk")

	// String functions
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, s uint32) uint32 {
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
	}).Export("strlen")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, dst, src, n uint32) uint32 {
		mem := m.Memory()
		if data, ok := mem.Read(src, n); ok {
			mem.Write(dst, data)
		}
		return dst
	}).Export("memcpy")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, s uint32, c int32, n uint32) uint32 {
		mem := m.Memory()
		data := make([]byte, n)
		for i := range data {
			data[i] = byte(c)
		}
		mem.Write(s, data)
		return s
	}).Export("memset")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, dst, src, n uint32) uint32 {
		mem := m.Memory()
		if data, ok := mem.Read(src, n); ok {
			copied := make([]byte, len(data))
			copy(copied, data)
			mem.Write(dst, copied)
		}
		return dst
	}).Export("memmove")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, s1, s2 uint32) int32 { return 0 }).Export("strcmp")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, dst, src uint32) uint32 { return dst }).Export("strcpy")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, s1, s2, n uint32) int32 { return 0 }).Export("strncmp")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, dst, src uint32) uint32 { return dst }).Export("strcat")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, s uint32, c int32) uint32 { return 0 }).Export("strchr")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, dst, src, n uint32) uint32 { return dst }).Export("strncat")

	builder.NewFunctionBuilder().WithFunc(func(buf, size, fmtPtr, args uint32) int32 { return 0 }).Export("vsnprintf")
	builder.NewFunctionBuilder().WithFunc(func(buf, size, fmtPtr, arg1 uint32) int32 { return 0 }).Export("snprintf")

	// Math
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

	builder.NewFunctionBuilder().WithFunc(func() int32 { return int32(time.Now().UnixNano() & 0x7FFFFFFF) }).Export("rand")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, base, nel, width, compar uint32) {}).Export("qsort")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, key, base, nel, width, compar uint32) uint32 { return 0 }).Export("bsearch")

	if _, err := builder.Instantiate(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create host module: %v\n", err)
		os.Exit(1)
	}

	// Compile and instantiate WASM
	compiled, err := runtime.CompileModule(ctx, xsnapWasm)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to compile WASM: %v\n", err)
		os.Exit(1)
	}

	moduleConfig := wazero.NewModuleConfig().WithName("xsnap").WithStartFunctions()
	module, err := runtime.InstantiateModule(ctx, compiled, moduleConfig)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to instantiate WASM: %v\n", err)
		os.Exit(1)
	}

	// Get exports
	xsnapBuffer := module.ExportedFunction("xsnap_buffer")
	xsnapResizeBuffer := module.ExportedFunction("xsnap_resize_buffer")
	xsnapCreateBare := module.ExportedFunction("xsnap_create_bare")
	xsnapCreate := module.ExportedFunction("xsnap_create")
	xsnapWriteSnapshot := module.ExportedFunction("xsnap_write_snapshot")

	// Initialize buffer
	if xsnapResizeBuffer != nil {
		xsnapResizeBuffer.Call(ctx, 0)
	}
	results, _ := xsnapBuffer.Call(ctx)
	bufferPtr = uint32(results[0])
	fmt.Printf("Buffer: 0x%x\n", bufferPtr)

	// Test 1: Bare machine snapshot
	if xsnapCreateBare != nil {
		fmt.Println("\n--- Test 1: Bare machine (no host bindings) ---")
		results, err := xsnapCreateBare.Call(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "xsnap_create_bare failed: %v\n", err)
		} else if results[0] != 0 {
			fmt.Fprintf(os.Stderr, "xsnap_create_bare returned error: %d\n", results[0])
		} else {
			fmt.Println("Bare XS machine created")

			func() {
				defer func() {
					if r := recover(); r != nil {
						fmt.Printf("BARE SNAPSHOT FAILED: %v\n", r)
					}
				}()

				results, err := xsnapWriteSnapshot.Call(ctx)
				if err != nil {
					fmt.Printf("Bare snapshot write error: %v\n", err)
				} else {
					result := int32(results[0])
					if result > 0 {
						fmt.Printf("BARE SNAPSHOT SUCCESS! Size: %d bytes\n", result)
					} else {
						fmt.Printf("Bare snapshot failed with code: %d\n", result)
					}
				}
			}()
		}
	} else {
		fmt.Println("xsnap_create_bare not available")
	}

	// Test 2: Normal machine snapshot
	fmt.Println("\n--- Test 2: Normal machine (with host bindings) ---")
	// Need to destroy and recreate
	results, err = xsnapCreate.Call(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "xsnap_create failed: %v\n", err)
		os.Exit(1)
	}
	if results[0] != 0 {
		fmt.Fprintf(os.Stderr, "xsnap_create returned error: %d\n", results[0])
		os.Exit(1)
	}
	fmt.Println("Normal XS machine created")

	func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("NORMAL SNAPSHOT FAILED: %v\n", r)
			}
		}()

		results, err := xsnapWriteSnapshot.Call(ctx)
		if err != nil {
			fmt.Printf("Normal snapshot write error: %v\n", err)
		} else {
			result := int32(results[0])
			if result > 0 {
				fmt.Printf("NORMAL SNAPSHOT SUCCESS! Size: %d bytes\n", result)
			} else {
				fmt.Printf("Normal snapshot failed with code: %d\n", result)
			}
		}
	}()

	fmt.Println("\nDone!")
}
