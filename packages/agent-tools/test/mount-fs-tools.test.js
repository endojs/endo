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
  // Every list record leaves the tool hardened.
  t.true(Object.isFrozen(subListing));
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

  const dirStat = /** @type {{ kind: string, size?: string }} */ (
    await tool.invoke({ path: 'sub' })
  );
  t.is(dirStat.kind, 'directory');
  // The base seam reports a directory's size as the decimal-string-encoded 0,
  // and every stat record is hardened before it leaves the tool.
  t.is(dirStat.size, '0');
  t.true(Object.isFrozen(dirStat));

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

overBackings(
  'every file tool rejects a "../" escape at the capability',
  async (t, make) => {
    const filesystem = make(seedTree(t));
    // Each tool's description advertises that "../" escapes are rejected. The
    // rejection is the `Filesystem` capability's — `pathToSegments` leaves ".."
    // intact so the cap throws `EINVAL: name ".." reserved` — surfaced
    // identically through read / list / stat / edit rather than a brittle
    // string check in the tool.
    await t.throwsAsync(
      () => makeMountReadTool(filesystem).invoke({ path: '../escape' }),
      { message: /name "\.\." reserved/ },
      'mountReadText rejects a "../" escape',
    );
    await t.throwsAsync(
      () => makeMountListTool(filesystem).invoke({ path: '../escape' }),
      { message: /name "\.\." reserved/ },
      'mountList rejects a "../" escape',
    );
    await t.throwsAsync(
      () => makeMountStatTool(filesystem).invoke({ path: '../escape' }),
      { message: /name "\.\." reserved/ },
      'mountStat rejects a "../" escape',
    );
    await t.throwsAsync(
      () =>
        makeMountEditTool(filesystem).invoke({
          path: '../escape',
          content: 'x',
        }),
      { message: /name "\.\." reserved/ },
      'mountWriteText rejects a "../" escape',
    );
  },
);

overBackings(
  'mountWriteText under a missing parent throws (no intermediate dirs)',
  async (t, make) => {
    const filesystem = make(seedTree(t));
    // The whole-blob write walks to the leaf's parent directory; when that
    // parent does not exist the cap reports ENOENT rather than creating it.
    await t.throwsAsync(
      () =>
        makeMountEditTool(filesystem).invoke({
          path: 'no-such-dir/child.txt',
          content: 'x',
        }),
      { message: /ENOENT/ },
    );
  },
);

overBackings('mountList on a file throws', async (t, make) => {
  const filesystem = make(seedTree(t));
  // Listing resolves to `Directory.list`; a File node exposes no such method,
  // so the cap rejects rather than silently returning an empty listing.
  await t.throwsAsync(
    () => makeMountListTool(filesystem).invoke({ path: 'a.txt' }),
    { message: /no method "list"/ },
  );
});

overBackings('mountWriteText rejects a root-family path', async (t, make) => {
  const filesystem = make(seedTree(t));
  await null;
  // "/", "//", and "/." all collapse to zero `walk` segments — the mount
  // root, which has no parent directory to write a child into.
  for (const rootPath of ['/', '//', '/.']) {
    // eslint-disable-next-line no-await-in-loop
    await t.throwsAsync(
      () =>
        makeMountEditTool(filesystem).invoke({ path: rootPath, content: 'x' }),
      { message: /cannot write the mount root/ },
      `mountWriteText rejects "${rootPath}"`,
    );
  }
});

overBackings('mountWriteText writes empty content', async (t, make) => {
  const root = seedTree(t);
  const filesystem = make(root);
  const editTool = makeMountEditTool(filesystem);
  const readTool = makeMountReadTool(filesystem);

  const message = await editTool.invoke({ path: 'blank.txt', content: '' });
  t.is(message, 'Wrote 0 bytes to blank.txt');
  t.is(fs.readFileSync(path.join(root, 'blank.txt'), 'utf-8'), '');
  // A zero-length file reads back as the empty string, not an error.
  t.is(await readTool.invoke({ path: 'blank.txt' }), '');
});

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
  // `toPiAgentTool` always emits a single text content (see `pi.js`); narrow
  // the `TextContent | ImageContent` union to read its payload.
  const listPayload = JSON.parse(
    /** @type {{ text: string }} */ (result.content[0]).text,
  );
  t.deepEqual(listPayload, {
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

  // The read-side list and stat tools enforce the same discipline: a non-string
  // path and an unexpected argument key are both rejected before any capability
  // send, exactly as `mountWriteText` does above.
  for (const [label, makeReadSideTool] of /** @type {const} */ ([
    ['mountList', makeMountListTool],
    ['mountStat', makeMountStatTool],
  ])) {
    // eslint-disable-next-line no-await-in-loop
    await t.throwsAsync(
      () => makeReadSideTool(filesystem).invoke({ path: 42 }),
      { message: new RegExp(`${label} requires a string path`) },
      `${label} rejects a non-string path`,
    );
    // eslint-disable-next-line no-await-in-loop
    await t.throwsAsync(
      () => makeReadSideTool(filesystem).invoke({ path: '', extra: 1 }),
      { message: new RegExp(`unexpected ${label} argument key`) },
      `${label} rejects an unexpected key`,
    );
  }
});
