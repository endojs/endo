User-visible changes in `@endo/pass-style`:

# Next release

- deprecates `assertChecker`. Use `Fail` in the confirm/reject pattern instead, as supported by `@endo/errors/rejector.js`.

# 1.6.3 (2025-07-11)

- The exported function name `isObject` is ambiguous. It is unclear whether it
  includes functions or not. (It does.) To avoid this confusion, we're
  deprecating `isObject` and suggesting to use the new export `isPrimitive`
  instead, that has the opposite answer. IOW, for all `x`, `isObject(x) ===
  !isPrimitive(x)`

# v1.6.2 (2024-06-17)

- Fixes, without qualification, so that the package initializes on platforms
  that lack `ArrayBuffer.prototype.transferToImmutable` and recognizes
  immutable ArrayBuffers as having a pass-style of `byteArray` on platforms
  have a `sliceToImmutable`, even if that is emulated with a shim using
  `slice`, even if they lack `transferToImmutable`.

# v1.6.1 (2024-06-17)

**BROKEN BUT PATCHED** in 1.6.2, contains a fix but published with broken
dependency versions.
Inadvertently published without amending workspace protocol dependencies.

- Fixes so that the package initializes on platforms that lack
  `ArrayBuffer.prototype.transferToImmutable` and recognizes immutable
  ArrayBuffers as having a pass-style of `byteArray` on platforms have a
  `sliceToImmutable`, even if that is emulated with a shim using `slice`, even
  if they lack `transferToImmutable`.

# v1.6.0 (2024-06-02)

**BROKEN BUT PATCHED** in 1.6.2, this version introduced a dependence on the
underlying platform supporting `ArrayBuffer.prototype.transferToImmutable`.
The patch restores the ability to use `pass-style` on older platforms without
the immutable `ArrayBuffer` shim (as entrained by `ses`).

- Introduces support for `byteArray`.

# v1.4.1 (2024-07-30)

- `deeplyFulfilled` moved from @endo/marshal to @endo/pass-style. @endo/marshal still reexports it, to avoid breaking old importers. But importers should be upgraded to import `deeplyFulfilled` directly from @endo/pass-style.

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
