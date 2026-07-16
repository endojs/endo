// Checked-in canonical CBOR golden vectors: the phase-1 acceptance fixture for
// `@endo/cbor`. Each entry is `{ diagnostic, hex }` where `hex` is the exact
// canonical byte sequence a canonical writer produces for the value named by
// `diagnostic`, and a strict reader accepts and fully consumes.
//
// This module is the source of truth. Its identical twin,
// `./golden-vectors.json`, is a language-neutral copy checked in for the Rust
// crate (`rust/endo/slots/src/wire/codec.rs`, the byte-identical twin) to mirror
// once the later slots migration wires up the Rust parity CI lane; keep the two
// in sync; the JSON is a hand-maintained mirror of this array.
export const goldenVectors = [
  { diagnostic: 'uint 0', hex: '00' },
  { diagnostic: 'uint 23', hex: '17' },
  { diagnostic: 'uint 24', hex: '1818' },
  { diagnostic: 'uint 255', hex: '18ff' },
  { diagnostic: 'uint 256', hex: '190100' },
  { diagnostic: 'uint 65535', hex: '19ffff' },
  { diagnostic: 'uint 65536', hex: '1a00010000' },
  { diagnostic: 'uint 2^32-1', hex: '1affffffff' },
  { diagnostic: 'uint 2^32', hex: '1b0000000100000000' },
  { diagnostic: 'uint max safe', hex: '1b001fffffffffffff' },
  { diagnostic: 'negative integer -1', hex: '20' },
  { diagnostic: 'byte string', hex: '43010203' },
  { diagnostic: 'text string', hex: '626869' },
  { diagnostic: 'array', hex: '83010203' },
  { diagnostic: 'map', hex: 'a0' },
  { diagnostic: 'tag', hex: 'd90118' },
  { diagnostic: 'false', hex: 'f4' },
  { diagnostic: 'true', hex: 'f5' },
  { diagnostic: 'null', hex: 'f6' },
  { diagnostic: 'undefined', hex: 'f7' },
  { diagnostic: 'canonical NaN', hex: 'fb7ff8000000000000' },
  { diagnostic: 'bignum zero', hex: 'c240' },
  { diagnostic: 'bignum -1', hex: 'c340' },
  { diagnostic: 'bignum 256', hex: 'c2420100' },
];
