# `@endo/patterns`

Defines new `Passable` data types and their encoding into the `Tagged` objects defined by the `@endo/pass-style` package. The `@endo/pass-style` package defines the lower level of abstraction on which we need broad agreement for interoperability. The higher level data types defined by this package include
   - `CopyMap`, `CopySet`, `CopyBag` -- new container types, in addition to the `CopyArray` and `CopyRecord` already defined by `@endo/pass-style`.
   - a variety of Matchers, for expression patterns that can match over Passables
   - `Key` -- Passables that can be keys in CopyMaps, CopySets, CopyBags, as well as MapStores and SetStores.
   - `Pattern` -- values that *match* some subset of Passables. Includes Matchers along with literal pass-by-copy structures that match theirselves.

The main export from the package is an `M` namespace object, for making a variety of Matchers (hence "M") but also guards, such as the InterfaceGuards used by the `@endo/exo` package to serve as the first level of defense for Exo objects --- those exposed to external messages. The InterfaceGuards use patterns for enforcing type-like restrictions on the arguments and results of these potentially malicious messages.

See [types.js](./src/types.js) for the definitions of these new types and the methods of the exported `M` namespace object.
