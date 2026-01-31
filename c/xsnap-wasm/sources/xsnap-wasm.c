/**
 * XSnap WASM Worker
 * 
 * Entry point for the XSnap WebAssembly module.
 * Uses shared memory and FFI for host communication instead of pipes/netstrings.
 * 
 * Inspired by endo-ocapn/rust/ocapn_noise shared memory pattern.
 */

#include "xs.h"
#include <string.h>   /* For memcpy, memset, strlen */

#ifdef mxSnapshot
/* Forward declaration of snapshot types (instead of including xsSnapshot.h
 * which conflicts with xs.h) - matches xsnap.h */
typedef struct xsSnapshotRecord xsSnapshot;

struct xsSnapshotRecord {
    char* signature;
    int signatureLength;
    xsCallback* callbacks;
    int callbacksLength;
    int (*read)(void* stream, void* address, size_t size);
    int (*write)(void* stream, void* address, size_t size);
    void* stream;
    int error;
    void* firstChunk;
    void* firstProjection;
    void* firstSlot;
    int slotSize;
    void* slots;
};

/* Extern declarations for XS snapshot functions */
extern xsMachine* fxReadSnapshot(xsSnapshot*, const char*, void*);
extern int fxWriteSnapshot(xsMachine*, xsSnapshot*);

/* Macros matching xsnap.h */
#define xsReadSnapshot(_SNAPSHOT, _NAME, _CONTEXT) \
    fxReadSnapshot(_SNAPSHOT, _NAME, _CONTEXT)
#define xsWriteSnapshot(_THE, _SNAPSHOT) \
    fxWriteSnapshot(_THE, _SNAPSHOT)
#endif

/* External declarations for XS internals we need */
extern void fxRunLoop(xsMachine* the);
extern void fxInitializeSharedCluster(void);
extern void fxTerminateSharedCluster(void);

/* ==========================================================================
 * Shared Message Buffer
 *
 * A dynamically resizable buffer for bidirectional message passing.
 * The host and guest take turns writing to this buffer.
 * Either side can request a resize before sending a large message.
 * ========================================================================== */

#define DEFAULT_BUFFER_SIZE (64 * 1024)   /* Start with 64KB */
#define MAX_BUFFER_SIZE (4 * 1024 * 1024) /* Maximum 4MB */

static unsigned char* gxBuffer = NULL;
static size_t gxBufferSize = 0;

/* ==========================================================================
 * Host Imports (provided by Go/Wazero)
 * ========================================================================== */

/* Called when JavaScript invokes issueCommand() */
__attribute__((import_module("env"), import_name("wasm_issue_command")))
extern int wasm_issue_command(int length);

/* Console output (for xs_print) */
__attribute__((import_module("env"), import_name("wasm_console_log")))
extern void wasm_console_log(int length);

/* Memory allocation hooks (WASM linear memory is host-managed) */
__attribute__((import_module("env"), import_name("wasm_alloc")))
extern void* wasm_alloc(int size);

__attribute__((import_module("env"), import_name("wasm_free")))
extern void wasm_free(void* ptr);

/* ==========================================================================
 * Exported Functions (called by Go/Wazero)
 * ========================================================================== */

/* Ensure buffer is at least the requested size.
 * Allocates or grows the buffer as needed.
 * Returns the actual buffer size on success, 0 on failure. */
static int ensure_buffer(size_t needed_size) {
    /* Use default if no specific size requested */
    if (needed_size == 0) {
        needed_size = DEFAULT_BUFFER_SIZE;
    }

    /* Cap at maximum */
    if (needed_size > MAX_BUFFER_SIZE) {
        needed_size = MAX_BUFFER_SIZE;
    }

    /* If current buffer is big enough, nothing to do */
    if (gxBuffer != NULL && gxBufferSize >= needed_size) {
        return (int)gxBufferSize;
    }

    /* Allocate new buffer */
    unsigned char* new_buffer = (unsigned char*)c_malloc(needed_size);
    if (new_buffer == NULL) {
        return 0;
    }

    /* Copy existing data if any */
    if (gxBuffer != NULL && gxBufferSize > 0) {
        size_t copy_size = gxBufferSize < needed_size ? gxBufferSize : needed_size;
        memcpy(new_buffer, gxBuffer, copy_size);
        /* Note: c_free doesn't actually free with bump allocator */
        c_free(gxBuffer);
    }

    gxBuffer = new_buffer;
    gxBufferSize = needed_size;

    return (int)gxBufferSize;
}

/* Return pointer to shared buffer for host to read/write */
__attribute__((visibility("default")))
unsigned char* xsnap_buffer(void) {
    ensure_buffer(0);
    return gxBuffer;
}

/* Return current buffer size */
__attribute__((visibility("default")))
int xsnap_buffer_size(void) {
    ensure_buffer(0);
    return (int)gxBufferSize;
}

/* Return maximum allowed buffer size */
__attribute__((visibility("default")))
int xsnap_buffer_max_size(void) {
    return MAX_BUFFER_SIZE;
}

/* Resize the buffer. Returns new size on success, 0 on failure.
 * Pass 0 to ensure buffer exists with default size (useful for querying current size).
 * The buffer pointer may change after this call!
 * Host must call xsnap_buffer() again to get the new pointer. */
__attribute__((visibility("default")))
int xsnap_resize_buffer(int requested_size) {
    if (requested_size < 0) {
        return 0;
    }
    return ensure_buffer((size_t)requested_size);
}

/* ==========================================================================
 * XS Machine State
 * ========================================================================== */

static xsMachine* gxMachine = NULL;

/* Forward declarations for XS host bindings */
static void xs_issueCommand(xsMachine* the);
static void xs_print(xsMachine* the);
static void xs_setImmediate(xsMachine* the);
static void xs_gc(xsMachine* the);
static void xs_performance_now(xsMachine* the);
static void xs_currentMeterLimit(xsMachine* the);
static void xs_resetMeter(xsMachine* the);

/* External callbacks from moddable modules (always available) */
extern void xs_textdecoder(xsMachine *the);
extern void xs_textdecoder_decode(xsMachine *the);
extern void xs_textdecoder_get_encoding(xsMachine *the);
extern void xs_textdecoder_get_ignoreBOM(xsMachine *the);
extern void xs_textdecoder_get_fatal(xsMachine *the);
extern void xs_textencoder(xsMachine *the);
extern void xs_textencoder_encode(xsMachine *the);
extern void xs_textencoder_encodeInto(xsMachine *the);
extern void xs_base64_encode(xsMachine *the);
extern void xs_base64_decode(xsMachine *the);
extern void fx_harden(xsMachine *the);

#ifdef mxSnapshot
/* Snapshot callbacks table - must match xsnap-worker.c order for compatibility */
#define mxSnapshotCallbackCount 18
static xsCallback gxSnapshotCallbacks[mxSnapshotCallbackCount] = {
    xs_issueCommand,      /* 0 */
    xs_print,             /* 1 */
    xs_setImmediate,      /* 2 */
    xs_gc,                /* 3 */
    xs_performance_now,   /* 4 */
    xs_currentMeterLimit, /* 5 */
    xs_resetMeter,        /* 6 */
    xs_textdecoder,       /* 7 */
    xs_textdecoder_decode, /* 8 */
    xs_textdecoder_get_encoding, /* 9 */
    xs_textdecoder_get_ignoreBOM, /* 10 */
    xs_textdecoder_get_fatal, /* 11 */
    xs_textencoder,       /* 12 */
    xs_textencoder_encode, /* 13 */
    xs_textencoder_encodeInto, /* 14 */
    xs_base64_encode,     /* 15 */
    xs_base64_decode,     /* 16 */
    fx_harden,            /* 17 */
};
#endif /* mxSnapshot */

/* ==========================================================================
 * XS Host Bindings (JavaScript built-ins)
 * ========================================================================== */

/* issueCommand(data) -> response */
static void xs_issueCommand(xsMachine* the) {
    size_t length;
    void* data;

    /* Get argument as ArrayBuffer */
    data = xsToArrayBuffer(xsArg(0));
    length = xsGetArrayBufferLength(xsArg(0));

    /* Ensure buffer is large enough */
    int buf_size = ensure_buffer(length);
    if ((size_t)buf_size < length) {
        xsRangeError("issueCommand: message too large (max %d bytes)", MAX_BUFFER_SIZE);
        return;
    }

    /* Copy to shared buffer */
    memcpy(gxBuffer, data, length);

    /* Call host - returns response length */
    int responseLength = wasm_issue_command((int)length);

    /* Return response as ArrayBuffer */
    if (responseLength > 0) {
        xsResult = xsArrayBuffer(gxBuffer, responseLength);
    } else {
        xsResult = xsUndefined;
    }
}

/* print(...args) */
static void xs_print(xsMachine* the) {
    xsIntegerValue argc = xsToInteger(xsArgc);
    size_t offset = 0;

    ensure_buffer(0); /* Use default size for print */

    for (xsIntegerValue i = 0; i < argc; i++) {
        if (i > 0 && offset < gxBufferSize - 1) {
            gxBuffer[offset++] = ' ';
        }

        xsStringValue str = xsToString(xsArg(i));
        size_t len = strlen(str);

        if (offset + len > gxBufferSize - 1) {
            len = gxBufferSize - 1 - offset;
        }

        memcpy(gxBuffer + offset, str, len);
        offset += len;
    }

    gxBuffer[offset] = '\0';
    wasm_console_log((int)offset);
}

/* setImmediate(callback) - queue for next event loop tick */
static void xs_setImmediate(xsMachine* the) {
    /* In single-threaded WASM, we use the promise job queue */
    xsResult = xsUndefined;
    /* TODO: Implement proper setImmediate via promise jobs */
}

/* gc() - trigger garbage collection */
static void xs_gc(xsMachine* the) {
    xsCollectGarbage();
}

/* performance.now() - high resolution time */
static void xs_performance_now(xsMachine* the) {
    /* Use host import for time */
    extern long long wasm_time_now_ms(void);
    long long ms = wasm_time_now_ms();
    xsResult = xsNumber((double)ms);
}

/* currentMeterLimit() - stub for compatibility */
static void xs_currentMeterLimit(xsMachine* the) {
    xsResult = xsUndefined;
}

/* resetMeter(count) - stub for compatibility */
static void xs_resetMeter(xsMachine* the) {
    /* Metering not implemented in WASM build */
}

/* ==========================================================================
 * Machine Setup
 * ========================================================================== */

static void xsBuildAgent(xsMachine* the) {
    xsBeginHost(the);
    {
        /* Create globalThis bindings */
        xsVars(1);
        
        /* issueCommand */
        xsVar(0) = xsNewHostFunction(xs_issueCommand, 1);
        xsSet(xsGlobal, xsID("issueCommand"), xsVar(0));
        
        /* print */
        xsVar(0) = xsNewHostFunction(xs_print, 0);
        xsSet(xsGlobal, xsID("print"), xsVar(0));
        
        /* gc */
        xsVar(0) = xsNewHostFunction(xs_gc, 0);
        xsSet(xsGlobal, xsID("gc"), xsVar(0));
        
        /* setImmediate */
        xsVar(0) = xsNewHostFunction(xs_setImmediate, 1);
        xsSet(xsGlobal, xsID("setImmediate"), xsVar(0));
        
        /* performance.now */
        xsVar(0) = xsNewHostFunction(xs_performance_now, 0);
        xsDefine(xsGlobal, xsID("performance"), xsNewObject(), xsDefault);
        xsSet(xsGet(xsGlobal, xsID("performance")), xsID("now"), xsVar(0));
        
        /* currentMeterLimit */
        xsVar(0) = xsNewHostFunction(xs_currentMeterLimit, 0);
        xsSet(xsGlobal, xsID("currentMeterLimit"), xsVar(0));
        
        /* resetMeter */
        xsVar(0) = xsNewHostFunction(xs_resetMeter, 1);
        xsSet(xsGlobal, xsID("resetMeter"), xsVar(0));
    }
    xsEndHost(the);
}

/* ==========================================================================
 * Snapshot Support
 * ========================================================================== */

#ifdef mxSnapshot

#define SNAPSHOT_SIGNATURE "xsnap 1"

/* Snapshot stream state for reading/writing to buffer */
static struct {
    unsigned char* data;
    size_t size;      /* Total buffer capacity */
    size_t offset;    /* Current read/write position */
    size_t written;   /* Total bytes written (for write operations) */
} gxSnapshotStream;

static int xsSnapshotRead(void* stream, void* address, size_t size) {
    (void)stream;
    if (gxSnapshotStream.offset + size > gxSnapshotStream.size) {
        return -1;  /* EOF or error */
    }
    memcpy(address, gxSnapshotStream.data + gxSnapshotStream.offset, size);
    gxSnapshotStream.offset += size;
    return 0;
}

static int xsSnapshotWrite(void* stream, void* address, size_t size) {
    (void)stream;

    /* Check if we need more space */
    if (gxSnapshotStream.offset + size > gxSnapshotStream.size) {
        /* Try to grow the buffer */
        size_t needed = gxSnapshotStream.offset + size;
        /* Round up to next 64KB */
        needed = (needed + 65535) & ~65535;
        if (needed > MAX_BUFFER_SIZE) {
            needed = MAX_BUFFER_SIZE;
        }
        if (gxSnapshotStream.offset + size > needed) {
            return -1;  /* Can't fit even at max size */
        }
        int new_size = ensure_buffer(needed);
        if ((size_t)new_size < needed) {
            return -1;  /* Failed to allocate */
        }
        gxSnapshotStream.data = gxBuffer;
        gxSnapshotStream.size = (size_t)new_size;
    }

    memcpy(gxSnapshotStream.data + gxSnapshotStream.offset, address, size);
    gxSnapshotStream.offset += size;
    if (gxSnapshotStream.offset > gxSnapshotStream.written) {
        gxSnapshotStream.written = gxSnapshotStream.offset;
    }
    return 0;
}

extern int fxWriteSnapshot(xsMachine* the, xsSnapshot* snapshot);

/* Load XS machine from snapshot in buffer.
 * The snapshot data must be in the shared buffer.
 * Returns 0 on success, negative on error. */
__attribute__((visibility("default")))
int xsnap_load_snapshot(int length) {
    ensure_buffer(0);

    if (length <= 0 || (size_t)length > gxBufferSize) {
        return -1;
    }

    /* Set up snapshot stream to read from buffer */
    gxSnapshotStream.data = gxBuffer;
    gxSnapshotStream.size = (size_t)length;
    gxSnapshotStream.offset = 0;

    xsSnapshot snapshot = {
        .signature = SNAPSHOT_SIGNATURE,
        .signatureLength = sizeof(SNAPSHOT_SIGNATURE) - 1,
        .callbacks = gxSnapshotCallbacks,
        .callbacksLength = mxSnapshotCallbackCount,
        .read = xsSnapshotRead,
        .write = xsSnapshotWrite,
        .stream = NULL,
        .error = 0,
        .firstChunk = NULL,
        .firstProjection = NULL,
        .firstSlot = NULL,
        .slotSize = 0,
        .slots = NULL,
    };

    gxMachine = xsReadSnapshot(&snapshot, "xsnap", NULL);

    if (gxMachine == NULL || snapshot.error) {
        return snapshot.error ? -snapshot.error : -1;
    }

    return 0;
}

/* Write XS machine state to snapshot in buffer.
 * Returns snapshot size on success, negative on error.
 * After this call, the snapshot data is in the shared buffer
 * and can be read by the host. */
__attribute__((visibility("default")))
int xsnap_write_snapshot(void) {
    if (gxMachine == NULL) {
        return -1;
    }

    /* Ensure we have a reasonable buffer to start */
    int buf_size = ensure_buffer(256 * 1024);  /* Start with 256KB */
    if (buf_size <= 0) {
        return -2;
    }

    /* Set up snapshot stream to write to buffer */
    gxSnapshotStream.data = gxBuffer;
    gxSnapshotStream.size = (size_t)buf_size;
    gxSnapshotStream.offset = 0;
    gxSnapshotStream.written = 0;

    xsSnapshot snapshot = {
        .signature = SNAPSHOT_SIGNATURE,
        .signatureLength = sizeof(SNAPSHOT_SIGNATURE) - 1,
        .callbacks = gxSnapshotCallbacks,
        .callbacksLength = mxSnapshotCallbackCount,
        .read = xsSnapshotRead,
        .write = xsSnapshotWrite,
        .stream = NULL,
        .error = 0,
        .firstChunk = NULL,
        .firstProjection = NULL,
        .firstSlot = NULL,
        .slotSize = 0,
        .slots = NULL,
    };

    int result = fxWriteSnapshot(gxMachine, &snapshot);

    if (result != 0 || snapshot.error) {
        return snapshot.error ? -snapshot.error : -3;
    }

    return (int)gxSnapshotStream.written;
}

#endif /* mxSnapshot */

/* ==========================================================================
 * Exported API (called by host)
 * ========================================================================== */

/* Create a new XS machine */
__attribute__((visibility("default")))
int xsnap_create(void) {
    xsCreation creation = {
        .initialChunkSize = 32768,
        .incrementalChunkSize = 4096,
        .initialHeapCount = 4096,
        .incrementalHeapCount = 512,
        .stackCount = 4096,
        .initialKeyCount = 256,
        .incrementalKeyCount = 64,
        .nameModulo = 127,
        .symbolModulo = 127,
        .parserBufferSize = 32768,
        .parserTableModulo = 1993,
    };
    
    gxMachine = xsCreateMachine(&creation, "xsnap", NULL);
    if (gxMachine == NULL) {
        return -1;
    }
    
    xsBuildAgent(gxMachine);
    return 0;
}

/* Destroy the XS machine */
__attribute__((visibility("default")))
void xsnap_destroy(void) {
    if (gxMachine != NULL) {
        xsDeleteMachine(gxMachine);
        gxMachine = NULL;
    }
}

/* Evaluate JavaScript code from buffer */
__attribute__((visibility("default")))
int xsnap_evaluate(int length) {
    int result = 0;

    /* Buffer should already be sized by host before writing data */
    ensure_buffer(0);

    if (gxMachine == NULL || length <= 0 || (size_t)length > gxBufferSize) {
        return -1;
    }

    /* Null-terminate the code */
    if ((size_t)length < gxBufferSize) {
        gxBuffer[length] = '\0';
    } else {
        gxBuffer[gxBufferSize - 1] = '\0';
    }

    xsBeginHost(gxMachine);
    {
        xsTry {
            /* Evaluate as script */
            xsResult = xsCall1(
                xsGlobal,
                xsID("eval"),
                xsString((char*)gxBuffer)
            );

            /* Run promise jobs */
            fxRunLoop(gxMachine);
        }
        xsCatch {
            /* Store error message in buffer */
            if (xsTypeOf(xsException) != xsUndefinedType) {
                xsStringValue msg = xsToString(xsException);
                size_t msgLen = strlen(msg);
                if (msgLen > gxBufferSize - 1) {
                    msgLen = gxBufferSize - 1;
                }
                memcpy(gxBuffer, msg, msgLen);
                gxBuffer[msgLen] = '\0';
                xsException = xsUndefined;
                result = -(int)(msgLen + 1);
            }
        }
    }
    xsEndHost(gxMachine);
    
    return result;
}

/* Send a command (ArrayBuffer in buffer) to the machine */
__attribute__((visibility("default")))
int xsnap_command(int length) {
    int result = 0;

    /* Buffer should already be sized by host before writing data */
    ensure_buffer(0);

    if (gxMachine == NULL || length <= 0 || (size_t)length > gxBufferSize) {
        return -1;
    }

    xsBeginHost(gxMachine);
    {
        xsTry {
            /* Create ArrayBuffer from buffer contents */
            xsVars(2);
            xsVar(0) = xsArrayBuffer(gxBuffer, length);

            /* Call globalThis.handleCommand(message) */
            xsVar(1) = xsCall1(xsGlobal, xsID("handleCommand"), xsVar(0));

            /* Run promise jobs (for async operations) */
            fxRunLoop(gxMachine);

            /* Get response - should be an ArrayBuffer or undefined */
            if (xsTypeOf(xsVar(1)) != xsUndefinedType) {
                void* responseData = xsToArrayBuffer(xsVar(1));
                size_t responseLen = xsGetArrayBufferLength(xsVar(1));

                if (responseLen > 0 && responseLen <= gxBufferSize) {
                    memcpy(gxBuffer, responseData, responseLen);
                    result = (int)responseLen;
                }
            }
        }
        xsCatch {
            /* Store error message in buffer */
            if (xsTypeOf(xsException) != xsUndefinedType) {
                xsStringValue msg = xsToString(xsException);
                size_t msgLen = strlen(msg);
                if (msgLen > gxBufferSize - 1) {
                    msgLen = gxBufferSize - 1;
                }
                memcpy(gxBuffer, msg, msgLen);
                gxBuffer[msgLen] = '\0';
                xsException = xsUndefined;
                result = -(int)(msgLen + 1);
            }
        }
    }
    xsEndHost(gxMachine);

    return result;
}

/* Get machine status */
__attribute__((visibility("default")))
int xsnap_status(void) {
    return (gxMachine != NULL) ? 1 : 0;
}

/* Debug: Print callback info for debugging snapshot issues */
__attribute__((visibility("default")))
int xsnap_debug_callbacks(void) {
    extern xsCallback gxCallbacks[];
    extern int mxCallbacksLength;

    /* Print first few XS built-in callbacks */
    int count = 0;
    for (int i = 0; i < 10 && i < mxCallbacksLength; i++) {
        /* Write callback index and address to buffer */
        ensure_buffer(256);
        int len = c_snprintf((char*)gxBuffer, 256, "gxCallbacks[%d] = %p", i, (void*)gxCallbacks[i]);
        gxBuffer[len] = '\0';
        wasm_console_log(len);
        count++;
    }

    /* Print our snapshot callbacks */
    for (int i = 0; i < mxSnapshotCallbackCount; i++) {
        ensure_buffer(256);
        int len = c_snprintf((char*)gxBuffer, 256, "gxSnapshotCallbacks[%d] = %p", i, (void*)gxSnapshotCallbacks[i]);
        gxBuffer[len] = '\0';
        wasm_console_log(len);
        count++;
    }

    return count;
}

/* Debug: Create bare machine WITHOUT host bindings for testing */
__attribute__((visibility("default")))
int xsnap_create_bare(void) {
    xsCreation creation = {
        .initialChunkSize = 32768,
        .incrementalChunkSize = 4096,
        .initialHeapCount = 4096,
        .incrementalHeapCount = 512,
        .stackCount = 4096,
        .initialKeyCount = 256,
        .incrementalKeyCount = 64,
        .nameModulo = 127,
        .symbolModulo = 127,
        .parserBufferSize = 32768,
        .parserTableModulo = 1993,
    };

    gxMachine = xsCreateMachine(&creation, "xsnap", NULL);
    if (gxMachine == NULL) {
        return -1;
    }

    /* DO NOT call xsBuildAgent - create bare machine */
    return 0;
}

/* ==========================================================================
 * Memory Management
 * 
 * XS needs malloc/free. We provide them via host imports or a simple
 * bump allocator on the WASM linear memory.
 * ========================================================================== */

/* Simple bump allocator state - will be replaced with proper allocator */
extern unsigned char __heap_base;
static unsigned char* gxHeapPtr = NULL;

void* c_malloc(size_t size) {
    if (gxHeapPtr == NULL) {
        gxHeapPtr = &__heap_base;
    }
    
    /* Align to 8 bytes */
    size = (size + 7) & ~7;
    
    void* ptr = gxHeapPtr;
    gxHeapPtr += size;
    
    return ptr;
}

void* c_calloc(size_t count, size_t size) {
    size_t total = count * size;
    void* ptr = c_malloc(total);
    if (ptr) {
        memset(ptr, 0, total);
    }
    return ptr;
}

void* c_realloc(void* ptr, size_t size) {
    /* Simple implementation: always allocate new, copy, don't free old */
    void* newPtr = c_malloc(size);
    if (newPtr && ptr) {
        /* We don't know the old size, so we can't safely copy */
        /* This is a limitation of the bump allocator */
    }
    return newPtr;
}

void c_free(void* ptr) {
    /* Bump allocator doesn't free */
    (void)ptr;
}

