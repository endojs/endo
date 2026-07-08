// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { InterfaceGuard, Pattern } from '@endo/patterns' */
/** @import { ShellToolCapability, ToolRecord } from '../src/types.js' */

import test from 'ava';
import { Ajv } from 'ajv';
import {
  matches,
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import { Far } from '@endo/pass-style';
import { ShellInterface } from '@endo/exo-shell';

import { makeShellTool } from '../src/shell-tool.js';

const ajv = new Ajv({ strict: false });

/**
 * Positional guard structure from `ShellInterface`.
 *
 * @param {string} method
 */
const guardShapeFor = method => {
  const { methodGuards } = getInterfaceGuardPayload(
    /** @type {InterfaceGuard} */ (ShellInterface),
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

const inertShell = /** @type {ERef<ShellToolCapability>} */ (
  /** @type {unknown} */ (Far('InertShell', {}))
);

const toolsByName = () => {
  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeShellTool(inertShell)) {
    byName[tool.name] = tool;
  }
  return byName;
};

test('makeShellTool emits exec and inspect tool records', t => {
  const byName = toolsByName();
  t.deepEqual(Object.keys(byName).sort(), ['exec', 'inspect']);
  t.is(typeof byName.exec.invoke, 'function');
});

// --- divergence gate: hand-authored schema ⟷ runtime guard ------------------

/** Candidate args records for the exec tool. */
const execRecords = harden([
  {},
  { command: 'echo' },
  { args: ['x'] },
  { command: 'echo', args: [] },
  { command: 'echo', args: ['a', 'b'] },
  { command: 42, args: [] },
  { command: 'echo', args: 'not-an-array' },
  { command: 'echo', args: [1, 2] },
  { command: 'echo', args: [], options: {} },
  { command: 'echo', args: [], options: { timeoutMs: 100 } },
  { command: 'echo', args: [], options: { timeoutMs: 'soon' } },
  { command: 'echo', args: [], options: { bogus: true } },
  { command: 'echo', args: [], extra: 'x' },
]);

/** Candidate args records for the inspect tool. */
const inspectRecords = harden([{}, { anything: 1 }]);

const checkAgreement = (t, tool, records) => {
  const shape = guardShapeFor(tool.name);
  const paramNames = paramNamesOf(tool);
  const validate = ajv.compile(tool.parameters);
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
  }
};

test('schema ⟷ guard agree for shell.exec', t => {
  checkAgreement(t, toolsByName().exec, execRecords);
});

test('schema ⟷ guard agree for shell.inspect', t => {
  checkAgreement(t, toolsByName().inspect, inspectRecords);
});

// --- dispatch + advisory veto ------------------------------------------------

const makeFakeShell = () => {
  /** @type {any[]} */
  const calls = [];
  const shell = Far('FakeShell', {
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      return harden({
        stdout: 'ran',
        stderr: '',
        exitCode: 0,
        signal: null,
        truncated: false,
      });
    },
    inspect: async () =>
      harden({
        allowedCommands: ['echo'],
        timeoutMs: 1000,
        maxOutputBytes: 1024,
      }),
  });
  return { shell, calls };
};

test('exec tool forwards command/args/options to the capability', async t => {
  const { shell, calls } = makeFakeShell();
  const byName = {};
  for (const tool of makeShellTool(/** @type {any} */ (shell))) {
    byName[tool.name] = tool;
  }
  const result = await byName.exec.invoke({
    command: 'echo',
    args: ['hello'],
    options: { timeoutMs: 500 },
  });
  t.is(/** @type {any} */ (result).stdout, 'ran');
  t.deepEqual(calls[0], {
    command: 'echo',
    args: ['hello'],
    options: { timeoutMs: 500 },
  });
});

test('advisory rejectPatterns vetoes before the capability is called', async t => {
  const { shell, calls } = makeFakeShell();
  const byName = {};
  for (const tool of makeShellTool(/** @type {any} */ (shell), {
    rejectPatterns: [{ pattern: /rm\b/, reason: 'no removals' }],
  })) {
    byName[tool.name] = tool;
  }
  await t.throwsAsync(
    () => byName.exec.invoke({ command: 'rm', args: ['-rf', '/'] }),
    { message: /no removals/ },
  );
  t.is(calls.length, 0, 'the vetoed command never reached the capability');
});

test('advisory rejectFlags vetoes a forbidden flag', async t => {
  const { shell } = makeFakeShell();
  const byName = {};
  for (const tool of makeShellTool(/** @type {any} */ (shell), {
    rejectFlags: [{ flag: '-i', reason: 'no in-place edits' }],
  })) {
    byName[tool.name] = tool;
  }
  await t.throwsAsync(
    () => byName.exec.invoke({ command: 'sed', args: ['-i', 's/a/b/'] }),
    { message: /no in-place edits/ },
  );
});
