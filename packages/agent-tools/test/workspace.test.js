// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';

import {
  makeWorkspaceTools,
  provisionWorkspaceTools,
} from '../src/workspace.js';

/**
 * The provisioning adapter composes its catalog purely from the tool makers'
 * static schemas and interface guards — a maker never calls the granted cap at
 * construction time — so an inert `Far` remotable is a sufficient stand-in for
 * every grant these composition-semantics tests exercise. The live-capability
 * behavior is proved end to end in `git-worked-loop.test.js`.
 *
 * @param {string} label
 * @returns {any} an inert stand-in for any workspace grant; typed `any` so a
 *   single `Far` remotable satisfies every distinct capability parameter.
 */
const grant = label => Far(label, {});

/** @param {{ name: string }[]} records */
const nameSet = records => new Set(records.map(record => record.name));

test('no grants compose an empty catalog', t => {
  t.deepEqual(makeWorkspaceTools(), []);
  t.deepEqual(makeWorkspaceTools({}), []);
});

test('a git grant composes the versioning + mount-bridged tools, and nothing else', t => {
  const names = nameSet(makeWorkspaceTools({ git: grant('Git') }));
  // The JSON-safe git slice…
  for (const method of [
    'log',
    'diff',
    'show',
    'commit',
    'branches',
    'createBranch',
    'switchBranch',
    'currentBranch',
  ]) {
    t.true(names.has(method), `git tool "${method}" present`);
  }
  // …plus the mount-bridged staging half.
  t.true(names.has('status'));
  t.true(names.has('add'));
  // No other layer's tools are present when only git is granted.
  for (const absent of ['mountReadText', 'push', 'fetch', 'exec']) {
    t.false(names.has(absent), `"${absent}" absent without its grant`);
  }
});

test('a filesystem grant composes the file tools; readOnly drops the write slice', t => {
  const readWrite = nameSet(
    makeWorkspaceTools({ filesystem: grant('Filesystem') }),
  );
  t.deepEqual(
    readWrite,
    new Set(['mountReadText', 'mountList', 'mountStat', 'mountWriteText']),
  );

  const readOnly = nameSet(
    makeWorkspaceTools({ filesystem: grant('Filesystem'), readOnly: true }),
  );
  t.false(readOnly.has('mountWriteText'), 'the write tool is dropped');
  t.true(readOnly.has('mountReadText'));
});

test('a remote grant composes the push tier', t => {
  const names = nameSet(makeWorkspaceTools({ remote: grant('GitRemote') }));
  for (const method of ['inspect', 'fetch', 'pull', 'push']) {
    t.true(names.has(method), `remote tool "${method}" present`);
  }
});

test('a shell grant composes the command tools', t => {
  const names = nameSet(makeWorkspaceTools({ shell: grant('Shell') }));
  t.true(names.has('exec'));
  t.true(names.has('inspect'));
});

test('grants compose into one flat catalog with distinct names', t => {
  // filesystem + git + remote all coexist: every tool name across the three
  // groups is unique, so the catalog is a flat, unambiguous set.
  const catalog = makeWorkspaceTools({
    filesystem: grant('Filesystem'),
    git: grant('Git'),
    remote: grant('GitRemote'),
  });
  t.is(catalog.length, nameSet(catalog).size, 'no name is repeated');
});

test('a shell + remote catalog fails closed on the shared "inspect" name', t => {
  // Both makeShellTool and makeGitRemoteTool emit a bounds-legibility `inspect`
  // tool. A flat catalog with two identically-named tools is ambiguous the
  // moment a harness dispatches by name, so composition rejects it rather than
  // silently shadowing one. (Surfaced by the worked-loop composition; the fix
  // is to reconcile the two makers' `inspect` naming — see the PR follow-ups.)
  const error = t.throws(() =>
    makeWorkspaceTools({ shell: grant('Shell'), remote: grant('GitRemote') }),
  );
  t.regex(error.message, /name collision/);
  t.regex(error.message, /inspect/);
  t.regex(error.message, /shell/);
  t.regex(error.message, /gitRemote/);
});

test('provisionWorkspaceTools passes an explicit filesystem straight through', async t => {
  // With an explicit `filesystem` and no `git`, the async provisioner performs
  // no derivation and returns the same catalog as the synchronous maker.
  await null;
  const catalog = await provisionWorkspaceTools({
    filesystem: grant('Filesystem'),
  });
  t.deepEqual(
    nameSet(catalog),
    new Set(['mountReadText', 'mountList', 'mountStat', 'mountWriteText']),
  );
});

test('provisionWorkspaceTools with no grants derives nothing', async t => {
  const catalog = await provisionWorkspaceTools();
  t.deepEqual(catalog, []);
});
