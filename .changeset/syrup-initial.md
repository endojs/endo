---
'@endo/syrup-frame': patch
---

- New package `@endo/syrup-frame`: a sibling of `@endo/netstring` that
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
