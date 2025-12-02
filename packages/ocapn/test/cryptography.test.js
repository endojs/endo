// @ts-check

/**
 * @import { HandoffGive, HandoffGiveSigEnvelope, HandoffReceive } from '../src/codecs/descriptors.js'
 */

import test from '@endo/ses-ava/test.js';

import { Buffer } from 'buffer';
import { makeOcapnKeyPair, makeSessionId } from '../src/cryptography.js';
import {
  makeWithdrawGiftDescriptor,
  serializeHandoffGive,
  serializeHandoffReceive,
} from '../src/codecs/descriptors.js';

const makeSessionKeys = () => {
  const key1 = makeOcapnKeyPair();
  const key2 = makeOcapnKeyPair();
  const sessionId = makeSessionId(key1.publicKey.id, key2.publicKey.id);
  return {
    key1,
    key2,
    sessionId,
  };
};

test('makeWithdrawGiftDescriptor', t => {
  const gifterExporterSession = makeSessionKeys(); // g2e
  const gifterReceiverSession = makeSessionKeys(); // g2r
  const exporterReceiverSession = makeSessionKeys(); // e2r
  // Gifter (g2e) registers the gift
  // Gifter (g2e) specifies the Receiver (g2r)
  // Receiver (g2r) specifies the Receiver (e2r)
  // Receiver (e2r) redeems the gift

  // The SignedGive is created in the gifter-exporter session.
  // It also uses the receiver's public key from the gifter-receiver session.
  /** @type {HandoffGiveSigEnvelope} */
  let signedGive;
  {
    const { key1: gifterKey, sessionId: gifterExporterSessionId } =
      gifterExporterSession;
    const { key2: receiverKey } = gifterReceiverSession;
    /** @type {HandoffGive} */
    const handoffGive = {
      type: 'desc:handoff-give',
      receiverKey: receiverKey.publicKey.descriptor,
      exporterLocation: {
        type: 'ocapn-peer',
        designator: '127.0.0.1',
        transport: 'tcp',
        hints: false,
      },
      exporterSessionId: gifterExporterSessionId,
      gifterSideId: gifterKey.publicKey.id,
      giftId: Buffer.from('gift-id', 'utf8'),
    };
    const giveBytes = serializeHandoffGive(handoffGive);
    /** @type {HandoffGiveSigEnvelope} */
    signedGive = {
      type: 'desc:sig-envelope',
      object: handoffGive,
      signature: gifterKey.sign(giveBytes),
    };
    const signedGiveIsValid = gifterKey.publicKey.verify(
      giveBytes,
      signedGive.signature,
    );
    t.is(signedGiveIsValid, true);
  }

  // The SignedReceive is created in the exporter-receiver session,
  // but signed by the receiver's key from the gifter-receiver session.
  // The receiver includes their public key from the exporter-receiver session,
  // to establish the chain of trust.
  {
    const {
      key2: receiverKeyForExporter,
      sessionId: exporterReceiverSessionId,
    } = exporterReceiverSession;
    const receiverPeerIdForExporter = receiverKeyForExporter.publicKey.id;
    const { key2: receiverKeyForGifter } = gifterReceiverSession;
    const handoffCount = 0n;
    /** @type {HandoffReceive} */
    const handoffReceive = {
      type: 'desc:handoff-receive',
      receivingSession: exporterReceiverSessionId,
      receivingSide: receiverPeerIdForExporter,
      handoffCount,
      signedGive,
    };
    const receiveBytes = serializeHandoffReceive(handoffReceive);
    const signedReceive = makeWithdrawGiftDescriptor(
      signedGive,
      handoffCount,
      exporterReceiverSessionId,
      receiverPeerIdForExporter,
      receiverKeyForGifter,
    );
    const signedReceiveIsValid = receiverKeyForGifter.publicKey.verify(
      receiveBytes,
      signedReceive.signature,
    );
    t.is(signedReceiveIsValid, true);
  }
});

test('makeOcapnKeyPair', t => {
  const key = makeOcapnKeyPair();
  t.is(key.publicKey.bytes.length, 32);
  t.is(key.publicKey.id.length, 32);
});
