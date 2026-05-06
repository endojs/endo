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
 * @typedef {object} EncodedPayload
 * @property {(msg: any, contentPtrSlot: { segId: number, wordOffset: number }) => void} [encodeContent]
 *   Called by `writePayload` to populate the `Payload.content` AnyPointer
 *   slot. Implementations write a struct, list, or cap pointer (or leave
 *   the slot null by not providing the callback). Schema-typed codecs
 *   built via `loadSchema(...).registerInterface` use `encodeStructInto`.
 * @property {CapDescriptor[]} [capTable]
 *   Side-band capability table referenced by index from cap pointers
 *   inside `content`.
 *
 * @typedef {object} DecodedPayload
 * @property {{ msg: any, segId: number, wordOffset: number } | null} contentSlot
 *   Pointer slot for `Payload.content`. Null if the surrounding Payload
 *   itself is null. Schema-typed callers feed this to `decodeStructFrom`;
 *   bootstrap-style callers feed it to `readCapContent`.
 * @property {CapDescriptor[]} capTable
 *
 * A `Payload` is the on-the-wire content of a `Call.params` or
 * `Return.results.payload`. Per rpc.capnp `content @0 :AnyPointer` —
 * the actual struct (or cap pointer, in the bootstrap/Provide case)
 * lives directly at the slot, byte-compatible with capnp-C++.
 */

/* ===================================================================== *
 *  Interface registry
 * ===================================================================== */

/**
 * @typedef {object} MethodCodec
 * @property {(jsObj: unknown, ctx?: { exportCap?: (v: unknown) => any, importCap?: (d: any) => unknown }) => EncodedPayload} encode
 *   Encode a request's args (or a response's value) as the AnyPointer-shaped
 *   payload that `writePayload` consumes: `encodeContent(msg, slot)` writes
 *   the struct directly at `Payload.content`'s pointer slot in the parent
 *   message, populating the shared `capTable` along the way.
 * @property {(payload: DecodedPayload, ctx?: { exportCap?: (v: unknown) => any, importCap?: (d: any) => unknown }) => unknown} decode
 *   Inverse of encode: takes the `{ contentSlot, capTable }` shape that
 *   `readPayload` returns and reconstructs the JS args / value.
 *
 * Schema-typed method codec for a specific (interfaceId, methodId,
 * direction). Every called method requires a registered codec; without
 * one, sendCall throws and handleCall returns an exception. The
 * `loadSchema(...).registerInterface(registry, name)` entry point
 * derives codecs automatically from a `.capnp` schema.
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
