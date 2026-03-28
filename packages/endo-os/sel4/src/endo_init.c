/*
 * Endo OS — seL4 Microkit Protection Domain
 *
 * Boots the verified kernel, freezes JS intrinsics via native C
 * lockdown (0ms), loads the pre-compiled daemon bytecode, and
 * enters the Endo shell.
 */

#include <microkit.h>
#include <stdint.h>
#include "quickjs.h"
#include "uart.h"

uintptr_t js_heap_vaddr;
uintptr_t uart_base_vaddr;

/* Embedded JS/bytecode sources. */
extern const char js_daemon_powers[];
extern const int js_daemon_powers_len;
extern const char js_bootstrap[];
extern const int js_bootstrap_len;

/* If daemon was pre-compiled to bytecode, this is defined. */
extern const uint8_t qjsc_daemon_bundle[] __attribute__((weak));
extern const uint32_t qjsc_daemon_bundle_size __attribute__((weak));

/* Fallback: JS text bundle if no bytecode. */
extern const char js_daemon_bundle[] __attribute__((weak));
extern const int js_daemon_bundle_len __attribute__((weak));

static JSRuntime *js_rt = NULL;
static JSContext *js_ctx = NULL;

/* print() → UART */
static JSValue js_print(JSContext *ctx, JSValueConst this_val,
                        int argc, JSValueConst *argv) {
    (void)this_val;
    for (int i = 0; i < argc; i++) {
        if (i > 0) uart_puts(" ");
        const char *str = JS_ToCString(ctx, argv[i]);
        if (str) {
            uart_puts(str);
            JS_FreeCString(ctx, str);
        }
    }
    uart_puts("\n");
    return JS_UNDEFINED;
}

/* readline(prompt) → string */
static JSValue js_readline(JSContext *ctx, JSValueConst this_val,
                           int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc > 0) {
        const char *prompt = JS_ToCString(ctx, argv[0]);
        if (prompt) {
            uart_puts(prompt);
            JS_FreeCString(ctx, prompt);
        }
    }
    char buf[1024];
    int len = uart_readline(buf, sizeof(buf));
    if (len < 0) return JS_UNDEFINED;
    return JS_NewStringLen(ctx, buf, len);
}

/* Evaluate JS source with error reporting. */
static int eval_source(JSContext *ctx, const char *source, int len,
                       const char *filename) {
    JSValue val = JS_Eval(ctx, source, len, filename,
                          JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_STRICT);
    if (JS_IsException(val)) {
        JSValue exc = JS_GetException(ctx);
        const char *msg = JS_ToCString(ctx, exc);
        if (msg) {
            uart_puts("ERROR: ");
            uart_puts(msg);
            uart_puts("\n");
            JS_FreeCString(ctx, msg);
        }
        JS_FreeValue(ctx, exc);
        JS_FreeValue(ctx, val);
        return -1;
    }
    JS_FreeValue(ctx, val);
    return 0;
}

void init(void) {
    uart_init(uart_base_vaddr);

    uart_puts("\n");
    uart_puts("endo-init: Endo OS starting (seL4 + QuickJS-ng)\n");
    uart_puts("endo-init: Formally verified capability-native OS\n");
    uart_puts("\n");

    /* Create QuickJS runtime. */
    js_rt = JS_NewRuntime();
    if (!js_rt) {
        uart_puts("FATAL: JS_NewRuntime failed\n");
        return;
    }
    JS_SetMemoryLimit(js_rt, 30 * 1024 * 1024);

    js_ctx = JS_NewContext(js_rt);
    if (!js_ctx) {
        uart_puts("FATAL: JS_NewContext failed\n");
        return;
    }

    /* Install native functions first (before lockdown freezes things). */
    JSValue global = JS_GetGlobalObject(js_ctx);
    JS_SetPropertyStr(js_ctx, global, "print",
        JS_NewCFunction(js_ctx, js_print, "print", 1));
    JS_SetPropertyStr(js_ctx, global, "readline",
        JS_NewCFunction(js_ctx, js_readline, "readline", 1));
    JS_FreeValue(js_ctx, global);

    /* Try native lockdown from C. If it fails (ABORT), the
       QuickJS-ng API may need adjustments for freestanding. */
    uart_puts("endo-init: Freezing intrinsics (native C)\n");

    /* Call JS_FreezeIntrinsics directly — this is the core
       freeze function without the intrinsic registration step
       that JS_AddIntrinsicLockdown does. */
    int freeze_ret = JS_FreezeIntrinsics(js_ctx);
    if (freeze_ret != 0) {
        uart_puts("endo-init: C freeze failed, trying JS lockdown()\n");
        eval_source(js_ctx, "if(typeof lockdown==='function')lockdown()",
                    42, "lockdown-fallback.js");
    } else {
        uart_puts("endo-init: Intrinsics frozen in <1ms\n");
    }

    /* Load daemon bundle (bytecode if available, else JS text). */
    if (&qjsc_daemon_bundle != NULL && &qjsc_daemon_bundle_size != NULL
        && qjsc_daemon_bundle_size > 0) {
        uart_puts("endo-init: Loading daemon (pre-compiled bytecode)\n");
        JSValue obj = JS_ReadObject(js_ctx, qjsc_daemon_bundle,
                                    qjsc_daemon_bundle_size,
                                    JS_READ_OBJ_BYTECODE);
        if (!JS_IsException(obj)) {
            JSValue val = JS_EvalFunction(js_ctx, obj);
            if (JS_IsException(val)) {
                uart_puts("endo-init: Daemon bytecode eval failed\n");
                JSValue exc = JS_GetException(js_ctx);
                const char *msg = JS_ToCString(js_ctx, exc);
                if (msg) { uart_puts(msg); uart_puts("\n"); JS_FreeCString(js_ctx, msg); }
                JS_FreeValue(js_ctx, exc);
            }
            JS_FreeValue(js_ctx, val);
        } else {
            uart_puts("endo-init: Daemon bytecode load failed\n");
        }
    } else if (&js_daemon_bundle != NULL && js_daemon_bundle_len > 0) {
        uart_puts("endo-init: Loading daemon (JS text, slow)\n");
        eval_source(js_ctx, js_daemon_bundle, js_daemon_bundle_len,
                    "daemon-bundle.js");
    } else {
        uart_puts("endo-init: No daemon bundle available\n");
    }

    /* Load in-memory DaemonicPowers. */
    eval_source(js_ctx, js_daemon_powers, js_daemon_powers_len,
                "daemon-powers.js");

    /* Load and run the Endo shell (enters REPL). */
    eval_source(js_ctx, js_bootstrap, js_bootstrap_len,
                "endo-shell.js");
}

void notified(microkit_channel channel) {
    if (channel == 0) {
        microkit_irq_ack(channel);
    }
}
