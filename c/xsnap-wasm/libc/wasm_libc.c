/*
 * Minimal libc implementations for wasm32 freestanding build
 */

#include "stddef.h"
#include "stdint.h"

/* ========================================================================
 * String functions
 * ======================================================================== */

size_t strlen(const char* s) {
    const char* p = s;
    while (*p) p++;
    return p - s;
}

void* memcpy(void* dest, const void* src, size_t n) {
    unsigned char* d = dest;
    const unsigned char* s = src;
    while (n--) *d++ = *s++;
    return dest;
}

void* memmove(void* dest, const void* src, size_t n) {
    unsigned char* d = dest;
    const unsigned char* s = src;
    if (d < s) {
        while (n--) *d++ = *s++;
    } else {
        d += n;
        s += n;
        while (n--) *--d = *--s;
    }
    return dest;
}

void* memset(void* s, int c, size_t n) {
    unsigned char* p = s;
    while (n--) *p++ = (unsigned char)c;
    return s;
}

int memcmp(const void* s1, const void* s2, size_t n) {
    const unsigned char* p1 = s1;
    const unsigned char* p2 = s2;
    while (n--) {
        if (*p1 != *p2) return *p1 - *p2;
        p1++; p2++;
    }
    return 0;
}

int strcmp(const char* s1, const char* s2) {
    while (*s1 && *s1 == *s2) { s1++; s2++; }
    return *(unsigned char*)s1 - *(unsigned char*)s2;
}

int strncmp(const char* s1, const char* s2, size_t n) {
    while (n && *s1 && *s1 == *s2) { s1++; s2++; n--; }
    return n ? *(unsigned char*)s1 - *(unsigned char*)s2 : 0;
}

char* strcpy(char* dest, const char* src) {
    char* d = dest;
    while ((*d++ = *src++));
    return dest;
}

char* strncpy(char* dest, const char* src, size_t n) {
    char* d = dest;
    while (n && (*d++ = *src++)) n--;
    while (n--) *d++ = '\0';
    return dest;
}

char* strcat(char* dest, const char* src) {
    char* d = dest;
    while (*d) d++;
    while ((*d++ = *src++));
    return dest;
}

char* strncat(char* dest, const char* src, size_t n) {
    char* d = dest;
    while (*d) d++;
    while (n-- && (*d = *src++)) d++;
    *d = '\0';
    return dest;
}

char* strchr(const char* s, int c) {
    while (*s) {
        if (*s == (char)c) return (char*)s;
        s++;
    }
    return c == 0 ? (char*)s : NULL;
}

char* strrchr(const char* s, int c) {
    const char* last = NULL;
    while (*s) {
        if (*s == (char)c) last = s;
        s++;
    }
    return c == 0 ? (char*)s : (char*)last;
}

char* strstr(const char* haystack, const char* needle) {
    if (!*needle) return (char*)haystack;
    for (; *haystack; haystack++) {
        const char* h = haystack;
        const char* n = needle;
        while (*h && *n && *h == *n) { h++; n++; }
        if (!*n) return (char*)haystack;
    }
    return NULL;
}

/* ========================================================================
 * stdio stubs (minimal - just enough for XS)
 * ======================================================================== */

typedef struct { int dummy; } FILE;
FILE* stderr = (FILE*)2;
FILE* stdout = (FILE*)1;

int fprintf(FILE* f, const char* fmt, ...) {
    (void)f; (void)fmt;
    return 0;  /* Stub */
}

/* Forward declaration */
int vsnprintf(char* buf, size_t size, const char* fmt, __builtin_va_list ap);

/* External debug output - takes pointer and length */
__attribute__((import_module("env"), import_name("wasm_debug_print")))
extern void wasm_debug_print(void* ptr, int length);

/* Simple buffer for debug output */
static char gxPrintBuffer[1024];

int vprintf(const char* fmt, __builtin_va_list ap) {
    int len = vsnprintf(gxPrintBuffer, sizeof(gxPrintBuffer), fmt, ap);
    if (len > 0) {
        wasm_debug_print(gxPrintBuffer, len);
    }
    return len;
}

int printf(const char* fmt, ...) {
    __builtin_va_list ap;
    __builtin_va_start(ap, fmt);
    int ret = vprintf(fmt, ap);
    __builtin_va_end(ap);
    return ret;
}

/* Minimal snprintf implementation for XS - handles %d, %u, %x, %s, %c */
int vsnprintf(char* buf, size_t size, const char* fmt, __builtin_va_list ap) {
    char* out = buf;
    char* end = buf + size - 1;

    if (size == 0) return 0;

    while (*fmt && out < end) {
        if (*fmt != '%') {
            *out++ = *fmt++;
            continue;
        }
        fmt++;
        if (*fmt == '\0') break;

        /* Handle width specifier (simplified) */
        int width = 0;
        int zero_pad = 0;
        if (*fmt == '0') {
            zero_pad = 1;
            fmt++;
        }
        while (*fmt >= '0' && *fmt <= '9') {
            width = width * 10 + (*fmt - '0');
            fmt++;
        }

        /* Skip length modifiers */
        if (*fmt == 'l') fmt++;
        if (*fmt == 'l') fmt++;

        switch (*fmt) {
            case 'd':
            case 'i': {
                int val = __builtin_va_arg(ap, int);
                char tmp[32];
                int i = 0;
                int neg = 0;
                if (val < 0) { neg = 1; val = -val; }
                if (val == 0) tmp[i++] = '0';
                while (val > 0) { tmp[i++] = '0' + (val % 10); val /= 10; }
                /* Pad with zeros if needed */
                while (i < width - neg) tmp[i++] = zero_pad ? '0' : ' ';
                if (neg) { if (out < end) *out++ = '-'; }
                while (i > 0 && out < end) *out++ = tmp[--i];
                fmt++;
                break;
            }
            case 'u': {
                unsigned int val = __builtin_va_arg(ap, unsigned int);
                char tmp[32];
                int i = 0;
                if (val == 0) tmp[i++] = '0';
                while (val > 0) { tmp[i++] = '0' + (val % 10); val /= 10; }
                while (i < width) tmp[i++] = zero_pad ? '0' : ' ';
                while (i > 0 && out < end) *out++ = tmp[--i];
                fmt++;
                break;
            }
            case 'x':
            case 'X': {
                unsigned int val = __builtin_va_arg(ap, unsigned int);
                char tmp[32];
                const char* hex = (*fmt == 'x') ? "0123456789abcdef" : "0123456789ABCDEF";
                int i = 0;
                if (val == 0) tmp[i++] = '0';
                while (val > 0) { tmp[i++] = hex[val & 0xF]; val >>= 4; }
                while (i < width) tmp[i++] = zero_pad ? '0' : ' ';
                while (i > 0 && out < end) *out++ = tmp[--i];
                fmt++;
                break;
            }
            case 's': {
                const char* s = __builtin_va_arg(ap, const char*);
                if (!s) s = "(null)";
                while (*s && out < end) *out++ = *s++;
                fmt++;
                break;
            }
            case 'c': {
                char c = (char)__builtin_va_arg(ap, int);
                if (out < end) *out++ = c;
                fmt++;
                break;
            }
            case 'p': {
                void* ptr = __builtin_va_arg(ap, void*);
                unsigned long val = (unsigned long)ptr;
                char tmp[32];
                int i = 0;
                if (out < end) *out++ = '0';
                if (out < end) *out++ = 'x';
                if (val == 0) tmp[i++] = '0';
                while (val > 0) { tmp[i++] = "0123456789abcdef"[val & 0xF]; val >>= 4; }
                while (i > 0 && out < end) *out++ = tmp[--i];
                fmt++;
                break;
            }
            case '%':
                if (out < end) *out++ = '%';
                fmt++;
                break;
            default:
                fmt++;
                break;
        }
    }
    *out = '\0';
    return out - buf;
}

int snprintf(char* buf, size_t size, const char* fmt, ...) {
    __builtin_va_list ap;
    __builtin_va_start(ap, fmt);
    int ret = vsnprintf(buf, size, fmt, ap);
    __builtin_va_end(ap);
    return ret;
}

int sprintf(char* buf, const char* fmt, ...) {
    __builtin_va_list ap;
    __builtin_va_start(ap, fmt);
    int ret = vsnprintf(buf, (size_t)-1, fmt, ap);
    __builtin_va_end(ap);
    return ret;
}

int fflush(FILE* f) {
    (void)f;
    return 0;
}

int fputc(int c, FILE* f) {
    (void)c; (void)f;
    return c;
}

int fputs(const char* s, FILE* f) {
    (void)s; (void)f;
    return 0;
}

/* ========================================================================
 * stdlib functions
 * ======================================================================== */

void abort(void) {
    __builtin_trap();
}

void exit(int status) {
    (void)status;
    __builtin_trap();
}

/* Simple qsort implementation */
static void swap(char* a, char* b, size_t size) {
    while (size--) {
        char t = *a;
        *a++ = *b;
        *b++ = t;
    }
}

void qsort(void* base, size_t nel, size_t width, int (*compar)(const void*, const void*)) {
    if (nel < 2) return;
    char* arr = base;
    char* pivot = arr + (nel / 2) * width;
    char* left = arr;
    char* right = arr + (nel - 1) * width;
    
    /* Simple bubble sort for small arrays or as fallback */
    for (size_t i = 0; i < nel - 1; i++) {
        for (size_t j = 0; j < nel - i - 1; j++) {
            if (compar(arr + j * width, arr + (j + 1) * width) > 0) {
                swap(arr + j * width, arr + (j + 1) * width, width);
            }
        }
    }
}

void* bsearch(const void* key, const void* base, size_t nel, size_t width,
              int (*compar)(const void*, const void*)) {
    const char* arr = base;
    while (nel > 0) {
        size_t mid = nel / 2;
        const void* p = arr + mid * width;
        int cmp = compar(key, p);
        if (cmp == 0) return (void*)p;
        if (cmp < 0) {
            nel = mid;
        } else {
            arr = (const char*)p + width;
            nel -= mid + 1;
        }
    }
    return NULL;
}

static unsigned int rand_seed = 1;
int rand(void) {
    rand_seed = rand_seed * 1103515245 + 12345;
    return (rand_seed >> 16) & 0x7FFF;
}

void srand(unsigned int seed) {
    rand_seed = seed;
}

/* ========================================================================
 * Math - long double variants (wasm32 long double == double)
 * ======================================================================== */

long double fabsl(long double x) {
    return x < 0 ? -x : x;
}

long double sqrtl(long double x) {
    extern double sqrt(double);
    return sqrt((double)x);
}

long double scalbnl(long double x, int n) {
    extern double scalbn(double, int);
    return scalbn((double)x, n);
}

/* fpclassify helpers */
int __fpclassifyf(float x) {
    union { float f; unsigned int i; } u = { x };
    unsigned int exp = (u.i >> 23) & 0xFF;
    unsigned int mant = u.i & 0x7FFFFF;
    
    if (exp == 0xFF) {
        return mant ? 0 : 1;  /* FP_NAN : FP_INFINITE */
    }
    if (exp == 0) {
        return mant ? 3 : 2;  /* FP_SUBNORMAL : FP_ZERO */
    }
    return 4;  /* FP_NORMAL */
}

int __fpclassifyd(double x) {
    union { double d; unsigned long long i; } u = { x };
    unsigned long long exp = (u.i >> 52) & 0x7FF;
    unsigned long long mant = u.i & 0xFFFFFFFFFFFFFULL;
    
    if (exp == 0x7FF) {
        return mant ? 0 : 1;  /* FP_NAN : FP_INFINITE */
    }
    if (exp == 0) {
        return mant ? 3 : 2;  /* FP_SUBNORMAL : FP_ZERO */
    }
    return 4;  /* FP_NORMAL */
}

/* ========================================================================
 * Network byte order functions (for snapshot support)
 * WASM is little-endian, network is big-endian
 * ======================================================================== */

uint32_t ntohl(uint32_t netlong) {
    return ((netlong & 0xFF000000) >> 24) |
           ((netlong & 0x00FF0000) >> 8)  |
           ((netlong & 0x0000FF00) << 8)  |
           ((netlong & 0x000000FF) << 24);
}

uint32_t htonl(uint32_t hostlong) {
    return ntohl(hostlong);  /* Same operation */
}

uint16_t ntohs(uint16_t netshort) {
    return ((netshort & 0xFF00) >> 8) |
           ((netshort & 0x00FF) << 8);
}

uint16_t htons(uint16_t hostshort) {
    return ntohs(hostshort);  /* Same operation */
}

/* ========================================================================
 * Misc
 * ======================================================================== */

/* assert failure handler */
void __assert_fail(const char* expr, const char* file, int line, const char* func) {
    (void)expr;
    (void)file;
    (void)line;
    (void)func;
    __builtin_trap();
}

/* XS platform abort */
void fxAbort(void* the, int status) {
    (void)the;
    (void)status;
    __builtin_trap();
}

