User-visible changes in `@endo/patterns`:

# Next release

- `Passable` is now an accurate type instead of `any`. Downstream type checking may require changes ([example](https://github.com/Agoric/agoric-sdk/pull/8774))
- Some downstream types that take or return `Passable` were changed to `any` to defer downstream work to accomodate.

# v1.2.0 (2024-02-22)

- Add `M.tagged(tagPattern, payloadPattern)` for making patterns that match
  Passable Tagged objects.

# v0.2.6 (2023-09-11)

- Adds support for CopyMap patterns (e.g., `matches(specimen, makeCopyMap([]))`).
