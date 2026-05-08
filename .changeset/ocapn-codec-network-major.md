---
'@endo/ocapn': major
---

Restructure the OCapN client around mandatory codec injection and a
caller-owned network factory. Clean break from the 1.0.0 public
surface; no deprecation aliases ship with this release.

- `makeClient` is renamed to `makeOcapn`. Embedders that imported
  `makeClient` from `@endo/ocapn` must update the import and the call
  site.
- The `codec` argument is now mandatory. Pass either the bundled
  `cborCodec` (`@endo/ocapn/cbor`) or `syrupCodec`
  (`@endo/ocapn/syrup`); there is no longer a default.
- The `network` argument is now mandatory and replaces the previous
  `registerNetlayer` / `registerSturdyRef` registration calls. Embedders
  construct one network factory (e.g.
  `@endo/ocapn-noise`'s `makeOcapnNoiseNetwork`, or
  `@endo/ocapn/netlayer/ws`'s `makeWebSocketNetLayer`) and pass it to
  `makeOcapn`. `registerNetlayer` and `registerSturdyRef` are removed.
- The `swissnumTable: Map<string, unknown>` constructor argument is
  replaced by a caller-owned `Locator` protocol with a single
  `get(secret) => unknown | Promise<unknown>` method. Existing callers
  that passed a `Map` should wrap it as
  `{ get: secret => map.get(secret) }`.

Embedders that need a soft-migration path can wrap the new API
themselves:

```js
import { makeOcapn } from '@endo/ocapn';
export const makeClient = makeOcapn;
```
