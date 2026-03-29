/*
 * Endo OS — seL4 Microkit Protection Domain
 *
 * Boots the verified kernel, freezes intrinsics, loads the daemon
 * bytecode, and enters the interactive Endo shell.
 */

#include <microkit.h>
#include <stdint.h>
#include "quickjs.h"
#include "uart.h"

uintptr_t js_heap_vaddr;
uintptr_t uart_base_vaddr;

/* Embedded sources. */
extern const char js_ses_shim[];
extern const int js_ses_shim_len;
extern const char js_eventual_send[];
extern const int js_eventual_send_len;
extern const char js_daemon_powers[];
extern const int js_daemon_powers_len;
extern const char js_bootstrap[];
extern const int js_bootstrap_len;

/* Daemon bytecode (pre-compiled by qjsc). */
extern const uint8_t qjsc_daemon_bundle[] __attribute__((weak));
extern const uint32_t qjsc_daemon_bundle_size __attribute__((weak));

static JSRuntime *js_rt = NULL;
static JSContext *js_ctx = NULL;

/* print() → UART */
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

/* readline(prompt) → string */
static JSValue js_readline(JSContext *ctx, JSValueConst this_val,
                           int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc > 0) {
        const char *prompt = JS_ToCString(ctx, argv[0]);
        if (prompt) { uart_puts(prompt); JS_FreeCString(ctx, prompt); }
    }

    /* Drain pending jobs before blocking on input. */
    JSContext *ctx2;
    while (JS_IsJobPending(js_rt)) {
        JS_ExecutePendingJob(js_rt, &ctx2);
    }

    char buf[1024];
    int len = uart_readline(buf, sizeof(buf));
    if (len < 0) return JS_UNDEFINED;
    return JS_NewStringLen(ctx, buf, len);
}

/* drainJobs() — pump the promise queue from JS. */
static JSValue js_drain_jobs(JSContext *ctx, JSValueConst this_val,
                             int argc, JSValueConst *argv) {
    (void)this_val; (void)argc; (void)argv;
    JSContext *ctx2;
    int n = 0;
    while (JS_IsJobPending(js_rt)) {
        int ret = JS_ExecutePendingJob(js_rt, &ctx2);
        if (ret < 0) {
            JSValue exc = JS_GetException(ctx2);
            const char *msg = JS_ToCString(ctx2, exc);
            if (msg) {
                uart_puts("Job error: ");
                uart_puts(msg);
                uart_puts("\n");
                JS_FreeCString(ctx2, msg);
            }
            JS_FreeValue(ctx2, exc);
        }
        n++;
    }
    return JS_NewInt32(ctx, n);
}

/* Evaluate with error reporting. */
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

    /* Drain pending jobs after each eval. */
    JSContext *ctx2;
    while (JS_IsJobPending(js_rt)) {
        JS_ExecutePendingJob(js_rt, &ctx2);
    }

    return 0;
}

void init(void) {
    uart_init(uart_base_vaddr);

    uart_puts("\nendo-init: Endo OS starting (seL4 + QuickJS-ng)\n");
    uart_puts("endo-init: Formally verified capability-native OS\n\n");

    js_rt = JS_NewRuntime();
    if (!js_rt) { uart_puts("FATAL: JS_NewRuntime\n"); return; }
    JS_SetMemoryLimit(js_rt, 30 * 1024 * 1024);

    js_ctx = JS_NewContext(js_rt);
    if (!js_ctx) { uart_puts("FATAL: JS_NewContext\n"); return; }

    /* Install native functions. */
    JSValue global = JS_GetGlobalObject(js_ctx);
    JS_SetPropertyStr(js_ctx, global, "print",
        JS_NewCFunction(js_ctx, js_print, "print", 1));
    JS_SetPropertyStr(js_ctx, global, "readline",
        JS_NewCFunction(js_ctx, js_readline, "readline", 1));
    JS_SetPropertyStr(js_ctx, global, "drainJobs",
        JS_NewCFunction(js_ctx, js_drain_jobs, "drainJobs", 0));
    JS_FreeValue(js_ctx, global);

    /* Load SES shim first (provides assert, harden fallbacks). */
    eval_source(js_ctx, js_ses_shim, js_ses_shim_len, "ses-shim.js");

    /* Load eventual-send shim (provides HandledPromise + E). */
    uart_puts("endo-init: Loading eventual-send\n");
    eval_source(js_ctx, js_eventual_send, js_eventual_send_len,
                "eventual-send.js");

    /* Load daemon — JS text (bytecode disabled due to format issue). */
    {
        extern const char js_daemon_bundle[] __attribute__((weak));
        extern const int js_daemon_bundle_len __attribute__((weak));
        if (&js_daemon_bundle != NULL && js_daemon_bundle_len > 0) {
            uart_puts("endo-init: Loading daemon JS...\n");
            eval_source(js_ctx, js_daemon_bundle, js_daemon_bundle_len,
                        "daemon-bundle.js");

            /* Check result. */
            eval_source(js_ctx,
                "print('endo-init: EndoDaemon = ' + typeof EndoDaemon);"
                "if(typeof EndoDaemon !== 'undefined' && EndoDaemon.makeDaemon) {"
                "  print('endo-init: makeDaemon = ' + typeof EndoDaemon.makeDaemon);"
                "}"
                "print('endo-init: HandledPromise = ' + typeof HandledPromise);",
                300, "check-daemon.js");
        } else {
            uart_puts("endo-init: No daemon bundle\n");
        }
    }

    /* NOW freeze intrinsics — after all initialization code ran. */
    uart_puts("endo-init: Freezing intrinsics (native C)\n");
    JS_FreezeIntrinsics(js_ctx);
    uart_puts("endo-init: Intrinsics frozen\n");

    /* Load DaemonicPowers. */
    eval_source(js_ctx, js_daemon_powers, js_daemon_powers_len,
                "daemon-powers.js");

    /* Load and run the Endo shell. */
    eval_source(js_ctx, js_bootstrap, js_bootstrap_len, "endo-shell.js");
}

void notified(microkit_channel channel) {
    if (channel == 0) microkit_irq_ack(channel);
}
