User-visible changes in `@endo/patterns`:

# Next release

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
