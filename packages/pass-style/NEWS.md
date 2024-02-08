User-visible changes in `@endo/pass-style`:

# next release

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
