// @ts-check
/**
 * Two-party VatNetwork (`rpc-twoparty.capnp`).
 *
 * The two-party network is the simplest concrete VatNetwork: only one peer
 * exists per side, so VatId, RecipientId, ProvisionId, and ThirdPartyCapId
 * are essentially unused — there's no third party to introduce. The L3
 * methods are stubbed: every encode-callback is a no-op, and the
 * connectToThirdParty throw forces a fallback to the vine path.
 *
 * Most users will instead use a custom VatNetwork that bridges to TCP/TLS,
 * SCM_RIGHTS, etc. This default exists primarily for tests and for the
 * common single-peer Cap'n Proto use case.
 */

import { Fail } from '@endo/errors';
import harden from '@endo/harden';

/**
 * @param {object} args
 * @param {Uint8Array} args.ourVatId
 * @param {{ send(framed: ArrayBuffer): void, onMessage(cb: (framed: ArrayBuffer) => void): void }} args.transport
 */
export const makeTwoPartyVatNetwork = ({ ourVatId, transport }) => {
  const noopEncode = (_msg, _slot) => {};
  return harden({
    ourVatId: () => ourVatId,
    send: framed => transport.send(framed),
    onMessage: cb => transport.onMessage(cb),
    encodeThirdPartyCapId: () => noopEncode,
    connectToThirdParty: () => {
      throw Fail`two-party network has no third party`;
    },
    encodeProvisionForHandoff: () => noopEncode,
    encodeRecipient: () => noopEncode,
    acceptIncomingProvide: () => {},
    consumeProvision: () => undefined,
  });
};
