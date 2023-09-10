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

## Invariants

Any Passable value is a possibly-empty tree of `passStyleOf`-level containers (CopyArray, CopyRecord, CopyTagged) in which each node may be extended with an arbitrary number of non-container Passable leaves (an isolated non-container Passable is a sole leaf of an empty tree).
If no leaf is a Capability (i.e., a Remotable or Promise), then the Passable value is Data --- it carries only immutable information, without any connection to external references or unforgeable identity.

Guards do not yet exist as distinct kinds, so we ignore them for now. TODO: Expand this if kinds expand to include guards.

As mentioned above, `keyEQ` is pass-invariant: if passing `xa` from vatA to vatB arrives as `xb`, and likewise `ya` and `yb`, then `keyEQ(xa,ya)` iff `keyEQ(xb,yb)`. And because we do not wish to give Promises, Errors, or unrecognized CopyTagged values any useful pass-invariant equality, a Key may not include any of those.

These conditions all apply to Patterns as well. The differences are:
   * A Pattern can contain Matchers, but a Key cannot. All Keys are Patterns, but Patterns that include Matchers are not Keys.
   * A non-Key value (including a non-Key Pattern), cannot be an element of a CopySet or CopyBag, or a key of a CopyMap.

Patterns are pass-invariant Passable decidable synchronous predicates over Passables that may be used by mutually suspicious parties, and therefore cannot be user-extensible by code predicates. In several ways including this one, Patterns feel much like conventional types.

### Rank order and key order

The "key order" of `compareKeys` implements a partial order over Keys --- it defines relative position between two Keys but leaves some pairs incomparable (for example, subsets over sets is a partial order in which {} precedes {x} and {y}, which are mutually incomparable but both precede {x, y}).
It is co-designed with the "rank order" (a total preorder) of `compareRank` from [`@endo/marshal`](https://www.npmjs.com/package/@endo/marshal) to support efficient range search for Key-based queries (for example, finding all entries in a map for which the key is a CopyRecord with particular fields can be implemented by selecting from rank-ordered keys those that are CopyRecords whose lexicographically greatest field is at least as big as the lexicographically greatest required field, and then filtering out matched keys that don't have the necessary shape).
Both functions use -1, 0, and 1 to respectively mean "less than", "equivalent to", and "greater than".
NaN means "incomparable" --- the first key is not less, equivalent, or greater than the second.
To keep the orders distinct when speaking informally, we use "earlier" and "later" for rank order, and "smaller" and "bigger" for key order.

The key ordering of `compareKeys` refines the rank ordering of `compareRank` but leaves gaps for which a more complete "full order" relies upon rank ordering:
1. `compareKeys(X,Y) === 0` implies that `compareRank(X,Y) === 0` --- if X
   is equivalent to Y in key order, then X is equivalent to Y in rank order.
   But the converse does not hold; for example, Remotables `Far('X')` and
   `Far('Y')` are equivalent in rank order but incomparable in key order.
2. `compareKeys(X,Y) < 0` implies that `compareRank(X,Y) < 0` --- if X is
   smaller than Y in key order, then X is earlier than Y in rank order.
   But the converse does not hold; for example, the record `{b: 3, a: 5}`
   is earlier than the record `{b: 5, a: 3}` in rank order but they are
   incomparable in key order.
3. `compareRank(X,Y) === 0` implies that `compareKeys(X,Y)` is either
   0 or NaN --- Keys within the same rank are either equivalent to or
   incomparable to each other in key order. But the converse does not hold;
   for example, `Far('X')` and `{}` are incomparable in key order but not
   equivalent in rank order.
4. `compareRank(X,Y) === 0` and `compareRank(X,Z) === 0` imply that
   `compareKeys(X,Y)` and `compareKeys(X,Z)` are the same --- all Keys within
   the same rank are either mutually equivalent or mutually incomparable, and
   in fact only in the mutually incomparable case can the rank be said to
   contain more than one key.

## Relationships between types

The set of all primitive values is a strict subset of Data, which is a strict subset of Keys.

The set of all primitive values is also a strict subset of the set of Scalars (which is the union of Primitives and Capabilities [i.e., Remotables and Promises]). The union of primitive values and Remotables is a strict subset of Keys.

Keys is a strict subset of Patterns, which is a strict subset of Passables.

TODO: Include a diagram visually demonstrating the following.

More precisely (using "∪" for union and "∖" for set difference):
* Passables = Containable\<Keys, Patterns ∪ Promises ∪ Errors ∪ UnrecognizedTaggeds>
* Patterns = Containable\<Keys, Keys ∪ Matchers>
* Keys = Containable\<Primitives ∪ Remotables> = Containable\<Scalars ∖ Promises>
* Data = Containable\<Primitives>
* Scalars = Primitives ∪ Capabilities
* Capabilities = Remotables ∪ Promises
* Containable\<_K_> = Containable\<_K_, _K_>
* Containable\<_K_, _V_> = Containable∞\<_K_, _V_>
* Containable₀\<_K_, _V_> = _K_ ∪ _V_
* Containableₙ₊₁\<_K_, _V_> = Containableₙ\<_K_, _V_> ∪ (**C**\<Containableₙ\<_K_, _V_>> where **C** is CopyArray or CopyRecord) ∪ (**C**\<Containableₙ\<_K_, _K_>> where **C** is CopySet or CopyBag) ∪ CopyMap\<Containableₙ\<_K_, _K_>, Containableₙ\<_K_, _V_>>
