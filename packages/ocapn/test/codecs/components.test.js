// @ts-check

/**
 * @import { CodecTestEntry } from './_codecs_util.js'
 * @import { OcapnLocation, OcapnPublicKeyDescriptor, OcapnSignature } from '../../src/codecs/components.js'
 */

import test from '@endo/ses-ava/test.js';

import {
  OcapnPeerCodec,
  OcapnPublicKeyCodec,
  OcapnSignatureCodec,
} from '../../src/codecs/components.js';
import { makeTypeHintUnionCodec } from '../../src/syrup/codec.js';
import { makeOcapnListComponentUnionCodec } from '../../src/codecs/util.js';
import {
  exampleSigParamBytes,
  examplePubKeyQBytes,
  testBidirectionally,
  AllCodecs,
} from './_codecs_util.js';

/** @type {CodecTestEntry[]} */
const table = [
  {
    name: 'sig-val',
    value: /** @type {OcapnSignature} */ ({
      type: 'sig-val',
      scheme: 'eddsa',
      r: exampleSigParamBytes,
      s: exampleSigParamBytes,
    }),
  },
  {
    name: 'ocapn-peer',
    value: /** @type {OcapnLocation} */ ({
      type: 'ocapn-peer',
      transport: 'tcp',
      designator: '1234',
      hints: { host: '127.0.0.1', port: '54822' },
    }),
  },
  {
    name: 'public-key',
    value: /** @type {OcapnPublicKeyDescriptor} */ ({
      type: 'public-key',
      scheme: 'ecc',
      curve: 'Ed25519',
      flags: 'eddsa',
      q: examplePubKeyQBytes,
    }),
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
    record: OcapnPeerCodec,
    list: OcapnComponentListUnionCodec,
  },
  {
    object: value => {
      const { type } = value;
      if (type === undefined) {
        throw Error(`Component has no type: ${value}`);
      }
      if (type === 'ocapn-peer') {
        return OcapnPeerCodec;
      }

      if (OcapnComponentListUnionCodec.supports(type)) {
        return OcapnComponentListUnionCodec;
      }
      throw Error(`Unknown component type: ${value}`);
    },
  },
);

// Run component tests with all codecs
for (const codec of AllCodecs) {
  test(`affirmative component cases [${codec.name}]`, t => {
    for (const entry of table) {
      testBidirectionally(t, {
        ...entry,
        dataCodec: OcapnComponentUnionCodec,
        codec,
      });
    }
  });
}
