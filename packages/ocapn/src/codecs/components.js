// @ts-check

import {
  makeExactListCodec as exactList,
  makeExactSelectorCodec as exactSelector,
  makeExpectedLengthBytestringCodec as bytestringWithLength,
  makeTypeHintUnionCodec,
  StringCodec,
} from '../syrup/codec.js';
import {
  makeOcapnListComponentCodec,
  makeOcapnRecordCodecFromDefinition,
} from './util.js';
import { FalseCodec, makeStructCodecForValues } from './subtypes.js';

/*
 * OCapN Components are used in both OCapN Messages and Descriptors
 */

// OCapN underspecifies the hints table, assume only strings are valid values
// see https://github.com/ocapn/ocapn/blob/main/draft-specifications/Locators.md#syrup-serialization
const PeerHintsStructCodec = makeStructCodecForValues(
  'OCapnLocationPeerHintsStruct',
  () => StringCodec,
);

/**
 * @typedef {object} OcapnLocation
 * @property {'ocapn-peer'} type
 * @property {string} designator
 * @property {string} transport
 * @property {false | Record<string, any>} hints
 */

export const OcapnPeerCodec = makeOcapnRecordCodecFromDefinition(
  'OcapnNode',
  'ocapn-peer',
  {
    transport: 'selector',
    designator: 'string',
    hints: makeTypeHintUnionCodec(
      'OcapnLocationPeerHintsValue',
      {
        boolean: FalseCodec,
        dictionary: PeerHintsStructCodec,
      },
      {
        boolean: FalseCodec,
        object: PeerHintsStructCodec,
      },
    ),
  },
);

// Used in the location signature in 'op:start-session'
export const OcapnMyLocationCodec = makeOcapnRecordCodecFromDefinition(
  'OcapnMyLocation',
  'my-location',
  {
    location: OcapnPeerCodec,
  },
);

const OcapnSignatureEddsaCodec = exactList('OcapnSignatureEddsa', [
  exactSelector('OcapnSignatureEddsaScheme', 'eddsa'),
  exactList('OcapnSignatureEddsaR', [
    exactSelector('OcapnSignatureEddsaRLabel', 'r'),
    bytestringWithLength('OcapnSignatureEddsaRValue', 32),
  ]),
  exactList('OcapnSignatureEddsaS', [
    exactSelector('OcapnSignatureEddsaSLabel', 's'),
    bytestringWithLength('OcapnSignatureEddsaSValue', 32),
  ]),
]);

/**
 * @typedef {object} OcapnSignature
 * @property {'sig-val'} type
 * @property {'eddsa'} scheme
 * @property {Uint8Array} r
 * @property {Uint8Array} s
 */

// ['sig-val ['eddsa ['r r_value] ['s s_value]]]
export const OcapnSignatureCodec = makeOcapnListComponentCodec(
  'OcapnSignature',
  'sig-val',
  syrupReader => {
    const [scheme, [_rLabel, r], [_sLabel, s]] =
      OcapnSignatureEddsaCodec.read(syrupReader);
    return { type: 'sig-val', scheme, r, s };
  },
  (value, syrupWriter) => {
    return OcapnSignatureEddsaCodec.write(
      [value.scheme, ['r', value.r], ['s', value.s]],
      syrupWriter,
    );
  },
);

/**
 * @typedef {object} OcapnPublicKeyData
 * @property {'public-key'} type
 * @property {'ecc'} scheme
 * @property {'Ed25519'} curve
 * @property {'eddsa'} flags
 * @property {Uint8Array} q
 */

const OcapnPublicKeyEccCodec = exactList('OcapnPublicKeyEcc', [
  exactSelector('OcapnPublicKeyEccScheme', 'ecc'),
  exactList('OcapnPublicKeyEccCurve', [
    exactSelector('OcapnPublicKeyEccCurveLabel', 'curve'),
    exactSelector('OcapnPublicKeyEccCurveValue', 'Ed25519'),
  ]),
  exactList('OcapnPublicKeyEccFlags', [
    exactSelector('OcapnPublicKeyEccFlagsLabel', 'flags'),
    exactSelector('OcapnPublicKeyEccFlagsValue', 'eddsa'),
  ]),
  exactList('OcapnPublicKeyEccQ', [
    exactSelector('OcapnPublicKeyEccQLabel', 'q'),
    bytestringWithLength('OcapnPublicKeyEccQValue', 32),
  ]),
]);

// ['public-key ['ecc ['curve 'Ed25519] ['flags 'eddsa] ['q q_value]]]
export const OcapnPublicKeyCodec = makeOcapnListComponentCodec(
  'OcapnPublicKey',
  'public-key',
  syrupReader => {
    const [scheme, [_curveLabel, curve], [_flagsLabel, flags], [_qLabel, q]] =
      OcapnPublicKeyEccCodec.read(syrupReader);
    return { type: 'public-key', scheme, curve, flags, q };
  },
  (value, syrupWriter) => {
    return OcapnPublicKeyEccCodec.write(
      [
        value.scheme,
        ['curve', value.curve],
        ['flags', value.flags],
        ['q', value.q],
      ],
      syrupWriter,
    );
  },
);
