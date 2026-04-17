/*
 * Platform functions for XS embedded in Rust.
 * Timer infrastructure and run loop copied from
 * c/xsnap-pub/xsnap/sources/xsnapPlatform.c.
 */

#define _GNU_SOURCE
#include "xsAll.h"

/* ---- Timer job struct (forward declaration) ---- */

typedef struct sxJob txJob;

struct sxJob {
	txJob* next;
	txMachine* the;
	txNumber when;
	txSlot self;
	txSlot function;
	txSlot argument;
	txNumber interval;
};

/* ---- Promise job flag ---- */

/* Global flag for Rust-driven quiesce loop (fxHasPendingJobs).
   fxRunLoop uses the per-machine the->promiseJobs instead. */
static int gHasPendingJobs = 0;

void fxCreateMachinePlatform(txMachine* the)
{
	the->promiseJobs = 0;
	the->timerJobs = C_NULL;
}

void fxDeleteMachinePlatform(txMachine* the)
{
	/* Free any remaining timer jobs. */
	txJob* job = (txJob*)the->timerJobs;
	while (job) {
		txJob* next = job->next;
		c_free(job);
		job = next;
	}
	the->timerJobs = C_NULL;
}

/*
 * Custom fxQueuePromiseJobs.
 *
 * Sets both the per-machine flag (for fxRunLoop) and the global
 * flag (for Rust's quiesce loop via fxHasPendingJobs).
 */
void fxQueuePromiseJobs(txMachine* the)
{
	the->promiseJobs = 1;
	gHasPendingJobs = 1;
}

/*
 * Check and reset the pending-jobs flag.
 * Used by Rust's quiesce() loop.
 */
int fxHasPendingJobs(void)
{
	int result = gHasPendingJobs;
	gHasPendingJobs = 0;
	return result;
}

/* ---- Timer infrastructure ---- */

static void fxDestroyTimer(void* data);
static void fxMarkTimer(txMachine* the, void* it, txMarkRoot markRoot);

static txHostHooks gxTimerHooks = {
	fxDestroyTimer,
	fxMarkTimer
};

void fxClearTimer(txMachine* the)
{
	txHostHooks* hooks = fxGetHostHooks(the, mxArgv(0));
	if (hooks == &gxTimerHooks) {
		txJob* job = fxGetHostData(the, mxArgv(0));
		if (job) {
			fxForget(the, &job->self);
			fxSetHostData(the, mxArgv(0), NULL);
			job->the = NULL;
		}
	}
	else
		mxTypeError("no timer");
}

void fxDestroyTimer(void* data)
{
}

void fxMarkTimer(txMachine* the, void* it, txMarkRoot markRoot)
{
	txJob* job = it;
	if (job) {
		(*markRoot)(the, &job->function);
		(*markRoot)(the, &job->argument);
	}
}

void fxSetTimer(txMachine* the, txNumber interval, txBoolean repeat)
{
	c_timeval tv;
	txJob* job;
	txJob** address = (txJob**)&(the->timerJobs);
	while ((job = *address))
		address = &(job->next);
	job = *address = malloc(sizeof(txJob));
	c_memset(job, 0, sizeof(txJob));
	job->the = the;
	c_gettimeofday(&tv, NULL);
	if (repeat)
		job->interval = interval;
	job->when = ((txNumber)(tv.tv_sec) * 1000.0) + ((txNumber)(tv.tv_usec) / 1000.0) + interval;
	fxNewHostObject(the, NULL);
	mxPull(job->self);
	job->function = *mxArgv(0);
	if (mxArgc > 2)
		job->argument = *mxArgv(2);
	else
		job->argument = mxUndefined;
	fxSetHostData(the, &job->self, job);
	fxSetHostHooks(the, &job->self, &gxTimerHooks);
	fxRemember(the, &job->self);
	fxAccess(the, &job->self);
	*mxResult = the->scratch;
}

/* ---- Debug hooks ---- */

/*
 * fxRunDebugger: always defined (declared in xsnap.h without
 * #ifdef mxDebug guard). When mxDebug is off, it's a no-op.
 */
void fxRunDebugger(txMachine* the)
{
#ifdef mxDebug
	fxDebugCommand(the);
#endif
}

#ifdef mxDebug

/*
 * Rust-side debug I/O functions (defined in powers/debug.rs).
 * These use thread-local buffers so each worker thread has
 * independent debug state.
 */
extern void rust_debug_connect(void);
extern void rust_debug_disconnect(void);
extern int rust_debug_is_connected(void);
extern int rust_debug_is_readable(void);
extern int rust_debug_recv(char* buffer, int capacity);
extern void rust_debug_send(const char* data, int length);

void fxConnect(txMachine* the)
{
	/* XS calls this during machine creation.
	   The Rust side must have called debug_enable() on this thread
	   before machine creation for the connection to activate. */
	rust_debug_connect();
}

void fxDisconnect(txMachine* the)
{
	rust_debug_disconnect();
}

txBoolean fxIsConnected(txMachine* the)
{
	return rust_debug_is_connected();
}

txBoolean fxIsReadable(txMachine* the)
{
	return rust_debug_is_readable();
}

void fxReceive(txMachine* the)
{
	int n = rust_debug_recv(
		the->debugBuffer, sizeof(the->debugBuffer) - 1);
	if (n < 0)
		the->debugOffset = 0;
	else
		the->debugOffset = n;
	the->debugBuffer[the->debugOffset] = 0;
}

void fxSend(txMachine* the, txBoolean more)
{
	rust_debug_send(the->echoBuffer, the->echoOffset);
}

#endif /* mxDebug */

/* ---- Run loop ---- */

void fxRunLoop(txMachine* the)
{
	c_timeval tv;
	txNumber when;
	txJob* job;
	txJob** address;
	for (;;) {
		while (the->promiseJobs) {
			the->promiseJobs = 0;
			fxRunPromiseJobs(the);
		}
		fxEndJob(the);
		if (the->promiseJobs) {
			continue;
		}
		c_gettimeofday(&tv, NULL);
		when = ((txNumber)(tv.tv_sec) * 1000.0) + ((txNumber)(tv.tv_usec) / 1000.0);
		address = (txJob**)&(the->timerJobs);
		if (!*address)
			break;
		while ((job = *address)) {
			txMachine* the = job->the;
			if (the) {
				if (job->when <= when) {
					fxBeginHost(the);
					mxTry(the) {
						mxPushUndefined();
						mxPush(job->function);
						mxCall();
						mxPush(job->argument);
						mxRunCount(1);
						mxPop();
						if (job->the) {
							if (job->interval) {
								job->when += job->interval;
							}
							else {
								fxAccess(the, &job->self);
								*mxResult = the->scratch;
								fxForget(the, &job->self);
								fxSetHostData(the, mxResult, NULL);
								job->the = NULL;
							}
						}
					}
					mxCatch(the) {
						fxAccess(the, &job->self);
						*mxResult = the->scratch;
						fxForget(the, &job->self);
						fxSetHostData(the, mxResult, NULL);
						job->the = NULL;
						fxAbort(the, XS_UNHANDLED_EXCEPTION_EXIT);
					}
					fxEndHost(the);
					break; /* run promise jobs queued by the timer */
				}
				address = &(job->next);
			}
			else {
				*address = job->next;
				c_free(job);
			}
		}
	}
	fxCheckUnhandledRejections(the, 1);
}

/* ---- Snapshot callback discovery ---- */

/*
 * Collect all host callback pointers found on the machine heap.
 * Returns the number of unique callbacks found.
 * If `out` is non-NULL and `out_cap` > 0, stores pointers in `out`.
 *
 * Walks XS_CALLBACK_KIND and XS_CALLBACK_X_KIND slots, which is
 * the same slot kind the snapshot writer projects via
 * fxProjectCallback.
 */
#include <dlfcn.h>

int fxCollectHostCallbacks(txMachine* the, txCallback* out, int out_cap) {
	int count = 0;
	txSlot* aSlot;
	txSlot* bSlot;
	txSlot* cSlot;

	/* Walk heap chunks */
	aSlot = the->firstHeap;
	while (aSlot) {
		bSlot = aSlot + 1;
		cSlot = aSlot + 1 + ((aSlot + 1)->next->value.integer);
		while (bSlot < cSlot) {
			if (bSlot->kind == XS_CALLBACK_KIND
				|| bSlot->kind == XS_CALLBACK_X_KIND) {
				txCallback cb = bSlot->value.callback.address;
				if (cb) {
					int found = 0;
					for (int i = 0; i < count; i++) {
						if (out && out[i] == cb) { found = 1; break; }
					}
					if (!found) {
						if (out && count < out_cap) {
							out[count] = cb;
						}
						count++;
					}
				}
			}
			bSlot++;
		}
		aSlot = aSlot->next;
	}
	return count;
}

/* Print all host callbacks found on the machine to stderr.
   Useful for discovering which callbacks the snapshot table needs. */
void fxDebugDumpCallbacks(txMachine* the) {
	txCallback cbs[256];
	int n = fxCollectHostCallbacks(the, cbs, 256);
	fprintf(stderr, "=== Host callbacks on machine: %d ===\n", n);
	for (int i = 0; i < n && i < 256; i++) {
		Dl_info info;
		if (dladdr((void*)cbs[i], &info) && info.dli_sname) {
			fprintf(stderr, "  [%d] %s (%p)\n", i, info.dli_sname, (void*)cbs[i]);
		} else {
			fprintf(stderr, "  [%d] <unknown> (%p)\n", i, (void*)cbs[i]);
		}
	}
	fprintf(stderr, "=== end ===\n");
}
