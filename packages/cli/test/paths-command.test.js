// @ts-check

import path from 'path';
import test from 'ava';
import url from 'url';
import { execa } from 'execa';
import { renderPath, renderBanner } from '../src/render-retention-path.js';

/** @import { RetentionPath } from '@endo/daemon' */

const dirname = url.fileURLToPath(new URL('.', import.meta.url));
const endoBin = path.join(dirname, '..', 'bin', 'endo.cjs');

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

// `renderPath` is the human-readable rendering used by `endo paths`
// without `--json`. The shape under test mirrors the design's
// example output (designs/daemon-retention-paths.md § Example
// output): per-segment formula type in parentheses, Unicode `→`
// for field-edge labels, quoted pet-name edges.
test('renderPath surfaces per-segment formula type with Unicode arrows', t => {
  /** @type {RetentionPath} */
  const aPath = /** @type {any} */ ([
    // Leaf (target) segment. The pet-name edge that points at this
    // segment lives on the next segment up (`pet:shared-file`),
    // matching the daemon's `listRetentionPaths` rewrite output.
    {
      groupMembers: ['shared-file'],
      labels: ['pet:shared-file'],
      formulaTypes: ['eval'],
    },
    // Middle segment: pet-store referencing the leaf via a pet-name
    // edge; the inbound field-edge label from the root segment to
    // here is "pins".
    {
      groupMembers: ['pins'],
      referencedBy: 'pins',
      labels: ['pins'],
      formulaTypes: ['pet-store'],
    },
    // Root segment.
    {
      groupMembers: ['endo'],
      referencedBy: 'endo',
      type: 'root',
      formulaTypes: ['endo'],
    },
  ]);
  const lines = renderPath(aPath);
  // Root segment renders the `(root)` marker, not the formula type.
  t.true(
    lines.some(line => line.trim() === 'endo (root)'),
    `root line missing; got: ${lines.join(' | ')}`,
  );
  // Non-root segment renders `<member> (<formula-type>)`.
  t.true(
    lines.some(line => line.trim() === 'pins (pet-store)'),
    `pet-store line missing; got: ${lines.join(' | ')}`,
  );
  t.true(
    lines.some(line => line.trim() === 'shared-file (eval)'),
    `eval line missing; got: ${lines.join(' | ')}`,
  );
  // Field-edge label uses Unicode arrow.
  t.true(
    lines.some(line => line.trim() === '→pins'),
    `field-edge arrow missing; got: ${lines.join(' | ')}`,
  );
  // Pet-name edge renders as a quoted name.
  t.true(
    lines.some(line => line.trim() === '"shared-file"'),
    `pet-name edge missing; got: ${lines.join(' | ')}`,
  );
  // The ASCII `->` form must not survive.
  t.false(
    lines.some(line => line.includes('->')),
    `legacy ASCII arrow leaked: ${lines.join(' | ')}`,
  );
  // Banner names the root by member id, matching "rooted at endo".
  t.is(renderBanner(aPath, 0), 'Path 1 (rooted at endo):');
});
