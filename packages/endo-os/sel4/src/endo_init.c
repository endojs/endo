/*
 * Endo OS — seL4 Microkit Protection Domain
 *
 * Boots the verified kernel, freezes intrinsics via native C
 * lockdown, and enters the interactive Endo shell.
 *
 * The shell IS the daemon — it implements the full Endo CLI
 * command set with in-memory storage, native Compartment
 * isolation, and pet name management.
 */

#include <microkit.h>
#include <stdint.h>
#include "quickjs.h"
#include "uart.h"

uintptr_t js_heap_vaddr;
#if !defined(__x86_64__) && !defined(__i386__)
uintptr_t uart_base_vaddr;
#endif

/* Embedded JS sources. */
extern const char js_ses_shim[];
extern const int js_ses_shim_len;
extern const char js_bootstrap[];
extern const int js_bootstrap_len;

static JSRuntime *js_rt = NULL;
static JSContext *js_ctx = NULL;

static JSValue js_print(JSContext *ctx, JSValueConst this_val,
                        int argc, JSValueConst *argv) {
    (void)this_val;
    for (int i = 0; i < argc; i++) {
        if (i > 0) uart_puts(" ");
        const char *str = JS_ToCString(ctx, argv[i]);
        if (str) { uart_puts(str); JS_FreeCString(ctx, str); }
    }
    uart_puts("\n");
    return JS_UNDEFINED;
}

static JSValue js_readline(JSContext *ctx, JSValueConst this_val,
                           int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc > 0) {
        const char *prompt = JS_ToCString(ctx, argv[0]);
        if (prompt) { uart_puts(prompt); JS_FreeCString(ctx, prompt); }
    }
    JSContext *ctx2;
    while (JS_IsJobPending(js_rt))
        JS_ExecutePendingJob(js_rt, &ctx2);

    char buf[1024];
    int len = uart_readline(buf, sizeof(buf));
    if (len < 0) return JS_UNDEFINED;
    return JS_NewStringLen(ctx, buf, len);
}

static int eval_source(JSContext *ctx, const char *source, int len,
                       const char *filename) {
    JSValue val = JS_Eval(ctx, source, len, filename,
                          JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_STRICT);
    if (JS_IsException(val)) {
        JSValue exc = JS_GetException(ctx);
        const char *msg = JS_ToCString(ctx, exc);
        if (msg) {
            uart_puts("ERROR: "); uart_puts(msg); uart_puts("\n");
            JS_FreeCString(ctx, msg);
        }
        JS_FreeValue(ctx, exc);
        JS_FreeValue(ctx, val);
        return -1;
    }
    JS_FreeValue(ctx, val);
    JSContext *ctx2;
    while (JS_IsJobPending(js_rt))
        JS_ExecutePendingJob(js_rt, &ctx2);
    return 0;
}

void init(void) {
#if defined(__x86_64__) || defined(__i386__)
    uart_init(0);
#else
    uart_init(uart_base_vaddr);
#endif

    uart_puts("\nendo-init: Endo OS (seL4 + QuickJS-ng)\n\n");

    js_rt = JS_NewRuntime();
    if (!js_rt) { uart_puts("FATAL: JS_NewRuntime\n"); return; }
    JS_SetMemoryLimit(js_rt, 30 * 1024 * 1024);

    js_ctx = JS_NewContext(js_rt);
    if (!js_ctx) { uart_puts("FATAL: JS_NewContext\n"); return; }

    JSValue global = JS_GetGlobalObject(js_ctx);
    JS_SetPropertyStr(js_ctx, global, "print",
        JS_NewCFunction(js_ctx, js_print, "print", 1));
    JS_SetPropertyStr(js_ctx, global, "readline",
        JS_NewCFunction(js_ctx, js_readline, "readline", 1));
    JS_FreeValue(js_ctx, global);

    /* SES shim (provides harden, Compartment, assert if not native). */
    eval_source(js_ctx, js_ses_shim, js_ses_shim_len, "ses-shim.js");

    /* Native lockdown: freeze all intrinsics in <1ms. */
    uart_puts("endo-init: Freezing intrinsics\n");
    JS_FreezeIntrinsics(js_ctx);

    /* The shell IS the daemon. */
    eval_source(js_ctx, js_bootstrap, js_bootstrap_len, "endo-shell.js");
}

void notified(microkit_channel channel) {
    if (channel == 0) microkit_irq_ack(channel);
}
