// @ts-check
/// <reference types="ses"/>

// This module exists only as a JSDoc anchor for shared types; it has no
// runtime exports.

/**
 * @typedef {object} CancelKit
 * @property {(reason?: Error) => void} cancel - Trigger cancellation. After the
 *   first call, subsequent calls are no-ops.
 * @property {Promise<never>} cancelled - A promise that rejects with the
 *   cancellation reason when `cancel(reason)` is called.
 */

export {};
