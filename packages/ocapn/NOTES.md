### TODO:
- [ ] in code TODOs
  - [ ] pass-style-helpers
  - [ ] large fuzzy passable
    // TODO: OCapNReference
    // TODO: OCapNError
  - [ ] Handle "wantsPartial".
  - [ ] TODO: optional hints table https://github.com/ocapn/ocapn/blob/main/draft-specifications/Locators.md#hints
  - [x] compareByteArrays bug?

### hmmmm
- [ ] makeByteArray or byteArrayFrom in pass-style-helpers
- [ ] please use ArrayBuffer for the representation of ByteArray (not Uint8Array)
- [ ] use the name and representation of Symbol instead of Selector.
- [ ] Symbol.asyncIterator (then, constructor) ?
- [ ] OcapnFar: rename your routine Far and moved it into your pass-style utility.
- [ ] syrup/js-representation as model.js or passable.js. ? (No)

### bonus
- [ ] get rid of SignatureData type?
- [ ] codec return types?

### done
- [x] Codec in name
- [x] const toSwissnum = str => textEncoder.encode(str);
- [x] test/codecs/descriptors.test.js
  - Comment on when this dead code either gets deleted or fixed.
