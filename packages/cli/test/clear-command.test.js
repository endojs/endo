// @ts-nocheck
/* global process */

import path from 'path';
import test from 'ava';
import url from 'url';
import { execa } from 'execa';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));
const endoBin = path.join(dirname, '..', 'bin', 'endo');

// `endo --help` writes its grouped command listing to stdout without
// touching the daemon.  This makes it a cheap, deterministic place to
// observe that `clear` is registered with `dismiss-all` as a backwards
// compatibility alias, per designs/chat-rename-dismiss-to-clear.md.
test('endo --help advertises clear with dismiss-all alias', async t => {
  const { stdout } = await execa(process.execPath, [endoBin, '--help']);
  t.regex(
    stdout,
    /\bclear\|dismiss-all\b/,
    'help output should list the clear command paired with its dismiss-all alias',
  );
});

test('endo dismiss-all --help resolves through the alias', async t => {
  const { stdout } = await execa(process.execPath, [
    endoBin,
    'dismiss-all',
    '--help',
  ]);
  t.regex(stdout, /Usage: endo clear/);
  t.regex(stdout, /dismiss all messages/);
});

test('endo clear --help resolves directly', async t => {
  const { stdout } = await execa(process.execPath, [
    endoBin,
    'clear',
    '--help',
  ]);
  t.regex(stdout, /Usage: endo clear/);
  t.regex(stdout, /dismiss all messages/);
});
