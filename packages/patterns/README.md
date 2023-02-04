# `@endo/patterns`

Defines new `Passable` data types and their encoding into the `Tagged` objects defined by the `@endo/pass-style` package. The `@endo/pass-style` package defines the lower level of abstraction on which we need broad agreement for interoperability. The higher level data types defined by this package include
   - `CopyMap`, `CopySet`, `CopyBag` -- new container types, in addition to the `CopyArray` and `CopyRecord` already defined by `@endo/pass-style`.
   - a variety of Matchers, for expression patterns that can match over Passables
   - `Key` -- Passables that can be keys in CopyMaps, CopySets, CopyBags, as well as MapStores and SetStores.
   - `Pattern` -- values that *match* some subset of Passables. Includes Matchers along with literal pass-by-copy structures that match theirselves.

The main export from the package is an `M` namespace object, for making a variety of Matchers (hence "M").

`M` can also make _Guards_ that use Patterns to characterize dynamic behavior such as method argument/response signatures and promise awaiting. The `@endo/exo` package uses InterfaceGuards (each of which maps a collection of method names to their respective method guards) as the first level of defense for Exo objects against malformed input. For example:
```js
const asyncSerializerI = M.interface('AsyncSerializer', {
  getStringOf: M.callWhen(M.await(M.any())).returns(M.string()),
});
const asyncSerializer = makeExo('AsyncSerializer', asyncSerializerI, {
  // M.callWhen() delays invocation of this method implementation
  // while externally-provided input is unsettled.
  getStringOf(val) { return String(val); },
});
```

See [types.js](./src/types.js) for the definitions of these new types and (at typedef `PatternMatchers`) the methods of the exported `M` namespace object.
