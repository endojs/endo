// @ts-check

/** @typedef {import('../../src/syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../../src/syrup/encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('../../src/syrup/codec.js').SyrupCodec} SyrupCodec */
/** @typedef {import('@endo/eventual-send').Settler} Settler */

import test from '@endo/ses-ava/prepare-endo.js';

import {
  makeSig,
  makeNode,
  makePubKey,
  strToUint8Array,
  record,
  btsStr,
  exampleSigParamBytes,
  examplePubKeyQBytes,
} from './_syrup_util.js';
import {
  OCapNNode,
  OCapNPublicKey,
  OCapNSignature,
  OCapNSturdyRef,
} from '../../src/codecs/components.js';
import {
  makeRecordUnionCodec,
  makeTypeHintUnionCodec,
} from '../../src/syrup/codec.js';
import { makeOCapNListComponentUnionCodec } from '../../src/codecs/util.js';
import { testBidirectionally } from './_codecs_util.js';

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
    syrup: record(
      'ocapn-sturdyref',
      makeNode('tcp', '127.0.0.1', false),
      btsStr('1'),
    ),
    value: {
      type: 'ocapn-sturdyref',
      node: {
        type: 'ocapn-node',
        transport: 'tcp',
        address: '127.0.0.1',
        hints: false,
      },
      swissNum: strToUint8Array('1'),
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

const OCapNComponentRecordUnionCodec = makeRecordUnionCodec(
  'OCapNComponentRecordUnionCodec',
  {
    OCapNNode,
    OCapNSturdyRef,
  },
);
const OCapNComponentListUnionCodec = makeOCapNListComponentUnionCodec(
  'OCapNComponentListUnionCodec',
  {
    OCapNPublicKey,
    OCapNSignature,
  },
);
const OCapNComponentUnionCodec = makeTypeHintUnionCodec(
  'OCapNComponentUnionCodec',
  {
    record: OCapNComponentRecordUnionCodec,
    list: OCapNComponentListUnionCodec,
  },
  {
    object: value => {
      if (value.type === undefined) {
        throw Error(`Component has no type: ${value}`);
      }
      if (OCapNComponentRecordUnionCodec.supports(value.type)) {
        return OCapNComponentRecordUnionCodec;
      }
      if (OCapNComponentListUnionCodec.supports(value.type)) {
        return OCapNComponentListUnionCodec;
      }
      throw Error(`Unknown component type: ${value}`);
    },
  },
);

test('affirmative component cases', t => {
  const codec = OCapNComponentUnionCodec;
  for (const { syrup, value } of table) {
    testBidirectionally(t, { codec, value, syrup });
  }
});
