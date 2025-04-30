// @ts-check

import {
  makeExactListCodec as exactList,
  makeExactSelectorCodec as exactSelector,
  makeExpectedLengthBytestringCodec as bytestringWithLength,
} from '../syrup/codec.js';
import {
  makeOCapNListComponentCodec,
  makeOCapNRecordCodecFromDefinition,
} from './util.js';

/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */

/*
 * OCapN Components are used in both OCapN Messages and Descriptors
 */

/**
 * @typedef {object} OCapNLocation
 * @property {'ocapn-node'} type
 * @property {string} transport
 * @property {string} address
 * @property {boolean} hints
 */

export const OCapNNode = makeOCapNRecordCodecFromDefinition(
  'OCapNNodeCodec',
  'ocapn-node',
  {
    transport: 'selector',
    address: 'string',
    // TODO: optional hints table https://github.com/ocapn/ocapn/blob/main/draft-specifications/Locators.md#hints
    hints: 'boolean',
  },
);

export const OCapNSturdyRef = makeOCapNRecordCodecFromDefinition(
  'OCapNSturdyRefCodec',
  'ocapn-sturdyref',
  {
    node: OCapNNode,
    swissNum: 'bytestring',
  },
);

// Used in the location signature in 'op:start-session'
export const OCapNMyLocation = makeOCapNRecordCodecFromDefinition(
  'OCapNMyLocation',
  'my-location',
  {
    location: OCapNNode,
  },
);

const OCapNSignatureEddsaCodec = exactList('OCapNSignatureEddsa', [
  exactSelector('OCapNSignatureEddsaScheme', 'eddsa'),
  exactList('OCapNSignatureEddsaR', [
    exactSelector('OCapNSignatureEddsaRLabel', 'r'),
    bytestringWithLength('OCapNSignatureEddsaRValue', 32),
  ]),
  exactList('OCapNSignatureEddsaS', [
    exactSelector('OCapNSignatureEddsaSLabel', 's'),
    bytestringWithLength('OCapNSignatureEddsaSValue', 32),
  ]),
]);

/**
 * @typedef {object} OCapNSignature
 * @property {'sig-val'} type
 * @property {'eddsa'} scheme
 * @property {Uint8Array} r
 * @property {Uint8Array} s
 */

// ['sig-val ['eddsa ['r r_value] ['s s_value]]]
export const OCapNSignature = makeOCapNListComponentCodec(
  'OCapNSignature',
  'sig-val',
  syrupReader => {
    const [scheme, [_rLabel, r], [_sLabel, s]] =
      OCapNSignatureEddsaCodec.read(syrupReader);
    return { type: 'sig-val', scheme, r, s };
  },
  (value, syrupWriter) => {
    return OCapNSignatureEddsaCodec.write(
      [value.scheme, ['r', value.r], ['s', value.s]],
      syrupWriter,
    );
  },
);

/**
 * @typedef {object} OCapNPublicKeyData
 * @property {'public-key'} type
 * @property {'ecc'} scheme
 * @property {'Ed25519'} curve
 * @property {'eddsa'} flags
 * @property {Uint8Array} q
 */

const OCapNPublicKeyEccCodec = exactList('OCapNPublicKeyEcc', [
  exactSelector('OCapNPublicKeyEccScheme', 'ecc'),
  exactList('OCapNPublicKeyEccCurve', [
    exactSelector('OCapNPublicKeyEccCurveLabel', 'curve'),
    exactSelector('OCapNPublicKeyEccCurveValue', 'Ed25519'),
  ]),
  exactList('OCapNPublicKeyEccFlags', [
    exactSelector('OCapNPublicKeyEccFlagsLabel', 'flags'),
    exactSelector('OCapNPublicKeyEccFlagsValue', 'eddsa'),
  ]),
  exactList('OCapNPublicKeyEccQ', [
    exactSelector('OCapNPublicKeyEccQLabel', 'q'),
    bytestringWithLength('OCapNPublicKeyEccQValue', 32),
  ]),
]);

// ['public-key ['ecc ['curve 'Ed25519] ['flags 'eddsa] ['q q_value]]]
export const OCapNPublicKey = makeOCapNListComponentCodec(
  'OCapNPublicKey',
  'public-key',
  syrupReader => {
    const [scheme, [_curveLabel, curve], [_flagsLabel, flags], [_qLabel, q]] =
      OCapNPublicKeyEccCodec.read(syrupReader);
    return { type: 'public-key', scheme, curve, flags, q };
  },
  (value, syrupWriter) => {
    return OCapNPublicKeyEccCodec.write(
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
