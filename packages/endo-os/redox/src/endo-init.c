/*
 * Endo OS — Redox/Linux entry point
 *
 * Full POSIX environment: real libc, filesystem, networking.
 * Capabilities provided via CLI flags or environment variables:
 *
 *   --mount <name>=<path>   Expose a directory as a capability
 *   --port <port>           Listen on a TCP port
 *   ENDO_MOUNT_<name>=<path>  Same via env
 *   ENDO_PORT=<port>          Same via env
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <unistd.h>
#include <errno.h>
#include "quickjs.h"

extern const char js_ses_shim[];
extern const unsigned int js_ses_shim_len;
extern const char js_bootstrap[];
extern const unsigned int js_bootstrap_len;

static JSRuntime *js_rt = NULL;
static JSContext *js_ctx = NULL;

/* ================================================================
 * Core: print, readline, eval
 * ================================================================ */

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

static JSValue js_readline(JSContext *ctx, JSValueConst this_val,
                           int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc > 0) {
        const char *prompt = JS_ToCString(ctx, argv[0]);
        if (prompt) { fputs(prompt, stdout); fflush(stdout); JS_FreeCString(ctx, prompt); }
    }
    JSContext *ctx2;
    while (JS_IsJobPending(js_rt))
        JS_ExecutePendingJob(js_rt, &ctx2);
    char buf[4096];
    if (!fgets(buf, sizeof(buf), stdin)) return JS_UNDEFINED;
    size_t len = strlen(buf);
    if (len > 0 && buf[len - 1] == '\n') buf[--len] = '\0';
    return JS_NewStringLen(ctx, buf, len);
}

/* ================================================================
 * Filesystem: readFile, writeFile, listDir, statFile, mkdirp, removeFile
 * ================================================================ */

static JSValue js_read_file(JSContext *ctx, JSValueConst this_val,
                            int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc < 1) return JS_UNDEFINED;
    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_UNDEFINED;
    FILE *f = fopen(path, "rb");
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
    FILE *f = fopen(path, "wb");
    JS_FreeCString(ctx, path);
    if (!f) { JS_FreeCString(ctx, text); return JS_FALSE; }
    fputs(text, f);
    fclose(f);
    JS_FreeCString(ctx, text);
    return JS_TRUE;
}

/* listDir(path) → array of {name, isDir} */
static JSValue js_list_dir(JSContext *ctx, JSValueConst this_val,
                           int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc < 1) return JS_UNDEFINED;
    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_UNDEFINED;

    DIR *d = opendir(path);
    if (!d) { JS_FreeCString(ctx, path); return JS_UNDEFINED; }

    JSValue arr = JS_NewArray(ctx);
    int idx = 0;
    struct dirent *entry;
    while ((entry = readdir(d)) != NULL) {
        if (entry->d_name[0] == '.' &&
            (entry->d_name[1] == '\0' ||
             (entry->d_name[1] == '.' && entry->d_name[2] == '\0')))
            continue;

        JSValue obj = JS_NewObject(ctx);
        JS_SetPropertyStr(ctx, obj, "name",
            JS_NewString(ctx, entry->d_name));

        /* Check if directory. */
        char full[4096];
        snprintf(full, sizeof(full), "%s/%s", path, entry->d_name);
        struct stat st;
        int is_dir = (stat(full, &st) == 0 && S_ISDIR(st.st_mode));
        JS_SetPropertyStr(ctx, obj, "isDir", JS_NewBool(ctx, is_dir));

        struct stat st2;
        if (stat(full, &st2) == 0) {
            JS_SetPropertyStr(ctx, obj, "size",
                JS_NewInt64(ctx, st2.st_size));
        }

        JS_DefinePropertyValueUint32(ctx, arr, idx++, obj, JS_PROP_C_W_E);
    }
    closedir(d);
    JS_FreeCString(ctx, path);
    return arr;
}

/* statFile(path) → {size, isDir, isFile} or undefined */
static JSValue js_stat_file(JSContext *ctx, JSValueConst this_val,
                            int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc < 1) return JS_UNDEFINED;
    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_UNDEFINED;
    struct stat st;
    if (stat(path, &st) != 0) { JS_FreeCString(ctx, path); return JS_UNDEFINED; }
    JS_FreeCString(ctx, path);

    JSValue obj = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, obj, "size", JS_NewInt64(ctx, st.st_size));
    JS_SetPropertyStr(ctx, obj, "isDir", JS_NewBool(ctx, S_ISDIR(st.st_mode)));
    JS_SetPropertyStr(ctx, obj, "isFile", JS_NewBool(ctx, S_ISREG(st.st_mode)));
    return obj;
}

/* mkdirp(path) → boolean */
static JSValue js_mkdir(JSContext *ctx, JSValueConst this_val,
                        int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc < 1) return JS_FALSE;
    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_FALSE;
    int ret = mkdir(path, 0755);
    JS_FreeCString(ctx, path);
    return JS_NewBool(ctx, ret == 0 || errno == EEXIST);
}

/* removeFile(path) → boolean */
static JSValue js_remove_file(JSContext *ctx, JSValueConst this_val,
                              int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc < 1) return JS_FALSE;
    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_FALSE;
    int ret = remove(path);
    JS_FreeCString(ctx, path);
    return JS_NewBool(ctx, ret == 0);
}

/* ================================================================
 * Networking: netListen, netAccept, netConnect, netRecv, netSend, netClose
 * ================================================================ */

/* netListen(port) → fd */
static JSValue js_net_listen(JSContext *ctx, JSValueConst this_val,
                             int argc, JSValueConst *argv) {
    (void)this_val;
    int port = 0;
    if (argc >= 1) JS_ToInt32(ctx, &port, argv[0]);

    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return JS_ThrowInternalError(ctx, "socket() failed");

    int reuse = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(port);

    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        close(fd);
        return JS_ThrowInternalError(ctx, "bind() failed");
    }
    if (listen(fd, 128) < 0) {
        close(fd);
        return JS_ThrowInternalError(ctx, "listen() failed");
    }

    socklen_t alen = sizeof(addr);
    getsockname(fd, (struct sockaddr *)&addr, &alen);
    fprintf(stderr, "endo-init: Listening on port %d\n", ntohs(addr.sin_port));

    return JS_NewInt32(ctx, fd);
}

/* netAccept(listenFd) → fd */
static JSValue js_net_accept(JSContext *ctx, JSValueConst this_val,
                             int argc, JSValueConst *argv) {
    (void)this_val;
    int listen_fd = 0;
    if (argc >= 1) JS_ToInt32(ctx, &listen_fd, argv[0]);

    struct sockaddr_in client = {0};
    socklen_t clen = sizeof(client);
    int fd = accept(listen_fd, (struct sockaddr *)&client, &clen);
    if (fd < 0) return JS_ThrowInternalError(ctx, "accept() failed");

    int flag = 1;
    setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));

    return JS_NewInt32(ctx, fd);
}

/* netConnect(host, port) → fd */
static JSValue js_net_connect(JSContext *ctx, JSValueConst this_val,
                              int argc, JSValueConst *argv) {
    (void)this_val;
    if (argc < 2) return JS_ThrowTypeError(ctx, "connect(host, port)");
    const char *host = JS_ToCString(ctx, argv[0]);
    int port = 0;
    JS_ToInt32(ctx, &port, argv[1]);
    if (!host) return JS_UNDEFINED;

    struct addrinfo hints = {0}, *result;
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    char port_str[8];
    snprintf(port_str, sizeof(port_str), "%d", port);

    int err = getaddrinfo(host, port_str, &hints, &result);
    JS_FreeCString(ctx, host);
    if (err != 0) return JS_ThrowInternalError(ctx, "DNS failed");

    int fd = socket(result->ai_family, result->ai_socktype, result->ai_protocol);
    if (fd < 0) { freeaddrinfo(result); return JS_ThrowInternalError(ctx, "socket() failed"); }

    if (connect(fd, result->ai_addr, result->ai_addrlen) < 0) {
        close(fd); freeaddrinfo(result);
        return JS_ThrowInternalError(ctx, "connect() failed");
    }
    freeaddrinfo(result);

    int flag = 1;
    setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));
    return JS_NewInt32(ctx, fd);
}

/* netRecv(fd, maxBytes) → string */
static JSValue js_net_recv(JSContext *ctx, JSValueConst this_val,
                           int argc, JSValueConst *argv) {
    (void)this_val;
    int fd = 0, max = 4096;
    if (argc >= 1) JS_ToInt32(ctx, &fd, argv[0]);
    if (argc >= 2) JS_ToInt32(ctx, &max, argv[1]);
    if (max > 1024 * 1024) max = 1024 * 1024;

    char *buf = malloc(max);
    if (!buf) return JS_UNDEFINED;
    ssize_t n = recv(fd, buf, max, 0);
    if (n <= 0) { free(buf); return JS_NewStringLen(ctx, "", 0); }

    JSValue result = JS_NewStringLen(ctx, buf, n);
    free(buf);
    return result;
}

/* netSend(fd, data) → bytesSent */
static JSValue js_net_send(JSContext *ctx, JSValueConst this_val,
                           int argc, JSValueConst *argv) {
    (void)this_val;
    int fd = 0;
    if (argc >= 1) JS_ToInt32(ctx, &fd, argv[0]);
    if (argc < 2) return JS_NewInt32(ctx, 0);
    size_t len;
    const char *data = JS_ToCStringLen(ctx, &len, argv[1]);
    if (!data) return JS_NewInt32(ctx, 0);
    ssize_t n = send(fd, data, len, 0);
    JS_FreeCString(ctx, data);
    return JS_NewInt32(ctx, n > 0 ? n : 0);
}

/* netClose(fd) */
static JSValue js_net_close(JSContext *ctx, JSValueConst this_val,
                            int argc, JSValueConst *argv) {
    (void)this_val;
    int fd = 0;
    if (argc >= 1) JS_ToInt32(ctx, &fd, argv[0]);
    close(fd);
    return JS_UNDEFINED;
}

/* ================================================================
 * Eval helper
 * ================================================================ */

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

/* ================================================================
 * Main: parse CLI/ENV, set up capabilities, run shell
 * ================================================================ */

int main(int argc, char **argv) {
    printf("endo-init: Endo OS (Redox + QuickJS-ng)\n\n");

    js_rt = JS_NewRuntime();
    if (!js_rt) { fprintf(stderr, "FATAL: JS_NewRuntime\n"); return 1; }

    js_ctx = JS_NewContext(js_rt);
    if (!js_ctx) { fprintf(stderr, "FATAL: JS_NewContext\n"); return 1; }

    /* Install all native functions. */
    JSValue global = JS_GetGlobalObject(js_ctx);

    /* Core */
    JS_SetPropertyStr(js_ctx, global, "print",
        JS_NewCFunction(js_ctx, js_print, "print", 1));
    JS_SetPropertyStr(js_ctx, global, "readline",
        JS_NewCFunction(js_ctx, js_readline, "readline", 1));

    /* Filesystem */
    JS_SetPropertyStr(js_ctx, global, "__readFile",
        JS_NewCFunction(js_ctx, js_read_file, "__readFile", 1));
    JS_SetPropertyStr(js_ctx, global, "__writeFile",
        JS_NewCFunction(js_ctx, js_write_file, "__writeFile", 2));
    JS_SetPropertyStr(js_ctx, global, "__listDir",
        JS_NewCFunction(js_ctx, js_list_dir, "__listDir", 1));
    JS_SetPropertyStr(js_ctx, global, "__statFile",
        JS_NewCFunction(js_ctx, js_stat_file, "__statFile", 1));
    JS_SetPropertyStr(js_ctx, global, "__mkdir",
        JS_NewCFunction(js_ctx, js_mkdir, "__mkdir", 1));
    JS_SetPropertyStr(js_ctx, global, "__removeFile",
        JS_NewCFunction(js_ctx, js_remove_file, "__removeFile", 1));

    /* Networking */
    JS_SetPropertyStr(js_ctx, global, "__netListen",
        JS_NewCFunction(js_ctx, js_net_listen, "__netListen", 1));
    JS_SetPropertyStr(js_ctx, global, "__netAccept",
        JS_NewCFunction(js_ctx, js_net_accept, "__netAccept", 1));
    JS_SetPropertyStr(js_ctx, global, "__netConnect",
        JS_NewCFunction(js_ctx, js_net_connect, "__netConnect", 2));
    JS_SetPropertyStr(js_ctx, global, "__netRecv",
        JS_NewCFunction(js_ctx, js_net_recv, "__netRecv", 2));
    JS_SetPropertyStr(js_ctx, global, "__netSend",
        JS_NewCFunction(js_ctx, js_net_send, "__netSend", 2));
    JS_SetPropertyStr(js_ctx, global, "__netClose",
        JS_NewCFunction(js_ctx, js_net_close, "__netClose", 1));

    /* Parse CLI args and ENV into a config object on globalThis. */
    JSValue config = JS_NewObject(js_ctx);
    JSValue mounts = JS_NewObject(js_ctx);
    int port = 0;

    /* CLI: --mount name=/path --port 8920 */
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--mount") == 0 && i + 1 < argc) {
            i++;
            char *eq = strchr(argv[i], '=');
            if (eq) {
                *eq = '\0';
                JS_SetPropertyStr(js_ctx, mounts, argv[i],
                    JS_NewString(js_ctx, eq + 1));
                fprintf(stderr, "endo-init: Mount: %s → %s\n", argv[i], eq + 1);
                *eq = '=';
            }
        } else if (strcmp(argv[i], "--port") == 0 && i + 1 < argc) {
            i++;
            port = atoi(argv[i]);
            fprintf(stderr, "endo-init: Port: %d\n", port);
        }
    }

    /* ENV: ENDO_MOUNT_name=/path, ENDO_PORT=8920 */
    extern char **environ;
    for (char **env = environ; *env; env++) {
        if (strncmp(*env, "ENDO_MOUNT_", 11) == 0) {
            char *eq = strchr(*env + 11, '=');
            if (eq) {
                char name[256];
                int nlen = (int)(eq - (*env + 11));
                if (nlen > 0 && nlen < 255) {
                    strncpy(name, *env + 11, nlen);
                    name[nlen] = '\0';
                    /* Lowercase the name. */
                    for (int j = 0; name[j]; j++)
                        if (name[j] >= 'A' && name[j] <= 'Z') name[j] += 32;
                    JS_SetPropertyStr(js_ctx, mounts, name,
                        JS_NewString(js_ctx, eq + 1));
                    fprintf(stderr, "endo-init: Mount (env): %s → %s\n", name, eq + 1);
                }
            }
        } else if (strncmp(*env, "ENDO_PORT=", 10) == 0) {
            port = atoi(*env + 10);
            fprintf(stderr, "endo-init: Port (env): %d\n", port);
        }
    }

    JS_SetPropertyStr(js_ctx, config, "mounts", mounts);
    JS_SetPropertyStr(js_ctx, config, "port", JS_NewInt32(js_ctx, port));
    JS_SetPropertyStr(js_ctx, global, "__config", config);

    JS_FreeValue(js_ctx, global);

    /* Freeze intrinsics. */
    printf("endo-init: Freezing intrinsics\n");
    JS_FreezeIntrinsics(js_ctx);

    /* Load SES shim + shell. */
    eval_source(js_ctx, js_ses_shim, js_ses_shim_len, "ses-shim.js");
    eval_source(js_ctx, js_bootstrap, js_bootstrap_len, "endo-shell.js");

    JS_FreeContext(js_ctx);
    JS_FreeRuntime(js_rt);
    return 0;
}
