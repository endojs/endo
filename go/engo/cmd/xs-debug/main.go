// XS WASM Debugger - Minimal test

package main

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"math"
	"os"
	"time"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

//go:embed xsnap.wasm
var xsnapWasm []byte

const defaultWasmBufferSize = 64 * 1024

type XSDebugger struct {
	ctx     context.Context
	runtime wazero.Runtime
	module  api.Module

	xsnapBuffer       api.Function
	xsnapResizeBuffer api.Function
	xsnapCreate       api.Function
	xsnapDestroy      api.Function
	xsnapEvaluate     api.Function

	bufferPtr  uint32
	bufferSize int
}

func NewXSDebugger(ctx context.Context) (*XSDebugger, error) {
	d := &XSDebugger{ctx: ctx}
	if err := d.initialize(); err != nil {
		return nil, err
	}
	return d, nil
}

func (d *XSDebugger) initialize() error {
	config := wazero.NewRuntimeConfigCompiler()
	d.runtime = wazero.NewRuntimeWithConfig(d.ctx, config)

	builder := d.runtime.NewHostModuleBuilder("env")

	builder.NewFunctionBuilder().WithFunc(func() int64 { return time.Now().UnixMilli() }).Export("wasm_time_now_ms")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, length uint32) uint32 { return 0 }).Export("wasm_issue_command")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, length uint32) {
		mem := m.Memory()
		if msg, ok := mem.Read(d.bufferPtr, length); ok {
			fmt.Printf("[CONSOLE] %s\n", string(msg))
		}
	}).Export("wasm_console_log")
	builder.NewFunctionBuilder().WithFunc(func(size uint32) uint32 { return 0 }).Export("wasm_alloc")
	builder.NewFunctionBuilder().WithFunc(func(ptr uint32) {}).Export("wasm_free")

	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf uint32) int32 { return 0 }).Export("setjmp")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, buf, val uint32) {
		panic(fmt.Sprintf("longjmp: XS exception"))
	}).Export("longjmp")

	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, the, status uint32) {}).Export("fxAbort")
	builder.NewFunctionBuilder().WithFunc(func(data uint32) {}).Export("fxReleaseSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(data uint32) {}).Export("fxLockSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(data uint32) {}).Export("fxUnlockSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(size uint32) uint32 { return 0 }).Export("fxCreateSharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(the, data, count uint32) int32 { return 0 }).Export("fxNotifySharedChunk")
	builder.NewFunctionBuilder().WithFunc(func(the, address uint32, timeout float64, resolveFunction uint32) int32 { return 0 }).Export("fxWaitSharedChunk")

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
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, s1, s2 uint32) int32 {
		mem := m.Memory()
		for {
			b1, _ := mem.ReadByte(s1)
			b2, _ := mem.ReadByte(s2)
			if b1 != b2 {
				return int32(b1) - int32(b2)
			}
			if b1 == 0 {
				return 0
			}
			s1++
			s2++
		}
	}).Export("strcmp")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, dst, src uint32) uint32 { return dst }).Export("strcpy")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, s1, s2, n uint32) int32 { return 0 }).Export("strncmp")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, dst, src uint32) uint32 { return dst }).Export("strcat")
	builder.NewFunctionBuilder().WithFunc(func(ctx context.Context, m api.Module, s uint32, c int32) uint32 { return 0 }).Export("strchr")

	builder.NewFunctionBuilder().WithFunc(func(buf, size, fmtPtr, args uint32) int32 { return 0 }).Export("vsnprintf")
	builder.NewFunctionBuilder().WithFunc(func(buf, size, fmtPtr, arg1 uint32) int32 { return 0 }).Export("snprintf")

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

	if _, err := builder.Instantiate(d.ctx); err != nil {
		return fmt.Errorf("failed to create host module: %w", err)
	}

	compiled, err := d.runtime.CompileModule(d.ctx, xsnapWasm)
	if err != nil {
		return fmt.Errorf("failed to compile WASM module: %w", err)
	}

	moduleConfig := wazero.NewModuleConfig().WithName("xsnap").WithStartFunctions()
	d.module, err = d.runtime.InstantiateModule(d.ctx, compiled, moduleConfig)
	if err != nil {
		return fmt.Errorf("failed to instantiate WASM module: %w", err)
	}

	d.xsnapBuffer = d.module.ExportedFunction("xsnap_buffer")
	d.xsnapResizeBuffer = d.module.ExportedFunction("xsnap_resize_buffer")
	d.xsnapCreate = d.module.ExportedFunction("xsnap_create")
	d.xsnapDestroy = d.module.ExportedFunction("xsnap_destroy")
	d.xsnapEvaluate = d.module.ExportedFunction("xsnap_evaluate")

	if d.xsnapResizeBuffer != nil {
		results, _ := d.xsnapResizeBuffer.Call(d.ctx, 0)
		d.bufferSize = int(results[0])
	} else {
		d.bufferSize = defaultWasmBufferSize
	}

	results, _ := d.xsnapBuffer.Call(d.ctx)
	d.bufferPtr = uint32(results[0])

	return nil
}

func (d *XSDebugger) ensureBufferSize(needed int) error {
	if needed <= d.bufferSize {
		return nil
	}
	if d.xsnapResizeBuffer == nil {
		return fmt.Errorf("buffer too small")
	}
	results, err := d.xsnapResizeBuffer.Call(d.ctx, uint64(needed))
	if err != nil {
		return err
	}
	d.bufferSize = int(results[0])
	results, _ = d.xsnapBuffer.Call(d.ctx)
	d.bufferPtr = uint32(results[0])
	return nil
}

func (d *XSDebugger) CreateMachine() error {
	results, err := d.xsnapCreate.Call(d.ctx)
	if err != nil {
		return err
	}
	if results[0] != 0 {
		return errors.New("xsnap_create returned error")
	}
	return nil
}

func (d *XSDebugger) Evaluate(code string) error {
	codeBytes := []byte(code)
	if err := d.ensureBufferSize(len(codeBytes)); err != nil {
		return err
	}

	mem := d.module.Memory()
	if !mem.Write(d.bufferPtr, codeBytes) {
		return errors.New("failed to write code to memory")
	}

	results, err := d.xsnapEvaluate.Call(d.ctx, uint64(len(codeBytes)))
	if err != nil {
		return fmt.Errorf("evaluate failed: %w", err)
	}

	result := int32(results[0])
	if result < 0 {
		errLen := -result
		errBytes, ok := mem.Read(d.bufferPtr, uint32(errLen))
		if ok {
			return fmt.Errorf("JS error: %s", string(errBytes))
		}
		return errors.New("JS error (unable to read message)")
	}

	return nil
}

func (d *XSDebugger) Close() {
	if d.xsnapDestroy != nil {
		d.xsnapDestroy.Call(d.ctx)
	}
	if d.runtime != nil {
		d.runtime.Close(d.ctx)
	}
}

func main() {
	fmt.Println("XS WASM Debugger - Minimal Test")
	fmt.Println("================================")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	debugger, err := NewXSDebugger(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize: %v\n", err)
		os.Exit(1)
	}
	defer debugger.Close()

	if err := debugger.CreateMachine(); err != nil {
		fmt.Fprintf(os.Stderr, "CreateMachine failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("XS machine created")

	tests := []struct {
		name string
		code string
	}{
		{"print string", "print('hello')"},
		{"print number", "print(42)"},
		{"arithmetic", "print(2+3)"},
		{"string concat", "print('a' + 'b')"},
		{"typeof Array", "print(typeof Array)"},
		{"typeof Object", "print(typeof Object)"},
		{"array literal", "var a = [1,2,3]"},
		{"array access", "var a = [1,2,3]; print(a[0])"},
		{"array length", "print([1,2,3].length)"},
		{"Array.map", "try{[1,2,3].map(function(x){return x*2})}catch(e){print('ERR:'+e)}"},
		{"JSON.stringify", "try{print(JSON.stringify({a:1}))}catch(e){print('ERR:'+e)}"},
		{"Object.keys", "try{print(Object.keys({a:1,b:2}).length)}catch(e){print('ERR:'+e)}"},
		{"Promise", "Promise.resolve(42)"},
		{"class", "class Foo { constructor() { this.x = 1; } }"},
		{"for loop 10k", "for(var i=0;i<10000;i++){}"},
	}

	for _, test := range tests {
		fmt.Printf("\nTest: %s\n", test.name)
		fmt.Printf("Code: %s\n", test.code)
		if err := debugger.Evaluate(test.code); err != nil {
			fmt.Printf("FAIL: %v\n", err)
		} else {
			fmt.Println("PASS")
		}
	}
}
