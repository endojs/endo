#!/usr/bin/env zx
/**
 * @file Enforce uniformity of metadata files across every workspace
 * package using packages/skel/ as the template.
 *
 * The checks (all fail closed; non-zero exit on any drift):
 *
 *   1. SECURITY.md is byte-identical to packages/skel/SECURITY.md.
 *   2. LICENSE matches packages/skel/LICENSE modulo the copyright line.
 *      The copyright line must match either the skel placeholder
 *      "Copyright [yyyy] [name of copyright owner]" or the filled form
 *      "Copyright <YYYY> Endo Contributors". This preserves the existing
 *      scripts/set-license-text.sh convention of stamping the package's
 *      creation year into its LICENSE.
 *   3. package.json fields:
 *      - author              matches skel
 *      - license             matches skel
 *      - type                matches skel
 *      - repository.type     matches skel
 *      - repository.url      matches skel
 *      - repository.directory == "packages/<dir>"
 *      - name                ends with "/<dir>" (after the @endo scope)
 *                            or equals "<dir>" for unscoped historical names
 *      - bugs.url            matches skel
 *      - publishConfig.access == "public" (only for packages whose
 *                                          private flag is not true)
 *      - description         is non-empty AND not equal to skel's
 *                            description (skel itself is exempt; skel's
 *                            null value is the placeholder this check
 *                            forbids elsewhere)
 *
 * The skel package is the source of truth and is exempt from the
 * description differs-from-skel check (since skel defines the default
 * the check forbids).
 *
 * This is the JavaScript port of the original scripts/check-package-uniformity.sh
 * (zx-flavored per the workspace's preference for JS over shell for new
 * enforcement scripts).
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const SKEL_REL = 'packages/skel';
const SKEL_ABS = path.join(repoRoot, SKEL_REL);

let exitCode = 0;

/**
 * Report a finding and mark exit non-zero. The message shape mirrors the
 * original shell script: "<pkg>: <what differs>".
 *
 * @param {string} message
 */
const fail = message => {
  console.log(message);
  exitCode = 1;
};

/**
 * @param {string} absPath
 * @returns {Promise<string>}
 */
const sha256OfFile = async absPath => {
  const buf = await readFile(absPath);
  return createHash('sha256').update(buf).digest('hex');
};

/**
 * sha256 of LICENSE body with the canonical copyright line stripped.
 * The shell script does `grep -v '^   Copyright ' LICENSE | sha256sum`.
 *
 * @param {string} absPath
 * @returns {Promise<string>}
 */
const sha256OfLicenseModuloCopyright = async absPath => {
  const text = await readFile(absPath, 'utf8');
  const lines = text.split('\n');
  const filtered = lines.filter(line => !line.startsWith('   Copyright '));
  return createHash('sha256').update(filtered.join('\n')).digest('hex');
};

/**
 * Extract a value at a dotted path from a parsed object, returning '' for any
 * missing intermediate or final value. Mirrors `jq -r '<path> // ""'`.
 *
 * @param {unknown} obj
 * @param {string} dottedPath e.g. ".repository.url"
 * @returns {string}
 */
const fieldAt = (obj, dottedPath) => {
  const parts = dottedPath.replace(/^\./, '').split('.');
  let cursor = obj;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== 'object') return '';
    cursor = /** @type {Record<string, unknown>} */ (cursor)[part];
  }
  if (cursor == null) return '';
  return String(cursor);
};

/**
 * Known historical exceptions: <pkg>:<jq-path>:<allowed-value>.
 *
 * Each entry permits one specific package.json field to deviate from the
 * skel value for a documented reason. Keep this list small and named;
 * every entry needs a comment explaining why.
 */
const EXCEPTIONS = [
  // eslint-plugin is a CommonJS plugin for ESLint v8 (it consumes
  // requireindex and uses __dirname / module.exports). Migrating it
  // to ESM is a substantial refactor; until that lands, the package
  // legitimately ships without a 'type' field (effectively commonjs).
  'packages/eslint-plugin:.type:',
];

/**
 * @param {string} pkg
 * @param {string} path
 * @param {string} actual
 */
const isException = (pkg, path, actual) =>
  EXCEPTIONS.includes(`${pkg}:${path}:${actual}`);

/**
 * @param {string} pkg
 * @param {object} json parsed package.json
 * @param {string} path dotted jq-style path
 * @param {string} expected expected value (as a string; '' for absent)
 */
const assertField = (pkg, json, path, expected) => {
  const actual = fieldAt(json, path);
  if (actual !== expected) {
    if (isException(pkg, path, actual)) return;
    fail(
      `${pkg}: package.json ${path} expected '${expected}' actual '${actual}'`,
    );
  }
};

const main = async () => {
  // Source-of-truth values harvested from skel once.
  const skelSecuritySha = await sha256OfFile(
    path.join(SKEL_ABS, 'SECURITY.md'),
  );
  const skelLicenseNoCopy = await sha256OfLicenseModuloCopyright(
    path.join(SKEL_ABS, 'LICENSE'),
  );
  const skelPackage = JSON.parse(
    await readFile(path.join(SKEL_ABS, 'package.json'), 'utf8'),
  );
  const skelAuthor = fieldAt(skelPackage, '.author');
  const skelLicenseField = fieldAt(skelPackage, '.license');
  const skelType = fieldAt(skelPackage, '.type');
  const skelRepoType = fieldAt(skelPackage, '.repository.type');
  const skelRepoUrl = fieldAt(skelPackage, '.repository.url');
  const skelBugsUrl = fieldAt(skelPackage, '.bugs.url');
  const skelDescription = fieldAt(skelPackage, '.description');

  // Collect every workspace package (every packages/<dir>/package.json),
  // sorted to match the shell script's `find ... | sort` order.
  const packagesDir = path.join(repoRoot, 'packages');
  const dirents = await readdir(packagesDir, { withFileTypes: true });
  /** @type {string[]} */
  const pkgs = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const pkgRel = `packages/${dirent.name}`;
    try {
      await stat(path.join(repoRoot, pkgRel, 'package.json'));
      pkgs.push(pkgRel);
    } catch {
      // No package.json in this directory; skip it (matches the shell
      // script's `find -name 'package.json'` filter).
    }
  }
  pkgs.sort();

  // --- SECURITY.md byte-identical to skel --------------------------------
  for (const pkg of pkgs) {
    const securityPath = path.join(repoRoot, pkg, 'SECURITY.md');
    try {
      await stat(securityPath);
    } catch {
      fail(`${pkg}: missing SECURITY.md`);
      continue;
    }
    const hash = await sha256OfFile(securityPath);
    if (hash !== skelSecuritySha) {
      fail(
        `${pkg}: SECURITY.md differs from ${SKEL_REL}/SECURITY.md (sha256 ${hash} vs ${skelSecuritySha})`,
      );
    }
  }

  // --- LICENSE matches skel modulo the copyright line --------------------
  for (const pkg of pkgs) {
    const licensePath = path.join(repoRoot, pkg, 'LICENSE');
    try {
      await stat(licensePath);
    } catch {
      fail(`${pkg}: missing LICENSE`);
      continue;
    }
    const noCopyHash = await sha256OfLicenseModuloCopyright(licensePath);
    if (noCopyHash !== skelLicenseNoCopy) {
      fail(
        `${pkg}: LICENSE body differs from ${SKEL_REL}/LICENSE (ignoring copyright line)`,
      );
      continue;
    }
    const licenseText = await readFile(licensePath, 'utf8');
    const copyLine =
      licenseText.split('\n').find(line => line.startsWith('   Copyright ')) ||
      '';
    if (
      !/^ {3}Copyright (\[yyyy\] \[name of copyright owner\]|[0-9]{4} Endo Contributors)$/.test(
        copyLine,
      )
    ) {
      fail(`${pkg}: LICENSE copyright line not canonical: ${copyLine}`);
    }
  }

  // --- package.json field uniformity -------------------------------------
  for (const pkg of pkgs) {
    const jsonPath = path.join(repoRoot, pkg, 'package.json');
    const dirName = path.basename(pkg);
    const json = JSON.parse(await readFile(jsonPath, 'utf8'));

    assertField(pkg, json, '.author', skelAuthor);
    assertField(pkg, json, '.license', skelLicenseField);
    assertField(pkg, json, '.type', skelType);
    assertField(pkg, json, '.repository.type', skelRepoType);
    assertField(pkg, json, '.repository.url', skelRepoUrl);
    assertField(pkg, json, '.repository.directory', `packages/${dirName}`);
    assertField(pkg, json, '.bugs.url', skelBugsUrl);

    // name: either "@<scope>/<dir>" or unscoped "<dir>".
    const actualName = fieldAt(json, '.name');
    if (actualName !== dirName && !actualName.endsWith(`/${dirName}`)) {
      fail(
        `${pkg}: package.json .name '${actualName}' does not end with directory '${dirName}'`,
      );
    }

    // publishConfig.access: required to be "public" for non-private
    // packages.
    const isPrivate = fieldAt(json, '.private') === 'true';
    if (!isPrivate) {
      assertField(pkg, json, '.publishConfig.access', 'public');
    }

    // description: non-empty and not equal to skel's default. Skel itself
    // is exempt because skel defines the default the check forbids.
    if (pkg !== SKEL_REL) {
      const actualDesc = fieldAt(json, '.description');
      if (actualDesc === '') {
        fail(`${pkg}: package.json .description is empty`);
      } else if (actualDesc === skelDescription) {
        fail(
          `${pkg}: package.json .description matches skel's default ('${skelDescription}')`,
        );
      }
    }
  }

  process.exit(exitCode);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
