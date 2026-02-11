/**
 * A cancellation token that is a Promise<never> with a synchronous
 * `cancelled` getter for local observation.
 *
 * @typedef {Promise<never> & { readonly cancelled: undefined | true }} Cancelled
 */

/**
 * A function that triggers cancellation.
 *
 * @callback Cancel
 * @param {Error} [reason] - Optional reason for cancellation
 * @returns {void}
 */

/**
 * The result of makeCancelKit(), containing the cancellation token
 * and the cancel function.
 *
 * @typedef {object} CancelKit
 * @property {Cancelled} cancelled - The cancellation token
 * @property {Cancel} cancel - Function to trigger cancellation
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
 * @returns {R | Promise<R>}
 */

export {};
