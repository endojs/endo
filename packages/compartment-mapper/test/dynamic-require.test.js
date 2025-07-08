/* eslint-disable no-shadow */
/* eslint-disable import/no-dynamic-require */

/**
 * @import {
 *   ExitModuleImportNowHook,
 *   ExitModuleImportHook,
 *   Policy,
 *   SyncModuleTransforms,
 * } from '../src/types.js'
 * @import {ThirdPartyStaticModuleInterface} from 'ses'
 */

import 'ses';
import test from 'ava';
import fs from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import url from 'node:url';
import { importLocation } from '../src/import.js';
import { makeReadNowPowers } from '../src/node-powers.js';
import { WILDCARD_POLICY_VALUE } from '../src/policy-format.js';

const readPowers = makeReadNowPowers({ fs, url, path });
const { freeze, keys, assign } = Object;

/**
 * @type {ExitModuleImportNowHook}
 */
const defaultImportNowHook = (specifier, packageLocation) => {
  const require = Module.createRequire(
    readPowers.fileURLToPath(packageLocation),
  );
  const ns = require(specifier);
  return freeze(
    /** @type {ThirdPartyStaticModuleInterface} */ ({
      imports: [],
      exports: keys(ns),
      execute: moduleExports => {
        moduleExports.default = ns;
        assign(moduleExports, ns);
      },
    }),
  );
};

/**
 * @type {ExitModuleImportHook}
 */
const defaultImportHook = async (specifier, packageLocation) => {
  await Promise.resolve();
  return defaultImportNowHook(specifier, packageLocation);
};

test('intra-package dynamic require works without invoking the exitModuleImportNowHook', async t => {
  t.plan(2);
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).href;
  let importNowHookCallCount = 0;
  /** @type {ExitModuleImportNowHook} */
  const importNowHook = (specifier, packageLocation) => {
    importNowHookCallCount += 1;
    const require = Module.createRequire(
      readPowers.fileURLToPath(packageLocation),
    );
    const ns = require(specifier);
    return freeze(
      /** @type {ThirdPartyStaticModuleInterface} */ ({
        imports: [],
        exports: keys(ns),
        execute: moduleExports => {
          moduleExports.default = ns;
          assign(moduleExports, ns);
        },
      }),
    );
  };

  /** @type {Policy} */
  const policy = {
    entry: {
      packages: WILDCARD_POLICY_VALUE,
      globals: WILDCARD_POLICY_VALUE,
      builtins: WILDCARD_POLICY_VALUE,
    },
    resources: {
      dynamic: {
        packages: {
          'dynamic>is-ok': true,
        },
      },
      'dynamic>is-ok': {
        packages: {
          'dynamic>is-ok>is-not-ok': true,
        },
      },
    },
  };
  const { namespace } = await importLocation(readPowers, fixture, {
    policy,
    importNowHook,
  });

  t.deepEqual(
    {
      default: {
        isOk: 1,
      },
      isOk: 1,
    },
    { ...namespace },
  );
  t.is(importNowHookCallCount, 0);
});

// this test mimics how node-gyp-require works; you pass it a directory and it
// figures out what file to require within that directory. there is no
// reciprocal dependency on wherever that directory lives (usually it's
// somewhere in the dependent package)
test('intra-package dynamic require with inter-package absolute path works without invoking the exitModuleImportNowHook', async t => {
  t.plan(2);
  const fixture = new URL(
    'fixtures-dynamic/node_modules/absolute-app/index.js',
    import.meta.url,
  ).href;
  let importNowHookCallCount = 0;
  /** @type {ExitModuleImportNowHook} */
  const importNowHook = (specifier, packageLocation) => {
    importNowHookCallCount += 1;
    const require = Module.createRequire(
      readPowers.fileURLToPath(packageLocation),
    );
    const ns = require(specifier);
    return freeze(
      /** @type {ThirdPartyStaticModuleInterface} */ ({
        imports: [],
        exports: keys(ns),
        execute: moduleExports => {
          moduleExports.default = ns;
          assign(moduleExports, ns);
        },
      }),
    );
  };
  /** @type {Policy} */
  const policy = {
    entry: {
      packages: WILDCARD_POLICY_VALUE,
      globals: WILDCARD_POLICY_VALUE,
      builtins: WILDCARD_POLICY_VALUE,
    },
    resources: {
      sprunt: {
        packages: {
          'node-tammy-build': true,
        },
      },
    },
  };

  const { namespace } = await importLocation(readPowers, fixture, {
    policy,
    importNowHook,
  });

  t.deepEqual(
    {
      default: {
        isOk: 1,
      },
      isOk: 1,
    },
    { ...namespace },
  );
  t.is(importNowHookCallCount, 0);
});

test('intra-package dynamic require using known-but-restricted absolute path fails', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/broken-app/index.js',
    import.meta.url,
  ).href;
  /** @type {ExitModuleImportNowHook} */
  const importNowHook = (specifier, packageLocation) => {
    const require = Module.createRequire(
      readPowers.fileURLToPath(packageLocation),
    );
    const ns = require(specifier);
    return freeze(
      /** @type {ThirdPartyStaticModuleInterface} */ ({
        imports: [],
        exports: keys(ns),
        execute: moduleExports => {
          moduleExports.default = ns;
          assign(moduleExports, ns);
        },
      }),
    );
  };
  /** @type {Policy} */
  const policy = {
    entry: {
      packages: WILDCARD_POLICY_VALUE,
      globals: WILDCARD_POLICY_VALUE,
      builtins: WILDCARD_POLICY_VALUE,
    },
    resources: {
      badsprunt: {
        packages: {
          'node-tammy-build': true,
        },
      },
      'badsprunt>node-tammy-build': {
        packages: { sprunt: false },
      },
    },
  };

  await t.throwsAsync(
    importLocation(readPowers, fixture, {
      policy,
      importNowHook,
    }),
    {
      message: /Blocked in importNow hook by relationship/,
    },
  );
});

test('dynamic require fails without maybeReadNow in read powers', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).href;

  const { maybeReadNow: _, ...lessPower } = readPowers;
  await t.throwsAsync(
    // @ts-expect-error bad type
    importLocation(lessPower, fixture, {
      importNowHook: defaultImportNowHook,
      policy: {
        entry: {
          packages: WILDCARD_POLICY_VALUE,
          globals: WILDCARD_POLICY_VALUE,
          builtins: WILDCARD_POLICY_VALUE,
        },
        resources: {
          dynamic: {
            packages: {
              'is-ok': true,
            },
          },
        },
      },
    }),
    {
      message:
        /Synchronous readPowers required for dynamic import of ".+"; missing or invalid prop\(s\): maybeReadNow/,
    },
  );
});

test('dynamic require fails without isAbsolute & fileURLToPath in read powers', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).href;
  const { isAbsolute: _, fileURLToPath: ___, ...lessPower } = readPowers;
  await t.throwsAsync(
    // @ts-expect-error bad types
    importLocation(lessPower, fixture, {
      importNowHook: defaultImportNowHook,
      policy: {
        entry: {
          packages: WILDCARD_POLICY_VALUE,
          globals: WILDCARD_POLICY_VALUE,
          builtins: WILDCARD_POLICY_VALUE,
        },
        resources: {
          dynamic: {
            packages: {
              'is-ok': true,
            },
          },
        },
      },
    }),
    {
      message:
        /Synchronous readPowers required for dynamic import of ".+"; missing or invalid prop\(s\): fileURLToPath, isAbsolute/,
    },
  );
});

test('inter-package and exit module dynamic require works', async t => {
  t.plan(3);

  const fixture = new URL(
    'fixtures-dynamic/node_modules/hooked-app/index.js',
    import.meta.url,
  ).href;

  // number of times the `importNowHook` got called
  let importNowHookCallCount = 0;
  /** @type {string[]} */
  const importNowHookSpecifiers = [];

  /** @type {ExitModuleImportNowHook} */
  const importNowHook = (specifier, packageLocation) => {
    importNowHookCallCount += 1;
    importNowHookSpecifiers.push(specifier);
    const require = Module.createRequire(
      readPowers.fileURLToPath(packageLocation),
    );
    const ns = require(specifier);
    return freeze(
      /** @type {ThirdPartyStaticModuleInterface} */ ({
        imports: [],
        exports: keys(ns),
        execute: moduleExports => {
          moduleExports.default = ns;
          assign(moduleExports, ns);
        },
      }),
    );
  };

  const { namespace } = await importLocation(readPowers, fixture, {
    importNowHook,
    policy: {
      entry: {
        packages: WILDCARD_POLICY_VALUE,
        globals: WILDCARD_POLICY_VALUE,
        builtins: WILDCARD_POLICY_VALUE,
      },
      resources: {
        hooked: {
          packages: {
            dynamic: true,
          },
        },
        'hooked>dynamic': {
          packages: {
            'hooked>dynamic>is-ok': true,
          },
        },
        'hooked>dynamic>is-ok': {
          packages: {
            'hooked>dynamic>is-ok>is-not-ok': true,
          },
        },
      },
    },
  });

  t.deepEqual(
    {
      default: {
        isOk: 1,
      },
      isOk: 1,
    },
    { ...namespace },
  );

  t.is(importNowHookCallCount, 1);
  t.deepEqual(importNowHookSpecifiers, ['cluster']);
});

test('inter-package and exit module dynamic require policy is enforced', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/hooked-app/index.js',
    import.meta.url,
  ).href;

  // number of times the `importNowHook` got called
  /** @type {string[]} */
  const importNowHookSpecifiers = [];

  /** @type {ExitModuleImportNowHook} */
  const importNowHook = (specifier, packageLocation) => {
    importNowHookSpecifiers.push(specifier);
    const require = Module.createRequire(
      readPowers.fileURLToPath(packageLocation),
    );
    /** @type {object} */
    const ns = require(specifier);
    return freeze(
      /** @type {import('ses').ThirdPartyStaticModuleInterface} */ ({
        imports: [],
        exports: keys(ns),
        execute: moduleExports => {
          moduleExports.default = ns;
          assign(moduleExports, ns);
        },
      }),
    );
  };

  await t.throwsAsync(
    importLocation(readPowers, fixture, {
      importNowHook,
      policy: {
        entry: {
          packages: WILDCARD_POLICY_VALUE,
          globals: WILDCARD_POLICY_VALUE,
          // this is the only policy change
          // builtins: WILDCARD_POLICY_VALUE,
        },
        resources: {
          hooked: {
            packages: {
              dynamic: true,
            },
          },
          'hooked>dynamic': {
            packages: {
              'hooked>dynamic>is-ok': true,
            },
          },
          'hooked>dynamic>is-ok': {
            packages: {
              'hooked>dynamic>is-ok>is-not-ok': true,
            },
          },
        },
      },
    }),
    {
      message: /not allowed by empty "builtins" policy/,
    },
  );
});

test('inter-package and exit module dynamic require works ("node:"-namespaced)', async t => {
  t.plan(3);

  const fixture = new URL(
    'fixtures-dynamic/node_modules/hooked-app-namespaced/index.js',
    import.meta.url,
  ).href;

  // number of times the `importNowHook` got called
  let importNowHookCallCount = 0;
  /** @type {string[]} */
  const importNowHookSpecifiers = [];

  /** @type {ExitModuleImportNowHook} */
  const importNowHook = (specifier, packageLocation) => {
    importNowHookCallCount += 1;
    importNowHookSpecifiers.push(specifier);
    const require = Module.createRequire(
      readPowers.fileURLToPath(packageLocation),
    );
    /** @type {object} */
    const ns = require(specifier);
    return freeze(
      /** @type {import('ses').ThirdPartyStaticModuleInterface} */ ({
        imports: [],
        exports: keys(ns),
        execute: moduleExports => {
          moduleExports.default = ns;
          assign(moduleExports, ns);
        },
      }),
    );
  };

  const { namespace } = await importLocation(readPowers, fixture, {
    importNowHook,
    policy: {
      entry: {
        packages: WILDCARD_POLICY_VALUE,
        globals: WILDCARD_POLICY_VALUE,
        builtins: WILDCARD_POLICY_VALUE,
      },
      resources: {
        hooked: {
          packages: {
            dynamic: true,
          },
        },
        'hooked>dynamic': {
          packages: {
            'hooked>dynamic>is-ok': true,
          },
        },
        'hooked>dynamic>is-ok': {
          packages: {
            'hooked>dynamic>is-ok>is-not-ok': true,
          },
        },
      },
    },
  });

  t.deepEqual(
    {
      default: {
        isOk: 1,
      },
      isOk: 1,
    },
    { ...namespace },
  );

  t.is(importNowHookCallCount, 1);
  t.deepEqual(importNowHookSpecifiers, ['node:cluster']);
});

test('sync module transforms work with dynamic require support', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).href;

  t.plan(2);

  let transformCount = 0;

  /** @type {SyncModuleTransforms} */
  const syncModuleTransforms = {
    cjs: sourceBytes => {
      transformCount += 1;
      return {
        bytes: sourceBytes,
        parser: 'cjs',
      };
    },
  };

  /** @type {Policy} */
  const policy = {
    entry: {
      packages: WILDCARD_POLICY_VALUE,
      globals: WILDCARD_POLICY_VALUE,
      builtins: WILDCARD_POLICY_VALUE,
    },
    resources: {
      dynamic: {
        packages: {
          'dynamic>is-ok': true,
        },
      },
      'dynamic>is-ok': {
        packages: {
          'dynamic>is-ok>is-not-ok': true,
        },
      },
    },
  };

  const { namespace } = await importLocation(readPowers, fixture, {
    syncModuleTransforms,
    importNowHook: defaultImportNowHook,
    policy,
  });

  t.deepEqual(
    {
      default: {
        isOk: 1,
      },
      isOk: 1,
    },
    { ...namespace },
  );

  t.true(transformCount > 0);
});

test('sync module transforms work without dynamic require support', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/static-app/index.js',
    import.meta.url,
  ).href;

  let transformCount = 0;
  const expectedCount = 3;

  /** @type {SyncModuleTransforms} */
  const syncModuleTransforms = {
    cjs: sourceBytes => {
      transformCount += 1;
      return {
        bytes: sourceBytes,
        parser: 'cjs',
      };
    },
  };

  const { read } = readPowers;
  await importLocation(read, fixture, {
    syncModuleTransforms,
  });

  t.is(transformCount, expectedCount);
});

test('dynamic require of missing module falls through to importNowHook', async t => {
  // this fixture dynamically requires two local modules:
  // 1. good.js, which exists
  // 2. missing.js, which doesn't.
  // in the good.js case, findRedirect returns `undefined` but we resolve via chooseModuleDescriptor before hitting the exit module import now hook
  // in the missing.js case, findRedirect also returns `undefined` and we end up falling through to the exit module import now hook
  const fixture = new URL(
    'fixtures-dynamic/node_modules/invalid-app/index.js',
    import.meta.url,
  ).href;

  await t.throwsAsync(
    importLocation(readPowers, fixture, {
      policy: { entry: { builtins: 'any' }, resources: {} },
      importNowHook: (specifier, _packageLocation) => {
        throw new Error(`Blocked exit module: ${specifier}`);
      },
      // this will load the `path` builtin
      importHook: defaultImportHook,
    }),
    {
      message: /Blocked exit module: .+missing\.js/,
    },
  );
});

test('dynamic require of package missing an optional module', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/missing-app/index.js',
    import.meta.url,
  ).href;

  const { namespace } = await importLocation(readPowers, fixture);
  t.like(namespace, { isOk: true, default: { isOk: true } });
});

test('dynamic require of ancestor relative path within known compartment should succeed', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/grabby-app/index.js',
    import.meta.url,
  ).href;

  /** @type {ExitModuleImportNowHook} */
  const importNowHook = (_specifier, _packageLocation) => {
    throw new Error('exit module import now hook should not be called');
  };

  const { namespace } = await importLocation(readPowers, fixture, {
    importNowHook,
  });
  t.like(namespace, { value: 'buried treasure' });
});

test('dynamic require of ancestor relative path within unknown compartment', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/grabby-app-broken/index.js',
    import.meta.url,
  ).href;

  await t.throwsAsync(importLocation(readPowers, fixture), {
    message: /Could not import unknown module.+grabby-app\/macguffin/,
  });
});

test('dynamic require of ancestor', async t => {
  // TODO: see if we can somehow use the pantspack.js entry
  const fixture = new URL(
    'fixtures-dynamic-ancestor/node_modules/webpackish-app/build.js',
    import.meta.url,
  ).href;

  const { namespace } = await importLocation(readPowers, fixture, {
    dev: true,
    importNowHook: defaultImportNowHook,
    importHook: defaultImportHook,
    policy: {
      entry: {
        packages: WILDCARD_POLICY_VALUE,
        globals: WILDCARD_POLICY_VALUE,
        builtins: WILDCARD_POLICY_VALUE,
      },
      resources: {
        pantspack: {
          builtins: {
            'node:console': true,
            'node:path': true,
            'node:util': true,
          },
          packages: {
            'pantspack>pantspack-folder-runner': true,
            'webpackish-app': true,
          },
        },
        'pantspack>pantspack-folder-runner': {
          packages: {
            'jorts-folder': true,
          },
        },
      },
    },
  });

  t.like(namespace, [
    {
      packageDescriptor: { name: 'webpackish-app' },
      foldedSources: ['webpackish-app-v1.2.3'],
    },
  ]);
});

test('dynamic require of ancestor disallowed by policy fails at require time', async t => {
  // TODO: see if we can somehow use the pantspack.js entry
  const fixture = new URL(
    'fixtures-dynamic-ancestor/node_modules/webpackish-app/build.js',
    import.meta.url,
  ).href;

  const policy = {
    entry: {
      packages: WILDCARD_POLICY_VALUE,
      globals: WILDCARD_POLICY_VALUE,
      builtins: WILDCARD_POLICY_VALUE,
    },
    resources: {
      pantspack: {
        builtins: {
          'node:console': true,
          'node:path': true,
          'node:util': true,
        },
        packages: {
          'pantspack>pantspack-folder-runner': true,
          'webpackish-app': true,
        },
      },
      'pantspack>pantspack-folder-runner': {
        packages: {
          'jorts-folder': false, // <--- this is the only change
        },
      },
    },
  };
  // this is in a try/catch because AVA's `throwsAsync` is inflexible
  try {
    // eslint-disable-next-line @jessie.js/safe-await-separator
    await importLocation(readPowers, fixture, {
      dev: true,
      importNowHook: defaultImportNowHook,
      importHook: defaultImportHook,
      policy,
    });
    t.fail('importLocation should have rejected');
  } catch (err) {
    t.regex(err.message, /Could not require pantsFolder "jorts-folder"/);
    t.regex(
      err.cause.message,
      new RegExp(
        `Importing "jorts-folder" in resource "jorts-folder" in "pantspack-folder-runner-v1\\.0\\.0" was not allowed by "packages" policy: ${JSON.stringify(policy.resources['pantspack>pantspack-folder-runner'].packages)}`,
      ),
    );
  }
});

test('dynamic require of ancestor disallowed if policy omitted', async t => {
  // TODO: see if we can somehow use the pantspack.js entry
  const fixture = new URL(
    'fixtures-dynamic-ancestor/node_modules/webpackish-app/build.js',
    import.meta.url,
  ).href;

  try {
    // eslint-disable-next-line @jessie.js/safe-await-separator
    await importLocation(readPowers, fixture, {
      dev: true,
      importNowHook: defaultImportNowHook,
      importHook: defaultImportHook,
    });
    t.fail('importLocation should have rejected');
  } catch (err) {
    t.regex(err.message, /Could not require pantsFolder "jorts-folder"/);
    t.regex(err.cause.message, /Could not import module/);
  }
});
