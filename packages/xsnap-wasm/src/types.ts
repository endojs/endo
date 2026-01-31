/**
 * Type definitions for @endo/xsnap-wasm
 *
 * @module
 */

/**
 * Options for creating an XSnapWasm instance.
 */
export interface XSnapWasmOptions {
  /**
   * Handler for issueCommand() calls from JavaScript.
   * Called when guest JavaScript invokes the issueCommand(data) built-in.
   *
   * @param command - The command data as a Uint8Array
   * @returns Response data to return to JavaScript, or undefined for no response
   */
  handleCommand?: (command: Uint8Array) => Promise<Uint8Array | void>;

  /**
   * Handler for print() calls from JavaScript.
   * Called when guest JavaScript invokes the print(...args) built-in.
   *
   * @param message - The formatted message string
   */
  handlePrint?: (message: string) => void;

  /**
   * Pre-compiled WebAssembly module.
   * If provided, skips the compilation step for faster instantiation.
   */
  wasmModule?: WebAssembly.Module;

  /**
   * Path or URL to the xsnap.wasm file.
   * Defaults to the bundled xsnap.wasm.
   */
  wasmPath?: string;
}

/**
 * Machine status values.
 */
export type XSnapStatus = 'running' | 'stopped';

/**
 * WASM module exports interface.
 */
export interface XSnapWasmExports {
  memory: WebAssembly.Memory;

  // Buffer management
  xsnap_buffer: () => number;
  xsnap_buffer_size: () => number;
  xsnap_buffer_max_size: () => number;
  xsnap_resize_buffer: (requestedSize: number) => number;

  // Machine lifecycle
  xsnap_create: () => number;
  xsnap_destroy: () => void;
  xsnap_status: () => number;

  // Code execution
  xsnap_evaluate: (length: number) => number;
  xsnap_command: (length: number) => number;

  // Debug (optional, may not be present in release builds)
  xsnap_debug_callbacks?: () => number;
  xsnap_create_bare?: () => number;

  // Snapshot support (when built with SNAPSHOT=1)
  xsnap_load_snapshot?: (length: number) => number;
  xsnap_write_snapshot?: () => number;
}

/**
 * Host imports that the WASM module requires.
 *
 * Note: String functions (strlen, memcpy, etc.) and math functions are now
 * built into the WASM module via wasm_libc.c and don't need to be imported.
 */
export interface XSnapWasmImports {
  env: {
    // Core imports - required for XSnap functionality
    wasm_time_now_ms: () => bigint;
    wasm_issue_command: (length: number) => number;
    wasm_console_log: (length: number) => void;

    // Debug output (optional but recommended)
    wasm_debug_print: (ptr: number, length: number) => void;

    // Memory management stubs (bump allocator is built-in)
    wasm_alloc: (size: number) => number;
    wasm_free: (ptr: number) => void;

    // Exception handling stubs
    setjmp: (buf: number) => number;
    longjmp: (buf: number, val: number) => void;

    // Platform stubs for SharedArrayBuffer (not supported in WASM build)
    fxAbort: (the: number, status: number) => void;
    fxCreateSharedChunk: (size: number) => number;
    fxLockSharedChunk: (data: number) => void;
    fxUnlockSharedChunk: (data: number) => void;
    fxReleaseSharedChunk: (data: number) => void;
    fxNotifySharedChunk: (the: number, data: number, count: number) => number;
    fxWaitSharedChunk: (
      the: number,
      address: number,
      timeout: number,
      resolveFunction: number,
    ) => number;
  };
}
