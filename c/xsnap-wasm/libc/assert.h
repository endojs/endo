/* Minimal assert.h for wasm32 freestanding */
#ifndef _ASSERT_H
#define _ASSERT_H

#ifdef NDEBUG
#define assert(expr) ((void)0)
#else
extern void __assert_fail(const char* expr, const char* file, int line, const char* func) __attribute__((noreturn));
#define assert(expr) \
    ((expr) ? (void)0 : __assert_fail(#expr, __FILE__, __LINE__, __func__))
#endif

/* Static assert - C11 */
#define static_assert _Static_assert

#endif /* _ASSERT_H */



