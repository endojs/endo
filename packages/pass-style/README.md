# `@endo/pass-style`

Defines the `Passable` objects, and the `passStyleOf` function for classifying them according to their `PassStyle`.

See [types.js](./src/types.js) for the actual type definitions. See also [CopyRecord guarantees](./doc/copyRecord-guarantees.md) and [CopyArray guarantees](./doc/copyArray-guarantees.md).

The Passable objects are those that can be passed by the `@endo/marshal` package. Thus `Passable` defines the layer of abstraction on which we need broad agreement for interoperability. One type of `Passable` is the `Tagged` object, which is the extension point for defining higher level data types, which do not need such broad agreement. The main such higher layer of abstraction is provided by the `@endo/patterns` package.
