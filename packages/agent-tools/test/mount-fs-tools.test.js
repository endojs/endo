// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

/** @import { ExecutionContext } from 'ava' */

import test from 'ava';
import os from 'os';
import path from 'path';
import fs from 'fs';

import {
  makeNodeFilesystem,
  mountAsFilesystem,
  readOnly,
} from '@endo/platform/fs/extended';
import { makeMount } from '@endo/daemon/src/mount.js';
import { makeFilePowers } from '@endo/daemon/src/daemon-node-powers.js';

import {
  makeMountReadTool,
  makeMountListTool,
  makeMountStatTool,
  makeMountEditTool,
  makeMountFsTools,
} from '../src/mount-fs.js';
import { toPiAgentTool } from '../src/pi.js';

/**
 * @param {ExecutionContext} t
 * @returns {string} a fresh temp directory seeded with a small tree:
 *   `a.txt`, `readme.md`, and `sub/nested.txt`.
 */
const seedTree = t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-tools-fstools-'));
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'a.txt'), 'alpha');
  fs.writeFileSync(path.join(root, 'readme.md'), '# hi');
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, 'sub', 'nested.txt'), 'nested body');
  return root;
};

/**
 * The two `Filesystem` backings the Phase 1 file tools must serve
 * identically: a real `node:fs`-backed `Filesystem`, and a daemon `Mount`
 * projected through `mountAsFilesystem`. Every backing-agnostic behavior test
 * runs against both via `overBackings`.
 *
 * @type {{ label: string, make: (root: string) => object }[]}
 */
const backings = [
  {
    label: 'makeNodeFilesystem',
    make: root => makeNodeFilesystem({ rootPath: root }),
  },
  {
    label: 'mountAsFilesystem(makeMount)',
    make: root =>
      mountAsFilesystem(
        makeMount({
          rootPath: root,
          readOnly: false,
          filePowers: makeFilePowers({ fs, path }),
        }),
      ),
  },
];

/**
 * Register `body` as a test against each backing.
 *
 * @param {string} title
 * @param {(t: ExecutionContext, make: (root: string) => object) => Promise<void>} body
 */
const overBackings = (title, body) => {
  for (const { label, make } of backings) {
    test(`${title} [${label}]`, async t => body(t, make));
  }
};

overBackings('mountList returns sorted name/kind entries', async (t, make) => {
  const filesystem = make(seedTree(t));
  const tool = makeMountListTool(filesystem);

  const rootListing =
    /** @type {{ entries: { name: string, kind: string }[] }} */ (
      await tool.invoke({ path: '' })
    );
  t.deepEqual(rootListing.entries, [
    { name: 'a.txt', kind: 'file' },
    { name: 'readme.md', kind: 'file' },
    { name: 'sub', kind: 'directory' },
  ]);

  const subListing =
    /** @type {{ entries: { name: string, kind: string }[] }} */ (
      await tool.invoke({ path: 'sub' })
    );
  t.deepEqual(subListing.entries, [{ name: 'nested.txt', kind: 'file' }]);
});

overBackings('mountStat reports kind and size', async (t, make) => {
  const filesystem = make(seedTree(t));
  const tool = makeMountStatTool(filesystem);

  const fileStat = /** @type {{ kind: string, size?: string }} */ (
    await tool.invoke({ path: 'a.txt' })
  );
  t.is(fileStat.kind, 'file');
  // 'alpha' is five UTF-8 bytes; size is decimal-string-encoded from a bigint.
  t.is(fileStat.size, '5');

  const dirStat = /** @type {{ kind: string }} */ (
    await tool.invoke({ path: 'sub' })
  );
  t.is(dirStat.kind, 'directory');

  const rootStat = /** @type {{ kind: string }} */ (
    await tool.invoke({ path: '' })
  );
  t.is(rootStat.kind, 'directory');
});

overBackings('mountWriteText creates a new file', async (t, make) => {
  const root = seedTree(t);
  const filesystem = make(root);
  const editTool = makeMountEditTool(filesystem);
  const readTool = makeMountReadTool(filesystem);

  const message = await editTool.invoke({
    path: 'sub/new.txt',
    content: 'fresh',
  });
  t.is(message, 'Wrote 5 bytes to sub/new.txt');
  t.is(fs.readFileSync(path.join(root, 'sub', 'new.txt'), 'utf-8'), 'fresh');
  t.is(await readTool.invoke({ path: 'sub/new.txt' }), 'fresh');
});

overBackings(
  'mountWriteText overwrites and truncates a longer prior file',
  async (t, make) => {
    const root = seedTree(t);
    const filesystem = make(root);
    const editTool = makeMountEditTool(filesystem);
    const readTool = makeMountReadTool(filesystem);

    await editTool.invoke({
      path: 'a.txt',
      content: 'a much longer body here',
    });
    await editTool.invoke({ path: 'a.txt', content: 'tiny' });
    // Whole-blob overwrite must truncate: no stale tail from the longer write.
    t.is(fs.readFileSync(path.join(root, 'a.txt'), 'utf-8'), 'tiny');
    t.is(await readTool.invoke({ path: 'a.txt' }), 'tiny');
  },
);

test('a readOnly() Filesystem fails edit closed but still reads/lists/stats', async t => {
  const filesystem = readOnly(makeNodeFilesystem({ rootPath: seedTree(t) }));

  await null;
  // Read-side tools work unchanged against the attenuated cap.
  t.is(await makeMountReadTool(filesystem).invoke({ path: 'a.txt' }), 'alpha');
  const listing = /** @type {{ entries: unknown[] }} */ (
    await makeMountListTool(filesystem).invoke({ path: '' })
  );
  t.is(listing.entries.length, 3);
  const stat = /** @type {{ kind: string }} */ (
    await makeMountStatTool(filesystem).invoke({ path: 'a.txt' })
  );
  t.is(stat.kind, 'file');

  // The edit tool built over the same cap fails closed at the capability.
  await t.throwsAsync(
    () => makeMountEditTool(filesystem).invoke({ path: 'a.txt', content: 'x' }),
    { message: /EACCES/ },
  );
});

test('makeMountFsTools advertises read+write tools for a writable cap', t => {
  const filesystem = makeNodeFilesystem({ rootPath: seedTree(t) });
  const tools = makeMountFsTools(filesystem);
  t.deepEqual(
    tools.map(tool => tool.name),
    ['mountReadText', 'mountList', 'mountStat', 'mountWriteText'],
  );
  // The build-time `scope` tag is never copied onto a tool record or its wire
  // schema.
  for (const tool of tools) {
    t.false('scope' in tool);
    t.false('scope' in /** @type {object} */ (tool.parameters));
  }
});

test('makeMountFsTools omits the edit tool under readOnly', t => {
  const filesystem = makeNodeFilesystem({ rootPath: seedTree(t) });
  const tools = makeMountFsTools(filesystem, { readOnly: true });
  t.deepEqual(
    tools.map(tool => tool.name),
    ['mountReadText', 'mountList', 'mountStat'],
  );
  t.false(tools.some(tool => tool.name === 'mountWriteText'));
});

test('mountList bridges through toPiAgentTool as JSON text', async t => {
  const filesystem = makeNodeFilesystem({ rootPath: seedTree(t) });
  const agentTool = toPiAgentTool(makeMountListTool(filesystem));

  t.is(agentTool.name, 'mountList');
  const result = await agentTool.execute('call-1', { path: 'sub' });
  t.deepEqual(result.details, {
    path: 'sub',
    entries: [{ name: 'nested.txt', kind: 'file' }],
  });
  t.deepEqual(JSON.parse(result.content[0].text), {
    path: 'sub',
    entries: [{ name: 'nested.txt', kind: 'file' }],
  });
});

test('the file tools reject unexpected argument keys and bad types', async t => {
  const filesystem = makeNodeFilesystem({ rootPath: seedTree(t) });

  await t.throwsAsync(
    () => makeMountEditTool(filesystem).invoke({ path: '', content: 'x' }),
    { message: /non-empty string path/ },
  );
  await t.throwsAsync(
    () => makeMountEditTool(filesystem).invoke({ path: 'a.txt', content: 42 }),
    { message: /string content/ },
  );
  await t.throwsAsync(
    () =>
      makeMountEditTool(filesystem).invoke({
        path: 'a.txt',
        content: 'x',
        extra: 1,
      }),
    { message: /extra/ },
  );
});
