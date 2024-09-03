# `@endo/patterns`

The main export from the package is an `M` namespace object, for making a variety of Matchers (hence "M"). For example:

```js
import '@endo/init/debug.js';
import { M, mustMatch } from '@endo/patterns';

const specimen = harden({ foo: 3, bar: 4 });

const pattern = M.splitRecord(
  { foo: M.number() }, // required properties
  { bar: M.string(), baz: M.number() }, // optional
);

mustMatch(specimen, pattern); // throws: 'bar?: number 4 - Must be a string'
```

See {@link PatternMatchers} for more on `M.splitRecord()`, `M.number()`, and other methods.

`M` also has {@link GuardMakers} methods to make {@link InterfaceGuard}s that use Patterns to characterize dynamic behavior such as method argument/response signatures and promise awaiting. The {@link @endo/exo!} package uses `InterfaceGuard`s as the first level of defense for Exo objects against malformed input.

_For best rendering, use the [Endo reference docs](https://endojs.github.io/) site._

## Key Equality, Containers

Builds on [`@endo/pass-style`](https://www.npmjs.com/package/@endo/pass-style) as described in [`kindOf` and `passStyleOf` levels of abstraction](./docs/marshal-vs-patterns-level.md) to define higher level data types as individual refinements of Passable CopyTagged records (PassStyle "tagged"):
   - CopySet -- a collection of unique distinguishable Keys
   - CopyBag -- a collection of entries associating a unique distinguishable Key with a positive integer count (see [Multiset](https://en.wikipedia.org/wiki/Multiset)).
   - CopyMap -- a collection of entries associating a unique distinguishable Key with a Passable
   - Matcher -- a predicate characterizing a subset of Passables, such as "strings" or "8-bit unsigned integer numbers" or "CopyArrays of Remotables"

In support of the above, there is also `compareKeys` and `keyEQ` exposing pass-invariant Key comparison, and two concepts with corresponding TypeScript types:
   - Key -- a Passable arbitrarily deep acyclic data structure in which each non-leaf node is a CopyArray, CopyRecord, CopySet, CopyBag, or CopyMap that is the child of at most one other internal node (forming a possibly-empty tree of containers), and each leaf is either an empty such container or a Passable primitive value or a Remotable (but the same Remotable `r` may be a child of multiple parents, e.g. `{ foo: r, bar: [r] }`). A Key is stable and stably comparable with other Keys via `keyEQ`. Key is the most general data type covering valid contents for CopySets and CopyBags and keys for CopyMaps (the last of which explains the "Key" name).
   - Pattern -- a Passable value that can be used to *match* some subset of Passables. Each Pattern is either a Key that matches itself (and any copy of itself --- `keyEQ` considers identity only for Remotables, where it is shared across all local Presences of the same Remotable), or a Key-like structure in which one or more leaves is a Matcher rather than a primitive or Remotable.
