---
title: rank-cover
group: Documents
category: Guides
---

# Rank Order and Rank Cover

This guide explains *rank order* and *rank cover*: the machinery Endo uses to
make range queries over passable data efficient, even when the underlying
storage is a key/value store that only knows how to compare strings.

It is intended for developers who are using `@endo/marshal` and
`@endo/patterns` to back an external store (a SQL table, a key/value
database, a sorted file, an Agoric *Store*) with a sorted index of
encoded passables, and who want to answer queries of the form *"which
records match this pattern?"* without scanning the whole index.

Rank cover is an *optimization*. It produces a candidate range that is
**guaranteed** to include every match, but that range may include
extras. The caller still has to filter the candidates against the
original pattern. Rank cover narrows the candidate set; it does not
replace the pattern check.

## Prelude: passable values, briefly

A *passable* is a JavaScript value that may safely cross a vat boundary
or be persisted to a store. The
[`@endo/pass-style`](https://www.npmjs.com/package/@endo/pass-style)
package classifies every passable into one of fourteen *pass styles*
— `null`, `undefined`, `boolean`, `number`, `bigint`, `string`,
`symbol`, `byteArray`, `copyArray`, `copyRecord`, `tagged`,
`remotable`, `error`, `promise` — and that classification is the basis
for all further operations on passable data.

For the purposes of this guide, two facts about passables matter:

1. Every passable has a **canonical string encoding** under
   `@endo/marshal`'s `makePassableKit`/`makeEncodePassable`. The
   encoding is stable, deterministic, and total: two passables that are
   equivalent under distributed equality (`keyEQ`) encode to the same
   string, and every passable encodes to *some* string.

2. The encoding is **rank-order preserving**. If `compareRank(a, b) < 0`
   then `encodePassable(a) < encodePassable(b)` (lexicographic, by
   UTF-16 code unit). The whole point of the encoding format is to push
   rank comparison down into the byte-by-byte string comparison that
   any sorted store already does well.

For deeper background, see the
[`@endo/pass-style` README](../packages/pass-style/README.md), the
[Message Passing guide](./message-passing.md), and
[Passables: `kindOf` and `passStyleOf` levels of abstraction](../packages/patterns/docs/marshal-vs-patterns-level.md).

## Rank order in one paragraph

`compareRank` from `@endo/marshal` is a *total preorder* over all
passables. It is total — any two passables are comparable — and it is
a preorder rather than a strict order, because some distinct passables
tie at the same rank (for example, two different remotables, or two
records that are equivalent under key equality but not identical). The
ordering is arbitrary in places — strings sort after numbers, `NaN` is
the last number, records sort by reverse-sorted property names then by
their values, arrays sort lexicographically — but it is *useful*
because it is consistent with the ordering of encoded strings, and
because *key order* (`compareKeys` from `@endo/patterns`, a
semantically meaningful partial order) is a *refinement* of rank
order. Wherever key order says one key is smaller than another, rank
order agrees; wherever rank order says two values tie, key order says
they are either equal or incomparable. That refinement relationship is
why rank order can be used as a substrate for key-order range queries.

## What is a rank cover?

A `RankCover` is a pair of strings:

```ts
type RankCover = [string, string];
```

interpreted as *encoded* lower and upper bounds. The lower bound is
inclusive; the upper bound is described in `@endo/marshal`'s types as
inclusive, but in practice every cover Endo produces uses a
strictly-greater upper bound such that no valid encoded passable can
land on it — so the distinction does not matter in normal use.

A rank cover for a pattern `P` is a rank cover with this property:

> For every passable `s` that matches `P`,
> `cover[0] <= encodePassable(s) <= cover[1]` (lexicographically).

Every encoded passable that matches the pattern lies between the two
bounds. The converse does **not** hold: some encoded passables in the
range may not match the pattern. Those are the *false positives* that
a post-filter has to discard.

The narrower the cover, the fewer false positives, the less work the
post-filter does. Tightening covers — without ever narrowing them so
much that a real match falls outside — is the central engineering
concern of `getRankCover` and the per-matcher `getRankCover` helpers
in `@endo/patterns`.

## How a range query uses a rank cover

The intended workflow is:

1. **Encode every key** you intend to store using a single
   `encodePassable` from a `makePassableKit`. Persist the encoded
   string as the storage key (or as a sortable column).

2. **Keep the store rank-sorted**. Because the encoding is
   rank-order preserving, sorting by raw byte (or UTF-16 code unit)
   string comparison gives you rank order for free.

3. **Given a query pattern `P`**, compute its rank cover:

   ```js
   import { getRankCover } from '@endo/patterns';
   const [lo, hi] = getRankCover(pattern, encodePassable);
   ```

4. **Ask the store for keys in `[lo, hi]`**. Every key whose encoding
   is in that range is a *candidate*.

5. **Filter the candidates** by running the original pattern against
   the decoded value:

   ```js
   import { matches } from '@endo/patterns';
   for (const encoded of store.range(lo, hi)) {
     const value = decodePassable(encoded);
     if (matches(value, pattern)) {
       yield value;
     }
   }
   ```

The store does the heavy lifting (a logarithmic seek and a linear walk
through the candidate range). The pattern check runs only over the
candidates, not over the whole store.

`@endo/marshal` itself ships the lower-level pieces of the same
machinery — `getIndexCover` turns a `RankCover` into a pair of array
indices for an in-memory rank-sorted array, and `coveredEntries`
iterates the entries within those indices. They are useful when the
"store" is a plain array.

## Why bounds may be loose

Some patterns admit a perfectly tight cover. Some do not. The
looseness of a cover is determined by the structure of the pattern
*and* by the encoding format, not by the implementation:

- **A literal Key** `k` (any passable Key — a primitive, remotable,
  or copy-collection of Keys) has a one-element cover: `[enc, enc]`
  where `enc = encodePassable(k)`. Only values that encode to `enc` —
  by construction, only values that are `keyEQ(_, k)` — fall in the
  range. **No false positives.**

- **A pass-style matcher** like `M.string()` or `M.bigint()` has a
  cover that spans every encoded value of that pass style and *only*
  that pass style. The encoding reserves a distinct prefix character
  per pass style (e.g. `s` for strings, `n`/`p` for negative/positive
  bigints), so the cover for `M.string()` is exactly the range of
  strings beginning with `s`. **No false positives at the type level**;
  any sub-pattern constraints (like `{ maxSize: 100 }`) need a
  post-filter.

- **`M.lte(k)`, `M.gte(k)`, `M.lt(k)`, `M.gt(k)`** produce covers that
  span from the bottom (or up to the top) of the relevant pass style
  to (or from) `encodePassable(k)`. Tight at the cut, loose at the
  open end (which is fine — the open end is the natural extent of the
  pass style). For example, `M.gte(0n)` covers every non-negative
  bigint and nothing else.

- **`M.and(P1, P2, …)`** uses `intersectRankCovers`. Its cover is the
  intersection of the sub-covers — the highest of the lower bounds
  paired with the lowest of the upper bounds. As tight as the
  tightest sub-pattern.

- **`M.or(P1, P2, …)`** uses `unionRankCovers`. Its cover is the
  bounding interval of all sub-covers, which is loose if the
  alternatives live in different pass styles (it has to span all of
  them).

- **A copyArray pattern starting with a run of Keys** —
  `[k1, k2, …, kₙ, M.something()]` — gets a cover that pins down the
  encoded prefix corresponding to those leading keys, and only the
  trailing portion of the cover is loose. This is the case the
  `gibson-3046-narrow-rankcover` work tightens: an array whose first
  position is fixed to a particular Key has a cover much tighter than
  "any copyArray," and that tighter cover propagates through nested
  records and tagged values when the encoding is *embeddable* (a
  property of `compactOrdered` encodings, not `legacyOrdered` ones).

- **`M.any()`, `M.scalar()`, `M.key()`, `M.pattern()`, `M.not(_)`,
  unrecognized tagged values** — fall back to the full passable cover.
  Every encoded passable is in range, and the post-filter does all
  the work. These covers exist for correctness, not for performance.

- **CopyRecord and CopyMap patterns** currently fall back to the
  pass-style cover for that container kind. Tightening these is a
  known TODO in `patternMatchers.js`; the implementation comment
  explains the impedance mismatch.

The general rule: **the more of the pattern that consists of
fixed Keys at the start of an array, the tighter the cover**. Knowing
this lets you structure your stored data to take advantage of it.
For example, if you store entries keyed by
`['transactions', accountId, txId]` and you want to find all
transactions for an account, the pattern
`['transactions', accountId, M.any()]` produces a cover that pins the
two leading keys and only ranges over the trailing position. A pattern
keyed instead on `[txId, accountId, 'transactions']` does not — the
leading position is unbound, so the cover is essentially "any
copyArray" and the post-filter sees the entire account-id-keyed
universe.

## Format choice and the encoding prefix

`@endo/marshal`'s `makePassableKit` accepts a `format` of
`'legacyOrdered'` or `'compactOrdered'`. The two encodings agree on
the rank order they reproduce, but they differ in their string
representation:

- `legacyOrdered` is the older format. Its encoded strings start with
  a per-pass-style prefix character (`s` for strings, `n`/`p` for
  bigints, etc.) and are *not embeddable* — a sub-encoding cannot be
  spliced verbatim into a containing array's encoding.

- `compactOrdered` prefixes every encoded passable with `~` and uses
  a more compact, *embeddable* representation in which the encoding
  of an inner element appears unmodified inside the encoding of an
  outer container. Embeddability is what makes the
  copyArray-with-leading-keys cover tighten precisely: the encoded
  prefix that pins the leading keys can be computed once and reused
  as a literal substring of the cover bounds.

A rank cover that is correct for one format is *not* generally
correct for the other. For this reason:

- `getPassStyleCover(passStyle)` and the constant `FullRankCover`
  (which uses the legacy bounds `['', '{']`) are **deprecated**.
  Both predate the per-format prefix.

- The current API is **`provideStaticRanks(encodePassable)`**. Pass
  in the same `encodePassable` you are using for storage, and you
  get back a record `{ [passStyle]: { index, cover }, '*': { cover } }`
  whose `cover`s are correct for that format. The `'*'` entry is the
  cover for "any passable."

- **`getRankCover(pattern, encodePassable)`** in `@endo/patterns`
  takes the encoding function as its second argument for the same
  reason. Always pass the same one your store is keyed on.

If you are starting fresh, pick `compactOrdered`. The covers are
tighter, the encoded keys are smaller, and inner encodings are
embeddable.

## A worked example

```js
import { makePassableKit } from '@endo/marshal';
import { M, getRankCover, matches } from '@endo/patterns';

const { encodePassable, decodePassable } = makePassableKit({
  format: 'compactOrdered',
});

// A small in-memory rank-sorted store, keyed by encoded passable.
const entries = new Map(); // encoded -> value

const put = value => {
  entries.set(encodePassable(value), value);
};

put(harden(['transactions', 'alice', 1n]));
put(harden(['transactions', 'alice', 2n]));
put(harden(['transactions', 'bob',   1n]));
put(harden(['accounts',     'alice'    ]));

// All Alice's transactions, in any order.
const pattern = harden(['transactions', 'alice', M.bigint()]);

const [lo, hi] = getRankCover(pattern, encodePassable);

// In a real store, this would be an index seek + range scan.
// Here we just sort and walk.
const sortedKeys = [...entries.keys()].sort();
const candidates = sortedKeys.filter(k => k >= lo && k <= hi);

const matched = candidates
  .map(k => entries.get(k))
  .filter(value => matches(value, pattern));

// matched === [
//   ['transactions', 'alice', 1n],
//   ['transactions', 'alice', 2n],
// ]
```

The cover narrows the four-entry store to two candidates without
running the pattern against every entry; the `matches` filter would
only have rejected candidates if the cover were loose.

## API summary

From `@endo/marshal`:

- **`compareRank(a, b)`** — the total preorder over all passables.
- **`sortByRank(iterable, compareRank)`** — produce a rank-sorted
  array.
- **`makePassableKit({ format, ... })`** — build matched
  `encodePassable`/`decodePassable` functions. `format` is
  `'legacyOrdered'` or `'compactOrdered'`.
- **`provideStaticRanks(encodePassable)`** — per-pass-style covers
  (and the full-passable cover, keyed `'*'`) for a given encoding.
- **`unionRankCovers(compareRank, covers)`**,
  **`intersectRankCovers(compareRank, covers)`** — combine covers
  the way `M.or` and `M.and` do internally.
- **`getIndexCover(sortedArray, compareRank, rankCover)`**,
  **`coveredEntries(sortedArray, indexCover)`** — turn a rank cover
  into array indices for an in-memory rank-sorted array.

From `@endo/patterns`:

- **`getRankCover(pattern, encodePassable)`** — the cover of a
  pattern under a given encoding. Always pass the same
  `encodePassable` your store uses.
- **`matches(value, pattern)`**, **`mustMatch(value, pattern)`** —
  the post-filter.

## Things to watch out for

- **Pattern and encoding must agree on format.** A cover computed
  against a `compactOrdered` encoder is meaningless to a
  `legacyOrdered` store, and vice versa. The store's keys, the
  encoder used at write time, and the encoder passed to
  `getRankCover` must all come from the same `makePassableKit`
  configuration (or compatible ones).

- **Always re-check with `matches`.** A cover may include false
  positives by design. Skipping the post-filter will silently return
  non-matching values.

- **`getRankCover` does not validate the pattern.** Pass a
  well-formed pattern (one that `assertPattern` accepts). Garbage in,
  garbage out.

- **CopyRecord and CopyMap pattern covers are not yet tight.** They
  fall back to the cover of "any record" or "any map." If your hot
  path queries records by some leading field, consider modeling the
  data as a copyArray instead — copyArray covers tighten on leading
  Keys.

- **`getPassStyleCover` and `FullRankCover` are deprecated.** Use
  `provideStaticRanks(encodePassable)` instead. Coverage depends on
  the encoding format, and the deprecated APIs predate the
  format-aware cover.
