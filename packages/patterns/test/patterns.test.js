/* eslint-disable no-continue */
import harden from '@endo/harden';
import test from '@endo/ses-ava/test.js';

import { Fail } from '@endo/errors';
import { makeTagged, Far, qp, passableAsJustin } from '@endo/marshal';
import {
  makeCopyBag,
  makeCopyMap,
  makeCopySet,
  getCopyMapKeys,
} from '../src/keys/checkKey.js';
import { mustMatch, matches, M } from '../src/patterns/patternMatchers.js';

/** @import * as ava from 'ava' */

// TODO The desired semantics for CopyMap comparison have not yet been decided.
// See https://github.com/endojs/endo/pull/1737#pullrequestreview-1596595411
const copyMapComparison = (() => {
  try {
    return matches(makeCopyMap([]), makeCopyMap([]));
  } catch (err) {
    return false;
  }
})();

/**
 * Escape string for use in regex
 * @param {string} str
 */
const regexEscape = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Create pattern that matches either redacted or unredacted repr
 * @param {string} repr
 */
const reprPattern = repr => `(\\(an? \\w+\\)|${regexEscape(repr)})`;

const defineTests = (successCase, failCase) => {
  /**
   * @callback MakeErrorMessage
   * @param {string} repr
   * @param {string} [kind]
   * @param {string} [type]
   * @returns {string|RegExp}
   */
  /**
   * Methods corresponding with pattern matchers that don't look past type.
   *
   * @type {Record<string, MakeErrorMessage>}
   */
  const simpleMethods = {
    any: _repr => Fail`must not expect rejection by M.any()`,
    and: _repr => Fail`must not expect rejection by M.and()`,

    scalar: (repr, kind, type = kind) =>
      new RegExp(`^A "${type}" cannot be a scalar key: ${reprPattern(repr)}$`),
    key: (repr, kind) =>
      new RegExp(
        `^A passable tagged "${kind}" is not a key: ${reprPattern(repr)}$`,
      ),
    pattern: _repr => Fail`M.pattern() rejection messages must be customized`,

    boolean: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a boolean$`),
    number: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a number$`),
    bigint: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a bigint$`),
    string: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a string$`),
    symbol: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a symbol$`),
    record: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a copyRecord$`),
    array: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a copyArray$`),
    set: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a copySet$`),
    bag: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a copyBag$`),
    map: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a copyMap$`),
    remotable: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a remotable$`),
    error: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a error$`),
    promise: (repr, kind) =>
      new RegExp(`^${kind} ${reprPattern(repr)} - Must be a promise$`),
    // M.undefined() and M.null() match as exact Keys rather than kinds.
    undefined: repr =>
      new RegExp(
        `^${reprPattern(repr)} - Must be: (\\(an? \\w+\\)|"\\[undefined\\]")$`,
      ),
    null: repr =>
      new RegExp(`^${reprPattern(repr)} - Must be: (\\(an? \\w+\\)|null)$`),
  };
  const tagIgnorantMethods = ['scalar', 'key', 'undefined', 'null'];

  {
    const specimen = 3;
    successCase(specimen, 3);
    const yesMethods = ['number', 'any', 'and', 'scalar', 'key', 'pattern'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method]());
        continue;
      }
      successCase(specimen, M.not(M[method]()));
      failCase(specimen, M[method](), makeMessage('3', 'number'));
    }
    successCase(specimen, M.not(4));
    successCase(specimen, M.kind('number'), ' (duplicate)');
    successCase(specimen, M.lte(7));
    successCase(specimen, M.gte(2));
    successCase(specimen, M.and(3, 3));
    successCase(specimen, M.or(3, 4));

    failCase(specimen, 4, /^(\(a number\)|3) - Must be: (\(a number\)|4)$/);
    failCase(
      specimen,
      M.not(3),
      /(\(a number\)|3) - Must fail negated pattern: (\(a string\)|"`3`")/,
    );
    failCase(
      specimen,
      M.not(M.any()),
      /^(\(a number\)|3) - Must fail negated pattern: (\(a string\)|"`makeTagged\(\\"match:any\\", undefined\)`")$/,
    );
    failCase(specimen, M.nat(), /^number (\(a number\)|3) - Must be a bigint$/);
    failCase(
      specimen,
      [3, 4],
      /^(\(a number\)|3) - Must be: (\(an object\)|\[3,4\])$/,
    );
    failCase(
      specimen,
      M.gte(7),
      /^(\(a number\)|3) - Must be >= (\(a number\)|7)$/,
    );
    failCase(
      specimen,
      M.lte(2),
      /^(\(a number\)|3) - Must be <= (\(a number\)|2)$/,
    );
    // incommensurate comparisons are neither <= nor >=
    failCase(
      specimen,
      M.lte('x'),
      /^(\(a number\)|3) - Must be <= (\(a string\)|"x")$/,
    );
    failCase(
      specimen,
      M.gte('x'),
      /^(\(a number\)|3) - Must be >= (\(a string\)|"x")$/,
    );
    failCase(
      specimen,
      M.lte(3n),
      /^(\(a number\)|3) - Must be <= (\(a bigint\)|"\[3n\]")$/,
    );
    failCase(
      specimen,
      M.gte(3n),
      /^(\(a number\)|3) - Must be >= (\(a bigint\)|"\[3n\]")$/,
    );
    failCase(
      specimen,
      M.and(3, 4),
      /^(\(a number\)|3) - Must be: (\(a number\)|4)$/,
    );
    failCase(
      specimen,
      M.or(4, 4),
      new RegExp(
        `^(\\(a number\\)|3) - Must match one of (\\(a string\\)|${regexEscape(JSON.stringify(qp([4, 4])))})$`,
      ),
    );
    failCase(
      specimen,
      M.or(),
      /^(\(a number\)|3) - no pattern disjuncts to match: (\(a string\)|"`\[\]`")$/,
    );
    failCase(
      specimen,
      M.tagged(),
      /^Expected tagged object, not "number": (\(a number\)|3)$/,
    );
  }
  {
    const specimen = 0n;
    successCase(specimen, 0n);
    const yesMethods = ['bigint', 'any', 'and', 'scalar', 'key', 'pattern'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method]());
        continue;
      }
      successCase(specimen, M.not(M[method]()));
      failCase(specimen, M[method](), makeMessage('"[0n]"', 'bigint'));
    }
    successCase(specimen, M.nat());
    successCase(specimen, M.not(4n));
    successCase(specimen, M.kind('bigint'));
    successCase(specimen, M.lte(7n));
    successCase(specimen, M.gte(-1n));
    successCase(specimen, M.and(0n, 0n));
    successCase(specimen, M.or(0n, 4n));

    failCase(
      specimen,
      4n,
      /^(\(a bigint\)|"\[0n\]") - Must be: (\(a bigint\)|"\[4n\]")$/,
    );
    failCase(
      specimen,
      M.not(0n),
      /^(\(a bigint\)|"\[0n\]") - Must fail negated pattern: (\(a string\)|"`0n`")$/,
    );
    failCase(
      specimen,
      M.not(M.any()),
      /^(\(a bigint\)|"\[0n\]") - Must fail negated pattern: (\(a string\)|"`makeTagged\(\\"match:any\\", undefined\)`")$/,
    );
    failCase(
      specimen,
      [0n, 4n],
      /^(\(a bigint\)|"\[0n\]") - Must be: (\(an object\)|\["\[0n\]","\[4n\]"\])$/,
    );
    failCase(
      specimen,
      M.gte(7n),
      /^(\(a bigint\)|"\[0n\]") - Must be >= (\(a bigint\)|"\[7n\]")$/,
    );
    failCase(
      specimen,
      M.lte(-1n),
      /^(\(a bigint\)|"\[0n\]") - Must be <= (\(a bigint\)|"\[-1n\]")$/,
    );
    // incommensurate comparisons are neither <= nor >=
    failCase(
      specimen,
      M.lte('x'),
      /^(\(a bigint\)|"\[0n\]") - Must be <= (\(a string\)|"x")$/,
    );
    failCase(
      specimen,
      M.gte('x'),
      /^(\(a bigint\)|"\[0n\]") - Must be >= (\(a string\)|"x")$/,
    );
    failCase(
      specimen,
      M.lte(0),
      /^(\(a bigint\)|"\[0n\]") - Must be <= (\(a number\)|0)$/,
    );
    failCase(
      specimen,
      M.gte(0),
      /^(\(a bigint\)|"\[0n\]") - Must be >= (\(a number\)|0)$/,
    );
    failCase(
      specimen,
      M.and(0n, 4n),
      /^(\(a bigint\)|"\[0n\]") - Must be: (\(a bigint\)|"\[4n\]")$/,
    );
    failCase(
      specimen,
      M.or(4n, 4n),
      new RegExp(
        `^(\\(a bigint\\)|"\\[0n\\]") - Must match one of (\\(a string\\)|${regexEscape(JSON.stringify(qp([4n, 4n])))})$`,
      ),
    );
    failCase(
      specimen,
      M.or(),
      /^(\(a bigint\)|"\[0n\]") - no pattern disjuncts to match: (\(a string\)|"`\[\]`")$/,
    );
  }
  {
    const specimen = -1n;
    successCase(specimen, -1n);
    const yesMethods = ['bigint', 'any', 'and', 'scalar', 'key', 'pattern'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method]());
        continue;
      }
      successCase(specimen, M.not(M[method]()));
      failCase(specimen, M[method](), makeMessage('"[-1n]"', 'bigint'));
    }
    successCase(specimen, M.not(4n));
    successCase(specimen, M.kind('bigint'));
    successCase(specimen, M.lte(-1n));
    successCase(specimen, M.gte(-1n));

    failCase(
      specimen,
      M.nat(),
      /^(\(a bigint\)|"\[-1n\]") - Must be non-negative$/,
    );
  }
  {
    const specimen = [3, 4];
    successCase(specimen, [3, 4]);
    const yesMethods = ['array', 'any', 'and', 'key', 'pattern'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method]());
        continue;
      }
      successCase(specimen, M.not(M[method]()));
      failCase(specimen, M[method](), makeMessage('[3,4]', 'copyArray'));
    }
    successCase(specimen, [M.number(), M.any()]);
    successCase(specimen, [M.lte(3), M.gte(3)]);
    // Arrays compare lexicographically
    successCase(specimen, M.gte([3, 3]));
    successCase(specimen, M.lte([4, 4]));
    successCase(specimen, M.gte([3]));
    successCase(specimen, M.lte([3, 4, 1]));

    successCase(specimen, M.split([3], [4]));
    successCase(specimen, M.split([3]));
    successCase(specimen, M.split([3], M.array()));
    successCase(specimen, M.split([3, 4], []));
    successCase(specimen, M.split([], [3, 4]));

    successCase(specimen, M.partial([3], [4]));
    successCase(specimen, M.partial([3, 4, 5, 6]));
    successCase(specimen, M.partial([3, 4, 5, 6], []));

    successCase(specimen, M.arrayOf(M.number()));

    successCase(specimen, M.containerHas(3));
    successCase(specimen, M.containerHas(3, 1n), ' (duplicate)');
    successCase(specimen, M.containerHas(M.number(), 2n));

    failCase(
      specimen,
      [4, 3],
      /^(\(an object\)|\[3,4\]) - Must be: (\(an object\)|\[4,3\])$/,
    );
    failCase(
      specimen,
      [3],
      /^(\(an object\)|\[3,4\]) - Must be: (\(an object\)|\[3\])$/,
    );
    failCase(
      specimen,
      [M.string(), M.any()],
      /^\[0\]: number (\(a number\)|3) - Must be a string$/,
    );
    failCase(
      specimen,
      M.lte([3, 3]),
      /^(\(an object\)|\[3,4\]) - Must be <= (\(an object\)|\[3,3\])$/,
    );
    failCase(
      specimen,
      M.gte([4, 4]),
      /^(\(an object\)|\[3,4\]) - Must be >= (\(an object\)|\[4,4\])$/,
    );
    failCase(
      specimen,
      M.lte([3]),
      /^(\(an object\)|\[3,4\]) - Must be <= (\(an object\)|\[3\])$/,
    );
    failCase(
      specimen,
      M.gte([3, 4, 1]),
      /^(\(an object\)|\[3,4\]) - Must be >= (\(an object\)|\[3,4,1\])$/,
    );

    failCase(
      specimen,
      M.split([3, 4, 5, 6]),
      /^Expected at least (\(a number\)|4) arguments: (\(an object\)|\[3,4\])$/,
    );
    failCase(
      specimen,
      M.split([5]),
      /^arg 0: (\(a number\)|3) - Must be: (\(a number\)|5)$/,
    );
    failCase(
      specimen,
      M.split({}),
      /^copyArray (\(an object\)|\[3,4\]) - Must be a copyRecord$/,
    );
    failCase(
      specimen,
      M.split([3], 'x'),
      /^\.\.\.rest: (\(an object\)|\[4\]) - Must be: (\(a string\)|"x")$/,
    );

    failCase(
      specimen,
      M.partial([5]),
      /^arg 0\?: (\(a number\)|3) - Must be: (\(a number\)|5)$/,
    );

    failCase(
      specimen,
      M.arrayOf(M.string()),
      /^\[0\]: number (\(a number\)|3) - Must be a string$/,
    );

    failCase(
      specimen,
      M.containerHas('c'),
      'Has only "[0n]" matches, but needs "[1n]"',
    );
  }
  {
    const specimen = { foo: 3, bar: 4 };
    successCase(specimen, { foo: 3, bar: 4 });
    const yesMethods = ['record', 'any', 'and', 'key', 'pattern'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method]());
        continue;
      }
      successCase(specimen, M.not(M[method]()));
      failCase(
        specimen,
        M[method](),
        makeMessage('{"bar":4,"foo":3}', 'copyRecord'),
      );
    }
    successCase(specimen, { foo: M.number(), bar: M.any() });
    successCase(specimen, { foo: M.lte(3), bar: M.gte(3) });
    // Records compare pareto
    successCase(specimen, M.gte({ foo: 3, bar: 3 }));
    successCase(specimen, M.lte({ foo: 4, bar: 4 }));
    successCase(
      specimen,
      M.split(
        { foo: M.number() },
        M.and(M.partial({ bar: M.number() }), M.partial({ baz: M.number() })),
      ),
    );
    successCase(
      specimen,
      M.split(
        { foo: M.number() },
        M.partial({ bar: M.number(), baz: M.number() }),
      ),
    );

    successCase(specimen, M.split({ foo: 3 }, { bar: 4 }));
    successCase(specimen, M.split({ bar: 4 }, { foo: 3 }));
    successCase(specimen, M.split({ foo: 3 }));
    successCase(specimen, M.split({ foo: 3 }, M.record()));
    successCase(specimen, M.split({}, { foo: 3, bar: 4 }));
    successCase(specimen, M.split({ foo: 3, bar: 4 }, {}));

    successCase(specimen, M.partial({ zip: 5, zap: 6 }));
    successCase(specimen, M.partial({ zip: 5, zap: 6 }, { foo: 3, bar: 4 }));
    successCase(specimen, M.partial({ foo: 3, zip: 5 }, { bar: 4 }));

    successCase(specimen, M.recordOf(M.string(), M.number()));

    failCase(
      specimen,
      { foo: 4, bar: 3 },
      /^(\(an object\)|\{"bar":4,"foo":3\}) - Must be: (\(an object\)|\{"bar":3,"foo":4\})$/,
    );
    failCase(
      specimen,
      { foo: M.string(), bar: M.any() },
      /^foo: number (\(a number\)|3) - Must be a string$/,
    );
    failCase(
      specimen,
      M.lte({ foo: 3, bar: 3 }),
      /^(\(an object\)|\{"bar":4,"foo":3\}) - Must be <= (\(an object\)|\{"bar":3,"foo":3\})$/,
    );
    failCase(
      specimen,
      M.gte({ foo: 4, bar: 4 }),
      /^(\(an object\)|\{"bar":4,"foo":3\}) - Must be >= (\(an object\)|\{"bar":4,"foo":4\})$/,
    );

    // Incommensurates are neither greater nor less
    failCase(
      specimen,
      M.gte({ foo: 3 }),
      /^(\(an object\)|\{"bar":4,"foo":3\}) - Must be >= (\(an object\)|\{"foo":3\})$/,
    );
    failCase(
      specimen,
      M.lte({ foo: 3 }),
      /^(\(an object\)|\{"bar":4,"foo":3\}) - Must be <= (\(an object\)|\{"foo":3\})$/,
    );
    failCase(
      specimen,
      M.gte({ foo: 3, bar: 4, baz: 5 }),
      /^(\(an object\)|\{"bar":4,"foo":3\}) - Must be >= (\(an object\)|\{"bar":4,"baz":5,"foo":3\})$/,
    );
    failCase(
      specimen,
      M.lte({ foo: 3, bar: 4, baz: 5 }),
      /^(\(an object\)|\{"bar":4,"foo":3\}) - Must be <= (\(an object\)|\{"bar":4,"baz":5,"foo":3\})$/,
    );
    failCase(
      specimen,
      M.lte({ baz: 3 }),
      /^(\(an object\)|\{"bar":4,"foo":3\}) - Must be <= (\(an object\)|\{"baz":3\})$/,
    );
    failCase(
      specimen,
      M.gte({ baz: 3 }),
      /^(\(an object\)|\{"bar":4,"foo":3\}) - Must be >= (\(an object\)|\{"baz":3\})$/,
    );

    successCase(specimen, M.splitRecord({}, undefined, undefined));
    successCase(specimen, M.splitRecord({}, { unused: M.string() }));
    failCase(
      specimen,
      M.splitRecord({ foo: M.number() }, { bar: M.string(), baz: M.number() }),
      /^bar\?: number (\(a number\)|4) - Must be a string$/,
    );
    failCase(
      specimen,
      M.splitRecord({}, { unused: M.string() }, M.string()),
      /^\.\.\.rest: copyRecord (\(an object\)|\{"bar":4,"foo":3\}) - Must be a string$/,
    );

    failCase(
      specimen,
      M.split(
        { foo: M.number() },
        M.and(M.partial({ bar: M.string() }), M.partial({ baz: M.number() })),
      ),
      /^\.\.\.rest: bar\?: number (\(a number\)|4) - Must be a string$/,
    );

    failCase(
      specimen,
      M.split([]),
      /^copyRecord (\(an object\)|\{"bar":4,"foo":3\}) - Must be a copyArray$/,
    );
    failCase(
      specimen,
      M.split({ foo: 3, z: 4 }),
      /^(\(an object\)|\{"foo":3\}) - Must be: (\(an object\)|\{"foo":3,"z":4\})$/,
    );
    failCase(
      specimen,
      M.split({ foo: 3 }, { foo: 3, bar: 4 }),
      /^\.\.\.rest: (\(an object\)|\{"bar":4\}) - Must be: (\(an object\)|\{"bar":4,"foo":3\})$/,
    );
    failCase(
      specimen,
      M.split({ foo: 3 }, { foo: M.any(), bar: 4 }),
      /^\.\.\.rest: (\(an object\)|\{"bar":4\}) - Must have missing properties (\(an object\)|\["foo"\])$/,
    );
    failCase(
      specimen,
      M.partial({ foo: 7, zip: 5 }, { bar: 4 }),
      /^foo\?: (\(a number\)|3) - Must be: (\(a number\)|7)$/,
    );

    failCase(
      specimen,
      M.scalar(),
      /^A "copyRecord" cannot be a scalar key: (\(an object\)|\{"bar":4,"foo":3\})$/,
      false,
      ' (duplicate)',
    );
    failCase(
      specimen,
      M.map(),
      /^copyRecord (\(an object\)|\{"bar":4,"foo":3\}) - Must be a copyMap$/,
      false,
      ' (duplicate)',
    );
    failCase(
      specimen,
      M.recordOf(M.number(), M.number()),
      /^foo: \[0\]: string (\(a string\)|"foo") - Must be a number$/,
    );
    failCase(
      specimen,
      M.recordOf(M.string(), M.string()),
      /^foo: \[1\]: number (\(a number\)|3) - Must be a string$/,
    );
  }
  {
    const specimen = makeCopySet([3, 4]);
    successCase(specimen, makeCopySet([4, 3]));
    const yesMethods = ['set', 'any', 'and', 'key', 'pattern'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method]());
        continue;
      }
      successCase(specimen, M.not(M[method]()));
      failCase(
        specimen,
        M[method](),
        makeMessage('"[copySet]"', 'copySet', 'tagged'),
      );
    }
    successCase(specimen, M.gte(makeCopySet([])));
    successCase(specimen, M.lte(makeCopySet([3, 4, 5])));
    successCase(specimen, M.setOf(M.number()));

    successCase(specimen, M.containerHas(3));
    successCase(specimen, M.containerHas(3, 1n), ' (duplicate)');
    successCase(specimen, M.containerHas(M.number(), 2n));

    failCase(
      specimen,
      makeCopySet([]),
      /^(\(an object\)|"\[copySet\]") - Must be: (\(an object\)|"\[copySet\]")$/,
    );
    failCase(
      specimen,
      makeCopySet([3, 4, 5]),
      /^(\(an object\)|"\[copySet\]") - Must be: (\(an object\)|"\[copySet\]")$/,
    );
    failCase(
      specimen,
      M.lte(makeCopySet([])),
      /^(\(an object\)|"\[copySet\]") - Must be <= (\(an object\)|"\[copySet\]")$/,
    );
    failCase(
      specimen,
      M.gte(makeCopySet([3, 4, 5])),
      /^(\(an object\)|"\[copySet\]") - Must be >= (\(an object\)|"\[copySet\]")$/,
    );
    failCase(
      specimen,
      M.setOf(M.string()),
      /^set elements\[0\]: number (\(a number\)|4) - Must be a string$/,
    );

    failCase(
      specimen,
      M.containerHas('c'),
      /^Has only (\(a bigint\)|"\[0n\]") matches, but needs (\(a bigint\)|"\[1n\]")$/,
    );
  }
  {
    const specimen = makeCopyBag([
      ['a', 2n],
      ['b', 3n],
    ]);
    const yesMethods = ['bag', 'any', 'and', 'key', 'pattern'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method]());
        continue;
      }
      successCase(specimen, M.not(M[method]()));
      failCase(
        specimen,
        M[method](),
        makeMessage('"[copyBag]"', 'copyBag', 'tagged'),
      );
    }
    successCase(specimen, M.gt(makeCopyBag([])));
    successCase(specimen, M.gt(makeCopyBag([['a', 2n]])));
    successCase(
      specimen,
      M.gt(
        makeCopyBag([
          ['a', 1n],
          ['b', 3n],
        ]),
      ),
    );
    successCase(specimen, M.bagOf(M.string()));
    successCase(specimen, M.bagOf(M.string(), M.lt(5n)));
    successCase(specimen, M.bagOf(M.string(), M.gte(2n)));

    successCase(specimen, M.containerHas('a'));
    successCase(specimen, M.containerHas('a', 2n));
    successCase(specimen, M.containerHas(M.string(), 5n));
    successCase(specimen, M.containerHas('a', 1n), ' (duplicate)');
    successCase(specimen, M.containerHas('b', 2n));

    failCase(
      specimen,
      M.gte(
        makeCopyBag([
          ['b', 2n],
          ['c', 1n],
        ]),
      ),
      /^(\(an object\)|"\[copyBag\]") - Must be >= (\(an object\)|"\[copyBag\]")$/,
    );
    failCase(
      specimen,
      M.lte(
        makeCopyBag([
          ['b', 2n],
          ['c', 1n],
        ]),
      ),
      /^(\(an object\)|"\[copyBag\]") - Must be <= (\(an object\)|"\[copyBag\]")$/,
    );
    failCase(
      specimen,
      M.bagOf(M.boolean()),
      /^bag keys\[0\]: string (\(a string\)|"b") - Must be a boolean$/,
    );
    failCase(
      specimen,
      M.bagOf('b'),
      /^bag keys\[1\]: (\(a string\)|"a") - Must be: (\(a string\)|"b")$/,
    );

    failCase(
      specimen,
      M.containerHas('c'),
      'Has only "[0n]" matches, but needs "[1n]"',
    );
  }
  {
    const specimen = makeCopyMap([
      [{}, 'a'],
      [{ foo: 3 }, 'b'],
    ]);
    const yesMethods = ['map', 'any', 'and', 'key', 'pattern'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method]());
        continue;
      }
      successCase(specimen, M.not(M[method]()));
      failCase(
        specimen,
        M[method](),
        makeMessage('"[copyMap]"', 'copyMap', 'tagged'),
      );
    }
    test('copymap comparison', t => {
      // TODO Remove `t.throws` and `Fail` when CopyMap comparison is implemented
      t.throws(
        () => {
          copyMapComparison || Fail`No CopyMap comparison support`;
          // @ts-expect-error XXX Key types
          successCase(specimen, M.gt(makeCopyMap([])));
        },
        { message: 'No CopyMap comparison support' },
        'CopyMap comparison support (time to unwrap assertions?)',
      );
    });
    successCase(specimen, M.mapOf(M.record(), M.string()));

    failCase(
      specimen,
      M.mapOf(M.string(), M.string()),
      /^map keys\[0\]: copyRecord (\(an object\)|\{"foo":3\}) - Must be a string$/,
    );
    failCase(
      specimen,
      M.mapOf(M.record(), M.number()),
      /^map values\[0\]: string (\(a string\)|"b") - Must be a number$/,
    );
  }
  {
    const specimen = makeTagged('mysteryTag', 88);
    const yesMethods = ['any', 'and'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method]());
        continue;
      }
      // This specimen is not a Key, so testing is less straightforward.
      if (tagIgnorantMethods.includes(method)) {
        successCase(specimen, M.not(M[method]()));
        failCase(
          specimen,
          M[method](),
          makeMessage('"[mysteryTag]"', 'mysteryTag', 'tagged'),
        );
      } else {
        failCase(
          specimen,
          M[method](),
          /^cannot check unrecognized tag "mysteryTag": (\(an object\)|"\[mysteryTag\]")$/,
        );
      }
    }
  }
  {
    const specimen = makeTagged('match:any', undefined);
    const yesMethods = ['any', 'and', 'pattern'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method]());
        continue;
      }
      // This specimen is not a Key, so testing is less straightforward.
      successCase(specimen, M.not(M[method]()));
      failCase(
        specimen,
        M[method](),
        makeMessage('"[match:any]"', 'match:any', 'tagged'),
      );
    }
  }
  {
    const specimen = makeTagged('match:any', 88);
    const yesMethods = ['any', 'and'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method](), ' (loop test)');
        continue;
      }
      // This specimen has an invalid payload for its tag, so testing is less straightforward.
      const message = tagIgnorantMethods.includes(method)
        ? makeMessage('"[match:any]"', 'match:any', 'tagged')
        : /^match:any payload: (\(a number\)|88) - Must be undefined$/;
      successCase(specimen, M.not(M[method]()), false, ' (loop test)');
      failCase(specimen, M[method](), message, false, ' (loop test)');
    }
  }
  {
    const specimen = makeTagged('match:remotable', 88);
    const yesMethods = ['any', 'and'];
    for (const [method, makeMessage] of Object.entries(simpleMethods)) {
      if (yesMethods.includes(method)) {
        successCase(specimen, M[method]());
        continue;
      }
      // This specimen is not a Key, so testing is less straightforward.
      if (tagIgnorantMethods.includes(method)) {
        successCase(specimen, M.not(M[method]()));
        failCase(
          specimen,
          M[method](),
          makeMessage('"[match:remotable]"', 'match:remotable', 'tagged'),
        );
      } else {
        failCase(
          specimen,
          M[method](),
          new RegExp(
            `^match:remotable payload: (\\(a number\\)|88) - Must be a copyRecord to match a copyRecord pattern: (\\(a string\\)|${regexEscape(JSON.stringify(qp({ label: M.string() })))})$`,
          ),
        );
      }
    }
    successCase(specimen, M.not(M.pattern()));
  }
  {
    const specimen = makeTagged('match:remotable', harden({ label: 88 }));
    successCase(specimen, M.any(), ' (remotable)');
    successCase(specimen, M.not(M.pattern()), ' (remotable)');

    failCase(
      specimen,
      M.pattern(),
      /match:remotable payload: label: number (\(a number\)|88) - Must be a string/,
    );
  }
  {
    const specimen = makeTagged(
      'match:recordOf',
      harden([M.string(), M.nat()]),
    );
    successCase(specimen, M.pattern());

    failCase(
      specimen,
      M.key(),
      /^A passable tagged "match:recordOf" is not a key: (\(an object\)|"\[match:recordOf\]")$/,
    );
  }
  {
    const specimen = makeTagged(
      'match:recordOf',
      harden([M.string(), Promise.resolve(null)]),
    );
    successCase(specimen, M.any());
    successCase(specimen, M.not(M.pattern()));

    failCase(
      specimen,
      M.pattern(),
      /^match:recordOf payload: \[1\]: A "promise" cannot be a pattern$/,
    );
  }
  const specimen = makeTagged('Vowish', {
    vowVX: Far('VowVX', {}),
  });
  successCase(specimen, M.any());
  successCase(specimen, M.tagged());
  successCase(specimen, M.tagged('Vowish'));
  successCase(
    specimen,
    M.tagged(
      'Vowish',
      harden({
        vowVX: M.remotable('VowVX'),
      }),
    ),
  );
  failCase(
    specimen,
    M.record(),
    /^cannot check unrecognized tag "Vowish": (\(an object\)|"\[Vowish\]")$/,
  );
  failCase(
    specimen,
    M.kind('tagged'),
    /^cannot check unrecognized tag "Vowish": (\(an object\)|"\[Vowish\]")$/,
  );
  failCase(
    specimen,
    M.tagged('Vowoid'),
    /^tag: (\(a string\)|"Vowish") - Must be: (\(a string\)|"Vowoid")$/,
  );
  failCase(
    specimen,
    M.tagged(undefined, harden({})),
    /^payload: (\(an object\)|\{"vowVX":"\[Alleged: VowVX\]"\}) - Must be: (\(an object\)|\{\})$/,
  );
};

/**
 * @param {ava.ExecutionContext} t
 * @param {any} specimen
 * @param {any} pattern
 * @param {string} [label]
 * @returns {void}
 */
const assertMatch = (t, specimen, pattern, label) => {
  t.notThrows(() => mustMatch(specimen, pattern), label);
  t.true(matches(specimen, pattern), label);
};

/**
 * @param {ava.ExecutionContext} t
 * @param {any} specimen
 * @param {any} pattern
 * @param {string|RegExp} message
 * @param {boolean} [isUnmatchable]
 * @param {string} [label]
 * @returns {void}
 */
const assertNoMatch = (t, specimen, pattern, message, isUnmatchable, label) => {
  t.throws(() => mustMatch(specimen, pattern), { message }, label);
  if (isUnmatchable) {
    t.throws(() => matches(specimen, pattern), { message }, label);
  } else {
    t.false(matches(specimen, pattern), label);
  }
};

{
  const successCase = (specimen, yesPattern, nameSuffix = '') => {
    harden(specimen);
    harden(yesPattern);
    test(
      `assertMatch ${passableAsJustin(specimen, false)} ${qp(yesPattern)}${nameSuffix}`,
      assertMatch,
      specimen,
      yesPattern,
      `${yesPattern}`,
    );
  };
  const failCase = (
    specimen,
    noPattern,
    message,
    isUnmatchable,
    nameSuffix = '',
  ) => {
    harden(specimen);
    harden(noPattern);
    test(
      `assertNoMatch ${passableAsJustin(specimen, false)} ${qp(noPattern)}${nameSuffix}`,
      assertNoMatch,
      specimen,
      noPattern,
      message,
      isUnmatchable,
      `${noPattern}`,
    );
  };
  defineTests(successCase, failCase);
}

test('masking match failure', t => {
  const nonSet = makeTagged('copySet', harden([M.string()]));
  const nonBag = makeTagged('copyBag', harden([[M.string(), 8n]]));
  const nonMap = makeTagged(
    'copyMap',
    harden({ keys: [M.string()], values: ['x'] }),
  );
  assertNoMatch(
    t,
    nonSet,
    M.set(),
    /A passable tagged "match:string" is not a key: (\(an object\)|"\[match:string\]")/,
  );
  assertNoMatch(
    t,
    nonBag,
    M.bag(),
    /A passable tagged "match:string" is not a key: (\(an object\)|"\[match:string\]")/,
  );
  assertNoMatch(
    t,
    nonMap,
    M.map(),
    /A passable tagged "match:string" is not a key: (\(an object\)|"\[match:string\]")/,
  );
});

test('collection contents rankOrder tie insensitivity', t => {
  const assertMutualMatch = values => {
    const [[label1, value1], [label2, value2]] = Object.entries(values);
    t.notDeepEqual(
      value1,
      value2,
      `${label1} and ${label2} must be distinguishable`,
    );
    assertMatch(
      t,
      value1,
      value2,
      `${label1} specimen must be matched by ${label2} pattern`,
    );
    assertMatch(
      t,
      value2,
      value1,
      `${label2} specimen must be matched by ${label1} pattern`,
    );
  };

  const r1 = Far('r1');
  const r2 = Far('r2');
  assertMutualMatch({
    set1: makeCopySet([r1, r2]),
    set2: makeCopySet([r2, r1]),
  });
  assertMutualMatch({
    bag1: makeCopyBag([
      [r1, 2n],
      [r2, 2n],
    ]),
    bag2: makeCopyBag([
      [r2, 2n],
      [r1, 2n],
    ]),
  });
  // TODO Remove `t.throws` and `Fail` when CopyMap comparison is implemented
  t.throws(
    () => {
      copyMapComparison || Fail`No CopyMap comparison support`;
      assertMutualMatch({
        map1: makeCopyMap([
          [r1, 'value'],
          [r2, 'value'],
        ]),
        map2: makeCopyMap([
          [r2, 'value'],
          [r1, 'value'],
        ]),
      });
    },
    { message: 'No CopyMap comparison support' },
    'CopyMap comparison support (time to unwrap assertions?)',
  );

  const map1 = makeCopyMap([
    [r1, 1],
    [r2, 2],
  ]);
  const map2 = makeCopyMap([
    [r2, M.gte(2)],
    [r1, M.lte(1)],
  ]);
  t.notDeepEqual(
    getCopyMapKeys(map1),
    getCopyMapKeys(map2),
    'Must have CopyMaps with distinct key permutations',
  );
  assertMatch(
    t,
    map1,
    map2,
    'CopyMap must be matched by non-Key Pattern with different key order',
  );
});

test('well formed patterns', t => {
  // @ts-expect-error purposeful type violation for testing
  t.throws(() => M.remotable(88), {
    message:
      /match:remotable payload: label: number (\(a number\)|88) - Must be a string/,
  });

  t.throws(() => M.containerHas('c', 0n), {
    message:
      /^M\.containerHas payload: \[1\]: (\(a bigint\)|"\[0n\]") - Must be >= (\(a bigint\)|"\[1n\]")$/,
  });
  // @ts-expect-error purposeful type violation for testing
  t.throws(() => M.containerHas('c', M.nat()), {
    message:
      /^M\.containerHas payload: \[1\]: A passable tagged "match:nat" is not a key: (\(an object\)|"\[match:nat\]")$/,
  });
  // @ts-expect-error purposeful type violation for testing
  t.throws(() => M.containerHas(3, 1), {
    message:
      /^M\.containerHas payload: \[1\]: (\(a number\)|1) - Must be >= (\(a bigint\)|"\[1n\]")$/,
  });
});
