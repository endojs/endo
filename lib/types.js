/**
 * @typedef {Object} SyncImpl
 * @property {(target: any, args: Array<any>) => any} applyFunction function
 * application
 * @property {(target: any, method: string | symbol | number, args: Array<any>)
 * => any} applyMethod method invocation, which is an atomic lookup of method and
 * apply
 * @property {(target: any, prop: string | symbol | number) => any} get property
 * lookup
 */

/**
 * @typedef {[boolean, any]} SyncCompleted The head of the pair is the
 * `isRejected` value indicating whether the sync call was an exception, and
 * tail of the pair is the serialized value (or error).
 */

/**
 * @callback TakeSyncReply Return a Generator to use in a tight loop until it
 * returns a SyncCompleted value indicating the final results of a Sync call.
 *
 * The rules are that the call request is only sent if the first iteration
 * yields instead of returning a result.  For each yield, the other end of the
 * connection's GiveSyncReply async iterator is called.  When the reassembled
 * SyncCompleted result is returned, the Sync() call either returns or throws an
 * exception.
 *
 * @param {keyof SyncImpl} implMethod the SyncImpl method that was called
 * @param {string} slot the target slot
 * @param {Array<any>} implArgs arguments to the SyncImpl method
 * @returns {Generator<any, SyncCompleted, boolean>}
 */

/**
 * @callback GiveSyncReply Return an AsyncGenerator which is synchronously
 * iterated by TakeSyncReply's generator to signal readiness of parts of the
 * reply (there may be only one).  These two generators must be written to
 * cooperate over a specific CapTP connection, and via any out-of-band
 * mechanisms as well.
 *
 * @param {SyncCompleted[0]} isReject whether the reply to communicate was a
 * rejection or a regular return
 * @param {SyncCompleted[1]} serialized the marshal-serialized (JSONable) data
 * to be communicated to the other side
 * @returns {AsyncGenerator<void, void, any>}
 */

/** @typedef {import('./ts-types').Sync} Sync */

/**
 * @template T
 * @typedef {import('./ts-types').Syncable<T>} Syncable
 */
