// @ts-check

/**
 * @template T
 * @typedef {import('@agoric/eventual-send').ERef<T>} ERef
 */

/** @typedef {string} CapTPSlot */

/**
 * @typedef {Object} TrapImpl
 * @property {(target: any, args: Array<any>) => any} applyFunction function
 * application
 * @property {(target: any, method: string | symbol | number, args: Array<any>)
 * => any} applyMethod method invocation, which is an atomic lookup of method and
 * apply
 * @property {(target: any, prop: string | symbol | number) => any} get property
 * lookup
 */

/**
 * @typedef {[boolean, CapData<CapTPSlot>]} TrapCompletion The head of the pair is the
 * `isRejected` value indicating whether the sync call was an exception, and
 * tail of the pair is the serialized fulfillment value or rejection reason.
 * (The fulfillment value is a non-thenable.  The rejection reason is normally
 * an error.)
 */

/**
 * @typedef DoTrapInfo the argument to DoTrap
 * @property {keyof TrapImpl} implMethod the TrapImpl method that was called
 * @property {CapTPSlot} slot the target slot
 * @property {Array<any>} implArgs arguments to the TrapImpl method
 * @property {(obj?: any) => void} trapSend send a message over the existing
 * CapTP data channel for the trapHost to handle
 */

/**
 * @callback DoTrap Use out-of-band communications to synchronously return a
 * TrapCompleted value indicating the final results of a Trap call.
 *
 * @param {DoTrapInfo} info
 * @returns {TrapCompletion}
 */

/**
 * @typedef {Object} TrapGuest
 * @property {DoTrap} doTrap fulfill a Trap request
 */

/**
 * @callback GiveTrapReply Return an AsyncGenerator which is synchronously
 * iterated by TakeTrapReply's generator to signal readiness of parts of the
 * reply (there may be only one).  These two generators must be written to
 * cooperate over a specific CapTP connection, and via any out-of-band
 * mechanisms as well.
 *
 * @param {TrapCompletion[0]} isReject whether the reply to communicate was a
 * rejection or a regular return
 * @param {TrapCompletion[1]} serialized the marshal-serialized data to be
 * communicated to the other side.  Note that the serialized data is JSONable.
 * @returns {AsyncGenerator<void, void, any>}
 */

/** @typedef {import('./ts-types').Trap} Trap */

/**
 * @template T
 * @typedef {import('./ts-types').TrapHandler<T>} TrapHandler
 */
