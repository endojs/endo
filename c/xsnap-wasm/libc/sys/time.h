/* Minimal sys/time.h for wasm32 freestanding */
#ifndef _SYS_TIME_H
#define _SYS_TIME_H

#include <time.h>

struct timeval {
    time_t tv_sec;
    long tv_usec;
};

struct timezone {
    int tz_minuteswest;
    int tz_dsttime;
};

int gettimeofday(struct timeval* tv, struct timezone* tz);
int settimeofday(const struct timeval* tv, const struct timezone* tz);

#endif /* _SYS_TIME_H */



