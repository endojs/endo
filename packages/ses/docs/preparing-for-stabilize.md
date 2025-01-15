# Preparing for the Non-trapping Integrity Trait

The [Stabilize proposal](https://github.com/tc39/proposal-stabilize) is currently at stage 1 of the tc39 process. It proposes three distinct integrity traits whose current placeholder names are:
- ***fixed***: would mitigate the return-override mistake by preventing objects with this trait from being stamped with new class-private-fields.
- ***overridable***: would mitigate the assignment-override mistake by enabling non-writable properties inherited from an object with this trait to be overridden by property assignment on an inheriting object.
- ***non-trapping***: would mitigate proxy-based reentrancy hazards by having a proxy whose target carries this trait never trap to its handler, but rather just perform the default action directly on this non-trapping target.

Draft PR [feat(non-trapping-shim): shim of the non-trapping integrity trait #2673](https://github.com/endojs/endo/pull/2673) is a shim for this non-trapping integrity trait. The names it introduces are placeholders, since the bikeshedding process for these names has not yet concluded.

Draft PR [feat(ses,pass-style): use non-trapping integrity trait for safety #2675](https://github.com/endojs/endo/pull/2675) uses this support for the non-trapping integity trait to mitigate reentrancy attacks from hardened objects, expecially passable copy-data objects like copyLists, copyRecords, and taggeds. To do so, it makes two fundamental changes:
- Where `harden` made the object at every step frozen, that PR changes `harden` to also make those objects non-trapping.
- Where `passStyleOf` checked that objects are frozen, that PR changes `passStyleOf` to also check that those objects are non-trapping.

## How proxy code should prepare

[#2673](https://github.com/endojs/endo/pull/2673) will *by default* produce proxies that refuse to be made non-trapping. An explicit handler trap (perhaps named `stabilize` or `suppressTrapping`) will need to be explicitly provided to make a proxy that allows itself to be made non-trapping. This is the right default, because proxies on frozen almost-empty objects can still have useful trap behavior for their `get`, `set`, `has`, and `apply` traps. Even on a frozen target
- the `get`, `set`, and `has` traps applied to a non-own property name are still general traps that can have useful trapping behavior.
- the `apply` trap can ignore the target's call behavior and just do its own thing.

However, to prepare for these changes, we need to avoid hardening both such proxies and their targets. We need to avoid hardening their target because this will bypass the traps. We need to avoid hardening the proxy because such proxies will *by default* refuse to be made non-trapping, and thus refuse to be hardened.

Some proxies, such as that returned by `E(...)`, exist only to provide such trapping behavior. Their targets will typically be trivial useless empty frozen objects or almost empty frozen functions. Such frozen targets can be safely shared between multiple proxy instances because they are encapsulated within the proxy.
- Before `stabilize`/`suppressTrapping`, this is safe because they are already frozen, and so they cannot be damaged by the proxies that encapsulate them.
- After `stabilize`/`suppressTrapping`, this is safe because the only damage that could be done would be by `stabilize`/`suppressTrapping`. These proxies do not explicitly provide such a trap, and thus will use the default behavior which is to refuse to be made non-trapping.

Because such trivial targets, when safely encapsulated, can be safely shared, their definitions should typically appear at top level of their module.

## How passable objects should prepare

Although we think of `passStyleOf` as requiring its input to be hardened, `passStyleOf` instead checked that each relevant object is frozen. Manually freezing all objects reachable from a root object had been equivalent to hardening that root object. With these changes, even such manual transitive freezing will not make an object passable. To prepare for these changes, use `harden` explicitly instead.
