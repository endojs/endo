# CI: No npm Lifecycle Scripts

| | |
|---|---|
| **Created** | 2026-04-23 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

GitHub Actions workflows that install dependencies with scripts enabled
give every transitive dependency — and every future transitive
dependency — arbitrary code execution inside the CI runner.
That runner has a checkout of the repository, cached credentials, and,
on release workflows, publish tokens and signing keys.
One compromised `postinstall` in a dependency five levels deep is
enough to exfiltrate secrets, tamper with build artifacts, or push
forged commits.

The risk is not hypothetical.
Supply-chain attacks against the npm ecosystem (event-stream,
ua-parser-js, node-ipc, the 2024 XZ-style typosquatting campaigns)
have repeatedly delivered their payload through lifecycle scripts
rather than through source imports, precisely because lifecycle scripts
run at install time before any source is executed or audited.

Three distinct concerns:

1. **Supply-chain risk.**
   A malicious or accidentally-published `preinstall`, `postinstall`,
   `install`, `prepare`, `prepack`, or `postpack` script runs as the CI
   user the moment `yarn install` or `npm install` touches the package,
   with write access to the workspace and read access to any secret the
   job has mounted.
2. **Reproducibility.**
   Lifecycle scripts are opaque side effects.
   A developer reading a workflow sees `yarn install` and cannot tell
   which compilation, code generation, or download step actually ran.
   The same install command produces different trees depending on
   which versions of which packages are resolved, because each package
   decides its own lifecycle.
3. **Correctness.**
   Implicit `prepack` runs during `yarn install` (in some
   configurations) build packages before the intended build step,
   producing stale artifacts that then shadow the real build output.
   Explicit build steps make the dependency graph between
   code-generation and consumers auditable.

The repository already takes the right position at rest.
`.yarnrc.yml` sets `enableScripts: false` globally; the legacy
`.yarnrc` sets `ignore-scripts true`; the root `package.json` pins
`@lavamoat/preinstall-always-fail` and `@lavamoat/allow-scripts` with a
narrow allowlist (`@ipshipyard/node-datachannel`, `better-sqlite3`) for
the two native addons that genuinely need to build during install.
This design pins that posture down in CI and adds enforcement so the
posture cannot regress silently.

## Design

### Principle

CI workflows must treat lifecycle scripts as untrusted code.
Any work that a lifecycle script would do is moved into an explicit,
named workflow step that a reviewer can see in the workflow file and in
the Actions log.

### Mechanism

Every workflow job that installs Node dependencies sets
`YARN_ENABLE_SCRIPTS=false` (Yarn 4) and
`npm_config_ignore_scripts=true` (npm) in the job's `env:` block.
These belt-and-suspenders settings defend against a future commit that
drops the repo-level `.yarnrc.yml` or `.npmrc` configuration, and
against shell commands that invoke a different package manager than the
workflow author expected.

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    env:
      YARN_ENABLE_SCRIPTS: 'false'
      npm_config_ignore_scripts: 'true'
    steps:
      - uses: actions/checkout@...
      - run: corepack enable
      - uses: actions/setup-node@...
        with:
          node-version: 22.x
          cache: yarn
      - name: Install dependencies
        run: yarn install --immutable
      - name: Rebuild allowlisted native addons
        run: yarn allow-scripts run
      - name: Build
        run: yarn build
```

Three things to notice:

1. The install step runs `yarn install --immutable` with scripts
   disabled by both the repo config and the env var.
2. The two allowlisted native addons are rebuilt in a named step using
   `yarn allow-scripts run`.
   This is the same mechanism `packages/familiar/scripts/make-distributables.mjs`
   already uses locally — see its comment *"Yarn's enableScripts:false
   prevents automatic node-gyp builds, build them on demand since Yarn's
   enableScripts:false skips implicit..."*.
3. Build artifacts come from an explicit `yarn build` (or
   `yarn workspace <x> build`, `yarn workspace <x> bundle`) — never
   from an implicit `prepack` side effect of `yarn install`.

### Pack is explicit, never implicit

Packing for publish must happen in a named step, never as a side effect
of install.
The existing `viable-release` job in `ci.yml` already does this
correctly: it runs `yarn workspaces foreach --all --topological exec
yarn pack` and `yarn lerna run --reject-cycles --concurrency 1 prepack`
as distinct steps after `yarn install --immutable` and `yarn build`.
This pattern is the target for every other workflow that needs to
produce tarballs.

### Native addons

Two packages declare `"built": true` in `dependenciesMeta` and appear
in the lavamoat allowlist:

- `@ipshipyard/node-datachannel`
- `better-sqlite3`

Both are legitimate native-module builds, not arbitrary scripts.
They run through `@lavamoat/allow-scripts`, which checks each entry
against the repo's explicit allowlist before executing.
CI steps that need these addons invoke `yarn allow-scripts run`
explicitly after install, so the binding build is visible in the
Actions log as its own step.

## Audit

Every workflow in `.github/workflows/` at time of writing:

| Workflow | Install command | Status |
|---|---|---|
| `ci.yml` (lint, test, cover, test262, test-hermes, test-async-hooks, test-xs, check-action-pins, test-ocapn-python) | `yarn install --immutable` | OK — inherits `enableScripts: false`; set env var explicitly |
| `ci.yml` (viable-release) | `yarn install --immutable` followed by explicit `yarn pack` and explicit `yarn lerna run prepack` | OK — already the model for this design |
| `release.yml` | `yarn` (bare) | Change to `yarn install --immutable` and add env var |
| `familiar-release.yml` (build-artifacts, make) | `yarn install --immutable` then named `yarn workspace @endo/chat build`, `yarn workspace @endo/familiar bundle`, `yarn workspace @endo/familiar make` | OK — exemplary; add env var for defense in depth |
| `browser-test.yml` | Root: `yarn install` (bare); `browser-test/`: `npm ci --ignore-scripts` | Root bare `yarn install` inherits repo config; tighten to `--immutable` and add env var.  `browser-test/` is already correct and `browser-test/.npmrc` sets `ignore-scripts=true` |
| `depcheck.yml` | No dependency install — runs `scripts/check-dependency-cycles.sh` and `sudo apt install graphviz` | OK — no change needed |
| `typedoc-gh-pages.yml` | `yarn install` (bare) | Change to `yarn install --immutable` and add env var |
| `update-action-pins.yml` | `yarn install --immutable` | OK — add env var |
| `update-action-pins-major.yml` | `yarn install --immutable` | OK — add env var |
| `claude.yml`, `claude-code-review.yml` | No Node install; uses `anthropics/claude-code-action` | OK — no change needed |

No workflow currently relies on an implicit lifecycle script to produce
its build output.
Every build artifact is produced by an explicit `yarn build`,
`yarn workspace ... build`, `yarn workspace ... bundle`,
`yarn workspace ... make`, `yarn docs`, or `yarn pack` step.
This is a light migration: add the env block, tighten `yarn install` to
`yarn install --immutable`, and add an explicit
`yarn allow-scripts run` step to any job that actually exercises
`@ipshipyard/node-datachannel` or `better-sqlite3`.

### Workspace `prepack` scripts

Many packages declare a `prepack` script of the form

```
"prepack": "git clean -fX -e node_modules/ && tsc --build tsconfig.build.json"
```

(see `packages/common`, `packages/nat`, `packages/patterns`,
`packages/ocapn`, `packages/bundle-source`, `packages/evasive-transform`,
`packages/lp32`, `packages/cache-map`, and others).
These are invoked deliberately by `yarn lerna run prepack` in the
`viable-release` job and by humans running `yarn pack`.
They are not invoked implicitly during `yarn install` because the repo
is configured with `enableScripts: false`.
This design does not require renaming them; it requires only that CI
never calls them through a bare `yarn install`.

## Enforcement

Two complementary checks keep the posture from rotting:

### 1. Repository-level lint

`scripts/check-no-ci-lifecycle.mjs` (new) scans
`.github/workflows/*.yml` and fails if:

- Any step runs `yarn install`, `yarn`, `npm install`, `npm i`, or
  `npm ci` without either (a) `--ignore-scripts` on npm, or (b) a job
  or step `env:` block containing `YARN_ENABLE_SCRIPTS: 'false'` and
  `npm_config_ignore_scripts: 'true'`.
- Any step runs `yarn publish`, `npm publish`, or `lerna publish`
  outside of an explicit release workflow whose job name matches a
  small allowlist.
- The checked-in `.yarnrc.yml` no longer contains
  `enableScripts: false`.

The script is run as a new `check-no-ci-lifecycle` job in `ci.yml`,
gated on changes under `.github/`, `.yarnrc.yml`, `.yarnrc`, and
`package.json`.
This mirrors the existing `check-action-pins` job, which runs
`node scripts/update-action-pins.mjs --check-pins` under the same
pattern.

### 2. Positive tripwire

The root `package.json` already pins
`@lavamoat/preinstall-always-fail` and sets
`"@lavamoat/preinstall-always-fail": false` in `lavamoat.allowScripts`.
If any workflow accidentally enables scripts globally, this package's
`preinstall` fires first and fails the install with an obvious error
message, rather than letting a silent supply-chain script run.
This design does not modify that tripwire; it documents it as part of
the layered defense.

## Design Decisions

1. **Disable globally, opt in per package, run in a named step.**
   The combination of `enableScripts: false` (repo-wide), an explicit
   `@lavamoat/allow-scripts` allowlist (per package), and a named
   `yarn allow-scripts run` step (per workflow) means any native-addon
   build is auditable at three layers: the config, the allowlist, and
   the Actions log line.

2. **Belt and suspenders on env vars in CI.**
   `.yarnrc.yml` already sets `enableScripts: false`, so in principle
   the env var is redundant.
   CI sets it anyway because the env var survives deletions of
   `.yarnrc.yml` on branches, survives invocations of `npm` from a
   script that expected `yarn`, and shows up in the workflow file where
   a reviewer will read it.

3. **Prefer `yarn install --immutable` over bare `yarn`.**
   `--immutable` additionally prevents the install from mutating the
   lockfile, which closes off another vector for a malicious PR to
   change what gets resolved.
   `release.yml`, `browser-test.yml`, and `typedoc-gh-pages.yml`
   currently use the bare form and should be tightened.

4. **No attempt to forbid `prepack` in workspace `package.json`s.**
   `prepack` is the correct hook for building typedefs before pack, and
   it runs under human control (via `yarn pack` or `yarn lerna run
   prepack`) as an explicit workflow step.
   The property we want is "CI never calls it implicitly via
   `yarn install`," which is achieved by `enableScripts: false`, not by
   renaming the script.

5. **The `browser-test/` directory uses npm, not yarn.**
   It has its own `package-lock.json`, its own `.npmrc` with
   `ignore-scripts=true`, and the workflow already runs `npm ci
   --ignore-scripts`.
   This is the correct pattern for the npm side and does not need to
   change.

## Dependencies

None.
This design is self-contained and touches only CI configuration and a
single lint script.

## Known Gaps and TODOs

- [ ] Write `scripts/check-no-ci-lifecycle.mjs`.
- [ ] Add `check-no-ci-lifecycle` job to `ci.yml` gated on
      `.github/**`, `.yarnrc.yml`, `.yarnrc`, `package.json`.
- [ ] Add `env:` block with `YARN_ENABLE_SCRIPTS: 'false'` and
      `npm_config_ignore_scripts: 'true'` to every job in `ci.yml`,
      `release.yml`, `familiar-release.yml`, `browser-test.yml`,
      `depcheck.yml`, `typedoc-gh-pages.yml`,
      `update-action-pins.yml`, `update-action-pins-major.yml`.
- [ ] Replace bare `yarn` / `yarn install` with `yarn install
      --immutable` in `release.yml`, `browser-test.yml`, and
      `typedoc-gh-pages.yml`.
- [ ] Audit whether any test job actually exercises
      `@ipshipyard/node-datachannel` or `better-sqlite3` at test time
      and, if so, add an explicit `yarn allow-scripts run` step to that
      job.
      The daemon SQLite migration landed recently, so `daemon` tests
      are the most likely candidate.
- [ ] Document the policy in `CONTRIBUTING.md` alongside the existing
      note about `--ignore-scripts` breaking SES setup.

## Prompt

```
Write a design document at `/home/kris/designer/designs/ci-no-npm-lifecycle.md`
specifying that GitHub Actions workflows must never run npm lifecycle
scripts (preinstall, postinstall, prepare, prepack, etc.) — those
scripts should be treated as supply-chain risk and replaced with
explicit workflow steps.

## What to research before writing

- Read `/home/kris/designer/CLAUDE.md` for project conventions.
- Read `/home/kris/designer/designs/CLAUDE.md` for the design-doc format
  (metadata table, sections, `## Prompt` capturing the original prompt).
- Read `/home/kris/designer/designs/README.md` for how designs are
  organized and to match tone.
- Enumerate ALL workflow files in `/home/kris/designer/.github/workflows/`
  and note each place that may trigger lifecycle scripts — typically
  `yarn install`, `npm install`, `npm ci`, calls to `yarn` plugins, or
  `npm run prepack` inside release steps.
  The monorepo uses Yarn 4 via corepack.
  Check the root `package.json` and a few package `package.json`s for
  `scripts` fields like `prepack`, `prepare`, `postinstall` that CI
  might trigger implicitly.
- Grep for lifecycle-script-triggering commands across workflows:
  `yarn install`, `npm install`, `npm ci`, `npm publish`, `yarn pack`,
  `npm pack`, `yarn workspace`, `lerna publish`.
  For each, identify whether it currently runs a lifecycle script.
- Note relevant Yarn 4 options: `YARN_ENABLE_SCRIPTS=false`,
  `--mode=skip-build`, `enableScripts: false`.
  Note npm equivalents: `--ignore-scripts`,
  `npm_config_ignore_scripts=true`.
- Scan a few representative packages for `scripts` keys that look
  lifecycle-y: `packages/ses/package.json`,
  `packages/compartment-mapper/package.json`,
  `packages/daemon/package.json`, `packages/familiar/package.json`.

## Required output

- Metadata table: **Created** 2026-04-23, **Author**
  `Kris Kowal (prompted)`, **Status** `Not Started`.
- `## What is the Problem Being Solved?` — supply-chain risk (a
  malicious or accidentally-published postinstall script running in CI
  with write access to the repo / secrets); reproducibility (lifecycle
  scripts are opaque side effects); and correctness (implicit builds
  running at wrong moments).
- `## Design` — proposed mechanism: set `YARN_ENABLE_SCRIPTS=false` (or
  equivalent) in all workflows, invoke required build steps explicitly
  as named workflow steps, audit and document each package's build
  entry point.
- `## Migration` or `## Audit` — a section enumerating every workflow
  that currently relies on lifecycle scripts and how each should be
  converted.
- `## Enforcement` — propose a CI check (e.g., a step that fails if any
  workflow step sets up scripts-enabled install) and/or a repo-level
  lint.
- Design decisions, dependencies (none expected), known gaps,
  `## Prompt`.
- Follow CLAUDE.md Markdown Style Guide: wrap 80-100 cols, one sentence
  per line.
- Do NOT edit `designs/README.md`; I will synchronize it after all
  seven design docs land.

Match the tone and depth of a focused infrastructure design like
`designs/gateway-bearer-token-auth.md` or
`designs/daemon-docker-selfhost.md` — not exhaustive, but concrete and
actionable.
```
