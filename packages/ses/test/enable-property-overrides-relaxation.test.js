/* eslint-disable no-nested-ternary */

import '../index.js';
import test from 'ava';
import {
  minEnablements,
  moderateEnablements,
  severeEnablements,
} from '../src/enablements.js';

/**
 * @import {ExecutionContext} from 'ava';
 */

/**
 * Matches any non-empty string that consists exclusively of ASCII
 * letter/digit/underscore/percent sign and does not start with a digit.
 * Percent sign is allowed for unnamed primordials such as `%ObjectPrototype%`.
 */
const identifierLikePatt = /^[a-zA-Z_%][a-zA-Z_%0-9]*$/i;

const builtinSymbols = /** @type {Map<symbol, string>} */ (
  new Map(
    Reflect.ownKeys(Symbol).flatMap(key => {
      const value = Symbol[key];
      return typeof value === 'symbol' ? [[value, key]] : [];
    }),
  )
);

/** @type {(symbol: symbol) => string} */
const stringifySymbol = symbol => {
  const builtinSymbolName = builtinSymbols.get(symbol);
  if (builtinSymbolName) {
    return builtinSymbolName.match(identifierLikePatt)
      ? `Symbol.${builtinSymbolName}`
      : `Symbol[${JSON.stringify(builtinSymbolName)}]`;
  }
  const key = Symbol.keyFor(symbol);
  return key !== undefined
    ? `Symbol.for(${JSON.stringify(key)})`
    : `Symbol(${JSON.stringify(symbol.description)})`;
};

/**
 * Assert that some enablement value is a valid relaxation of a base enablement.
 * `true` may be relaxed only to `true`, "*" may be relaxed to `true` or "*",
 * and a base record may be relaxed to `true`, "*", or a record that includes a
 * superset of the base properties in which each property of the relaxation is
 * either absent from the base element or is (recursively) a valid
 * relaxation of the corresponding base enablement.
 *
 * @param {ExecutionContext} t
 * @param {any} base
 * @param {any} relaxation
 * @param {string} [path]
 */
const assertEnablementsRelaxation = (t, base, relaxation, path = '') => {
  // Relaxing to `true` is always acceptable.
  if (relaxation === true) return;

  // Otherwise, relaxation must either preserve `true`/"*" or be recursively
  // acceptable.
  if (base === true || base === '*') {
    t.is(
      relaxation,
      base,
      `relaxation must preserve ${JSON.stringify(base)} at ${path || 'top-level'}`,
    );
    return;
  }

  t.is(
    base === null ? 'null' : typeof base,
    'object',
    `base enablement at ${path || 'top-level'} must be \`true\`, "*", or a record`,
  );
  if (relaxation === '*') return;
  t.is(
    relaxation === null ? 'null' : typeof relaxation,
    'object',
    `relaxed enablement at ${path || 'top-level'} must be \`true\`, "*", or a record`,
  );

  const baseKeys = Reflect.ownKeys(base);
  const relaxationKeys = Reflect.ownKeys(relaxation);
  const missingKeys = baseKeys.filter(k => !relaxationKeys.includes(k));
  t.deepEqual(
    missingKeys,
    [],
    `relaxation must not omit base properties at ${path || 'top-level'}`,
  );
  for (const key of baseKeys) {
    const pathSuffix =
      typeof key === 'symbol'
        ? `[${stringifySymbol(key)}]`
        : key.match(identifierLikePatt)
          ? `.${key}`
          : `[${JSON.stringify(key)}]`;
    const subPath = `${path}${pathSuffix}`.replace(/^[.]/, '');
    const relaxationEnablement = Object.hasOwn(relaxation, key)
      ? relaxation[key]
      : undefined;
    assertEnablementsRelaxation(t, base[key], relaxationEnablement, subPath);
  }
};

test('moderateEnablements relaxes minEnablements', t => {
  assertEnablementsRelaxation(t, minEnablements, moderateEnablements);
});

test('severeEnablements relaxes moderateEnablements', t => {
  assertEnablementsRelaxation(t, moderateEnablements, severeEnablements);
});
