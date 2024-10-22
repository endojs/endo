User-visible changes in `@endo/patterns`:

# v1.4.0 (2024-05-06)

- `Passable` is now an accurate type instead of `any`. Downstream type checking may require changes ([example](https://github.com/Agoric/agoric-sdk/pull/8774))
- Some downstream types that take or return `Passable` were changed to `any` to defer downstream work to accomodate.
- JavaScript's relational comparison operators like `<` compare strings by lexicographic UTF16 code unit order, which exposes an internal representational detail not relevant to the string's meaning as a Unicode string.  Previously, `compareKeys` and associated functions compared strings using this JavaScript-native comparison. Now `compareKeys` and associated functions compare strings by lexicographic Unicode Code Point order. ***This change only affects strings containing so-called supplementary characters, i.e., those whose Unicode character code does not fit in 16 bits***.
  - See the NEWS.md of @endo/marshal for more on this change.

# v1.2.0 (2024-02-22)

- Add `M.tagged(tagPattern, payloadPattern)` for making patterns that match
  Passable Tagged objects.

# v0.2.6 (2023-09-11)

- Adds support for CopyMap patterns (e.g., `matches(specimen, makeCopyMap([]))`).
