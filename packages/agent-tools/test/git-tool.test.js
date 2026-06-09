// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/far';

import { makeGitTool } from '../src/git-tool.js';

/** @import { ERef } from '@endo/far' */
/** @import { GitToolCapability } from '../src/types.js' */

const SLICE = [
  'log',
  'diff',
  'show',
  'commit',
  'branches',
  'createBranch',
  'switchBranch',
  'currentBranch',
];

/**
 * Stub Git capability that records the method name and positional args.
 *
 * @param {unknown[][]} calls An array each call appends its `[name, ...args]` to.
 * @returns {ERef<GitToolCapability>}
 */
const makeStubGit = calls => {
  /** @type {GitToolCapability} */
  const stubGit = {
    log: async (...a) => {
      calls.push(['log', ...a]);
      return [];
    },
    diff: async (...a) => {
      calls.push(['diff', ...a]);
      return '';
    },
    show: async (...a) => {
      calls.push(['show', ...a]);
      return '';
    },
    commit: async (...a) => {
      calls.push(['commit', ...a]);
      return { oid: 'x', summary: a[0] };
    },
    branches: async (...a) => {
      calls.push(['branches', ...a]);
      return [];
    },
    createBranch: async (...a) => {
      calls.push(['createBranch', ...a]);
      return { name: a[0], kind: 'branch' };
    },
    switchBranch: async (...a) => {
      calls.push(['switchBranch', ...a]);
    },
    currentBranch: async (...a) => {
      calls.push(['currentBranch', ...a]);
      return undefined;
    },
  };
  return Far('StubGit', stubGit);
};

test('makeGitTool builds one record per non-remotable-slice method', t => {
  const tools = makeGitTool(makeStubGit([]));
  t.is(tools.length, SLICE.length);
  const names = tools.map(tool => tool.name).sort();
  t.deepEqual(names, [...SLICE].sort());
  for (const tool of tools) {
    t.is(typeof tool.description, 'string');
    t.truthy(tool.parameters);
    t.is(tool.inputSchema, tool.parameters);
    t.is(typeof tool.invoke, 'function');
  }
});

test('makeGitTool omits cap-heavy methods', t => {
  const tools = makeGitTool(makeStubGit([]));
  const names = new Set(tools.map(tool => tool.name));
  t.false(names.has('status'));
  t.false(names.has('add'));
  t.false(names.has('restore'));
  t.false(names.has('filesystemAt'));
});

test('invoke marshals named args to positional and calls the capability', async t => {
  const calls = [];
  const tools = makeGitTool(makeStubGit(calls));
  const byName = name => {
    const found = tools.find(tool => tool.name === name);
    if (!found) throw new Error(`no tool named ${name}`);
    return found;
  };

  await null;

  await byName('commit').invoke({ arg0: 'a message' });
  await byName('createBranch').invoke({ arg0: 'feature' });
  await byName('createBranch').invoke({ arg0: 'feature', arg1: harden({}) });
  await byName('log').invoke({});

  t.deepEqual(calls, [
    ['commit', 'a message'],
    ['createBranch', 'feature'],
    ['createBranch', 'feature', {}],
    ['log'],
  ]);
});

test('invoke rejects an arg that violates the runtime guard', async t => {
  const tools = makeGitTool(makeStubGit([]));
  const commit = tools.find(tool => tool.name === 'commit');
  if (!commit) throw new Error('no commit tool');
  await null;
  await t.throwsAsync(() => commit.invoke({ arg0: 123 }));
});
