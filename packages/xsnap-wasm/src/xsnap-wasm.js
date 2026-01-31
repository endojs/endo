// @ts-check
/**
 * XSnap WebAssembly JavaScript engine bindings for Node.js.
 *
 * @module
 */

/** @import { XSnapWasmOptions, XSnapStatus, XSnapWasmExports } from './types.js' */

const DEFAULT_BUFFER_SIZE = 65536;
const MAX_BUFFER_SIZE = 4 * 1024 * 1024; // 4 MiB

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * XSnap WebAssembly JavaScript engine.
 *
 * Provides a sandboxed JavaScript execution environment using the Moddable XS
 * engine compiled to WebAssembly.
 */
export class XSnapWasm {
  /** @type {WebAssembly.Instance | null} */
  #instance = null;

  /** @type {XSnapWasmExports | null} */
  #exports = null;

  /** @type {Uint8Array | null} */
  #buffer = null;

  /** @type {number} */
  #bufferPtr = 0;

  /** @type {number} */
  #bufferSize = 0;

  /** @type {((command: Uint8Array) => Promise<Uint8Array | void>) | undefined} */
  #handleCommand;

  /** @type {((message: string) => void) | undefined} */
  #handlePrint;

  /**
   * Create an XSnapWasm instance.
   * Use XSnapWasm.create() instead of calling this constructor directly.
   *
   * @param {XSnapWasmOptions} [options]
   */
  constructor(options = {}) {
    this.#handleCommand = options.handleCommand;
    this.#handlePrint = options.handlePrint ?? console.log;
  }

  /**
   * Create and initialize a new XSnapWasm instance.
   *
   * @param {XSnapWasmOptions} [options]
   * @returns {Promise<XSnapWasm>}
   */
  static async create(options = {}) {
    const xsnap = new XSnapWasm(options);
    await xsnap.#initialize(options);
    return xsnap;
  }

  /**
   * Initialize the WASM instance.
   *
   * @param {XSnapWasmOptions} options
   */
  async #initialize(options) {
    // Get or compile the WASM module
    let wasmModule = options.wasmModule;
    if (!wasmModule) {
      const wasmPath = options.wasmPath ?? new URL('../xsnap.wasm', import.meta.url);
      const response = await fetch(wasmPath);
      const wasmBytes = await response.arrayBuffer();
      wasmModule = await WebAssembly.compile(wasmBytes);
    }

    // Create host imports
    const imports = this.#createImports();

    // Instantiate the module
    this.#instance = await WebAssembly.instantiate(wasmModule, imports);
    this.#exports = /** @type {XSnapWasmExports} */ (this.#instance.exports);

    // Initialize buffer with default size
    this.#exports.xsnap_resize_buffer(0); // 0 = use default size
    this.#refreshBuffer();

    // Create the XS machine
    const result = this.#exports.xsnap_create();
    if (result !== 0) {
      throw new Error('Failed to create XS machine');
    }
  }

  /**
   * Refresh the buffer reference after a resize or memory growth.
   */
  #refreshBuffer() {
    if (!this.#exports) {
      throw new Error('XSnapWasm not initialized');
    }
    this.#bufferPtr = this.#exports.xsnap_buffer();
    this.#bufferSize = this.#exports.xsnap_buffer_size();
    this.#buffer = new Uint8Array(
      this.#exports.memory.buffer,
      this.#bufferPtr,
      this.#bufferSize,
    );
  }

  /**
   * Ensure the buffer is at least the specified size.
   *
   * @param {number} neededSize
   */
  #ensureBufferSize(neededSize) {
    if (!this.#exports) {
      throw new Error('XSnapWasm not initialized');
    }
    if (neededSize > MAX_BUFFER_SIZE) {
      throw new Error(`Data too large: ${neededSize} bytes (max ${MAX_BUFFER_SIZE})`);
    }
    if (neededSize > this.#bufferSize) {
      const newSize = this.#exports.xsnap_resize_buffer(neededSize);
      if (newSize === 0 || newSize < neededSize) {
        throw new Error(`Failed to resize buffer to ${neededSize} bytes`);
      }
      this.#refreshBuffer();
    }
  }

  /**
   * Create the host import functions for the WASM module.
   *
   * Note: String functions (strlen, memcpy, etc.) are implemented in wasm_libc.c.
   * Math functions are still imported from the host for efficiency.
   *
   * @returns {WebAssembly.Imports}
   */
  #createImports() {
    const self = this;

    return {
      env: {
        // Core imports - required for XSnap functionality
        wasm_time_now_ms: () => BigInt(Date.now()),

        wasm_issue_command: (/** @type {number} */ length) => {
          if (!self.#handleCommand || !self.#buffer) {
            return 0;
          }
          // Note: This is synchronous in the WASM call, but we need async handling
          // For now, return 0 (no response) - proper async support requires more work
          const commandData = self.#buffer.slice(0, length);
          // TODO: Handle async command properly with suspender/asyncify
          void self.#handleCommand(commandData);
          return 0;
        },

        wasm_console_log: (/** @type {number} */ length) => {
          if (!self.#buffer || !self.#handlePrint) {
            return;
          }
          const message = textDecoder.decode(self.#buffer.subarray(0, length));
          self.#handlePrint(message);
        },

        // Debug output for internal diagnostics
        wasm_debug_print: (/** @type {number} */ ptr, /** @type {number} */ length) => {
          const mem = self.#getMemory();
          const message = textDecoder.decode(mem.subarray(ptr, ptr + length));
          console.log('[DEBUG]', message);
        },

        // Math functions - delegate to JavaScript Math
        trunc: Math.trunc,
        fmod: (/** @type {number} */ x, /** @type {number} */ y) => x % y,
        log: Math.log,
        ceil: Math.ceil,
        floor: Math.floor,
        fabs: Math.abs,
        round: Math.round,
        nearbyint: Math.round,
        sqrt: Math.sqrt,
        pow: Math.pow,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        asin: Math.asin,
        acos: Math.acos,
        atan: Math.atan,
        atan2: Math.atan2,
        sinh: Math.sinh,
        cosh: Math.cosh,
        tanh: Math.tanh,
        asinh: Math.asinh,
        acosh: Math.acosh,
        atanh: Math.atanh,
        exp: Math.exp,
        expm1: Math.expm1,
        log1p: Math.log1p,
        log10: Math.log10,
        log2: Math.log2,
        cbrt: Math.cbrt,
        hypot: Math.hypot,

        // Exception handling stubs
        // XS uses setjmp/longjmp for exception handling.
        // Without WASM exception handling proposal, we can't properly implement
        // longjmp. We return 0 from setjmp and make longjmp a no-op.
        // The XS engine handles this by checking exception state after each operation.
        setjmp: (/** @type {number} */ _buf) => 0,
        longjmp: (/** @type {number} */ _buf, /** @type {number} */ val) => {
          // XS will check the exception state and handle it appropriately
          // We can't actually unwind the stack, but XS is designed to handle this
          console.warn(`[longjmp] XS exception signaled (val=${val})`);
        },

        // Platform stubs for SharedArrayBuffer (not supported in WASM build)
        fxCreateSharedChunk: () => 0,
        fxLockSharedChunk: () => {},
        fxUnlockSharedChunk: () => {},
        fxReleaseSharedChunk: () => {},
        fxNotifySharedChunk: () => 0,
        fxWaitSharedChunk: () => 0,
      },
    };
  }

  /**
   * Get the WASM linear memory as a Uint8Array.
   *
   * @returns {Uint8Array}
   */
  #getMemory() {
    if (!this.#exports) {
      throw new Error('XSnapWasm not initialized');
    }
    return new Uint8Array(this.#exports.memory.buffer);
  }

  /**
   * Evaluate JavaScript source code.
   *
   * @param {string} code - JavaScript source code
   * @returns {Promise<void>}
   */
  async evaluate(code) {
    if (!this.#exports || !this.#buffer) {
      throw new Error('XSnapWasm not initialized');
    }

    const codeBytes = textEncoder.encode(code);
    this.#ensureBufferSize(codeBytes.length);

    this.#buffer.set(codeBytes);
    const result = this.#exports.xsnap_evaluate(codeBytes.length);

    if (result < 0) {
      const errorLength = -result;
      // Refresh buffer in case it changed during evaluation
      this.#refreshBuffer();
      const errorMessage = textDecoder.decode(
        this.#buffer.subarray(0, errorLength),
      );
      throw new Error(errorMessage);
    }
  }

  /**
   * Send a command to the JavaScript machine.
   *
   * @param {Uint8Array} data - Command data
   * @returns {Promise<Uint8Array>}
   */
  async command(data) {
    if (!this.#exports || !this.#buffer) {
      throw new Error('XSnapWasm not initialized');
    }

    this.#ensureBufferSize(data.length);

    this.#buffer.set(data);
    const result = this.#exports.xsnap_command(data.length);

    if (result < 0) {
      const errorLength = -result;
      // Refresh buffer in case it changed during command
      this.#refreshBuffer();
      const errorMessage = textDecoder.decode(
        this.#buffer.subarray(0, errorLength),
      );
      throw new Error(errorMessage);
    }

    if (result > 0) {
      // Refresh buffer in case it changed during command
      this.#refreshBuffer();
      return this.#buffer.slice(0, result);
    }

    return new Uint8Array(0);
  }

  /**
   * Close the XSnap instance and free resources.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.#exports) {
      this.#exports.xsnap_destroy();
    }
    this.#exports = null;
    this.#instance = null;
    this.#buffer = null;
  }

  /**
   * Get the current machine status.
   *
   * @returns {XSnapStatus}
   */
  get status() {
    if (!this.#exports) {
      return 'stopped';
    }
    return this.#exports.xsnap_status() === 1 ? 'running' : 'stopped';
  }
}

