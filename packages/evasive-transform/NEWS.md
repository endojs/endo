User-visible changes in `@endo/evasive-transform`:

# Next release

- Adds a `sourceMap` option so that the generated sourcemap can project back to
  the original source code without `unmapLoc`.
- Removes support for sourcemap `unmapLoc` because it is not used by
  contemporary Endo packages.
  The option is now ignored.

# v1.3.0 (2024-08-27)

- Adds an `elideComments` option to replace the interior of comments with
  minimal blank space with identical cursor advancement behavior.
