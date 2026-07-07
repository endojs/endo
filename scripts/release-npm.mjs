#!/usr/bin/env node
/**
 * @file Publish all public workspace tarballs to npm.
 *
 * Replaces the previous `lerna publish from-package` flow. Lerna's from-package
 * mode invokes `npm publish` per workspace dir, which would ship raw `.ts`
 * sources unless we re-introduce a prepack hook. Instead we pre-build tarballs
 * with `ts-node-pack` (via pack-all.mjs) and `npm publish` each one, which is
 * the same model npm itself recommends.
 *
 * Tagging and version bumps are handled by Changesets. The script honors the
 * standard `NPM_CONFIG_TAG` / `npm_config_tag` env var; pass `--tag <dist-tag>`
 * to override on the command line.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/**
 * @import {SpawnOptions} from 'node:child_process';
 */

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');

const tagFlag = process.argv.indexOf('--tag');
const tag =
  tagFlag >= 0 ? process.argv[tagFlag + 1] : process.env.npm_config_tag;

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

// Always re-pack so the tarballs match HEAD. pack-all.mjs wipes dist/ at
// the start of every run, so there is no way for a previous run's stale
// or partial output to reach `npm publish`. This is structurally
// equivalent to the old `prepack`/`postpack` lifecycle's invariant that
// every publish recompiled from source, except that here the source tree
// is never mutated and failures leave no residue.
console.error('release:npm: building tarballs via ts-node-pack');
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
  throw new Error('release:npm: no tarballs to publish');
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
    `release:npm: tarball count mismatch — expected ${expectedPackages.length} ` +
      `public workspace(s), found ${tarballs.length} tarball(s) in ${path.relative(repoRoot, distDir)}/. ` +
      `Refusing to publish a partial release.`,
  );
}

console.error(
  `release:npm: publishing ${tarballs.length} tarball(s)${tag ? ` with --tag ${tag}` : ''}`,
);
let publishedCount = 0;
let skippedCount = 0;
for (const tgz of tarballs) {
  const rel = path.relative(repoRoot, tgz);
  const { name, version } = await readTarballManifest(tgz);
  // Idempotency: never attempt to publish a version that is already on the
  // registry. This lets `release:npm` be re-run safely after a partial
  // failure — already-published packages are skipped, the rest go out.
  if (await isPublished(name, version)) {
    console.error(`  skip ${name}@${version} (already published)`);
    skippedCount += 1;
    continue;
  }
  console.error(`  npm publish ${rel}`);
  const argv = ['publish'];
  if (tag) argv.push('--tag', tag);
  argv.push(tgz);
  await run('npm', argv, { cwd: repoRoot });
  publishedCount += 1;
}

console.error(
  `release:npm: done (${publishedCount} published, ${skippedCount} skipped)`,
);
