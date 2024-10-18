
## Invariants

Any Passable value is a possibly-empty tree of `passStyleOf`-level containers (CopyArray, CopyRecord, CopyTagged) in which each node may be extended with an arbitrary number of non-container Passable leaves (an isolated non-container Passable is a sole leaf of an empty tree).
If no leaf is a Capability (i.e., a Remotable or Promise), then the Passable value is Data --- it carries only immutable information, without any connection to external references or unforgeable identity.

Guards do not yet exist as distinct kinds, so we ignore them for now. TODO: Expand this if kinds expand to include guards.

As mentioned above, `keyEQ` is pass-invariant: if passing `xa` from vatA to vatB arrives as `xb`, and likewise `ya` and `yb`, then `keyEQ(xa,ya)` iff `keyEQ(xb,yb)`. And because we do not wish to give Promises, Errors, or unrecognized CopyTagged values any useful pass-invariant equality, a Key may not include any of those.

These conditions all apply to Patterns as well. The differences are:
   * A Pattern can contain Matchers, but a Key cannot. All Keys are Patterns, but Patterns that include Matchers are not Keys.
   * A non-Key value (including a non-Key Pattern), cannot be an element of a CopySet or CopyBag, or a key of a CopyMap.

Patterns are pass-invariant Passable decidable synchronous predicates over Passables that may be used by mutually suspicious parties, and therefore cannot be user-extensible by code predicates. In several ways including this one, Patterns feel much like conventional types.

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
