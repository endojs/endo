// JSDoc typedefs shared across modules.

export {};

/**
 * @typedef {object} RpcTransport
 * @property {(message: string) => Promise<void> | void} send
 * @property {() => Promise<string | null | undefined>} receive
 * @property {(reason?: unknown) => void} [abort]
 */
