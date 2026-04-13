// Demo: open directory handles and filesystem operations.
//
// This module is loaded as a compartment-map archive and executed
// by `endor run`.  All host functions are provided as
// Compartment endowments.

/* global print, writeFileText, readFileText, readDir,
   mkdir, remove, exists, isDir, readLink,
   openDir, closeDir, symlink, link */

// -- 1. Setup: create a scratch directory tree --------------------------

const ROOT = 'root';          // dir-token for /
const BASE = 'tmp/dir-handle-demo';

print('=== Directory Handle Demo ===');
print('');

// Clean slate
mkdir(ROOT, BASE);
mkdir(ROOT, BASE + '/sub');

// Write two files via the classic string-token API
writeFileText(ROOT, BASE + '/hello.txt', 'Hello, Endo!');
writeFileText(ROOT, BASE + '/sub/nested.txt', 'I am nested.');
print('[token API] Wrote hello.txt and sub/nested.txt');

// -- 2. Open a directory handle on the base path -----------------------

const dh = openDir(ROOT, BASE);
print('[dir handle] Opened handle ' + dh + ' for ' + BASE);

// Read a file through the numeric handle
const content = readFileText(dh, 'hello.txt');
print('[dir handle] Read hello.txt -> "' + content + '"');

// List entries through the handle
const entries = readDir(dh, '');
print('[dir handle] Entries: ' + entries);

// Existence and type checks through the handle
print('[dir handle] exists("hello.txt"): ' + exists(dh, 'hello.txt'));
print('[dir handle] isDir("sub"):        ' + isDir(dh, 'sub'));

// -- 3. Nested directory handle ----------------------------------------

const subDh = openDir(dh, 'sub');
print('[nested handle] Opened handle ' + subDh + ' for sub/');

const nested = readFileText(subDh, 'nested.txt');
print('[nested handle] Read nested.txt -> "' + nested + '"');

// Write a new file through the nested handle
writeFileText(subDh, 'created.txt', 'Created via nested handle');
print('[nested handle] Wrote created.txt');
print('[nested handle] Entries: ' + readDir(subDh, ''));

// -- 4. Symlink and hard link -----------------------------------------

const symlinkResult = symlink(dh, 'hello.txt', 'link-to-hello');
if (typeof symlinkResult === 'string' && symlinkResult.startsWith('Error:')) {
  print('[symlink] Skipped (platform does not support): ' + symlinkResult);
} else {
  const target = readLink(dh, 'link-to-hello');
  print('[symlink] link-to-hello -> ' + target);
  const viaLink = readFileText(dh, 'link-to-hello');
  print('[symlink] Read through symlink -> "' + viaLink + '"');
}

const hardlinkResult = link(dh, 'hello.txt', 'hardlink-hello');
if (typeof hardlinkResult === 'string' && hardlinkResult.startsWith('Error:')) {
  print('[hardlink] Skipped: ' + hardlinkResult);
} else {
  const viaHard = readFileText(dh, 'hardlink-hello');
  print('[hardlink] Read through hard link -> "' + viaHard + '"');
}

// -- 5. Cleanup --------------------------------------------------------

closeDir(subDh);
print('[cleanup] Closed nested handle ' + subDh);
closeDir(dh);
print('[cleanup] Closed handle ' + dh);

// Remove scratch files
remove(ROOT, BASE + '/sub/created.txt');
remove(ROOT, BASE + '/sub/nested.txt');
remove(ROOT, BASE + '/hello.txt');

// Best-effort removal of link files (may not exist on all platforms)
try { remove(ROOT, BASE + '/link-to-hello'); } catch (_) { /* */ }
try { remove(ROOT, BASE + '/hardlink-hello'); } catch (_) { /* */ }

print('');
print('=== Demo complete ===');
