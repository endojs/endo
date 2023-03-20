# Endo ESLint Configurations

This package provides ESLint configuration for use by the other packages.

# Recommended rules

For rules that Endo recommends for other repositories using Endo, extend `plugin:@endo/recommended`.

# Repository rules

The package elint-config is for use by the Endo repository. It goes beyond @endo/recommened with opinions on code formatting and file organization and dependencies on TypeScript and project file structure.

Configuration is mostly static, except for type-aware linting as controlled by
the `ENDO_LINT_TYPES` environment variable because of its impact upon linting
performance.

- `ENDO_LINT_TYPES=NONE`: Linting is type-ignorant.
- `ENDO_LINT_TYPES=SRC`: Linting of "src" directories is type-aware (default,
  increases time ~50%).
- `ENDO_LINT_TYPES=FULL`: Linting of all files is type-aware (increases time
  greatly).

Type-aware linting configures each package to use shared
[TypeScript configuration](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html)
at the top level of the repository unless overridden at package level.

- `jsconfig.eslint-base.json` defines shared base configuration.
- `jsconfig.eslint-src.json` extends base configuration to include files at the
  top of a package and in its "src" directory, and is used by
  `ENDO_LINT_TYPES=SRC`.
- `jsconfig.eslint-full.json` extends base configuration to include files in all
  directories, and is used by `ENDO_LINT_TYPES=FULL`.
