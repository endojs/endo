#!/usr/bin/env node
/**
 * @file Run ESLint over the whole repository in bounded per-bucket batches.
 *
 * A single `eslint .` builds one typescript-eslint project service that must
 * hold every package's TypeScript program at once. Past a scale that this
 * monorepo crosses on large pull requests, that service stops resolving the
 * alphabetically-last packages (packages/where, packages/zip) and reports
 * every file in them as
 *
 *   Parsing error: ... using `parserOptions.project`:
 *   However, none of those TSConfigs include this file.
 *
 * even though each package's tsconfig.json plainly includes those files (they
 * lint clean when the package is linted on its own). It is a project-service
 * scaling ceiling, not a config-glob gap: the whole-repo program drops its
 * tail under memory pressure (the same 53 packages lint green on a small diff
 * and drop their tail only on a large one).
 *
 * Linting one package per process removes the precondition, but at a real
 * cost: each process pays ESLint + typescript-eslint startup afresh, and every
 * package program re-loads the types of its shared `@endo/*` dependencies, so
 * 50-plus processes duplicate a great deal of tsc work (measured on CI: the
 * whole-repo `eslint .` lint job ran ~4m30s; one-package-per-process ran
 * ~6m30s). This script instead lints packages in BUCKETS of a bounded size:
 * each bucket's project service holds only ESLINT_BUCKET_SIZE package programs
 * at once (far under the whole-repo count that drops its tail), while a handful
 * of processes -- not one per package -- amortize startup and let each service
 * share loaded dependency programs across the packages in its bucket. Bounding
 * the bucket by package COUNT (not by a fixed number of buckets) preserves the
 * guarantee that no service ever spans the whole repo regardless of how many
 * packages the monorepo grows to.
 *
 * The batching MUST run each bucket in its own process. typescript-eslint's
 * TypeScript program cache is module-global, so linting the buckets from one
 * process (for example via ESLint's Node API) would accumulate every package's
 * program in a single process and re-cross the very ceiling this script exists
 * to stay under. Each bucket is therefore a fresh `eslint` child process.
 *
 * Coverage matches `eslint .`: the union of the directory arguments across all
 * buckets is exactly `packages/*` plus every top-level non-package directory,
 * the same paths `eslint .` walks -- only the grouping into processes differs.
 * The lint configuration only enables linting under packages/ (the root
 * package.json has no rules and no extra extensions), so the non-package
 * directories carry no lintable files today; they are still linted so that any
 * future root-level source is covered exactly as `eslint .` would have. The
 * root `.eslintignore` applies to every batch. Extra arguments are forwarded
 * to each invocation, so `scripts/eslint-repo.mjs --fix` fixes the whole
 * repository.
 *
 * ESLINT_BUCKET_SIZE (default 10) tunes how many packages share one process.
 * Lower it if a future large pull request ever pressures a bucket into the
 * ceiling; raise it to trade a wider safety margin for fewer processes.
 *
 * Exits non-zero if any batch reports errors.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

const bucketSize = Number(process.env.ESLINT_BUCKET_SIZE) || 10;

// The caller's extra arguments (e.g. --fix) reach us as positional parameters
// and prefix every batch.
const extraArgs = process.argv.slice(2);

// Resolve ESLint's own CLI so the batches do not depend on `eslint` being on
// PATH, and run it under this same node so there is no shell in between.
const eslintPkgPath = require.resolve('eslint/package.json');
const eslintBin = path.resolve(
  path.dirname(eslintPkgPath),
  require(eslintPkgPath).bin.eslint,
);

const dirsIn = name =>
  readdirSync(path.join(repoRoot, name), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

// eslint exits non-zero when a batch matches no lintable files; a package or a
// top-level directory can legitimately be empty of lintable files, so tolerate
// empty batches with --no-error-on-unmatched-pattern and let real lint errors
// set the status.
let ok = true;
const lint = dirs => {
  const { status } = spawnSync(
    process.execPath,
    [eslintBin, '--no-error-on-unmatched-pattern', ...extraArgs, ...dirs],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (status !== 0) {
    ok = false;
  }
};

// One bucket per ESLINT_BUCKET_SIZE workspace packages.
const packages = dirsIn('packages').map(name => `packages/${name}/`);
for (let i = 0; i < packages.length; i += bucketSize) {
  lint(packages.slice(i, i + bucketSize));
}

// One batch for every top-level directory that is not a workspace package.
// Passing directories (not explicit filenames) lets eslint apply the same
// extension and ignore filtering as `eslint .`. Dot-directories are excluded
// to match the shell glob `*/`, which never matched them. These carry no
// lintable files today, so a single batch suffices.
const nonPackages = dirsIn('.')
  .filter(
    name =>
      !name.startsWith('.') && name !== 'packages' && name !== 'node_modules',
  )
  .map(name => `${name}/`);
if (nonPackages.length > 0) {
  lint(nonPackages);
}

process.exit(ok ? 0 : 1);
