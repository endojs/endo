// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

/** @import { ERef } from '@endo/far' */
/** @import { InterfaceGuard, Pattern } from '@endo/patterns' */
/** @import { GitToolCapability } from '../src/types.js' */

import test from 'ava';
import { Ajv } from 'ajv';
import {
  M,
  matches,
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import { Far } from '@endo/far';
import { GitInterface } from '@endo/exo-git';

import { makeGitTool } from '../src/git-tool.js';

/**
 * Conformance checks for hand-authored JSON Schemas and runtime guards.
 */

const ajv = new Ajv({ strict: false });

/**
 * Positional guard structure from `GitInterface`.
 *
 * @param {string} method
 */
const guardShapeFor = method => {
  const { methodGuards } = getInterfaceGuardPayload(
    /** @type {InterfaceGuard} */ (GitInterface),
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
 * Decide whether the runtime guards accept a named-args record.
 *
 * @param {{requiredCount:number, guards:Pattern[]}} shape
 * @param {Record<string, unknown>} record
 */
const guardAccepts = (shape, record) => {
  const { requiredCount, guards } = shape;
  const allowed = new Set(guards.map((_g, i) => `arg${i}`));
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return false;
  }
  for (let i = 0; i < guards.length; i += 1) {
    const key = `arg${i}`;
    // JSON has no `undefined`, so a known `argN: undefined` is treated as absent.
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

/**
 * Candidate named-args records covering valid and invalid shapes.
 */
const candidateRecords = harden([
  {},
  { arg0: 'a-string' },
  { arg0: '' },
  { arg0: 42 },
  { arg0: 42n },
  { arg0: true },
  { arg0: null },
  { arg0: undefined },
  { arg0: {} },
  { arg0: { k: 'v' } },
  { arg0: [] },
  { arg1: 'only-second' },
  { arg0: 'a', arg1: {} },
  { arg0: 'a', arg1: { opt: 1 } },
  { arg0: 'a', arg1: 'not-a-record' },
  { arg0: 'a', arg1: 5 },
  { arg0: {}, arg1: {} },
  { arg0: 'a', arg2: 'extra' },
  { arg0: 'a', extra: 'x' },
  { extra: 'x' },
  { extra: undefined },
  { arg0: undefined, arg1: undefined },
  { arg0: 'a', arg1: {}, arg2: 'too-many' },
  // Open-object option records.
  { arg0: { a: 1, b: 2 } },
  { arg0: { nested: { x: 1 } } },
  { arg0: harden({ author: 'alice', oneline: true, maxCount: 10 }) },
  { arg0: 'a', arg1: { a: 1, b: 2 } },
  { arg0: 'a', arg1: { nested: { x: 1 } } },
  { arg0: 'a', arg1: harden({ track: true, startPoint: 'main' }) },
]);

const gitTools = makeGitTool(
  // This test inspects schemas and guards; it never invokes the capability.
  /** @type {ERef<GitToolCapability>} */ (
    /** @type {unknown} */ (Far('InertGit', {}))
  ),
);

for (const tool of gitTools) {
  test(`schema ⟷ guard agree for git.${tool.name}`, t => {
    const shape = guardShapeFor(tool.name);
    const validate = ajv.compile(tool.parameters);
    let checked = 0;
    for (const record of candidateRecords) {
      const guardOk = guardAccepts(shape, record);
      const schemaOk = validate({ ...record });
      t.is(
        schemaOk,
        guardOk,
        `${tool.name}: schema=${schemaOk} guard=${guardOk} for ${JSON.stringify(
          record,
          (_k, v) => (typeof v === 'bigint' ? `${v}n` : v),
        )}`,
      );
      checked += 1;
    }
    t.true(checked > 0);
  });
}

// --- bigint synthetic case ----------------------------------------------
//
// The current Git slice has no bigint args, so this covers the bigint
// guard-to-schema mapping directly.

const BIGINT_GUARD = M.bigint();
const BIGINT_SCHEMA = harden({
  type: 'string',
  pattern: '^[+-]?\\d+$',
});
const BIGINT_SCHEMA_WRONG = harden({ type: 'integer' });

test('bigint guard and string-pattern schema agree', t => {
  const validateStr = ajv.compile(BIGINT_SCHEMA);

  /** @type {Array<[unknown, unknown]>} */
  const pairs = harden([
    [5n, '5'],
    [5n, '+5'],
    [-3n, '-3'],
    [0n, '0'],
    [123456789012345678901234567890n, '123456789012345678901234567890'],
    ['x', 'x'],
    [5.5, '5.5'],
    [{}, '{}'],
    [true, 'true'],
    ['', ''],
  ]);

  for (const [guardValue, wireValue] of pairs) {
    const guardOk = matches(guardValue, BIGINT_GUARD);
    const schemaOk = validateStr(wireValue);
    t.is(
      schemaOk,
      guardOk,
      `bigint: guard(${String(guardValue)})=${guardOk} schema(${JSON.stringify(
        wireValue,
      )})=${schemaOk}`,
    );
  }

  t.true(matches(5n, BIGINT_GUARD));
  t.true(validateStr('5'));
  t.true(validateStr('+5'));
  t.true(validateStr('-3'));
  t.false(validateStr('x'));
  t.false(validateStr('5.5'));
  t.false(validateStr('{}'));
});

test('{type:integer} schema diverges from a bigint guard', t => {
  const validateInt = ajv.compile(BIGINT_SCHEMA_WRONG);

  let divergences = 0;

  {
    const schemaOk = validateInt(5);
    const guardOk = matches(5, BIGINT_GUARD);
    t.true(schemaOk, 'integer-schema accepts the JSON number 5');
    t.false(guardOk, 'bigint-guard rejects the JS number 5');
    if (schemaOk !== guardOk) divergences += 1;
  }

  {
    const schemaOk = validateInt('5');
    const guardOk = matches(5n, BIGINT_GUARD);
    t.false(schemaOk, 'integer-schema rejects the string "5"');
    t.true(guardOk, 'bigint-guard accepts 5n');
    if (schemaOk !== guardOk) divergences += 1;
  }

  t.true(
    divergences >= 1,
    'an {type:integer} schema diverges from a bigint guard',
  );
});
