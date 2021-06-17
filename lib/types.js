// @ts-check

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
 * @typedef {[boolean, any]} TrapCompleted The head of the pair is the
 * `isRejected` value indicating whether the sync call was an exception, and
 * tail of the pair is the serialized value (or error).
 */

/**
 * @callback TakeTrapReply Return a Generator to use in a tight loop until it
 * returns a TrapCompleted value indicating the final results of a Trap call.
 *
 * The rules are that the call request is only sent if the first iteration
 * yields instead of returning a result.  For each yield, the other end of the
 * connection's GiveTrapReply async iterator is called.  When the reassembled
 * TrapCompleted result is returned, the Trap() call either returns or throws an
 * exception.
 *
 * @param {keyof TrapImpl} implMethod the TrapImpl method that was called
 * @param {string} slot the target slot
 * @param {Array<any>} implArgs arguments to the TrapImpl method
 * @returns {Generator<any, TrapCompleted, boolean>}
 */

/**
 * @callback GiveTrapReply Return an AsyncGenerator which is synchronously
 * iterated by TakeTrapReply's generator to signal readiness of parts of the
 * reply (there may be only one).  These two generators must be written to
 * cooperate over a specific CapTP connection, and via any out-of-band
 * mechanisms as well.
 *
 * @param {TrapCompleted[0]} isReject whether the reply to communicate was a
 * rejection or a regular return
 * @param {TrapCompleted[1]} serialized the marshal-serialized (JSONable) data
 * to be communicated to the other side
 * @returns {AsyncGenerator<void, void, any>}
 */

/** @typedef {import('./ts-types').Trap} Trap */

/**
 * @template T
 * @typedef {import('./ts-types').TrapHandler<T>} TrapHandler
 */
