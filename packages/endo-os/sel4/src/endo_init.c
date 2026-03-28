/*
 * Endo OS — seL4 Microkit Protection Domain
 *
 * Boots the formally verified kernel, initializes QuickJS,
 * loads the Endo capability shell, and enters an interactive
 * REPL over serial.  This IS the terminal — the daemon is
 * the operating system's shell.
 */

#include <microkit.h>
#include <stdint.h>
#include "quickjs.h"
#include "uart.h"

/* Memory regions from system.xml. */
uintptr_t js_heap_vaddr;
uintptr_t uart_base_vaddr;

/* Embedded JS sources. */
extern const char js_ses_lockdown[];
extern const int js_ses_lockdown_len;
extern const char js_bootstrap[];
extern const int js_bootstrap_len;

/* Global JS context — lives for the PD's lifetime. */
static JSRuntime *js_rt = NULL;
static JSContext *js_ctx = NULL;

/* --- JS native functions --- */

/* print(...args) */
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
    /* Print prompt if provided. */
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

/* Evaluate and report errors. */
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
        JSValue stack = JS_GetPropertyStr(ctx, exc, "stack");
        if (!JS_IsUndefined(stack)) {
            const char *s = JS_ToCString(ctx, stack);
            if (s) { uart_puts(s); uart_puts("\n"); JS_FreeCString(ctx, s); }
        }
        JS_FreeValue(ctx, stack);
        JS_FreeValue(ctx, exc);
        JS_FreeValue(ctx, val);
        return -1;
    }
    JS_FreeValue(ctx, val);
    return 0;
}

/* --- Microkit entry points --- */

void init(void) {
    /* Initialize UART for direct I/O (bypassing microkit_dbg_puts). */
    uart_init(uart_base_vaddr);

    uart_puts("\n");
    uart_puts("endo-init: Endo OS starting (seL4 + QuickJS)\n");
    uart_puts("endo-init: Formally verified capability-native OS\n");
    uart_puts("\n");

    /* Create QuickJS runtime. */
    js_rt = JS_NewRuntime();
    if (!js_rt) {
        uart_puts("FATAL: JS_NewRuntime failed\n");
        return;
    }
    JS_SetMemoryLimit(js_rt, 14 * 1024 * 1024);

    js_ctx = JS_NewContext(js_rt);
    if (!js_ctx) {
        uart_puts("FATAL: JS_NewContext failed\n");
        return;
    }

    /* Install native functions. */
    JSValue global = JS_GetGlobalObject(js_ctx);
    JS_SetPropertyStr(js_ctx, global, "print",
        JS_NewCFunction(js_ctx, js_print, "print", 1));
    JS_SetPropertyStr(js_ctx, global, "readline",
        JS_NewCFunction(js_ctx, js_readline, "readline", 1));
    JS_FreeValue(js_ctx, global);

    /* Load SES lockdown. */
    eval_source(js_ctx, js_ses_lockdown, js_ses_lockdown_len,
                "ses-lockdown.js");

    /* Load and run the Endo shell. */
    eval_source(js_ctx, js_bootstrap, js_bootstrap_len,
                "endo-shell.js");

    /* The shell JS calls readline() in a loop, so we never
       return from here during normal operation.  If we do
       return, Microkit enters its event loop. */
}

void notified(microkit_channel channel) {
    /* Channel 0 = UART IRQ.  For now the shell uses polling
       (uart_readline spin-waits), but we could switch to
       interrupt-driven I/O here. */
    if (channel == 0) {
        microkit_irq_ack(channel);
    }
}
