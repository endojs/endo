# Syrup

🚧 Work in progress.

[Syrup](https://gitlab.com/spritely/syrup) is an binary object marshalling
codec.

This is a partial implementation of Syrup intended to be future-compatible and
strictly canonical.

- Single point IEEE floating point, with the "F" prefix, is unsupported because
  JavaScript cannot canonically write any kind of floating point number except
  a double precision 64 bit float.
- A future version might introduce `null` or `undefined`, possibly both, either
  as a record kind supported at a higher layer, or as a single character
  optimization.
- A future version might support symbols as JavaScript registered symbols.
- Future versions cannot support Syrup Dictionaries with non-string keys.
- A future version might support Syrup Sets as JavaScript Sets with some
  limitation on what keys are expressible.
- A future version might support Syrup Maps as JavaScript Maps, provided Syrup
  adds a notation for Maps.
  To do this, the Syrup implementation might need to be coupled to
  a higher layer protocol like CapTP, where some record traps are built
  into the codec, since passing a dictionary (with only string keys)
  to a record trap would not be sufficient to express other types of keys.
- A future version might support Syrup records.

The supported encoding consists of:

- Syrup booleans: `t` or `f`,
  as JavaScript `true` and `false`
- Syrup double flonum:
  `D` _big endian IEEE double precision float (64 bits)_,
  as JavaScript `number`
- Syrup signed integers:
  _whole integer_ `+` or _positive int_ `-`,
  like `0+` or `1-`,
  as JavaScript `bigint`
- Syrup byte strings:
  _whole integer byte length prefix_ `:` _bytes_,
  like `3:cat`,
  as JavaScript `Uint8Array`
- Syrup strings:
  _whole integer byte length prefix_ `"` _UTF-8 encoded bytes_,
  like `3"cat`,
  as JavaScript `string`
- Syrup dictionary:
  `{` _zero or more alternating_ _syrup encoded string key_ _syrup encoded any
  value_ `}`,
  as frozen JavaScript record objects
- Syrup lists:
  `[` _zero or more syrup encoded values_ `]`
  as frozen JavaScript arrays
