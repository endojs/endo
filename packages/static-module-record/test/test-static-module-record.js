// @ts-check
/// <reference types="ses"/>
/* eslint no-underscore-dangle: ["off"] */

// eslint-disable-next-line import/order
import { StaticModuleRecord } from '../src/static-module-record.js';
import './lockdown.js';
import avaTest from 'ava';
import { wrapTest } from '@endo/ses-ava';

const test = wrapTest(avaTest);

/** @typedef {import('ava').ExecutionContext} TestContext */

/**
 * @callback Updater
 * @param {any} value
 */
/** @typedef {Map<string, Map<string, Array<Updater>>>} ImportUpdaters */

/**
 * @param {TestContext} t
 * @param {StaticModuleRecord} record
 */
function assertDefaultExport(t, record) {
  t.deepEqual(record.imports, []);
  t.deepEqual(record.exports, ['default']);
  t.deepEqual(record.reexports, []);
  t.deepEqual(record.__fixedExportMap__, { default: ['default'] });
  t.deepEqual(record.__liveExportMap__, {});
}

test('export default', t => {
  t.plan(8);
  const record = new StaticModuleRecord('export default bb;');
  assertDefaultExport(t, record);

  const compartment = new Compartment({
    bb: 'bingbang',
  });
  const functor = compartment.evaluate(record.__syncModuleProgram__);
  t.is(typeof functor, 'function');

  functor({
    imports: () => {
      t.assert(true);
    },
    onceVar: {
      /** @type {(value: string) => void} */
      default: bb => {
        t.is(bb, 'bingbang');
      },
    },
  });
});

/**
 * @param {TestContext} t
 * @param {string} source
 * @param {Object} [options]
 * @param {Object} [options.endowments]
 * @param {Map<string, Map<string, any>>} [options.imports]
 */
function initialize(t, source, options = {}) {
  const { endowments, imports = new Map() } = options;
  const record = new StaticModuleRecord(source);
  t.log(record.__syncModuleProgram__);
  const liveUpdaters = {};
  const onceUpdaters = {};
  const namespace = {};
  const log = [];

  const compartment = new Compartment(endowments);

  Object.entries(record.__liveExportMap__).forEach(
    ([exportedName, [localName]]) => {
      /** @param {any} value */
      const set = value => {
        namespace[exportedName] = value;
        log.push(`${exportedName}: ${JSON.stringify(value)}`);
      };
      const get = () => {
        return namespace[exportedName];
      };

      // Initialization uses the fast local variable.
      liveUpdaters[localName] = set;

      // Live updates fall through to the scope proxy.
      // Live updates could be accomodated with an invasive rewrite of all
      // references to the variable in scope, but we elected to avoid
      // transforming code except for import and export statements, in order to
      // minimize surprise in debugging.
      Object.defineProperty(compartment.globalThis, localName, { get, set });
    },
  );

  Object.entries(record.__fixedExportMap__).forEach(
    ([exportedName, [localName]]) => {
      /** @param {any} value */
      onceUpdaters[localName] = value => {
        t.assert(!(exportedName in namespace));
        namespace[exportedName] = value;
        log.push(`${exportedName}: ${JSON.stringify(value)}`);
      };
    },
  );
console.error('>>',record.__syncModuleProgram__)
  const functor = compartment.evaluate(record.__syncModuleProgram__);

  /** @type {Map<string, Map<string, Updater>>} */
  const updaters = new Map();

  /**
   * @param {ImportUpdaters} newUpdaters
   */
  function updateImports(newUpdaters) {
    for (const [module, moduleUpdaters] of newUpdaters) {
      const moduleImports = imports.get(module);
      const testUpdaters = new Map();
      updaters.set(module, testUpdaters);
      if (moduleImports) {
        for (const [importName, importUpdaters] of moduleUpdaters) {
          /** @param {any} value */
          const updateImport = value => {
            for (const importUpdater of importUpdaters) {
              importUpdater(value);
            }
          };
          testUpdaters.set(importName, updateImport);
          if (moduleImports.has(importName)) {
            updateImport(moduleImports.get(importName));
          }
        }
      }
    }

    // Reexports are by convention facilitated outside the function source.
    for (const module of record.reexports || []) {
      const moduleImports = imports.get(module);
      if (moduleImports === undefined) {
        t.fail(`link error for reexported module ${module}`);
      } else {
        for (const [importName, importValue] of moduleImports.entries()) {
          namespace[importName] = importValue;
        }
      }
    }
  }

  functor({
    imports: updateImports,
    liveVar: liveUpdaters,
    onceVar: onceUpdaters,
    importMeta: { url: 'file://meta.url' },
  });

  return { record, namespace, log, updaters };
}

test('export default anonymous class', t => {
  const { record, namespace } = initialize(
    t,
    `\
export default class {
  valueOf() {
    return 45;
  }
}
`,
  );
  assertDefaultExport(t, record);
  /**
   * @typedef {Object} Class
   * @property {() => number} valueOf
   */
  const Class = /** @type {new () => Class} */ namespace.default;
  const instance = new Class();
  t.is(instance.valueOf(), 45);
});

test('export default and handle shebang', t => {
  const { record, namespace } = initialize(
    t,
    `\
#! /usr/bin/env node
export default 123
`,
  );
  assertDefaultExport(t, record);
  t.is(namespace.default, 123);
});

test('export default arguments (not technically valid but must be handled)', t => {
  const { record, namespace } = initialize(t, `export default arguments`);
  assertDefaultExport(t, record);
  t.is(typeof namespace.default, 'object');
  t.is(namespace.default[0], record.__syncModuleProgram__);
  t.is(namespace.default.length, 1);
});

test.failing('export default this', t => {
  const { record, namespace } = initialize(t, `export default this`);
  assertDefaultExport(t, record);
  t.is(namespace.default, undefined);
});

test('export named', t => {
  const { log } = initialize(
    t,
    `\
export let abc = 123;
export let def = 456;
export let def2 = def;
def ++;
def += 1;
def = 789;
export const ghi = 'abc';
`,
  );

  t.deepEqual(log, [
    'abc: 123',
    'def: 456',
    'def2: 456',
    'def: 457', // update
    'def: 458', // update
    'def: 789', // update
    'ghi: "abc"',
  ]);
});

test('export destructure', t => {
  const { record, namespace } = initialize(
    t,
    `\
    export const abc = 123;
    export const { def, nest: [, ghi, ...nestrest], ...rest } = {
      def: 456,
      nest: ['skip', 789, 'a', 'b'],
      other: 999,
      and: 998
    };
`,
  );
  t.deepEqual(record.imports, []);
  t.deepEqual(
    [...record.exports].sort(),
    ['abc', 'def', 'ghi', 'nestrest', 'rest'].sort(),
  );
  t.deepEqual(record.reexports, []);
  // abc and def2 are declared as 'let' but de-facto fixed since there are no
  // subsequent updates.
  t.deepEqual(record.__fixedExportMap__, {
    abc: ['abc'],
    def: ['def'],
    ghi: ['ghi'],
    nestrest: ['nestrest'],
    rest: ['rest'],
  });
  t.deepEqual(record.__liveExportMap__, {});

  t.deepEqual(namespace, {
    abc: 123,
    def: 456,
    ghi: 789,
    nestrest: ['a', 'b'],
    rest: { other: 999, and: 998 },
  });
});

test('const exports without hoisting', t => {
  t.throws(
    () =>
      initialize(
        t,
        `\
const abc2 = abc;
export const abc = 123;
`,
      ),
    {
      instanceOf: ReferenceError,
      message: "Cannot access 'abc' before initialization",
    },
  );
});

test('let exports without hoisting', t => {
  t.throws(
    () =>
      initialize(
        t,
        `\
const abc2 = abc;
export let abc = 123;
`,
      ),
    {
      instanceOf: ReferenceError,
      message: `Cannot access 'abc' before initialization`,
    },
  );
});

test('var exports with hoisting', t => {
  const { log } = initialize(
    t,
    `\
export const abc2 = abc;
export var abc = 123;
export const abc3 = abc;
`,
  );
  t.deepEqual(log, [
    'abc: undefined',
    'abc2: undefined',
    'abc: 123',
    'abc3: 123',
  ]);
});

test('function exports with hoisting', t => {
  const { namespace } = initialize(
    t,
    `\
export const fn2 = fn;
export function fn() {
  return 'foo';
}
export const fn3 = fn;
`,
  );
  const { fn, fn2, fn3 } = namespace;
  t.is(fn2, fn, 'function hoisting');
  t.is(fn, fn3, 'function exports with hoisting');
  t.is(fn(), 'foo', 'fn evaluates');
});

test('export class and let', t => {
  const { namespace } = initialize(
    t,
    `\
export let count = 0;
export class C {} if (C) { count += 1; }
`,
  );
  const { C, count } = namespace;
  t.truthy(new C(), 'class exports');
  t.is(C.name, 'C', 'class is named C');
  t.is(count, 1, 'class C is global');
});

test('export default named class', t => {
  const { namespace } = initialize(
    t,
    `\
export default class C {}
`,
  );
  const { default: C } = namespace;
  t.truthy(new C(), 'default class constructs');
  t.is(C.name, 'C', 'C class name');
});

test('export named class', t => {
  const { namespace } = initialize(
    t,
    `\
export class C {}
`,
  );
  const { C } = namespace;
  t.truthy(new C(), 'default class constructs');
  t.is(C.name, 'C', 'C class name');
});

test('export default class expression', t => {
  const { namespace } = initialize(
    t,
    `\
export default (class {});
`,
  );
  const { default: C } = namespace;
  t.truthy(new C(), 'default class constructs');
  t.is(C.name, 'default', 'C class name');
});

test('hoist export function', t => {
  const { namespace } = initialize(
    t,
    `\
F(123);
export function F(arg) { return arg; }
`,
  );
  const { F } = namespace;
  t.is(F.name, 'F', 'F function name');
});

test('hoist default async export named function', async t => {
  const { namespace } = initialize(
    t,
    `\
F(123);
export default async function F(arg) { return arg; }
`,
  );
  const { default: F } = namespace;
  t.is(F.name, 'F', 'F function name');
  const ret = F('foo');
  t.truthy(ret instanceof Promise, 'F is async');
  t.is(await ret, 'foo', 'F returns correctly');
});

test('hoist default async export anonymous function', async t => {
  const { namespace } = initialize(
    t,
    `\
export default async function (arg) { return arg; }
`,
  );
  const { default: F } = namespace;
  t.is(F.name, 'default', 'default function name');
  const ret = F('foo');
  t.truthy(ret instanceof Promise, 'F is async');
  t.is(await ret, 'foo', 'F returns correctly');
});

test('zero width joiner is reserved', t => {
  t.throws(() => {
    const _ = new StaticModuleRecord(
      `const $h\u200d_import = 123; $h\u200d_import`,
    );
  });
});

test('zero width joiner in constified variable is reserved', t => {
  t.throws(() => {
    const _ = new StaticModuleRecord(
      `const $c\u200d_myVar = 123; $c\u200d_myVar`,
    );
  });
});

test('zero width joiner is allowed in non-reserved words', t => {
  const { namespace } = initialize(
    t,
    `const $h\u200d_import2 = 123; export default $h\u200d_import2`,
  );
  const { default: name } = namespace;
  t.is(name, 123);
});

test('private member syntax works', t => {
  const { namespace } = initialize(
    t,
    `\
class outer {
  #x = 42;
  f() {
    return this.#x;
  }
}
export default new outer().f();
`,
  );
  t.is(namespace.default, 42);
});

test('nested export fails as syntax', t => {
  t.throws(() => new StaticModuleRecord(`{ void 0; export default null; }`), {
    instanceOf: SyntaxError,
  });
});

test('import * as name', t => {
  const module = {};

  const { namespace } = initialize(
    t,
    `\
import * as ns from 'module';
export default ns;
`,
    {
      imports: new Map([['module', new Map([['*', module]])]]),
    },
  );

  t.is(namespace.default, module);
});

test('import names', t => {
  const { namespace } = initialize(
    t,
    `\
import { foo, bar } from 'module';
export const foobar = foo + bar;
`,
    {
      imports: new Map([
        [
          'module',
          new Map([
            ['foo', 10],
            ['bar', 20],
          ]),
        ],
      ]),
    },
  );

  t.is(namespace.foobar, 30);
});

test('import name', t => {
  const { namespace } = initialize(
    t,
    `
import name from 'module';
export default name;
`,
    {
      imports: new Map([['module', new Map([['default', 'xyz']])]]),
    },
  );
  t.is(namespace.default, 'xyz');
});

test('import default and names', t => {
  const { namespace } = initialize(
    t,
    `
import name, { exported as imported } from 'module';
export default [name, imported];
`,
    {
      imports: new Map([
        [
          'module',
          new Map([
            ['default', 'apples'],
            ['exported', 'oranges'],
          ]),
        ],
      ]),
    },
  );
  t.deepEqual(namespace.default, ['apples', 'oranges']);
});

test('import for side-effect', t => {
  const { record } = initialize(t, `import 'module'`);
  t.deepEqual(record.__fixedExportMap__, {});
  t.deepEqual(record.__liveExportMap__, {});
  t.deepEqual(record.imports, ['module']);
});
test('import meta', t => {
  t.notThrows(() => initialize(t, `const a = import.meta.url`));
});
test('import meta in export', t => {
  let namespace = {};
  t.notThrows(() => {
    namespace = initialize(t, `export const a = 'ok ' + import.meta.url;
    const unrelated = {b:import.meta.url};`)
      .namespace;
  });
  t.is(namespace.a, 'ok file://meta.url');
});
test('import meta member uttered', t => {
  const record = new StaticModuleRecord(`const a = import.meta.url`);
  t.is(record.__usesImportMeta__, true);
});
test('import meta uttered', t => {
  const record = new StaticModuleRecord(`const a = import.meta`);
  t.is(record.__usesImportMeta__, true);
});

test('export names', t => {
  const { namespace } = initialize(
    t,
    `export { apples, oranges } from 'module';`,
    {
      imports: new Map([
        [
          'module',
          new Map([
            ['apples', 'apples'],
            ['oranges', 'oranges'],
            ['tomatoes', 'tomatoes'],
          ]),
        ],
      ]),
    },
  );
  t.is(namespace.apples, 'apples');
  t.is(namespace.oranges, 'oranges');
  t.is(namespace.tomatoes, undefined);
});

test('export name as', t => {
  const { namespace } = initialize(
    t,
    `export { peaches as stonefruit, oranges as citrus } from 'module';`,
    {
      imports: new Map([
        [
          'module',
          new Map([
            ['peaches', 'stonefruit'],
            ['oranges', 'citrus'],
            ['tomatoes', 'nightshades'],
          ]),
        ],
      ]),
    },
  );
  t.log(namespace);
  t.is(namespace.stonefruit, 'stonefruit');
  t.is(namespace.citrus, 'citrus');
  t.is(namespace.peaches, undefined);
  t.is(namespace.oranges, undefined);
  t.is(namespace.tomatoes, undefined);
  t.is(namespace.nightshades, undefined);
});

test('export all', t => {
  const { namespace } = initialize(t, `export * from 'module';`, {
    imports: new Map([
      [
        'module',
        new Map([
          ['apples', 'apples'],
          ['oranges', 'oranges'],
        ]),
      ],
    ]),
  });
  t.is(namespace.apples, 'apples');
  t.is(namespace.oranges, 'oranges');
});

// TODO cross product let, class, maybe var:

test('Object.hasOwnProperty override mistake should not crash transform', t => {
  const { __fixedExportMap__ } = new StaticModuleRecord(`
    const { hasOwnProperty } = Object;
    export { hasOwnProperty };
  `);
  t.deepEqual(__fixedExportMap__, { hasOwnProperty: ['hasOwnProperty'] });

  const { __liveExportMap__ } = new StaticModuleRecord(`
    let hop = 1;
    ({ hasOwnProperty: hop } = Object);
    export { hop as hasOwnProperty };
  `);
  t.deepEqual(__liveExportMap__, { hasOwnProperty: ['hop', true] });

  const { imports } = new StaticModuleRecord(`
    import { hasOwnProperty } from 'hasOwnProperty';
  `);
  t.deepEqual(imports, ['hasOwnProperty']);
});

test('export function should be fixed when not assigned', t => {
  const { __fixedExportMap__, __liveExportMap__ } = new StaticModuleRecord(`
    export function work() {}
  `);
  t.deepEqual(__fixedExportMap__, {
    work: ['work'],
  });
  t.deepEqual(__liveExportMap__, {});
});

test('export function should be live when assigned', t => {
  const { __fixedExportMap__, __liveExportMap__ } = new StaticModuleRecord(`
    export function work() {}
    work = () => {};
  `);
  t.deepEqual(__fixedExportMap__, {});
  t.deepEqual(__liveExportMap__, {
    work: ['work', true],
  });
});

test('export const name as default', t => {
  const { __fixedExportMap__, __liveExportMap__ } = new StaticModuleRecord(`
    const meaning = 42;
    export { meaning as default };
  `);
  t.deepEqual(__fixedExportMap__, {
    default: ['meaning'],
  });
  t.deepEqual(__liveExportMap__, {});
});

test('export name as default from', t => {
  const {
    __syncModuleProgram__,
    __fixedExportMap__,
    __liveExportMap__,
  } = new StaticModuleRecord(`
    export { meaning as default } from './meaning.js';
  `);
  // t.log(__syncModuleProgram__);
  t.deepEqual(__fixedExportMap__, {});
  t.deepEqual(__liveExportMap__, {
    default: ['meaning', false],
  });
});

// Regression test for #823
test('static module records can name Map in scope', t => {
  t.notThrows(() => initialize(t, `const { Map } = globalThis;`));
});

// Regression test for comment duplication
test('static module records do not duplicate comments', t => {
  const { __syncModuleProgram__: program } = new StaticModuleRecord(`
    let hi = 'hi';
    /* I both lead and follow */
    let bye = 'bye';
  `);
  t.is([...program.matchAll(/both/g)].length, 1);
});
