// @ts-check
/**
 * Two-party VatNetwork (`rpc-twoparty.capnp`).
 *
 * The two-party network is the simplest concrete VatNetwork: only one peer
 * exists per side, so VatId, RecipientId, ProvisionId, and ThirdPartyCapId
 * are essentially constants. We model them as small Uint8Arrays whose
 * contents are unimportant beyond uniqueness.
 *
 * Most users will instead use a custom VatNetwork that bridges to TCP/TLS,
 * SCM_RIGHTS, etc. This default exists primarily for tests and for the
 * common single-peer Cap'n Proto use case.
 */

import { Fail } from '@endo/errors';
import harden from '@endo/harden';

const u8 = s => new TextEncoder().encode(s);

/**
 * @param {object} args
 * @param {Uint8Array} args.ourVatId
 * @param {{ send(framed: ArrayBuffer): void, onMessage(cb: (framed: ArrayBuffer) => void): void }} args.transport
 */
export const makeTwoPartyVatNetwork = ({ ourVatId, transport }) => {
  return harden({
    ourVatId: () => ourVatId,
    send: framed => transport.send(framed),
    onMessage: cb => transport.onMessage(cb),
    thirdPartyCapIdForHost: () => u8('two-party-host'),
    connectToThirdParty: () => {
      throw Fail`two-party network has no third party`;
    },
    provisionIdForHandoff: () => u8('two-party-prov'),
    acceptIncomingProvide: () => {},
    consumeProvision: () => undefined,
  });
};
