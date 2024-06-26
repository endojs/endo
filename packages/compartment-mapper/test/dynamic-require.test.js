// @ts-check
/* eslint-disable import/no-dynamic-require */

/** @import {ExitModuleImportNowHook, Policy} from '../src/types.js' */
/** @import {SyncModuleTransforms} from '../src/types.js' */

import 'ses';
import test from 'ava';
import fs from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import url from 'node:url';
import { importLocation } from '../src/import.js';
import { makeReadPowers } from '../src/node-powers.js';

const readPowers = makeReadPowers({ fs, url, path });
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

test('dynamic require should not work without policy', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).toString();
  await t.throwsAsync(importLocation(readPowers, fixture, { importNowHook }), {
    message: /Dynamic require not allowed in compartment "dynamic"/,
  });
});

test('intra-package dynamic require works', async t => {
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
        dynamic: true,
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
  t.is(importNowHookCallCount, 1);
});

// this test mimics how node-gyp-require works; you pass it a directory and it
// figures out what file to require within that directory. there is no
// reciprocal dependency on wherever that directory lives (usually it's
// somewhere in the dependent package)
test('intra-package dynamic require with inter-package absolute path works', async t => {
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
          dynamo: true,
        },
      },
      'sprunt>dynamo': {
        dynamic: true,
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
  t.is(importNowHookCallCount, 1);
});

test('dynamic require fails without sync read powers', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).toString();

  const { readSync: _, ...lessPower } = readPowers;
  await t.throwsAsync(
    importLocation(lessPower, fixture, {
      importNowHook,
      policy: {
        entry: {
          packages: 'any',
        },
        resources: {
          dynamic: {
            dynamic: true,
          },
        },
      },
    }),
    {
      message: /Provided read powers do not support dynamic requires/,
    },
  );
});

test('dynamic require fails without isAbsolute read powers', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/app/index.js',
    import.meta.url,
  ).toString();
  const { isAbsolute: _, ...lessPower } = readPowers;
  await t.throwsAsync(
    importLocation(lessPower, fixture, {
      importNowHook,
      policy: {
        entry: {
          packages: 'any',
        },
        resources: {
          dynamic: {
            dynamic: true,
          },
        },
      },
    }),
    {
      message: /Provided read powers do not support dynamic requires/,
    },
  );
});

test('dynamic exit module loading fails without importNowHook', async t => {
  const fixture = new URL(
    'fixtures-dynamic/node_modules/hooked-app/index.js',
    import.meta.url,
  ).toString();

  /** @type {Policy} */
  const policy = {
    entry: {
      packages: 'any',
    },
    resources: {
      hooked: {
        packages: {
          dynamic: true,
        },
        dynamic: true,
      },
      'hooked>dynamic': {
        dynamic: true,
      },
    },
  };

  await t.throwsAsync(
    importLocation(readPowers, fixture, {
      policy,
    }),
    {
      message: new RegExp(
        `Failed to load module.+node_modules${path.sep}dynamic${path.sep}index.js`,
      ),
    },
  );
});

test('inter-pkg and exit module dynamic require works', async t => {
  t.plan(2);

  const fixture = new URL(
    'fixtures-dynamic/node_modules/hooked-app/index.js',
    import.meta.url,
  ).toString();

  // number of times the `importNowHook` got called
  let importNowHookCallCount = 0;

  /** @type {ExitModuleImportNowHook} */
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
          dynamic: true,
        },
        'hooked>dynamic': {
          dynamic: true,
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
        dynamic: true,
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
    'fixtures-cjs-compat/node_modules/app/index.js',
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

  t.true(transformCount > 0);
});
