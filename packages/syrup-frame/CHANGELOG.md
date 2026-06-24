# @endo/syrup-frame

## 0.1.1

### Patch Changes

- [#3256](https://github.com/endojs/endo/pull/3256) [`38fe678`](https://github.com/endojs/endo/commit/38fe6787d8187ec6614fc8f2dcb5b08088cbb0d2) Thanks [@kriskowal](https://github.com/kriskowal)! - - New package `@endo/syrup-frame`: a sibling of `@endo/netstring` that
  drops the trailing `,` separator, so each framed payload on the wire
  is literally a Syrup byte-string record (`<length>:<payload>`).
  - Provides `makeSyrupReader` and `makeSyrupWriter` with the
    same shape as the netstring equivalents, including the `chunked`
    zero-copy writer mode.
  - Intended for testing interoperability with the OCapN
    TCP-for-testing protocol, which has moved to adopt this framing.
    The framing is among the protocols under consideration in the
    OCapN pre-standards group at time of writing; the 2025-12-09 OCapN
    plenary recorded the consensus that the TCP-for-testing netlayer
    should carry messages as length-prefixed Syrup byte strings
    (https://github.com/ocapn/ocapn/blob/main/meeting-minutes/2025-12-09.md
    and the parallel discussion on ocapn/ocapn#104).
