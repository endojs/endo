// @ts-check

import test from '@endo/ses-ava/test.js';

import { Buffer } from 'buffer';
import {
  makeOcapnKeyPair,
  makeSessionId,
  signHandoffGive,
  signHandoffReceive,
  verifyHandoffGiveSignature,
  verifyHandoffReceiveSignature,
} from '../src/cryptography.js';
import {
  makeHandoffGiveDescriptor,
  makeHandoffGiveSigEnvelope,
  makeHandoffReceiveDescriptor,
  makeHandoffReceiveSigEnvelope,
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
  const { key1: gifterKey, sessionId: gifterExporterSessionId } =
    gifterExporterSession;
  const { key2: receiverKey } = gifterReceiverSession;
  const handoffGiveDescriptor = makeHandoffGiveDescriptor(
    receiverKey.publicKey.descriptor,
    {
      type: 'ocapn-peer',
      designator: '127.0.0.1',
      transport: 'tcp',
      hints: false,
    },
    gifterExporterSessionId,
    gifterKey.publicKey.id,
    Buffer.from('gift-id', 'utf8'),
  );
  const handoffGiveSignature = signHandoffGive(
    handoffGiveDescriptor,
    gifterKey,
  );
  const signedHandoffGive = makeHandoffGiveSigEnvelope(
    handoffGiveDescriptor,
    handoffGiveSignature,
  );

  const signedGiveIsValid = verifyHandoffGiveSignature(
    signedHandoffGive.object,
    signedHandoffGive.signature,
    gifterKey.publicKey,
  );
  t.is(signedGiveIsValid, true);

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
    const handoffReceive = makeHandoffReceiveDescriptor(
      signedHandoffGive,
      handoffCount,
      exporterReceiverSessionId,
      receiverPeerIdForExporter,
    );
    const handoffReceiveSignature = signHandoffReceive(
      handoffReceive,
      receiverKeyForGifter,
    );
    const signedHandoffReceive = makeHandoffReceiveSigEnvelope(
      handoffReceive,
      handoffReceiveSignature,
    );

    const signedReceiveIsValid = verifyHandoffReceiveSignature(
      signedHandoffReceive.object,
      signedHandoffReceive.signature,
      receiverKeyForGifter.publicKey,
    );
    t.is(signedReceiveIsValid, true);
  }
});

test('makeOcapnKeyPair', t => {
  const key = makeOcapnKeyPair();
  t.is(key.publicKey.bytes.length, 32);
  t.is(key.publicKey.id.length, 32);
});
