export {};

/** @typedef {string} CapTPSlot */

/**
 * @typedef {object} TrapImpl
 * @property {(target: any, args: Array<any>) => any} applyFunction function
 * application
 * @property {(
 *   target: any,
 *   method: string | symbol | number,
 *   args: Array<any>
 * ) => any} applyMethod method invocation, which is an atomic lookup of method
 * and apply
 * @property {(target: any, prop: string | symbol | number) => any} get property
 * lookup
 */

/**
 * @typedef {[boolean, import('@endo/marshal').CapData<CapTPSlot>]} TrapCompletion The head of the pair
 * is the `isRejected` value indicating whether the sync call was an exception,
 * and tail of the pair is the serialized fulfillment value or rejection reason.
 * (The fulfillment value is a non-thenable.  The rejection reason is normally
 * an error.)
 */

/**
 * @typedef TrapRequest the argument to TrapGuest
 * @property {keyof TrapImpl} trapMethod the TrapImpl method that was called
 * @property {CapTPSlot} slot the target slot
 * @property {Array<any>} trapArgs arguments to the TrapImpl method
 * @property {() => Required<Iterator<void, void, any>>} startTrap start the
 * trap process on the trapHost, and drive the other side.
 */

/**
 * @callback TrapGuest Use out-of-band communications to synchronously return a
 * TrapCompletion value indicating the final results of a Trap call.
 * @param {TrapRequest} req
 * @returns {TrapCompletion}
 */

/**
 * @callback TrapHost start the process of transferring the Trap request's
 * results
 * @param {TrapCompletion} completion
 * @returns {AsyncIterator<void, void, any> | undefined} If an AsyncIterator is
 * returned, it will satisfy a future guest IterationObserver.
 */

/** @typedef {import('./ts-types.js').Trap} Trap */

/**
 * @template T
 * @typedef {import('./ts-types').TrapHandler<T>} TrapHandler
 */
