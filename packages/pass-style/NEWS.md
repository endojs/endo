User-visible changes in `@endo/pass-style`:

# Next release

- Previously, all JavaScript strings were considered Passable with `passStyleOf(str) === 'string'`. Now, only well-formed Unicode strings are considered Passable. For all others, `passStyleOf(str)` throws a diagnostic error. This brings us into closer conformance to the OCapN standard, which prohibits sending non-well-formed strings, and requires non-well-formed strings to be rejected when received. Applications that had previously handled non-well-formed strings successfully (even if inadvertantly) may now start experiences these failure.
- Exports `isWellFormedString` and `assertWellFormedString`. Unfortunately the [standard `String.prototype.isWellFormed`](https://tc39.es/proposal-is-usv-string/) first coerces its input to string, leading it to claim that some non-strings are well-formed strings. By contrast, `isWellFormedString` and `assertWellFormedString` will not judge any non-strings to be well-formed strings.

# v1.2.0 (2024-02-22)

- Now supports `AggegateError`, `error.errors`, `error.cause`.
  - A `Passable` error can now include an `error.cause` property whose
    value is a `Passable` error.
  - An `AggregateError` can be a `Passable` error.
  - A `Passable` error can now include an `error.errors` property whose
    value is a `CopyArray` of `Passable` errors.
  - The previously internal `toPassableError` is more general and exported
    for general use. If its error agument is already `Passable`,
    `toPassableError` will return it. Otherwise, it will extract from it
    info for making a `Passable` error, and use `annotateError` to attach
    the original error to the returned `Passable` error as a note. This
    node will show up on the SES `console` as additional diagnostic info
    associated with the returned `Passable` error.
