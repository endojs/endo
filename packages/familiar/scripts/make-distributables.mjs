/**
 * Creates distributable artifacts from the packaged Familiar app.
 *
 * - macOS: DMG (via electron-installer-dmg/appdmg) + zip (via ditto)
 * - Linux: zip
 * - Windows: zip
 */

/* global process */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const familiarDir = path.resolve(dirname, '..');

/**
 * Ensure a native module with a binding.gyp is compiled.
 * Yarn's enableScripts:false prevents automatic node-gyp builds,
 * so we compile on demand when the .node binary is missing.
 *
 * Resolves the module by walking through a chain of package names,
 * since pnpm linker only exposes direct dependencies.
 *
 * @param {string[]} chain - Package chain to resolve, e.g. ['appdmg', 'ds-store', 'macos-alias'].
 *   The last element is the native module to build.
 */
const ensureNativeBuilt = chain => {
  let dir = familiarDir;
  for (const pkg of chain) {
    const req = createRequire(path.join(dir, 'package.json'));
    dir = path.dirname(req.resolve(`${pkg}/package.json`));
  }
  const buildDir = path.join(dir, 'build/Release');
  if (fs.existsSync(buildDir)) return;
  const moduleName = chain[chain.length - 1];
  console.log(`Building native module: ${moduleName}`);
  execSync('npx node-gyp rebuild', { stdio: 'inherit', cwd: dir });
};

const platform = process.platform === 'win32' ? 'win32' : process.platform;
const { arch } = process;

const appDir = path.join(familiarDir, `out/Familiar-${platform}-${arch}`);
if (!fs.existsSync(appDir)) {
  console.error(`Packaged app not found at ${appDir}`);
  console.error('Run the package step first.');
  process.exit(1);
}

const makeDir = path.join(familiarDir, 'out/make');
fs.mkdirSync(makeDir, { recursive: true });

const pkg = JSON.parse(
  fs.readFileSync(path.join(familiarDir, 'package.json'), 'utf8'),
);
const version = pkg.version || '0.0.0';

// --- ZIP ---
const zipName = `Familiar-${version}-${platform}-${arch}.zip`;
const zipPath = path.join(makeDir, zipName);

if (platform === 'darwin') {
  // ditto preserves macOS resource forks and .app bundle structure
  const appBundle = path.join(appDir, 'Familiar.app');
  execSync(
    `ditto -c -k --sequesterRsrc ${JSON.stringify(appBundle)} ${JSON.stringify(zipPath)}`,
    {
      stdio: 'inherit',
    },
  );
} else {
  execSync(`zip -r -y ${JSON.stringify(zipPath)} .`, {
    stdio: 'inherit',
    cwd: appDir,
  });
}
console.log(`Created: out/make/${zipName}`);

// --- DMG (macOS only) ---
if (platform === 'darwin') {
  const dmgName = `Familiar-${version}.dmg`;
  const appBundle = path.join(appDir, 'Familiar.app');

  // appdmg requires native modules (macos-alias, fs-xattr).
  // Build them on demand since Yarn's enableScripts:false skips implicit
  // node-gyp builds.
  ensureNativeBuilt(['appdmg', 'ds-store', 'macos-alias']);
  ensureNativeBuilt(['appdmg', 'fs-xattr']);

  // Use electron-installer-dmg which wraps appdmg
  const { createDMG } = await import('electron-installer-dmg');
  await createDMG({
    appPath: appBundle,
    out: makeDir,
    name: `Familiar-${version}`,
    icon: path.join(familiarDir, 'assets/icon.icns'),
    overwrite: true,
  });
  console.log(`Created: out/make/${dmgName}`);
}
