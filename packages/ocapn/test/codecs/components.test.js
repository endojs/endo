// @ts-check

/** @typedef {import('@endo/eventual-send').Settler} Settler */
/** @typedef {import('../../src/syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../../src/syrup/encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('../../src/syrup/codec.js').SyrupCodec} SyrupCodec */
/** @typedef {import('./_codecs_util.js').CodecTestEntry} CodecTestEntry */

import test from '@endo/ses-ava/prepare-endo.js';

import {
  makeSig,
  makeNode,
  makePubKey,
  exampleSigParamBytes,
  examplePubKeyQBytes,
} from './_syrup_util.js';
import {
  OcapnNodeCodec,
  OcapnPublicKeyCodec,
  OcapnSignatureCodec,
} from '../../src/codecs/components.js';
import { makeTypeHintUnionCodec } from '../../src/syrup/codec.js';
import { makeOcapnListComponentUnionCodec } from '../../src/codecs/util.js';
import { testBidirectionally } from './_codecs_util.js';

/** @type {CodecTestEntry[]} */
const table = [
  {
    syrup: makeSig(exampleSigParamBytes, exampleSigParamBytes),
    value: {
      type: 'sig-val',
      scheme: 'eddsa',
      r: exampleSigParamBytes,
      s: exampleSigParamBytes,
    },
  },
  {
    syrup: makeNode('tcp', '127.0.0.1', false),
    value: {
      type: 'ocapn-node',
      transport: 'tcp',
      address: '127.0.0.1',
      hints: false,
    },
  },
  {
    syrup: makePubKey(examplePubKeyQBytes),
    value: {
      type: 'public-key',
      scheme: 'ecc',
      curve: 'Ed25519',
      flags: 'eddsa',
      q: examplePubKeyQBytes,
    },
  },
];

const OcapnComponentListUnionCodec = makeOcapnListComponentUnionCodec(
  'OcapnComponentListUnionCodec',
  {
    OcapnPublicKeyCodec,
    OcapnSignatureCodec,
  },
);
const OcapnComponentUnionCodec = makeTypeHintUnionCodec(
  'OcapnComponentUnionCodec',
  {
    record: OcapnNodeCodec,
    list: OcapnComponentListUnionCodec,
  },
  {
    object: value => {
      const { type } = value;
      if (type === undefined) {
        throw Error(`Component has no type: ${value}`);
      }
      if (type === 'ocapn-node') {
        return OcapnNodeCodec;
      }

      if (OcapnComponentListUnionCodec.supports(type)) {
        return OcapnComponentListUnionCodec;
      }
      throw Error(`Unknown component type: ${value}`);
    },
  },
);

test('affirmative component cases', t => {
  const codec = OcapnComponentUnionCodec;
  for (const entry of table) {
    testBidirectionally(t, {
      ...entry,
      codec,
    });
  }
});
