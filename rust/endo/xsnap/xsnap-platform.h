/*
 * Platform header for XS embedded in Rust via xsnap.
 * Minimal platform layer — no GLib, no GUI, no debugger socket.
 * Modeled after Agoric's xsnap-pub platform configuration.
 */

#ifndef __XSNAP_PLATFORM__
#define __XSNAP_PLATFORM__

#if defined(__APPLE__)
	#undef mxMacOSX
	#define mxMacOSX 1
#elif defined(__linux__)
	#undef mxLinux
	#define mxLinux 1
#elif defined(_WIN32)
	#undef mxWindows
	#define mxWindows 1
#else
	#undef mxLinux
	#define mxLinux 1
#endif

#include <ctype.h>
#include <float.h>
#include <math.h>
#include <setjmp.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include <arpa/inet.h>
#include <errno.h>
#include <pthread.h>
#include <unistd.h>
#include <sys/time.h>
#include <sys/stat.h>

#if __GNUC__ >= 5
	#define mxUseGCCAtomics 1
#endif
#define mxUsePOSIXThreads 1

#define mxUseDefaultBuildKeys 1
#define mxUseDefaultChunkAllocation 1
#define mxUseDefaultSlotAllocation 1
#define mxUseDefaultFindModule 1
#define mxUseDefaultLoadModule 1
#define mxUseDefaultParseScript 1
/* Custom fxQueuePromiseJobs: no-op because Rust drives the event
   loop and calls fxRunPromiseJobs() explicitly after each eval. */
#define mxUseDefaultQueuePromiseJobs 0
#define mxUseDefaultSharedChunks 1
#define mxUseDefaultAbort 1

#ifdef mxDebug
/* We provide our own fxConnect/fxDisconnect/fxReceive/fxSend/etc.
   that route debug traffic through Rust callbacks. */
#define mxUseDefaultDebug 0
#else
#define mxUseDefaultDebug 1
#endif

#define mxMachinePlatform \
	int promiseJobs; \
	void* timerJobs; \
	void* host;

#endif /* __XSNAP_PLATFORM__ */
