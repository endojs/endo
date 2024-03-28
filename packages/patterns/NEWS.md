User-visible changes in `@endo/patterns`:

# Next release

- JavaScript's relational comparison operators like `<` compare strings by lexicographic UTF16 code unit order, which exposes an internal representational detail not relevant to the string's meaning as a Unicode string.  Previously, `compareKeys` and associated functions compared strings using this JavaScript-native comparison. Now `compareKeys` and associated functions compare strings by lexicographic Unicode Code Point order. ***This change only affects strings containing so-called supplementary characters, i.e., those whose Unicode character code does not fit in 16 bits***.
  - See the NEWS.md of @endo/marshal for more on this change.

# v1.2.0 (2024-02-22)

- Add `M.tagged(tagPattern, payloadPattern)` for making patterns that match
  Passable Tagged objects.

# v0.2.6 (2023-09-11)

- Adds support for CopyMap patterns (e.g., `matches(specimen, makeCopyMap([]))`).
