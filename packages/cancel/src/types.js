/**
 * A cancellation token that is a Promise<never>.
 *
 * @typedef {Promise<never>} Cancelled
 */

/**
 * A function that triggers cancellation.
 *
 * @callback Cancel
 * @param {Error} [reason] - Optional reason for cancellation
 * @returns {void}
 */

/**
 * A function that synchronously checks if cancellation has been requested.
 *
 * @callback IsCancelled
 * @returns {boolean}
 */

/**
 * The result of makeCancelKit(), containing the cancellation token,
 * the cancel function, and a synchronous observation function.
 *
 * @typedef {object} CancelKit
 * @property {Cancelled} cancelled - The cancellation token
 * @property {Cancel} cancel - Function to trigger cancellation
 * @property {IsCancelled} isCancelled - Function to synchronously check cancellation state
 */

/**
 * Callback for allMap and anyMap operations.
 *
 * @template T
 * @template R
 * @callback CancellableCallback
 * @param {T} value - The current value
 * @param {number} index - The current index
 * @param {Cancelled} cancelled - Cancellation token for this operation
 * @param {IsCancelled} isCancelled - Synchronous cancellation check
 * @returns {R | Promise<R>}
 */

export {};
