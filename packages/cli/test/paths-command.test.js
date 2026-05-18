// @ts-nocheck
/* global process */

import path from 'path';
import test from 'ava';
import url from 'url';
import { execa } from 'execa';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));
const endoBin = path.join(dirname, '..', 'bin', 'endo');

// The `endo paths` verb is the CLI surface for the daemon's new
// listRetentionPaths host method, per designs/daemon-retention-paths.md.
// These tests verify the verb is wired without touching a live daemon:
// the help surface is observable purely from commander's registration.

test('endo --help lists the paths command in Storage group', async t => {
  const { stdout } = await execa(process.execPath, [endoBin, '--help']);
  t.regex(
    stdout,
    /\bpaths\b/,
    'help output should advertise the paths command',
  );
});

test('endo paths --help advertises --json and --locator options', async t => {
  const { stdout } = await execa(process.execPath, [
    endoBin,
    'paths',
    '--help',
  ]);
  t.regex(stdout, /Usage: endo paths/);
  t.regex(
    stdout,
    /retention path/i,
    'help text should describe the command as retention-path-oriented',
  );
  t.regex(stdout, /--json/, '--json flag must be advertised');
  t.regex(stdout, /--locator/, '--locator flag must be advertised');
});

test('endo paths exits non-zero when given no argument', async t => {
  // commander rejects the missing required argument before any
  // daemon connection attempt, so this is deterministic offline.
  const result = await execa(process.execPath, [endoBin, 'paths'], {
    reject: false,
  });
  t.not(result.exitCode, 0, 'paths with no name-or-locator argument must fail');
});
