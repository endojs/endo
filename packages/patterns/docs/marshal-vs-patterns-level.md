# Passables: `kindOf`  *vs* `passStyleOf` levels of abstraction

We have three very distinct abstraction levels in our system in which to describe the passable data types and the operations on them. On the left is the higher ***`kindOf`*** level, containing the passable data types and operations of concern to the normal application programmer. A document intended for those application programmers would explain the `kindOf` level in a self contained manner. This is not that document.

In the middle is the lower ***`passStyleOf`*** level of abstraction, which defines the [core data model of the language-independent OCapN protocol]((https://github.com/ocapn/ocapn/issues/5#issuecomment-1549012122)). The `passStyleOf` level provides the data types and operations used to implement the `kindOf` level, but without being specific to the `kindOf` level. The OCapN core data types, the `passStyleOf` level, and the [`@endo/pass-style`](https://www.npmjs.com/package/@endo/pass-style) and [`@endo/marshal`](https://www.npmjs.com/package/@endo/marshal) packages can support independent co-existing higher layers like this `kindOf` level.

On the right is the *JavaScript* level, explaining how these map onto JavaScript language. This mapping determines how JavaScript values round trip or not through the protocol. Only hardened JavaScript values can be passable. The mapping of protocol concepts to JavaScript should serve as an example of how to map the protocol onto the concepts of other languages.

| Operation      | `kindOf` level                            | `passStyleOf` level  | JavaScript level                                            |
| -------------- | ----------------------------------------- | -------------------- | ----------------------------------------------------------- |
| Classification | `kindOf(p)`<br>`M.key()`<br>`M.pattern()` | `passStyleOf(p)`     | `typeof j`                                                  |
| Equivalence    | `keyEQ(k1,k2)`                            |                      | `j1 === j2`<br>`Object.is(j1,j2)`<br>`sameValueZero(j1,j2)` |
| Ordering       | `compareKeys(k1,k2)`<br>`M.gte(k)`        | `compareRank(p1,p2)` | `j1 <= j2`<br>`[...values].sort((j1,j2) => compare(j1,j2))` |

Where the parameters
   * `j`, `j1`, and `j2` are any JavaScript values.
   * `p`, `p1`, and `p2` are any Passables, a subset of JavaScript values.
   * `k`, `k1`, and `k2` are any Keys, a subset of Passables.


## OCapN *vs* Endo `passStyleOf` *vs* JavaScript `typeof`

The OCapN language-independent ocap protocol is in flux. As of May 20 2023, the best draft of the OCapN data model is [the thread starting here](https://github.com/ocapn/ocapn/issues/5#issuecomment-1549012122). Although the Endo `passStyleOf` names differ, the taxonomy and data models will be the same. The [`@endo/pass-style`](https://www.npmjs.com/package/@endo/pass-style) package defines the language binding of this abstract data model to JavaScript language values, which are therefore considered *Passable values*.

|            | OCapN name    | `passStyleOf`        | `typeof`      | JS notes                      |
|------------|---------------|----------------------|---------------|-------------------------------|
| Atoms      |               |                      |               |                               |
|            | Null          | `"null"`             | `"object"`    | null                          |
|            | Undefined     | `"undefined"`        | `"undefined"` |                               |
|            | Boolean       | `"boolean"`          | `"boolean"`   |                               |
|            | Float64       | `"number"`           | `"number"`    | Only one zero, only one NaN   |
|            | SignedInteger | `"bigint"`           | `"bigint"`    |                               |
|            | Symbol        | `"symbol"`           | `"symbol"`    | well-known & registered only (names TBD) |
|            | String        | `"string"`           | `"string"`    | surrogate confusion (TBD)     |
|            | ByteString    | `"byteString"` (TBD) | `"object"`    | UInt8Array (TBD)              |
| Containers |               |                      |               |                               |
|            | Sequence      | `"copyArray"`        | `"object"`    | Array                         |
|            | Struct        | `"copyRecord"`       | `"object"`    | POJO                          |
|            | Tagged        | `"tagged"`           | `"object"`    | Tagged/CopyTagged             |
| Capability |               |                      |               |                               |
|            |               | `"remotable"`        | `"function"`  | Remotable function            |
|            |               | `"remotable"`        | `"object"`    | Remotable object with methods |
|            |               | `"remotable"`        | `"object"`    | Remote Presence               |
|            |               | `"promise"`          | `"object"`    | Promise                       |
| Others     |               |                      |               |                               |
|            | Error         | `"error"`            | `"object"`    | Error                         |

The [`@endo/marshal`](https://www.npmjs.com/package/@endo/marshal) package defines encodings of the data model for purposes of serialization and transmission.
It also defines a "rank order" over all Passable values (a [total preorder](https://en.wikipedia.org/wiki/Weak_ordering) in which different values are always comparable but can be tied for the *same rank*) that can be used for sorting but is not intended to make sense for an application programmer.

The [`@endo/patterns`](https://www.npmjs.com/package/@endo/patterns) package defines the `kindOf` taxonomy, which includes additional containers, Keys and Patterns, and a `compareKeys` [partial order](https://en.wikipedia.org/wiki/Partially_ordered_set) over Keys that is designed to be meaningful and useful to the applications programmer.

## `kindOf` *vs* `passStyleOf`

Only the `passStyleOf` level is assumed for universal interoperability, but `kindOf(p) === passStyleOf(p)` for every non-Tagged Passable value. For a Tagged Passable `p`, `kindOf` may or may not recognize the value as encoding an instance of one of its known higher-level data types. If it is not recognized, then `kindOf(p) === undefined` but the Passable remains valid and must be accurately transmissable by all participants (for example, Alice might send a Tagged that she recognizes to Bob, who does not recognize it but sends it on to Carol who does).

For a Tagged Passable `p` to be recognized, it must carry both a known tag string identifying its kind _and_ a payload that satisfies all constraints associated with that kind. In such cases, `kindOf(p)` returns the tag string.

|              | `kindOf(p)`      | `passStyleOf(p)` | meaning                        |
|--------------|------------------|------------------|--------------------------------|
| non-Tagged   | `passStyleOf(p)` | see above        |                                |
| Containers   |                  |                  |                                |
|              | `"copySet"`      | `"tagged"`       | Set of unique Keys             |
|              | `"copyBag"`      | `"tagged"`       | [Multiset](https://en.wikipedia.org/wiki/Multiset) of Keys (each Key having an associated positive integer count) |
|              | `"copyMap"`      | `"tagged"`       | Dictionary of (Key,Passable) pairs |
| Matchers     | `"match:..."`    | `"tagged"`       | Non-literal Patterns           |
| Guards (TBD) | `"guard:..."`    | `"tagged"`       | Non-Pattern Guards             |
| Just Tagged  | `undefined`      | `"tagged"`       | Not understood to have a kind  |


## Data, Keys, and Patterns

At the `passStyleOf` level, the containers are CopyArray, CopyRecord, and Tagged. Any Passable value is a possibly-empty tree of containers in which each node may be extended with an arbitrary number of non-container Passable leaves (an isolated non-container Passable is a sole leaf of an empty tree).
If no leaf is a Capability (i.e., a Remotable or Promise), then the Passable value is Data --- it carries only immutable information, without any connection to external references or unforgeable identity.

Guards do not yet exist as distinct kinds, so we ignore them for now. TODO: Expand this if kinds expand to include guards.

At the `kindOf` level, the containers are CopyArray, CopyRecord, CopySet, CopyBag, and CopyMap (at this level, Matchers, possibly Guards, and unrecognized Taggeds are _not_ considered containers). The elements of CopySets and CopyBags and the keys of CopyMaps must all be comparable for equality. This subset of Passable values are the Keys. Because the containers are pass-by-copy, this equality must be pass-invariant: If passing `xa` from vatA to vatB arrives as `xb`, and likewise `ya` and `yb`, then `keyEQ(xa,ya)` iff `keyEQ(xb,yb)`. And because we do not wish to give Promises, Errors, or unrecognized Taggeds any useful pass-invariant equality, a Key may not include any of those.

These conditions all apply to Patterns as well. The differences are:
   * A Pattern can contain Matchers, but a Key cannot. All Keys are Patterns, but Patterns that include Matchers are not Keys.
   * A non-Key value (including a non-Key Pattern), cannot be an element of a CopySet or CopyBag, or a key of a CopyMap.

A Pattern is a pass-invariant Passable decidable synchronous predicate over Passables. A Key used as a Pattern matches only exactly itself, according to the pass-invariant `keyEQ` distributed equality semantics. Because Patterns must be pass-invariant, passable between mutually suspicious parties, and usable for synchronous testing of Passables, they cannot be user-extensible by code predicates. In several ways including this one, Patterns feel much like conventional types.

Since CopySets and CopyBags can only contain Keys, they also necessarily are Keys. Maps can contain non-Key values. But a Map that contains only Key values is also a Key. Sets, bags, and maps able to be keys or sets, bags, or maps. But this containment tree must remain a finite tree, without cycles.
