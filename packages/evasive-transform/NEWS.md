User-visible changes in `@endo/evasive-transform`:

# v2.0.0 (2025-06-02)

- The `sourceType` option is now restricted to `script` and `module` only.
  Function signature types have changed to be more precise.

# v1.4.0 (2025-03-11)

- Adds a `sourceMap` option so that the generated sourcemap can project back to
  the original source code without `unmapLoc`.
- Removes support for sourcemap `unmapLoc` because it is not used by
  contemporary Endo packages.
  The option is now ignored.

# v1.3.0 (2024-08-27)

- Adds an `elideComments` option to replace the interior of comments with
  minimal blank space with identical cursor advancement behavior.
