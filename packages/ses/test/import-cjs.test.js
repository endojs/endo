import test from 'ava';
import { ModuleSource } from '@endo/module-source';
import { resolveNode } from './node.js';
import '../index.js';
import { freeze, keys } from '../src/commons.js';

function heuristicAnalysis(moduleSource) {
  const dependsUpon = {};
  const exports = {};
  moduleSource.replace(
    /(?:^|[^\w$_.])require\s*\(\s*["']([^"']*)["']\s*\)/g,
    (_, id) => {
      dependsUpon[id] = true;
    },
  );
  moduleSource.replace(/(?:^|[^\w$_.])exports\.(\w[\w\d]*)\s*=/g, (_, name) => {
    exports[name] = true;
  });
  moduleSource.replace(/(?:^|[^\w$_.])module\.exports\s*=/g, () => {
    exports.default = true;
  });
  return {
    imports: keys(dependsUpon),
    exports: keys(exports),
  };
}

const CjsModuleSource = (moduleSource, moduleLocation) => {
  if (typeof moduleSource !== 'string') {
    throw TypeError(
      `Cannot create CommonJS virtual module source, module source must be a string, got ${moduleSource}`,
    );
  }
  if (typeof moduleLocation !== 'string') {
    throw TypeError(
      `Cannot create CommonJS virtual module source, module location must be a string, got ${moduleLocation}`,
    );
  }

  const { imports, exports } = heuristicAnalysis(moduleSource);

  const execute = (moduleExports, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname) { ${moduleSource} //*/\n})\n//# sourceURL=${moduleLocation}`,
    );

    const module = {
      get exports() {
        return moduleExports;
      },
      set exports(newModuleExports) {
        moduleExports.default = newModuleExports;
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
      moduleExports,
      module,
      moduleLocation, // __filename
      new URL('./', moduleLocation).toString(), // __dirname
    );
  };

  return freeze({ imports, exports, execute });
};

test('import a CommonJS module with exports assignment', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async () => {
    return CjsModuleSource(
      `
      exports.meaning = 42;
    `,
      'https://example.com/meaning.js',
    );
  };

  const compartment = new Compartment({
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const module = compartment.module('.');
  const { meaning } = await compartment.import('.');

  t.is(meaning, 42, 'exports seen');
  t.is(module.meaning, 42, 'exports seen through deferred proxy');
});

test('import a CommonJS module with exports replacement', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async () => {
    return CjsModuleSource(
      `
      module.exports = 42;
    `,
      'https://example.com/meaning.js',
    );
  };

  const compartment = new Compartment({
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const module = compartment.module('.');
  const { default: meaning } = await compartment.import('.');

  t.is(meaning, 42, 'exports seen');
  t.is(module.default, 42, 'exports seen through deferred proxy');
});

test('CommonJS module imports CommonJS module by name', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return CjsModuleSource(
        `
        exports.even = n => n % 2 === 0;
      `,
        'https://example.com/even.js',
      );
    }
    if (specifier === './odd') {
      return CjsModuleSource(
        `
        const { even } = require('./even');
        exports.odd = n => !even(n);
      `,
        'https://example.com/odd.js',
      );
    }
    throw Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const { odd } = await compartment.import('./odd');

  t.is(odd(1), true);
  t.is(odd(2), false);
});

test('CommonJS module imports CommonJS module as default', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return CjsModuleSource(
        `
        module.exports = n => n % 2 === 0;
      `,
        'https://example.com/even.js',
      );
    }
    if (specifier === './odd') {
      return CjsModuleSource(
        `
        const even = require('./even');
        module.exports = n => !even(n);
      `,
        'https://example.com/odd.js',
      );
    }
    throw Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const namespace = await compartment.import('./odd');
  const { default: odd } = namespace;

  t.is(odd(1), true);
  t.is(odd(2), false);
});

test('ESM imports CommonJS module as default', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return CjsModuleSource(
        `
        module.exports = n => n % 2 === 0;
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      return new ModuleSource(
        `
        import even from './even';
        export default n => !even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const { default: odd } = await compartment.import('./odd');

  t.is(odd(1), true);
  t.is(odd(2), false);
});

test('ESM imports CommonJS module as star', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return CjsModuleSource(
        `
        exports.even = n => n % 2 === 0;
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      return new ModuleSource(
        `
        import * as evens from './even';
        export default n => !evens.even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const { default: odd } = await compartment.import('./odd');

  t.is(odd(1), true);
  t.is(odd(2), false);
});

test('ESM imports CommonJS module with replaced exports as star', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return CjsModuleSource(
        `
        module.exports = { even: n => n % 2 === 0 };
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      // It should be evens.even(n) not evens.default.even(n)
      // but CjsModuleSource is not enough to handle that
      return new ModuleSource(
        `
        import * as evens from './even';
        export default n => !evens.default.even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const { default: odd } = await compartment.import('./odd');

  t.is(odd(1), true);
  t.is(odd(2), false);
});

test('ESM imports CommonJS module by name', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return CjsModuleSource(
        `
        exports.even = n => n % 2 === 0;
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      return new ModuleSource(
        `
        import { even } from './even';
        export default n => !even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const { default: odd } = await compartment.import('./odd');

  t.is(odd(1), true);
  t.is(odd(2), false);
});

test('CommonJS module imports ESM as default', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return new ModuleSource(
        `
        export default n => n % 2 === 0;
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      return CjsModuleSource(
        `
          const even = require('./even');
          module.exports = n => !even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const { default: odd } = await compartment.import('./odd');

  t.is(odd(1), true);
  t.is(odd(2), false);
});

test('CommonJS module imports ESM by name', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return new ModuleSource(
        `
        export function even(n) {
         return n % 2 === 0;
        }
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      return CjsModuleSource(
        `
          const { even } = require('./even');
          exports.odd = n => !even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const { odd } = await compartment.import('./odd');

  t.is(odd(1), true);
  t.is(odd(2), false);
});

test('cross import ESM and CommonJS modules', async t => {
  t.plan(5);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './src/main.js') {
      return CjsModuleSource(
        `
        const direct = require('./other.js');
        const indirect = require("./helper.mjs");
        t.is(direct.a, 10);
        t.is(direct.b, 20);
        t.is(indirect.a, 10);
        t.is(indirect.b, 20);
        t.is(indirect.c, 30);
      `,
        'https://example.com/src/main.js',
      );
    }
    if (specifier === './src/helper.mjs') {
      return new ModuleSource(`
        export * from './other.js';
        import d from './default.js';
        export const c = d;
      `);
    }
    if (specifier === './src/other.js') {
      return CjsModuleSource(
        `
        exports.a = 10;
        exports.b = 20;
      `,
        'https://example.com/src/other.js',
      );
    }
    if (specifier === './src/default.js') {
      return CjsModuleSource(
        `
        exports.default = 30;
      `,
        'https://example.com/src/default.js',
      );
    }
    throw Error(`Cannot load module for specifier ${specifier}`);
  };

  const compartment = new Compartment({
    globals: { t },
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });
  await compartment.import('./src/main.js');
});

test('live bindings through through an ESM between CommonJS modules', async t => {
  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './src/main.js') {
      return CjsModuleSource(
        `
        const dep = require("./intermediate.mjs");
        t.is(dep.value, undefined);
        dep.reanimate();
        t.is(dep.check(), 30);
        t.is(dep.value, 30);
      `,
        'https://example.com/src/main.js',
      );
    }
    if (specifier === './src/intermediate.mjs') {
      return new ModuleSource(`
        export * from './value.js';
        import { value } from './value.js';
        export function check() {
          return value;
        }
      `);
    }
    if (specifier === './src/value.js') {
      return CjsModuleSource(
        `
        exports.reanimate = () => {
          exports.value = 30;
        };
      `,
        'https://example.com/src/value.js',
      );
    }
    throw Error(`Cannot load module for specifier ${specifier}`);
  };

  const compartment = new Compartment({
    globals: { t },
    resolveHook,
    importHook,
    __options__: true,
  });
  await compartment.import('./src/main.js');
});

test('export name as default from CommonJS module', async t => {
  t.plan(1);

  const importHook = async specifier => {
    if (specifier === './meaning.cjs') {
      return CjsModuleSource(
        `
        exports.meaning = 42;
      `,
        'https://example.com/meaning.cjs',
      );
    }
    if (specifier === './meaning.mjs') {
      return new ModuleSource(`
        export { meaning as default } from './meaning.cjs';
      `);
    }
    if (specifier === './main.js') {
      return new ModuleSource(
        `
        import meaning from './meaning.mjs';
        t.is(meaning, 42);
      `,
        'https://example.com/main.js',
      );
    }
    throw Error(`Cannot load module for specifier ${specifier}`);
  };

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook,
    __options__: true,
  });

  await compartment.import('./main.js');
});

test('synchronous loading via importNowHook', async t => {
  t.plan(1);

  const importNowHook = specifier => {
    if (specifier === './meaning.cjs') {
      return CjsModuleSource(
        `
        exports.meaning = 42;
      `,
        'https://example.com/meaning.cjs',
      );
    }
    if (specifier === './meaning.mjs') {
      return new ModuleSource(`
        export { meaning as default } from './meaning.cjs';
      `);
    }
    if (specifier === './main.js') {
      return new ModuleSource(
        `
        import meaning from './meaning.mjs';
        t.is(meaning, 42);
      `,
        'https://example.com/main.js',
      );
    }
    throw Error(`Cannot load module for specifier ${specifier}`);
  };

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook: async () => {},
    importNowHook,
    __options__: true,
  });

  compartment.importNow('./main.js');
});

test('importNowHook only called if specifier was not imported before', async t => {
  t.plan(1);

  const importNowHook = specifier => {
    if (specifier === './meaning.cjs') {
      throw Error(`importNowHook should not be called to get ./meaning.cjs`);
    }
    if (specifier === './meaning.mjs') {
      return new ModuleSource(`
        export { meaning as default } from './meaning.cjs';
      `);
    }
    if (specifier === './main.js') {
      return new ModuleSource(
        `
        import meaning from './meaning.mjs';
        t.is(meaning, 42);
      `,
        'https://example.com/main.js',
      );
    }
    throw Error(`Cannot load module for specifier ${specifier}`);
  };
  const importHook = async specifier => {
    if (specifier === './meaning.cjs') {
      return CjsModuleSource(
        `
        exports.meaning = 42;
      `,
        'https://example.com/meaning.cjs',
      );
    }
    throw Error(`Cannot load module for specifier ${specifier}`);
  };

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook,
    importNowHook,
    __options__: true,
  });

  // compartment.import would be the more natural here, but all prerequisites
  // to synchronously finding the module before calling importNowHook should
  // be put in place by the load function, so the test flow is more specific.
  await compartment.load('./meaning.cjs');
  compartment.importNow('./main.js');
});
