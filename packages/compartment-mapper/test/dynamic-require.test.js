/* eslint-disable no-shadow */
/* eslint-disable import/no-dynamic-require */

/**
 * @import {
 *   ExitModuleImportNowHook, Policy,
 *   SyncModuleTransforms,
 * } from '../src/types.js'
 */

import 'ses';
import test from 'ava';
import fs from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import url from 'node:url';
import { importLocation } from '../src/import.js';
import { makeReadNowPowers } from '../src/node-powers.js';

// @ts-expect-error XXX Node interface munging
const readPowers = makeReadNowPowers({ fs, url, path });
const { freeze, keys, assign } = Object;

const importNowHook = (specifier, packageLocation) => {
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

test('intra-package dynamic require works without invoking the exitModuleImportNowHook', async t => {
  t.plan(2);
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).toString();
  let importNowHookCallCount = 0;
  const importNowHook = (specifier, packageLocation) => {
    importNowHookCallCount += 1;
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

  /** @type {Policy} */
  const policy = {
    entry: {
      packages: 'any',
    },
    resources: {
      dynamic: {
        packages: {
          'is-ok': true,
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
  ).toString();
  let importNowHookCallCount = 0;
  const importNowHook = (specifier, packageLocation) => {
    importNowHookCallCount += 1;
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
  /** @type {Policy} */
  const policy = {
    entry: {
      packages: 'any',
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
  ).toString();
  /** @type {ExitModuleImportNowHook} */
  const importNowHook = (specifier, packageLocation) => {
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
  /** @type {Policy} */
  const policy = {
    entry: {
      packages: 'any',
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
      message: /Blocked in import hook/,
    },
  );
});

test('dynamic require fails without maybeReadNow in read powers', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).toString();

  const { maybeReadNow: _, ...lessPower } = readPowers;
  await t.throwsAsync(
    // @ts-expect-error bad type
    importLocation(lessPower, fixture, {
      importNowHook,
      policy: {
        entry: {
          packages: 'any',
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
        /Synchronous readPowers required for dynamic import of "is-ok"; missing or invalid prop\(s\): maybeReadNow/,
    },
  );
});

test('dynamic require fails without isAbsolute & fileURLToPath in read powers', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).toString();
  const { isAbsolute: _, fileURLToPath: ___, ...lessPower } = readPowers;
  await t.throwsAsync(
    // @ts-expect-error bad types
    importLocation(lessPower, fixture, {
      importNowHook,
      policy: {
        entry: {
          packages: 'any',
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
        /Synchronous readPowers required for dynamic import of "is-ok"; missing or invalid prop\(s\): fileURLToPath, isAbsolute/,
    },
  );
});

test('inter-package and exit module dynamic require works', async t => {
  t.plan(3);

  const fixture = new URL(
    'fixtures-dynamic/node_modules/hooked-app/index.js',
    import.meta.url,
  ).toString();

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
        packages: 'any',
      },
      resources: {
        hooked: {
          packages: {
            dynamic: true,
          },
          builtins: {
            cluster: true,
          },
        },
        'hooked>dynamic': {
          packages: {
            'is-ok': true,
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

test('sync module transforms work with dynamic require support', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).toString();

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
      packages: 'any',
    },
    resources: {
      dynamic: {
        packages: {
          'is-ok': true,
        },
      },
    },
  };

  const { namespace } = await importLocation(readPowers, fixture, {
    syncModuleTransforms,
    importNowHook,
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
  ).toString();

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

  const { read } = readPowers;
  await importLocation(read, fixture, {
    syncModuleTransforms,
  });

  t.is(transformCount, 2);
});
