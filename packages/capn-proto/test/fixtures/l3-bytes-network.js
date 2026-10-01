// @ts-nocheck
/**
 * Test fixture: convert between opaque-Uint8Array-style L3 IDs (the way
 * existing tests mock the VatNetwork) and the encoder-callback /
 * pointer-slot API the proto layer now expects.
 *
 * Existing tests pretend the AnyPointer slots in
 *   - Provide.recipient
 *   - Accept.provision
 *   - ThirdPartyCapDescriptor.id
 *   - Return.acceptFromThirdParty.thirdPartyCapId
 * just hold opaque bytes — adequate for unit-testing the L3 control
 * flow, since neither side cares about the schema. Real interop tests
 * (test/interop-l3.test.js) use a structured schema, but the
 * machinery-level tests benefit from staying in opaque-bytes-land.
 *
 * This module exposes:
 *   - `bytesAsDataEncoder(bytes)`: returns an `encode(msg, slot)`
 *     callback that writes the bytes as a Data list at the slot.
 *     Wire-valid AnyPointer (Data is a legitimate AnyPointer kind),
 *     just not struct-shaped.
 *   - `decodeDataFromSlot(slot)`: returns the Data list bytes from a
 *     slot, or an empty Uint8Array if null. Inverse of the above.
 *   - `bytesNetworkMock(overrides)`: builds a VatNetwork-shaped mock
 *     with sensible defaults that uses the Data-bytes convention.
 */

import { writeData, readData } from '../../src/wire/text.js';

/**
 * Build an encoder that writes `bytes` as a Data list at the slot.
 *
 * @param {Uint8Array} bytes
 */
export const bytesAsDataEncoder = bytes => (msg, slot) =>
  writeData(msg, slot, bytes);

/**
 * Read the Data list at `slot`, returning the raw bytes (or empty
 * Uint8Array if the slot is null).
 *
 * @param {{ msg: any, segId: number, wordOffset: number }} slot
 */
export const decodeDataFromSlot = slot => {
  if (!slot) return new Uint8Array(0);
  const out = readData(slot.msg, slot.segId, slot.wordOffset);
  return out ? new Uint8Array(out) : new Uint8Array(0);
};

/**
 * Build a VatNetwork-shaped mock with the legacy opaque-bytes
 * semantics. Override individual fields as needed; defaults make sense
 * for tests that don't actually exercise L3 introductions.
 *
 * The legacy fields like `thirdPartyCapIdForHost(host) → bytes` are
 * preserved as overrides — the resulting mock translates them through
 * the bytes-as-Data convention when the proto layer wants encoder
 * callbacks, and reads bytes back out of slots when the proto layer
 * passes pointer locations.
 *
 * @param {object} [overrides]
 * @param {(host: any) => Uint8Array} [overrides.thirdPartyCapIdForHost]
 * @param {(host: any) => any} [overrides.connectToThirdParty]
 * @param {(idBytes: Uint8Array) => Uint8Array} [overrides.provisionIdForHandoff]
 * @param {(recipientBytes: Uint8Array) => Uint8Array} [overrides.encodeRecipientId]
 * @param {(qid: number, target: any, recipientBytes: Uint8Array) => void} [overrides.acceptIncomingProvide]
 * @param {(provisionBytes: Uint8Array) => any} [overrides.consumeProvision]
 */
export const bytesNetworkMock = (overrides = {}) => {
  const thirdPartyCapIdForHost =
    overrides.thirdPartyCapIdForHost || (() => new Uint8Array(0));
  const connectToThirdParty =
    overrides.connectToThirdParty ||
    (() => {
      throw Error('no third party');
    });
  const provisionIdForHandoff =
    overrides.provisionIdForHandoff || (() => new Uint8Array(0));
  const encodeRecipientId = overrides.encodeRecipientId || (b => b);
  const acceptIncomingProvide = overrides.acceptIncomingProvide || (() => {});
  const consumeProvision = overrides.consumeProvision || (() => undefined);

  return {
    encodeThirdPartyCapId: hostConnection =>
      bytesAsDataEncoder(thirdPartyCapIdForHost(hostConnection)),
    connectToThirdParty: idSlot =>
      connectToThirdParty(decodeDataFromSlot(idSlot)),
    encodeProvisionForHandoff: idSlot =>
      bytesAsDataEncoder(provisionIdForHandoff(decodeDataFromSlot(idSlot))),
    encodeRecipient: recipient =>
      bytesAsDataEncoder(
        encodeRecipientId(
          recipient instanceof Uint8Array ? recipient : new Uint8Array(0),
        ),
      ),
    acceptIncomingProvide: (questionId, target, recipientSlot) =>
      acceptIncomingProvide(
        questionId,
        target,
        decodeDataFromSlot(recipientSlot),
      ),
    consumeProvision: provisionSlot =>
      consumeProvision(decodeDataFromSlot(provisionSlot)),
  };
};
