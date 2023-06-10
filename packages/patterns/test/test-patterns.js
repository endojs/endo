/* eslint-disable no-continue */
import { test } from './prepare-test-env-ava.js';
// eslint-disable-next-line import/order
import { makeTagged } from '@endo/marshal';
import { makeCopyBag, makeCopyMap, makeCopySet } from '../src/keys/checkKey.js';
import { mustMatch, matches, M } from '../src/patterns/patternMatchers.js';
import '../src/types.js';

const { Fail } = assert;

const runTests = (successCase, failCase) => {
  /**
   * @callback makeErrorMessage
   * @param {string} repr
   * @param {string} [kind]
   * @param {string} [type]
   * @returns {string}
   */
  /**
   * Methods corresponding with pattern matchers that don't look past type.
   *
   * @type {Record<methodName: string, makeErrorMessage: makeErrorMessage}
   */
  const simpleMethods = {
    any: _repr => Fail`must not expect rejection by M.any()`,
    and: _repr => Fail`must not expect rejection by M.and()`,

    scalar: (repr, kind, type = kind) =>
      `A "${type}" cannot be a scalar key: ${repr}`,
    key: (repr, kind) => `A passable tagged "${kind}" is not a key: ${repr}`,
    pattern: _repr => Fail`M.pattern() rejection messages must be customized`,

    boolean: (repr, kind) => `${kind} ${repr} - Must be a boolean`,
    number: (repr, kind) => `${kind} ${repr} - Must be a number`,
    bigint: (repr, kind) => `${kind} ${repr} - Must be a bigint`,
    string: (repr, kind) => `${kind} ${repr} - Must be a string`,
    symbol: (repr, kind) => `${kind} ${repr} - Must be a symbol`,
    record: (repr, kind) => `${kind} ${repr} - Must be a copyRecord`,
    array: (repr, kind) => `${kind} ${repr} - Must be a copyArray`,
    set: (repr, kind) => `${kind} ${repr} - Must be a copySet`,
    bag: (repr, kind) => `${kind} ${repr} - Must be a copyBag`,
    map: (repr, kind) => `${kind} ${repr} - Must be a copyMap`,
    remotable: (repr, kind) => `${kind} ${repr} - Must be a remotable`,
    error: (repr, kind) => `${kind} ${repr} - Must be a error`,
    promise: (repr, kind) => `${kind} ${repr} - Must be a promise`,
    undefined: (repr, kind) => `${kind} ${repr} - Must be a undefined`,
    null: repr => `${repr} - Must be: null`,
  };

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
    successCase(specimen, M.kind('number'));
    successCase(specimen, M.lte(7));
    successCase(specimen, M.gte(2));
    successCase(specimen, M.and(3, 3));
    successCase(specimen, M.or(3, 4));

    failCase(specimen, 4, '3 - Must be: 4');
    failCase(specimen, M.not(3), '3 - Must fail negated pattern: 3');
    failCase(
      specimen,
      M.not(M.any()),
      '3 - Must fail negated pattern: "[match:any]"',
    );
    failCase(specimen, M.nat(), 'number 3 - Must be a bigint');
    failCase(specimen, [3, 4], '3 - Must be: [3,4]');
    failCase(specimen, M.gte(7), '3 - Must be >= 7');
    failCase(specimen, M.lte(2), '3 - Must be <= 2');
    // incommensurate comparisons are neither <= nor >=
    failCase(specimen, M.lte('x'), '3 - Must be <= "x"');
    failCase(specimen, M.gte('x'), '3 - Must be >= "x"');
    failCase(specimen, M.lte(3n), '3 - Must be <= "[3n]"');
    failCase(specimen, M.gte(3n), '3 - Must be >= "[3n]"');
    failCase(specimen, M.and(3, 4), '3 - Must be: 4');
    failCase(specimen, M.or(4, 4), '3 - Must match one of [4,4]');
    failCase(specimen, M.or(), '3 - no pattern disjuncts to match: []');
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

    failCase(specimen, 4n, '"[0n]" - Must be: "[4n]"');
    failCase(specimen, M.not(0n), '"[0n]" - Must fail negated pattern: "[0n]"');
    failCase(
      specimen,
      M.not(M.any()),
      '"[0n]" - Must fail negated pattern: "[match:any]"',
    );
    failCase(specimen, [0n, 4n], '"[0n]" - Must be: ["[0n]","[4n]"]');
    failCase(specimen, M.gte(7n), '"[0n]" - Must be >= "[7n]"');
    failCase(specimen, M.lte(-1n), '"[0n]" - Must be <= "[-1n]"');
    // incommensurate comparisons are neither <= nor >=
    failCase(specimen, M.lte('x'), '"[0n]" - Must be <= "x"');
    failCase(specimen, M.gte('x'), '"[0n]" - Must be >= "x"');
    failCase(specimen, M.lte(0), '"[0n]" - Must be <= 0');
    failCase(specimen, M.gte(0), '"[0n]" - Must be >= 0');
    failCase(specimen, M.and(0n, 4n), '"[0n]" - Must be: "[4n]"');
    failCase(
      specimen,
      M.or(4n, 4n),
      '"[0n]" - Must match one of ["[4n]","[4n]"]',
    );
    failCase(specimen, M.or(), '"[0n]" - no pattern disjuncts to match: []');
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

    failCase(specimen, M.nat(), '"[-1n]" - Must be non-negative');
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

    failCase(specimen, [4, 3], '[3,4] - Must be: [4,3]');
    failCase(specimen, [3], '[3,4] - Must be: [3]');
    failCase(
      specimen,
      [M.string(), M.any()],
      '[0]: number 3 - Must be a string',
    );
    failCase(specimen, M.lte([3, 3]), '[3,4] - Must be <= [3,3]');
    failCase(specimen, M.gte([4, 4]), '[3,4] - Must be >= [4,4]');
    failCase(specimen, M.lte([3]), '[3,4] - Must be <= [3]');
    failCase(specimen, M.gte([3, 4, 1]), '[3,4] - Must be >= [3,4,1]');

    failCase(
      specimen,
      M.split([3, 4, 5, 6]),
      'Expected at least 4 arguments: [3,4]',
    );
    failCase(specimen, M.split([5]), 'arg 0: 3 - Must be: 5');
    failCase(specimen, M.split({}), 'copyArray [3,4] - Must be a copyRecord');
    failCase(specimen, M.split([3], 'x'), '...rest: [4] - Must be: "x"');

    failCase(specimen, M.partial([5]), 'arg 0?: 3 - Must be: 5');

    failCase(
      specimen,
      M.arrayOf(M.string()),
      '[0]: number 3 - Must be a string',
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
        makeMessage('{"foo":3,"bar":4}', 'copyRecord'),
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
      '{"foo":3,"bar":4} - Must be: {"foo":4,"bar":3}',
    );
    failCase(
      specimen,
      { foo: M.string(), bar: M.any() },
      'foo: number 3 - Must be a string',
    );
    failCase(
      specimen,
      M.lte({ foo: 3, bar: 3 }),
      '{"foo":3,"bar":4} - Must be <= {"foo":3,"bar":3}',
    );
    failCase(
      specimen,
      M.gte({ foo: 4, bar: 4 }),
      '{"foo":3,"bar":4} - Must be >= {"foo":4,"bar":4}',
    );

    // Incommensurates are neither greater nor less
    failCase(
      specimen,
      M.gte({ foo: 3 }),
      '{"foo":3,"bar":4} - Must be >= {"foo":3}',
    );
    failCase(
      specimen,
      M.lte({ foo: 3 }),
      '{"foo":3,"bar":4} - Must be <= {"foo":3}',
    );
    failCase(
      specimen,
      M.gte({ foo: 3, bar: 4, baz: 5 }),
      '{"foo":3,"bar":4} - Must be >= {"foo":3,"bar":4,"baz":5}',
    );
    failCase(
      specimen,
      M.lte({ foo: 3, bar: 4, baz: 5 }),
      '{"foo":3,"bar":4} - Must be <= {"foo":3,"bar":4,"baz":5}',
    );
    failCase(
      specimen,
      M.lte({ baz: 3 }),
      '{"foo":3,"bar":4} - Must be <= {"baz":3}',
    );
    failCase(
      specimen,
      M.gte({ baz: 3 }),
      '{"foo":3,"bar":4} - Must be >= {"baz":3}',
    );

    failCase(
      specimen,
      M.splitRecord({ foo: M.number() }, { bar: M.string(), baz: M.number() }),
      'bar?: number 4 - Must be a string',
    );

    failCase(
      specimen,
      M.split(
        { foo: M.number() },
        M.and(M.partial({ bar: M.string() }), M.partial({ baz: M.number() })),
      ),
      '...rest: bar?: number 4 - Must be a string',
    );

    failCase(
      specimen,
      M.split([]),
      'copyRecord {"foo":3,"bar":4} - Must be a copyArray',
    );
    failCase(
      specimen,
      M.split({ foo: 3, z: 4 }),
      '{"foo":3} - Must be: {"foo":3,"z":4}',
    );
    failCase(
      specimen,
      M.split({ foo: 3 }, { foo: 3, bar: 4 }),
      '...rest: {"bar":4} - Must be: {"foo":3,"bar":4}',
    );
    failCase(
      specimen,
      M.split({ foo: 3 }, { foo: M.any(), bar: 4 }),
      '...rest: {"bar":4} - Must have missing properties ["foo"]',
    );
    failCase(
      specimen,
      M.partial({ foo: 7, zip: 5 }, { bar: 4 }),
      'foo?: 3 - Must be: 7',
    );

    failCase(
      specimen,
      M.scalar(),
      'A "copyRecord" cannot be a scalar key: {"foo":3,"bar":4}',
    );
    failCase(
      specimen,
      M.map(),
      'copyRecord {"foo":3,"bar":4} - Must be a copyMap',
    );
    failCase(
      specimen,
      M.recordOf(M.number(), M.number()),
      'foo: [0]: string "foo" - Must be a number',
    );
    failCase(
      specimen,
      M.recordOf(M.string(), M.string()),
      'foo: [1]: number 3 - Must be a string',
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

    failCase(specimen, makeCopySet([]), '"[copySet]" - Must be: "[copySet]"');
    failCase(
      specimen,
      makeCopySet([3, 4, 5]),
      '"[copySet]" - Must be: "[copySet]"',
    );
    failCase(
      specimen,
      M.lte(makeCopySet([])),
      '"[copySet]" - Must be <= "[copySet]"',
    );
    failCase(
      specimen,
      M.gte(makeCopySet([3, 4, 5])),
      '"[copySet]" - Must be >= "[copySet]"',
    );
    failCase(
      specimen,
      M.setOf(M.string()),
      'set elements[0]: number 4 - Must be a string',
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

    failCase(
      specimen,
      M.gte(
        makeCopyBag([
          ['b', 2n],
          ['c', 1n],
        ]),
      ),
      '"[copyBag]" - Must be >= "[copyBag]"',
    );
    failCase(
      specimen,
      M.lte(
        makeCopyBag([
          ['b', 2n],
          ['c', 1n],
        ]),
      ),
      '"[copyBag]" - Must be <= "[copyBag]"',
    );
    failCase(
      specimen,
      M.bagOf(M.boolean()),
      'bag keys[0]: string "b" - Must be a boolean',
    );
    failCase(specimen, M.bagOf('b'), 'bag keys[1]: "a" - Must be: "b"');
    failCase(
      specimen,
      M.bagOf(M.any(), M.gt(5n)),
      'bag counts[0]: "[3n]" - Must be > "[5n]"',
    );
    failCase(
      specimen,
      M.bagOf(M.any(), M.gt(2n)),
      'bag counts[1]: "[2n]" - Must be > "[2n]"',
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
    // M.gt(makeCopyMap([])), Map comparison not yet implemented
    successCase(specimen, M.mapOf(M.record(), M.string()));

    failCase(
      specimen,
      M.mapOf(M.string(), M.string()),
      'map keys[0]: copyRecord {"foo":3} - Must be a string',
    );
    failCase(
      specimen,
      M.mapOf(M.record(), M.number()),
      'map values[0]: string "b" - Must be a number',
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
      if (method === 'scalar' || method === 'key' || method === 'null') {
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
          'cannot check unrecognized tag "mysteryTag": "[mysteryTag]"',
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
        successCase(specimen, M[method]());
        continue;
      }
      // This specimen has an invalid payload for its tag, so testing is less straightforward.
      const message =
        method === 'scalar' || method === 'key' || method === 'null'
          ? makeMessage('"[match:any]"', 'match:any', 'tagged')
          : 'match:any payload: 88 - Must be undefined';
      successCase(specimen, M.not(M[method]()));
      failCase(specimen, M[method](), message);
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
      if (method === 'scalar' || method === 'key' || method === 'null') {
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
          'match:remotable payload: 88 - Must be a copyRecord to match a copyRecord pattern: {"label":"[match:string]"}',
        );
      }
    }
    successCase(specimen, M.not(M.pattern()));
  }
  {
    const specimen = makeTagged('match:remotable', harden({ label: 88 }));
    successCase(specimen, M.any());
    successCase(specimen, M.not(M.pattern()));

    failCase(
      specimen,
      M.pattern(),
      'match:remotable payload: label: number 88 - Must be a string',
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
      'A passable tagged "match:recordOf" is not a key: "[match:recordOf]"',
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
      'match:recordOf payload: [1]: A "promise" cannot be a pattern',
    );
  }
};

test('test simple matches', t => {
  const successCase = (specimen, yesPattern) => {
    harden(specimen);
    harden(yesPattern);
    t.notThrows(() => mustMatch(specimen, yesPattern), `${yesPattern}`);
    t.assert(matches(specimen, yesPattern), `${yesPattern}`);
  };
  const failCase = (specimen, noPattern, message, isUnmatchable) => {
    harden(specimen);
    harden(noPattern);
    t.throws(() => mustMatch(specimen, noPattern), { message }, `${noPattern}`);
    if (isUnmatchable) {
      t.throws(() => matches(specimen, noPattern), { message }, `${noPattern}`);
    } else {
      t.false(matches(specimen, noPattern), `${noPattern}`);
    }
  };
  runTests(successCase, failCase);
});

test('masking match failure', t => {
  const nonSet = makeTagged('copySet', harden([M.string()]));
  const nonBag = makeTagged('copyBag', harden([[M.string(), 8n]]));
  const nonMap = makeTagged(
    'copyMap',
    harden({ keys: [M.string()], values: ['x'] }),
  );
  t.throws(() => mustMatch(nonSet, M.set()), {
    message: 'A passable tagged "match:string" is not a key: "[match:string]"',
  });
  t.throws(() => mustMatch(nonBag, M.bag()), {
    message: 'A passable tagged "match:string" is not a key: "[match:string]"',
  });
  t.throws(() => mustMatch(nonMap, M.map()), {
    message: 'A passable tagged "match:string" is not a key: "[match:string]"',
  });
});

test('well formed patterns', t => {
  // @ts-expect-error purposeful type violation for testing
  t.throws(() => M.remotable(88), {
    message: 'match:remotable payload: label: number 88 - Must be a string',
  });
});
