/*
 * Copyright (c) 2016-2025  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Runtime.
 * 
 *   The Moddable SDK Runtime is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 * 
 *   The Moddable SDK Runtime is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 * 
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with the Moddable SDK Runtime.  If not, see <http://www.gnu.org/licenses/>.
 */

#ifndef __WASM32_XS__
#define __WASM32_XS__

#undef mxWasm
#define mxWasm 1

#define mxBigEndian 0
#define mxLittleEndian 1

#define mxiOS 0
#define mxLinux 0
#define mxMacOSX 0
#define mxWindows 0

#include <stdint.h>
#include <stddef.h>
#include <stdarg.h>
#include <stdbool.h>
#include <string.h>
#include <setjmp.h>
#include <float.h>
#include <math.h>
#include <ctype.h>
#include <stdlib.h>
#include <stdio.h>
#include <errno.h>
#include <limits.h>
#include <time.h>

/* Network byte order functions (WASM is little-endian) */
uint32_t ntohl(uint32_t netlong);
uint32_t htonl(uint32_t hostlong);
uint16_t ntohs(uint16_t netshort);
uint16_t htons(uint16_t hostshort);

/* Export/Import declarations for WASM */
#define mxExport extern __attribute__((visibility("default")))
#define mxImport extern

#define XS_FUNCTION_NORETURN __attribute__((noreturn))

/* Basic types - define before xsPlatform.h tries to */
#ifndef txS1
typedef int8_t txS1;
#endif
#ifndef txU1
typedef uint8_t txU1;
#endif
#ifndef txS2
typedef int16_t txS2;
#endif
#ifndef txU2
typedef uint16_t txU2;
#endif
#ifndef txS4
typedef int32_t txS4;
#endif
#ifndef txU4
typedef uint32_t txU4;
#endif
#ifndef txS8
typedef int64_t txS8;
#endif
#ifndef txU8
typedef uint64_t txU8;
#endif

/* Single-threaded: no atomics needed */
#undef mxUseGCCAtomics
#undef mxUsePOSIXThreads

/* Use default implementations where possible */
#define mxUseDefaultBuildKeys 1
#define mxUseDefaultChunkAllocation 1
#define mxUseDefaultSlotAllocation 1
#define mxUseDefaultParseScript 1

/* CESU-8 encoding support - required for full Unicode/surrogate handling */
#define mxCESU8 1

/* We'll provide custom implementations for these */
#undef mxUseDefaultFindModule
#undef mxUseDefaultLoadModule
#undef mxUseDefaultSharedChunks
#undef mxUseDefaultQueuePromiseJobs

/* Machine platform data - includes fields needed by our platform implementation */
#define mxMachinePlatform \
    void* host; \
    int promiseJobs; \
    void* timerJobs;

/* Signal - no-op for WASM */
#define c_signal(signum, handler)

/* 
 * Time types - use macro guards that xsPlatform.h checks for.
 * xsPlatform.h uses #ifndef c_time_t etc as macro checks.
 */
#define c_time_t time_t
#define c_tm struct tm

/* Define c_timeval to match what XS expects */
#ifndef c_timeval
#include <sys/time.h>
#define c_timeval struct timeval
#endif

#ifndef c_timezone
#define c_timezone wasm_timezone
#endif

/* Time functions - provided by platform implementation */
extern struct tm* wasm_localtime(const time_t* timep);
extern time_t wasm_mktime(struct tm* tm);
extern int wasm_gettimeofday(struct timeval* tp, void* tzp);

#define c_localtime wasm_localtime
#define c_mktime wasm_mktime
#define c_gettimeofday wasm_gettimeofday

/* Path handling */
#ifndef mxSeparator
#define mxSeparator '/'
#endif

#ifndef C_PATH_MAX
#define C_PATH_MAX 1024
#endif

/* Error codes - define as macros before xsPlatform.h */
#define C_ENOMEM ENOMEM
#define C_EINVAL EINVAL
#define C_EOF EOF
#define C_NULL NULL

/* No realpath in WASM - use identity */
static inline char* wasm_realpath(const char* path, char* real) {
    if (real) {
        strcpy(real, path);
        return real;
    }
    return NULL;
}
#define c_realpath wasm_realpath

/* Parser error handling */
#define mxParserThrowElse(_ASSERTION) { if (!(_ASSERTION)) { parser->error = C_EINVAL; c_longjmp(parser->firstJump->jmp_buf, 1); } }

#endif /* __WASM32_XS__ */
