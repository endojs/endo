/* Minimal setjmp.h for wasm32 freestanding */
#ifndef _SETJMP_H
#define _SETJMP_H

/* WASM doesn't have native setjmp/longjmp - we'll need to implement via host */
/* For now, use a buffer that the host can use */
typedef struct {
    unsigned int __jb[8];
} jmp_buf[1];

/* These will be provided by the platform implementation */
int setjmp(jmp_buf env);
void longjmp(jmp_buf env, int val) __attribute__((noreturn));

#endif /* _SETJMP_H */



