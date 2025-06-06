// @ts-nocheck
// This is a test fixture for minimal spot checks of the XS-specific variant of
// SES.
// The script ../scripts/generate-test-xs.js generates the _meaning.pre-mjs.json
// module by precompiling _meaning.js, then bundles this module with the "xs"
// package export/import condition so that it entrains ../src-xs/shim.js instead
// of the ordinary SES shim.
// This generates ../tmp/test-xs.js, which can be run with xst directly for
// validation of the XS environment under SES-for-XS.

/* global print */

// Eslint does not know about package reflexive imports (importing your own
// package), which in this case is necessary to go through the conditional
// export in package.json.
// eslint-disable-next-line import/no-extraneous-dependencies
import 'ses';

// The dependency below is generated by ../scripts/generate-test-xs.js
// eslint-disable-next-line import/no-unresolved
import precompiledModuleSource from '../tmp/_meaning.pre-mjs.json';

lockdown();

// spot checks
assert(Object.isFrozen(Object));

print('# shim compartment can import a shim precompiled module source');
{
  const shimCompartment = new Compartment({
    __options__: true,
    modules: {
      '.': {
        source: precompiledModuleSource,
      },
    },
  });
  assert.equal(
    shimCompartment.importNow('.').default,
    42,
    'can import precompiled module source',
  );
}

print('# native compartment can import a native ModuleSource');
{
  const nativeCompartment = new Compartment({
    __options__: true,
    __native__: true,
    modules: {
      '.': {
        source: new ModuleSource(`
          export default 42;
        `),
      },
    },
  });

  assert(
    nativeCompartment.importNow('.').default === 42,
    'can import native module source',
  );
}

print('# shim compartment cannot import a native ModuleSource');
// fail to import a native module source in a shim compartment
{
  let threw = null;
  try {
    new Compartment({
      __options__: true,
      modules: {
        '.': {
          source: new ModuleSource(''),
        },
      },
    }).importNow('.');
  } catch (error) {
    threw = error;
  }
  assert(
    threw,
    'attempting to import a native module source on a shim compartment should fail',
  );
}

print('# native compartment cannot import a shim precompiled module source');
{
  let threw = null;
  try {
    new Compartment({
      __options__: true,
      __native__: true,
      modules: {
        '.': {
          source: precompiledModuleSource,
        },
      },
    }).importNow('.');
  } catch (error) {
    threw = error;
  }
  assert(
    threw,
    'attempting to import a precompiled module source in a native compartment should fail',
  );
}

print('# shim compartment can link to another shim compartment');
{
  const shimCompartment1 = new Compartment({
    __options__: true,
    modules: {
      '.': {
        source: precompiledModuleSource,
      },
    },
  });
  const shimCompartment2 = new Compartment({
    __options__: true,
    modules: {
      '.': {
        compartment: shimCompartment1,
        namespace: '.',
      },
    },
  });
  assert.equal(
    shimCompartment2.importNow('.').default,
    42,
    'can link shim compartments',
  );
}

print('# native compartment can link to another native compartment');
{
  const nativeCompartment1 = new Compartment({
    __options__: true,
    __native__: true,
    modules: {
      '.': {
        source: new ModuleSource(`
          export default 42;
        `),
      },
    },
  });
  const nativeCompartment2 = new Compartment({
    __options__: true,
    __native__: true,
    modules: {
      '.': {
        compartment: nativeCompartment1,
        namespace: '.',
      },
    },
  });
  assert.equal(
    nativeCompartment2.importNow('.').default,
    42,
    'can link native compartments',
  );
}

print('# shim compartment cannot link a native compartment');
{
  const nativeCompartment = new Compartment({
    __options__: true,
    __native__: true,
    modules: {
      '.': {
        source: new ModuleSource(`
          export default 42;
        `),
      },
    },
  });
  const shimCompartment = new Compartment({
    __options__: true,
    modules: {
      '.': {
        compartment: nativeCompartment,
        namespace: '.',
      },
    },
  });
  let threw = null;
  try {
    shimCompartment.importNow('.');
  } catch (error) {
    threw = error;
  }
  assert(threw, 'cannot link native from shim compartment');
}

print('# native compartment cannot link shim compartment');
{
  const shimCompartment = new Compartment({
    __options__: true,
    modules: {
      '.': {
        source: precompiledModuleSource,
      },
    },
  });
  const nativeCompartment = new Compartment({
    __options__: true,
    __native__: true,
    modules: {
      '.': {
        compartment: shimCompartment,
        namespace: '.',
      },
    },
  });
  let threw = null;
  try {
    nativeCompartment.importNow('.');
  } catch (error) {
    threw = error;
  }
  assert(threw, 'cannot link shim from native compartment');
}

print('ok');

// To be continued in hardened262...
