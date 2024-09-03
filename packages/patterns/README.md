# `@endo/patterns`

Builds on [`@endo/pass-style`](https://www.npmjs.com/package/@endo/pass-style) as described in [`kindOf` and `passStyleOf` levels of abstraction](./docs/marshal-vs-patterns-level.md) to define higher level data types as individual refinements of Passable CopyTagged records (PassStyle "tagged"):
   - CopySet -- a collection of unique distinguishable Keys
   - CopyBag -- a collection of entries associating a unique distinguishable Key with a positive integer count (see [Multiset](https://en.wikipedia.org/wiki/Multiset)).
   - CopyMap -- a collection of entries associating a unique distinguishable Key with a Passable
   - Matcher -- a predicate characterizing a subset of Passables, such as "strings" or "8-bit unsigned integer numbers" or "CopyArrays of Remotables"

In support of the above, there is also `compareKeys` and `keyEQ` exposing pass-invariant Key comparison, and two concepts with corresponding TypeScript types:
   - Key -- a Passable arbitrarily deep acyclic data structure in which each non-leaf node is a CopyArray, CopyRecord, CopySet, CopyBag, or CopyMap that is the child of at most one other internal node (forming a possibly-empty tree of containers), and each leaf is either an empty such container or a Passable primitive value or a Remotable (but the same Remotable `r` may be a child of multiple parents, e.g. `{ foo: r, bar: [r] }`). A Key is stable and stably comparable with other Keys via `keyEQ`. Key is the most general data type covering valid contents for CopySets and CopyBags and keys for CopyMaps (the last of which explains the "Key" name).
   - Pattern -- a Passable value that can be used to *match* some subset of Passables. Each Pattern is either a Key that matches itself (and any copy of itself --- `keyEQ` considers identity only for Remotables, where it is shared across all local Presences of the same Remotable), or a Key-like structure in which one or more leaves is a Matcher rather than a primitive or Remotable.

The main export from the package is an `M` namespace object, for making a variety of Matchers (hence "M").

`M` can also make _Guards_ that use Patterns to characterize dynamic behavior such as method argument/response signatures and promise awaiting. The [`@endo/exo`](https://www.npmjs.com/package/@endo/exo) package uses InterfaceGuards (each of which maps a collection of method names to their respective method guards) as the first level of defense for Exo objects against malformed input. For example:
```js
const AsyncSerializerI = M.interface('AsyncSerializer', {
  // This interface has a single method, which is async as indicated by M.callWhen().
  // The method accepts a single argument, consumed with an implied `await` as indicated by M.await(),
  // and the result of that implied `await` is allowed to fulfill to any value per M.any().
  // The method result is a string as indicated by M.string(),
  // which is inherently wrapped in a promise by the async nature of the method.
  getStringOf: M.callWhen(M.await(M.any())).returns(M.string()),
});
const asyncSerializer = makeExo('AsyncSerializer', AsyncSerializerI, {
  // M.callWhen() delays invocation of this method implementation
  // while provided argument is in a pending state
  // (i.e., it is a promise that has not yet settled).
  getStringOf(val) { return String(val); },
});

const stringP = asyncSerializer.getStringOf(Promise.resolve(42n));
isPromise(stringP); // => true
await stringP; // => "42"
```

See [types.js](./src/types.js) for the definitions of these new types and (at typedefs `PatternMatchers` and `GuardMakers`) the methods of the exported `M` namespace object.
