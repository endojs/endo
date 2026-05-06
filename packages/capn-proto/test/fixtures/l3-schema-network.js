// @ts-nocheck
/**
 * Test fixture: a structured L3 VatNetwork that uses
 * `test/interop-rpc/l3.capnp` for the four AnyPointer payloads
 * (Provide.recipient, Accept.provision, ThirdPartyCapDescriptor.id,
 * Return.acceptFromThirdParty.thirdPartyCapId).
 *
 * Unlike `l3-bytes-network.js` (which writes opaque bytes as Data —
 * fine for unit-testing the L3 control flow but not byte-correct vs a
 * peer that expects a struct), this fixture embeds proper Cap'n Proto
 * structs at each AnyPointer slot. That's what a real CF / capnp-cpp
 * L3 peer expects at the wire level — `getAs<TestRecipientId>()` etc.
 *
 * Used by:
 *   - `test/interop-l3.test.js` for byte-level interop against
 *     `capnp decode rpc.capnp Message` (asserting the AnyPointer slots
 *     parse as TestRecipientId / TestProvisionId / TestThirdPartyCapId
 *     under the l3.capnp schema).
 *   - Future live-L3 interop with a custom C++ VatNetwork that speaks
 *     the same schema.
 *
 * The structured shapes:
 *   - VatLocation { vatId: Text, transport: Text }
 *   - TestRecipientId { recipient: VatLocation }
 *   - TestProvisionId { swissNum: Data }
 *   - TestThirdPartyCapId { host: VatLocation, swissNum: Data }
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSchema } from '../../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(here, '..', 'interop-rpc', 'l3.capnp');

const schema = loadSchema(readFileSync(SCHEMA_PATH, 'utf8'));
const recipientCodec = schema.structCodec('TestRecipientId');
const provisionCodec = schema.structCodec('TestProvisionId');
const thirdPartyCapIdCodec = schema.structCodec('TestThirdPartyCapId');

/** @param {{ vatId: string, transport?: string }} loc */
const makeVatLocation = ({ vatId, transport = '' }) => ({ vatId, transport });

/**
 * Build a structured-L3 VatNetwork mock.
 *
 * The mock keeps a registry of vat-id → connection so it can resolve
 * incoming ThirdPartyCapId structs to peer connections, and a per-vat
 * map of swissnum → pending Provide so `consumeProvision` matches by
 * the swissnum embedded in the Accept's provision struct.
 *
 * @param {{
 *   ourVatId: string,
 *   ourTransport?: string,
 *   peers?: Record<string, any>,
 *   mintSwissNum?: () => Uint8Array,
 *   resolveTransport?: (transport: string) => any,
 * }} cfg
 */
export const schemaNetworkMock = ({
  ourVatId,
  ourTransport = '',
  peers = {},
  mintSwissNum,
  resolveTransport,
}) => {
  /** @type {Map<string, { questionId: number, target: any, recipient: any }>} */
  const pending = new Map();
  const swissnumKey = u8 => Array.from(u8).join(',');

  const swissCounter = (() => {
    let n = 0;
    return () => {
      n += 1;
      // 32-byte swissnum; for fixture purposes we just pad a counter.
      const b = new Uint8Array(32);
      b[0] = 0xfe;
      b[1] = 0xed;
      b[2] = (n >> 8) & 0xff;
      b[3] = n & 0xff;
      return b;
    };
  })();
  const mint = mintSwissNum || swissCounter;

  // For the introducer (B): cache the swissnum we minted for each
  // hostConnection so the matching encodeThirdPartyCapId emits the same
  // value the Provide carried.
  const swissByHost = new WeakMap();

  return {
    ourVatId: () => new TextEncoder().encode(ourVatId),

    /**
     * Introducer (B): callback that places a `TestThirdPartyCapId`
     * struct at the AnyPointer slot. Names where the recipient (A)
     * should dial to reach the host (C), and includes the swissnum so
     * A can present it as the Accept's provision without a separate
     * encode step.
     */
    encodeThirdPartyCapId: hostConnection => (msg, slot) => {
      // The peer name is whichever of `peers` matches the hostConnection.
      let hostVatId = '';
      let hostTransport = '';
      for (const [name, peer] of Object.entries(peers)) {
        if (peer === hostConnection) {
          hostVatId = name;
          hostTransport = peer.l3Transport || '';
          break;
        }
      }
      const swiss = swissByHost.get(hostConnection) || mint();
      swissByHost.set(hostConnection, swiss);
      thirdPartyCapIdCodec.encode(
        {
          host: makeVatLocation({ vatId: hostVatId, transport: hostTransport }),
          swissNum: swiss,
        },
        {},
      ).encodeContent(msg, slot);
    },

    /**
     * Recipient (A): decode the TestThirdPartyCapId struct at idSlot,
     * dial the host (using either the in-memory peers registry or
     * `resolveTransport` to build a fresh connection from the
     * transport hint), and return the connection.
     */
    connectToThirdParty: idSlot => {
      const decoded = thirdPartyCapIdCodec.decode({
        contentSlot: idSlot,
        capTable: [],
      });
      if (!decoded || !decoded.host) return undefined;
      const peer = peers[decoded.host.vatId];
      if (peer) return peer;
      if (resolveTransport && decoded.host.transport) {
        return resolveTransport(decoded.host.transport);
      }
      return undefined;
    },

    /**
     * Recipient (A): Accept's provision struct contains the swissnum
     * the introducer baked into the ThirdPartyCapId. We re-decode the
     * idSlot to extract that swissnum, then return an encoder that
     * places a TestProvisionId carrying it.
     */
    encodeProvisionForHandoff: idSlot => (msg, slot) => {
      const decoded = thirdPartyCapIdCodec.decode({
        contentSlot: idSlot,
        capTable: [],
      });
      const swissNum = (decoded && decoded.swissNum) || new Uint8Array(0);
      provisionCodec.encode({ swissNum }, {}).encodeContent(msg, slot);
    },

    /**
     * Introducer (B): Provide.recipient gets the recipient's
     * TestRecipientId. Caller passes the recipient identifier we know
     * about (typically `cfg.recipientVatId` from the connection).
     */
    encodeRecipient: recipient => (msg, slot) => {
      const recipientVatId =
        typeof recipient === 'string'
          ? recipient
          : recipient instanceof Uint8Array
            ? new TextDecoder().decode(recipient)
            : '';
      recipientCodec.encode(
        { recipient: makeVatLocation({ vatId: recipientVatId }) },
        {},
      ).encodeContent(msg, slot);
    },

    /**
     * Host (C): an inbound Provide arrived. Decode the recipient and
     * stash the (questionId, target, recipient) so a future Accept
     * matching this provision can claim it. We use the swissnum the
     * introducer minted; it's not on the wire of Provide itself, so
     * we'd need to receive it out-of-band. For the fixture, the
     * introducer mints + stashes via `acceptIncomingProvideWithSwiss`
     * directly. This default no-ops.
     */
    acceptIncomingProvide: (questionId, target, recipientSlot) => {
      const decoded = recipientCodec.decode({
        contentSlot: recipientSlot,
        capTable: [],
      });
      // No swissnum on the wire of Provide; the host receives it
      // separately. The fixture's `stashProvide(swiss, ...)` does the
      // bookkeeping; this hook just signals the callback fired.
      pending.set(`__pending_${questionId}`, {
        questionId,
        target,
        recipient: decoded,
      });
    },

    /**
     * Host (C): match an incoming Accept's provision against
     * previously-stashed Provides. Reads the swissnum from the
     * provision struct and looks it up.
     */
    consumeProvision: provisionSlot => {
      const decoded = provisionCodec.decode({
        contentSlot: provisionSlot,
        capTable: [],
      });
      const k = decoded && decoded.swissNum
        ? swissnumKey(decoded.swissNum)
        : '';
      const found = pending.get(k);
      if (found) pending.delete(k);
      return found;
    },

    /**
     * Test helper: the introducer (B) calls this when issuing a
     * Provide so the host's `consumeProvision` lookup table is keyed
     * by swissnum. (In a real flow B and C share the swissnum out-of-
     * band — usually inside the Provide message itself, with a
     * different schema. This fixture takes a shortcut.)
     *
     * @param {Uint8Array} swiss
     * @param {{ questionId: number, target: any, recipient?: any }} entry
     */
    stashProvide: (swiss, entry) => {
      pending.set(swissnumKey(swiss), entry);
    },

    /** Diagnostic: look at the pending map (test assertions). */
    pendingCount: () => pending.size,

    ourTransport,
  };
};
