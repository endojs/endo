// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { InterfaceGuard, Pattern } from '@endo/patterns' */
/** @import { GitRemoteToolCapability, ToolRecord } from '../src/types.js' */

import test from 'ava';
import { Ajv } from 'ajv';
import { pathToFileURL } from 'node:url';
import {
  matches,
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';
import { GitRemoteInterface, makeGitRemote } from '@endo/exo-git';

import { makeGitRemoteTool } from '../src/json-tools/git-remote.js';
import {
  provisionGitContext,
  provisionBareRemote,
  advanceRemoteMain,
} from './git-remote-fixtures.js';

const ajv = new Ajv({ strict: false });

/**
 * Positional guard structure from `GitRemoteInterface`.
 *
 * @param {string} method
 */
const guardShapeFor = method => {
  const { methodGuards } = getInterfaceGuardPayload(
    /** @type {InterfaceGuard} */ (GitRemoteInterface),
  );
  const { argGuards, optionalArgGuards } = getMethodGuardPayload(
    methodGuards[method],
  );
  const optional = optionalArgGuards || [];
  return {
    requiredCount: argGuards.length,
    guards: harden([...argGuards, ...optional]),
  };
};

/**
 * Decide whether the runtime guards accept a named-args record, mapping the
 * record's keys onto positional slots by the schema's declared property order.
 *
 * @param {{requiredCount:number, guards:Pattern[]}} shape
 * @param {string[]} paramNames
 * @param {Record<string, unknown>} record
 */
const guardAccepts = (shape, paramNames, record) => {
  const { requiredCount, guards } = shape;
  const allowed = new Set(paramNames.slice(0, guards.length));
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return false;
  }
  for (let i = 0; i < guards.length; i += 1) {
    const key = paramNames[i];
    const present =
      Object.prototype.hasOwnProperty.call(record, key) &&
      record[key] !== undefined;
    if (present) {
      if (!matches(record[key], guards[i])) return false;
    } else if (i < requiredCount) {
      return false;
    }
  }
  return true;
};

/** @param {ToolRecord} tool */
const paramNamesOf = tool =>
  Object.keys(
    /** @type {{ properties?: Record<string, unknown> }} */ (tool.parameters)
      .properties || {},
  );

const inertRemote = /** @type {ERef<GitRemoteToolCapability>} */ (
  /** @type {unknown} */ (Far('InertGitRemote', {}))
);

const toolsByName = () => {
  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeGitRemoteTool(inertRemote)) {
    byName[tool.name] = tool;
  }
  return byName;
};

test('makeGitRemoteTool emits inspect/fetch/pull/push records', t => {
  const byName = toolsByName();
  t.deepEqual(Object.keys(byName).sort(), ['fetch', 'inspect', 'pull', 'push']);
  for (const name of ['inspect', 'fetch', 'pull', 'push']) {
    t.is(typeof byName[name].invoke, 'function', name);
    // The schema is reused verbatim as the MCP inputSchema.
    t.is(byName[name].inputSchema, byName[name].parameters, name);
  }
});

// --- divergence gate: hand-authored schema ⟷ runtime guard ------------------

/**
 * Candidate option records exercising valid and invalid `options` shapes plus
 * out-of-band keys, keyed to the single declared `options` slot each verb takes
 * (`inspect` takes none, so a lone empty record covers it).
 */
const optionRecords = harden([
  {},
  { options: {} },
  { options: { prune: true } },
  { options: { tags: true, prune: false } },
  { options: { branch: 'main', strategy: 'ff-only' } },
  { options: { source: 'refs/heads/x', destination: 'refs/heads/x' } },
  { options: { nested: { deep: 1 } } },
  { options: 'not-a-record' },
  { options: 42 },
  { options: [] },
  { options: null },
  { options: undefined },
  { options: {}, extra: 'x' },
  { extra: 'x' },
  { bogus: true },
]);

const checkAgreement = (t, tool, records) => {
  const shape = guardShapeFor(tool.name);
  const paramNames = paramNamesOf(tool);
  const validate = ajv.compile(tool.parameters);
  let checked = 0;
  for (const record of records) {
    const guardOk = guardAccepts(shape, paramNames, record);
    const schemaOk = validate({ ...record });
    t.is(
      schemaOk,
      guardOk,
      `${tool.name}: schema=${schemaOk} guard=${guardOk} for ${JSON.stringify(
        record,
      )}`,
    );
    checked += 1;
  }
  t.true(checked > 0);
};

for (const name of ['inspect', 'fetch', 'pull', 'push']) {
  test(`schema ⟷ guard agree for gitRemote.${name}`, t => {
    checkAgreement(t, toolsByName()[name], optionRecords);
  });
}

// --- dispatch forwarding -----------------------------------------------------

const makeFakeRemote = () => {
  /** @type {any[]} */
  const calls = [];
  // Capture the exact argument vector each verb receives (rest args, not a
  // defaulted positional) so a dropped trailing optional shows as zero args.
  const remote = Far('FakeGitRemote', {
    inspect: async (...args) => {
      calls.push({ method: 'inspect', args });
      return harden({ name: 'origin', url: 'https://example.test/r.git' });
    },
    fetch: async (...args) => {
      calls.push({ method: 'fetch', args });
      return harden({ updatedRefs: [] });
    },
    pull: async (...args) => {
      calls.push({ method: 'pull', args });
      return harden({ integration: 'up-to-date' });
    },
    push: async (...args) => {
      calls.push({ method: 'push', args });
      return harden({ updatedRefs: [] });
    },
  });
  return { remote, calls };
};

test('verbs forward their options record verbatim to the capability', async t => {
  const { remote, calls } = makeFakeRemote();
  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeGitRemoteTool(/** @type {any} */ (remote))) {
    byName[tool.name] = tool;
  }

  await byName.fetch.invoke({ options: { prune: true } });
  await byName.pull.invoke({
    options: { branch: 'main', strategy: 'rebase' },
  });
  await byName.push.invoke({
    options: { source: 'refs/heads/x', setUpstream: true },
  });

  t.deepEqual(calls, [
    { method: 'fetch', args: [{ prune: true }] },
    { method: 'pull', args: [{ branch: 'main', strategy: 'rebase' }] },
    { method: 'push', args: [{ source: 'refs/heads/x', setUpstream: true }] },
  ]);
});

test('an omitted options record dispatches with zero arguments', async t => {
  const { remote, calls } = makeFakeRemote();
  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeGitRemoteTool(/** @type {any} */ (remote))) {
    byName[tool.name] = tool;
  }

  // A trailing absent optional is dropped, so the exo sees fetch() not
  // fetch(undefined) — the same arity a direct caller would use.
  await byName.fetch.invoke({});
  await byName.inspect.invoke({});

  t.deepEqual(calls, [
    { method: 'fetch', args: [] },
    { method: 'inspect', args: [] },
  ]);
});

test('an out-of-policy option is rejected at the capability boundary', async t => {
  // The tool states no policy of its own; a forbidden option fails closed at
  // the exo. Force-push without allowForcePush is the canonical example.
  const { git, root } = await provisionGitContext(t);
  const remoteRoot = await provisionBareRemote(t, root);
  const { remote } = makeGitRemote({
    git,
    name: 'origin',
    policy: {
      url: pathToFileURL(remoteRoot).href,
      allowLocalFileTransport: true,
      allowedDirections: ['fetch', 'push'],
      fetchRefspecs: ['+refs/heads/main:refs/remotes/origin/main'],
      pushRefspecs: ['refs/heads/agent/*:refs/heads/agent/*'],
    },
  });
  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeGitRemoteTool(/** @type {any} */ (remote))) {
    byName[tool.name] = tool;
  }
  await t.throwsAsync(
    () =>
      byName.push.invoke({
        options: {
          source: 'refs/heads/agent/topic',
          destination: 'refs/heads/agent/topic',
          force: true,
        },
      }),
    { message: /allowForcePush/ },
  );
});

// --- end-to-end: the tools move real git objects over a file:// remote -------

test('fetch / pull / push tools drive the bounded native data plane', async t => {
  const { git, mount, root } = await provisionGitContext(t);
  const remoteRoot = await provisionBareRemote(t, root);
  const remoteUrl = pathToFileURL(remoteRoot).href;
  const remoteHead = await advanceRemoteMain(t, remoteRoot);

  const { remote } = makeGitRemote({
    git,
    name: 'origin',
    policy: {
      url: remoteUrl,
      allowLocalFileTransport: true,
      allowedDirections: ['fetch', 'push'],
      fetchRefspecs: ['+refs/heads/main:refs/remotes/origin/main'],
      pushRefspecs: ['refs/heads/agent/*:refs/heads/agent/*'],
      allowDelete: true,
    },
  });

  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeGitRemoteTool(/** @type {any} */ (remote))) {
    byName[tool.name] = tool;
  }

  // inspect reports the granted bounds and no credential material.
  const bounds = /** @type {any} */ (await byName.inspect.invoke({}));
  t.is(bounds.url, remoteUrl);
  t.deepEqual([...bounds.allowedDirections], ['fetch', 'push']);
  t.false('credential' in bounds);

  const fetchResult = /** @type {any} */ (
    await byName.fetch.invoke({ options: { prune: true } })
  );
  t.is([...fetchResult.updatedRefs].length, 1);
  const fetched = await E(git).revParse('refs/remotes/origin/main');
  t.is(fetched.oid, remoteHead);

  const pullResult = /** @type {any} */ (
    await byName.pull.invoke({
      options: { branch: 'refs/remotes/origin/main', strategy: 'ff-only' },
    })
  );
  t.is(pullResult.integration, 'fast-forward');
  t.is(await E(mount).readText(['upstream.txt']), 'upstream\n');

  await E(git).createBranch('agent/topic', { switchAfterCreate: true });
  const note = await E(mount).entry(['agent.txt']);
  await E(mount).writeText(note, 'agent\n');
  await E(git).add([note]);
  await E(git).commit('test: agent branch');

  const pushResult = /** @type {any} */ (
    await byName.push.invoke({
      options: {
        source: 'refs/heads/agent/topic',
        destination: 'refs/heads/agent/topic',
        setUpstream: true,
      },
    })
  );
  const pushed = [...pushResult.updatedRefs];
  t.is(pushed.length, 1);
  t.is(pushed[0].remote, 'refs/heads/agent/topic');
  t.regex(pushed[0].local.oid, /^[0-9a-f]{40}$/u);
});
