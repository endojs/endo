import type { Reader, Writer } from '@endo/stream';
import type { OcapnCodec } from '@endo/ocapn/codec-interface';
import type { OcapnLocation, OcapnSignature } from '@endo/ocapn/components';

/**
 * 32-byte Ed25519 signing keys. The same keypair backs both the Noise
 * handshake and the OCapN location signature the peer authenticates
 * over the encrypted tunnel.
 */
export interface SigningKeys {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/**
 * A hex-encoded raw Ed25519 public key. Serves as both the local
 * identifier for a registered signing key and the `designator` of the
 * OCapN locator the peer will receive.
 */
export type KeyIdHex = string;

/**
 * Bidirectional byte stream produced by a transport. Uses the
 * `@endo/stream` Reader/Writer interfaces so every transport follows
 * the same async-iterator contract. Writes are `Uint8Array` chunks;
 * reads iterate incoming `Uint8Array` chunks.
 */
export interface ByteStream {
  reader: Reader<Uint8Array>;
  writer: Writer<Uint8Array>;
}

/**
 * Handle returned by `OcapnNoiseTransport.listen`. The network calls
 * `close()` when the transport is removed.
 */
export interface TransportListener {
  /**
   * Transport-specific connection hints the peer should include in
   * their locator to reach this listener (keys without the transport's
   * scheme prefix; the caller adds it).
   */
  hints: Record<string, string>;
  close(): void;
}

/**
 * A pluggable transport the network uses to move encrypted bytes.
 * Transports speak `Uint8Array` chunks and have no knowledge of OCapN
 * or the Noise protocol.
 */
export interface OcapnNoiseTransport {
  /** e.g. `'mock'`, `'tcp'`, `'ws'`. Used as a prefix on hint keys. */
  scheme: string;
  /**
   * Open an outgoing byte stream to a peer using transport-specific
   * hints. Keys are passed without the scheme prefix.
   */
  connect(hints: Record<string, string>): Promise<ByteStream>;
  /**
   * Start listening for inbound streams. Optional; a transport that
   * supports only outgoing connections omits `listen`.
   */
  listen?(handler: (stream: ByteStream) => void): Promise<TransportListener>;
  /**
   * Release any resources held for outgoing connections. Inbound
   * listeners are torn down via their own `TransportListener.close`.
   */
  shutdown(): void;
}

/**
 * A fully-authenticated session returned by the network.
 *
 * `reader` and `writer` carry plaintext OCapN framing; the network
 * encrypts every outbound frame and de-encrypts incoming frames. The
 * test helper hooks (`_setOnData`, `_setOnClose`) are retained until
 * `@endo/ocapn`'s `NetworkSession` is itself stream-based.
 */
export interface OcapnNoiseSession {
  sessionId: ArrayBufferLike;
  selfIdentity: {
    location: OcapnLocation;
    locationSignature: OcapnSignature;
    /**
     * Our Ed25519 keypair for this session: the same keypair the Noise
     * handshake used and that handoff signing will use.
     */
    keyPair: import('@endo/ocapn/cryptography').OcapnKeyPair;
    keyId: KeyIdHex;
  };
  remoteLocation: OcapnLocation;
  remoteLocationSignature: OcapnSignature;
  remotePublicKeyBytes: ArrayBufferLike;
  isInitiator: boolean;
  reader: Reader<Uint8Array>;
  writer: Writer<Uint8Array>;
  close(): void;
}

/**
 * The OCapN-Noise network, parameterized over a chosen wire codec.
 *
 * Signing keys and transports may be added or removed at any point
 * during the network's lifetime. `provideSession` selects a registered
 * local key (by `localKeyId` or any available) and opens an outbound
 * session. `listen`-capable transports accept inbound sessions using
 * whichever registered local key the peer's SYN is addressed to.
 */
export interface OcapnNoiseNetwork {
  readonly networkId: 'np';
  /**
   * The wire codec this network uses for the encrypted post-handshake
   * exchange and for every subsequent session message. Exposed so a
   * session manager that registers this network can adopt the same
   * codec rather than being configured with it redundantly.
   */
  readonly codec: OcapnCodec;
  /**
   * Fully-authenticated sessions that arrived via a peer-initiated
   * Noise handshake (as opposed to sessions this network initiated via
   * `provideSession`). Consumed by `@endo/ocapn`'s `registerNetwork`
   * to wire each inbound session into its session manager.
   */
  readonly inboundSessions: AsyncIterable<OcapnNoiseSession>;
  /**
   * Generate a fresh Ed25519 keypair using the embedded Noise WASM
   * module's random-key routine. Convenience for callers that have no
   * existing identity and don't want a separate crypto dependency.
   */
  generateSigningKeys(): SigningKeys;
  addSigningKeys(keys: SigningKeys): KeyIdHex;
  removeSigningKeys(keyId: KeyIdHex): void;
  listSigningKeys(): KeyIdHex[];
  addTransport(transport: OcapnNoiseTransport): Promise<void>;
  removeTransport(transport: OcapnNoiseTransport): void;
  listTransports(): OcapnNoiseTransport[];
  /**
   * Return one locator per registered signing key, aggregating
   * currently-listening transport hints.
   */
  locations(): OcapnLocation[];
  locationFor(keyId: KeyIdHex): OcapnLocation;
  provideSession(
    remote: OcapnLocation,
    options?: { localKeyId?: KeyIdHex },
  ): Promise<OcapnNoiseSession>;
  /**
   * Resolve with an inbound session once a peer completes its
   * handshake to the given identity. If a session is already active
   * to that peer, returns it immediately. Otherwise blocks until the
   * next peer-initiated session lands.
   */
  waitForInboundSession(peerKeyId: KeyIdHex): Promise<OcapnNoiseSession>;
  shutdown(): void;
}

export interface MakeOcapnNoiseNetworkOptions {
  codec: OcapnCodec;
}

export declare function makeOcapnNoiseNetwork(
  options: MakeOcapnNoiseNetworkOptions,
): OcapnNoiseNetwork;

// Transports live behind subpath exports so a browser bundle does
// not pull in `node:net` and a Node bundle does not require the
// browser `WebSocket` shim. Import them as:
//
//   import { makeMockTransportPair } from '@endo/ocapn-noise/transport/mock';
//   import { makeTcpTransport } from '@endo/ocapn-noise/transport/tcp';
//   import { makeWebSocketTransport } from '@endo/ocapn-noise/transport/ws';
//
// Each module exports a single factory function returning an
// `OcapnNoiseTransport`.
