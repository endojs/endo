// JSDoc typedefs shared across modules.

export {};

/**
 * @typedef {object} RpcTransport
 * @property {(message: string) => Promise<void> | void} send
 * @property {() => Promise<string | null>} receive
 *   Resolves with `null` to signal end-of-stream.
 * @property {(reason?: unknown) => void} [abort]
 */
