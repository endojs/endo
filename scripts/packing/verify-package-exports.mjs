#!/usr/bin/env node
/* eslint-disable no-plusplus */
/**
 * @file Verify package export specifiers resolve for consumers.
 *
 * This script checks that each package's export specifiers can be imported
 * by Node (module code executes, so side effects may occur).
 *
 * Usage:
 *   node scripts/packing/verify-package-exports.mjs --mode=packed
 *   node scripts/packing/verify-package-exports.mjs --mode=scm
 *   node scripts/packing/verify-package-exports.mjs --mode=packed --quiet
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';

//#region static config
// Set of package names to skip verification.
// Private packages are skipped automatically.
const unsupportedPackages = new Set([
  '@endo/skel', // template package
]);

const importTimeoutMs = 2000;
//#endregion

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, '..', '..');
const packagesRoot = path.join(repoRoot, 'packages');

const initCwd = process.env.INIT_CWD
  ? path.resolve(process.env.INIT_CWD)
  : null;
const currentCwd = path.resolve(process.cwd());
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    quiet: { type: 'boolean' },
    mode: { type: 'string' },
  },
  strict: true,
  allowPositionals: false,
});
const quiet = values.quiet ?? false;
const mode = values.mode;
if (mode !== 'packed' && mode !== 'scm') {
  throw new Error(
    'verify-package-exports: --mode is required and must be "packed" or "scm"',
  );
}
const packed = mode === 'packed';

const posixPath = path.posix;

const fileListCache = new Map();

const countStars = str => (str.match(/\*/g) || []).length;

const normalizeExportPath = exportPath => {
  if (typeof exportPath !== 'string') return null;
  if (exportPath.startsWith('./')) return exportPath.slice(2);
  if (exportPath.startsWith('/')) return exportPath.slice(1);
  return exportPath;
};

const isToolsPath = relPath =>
  relPath === 'tools' || relPath.startsWith('tools/');

const toPosixPath = p => p.split(path.sep).join('/');

const isObject = value =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isConditionalExports = exportsField =>
  isObject(exportsField) &&
  Object.keys(exportsField).length > 0 &&
  !Object.keys(exportsField).some(key => key.startsWith('.'));

const applyStars = (pattern, parts) => {
  let index = 0;
  return pattern.replace(/\*/g, () => parts[index++] ?? '');
};

const exportTargetPatterns = exportValue => {
  /** @type {string[]} */
  const patterns = [];

  const addValue = value => {
    if (typeof value === 'string') {
      patterns.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(addValue);
      return;
    }
    if (isObject(value)) {
      const { import: importValue, default: defaultValue } = value;
      if (importValue) addValue(importValue);
      if (defaultValue) addValue(defaultValue);
      for (const [key, nested] of Object.entries(value)) {
        if (key === 'types' || key.startsWith('types')) continue;
        if (key === 'import' || key === 'default') continue;
        addValue(nested);
      }
    }
  };

  addValue(exportValue);
  return patterns;
};

const listFiles = async rootDir => {
  if (fileListCache.has(rootDir)) return fileListCache.get(rootDir);
  if (!existsSync(rootDir)) {
    fileListCache.set(rootDir, []);
    return [];
  }

  /** @type {string[]} */
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === 'node_modules') {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  fileListCache.set(rootDir, files);
  return files;
};

const hasGlobChars = pattern => /[*?]/.test(pattern);

const normalizeFilesPattern = pattern => {
  if (pattern.startsWith('./')) return pattern.slice(2);
  return pattern;
};

const filePatternToRegex = pattern => {
  let regex = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        i += 1;
        if (pattern[i + 1] === '/') {
          i += 1;
          regex += '(?:.*\\/)?';
        } else {
          regex += '.*';
        }
      } else {
        regex += '[^/]*';
      }
      continue;
    }
    if (ch === '?') {
      regex += '[^/]';
      continue;
    }
    regex += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${regex}$`);
};

const isJsModuleFile = relPath =>
  relPath.endsWith('.mjs') || relPath.endsWith('.js');

const collectFileSpecifiers = async (pkgDir, pkgJson) => {
  const pkgName = pkgJson.name;
  if (!pkgName) return new Set();

  const filesField = Array.isArray(pkgJson.files) ? pkgJson.files : null;
  const relFiles = (await listFiles(pkgDir)).map(filePath =>
    toPosixPath(path.relative(pkgDir, filePath)),
  );

  let allowed = relFiles;
  if (filesField) {
    const includePatterns = [];
    const excludePatterns = [];
    for (const rawPattern of filesField) {
      if (typeof rawPattern !== 'string') continue;
      const pattern = normalizeFilesPattern(rawPattern.trim());
      if (!pattern) continue;
      const isExclude = pattern.startsWith('!');
      const normalized = isExclude ? pattern.slice(1) : pattern;
      const patternPath = path.join(pkgDir, normalized);
      let expanded = normalized;
      if (normalized.endsWith('/')) {
        expanded = `${normalized}**`;
      } else if (!hasGlobChars(normalized)) {
        try {
          const stat = await fs.stat(patternPath);
          if (stat.isDirectory()) {
            expanded = `${normalized}/**`;
          }
        } catch {
          // ignore missing paths
        }
      }
      const regex = filePatternToRegex(expanded);
      if (isExclude) {
        excludePatterns.push(regex);
      } else {
        includePatterns.push(regex);
      }
    }

    allowed = relFiles.filter(relPath => {
      const matchesInclude =
        includePatterns.length === 0 ||
        includePatterns.some(regex => regex.test(relPath));
      if (!matchesInclude) return false;
      if (excludePatterns.some(regex => regex.test(relPath))) return false;
      return true;
    });
  }

  /** @type {Set<string>} */
  const specifiers = new Set();
  for (const relPath of allowed) {
    if (!isJsModuleFile(relPath)) continue;
    if (isToolsPath(relPath)) continue;
    specifiers.add(`${pkgName}/${relPath}`);
  }

  return specifiers;
};

const patternToRegex = pattern => {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '(.+)');
  return new RegExp(`^${escaped}$`);
};

const expandPatternSpecifiers = async ({
  pkgName,
  pkgDir,
  exportKey,
  exportValue,
}) => {
  /** @type {Set<string>} */
  const specifiers = new Set();
  /** @type {string[]} */
  const errors = [];
  const keyPattern = normalizeExportPath(exportKey);
  if (!keyPattern) return { specifiers, errors };
  if (isToolsPath(keyPattern)) return { specifiers, errors };

  const keyStarCount = countStars(keyPattern);
  const targets = exportTargetPatterns(exportValue);

  if (targets.length === 0) {
    errors.push(
      `${pkgName}: export pattern "${exportKey}" has no runtime target`,
    );
    return { specifiers, errors };
  }

  for (const target of targets) {
    const targetPattern = normalizeExportPath(target);
    if (!targetPattern || !targetPattern.includes('*')) {
      errors.push(
        `${pkgName}: export pattern "${exportKey}" targets "${target}" which is not a pattern`,
      );
      continue;
    }

    const targetStarCount = countStars(targetPattern);
    if (targetStarCount !== keyStarCount) {
      errors.push(
        `${pkgName}: export pattern "${exportKey}" has ${keyStarCount} "*" but target "${target}" has ${targetStarCount}`,
      );
      continue;
    }

    const starIndex = targetPattern.indexOf('*');
    const prefix =
      starIndex === -1 ? targetPattern : targetPattern.slice(0, starIndex);
    const baseDir = posixPath.dirname(prefix);
    const searchDir = baseDir === '.' ? pkgDir : path.join(pkgDir, baseDir);

    const regex = patternToRegex(targetPattern);
    const files = await listFiles(searchDir);

    for (const filePath of files) {
      const relPath = toPosixPath(path.relative(pkgDir, filePath));
      const match = regex.exec(relPath);
      if (!match) continue;
      const parts = match.slice(1);
      const subpath = applyStars(keyPattern, parts);
      if (isToolsPath(subpath)) continue;
      const specifier = subpath === '' ? pkgName : `${pkgName}/${subpath}`;
      specifiers.add(specifier);
    }
  }

  if (specifiers.size === 0) {
    errors.push(
      `${pkgName}: export pattern "${exportKey}" did not match any files`,
    );
  }

  return { specifiers, errors };
};

const collectExportSpecifiers = async (pkgDir, pkgJson) => {
  const pkgName = pkgJson.name;
  const exportsField = pkgJson.exports;
  const mainField = pkgJson.main;

  /** @type {Set<string>} */
  const specifiers = new Set();
  /** @type {string[]} */
  const errors = [];

  if (!exportsField) {
    if (pkgName && mainField) {
      specifiers.add(pkgName);
    }
    const fileSpecifiers = await collectFileSpecifiers(pkgDir, pkgJson);
    for (const specifier of fileSpecifiers) {
      specifiers.add(specifier);
    }
    return { specifiers, errors };
  }

  if (
    typeof exportsField === 'string' ||
    Array.isArray(exportsField) ||
    isConditionalExports(exportsField)
  ) {
    specifiers.add(pkgName);
    return { specifiers, errors };
  }

  for (const [exportKey, exportValue] of Object.entries(exportsField)) {
    if (!exportKey.startsWith('.')) {
      specifiers.add(pkgName);
      continue;
    }

    if (exportKey.includes('*')) {
      const expanded = await expandPatternSpecifiers({
        pkgName,
        pkgDir,
        exportKey,
        exportValue,
      });
      for (const specifier of expanded.specifiers) {
        specifiers.add(specifier);
      }
      errors.push(...expanded.errors);
      continue;
    }

    if (exportKey === '.') {
      specifiers.add(pkgName);
    } else {
      const subpath = normalizeExportPath(exportKey);
      if (subpath && !isToolsPath(subpath)) {
        specifiers.add(`${pkgName}/${subpath}`);
      }
    }
  }

  return { specifiers, errors };
};

const needsJsonImport = specifier =>
  specifier.endsWith('.json') || specifier.endsWith('/package.json');

const runImportAttempt = (specifier, cwd, preload) => {
  const importOptions = needsJsonImport(specifier)
    ? ', { with: { type: "json" } }'
    : '';
  const code = [
    `import(${JSON.stringify(specifier)}${importOptions})`,
    '.catch(err => {',
    '  console.error(err && err.stack ? err.stack : String(err));',
    '  process.exit(1);',
    '});',
  ].join('\n');
  const args = [];
  if (preload) {
    args.push('--import', preload);
  }
  args.push('--input-type=module', '-e', code);

  try {
    execFileSync(process.execPath, args, {
      cwd,
      stdio: 'pipe',
      timeout: importTimeoutMs,
    });
    return { ok: true, error: '' };
  } catch (error) {
    const output = `${error?.stderr || ''}${error?.stdout || ''}`.trim();
    const lines = output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 3);
    const firstLines = lines.join('\n');
    return { ok: false, error: firstLines || error?.message || String(error) };
  }
};

const importSpecifier = (specifier, cwd) => {
  const attempts = [
    { label: 'plain', preload: null },
    { label: 'with-endo', preload: '@endo/init/debug.js' },
  ];
  const errors = [];

  for (const attempt of attempts) {
    const result = runImportAttempt(specifier, cwd, attempt.preload);
    if (result.ok) return;
    errors.push(`${attempt.label}: ${result.error}`);
  }

  throw new Error(errors.join('\n'));
};

const isPackageDir = candidateDir => {
  if (!candidateDir) return false;
  const rel = path.relative(packagesRoot, candidateDir);
  if (rel.startsWith('..') || rel.startsWith(path.sep)) return false;
  if (rel.split(path.sep).length !== 1) return false;
  return existsSync(path.join(candidateDir, 'package.json'));
};

const listPackages = async () => {
  const entries = await fs.readdir(packagesRoot, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(packagesRoot, entry.name))
    .filter(dir => existsSync(path.join(dir, 'package.json')));
};

const readPackageJson = async pkgDir => {
  const pkgPath = path.join(pkgDir, 'package.json');
  const content = await fs.readFile(pkgPath, 'utf-8');
  return JSON.parse(content);
};

const main = async () => {
  let packageDirs;
  if (isPackageDir(initCwd)) {
    packageDirs = [initCwd];
  } else if (isPackageDir(currentCwd)) {
    packageDirs = [currentCwd];
  } else {
    packageDirs = await listPackages();
  }

  const errors = [];
  /** @type {Map<string, string[]>} */
  const successesByPackage = new Map();
  /** @type {Map<string, string[]>} */
  const failuresByPackage = new Map();
  /** @type {Map<string, string[]>} */
  const skippedByPackage = new Map();
  let packageCount = 0;
  let specifierCount = 0;

  for (const pkgDir of packageDirs) {
    const pkgJson = await readPackageJson(pkgDir);
    if (!pkgJson.name) continue;
    if (unsupportedPackages.has(pkgJson.name)) {
      if (!quiet) {
        console.log(
          `verify-package-exports: SKIP ${pkgJson.name} (unsupported)`,
        );
      }
      continue;
    }
    if (pkgJson.private) {
      if (!quiet) {
        console.log(`verify-package-exports: SKIP ${pkgJson.name} (private)`);
      }
      continue;
    }

    packageCount += 1;
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    const { specifiers, errors: exportErrors } = await collectExportSpecifiers(
      pkgDir,
      pkgJson,
    );
    errors.push(...exportErrors);
    if (exportErrors.length > 0) {
      failureCount += exportErrors.length;
      const existing = failuresByPackage.get(pkgJson.name) || [];
      failuresByPackage.set(pkgJson.name, existing.concat(exportErrors));
    }

    if (specifiers.size === 0) {
      continue;
    }

    for (const specifier of specifiers) {
      if (
        specifier.endsWith('entrypoint.js') ||
        specifier.endsWith('/bin.js')
      ) {
        const existing = skippedByPackage.get(pkgJson.name) || [];
        existing.push(specifier);
        skippedByPackage.set(pkgJson.name, existing);
        skippedCount += 1;
        continue;
      }
      specifierCount += 1;
      try {
        importSpecifier(specifier, repoRoot);
        const existing = successesByPackage.get(pkgJson.name) || [];
        existing.push(specifier);
        successesByPackage.set(pkgJson.name, existing);
        successCount += 1;
      } catch (err) {
        const failure = `${specifier} -> ${err.message}`;
        errors.push(`${pkgJson.name}: ${failure}`);
        const existing = failuresByPackage.get(pkgJson.name) || [];
        existing.push(failure);
        failuresByPackage.set(pkgJson.name, existing);
        failureCount += 1;
      }
    }

    if (!quiet) {
      const status = failureCount > 0 ? 'FAIL' : 'PASS';
      console.log(
        `verify-package-exports: ${status} ${pkgJson.name} (${successCount} ok, ${failureCount} failed, ${skippedCount} skipped)`,
      );
    }
  }

  if (!quiet && successesByPackage.size > 0) {
    console.log('verify-package-exports: resolved exports');
    for (const [pkgName, entries] of successesByPackage) {
      console.log(`  ${pkgName}`);
      for (const entry of entries) {
        console.log(`    + ${entry}`);
      }
    }
  }

  if (!quiet && skippedByPackage.size > 0) {
    console.log('verify-package-exports: skipped exports');
    for (const [pkgName, entries] of skippedByPackage) {
      console.log(`  ${pkgName}`);
      for (const entry of entries) {
        console.log(`    ~ ${entry} (entrypoint/bin)`);
      }
    }
  }

  if (failuresByPackage.size > 0) {
    console.error('verify-package-exports: failed exports');
    for (const [pkgName, entries] of failuresByPackage) {
      console.error(`  ${pkgName}`);
      for (const entry of entries) {
        console.error(`    - ${entry}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('verify-package-exports: failures detected');
    console.error(
      `verify-package-exports: ${errors.length} error(s) across ${packageCount} package(s)`,
    );
    process.exit(1);
  }

  console.log(
    `verify-package-exports: checked ${specifierCount} export specifier(s) across ${packageCount} package(s)`,
  );
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
