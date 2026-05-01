// @ts-check
/**
 * Public type surface for `@endo/capn-proto`.
 *
 * Mirrors the convention used by `@endo/captp`'s `src/types.js`: this
 * file exports an empty namespace and exists only to host JSDoc
 * `@typedef`s that consumers can `import('@endo/capn-proto/src/types.js').T`
 * from. The typedefs are intentionally a curated subset of the public
 * surface — internal shapes (wire pointer kinds, table entries, etc.)
 * stay private to their owning modules.
 */

export {};

/* ===================================================================== *
 *  Capability descriptors (rpc.capnp `CapDescriptor`)
 * ===================================================================== */

/**
 * @typedef {(
 *   | { kind: 'none' }
 *   | { kind: 'senderHosted', id: number }
 *   | { kind: 'senderPromise', id: number }
 *   | { kind: 'receiverHosted', id: number }
 *   | { kind: 'receiverAnswer', questionId: number, transform?: TransformOp[] }
 *   | { kind: 'thirdPartyHosted', thirdPartyCapId: Uint8Array, vineId: number }
 * )} CapDescriptor
 *
 * Wire-level capability reference inside a Payload's `capTable`. Matches
 * the `CapDescriptor` union from rpc.capnp.
 */

/**
 * @typedef {object} TransformOp
 * @property {string} op  e.g. `'getPointerField'`
 * @property {number} [fieldOrdinal]
 *
 * One step in a `PromisedAnswer.transform` walk used for pipelined
 * receiverAnswer references.
 */

/* ===================================================================== *
 *  Payload (Call/Return params)
 * ===================================================================== */

/**
 * @typedef {object} Payload
 * @property {Uint8Array} contentBytes  serialized struct content
 * @property {CapDescriptor[]} capTable  side-band capability table
 *
 * A `Payload` is the on-the-wire content of a `Call.params` or
 * `Return.results.payload`. Its `contentBytes` are typically a typed
 * struct (when a schema codec is registered) or this package's default
 * JSON-with-marker serialization; either way the bytes carry no
 * capabilities directly — those live in `capTable` and are referenced
 * by index from inside the content.
 */

/* ===================================================================== *
 *  Interface registry
 * ===================================================================== */

/**
 * @typedef {object} MethodCodec
 * @property {(jsObj: unknown, ctx?: any) => Uint8Array | ArrayBuffer | Payload} encode
 * @property {(bytes: ArrayBuffer | Uint8Array, capTable?: any[], ctx?: any) => unknown} decode
 *
 * Schema-typed method codec for a specific (interfaceId, methodId,
 * direction). When registered via `registerInterface({ methodCodecs })`
 * the connection routes the method's request/response through this codec
 * instead of the default JSON-over-bytes payload codec.
 */

/**
 * @typedef {object} InterfaceDescriptor
 * @property {bigint} id
 * @property {Record<string, number>} methods
 * @property {Record<number | string, { request?: MethodCodec, response?: MethodCodec }>} [methodCodecs]
 */

/**
 * @typedef {object} InterfaceRegistry
 * @property {(desc: InterfaceDescriptor) => void} register
 * @property {(id: bigint) => InterfaceDescriptor | undefined} byId
 * @property {(id: bigint, mid: number) => string | undefined} methodName
 * @property {(id: bigint, name: string) => number | undefined} methodOrdinal
 * @property {(id: bigint) => boolean} has
 * @property {() => IterableIterator<InterfaceDescriptor>} iterate
 * @property {(id: bigint, mid: number, dir: 'request' | 'response') => MethodCodec | undefined} methodCodec
 */

/* ===================================================================== *
 *  VatNetwork (the L3 plumbing surface)
 * ===================================================================== */

/**
 * @typedef {object} VatNetwork
 * @property {() => Uint8Array} ourVatId
 * @property {(hostConnection: any) => Uint8Array} thirdPartyCapIdForHost
 *   Encode the bytes that name a third-party host. Called on the
 *   introducer (B) side when issuing a `Provide` — the recipient (A)
 *   later uses these bytes with `connectToThirdParty` to dial the host.
 * @property {(thirdPartyCapId: Uint8Array) => any} connectToThirdParty
 *   Resolve the bytes from `thirdPartyCapIdForHost` back into a peer
 *   connection on the recipient side. Throws or returns null if the
 *   network does not support third-party handoff for this id.
 * @property {(thirdPartyCapId: Uint8Array) => Uint8Array} provisionIdForHandoff
 *   Mint or look up the provision token for an outgoing Provide /
 *   incoming Accept. The introducer and the recipient must agree on
 *   the token.
 * @property {(questionId: number, target: any, recipient: Uint8Array) => void} acceptIncomingProvide
 *   Host (C) side: stash an incoming Provide so a later Accept from
 *   the recipient can claim it.
 * @property {(provision: Uint8Array) => { questionId: number, target: any } | undefined} consumeProvision
 *   Host (C) side: match an incoming Accept's provision against
 *   previously-stashed Provides; returns `undefined` if no match.
 */

/* ===================================================================== *
 *  CapHome registry (network-wide map for L3 auto-Provide on encode)
 * ===================================================================== */

/**
 * @typedef {object} CapHome
 * @property {any} hostConnection
 * @property {number} hostImportId
 */

/**
 * @typedef {object} CapHomeRegistry
 * @property {(presence: object, hostConnection: any, hostImportId: number) => void} register
 * @property {(value: unknown) => CapHome | undefined} find
 */
