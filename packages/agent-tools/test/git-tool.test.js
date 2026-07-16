// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';

import { makeGitHistoryTool, makeGitTool } from '../src/json-tools/git.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { GitHistoryToolCapability, GitToolCapability } from '../src/types.js' */

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

/**
 * @param {unknown[][]} calls
 * @returns {ERef<GitHistoryToolCapability>}
 */
const makeHistoryStubGit = calls =>
  Far('HistoryStubGit', {
    commit: async (...a) => {
      calls.push(['commit', ...a]);
      return { oid: 'x', summary: a[0] };
    },
    reword: async (...a) => {
      calls.push(['reword', ...a]);
      return { oid: 'x', summary: a[1] };
    },
  });

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

  await byName('commit').invoke({ message: 'a message' });
  await byName('createBranch').invoke({ name: 'feature' });
  await byName('createBranch').invoke({ name: 'feature', options: harden({}) });
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
  await t.throwsAsync(() => commit.invoke({ message: 123 }));
});

test('the schemas advertise real, declarative property names', t => {
  const tools = makeGitTool(makeStubGit([]));
  const byName = name => {
    const found = tools.find(tool => tool.name === name);
    if (!found) throw new Error(`no tool named ${name}`);
    return found;
  };
  const propsOf = name =>
    Object.keys(
      /** @type {{ properties?: object }} */ (byName(name).parameters)
        .properties || {},
    );

  // No method advertises the generic `argN` convention any more.
  for (const tool of tools) {
    const props = Object.keys(
      /** @type {{ properties?: object }} */ (tool.parameters).properties || {},
    );
    for (const prop of props) {
      t.false(
        /^arg\d+$/.test(prop),
        `${tool.name} should not advertise a generic argN property; got ${prop}`,
      );
    }
  }

  t.deepEqual(propsOf('commit'), ['message']);
  t.deepEqual(propsOf('show'), ['ref']);
  t.deepEqual(propsOf('createBranch'), ['name', 'options']);
  t.deepEqual(propsOf('switchBranch'), ['branch']);
  t.deepEqual(propsOf('log'), ['options']);
  t.deepEqual(propsOf('diff'), ['options']);
});

test('makeGitHistoryTool requires an explicit elevated capability', async t => {
  const calls = [];
  const tools = makeGitHistoryTool(makeHistoryStubGit(calls));
  t.deepEqual(tools.map(tool => tool.name).sort(), ['commit', 'reword']);
  const byName = name => {
    const found = tools.find(tool => tool.name === name);
    if (!found) throw new Error(`no history tool named ${name}`);
    return found;
  };

  await byName('commit').invoke({
    message: 'amended message',
    options: harden({ amend: true }),
  });
  await byName('reword').invoke({ ref: 'HEAD~1', message: 'new subject' });
  t.deepEqual(calls, [
    ['commit', 'amended message', { amend: true }],
    ['reword', 'HEAD~1', 'new subject'],
  ]);
});

test('makeGitTool rejects history-rewrite options', async t => {
  const tools = makeGitTool(makeStubGit([]));
  const commit = tools.find(tool => tool.name === 'commit');
  if (!commit) throw new Error('no commit tool');
  await t.throwsAsync(
    commit.invoke({ message: 'not an amendment', options: { amend: true } }),
    { message: /options/ },
  );
});

test('invoke resolves named args by their real property names', async t => {
  const calls = [];
  const tools = makeGitTool(makeStubGit(calls));
  const byName = name => {
    const found = tools.find(tool => tool.name === name);
    if (!found) throw new Error(`no tool named ${name}`);
    return found;
  };

  await null;

  await byName('show').invoke({ ref: 'HEAD' });
  await byName('switchBranch').invoke({ branch: 'feature' });
  await byName('log').invoke({ options: harden({ maxCount: 3 }) });

  t.deepEqual(calls, [
    ['show', 'HEAD'],
    ['switchBranch', 'feature'],
    ['log', { maxCount: 3 }],
  ]);
});

test('invoke rejects a wrong property name and a missing required one', async t => {
  const tools = makeGitTool(makeStubGit([]));
  const byName = name => {
    const found = tools.find(tool => tool.name === name);
    if (!found) throw new Error(`no tool named ${name}`);
    return found;
  };

  await null;

  // The legacy `arg0` key is no longer accepted; `commit` wants `message`.
  const wrongName = await t.throwsAsync(() =>
    byName('commit').invoke({ arg0: 'a message' }),
  );
  t.true(
    wrongName !== undefined && wrongName.message.includes('arg0'),
    `error should name the offending key; got: ${wrongName?.message}`,
  );

  // Omitting the required `message` is rejected before the capability is hit.
  const missing = await t.throwsAsync(() => byName('commit').invoke({}));
  t.true(
    missing !== undefined && missing.message.includes('message'),
    `error should name the missing required key; got: ${missing?.message}`,
  );
});
