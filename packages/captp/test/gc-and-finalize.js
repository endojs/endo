/* global setImmediate */

/* A note on our GC terminology:
 *
 * We define four states for any JS object to be in:
 *
 * REACHABLE: There exists a path from some root (live export or top-level
 * global) to this object, making it ineligible for collection. Userspace vat
 * code has a strong reference to it (and userspace is not given access to
 * WeakRef, so it has no weak reference that might be used to get access).
 *
 * UNREACHABLE: There is no strong reference from a root to the object.
 * Userspace vat code has no means to access the object, although liveslots
 * might (via a WeakRef). The object is eligible for collection, but that
 * collection has not yet happened. The liveslots WeakRef is still alive: if
 * it were to call `.deref()`, it would get the object.
 *
 * COLLECTED: The JS engine has performed enough GC to notice the
 * unreachability of the object, and has collected it. The liveslots WeakRef
 * is dead: `wr.deref() === undefined`. Neither liveslots nor userspace has
 * any way to reach the object, and never will again. A finalizer callback
 * has been queued, but not yet executed.
 *
 * FINALIZED: The JS engine has run the finalizer callback. After this point,
 * the object is thoroughly dead and unremembered, and no longer exists in
 * one of these four states.
 *
 * The transition from REACHABLE to UNREACHABLE always happens as a result of
 * a message delivery or resolution notification (e.g when userspace
 * overwrites a variable, deletes a Map entry, or a callback on the promise
 * queue which closed over some objects is retired and deleted).
 *
 * The transition from UNREACHABLE to COLLECTED can happen spontaneously, as
 * the JS engine decides it wants to perform GC. It will also happen
 * deliberately if we provoke a GC call with a magic function like `gc()`
 * (when Node.js imports `engine-gc`, which is morally-equivalent to
 * running with `--expose-gc`, or when XS is configured to provide it as a
 * C-level callback). We can force GC, but we cannot prevent it from happening
 * at other times.
 *
 * FinalizationRegistry callbacks are defined to run on their own turn, so
 * the transition from COLLECTED to FINALIZED occurs at a turn boundary.
 * Node.js appears to schedule these finalizers on the timer/IO queue, not
 * the promise/microtask queue. So under Node.js, you need a `setImmediate()`
 * or two to ensure that finalizers have had a chance to run. XS is different
 * but responds well to similar techniques.
 */

/*
 * `gcAndFinalize` must be defined in the start compartment. It uses
 * platform-specific features to provide a function which provokes a full GC
 * operation: all "UNREACHABLE" objects should transition to "COLLECTED"
 * before it returns. In addition, `gcAndFinalize()` returns a Promise. This
 * Promise will resolve (with `undefined`) after all FinalizationRegistry
 * callbacks have executed, causing all COLLECTED objects to transition to
 * FINALIZED. If the caller can manage call gcAndFinalize with an empty
 * promise queue, then their .then callback will also start with an empty
 * promise queue, and there will be minimal uncollected unreachable objects
 * in the heap when it begins.
 *
 * `gcAndFinalize` depends upon platform-specific tools to provoke a GC sweep
 * and wait for finalizers to run: a `gc()` function, and `setImmediate`. If
 * these tools do not exist, this function will do nothing, and return a
 * dummy pre-resolved Promise.
 */

export async function makeGcAndFinalize(gcPowerP) {
  const gcPower = await gcPowerP;
  if (typeof gcPower !== 'function') {
    if (gcPower !== false) {
      // We weren't explicitly disabled, so warn.
      console.warn(
        Error(`no gcPower() function; skipping finalizer provocation`),
      );
    }
  }
  return async function gcAndFinalize() {
    if (typeof gcPower !== 'function') {
      return;
    }

    // on Node.js, GC seems to work better if the promise queue is empty first
    await new Promise(setImmediate);
    // on xsnap, we must do it twice for some reason
    await new Promise(setImmediate);
    gcPower();
    // this gives finalizers a chance to run
    await new Promise(setImmediate);
    // Node.js seems to need another for promises to get cleared out
    await new Promise(setImmediate);
  };
}
