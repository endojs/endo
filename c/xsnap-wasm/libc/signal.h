/* Minimal signal.h for wasm32 freestanding - mostly stubs */
#ifndef _SIGNAL_H
#define _SIGNAL_H

typedef int sig_atomic_t;
typedef void (*sighandler_t)(int);

#define SIG_DFL ((sighandler_t)0)
#define SIG_IGN ((sighandler_t)1)
#define SIG_ERR ((sighandler_t)-1)

#define SIGABRT 6
#define SIGFPE 8
#define SIGILL 4
#define SIGINT 2
#define SIGSEGV 11
#define SIGTERM 15
#define SIGPIPE 13

/* signal() is a no-op in WASM */
sighandler_t signal(int signum, sighandler_t handler);

int raise(int sig);

#endif /* _SIGNAL_H */



