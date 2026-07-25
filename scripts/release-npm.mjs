#!/usr/bin/env node

/**
 * @file Publish all public workspace tarballs to npm.
 *
 * Replaces the previous `lerna publish from-package` flow. Lerna's from-package
 * mode invokes `npm publish` per workspace dir, which would ship raw `.ts`
 * sources and miss generated declarations. Instead we pre-build tarballs with
 * `yarn pack` (after a composite `tsc --build` for declarations) via
 * `pack-all.mjs`, then `npm publish` each one.
 *
 * `pack-all.mjs` temporarily mutates the working tree (emits `.d.ts`, builds
 * `ses/dist/`) and then restores it via `git clean` after packing. The
 * `dist/` directory at the repo root is the only artifact that survives.
 *
 * Tagging and version bumps are handled by Changesets. The script honors the
 * standard `NPM_CONFIG_TAG` / `npm_config_tag` env var; pass `--tag <dist-tag>`
 * to override on the command line.
 *
 * Pass `--dry-run` to forward `--dry-run` to every `npm publish`, exercising
 * the whole flow (install, pack, count check, registry lookups) without
 * uploading anything. Already-published versions are still skipped, so a dry
 * run reports exactly the set of tarballs a real run would upload.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

/**
 * @import {SpawnOptions} from 'node:child_process';
 */

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');

const { values } = parseArgs({
  options: {
    tag: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const tag = values.tag ?? process.env.npm_config_tag;
const dryRun = values['dry-run'];

/**
 * Read `name` and `version` from the package.json inside a published tarball.
 * The tarball is the source of truth for what would be published, so we read
 * it rather than re-deriving from the workspace tree.
 * @param {string} tgz
 * @returns {Promise<{name: string, version: string}>}
 */
const readTarballManifest = async tgz => {
  // npm tarballs place every file under a top-level `package/` directory.
  const { stdout } = await execFileAsync(
    'tar',
    ['-xzOf', tgz, 'package/package.json'],
    { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 },
  );
  const { name, version } = JSON.parse(stdout);
  return { name, version };
};

/**
 * Determine whether `name@version` is already on the npm registry. Treats a
 * missing package (E404) and a published-but-different-version (empty output)
 * alike: only an exact name@version match counts as already published.
 * @param {string} name
 * @param {string} version
 * @returns {Promise<boolean>}
 */
const isPublished = async (name, version) => {
  try {
    const { stdout } = await execFileAsync(
      'npm',
      ['view', `${name}@${version}`, 'version'],
      { cwd: repoRoot, maxBuffer: 1024 * 1024 },
    );
    // npm view exits 0 with empty stdout when the package exists but the
    // requested version does not; a non-empty result means the exact
    // version is on the registry.
    return stdout.trim() !== '';
  } catch {
    // E404 (package name unknown to the registry) or any lookup failure:
    // treat as not-yet-published so the publish below can proceed/report.
    return false;
  }
};

/**
 * Run a command, inheriting stdio; reject on non-zero exit.
 * @param {string} cmd
 * @param {string[]} argv
 * @param {SpawnOptions} options
 */
const run = (cmd, argv, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });

// Ensure the workspace is up to date before packing.
console.error('release-npm: yarn install --immutable');
await run('yarn', ['install', '--immutable'], { cwd: repoRoot });

console.error('release-npm: building tarballs');
await run(process.execPath, [path.join(__dirname, 'pack-all.mjs')], {
  cwd: repoRoot,
});

if (!existsSync(distDir)) {
  throw new Error(`pack-all did not produce ${distDir}`);
}
const tarballs = readdirSync(distDir)
  .filter(name => name.endsWith('.tgz'))
  .map(name => path.join(distDir, name))
  .sort();

if (tarballs.length === 0) {
  throw new Error('release-npm: no tarballs to publish');
}

// Sanity check: one tarball per public workspace, no more and no less.
// Catches a partial pack-all run (e.g. interrupted mid-loop) and any
// drift between what `yarn workspaces list` reports and what
// `pack-all.mjs` actually wrote.
const { stdout: wsStdout } = await execFileAsync(
  'yarn',
  ['workspaces', 'list', '--json', '--no-private'],
  { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 },
);
const expectedPackages = wsStdout
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line))
  .filter(ws => ws.location !== '.');
if (tarballs.length !== expectedPackages.length) {
  throw new Error(
    `release-npm: tarball count mismatch — expected ${expectedPackages.length} ` +
      `public workspace(s), found ${tarballs.length} tarball(s) in ${path.relative(repoRoot, distDir)}/. ` +
      `Refusing to publish a partial release.`,
  );
}

console.error(
  `release-npm: publishing ${tarballs.length} tarball(s)${tag ? ` with --tag ${tag}` : ''}${dryRun ? ' (dry run)' : ''}`,
);
let publishedCount = 0;
let skippedCount = 0;

const publishableTarballs = /** @type {[string, boolean][]} */ (
  await Promise.all(
    tarballs.map(async tgz => {
      const { name, version } = await readTarballManifest(tgz);
      if (await isPublished(name, version)) {
        console.error(`  skip ${name}@${version} (already published)`);
        skippedCount += 1;
        return [tgz, false];
      }
      return [tgz, true];
    }),
  )
)
  .filter(([_, isPublished]) => !!isPublished)
  .map(([tgz]) => tgz);

for (const tgz of publishableTarballs) {
  const rel = path.relative(repoRoot, tgz);
  console.error(`  npm publish ${rel}${dryRun ? ' --dry-run' : ''}`);
  const argv = ['publish'];
  if (tag) argv.push('--tag', tag);
  if (dryRun) argv.push('--dry-run');
  argv.push(tgz);
  await run('npm', argv, { cwd: repoRoot });
  publishedCount += 1;
}

console.error(
  `release-npm: done (${publishedCount} ${dryRun ? 'would be published' : 'published'}, ${skippedCount} skipped)`,
);
