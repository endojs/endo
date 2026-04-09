#!/usr/bin/env node
/**
 * @file Publish all public workspace tarballs to npm.
 *
 * Replaces the previous `lerna publish from-package` flow. Lerna's
 * from-package mode invokes `npm publish` per workspace dir, which would
 * ship raw `.ts` sources unless we re-introduce a prepack hook. Instead we
 * pre-build tarballs with `ts-node-pack` (via pack-all.mjs) and `npm publish`
 * each one, which is the same model npm itself recommends.
 *
 * Tagging and version bumps are still handled by `lerna version`; this
 * script only owns the publish step. The script honors the standard
 * `NPM_CONFIG_TAG` / `npm_config_tag` env var; pass `--tag <dist-tag>` to
 * override on the command line.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Run a command, inheriting stdio; reject on non-zero exit. */
const run = (cmd, argv, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');

const tagFlag = process.argv.indexOf('--tag');
const tag = tagFlag >= 0 ? process.argv[tagFlag + 1] : process.env.npm_config_tag;

// Always re-pack so the tarballs match HEAD. pack-all.mjs cleans dist/ first.
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

console.error(`release:npm: publishing ${tarballs.length} tarball(s)${tag ? ` with --tag ${tag}` : ''}`);
for (const tgz of tarballs) {
  console.error(`  npm publish ${path.relative(repoRoot, tgz)}`);
  const argv = ['publish'];
  if (tag) argv.push('--tag', tag);
  argv.push(tgz);
  await run('npm', argv, { cwd: repoRoot });
}

console.error('release:npm: done');
