/*
 * Endo OS — Redox entry point
 *
 * Unlike seL4, Redox gives us a full POSIX-like environment:
 * real libc, filesystem, stdio, malloc.  QuickJS runs natively
 * without any stubs.
 *
 * The capability model comes from Redox's namespace system:
 * each process only sees the schemes in its namespace.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quickjs.h"

/* Embedded JS sources. */
extern const char js_ses_shim[];
extern const unsigned int js_ses_shim_len;
extern const char js_bootstrap[];
extern const unsigned int js_bootstrap_len;

static JSRuntime *js_rt = NULL;
static JSContext *js_ctx = NULL;

/* print() → stdout */
static JSValue js_print(JSContext *ctx, JSValueConst this_val,
                        int argc, JSValueConst *argv) {
    (void)this_val;
    for (int i = 0; i < argc; i++) {
        if (i > 0) putchar(' ');
        const char *str = JS_ToCString(ctx, argv[i]);
        if (str) { fputs(str, stdout); JS_FreeCString(ctx, str); }
    }
    putchar('\n');
    fflush(stdout);
    return JS_UNDEFINED;
}

/* readline(prompt) → string */
static JSValue js_readline(JSContext *ctx, JSValueConst this_val,
                           int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc > 0) {
        const char *prompt = JS_ToCString(ctx, argv[0]);
        if (prompt) { fputs(prompt, stdout); fflush(stdout); JS_FreeCString(ctx, prompt); }
    }

    /* Drain pending jobs before blocking. */
    JSContext *ctx2;
    while (JS_IsJobPending(js_rt))
        JS_ExecutePendingJob(js_rt, &ctx2);

    char buf[1024];
    if (!fgets(buf, sizeof(buf), stdin)) return JS_UNDEFINED;

    /* Strip trailing newline. */
    size_t len = strlen(buf);
    if (len > 0 && buf[len - 1] == '\n') buf[--len] = '\0';

    return JS_NewStringLen(ctx, buf, len);
}

/* readFile(path) → string (for loading JS from disk) */
static JSValue js_read_file(JSContext *ctx, JSValueConst this_val,
                            int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc < 1) return JS_UNDEFINED;
    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_UNDEFINED;

    FILE *f = fopen(path, "r");
    JS_FreeCString(ctx, path);
    if (!f) return JS_UNDEFINED;

    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);

    char *data = malloc(size + 1);
    if (!data) { fclose(f); return JS_UNDEFINED; }
    fread(data, 1, size, f);
    data[size] = '\0';
    fclose(f);

    JSValue result = JS_NewStringLen(ctx, data, size);
    free(data);
    return result;
}

/* writeFile(path, text) → boolean */
static JSValue js_write_file(JSContext *ctx, JSValueConst this_val,
                             int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc < 2) return JS_FALSE;
    const char *path = JS_ToCString(ctx, argv[0]);
    const char *text = JS_ToCString(ctx, argv[1]);
    if (!path || !text) {
        if (path) JS_FreeCString(ctx, path);
        if (text) JS_FreeCString(ctx, text);
        return JS_FALSE;
    }

    FILE *f = fopen(path, "w");
    JS_FreeCString(ctx, path);
    if (!f) { JS_FreeCString(ctx, text); return JS_FALSE; }

    fputs(text, f);
    fclose(f);
    JS_FreeCString(ctx, text);
    return JS_TRUE;
}

static int eval_source(JSContext *ctx, const char *source, int len,
                       const char *filename) {
    JSValue val = JS_Eval(ctx, source, len, filename,
                          JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_STRICT);
    if (JS_IsException(val)) {
        JSValue exc = JS_GetException(ctx);
        const char *msg = JS_ToCString(ctx, exc);
        if (msg) { fprintf(stderr, "ERROR: %s\n", msg); JS_FreeCString(ctx, msg); }
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

int main(int argc, char **argv) {
    (void)argc; (void)argv;

    printf("endo-init: Endo OS (Redox + QuickJS-ng)\n");
    printf("endo-init: Capability-native operating system\n\n");

    js_rt = JS_NewRuntime();
    if (!js_rt) { fprintf(stderr, "FATAL: JS_NewRuntime\n"); return 1; }

    js_ctx = JS_NewContext(js_rt);
    if (!js_ctx) { fprintf(stderr, "FATAL: JS_NewContext\n"); return 1; }

    /* Install native functions. */
    JSValue global = JS_GetGlobalObject(js_ctx);
    JS_SetPropertyStr(js_ctx, global, "print",
        JS_NewCFunction(js_ctx, js_print, "print", 1));
    JS_SetPropertyStr(js_ctx, global, "readline",
        JS_NewCFunction(js_ctx, js_readline, "readline", 1));
    JS_SetPropertyStr(js_ctx, global, "readFile",
        JS_NewCFunction(js_ctx, js_read_file, "readFile", 1));
    JS_SetPropertyStr(js_ctx, global, "writeFile",
        JS_NewCFunction(js_ctx, js_write_file, "writeFile", 2));
    JS_FreeValue(js_ctx, global);

    /* Native lockdown: freeze intrinsics. */
    printf("endo-init: Freezing intrinsics\n");
    JS_FreezeIntrinsics(js_ctx);

    /* Load SES shim. */
    eval_source(js_ctx, js_ses_shim, js_ses_shim_len, "ses-shim.js");

    /* Load shell. */
    eval_source(js_ctx, js_bootstrap, js_bootstrap_len, "endo-shell.js");

    /* Cleanup. */
    JS_FreeContext(js_ctx);
    JS_FreeRuntime(js_rt);
    return 0;
}
