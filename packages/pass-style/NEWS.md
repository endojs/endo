User-visible changes in `@endo/pass-style`:

# v1.4.0 (2024-05-06)

- Adds `toThrowable` as a generalization of `toPassableError` that also admits copy data containing passable errors, but still without passable caps, i.e, without remotables or promises. This is in support of the exo boundary throwing only throwables, to ease security review.

# v1.3.0 (2024-03-19)

- Exports `isWellFormedString` and `assertWellFormedString`. Unfortunately the [standard `String.prototype.isWellFormed`](https://tc39.es/proposal-is-usv-string/) first coerces its input to string, leading it to claim that some non-strings are well-formed strings. By contrast, `isWellFormedString` and `assertWellFormedString` will not judge any non-strings to be well-formed strings.
  - Previously, all JavaScript strings were considered Passable with `passStyleOf(str) === 'string'`. Our tentative plan is that only well-formed Unicode strings will be considered Passable. For all others, `passStyleOf(str)` throws a diagnostic error. This would bring us into closer conformance to the OCapN standard, which prohibits sending non-well-formed strings, and requires non-well-formed strings to be rejected when received. Applications that had previously handled non-well-formed strings successfully (even if inadvertantly) may then start experiences these failure. We are also uncertain about the performance impact of this extra check, since it is linear in the size of strings.
  - Thus, in this release we introduce the environment option `ONLY_WELL_FORMED_STRINGS_PASSABLE` as a feature flag. To abstract over this switch, we also export `assertPassableString`. For now, if `ONLY_WELL_FORMED_STRINGS_PASSABLE` environment option is `'enabled'`, then `assertPassableString` is the same as `assertWellFormedString`. Otherwise `assertPassableString` just asserts that `str` is a string. In a bash shell, for example, you could set
      ```sh
      export ONLY_WELL_FORMED_STRINGS_PASSABLE=enabled
      ```
      to turn this feature on.
  - Currently, `ONLY_WELL_FORMED_STRINGS_PASSABLE` defaults to `'disabled'` because we do not yet know the performance impact. Later, if we decide we can afford it, we'll first change the default to `'enabled'` and ultimately remove the switch altogether. Be prepared for these changes.

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
