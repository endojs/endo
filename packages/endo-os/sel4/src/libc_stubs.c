/*
 * Minimal libc stubs for QuickJS on seL4.
 *
 * QuickJS core (quickjs.c) needs a handful of libc functions.
 * We stub them out using seL4 Microkit primitives or simple
 * implementations.
 *
 * The quickjs-libc.c file (OS interaction: files, processes,
 * timers) is NOT compiled — we don't need it.  QuickJS core
 * works without it.
 */

#include <microkit.h>
#include <stddef.h>
#include <stdint.h>
#include <stdarg.h>

/* ---- String functions ---- */

size_t strlen(const char *s) {
    size_t n = 0;
    while (s[n]) n++;
    return n;
}

int strcmp(const char *a, const char *b) {
    while (*a && *a == *b) { a++; b++; }
    return (unsigned char)*a - (unsigned char)*b;
}

int strncmp(const char *a, const char *b, size_t n) {
    for (size_t i = 0; i < n; i++) {
        if (a[i] != b[i] || a[i] == 0)
            return (unsigned char)a[i] - (unsigned char)b[i];
    }
    return 0;
}

char *strcpy(char *dst, const char *src) {
    char *d = dst;
    while ((*d++ = *src++));
    return dst;
}

char *strncpy(char *dst, const char *src, size_t n) {
    size_t i;
    for (i = 0; i < n && src[i]; i++) dst[i] = src[i];
    for (; i < n; i++) dst[i] = 0;
    return dst;
}

char *strchr(const char *s, int c) {
    while (*s) {
        if (*s == (char)c) return (char *)s;
        s++;
    }
    return (c == 0) ? (char *)s : NULL;
}

char *strrchr(const char *s, int c) {
    const char *last = NULL;
    while (*s) {
        if (*s == (char)c) last = s;
        s++;
    }
    return (c == 0) ? (char *)s : (char *)last;
}

char *strstr(const char *haystack, const char *needle) {
    size_t nlen = strlen(needle);
    if (nlen == 0) return (char *)haystack;
    while (*haystack) {
        if (strncmp(haystack, needle, nlen) == 0)
            return (char *)haystack;
        haystack++;
    }
    return NULL;
}

char *strdup(const char *s) {
    size_t len = strlen(s) + 1;
    extern void *malloc(size_t);
    char *d = malloc(len);
    if (d) {
        for (size_t i = 0; i < len; i++) d[i] = s[i];
    }
    return d;
}

/* ---- Memory functions ---- */

void *memcpy(void *dst, const void *src, size_t n) {
    uint8_t *d = dst;
    const uint8_t *s = src;
    for (size_t i = 0; i < n; i++) d[i] = s[i];
    return dst;
}

void *memmove(void *dst, const void *src, size_t n) {
    uint8_t *d = dst;
    const uint8_t *s = src;
    if (d < s) {
        for (size_t i = 0; i < n; i++) d[i] = s[i];
    } else {
        for (size_t i = n; i > 0; i--) d[i-1] = s[i-1];
    }
    return dst;
}

void *memset(void *s, int c, size_t n) {
    uint8_t *p = s;
    for (size_t i = 0; i < n; i++) p[i] = (uint8_t)c;
    return s;
}

int memcmp(const void *a, const void *b, size_t n) {
    const uint8_t *pa = a, *pb = b;
    for (size_t i = 0; i < n; i++) {
        if (pa[i] != pb[i]) return pa[i] - pb[i];
    }
    return 0;
}

/* ---- Printing (serial console via seL4 debug) ---- */

/* Minimal number-to-string for snprintf. */
static int fmt_int(char *buf, size_t sz, long long val, int base) {
    char tmp[24];
    int neg = 0, i = 0;
    unsigned long long uval;

    if (val < 0 && base == 10) { neg = 1; uval = -val; }
    else uval = (unsigned long long)val;

    if (uval == 0) tmp[i++] = '0';
    while (uval > 0) {
        int d = uval % base;
        tmp[i++] = d < 10 ? '0' + d : 'a' + d - 10;
        uval /= base;
    }
    if (neg) tmp[i++] = '-';

    int len = 0;
    for (int j = i - 1; j >= 0 && (size_t)len < sz - 1; j--)
        buf[len++] = tmp[j];
    return len;
}

int vsnprintf(char *buf, size_t sz, const char *fmt, va_list ap) {
    size_t pos = 0;
    if (sz == 0) return 0;

    while (*fmt && pos < sz - 1) {
        if (*fmt != '%') {
            buf[pos++] = *fmt++;
            continue;
        }
        fmt++; /* skip '%' */

        /* Handle flags/width loosely — QuickJS doesn't need much. */
        int long_flag = 0;
        while (*fmt == 'l') { long_flag++; fmt++; }
        if (*fmt == 'z') { long_flag = 1; fmt++; }

        switch (*fmt) {
            case 'd': case 'i': {
                long long v = long_flag ? va_arg(ap, long long) : va_arg(ap, int);
                pos += fmt_int(buf + pos, sz - pos, v, 10);
                break;
            }
            case 'u': {
                unsigned long long v = long_flag ?
                    va_arg(ap, unsigned long long) : va_arg(ap, unsigned);
                pos += fmt_int(buf + pos, sz - pos, (long long)v, 10);
                break;
            }
            case 'x': {
                unsigned long long v = long_flag ?
                    va_arg(ap, unsigned long long) : va_arg(ap, unsigned);
                pos += fmt_int(buf + pos, sz - pos, (long long)v, 16);
                break;
            }
            case 's': {
                const char *s = va_arg(ap, const char *);
                if (!s) s = "(null)";
                while (*s && pos < sz - 1) buf[pos++] = *s++;
                break;
            }
            case 'c': {
                buf[pos++] = (char)va_arg(ap, int);
                break;
            }
            case 'p': {
                uintptr_t v = (uintptr_t)va_arg(ap, void *);
                if (pos < sz - 1) buf[pos++] = '0';
                if (pos < sz - 1) buf[pos++] = 'x';
                pos += fmt_int(buf + pos, sz - pos, (long long)v, 16);
                break;
            }
            case '%':
                buf[pos++] = '%';
                break;
            case 'f': case 'g': case 'e': {
                /* QuickJS uses these for number formatting.
                   Stub: print "?" — full float formatting is complex. */
                (void)va_arg(ap, double);
                if (pos < sz - 1) buf[pos++] = '?';
                break;
            }
            default:
                if (pos < sz - 1) buf[pos++] = '%';
                if (pos < sz - 1) buf[pos++] = *fmt;
                break;
        }
        if (*fmt) fmt++;
    }
    buf[pos] = '\0';
    return (int)pos;
}

int snprintf(char *buf, size_t sz, const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(buf, sz, fmt, ap);
    va_end(ap);
    return n;
}

/* printf → seL4 debug console. */
int printf(const char *fmt, ...) {
    char buf[512];
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    microkit_dbg_puts(buf);
    return n;
}

int fprintf(void *stream, const char *fmt, ...) {
    (void)stream;
    char buf[512];
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    microkit_dbg_puts(buf);
    return n;
}

int fputs(const char *s, void *stream) {
    (void)stream;
    microkit_dbg_puts(s);
    return 0;
}

int fputc(int c, void *stream) {
    (void)stream;
    char buf[2] = { (char)c, 0 };
    microkit_dbg_puts(buf);
    return c;
}

/* ---- Math stubs (QuickJS needs these) ---- */

double fmod(double x, double y) {
    if (y == 0.0) return 0.0;
    return x - (long long)(x / y) * y;
}

double floor(double x) {
    long long i = (long long)x;
    return (x < 0 && x != (double)i) ? (double)(i - 1) : (double)i;
}

double ceil(double x) {
    long long i = (long long)x;
    return (x > 0 && x != (double)i) ? (double)(i + 1) : (double)i;
}

double sqrt(double x) {
    if (x < 0) return 0;
    double guess = x / 2.0;
    for (int i = 0; i < 20; i++) {
        guess = (guess + x / guess) / 2.0;
    }
    return guess;
}

double pow(double base, double exp) {
    if (exp == 0.0) return 1.0;
    if (exp == 1.0) return base;
    /* Integer exponents only for now. */
    int n = (int)exp;
    double result = 1.0;
    double b = base;
    int neg = 0;
    if (n < 0) { neg = 1; n = -n; }
    while (n > 0) {
        if (n & 1) result *= b;
        b *= b;
        n >>= 1;
    }
    return neg ? 1.0 / result : result;
}

double log(double x)   { (void)x; return 0.0; }
double log2(double x)  { (void)x; return 0.0; }
double log10(double x) { (void)x; return 0.0; }
double log1p(double x) { (void)x; return x; }
double exp(double x)   { (void)x; return 1.0; }
double expm1(double x) { (void)x; return x; }
double sin(double x)   { (void)x; return 0.0; }
double cos(double x)   { (void)x; return 1.0; }
double tan(double x)   { (void)x; return 0.0; }
double asin(double x)  { (void)x; return 0.0; }
double acos(double x)  { (void)x; return 0.0; }
double atan(double x)  { (void)x; return 0.0; }
double atan2(double y, double x) { (void)y; (void)x; return 0.0; }
double sinh(double x)  { (void)x; return 0.0; }
double cosh(double x)  { (void)x; return 1.0; }
double tanh(double x)  { (void)x; return 0.0; }
double asinh(double x) { (void)x; return 0.0; }
double acosh(double x) { (void)x; return 0.0; }
double atanh(double x) { (void)x; return 0.0; }
double cbrt(double x)  { (void)x; return 0.0; }
double fabs(double x)  { return x < 0 ? -x : x; }
double round(double x) { return floor(x + 0.5); }
double trunc(double x) { return (double)(long long)x; }
int isnan(double x)    { return x != x; }
int isinf(double x)    { return (x == 1.0/0.0) || (x == -1.0/0.0); }
int isfinite(double x) { return !isnan(x) && !isinf(x); }

/* glibc 2.39+ redirects strtol to this for C23 compat. */
long strtol(const char *s, char **endp, int base);  /* forward decl */
long __isoc23_strtol(const char *s, char **endp, int base) {
    return strtol(s, endp, base);
}

int atoi(const char *s) {
    return (int)strtol(s, (void *)0, 10);
}

int sprintf(char *buf, const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(buf, 4096, fmt, ap); /* assume buf is large enough */
    va_end(ap);
    return n;
}

/* Floating-point rounding mode — QuickJS uses for number formatting. */
int fesetround(int rounding_mode) { (void)rounding_mode; return 0; }
int fegetround(void) { return 0; }

/* Fortified libc redirects — system headers emit these. */
int __vsnprintf_chk(char *buf, size_t sz, int flag, size_t slen,
                    const char *fmt, va_list ap) {
    (void)flag; (void)slen;
    return vsnprintf(buf, sz, fmt, ap);
}

int __snprintf_chk(char *buf, size_t sz, int flag, size_t slen,
                   const char *fmt, ...) {
    (void)flag; (void)slen;
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(buf, sz, fmt, ap);
    va_end(ap);
    return n;
}

int __printf_chk(int flag, const char *fmt, ...) {
    (void)flag;
    va_list ap;
    va_start(ap, fmt);
    char buf[512];
    int n = vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    microkit_dbg_puts(buf);
    return n;
}

/* stdout placeholder + putc for QuickJS debug prints. */
static int _stdout_dummy;
void *stdout = &_stdout_dummy;

int putc(int c, void *stream) {
    (void)stream;
    char buf[2] = { (char)c, 0 };
    microkit_dbg_puts(buf);
    return c;
}

int putchar(int c) {
    return putc(c, stdout);
}

/* Forward declarations for types used in stubs below. */
typedef long time_t;
struct tm { int tm_sec, tm_min, tm_hour, tm_mday, tm_mon, tm_year,
            tm_wday, tm_yday, tm_isdst; long tm_gmtoff; const char *tm_zone; };
struct timeval { long tv_sec; long tv_usec; };

/* ---- Additional string/memory functions ---- */

void *memchr(const void *s, int c, size_t n) {
    const uint8_t *p = s;
    for (size_t i = 0; i < n; i++) {
        if (p[i] == (uint8_t)c) return (void *)(p + i);
    }
    return NULL;
}

char *strcat(char *dst, const char *src) {
    char *d = dst;
    while (*d) d++;
    while ((*d++ = *src++));
    return dst;
}

char *strncat(char *dst, const char *src, size_t n) {
    char *d = dst;
    while (*d) d++;
    for (size_t i = 0; i < n && src[i]; i++) *d++ = src[i];
    *d = '\0';
    return dst;
}

/* ---- Additional math functions ---- */

double hypot(double x, double y) { return sqrt(x*x + y*y); }
double fmax(double x, double y)  { return x > y ? x : y; }
double fmin(double x, double y)  { return x < y ? x : y; }
long lrint(double x) { return (long)(x + (x >= 0 ? 0.5 : -0.5)); }
double ldexp(double x, int exp) {
    double result = x;
    if (exp > 0) { for (int i = 0; i < exp; i++) result *= 2.0; }
    else { for (int i = 0; i < -exp; i++) result *= 0.5; }
    return result;
}
double frexp(double x, int *exp) {
    *exp = 0;
    if (x == 0.0) return 0.0;
    double abs_x = fabs(x);
    while (abs_x >= 1.0) { abs_x *= 0.5; (*exp)++; }
    while (abs_x < 0.5)  { abs_x *= 2.0; (*exp)--; }
    return x >= 0 ? abs_x : -abs_x;
}

/* ---- Time (localtime_r) ---- */

struct tm *localtime_r(const time_t *t, struct tm *result) {
    (void)t;
    extern void *memset(void *, int, size_t);
    memset(result, 0, sizeof(*result));
    return result;
}

/* ---- Misc stubs ---- */

void abort(void) {
    /* Print a traceable message before hanging. */
    microkit_dbg_puts("!!! ABORT called !!!\n");
    microkit_dbg_puts("(check if heap ran out of memory)\n");
    for (;;) {}
}

/* __assert_fail is provided by libmicrokit.a — no stub needed. */

void exit(int status) {
    (void)status;
    microkit_dbg_puts("EXIT\n");
    for (;;) {}
}

long strtol(const char *s, char **endp, int base) {
    long result = 0;
    int neg = 0;
    while (*s == ' ') s++;
    if (*s == '-') { neg = 1; s++; }
    else if (*s == '+') s++;
    if (base == 0) {
        if (s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) { base = 16; s += 2; }
        else if (s[0] == '0') { base = 8; s++; }
        else base = 10;
    }
    while (*s) {
        int d;
        if (*s >= '0' && *s <= '9') d = *s - '0';
        else if (*s >= 'a' && *s <= 'f') d = *s - 'a' + 10;
        else if (*s >= 'A' && *s <= 'F') d = *s - 'A' + 10;
        else break;
        if (d >= base) break;
        result = result * base + d;
        s++;
    }
    if (endp) *endp = (char *)s;
    return neg ? -result : result;
}

unsigned long strtoul(const char *s, char **endp, int base) {
    return (unsigned long)strtol(s, endp, base);
}

double strtod(const char *s, char **endp) {
    /* Minimal: parse integer part and optional decimal. */
    double result = 0;
    int neg = 0;
    while (*s == ' ') s++;
    if (*s == '-') { neg = 1; s++; }
    while (*s >= '0' && *s <= '9') {
        result = result * 10.0 + (*s - '0');
        s++;
    }
    if (*s == '.') {
        s++;
        double frac = 0.1;
        while (*s >= '0' && *s <= '9') {
            result += (*s - '0') * frac;
            frac *= 0.1;
            s++;
        }
    }
    if (endp) *endp = (char *)s;
    return neg ? -result : result;
}

/* Time stubs — QuickJS calls these for Date. */
time_t time(time_t *t) { if (t) *t = 0; return 0; }
struct tm *gmtime(const time_t *t) { (void)t; static struct tm z; return &z; }
struct tm *localtime(const time_t *t) { return gmtime(t); }
time_t mktime(struct tm *tm) { (void)tm; return 0; }
int gettimeofday(struct timeval *tv, void *tz) {
    (void)tz;
    if (tv) { tv->tv_sec = 0; tv->tv_usec = 0; }
    return 0;
}

/* ---- pthreads stubs (QuickJS-ng uses these for atomics/workers) ---- */
/* seL4 is single-threaded per PD, so these are no-ops. */

typedef int pthread_mutex_t;
typedef int pthread_cond_t;
typedef int pthread_condattr_t;
typedef int pthread_once_t;

int pthread_mutex_init(pthread_mutex_t *m, const void *a) { (void)m; (void)a; return 0; }
int pthread_mutex_destroy(pthread_mutex_t *m) { (void)m; return 0; }
int pthread_mutex_lock(pthread_mutex_t *m) { (void)m; return 0; }
int pthread_mutex_unlock(pthread_mutex_t *m) { (void)m; return 0; }
int pthread_cond_init(pthread_cond_t *c, const pthread_condattr_t *a) { (void)c; (void)a; return 0; }
int pthread_cond_destroy(pthread_cond_t *c) { (void)c; return 0; }
int pthread_cond_wait(pthread_cond_t *c, pthread_mutex_t *m) { (void)c; (void)m; return 0; }
int pthread_cond_timedwait(pthread_cond_t *c, pthread_mutex_t *m, const void *t) { (void)c; (void)m; (void)t; return 0; }
int pthread_cond_signal(pthread_cond_t *c) { (void)c; return 0; }
int pthread_cond_broadcast(pthread_cond_t *c) { (void)c; return 0; }
int pthread_condattr_init(pthread_condattr_t *a) { (void)a; return 0; }
int pthread_condattr_destroy(pthread_condattr_t *a) { (void)a; return 0; }
int pthread_condattr_setclock(pthread_condattr_t *a, int c) { (void)a; (void)c; return 0; }
int pthread_once(pthread_once_t *o, void (*f)(void)) {
    if (*o == 0) { *o = 1; f(); }
    return 0;
}

/* ---- clock_gettime ---- */
struct timespec { long tv_sec; long tv_nsec; };
int clock_gettime(int clk_id, struct timespec *tp) {
    (void)clk_id;
    if (tp) { tp->tv_sec = 0; tp->tv_nsec = 0; }
    return 0;
}

/* ---- misc math/stdlib QuickJS-ng needs ---- */
double scalbn(double x, int n) { return ldexp(x, n); }
double copysign(double x, double y) { return (y < 0) ? -fabs(x) : fabs(x); }
double modf(double x, double *iptr) {
    double i = trunc(x);
    if (iptr) *iptr = i;
    return x - i;
}
int abs(int x) { return x < 0 ? -x : x; }
unsigned long __getauxval(unsigned long type) { (void)type; return 0; }

/* malloc_usable_size — QuickJS-ng uses for memory tracking. */
size_t malloc_usable_size(void *ptr) {
    if (!ptr) return 0;
    /* Our allocator stores size in the block header before the pointer. */
    typedef struct { size_t size; void *next; int free; } hdr_t;
    hdr_t *hdr = (hdr_t *)((uint8_t *)ptr - sizeof(hdr_t));
    return hdr->size;
}

/* vfprintf for debug trace output. */
int vfprintf(void *stream, const char *fmt, va_list ap) {
    (void)stream;
    char buf[512];
    int n = vsnprintf(buf, sizeof(buf), fmt, ap);
    microkit_dbg_puts(buf);
    return n;
}

/* QuickJS uses setjmp/longjmp for exceptions. */
typedef long jmp_buf[32];
int setjmp(jmp_buf env) { (void)env; return 0; }
void longjmp(jmp_buf env, int val) { (void)env; (void)val; abort(); }

/* Atomic stubs (QuickJS uses these for reference counting). */
int __atomic_fetch_add_4(int *ptr, int val, int memorder) {
    (void)memorder;
    int old = *ptr;
    *ptr += val;
    return old;
}
