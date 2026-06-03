#!/usr/bin/env node
/**
 * @file Diff this branch's `pack:all` tarballs against the previous
 * `prepack`-based packing flow, package-by-package.
 *
 * Usage:
 *   node scripts/compare-pack.mjs [--ref <git-ref>] [--keep] [--only <pkg>...]
 *
 *   --ref <git-ref>   Compare against this ref (default: `master`). The ref
 *                     supplies the legacy pack flow (per-package `prepack` +
 *                     `npm pack`). HEAD supplies the new flow (`yarn pack:all`).
 *   --keep            Keep the temp comparison directory on exit; print its
 *                     path. Useful for spelunking. Default: removed on exit.
 *   --only <pkg>      Only diff these package names (basename of the tarball
 *                     minus `-x.y.z.tgz`). Repeatable.
 *
 * Output format: for each package, prints
 *   - `=== <pkg> ===`
 *   - list of files added / removed (relative to `package/`)
 *   - `diff -u` of every file whose contents differ
 * and finally a one-line summary per package.
 *
 * This is purely diagnostic; it neither publishes nor mutates the working
 * tree. The legacy flow is run in a `git worktree` rooted at a tmpdir, so
 * the current checkout is untouched.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
const popValue = flag => {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const popFlag = flag => {
  const i = args.indexOf(flag);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const collectMulti = flag => {
  const out = [];
  for (;;) {
    const v = popValue(flag);
    if (v === undefined) break;
    out.push(v);
  }
  return out;
};

const ref = popValue('--ref') ?? 'master';
const keep = popFlag('--keep');
const only = new Set(collectMulti('--only'));
if (args.length) {
  process.stderr.write(`unknown args: ${args.join(' ')}\n`);
  process.exit(2);
}

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

// Resolve `yarn` to an absolute path once. `spawn` without `shell: true` does
// not honor shell aliases/functions or per-directory PATH hooks (direnv, nvm,
// vite-plus, volta), so a bare `'yarn'` ENOENTs in setups where the interactive
// shell injects yarn lazily. Pin both worktrees to the same real binary.
const resolveYarn = async () => {
  // 1. vite-plus stashes yarn at a deterministic path keyed by the version in
  //    `package.json#packageManager`. Prefer this so we get the exact pinned
  //    version even when nothing's on PATH.
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const m = /^yarn@(\d[\w.-]*)/.exec(pkg.packageManager ?? '');
  if (m) {
    const vitePlus = path.join(process.env.HOME ?? '', '.vite-plus', 'package_manager', 'yarn', m[1], 'yarn', 'bin', 'yarn');
    if (existsSync(vitePlus)) return vitePlus;
  }
  // 2. Fall back to PATH lookup for contributors not using vite-plus.
  try {
    const { stdout } = await execFileAsync('which', ['yarn']);
    const p = stdout.trim();
    if (p) return p;
  } catch {}
  process.stderr.write('compare-pack: could not find `yarn` (not on PATH and not in ~/.vite-plus)\n');
  process.exit(127);
};
const yarnBin = await resolveYarn();

/** Inherit stdio; reject on non-zero exit. */
const run = (cmd, argv, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${argv.join(' ')} exited with ${code}`)),
    );
  });

/** Capture stdout; reject on non-zero exit. */
const capture = async (cmd, argv, options = {}) => {
  const { stdout } = await execFileAsync(cmd, argv, {
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  return stdout;
};

const workRoot = mkdtempSync(path.join(tmpdir(), 'endo-pack-compare-'));
const legacyRoot = path.join(workRoot, 'legacy-worktree');
const legacyTarballs = path.join(workRoot, 'legacy-tarballs');
const newTarballs = path.join(workRoot, 'new-tarballs');
const extractDir = path.join(workRoot, 'extracted');
mkdirSync(legacyTarballs);
mkdirSync(newTarballs);
mkdirSync(extractDir);

const cleanup = () => {
  if (keep) {
    process.stderr.write(`\n(kept) ${workRoot}\n`);
    return;
  }
  // Worktree must be removed via git so .git/worktrees metadata is cleaned.
  try {
    execFile('git', ['worktree', 'remove', '--force', legacyRoot], { cwd: repoRoot }, () => {});
  } catch {}
  try {
    rmSync(workRoot, { recursive: true, force: true });
  } catch {}
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

// ---- Build legacy tarballs from `--ref` --------------------------------

process.stderr.write(`compare-pack: creating worktree at ${ref}...\n`);
await run('git', ['worktree', 'add', '--detach', legacyRoot, ref], { cwd: repoRoot });

process.stderr.write('compare-pack: yarn install in legacy worktree (this is slow)...\n');
await run(yarnBin, ['install', '--immutable'], { cwd: legacyRoot });

process.stderr.write('compare-pack: running legacy pack flow (prepack + yarn pack)...\n');
// Match what master's CI ran: per-workspace `yarn pack` (which honors
// prepack/postpack hooks). Use `workspaces foreach <subcommand>` rather than
// `exec yarn …` so we don't spawn an inner bare `yarn` — that would ENOENT
// under runtime managers (vite-plus, volta) that don't put yarn on PATH.
await run(
  yarnBin,
  ['workspaces', 'foreach', '--all', '--no-private', '--topological', 'pack', '--out', path.join(legacyTarballs, '%s-%v.tgz')],
  { cwd: legacyRoot },
);

// ---- Build new tarballs from HEAD --------------------------------------

process.stderr.write('compare-pack: running new flow (yarn pack:all)...\n');
await run(yarnBin, ['pack:all'], { cwd: repoRoot });
// pack-all.mjs writes into repoRoot/dist; copy out so a later `pack:all`
// doesn't wipe them (it does `rmSync(distDir)` at start of every run).
for (const name of readdirSync(path.join(repoRoot, 'dist'))) {
  if (!name.endsWith('.tgz')) continue;
  const src = path.join(repoRoot, 'dist', name);
  const dst = path.join(newTarballs, name);
  await execFileAsync('cp', [src, dst]);
}

// ---- Pair tarballs by package name -------------------------------------

/** Strip the `-X.Y.Z[-pre].tgz` suffix to get a stable key. */
const keyOf = filename => filename.replace(/-\d[^/]*\.tgz$/, '');

const indexDir = dir => {
  const out = new Map();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.tgz')) continue;
    out.set(keyOf(name), path.join(dir, name));
  }
  return out;
};

// yarn's `--out` template uses `%s` (name) and `%v` (version), but `%s`
// for a scoped package writes `@scope-name`. ts-node-pack uses
// `scope-name`. Normalize to compare apples to apples.
const normalizeKey = k => k.replace(/^@/, '').replace('/', '-');

const legacyByKey = new Map();
for (const [k, v] of indexDir(legacyTarballs)) legacyByKey.set(normalizeKey(k), v);
const newByKey = new Map();
for (const [k, v] of indexDir(newTarballs)) newByKey.set(normalizeKey(k), v);

const allKeys = new Set([...legacyByKey.keys(), ...newByKey.keys()]);
const keysToProcess = [...allKeys].sort().filter(k => only.size === 0 || only.has(k));

// ---- Per-package diff --------------------------------------------------

const extractInto = async (tgz, dst) => {
  mkdirSync(dst, { recursive: true });
  await execFileAsync('tar', ['xzf', tgz, '-C', dst, '--strip-components=1']);
};

const walk = root => {
  const out = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const abs = path.join(root, rel);
    for (const name of readdirSync(abs)) {
      const childRel = rel ? `${rel}/${name}` : name;
      const childAbs = path.join(abs, name);
      const st = statSync(childAbs);
      if (st.isDirectory()) stack.push(childRel);
      else out.push(childRel);
    }
  }
  return out.sort();
};

const summary = [];

for (const key of keysToProcess) {
  const legacy = legacyByKey.get(key);
  const next = newByKey.get(key);
  console.log(`\n=== ${key} ===`);
  if (!legacy) {
    console.log(`  (new package; only present in HEAD)`);
    summary.push(`${key}: new`);
    continue;
  }
  if (!next) {
    console.log(`  (dropped package; only present in ${ref})`);
    summary.push(`${key}: dropped`);
    continue;
  }
  const legacyExtract = path.join(extractDir, `${key}-legacy`);
  const nextExtract = path.join(extractDir, `${key}-new`);
  await extractInto(legacy, legacyExtract);
  await extractInto(next, nextExtract);

  const legacyFiles = new Set(walk(legacyExtract));
  const nextFiles = new Set(walk(nextExtract));
  const added = [...nextFiles].filter(f => !legacyFiles.has(f)).sort();
  const removed = [...legacyFiles].filter(f => !nextFiles.has(f)).sort();
  const common = [...nextFiles].filter(f => legacyFiles.has(f)).sort();

  if (added.length) console.log('  + ' + added.join('\n  + '));
  if (removed.length) console.log('  - ' + removed.join('\n  - '));

  let changedCount = 0;
  for (const rel of common) {
    // package.json is rewritten by ts-node-pack (workspace: resolution,
    // exports/main re-pointing). Skip its content diff to keep noise down
    // unless --only targets a single package.
    if (rel === 'package.json' && only.size !== 1) continue;
    const a = readFileSync(path.join(legacyExtract, rel));
    const b = readFileSync(path.join(nextExtract, rel));
    if (a.equals(b)) continue;
    changedCount++;
    try {
      await run('diff', ['-u', '--label', `${ref}/${rel}`, '--label', `HEAD/${rel}`, path.join(legacyExtract, rel), path.join(nextExtract, rel)]);
    } catch {
      // diff exits 1 on differences; that's expected.
    }
  }

  summary.push(`${key}: +${added.length} -${removed.length} ~${changedCount}`);
}

console.log('\n=== summary ===');
for (const line of summary) console.log(line);
