User-visible changes in `@endo/patterns`:

# Next release

- The `sloppy` option for `@endo/patterns` interface guards is deprecated. Use `defaultGuards` instead.
- `@endo/patterns` now exports a new `getNamedMethodGuards(interfaceGuard)` that returns that interface guard's record of method guards. The motivation is to support interface inheritance expressed by patterns like
   ```js
   const I2 = M.interface('I2', {
     ...getNamedMethodGuards(I1),
     doMore: M.call().returns(M.any()),
   });
   ```
   See `@endo/exo`'s `exo-wobbly-point.test.js` to see it in action together
   with an experiment in class inheritance.

# 1.7.0 (2025-07-11)

- `@endo/marshal` introduces an environment variable config option `ENDO_RANK_STRINGS` to change the rank ordering of strings from the current (incorrect) ordering by UTF-16 code unit used by JavaScript's `<` and `.sort()` operations to (correct and OCapN-conformant) ordering by Unicode code point. It currently defaults to "utf16-code-unit-order", matching the previously-unconditional behavior.
  - `@endo/patterns` provides a `compareKeys` partial order that delegates some ordering, including strings, to the rank ordering provided by `@endo/marshal`. So when the `ENDO_RANK_STRINGS` default is not overridden, then `compareKeys` also follows the (incorrect) UTF-16 code unit order. But when it is overridden, then `compareKeys` also follows the (correct) Unicode code-point order.
- In errors explaining why a specimen does not match a pattern, sometimes the error message contains a quoted form of a nested pattern. This quoting was done with `q`, producing an uninformative rendering of these nested patterns. Now this quoting is done with `qp`, which renders these nested patterns into readable [Justin](https://github.com/endojs/Jessie/blob/main/packages/parse/src/quasi-justin.js) source code.

# v1.5.0 (2025-03-11)

- New pattern: `M.containerHas(elementPatt, bound = 1n)` motivated to support want patterns in Zoe, to pull out only `bound` number of elements that match `elementPatt`. `bound` must be a positive bigint.
- Closely related, `@endo/patterns` now exports `containerHasSplit` to support ERTP's use of `M.containerHas` on non-fungible (`set`, `copySet`) and semifungible (`copyBag`) assets, respectively. See https://github.com/Agoric/agoric-sdk/pull/10952 .
# v1.4.0 (2024-05-06)

- `Passable` is now an accurate type instead of `any`. Downstream type checking may require changes ([example](https://github.com/Agoric/agoric-sdk/pull/8774))
- Some downstream types that take or return `Passable` were changed to `any` to defer downstream work to accomodate.

# v1.2.0 (2024-02-22)

- Add `M.tagged(tagPattern, payloadPattern)` for making patterns that match
  Passable Tagged objects.

# v0.2.6 (2023-09-11)

- Adds support for CopyMap patterns (e.g., `matches(specimen, makeCopyMap([]))`).
