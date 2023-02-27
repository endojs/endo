# Next release
* Support type-aware linting by environment variable
  * `ENDO_LINT_TYPES=NONE`: Linting is type-ignorant.
  * `ENDO_LINT_TYPES=SRC`: Linting of "src" directories is type-aware (default,
    increases time ~50%).
  * `ENDO_LINT_TYPES=FULL`: Linting of all files is type-aware (increases time greatly).
