/* global StaticModuleRecord, Compartment */

import tap from 'tap';
import { resolveNode } from './node.js';
import '../ses.js';
import { freeze, keys } from '../src/commons.js';

const { test } = tap;

function heuristicRequires(moduleSource) {
  const dependsUpon = {};
  moduleSource.replace(
    /(?:^|[^\w$_.])require\s*\(\s*["']([^"']*)["']\s*\)/g,
    (_, id) => {
      dependsUpon[id] = true;
    },
  );
  return keys(dependsUpon);
}

const CjsStaticModuleRecord = (moduleSource, moduleLocation) => {
  if (typeof moduleSource !== 'string') {
    throw new TypeError(
      `Cannot create CommonJS static module record, module source must be a string, got ${moduleSource}`,
    );
  }
  if (typeof moduleLocation !== 'string') {
    throw new TypeError(
      `Cannot create CommonJS static module record, module location must be a string, got ${moduleLocation}`,
    );
  }

  const imports = heuristicRequires(moduleSource);
  const execute = (exports, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname) { ${moduleSource} //*/\n})\n//# sourceURL=${moduleLocation}`,
    );

    let moduleExports = exports;

    const module = {
      get exports() {
        return moduleExports;
      },
      set exports(namespace) {
        moduleExports = namespace;
        exports.default = namespace;
      },
    };

    const require = importSpecifier => {
      const namespace = compartment.importNow(resolvedImports[importSpecifier]);
      if (namespace.default !== undefined) {
        return namespace.default;
      }
      return namespace;
    };

    functor(
      require,
      exports,
      module,
      moduleLocation, // __filename
      new URL('./', moduleLocation).toString(), // __dirname
    );
  };
  return freeze({ imports, execute });
};

test('import a CommonJS module with exports assignment', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async () => {
    return CjsStaticModuleRecord(
      `
      exports.meaning = 42;
    `,
      'https://example.com/meaning.js',
    );
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const module = compartment.module('.');
  const {
    namespace: { meaning },
  } = await compartment.import('.');

  t.equal(meaning, 42, 'exports seen');
  t.equal(module.meaning, 42, 'exports seen through deferred proxy');
});

test('import a CommonJS module with exports replacement', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async () => {
    return CjsStaticModuleRecord(
      `
      module.exports = 42;
    `,
      'https://example.com/meaning.js',
    );
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const module = compartment.module('.');
  const {
    namespace: { default: meaning },
  } = await compartment.import('.');

  t.equal(meaning, 42, 'exports seen');
  t.equal(module.default, 42, 'exports seen through deferred proxy');
});

test('CommonJS module imports CommonJS module by name', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return CjsStaticModuleRecord(
        `
        exports.even = n => n % 2 === 0;
      `,
        'https://example.com/even.js',
      );
    }
    if (specifier === './odd') {
      return CjsStaticModuleRecord(
        `
        const { even } = require('./even');
        exports.odd = n => !even(n);
      `,
        'https://example.com/odd.js',
      );
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('CommonJS module imports CommonJS module as default', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return CjsStaticModuleRecord(
        `
        module.exports = n => n % 2 === 0;
      `,
        'https://example.com/even.js',
      );
    }
    if (specifier === './odd') {
      return CjsStaticModuleRecord(
        `
        const even = require('./even');
        module.exports = n => !even(n);
      `,
        'https://example.com/odd.js',
      );
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { default: odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('ESM imports CommonJS module as default', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return CjsStaticModuleRecord(
        `
        exports.default = n => n % 2 === 0;
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      return StaticModuleRecord(
        `
        import even from './even';
        export default n => !even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { default: odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('ESM imports CommonJS module by name', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return CjsStaticModuleRecord(
        `
        exports.even = n => n % 2 === 0;
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      return StaticModuleRecord(
        `
        import { even } from './even';
        export default n => !even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { default: odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('CommonJS module imports ESM as default', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return StaticModuleRecord(
        `
        export default n => n % 2 === 0;
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      return CjsStaticModuleRecord(
        `
          const even = require('./even');
          module.exports = n => !even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { default: odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('CommonJS module imports ESM by name', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return StaticModuleRecord(
        `
        export function even(n) {
         return n % 2 === 0;
        }
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      return CjsStaticModuleRecord(
        `
          const { even } = require('./even');
          exports.odd = n => !even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('cross import ESM and CommonJS modules', async t => {
  t.plan(5);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './src/main.js') {
      return CjsStaticModuleRecord(
        `
        const direct = require('./other.js');
        const indirect = require("./helper.mjs");
        t.equal(direct.a, 10);
        t.equal(direct.b, 20);
        t.equal(indirect.a, 10);
        t.equal(indirect.b, 20);
        t.equal(indirect.c, 30);
      `,
        'https://example.com/src/main.js',
      );
    }
    if (specifier === './src/helper.mjs') {
      return new StaticModuleRecord(`
        export * from './other.js';
        import d from './default.js';
        export const c = d;
      `);
    }
    if (specifier === './src/other.js') {
      return CjsStaticModuleRecord(
        `
        exports.a = 10;
        exports.b = 20;
      `,
        'https://example.com/src/other.js',
      );
    }
    if (specifier === './src/default.js') {
      return CjsStaticModuleRecord(
        `
        exports.default = 30;
      `,
        'https://example.com/src/default.js',
      );
    }
    throw new Error(`Cannot load module for specifier ${specifier}`);
  };

  const compartment = new Compartment({ t }, {}, { resolveHook, importHook });
  await compartment.import('./src/main.js');
});
