/* eslint-disable import/first */
import 'ses';

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'verbose',
});

import fs from 'fs';

import {
  importLocation,
  makeArchive,
  parseArchive,
} from '@endo/compartment-mapper';

const readPower = async location =>
  fs.promises.readFile(new URL(location).pathname);

const entrypointPath = new URL('./app.js', import.meta.url).href;

const ApiSubsetOfBuffer = harden({ from: Buffer.from });

const options = {
  /** @type {import('@endo/compartment-mapper').Policy} */
  policy: {
    defaultAttenuator:
      '@endo/compartment-mapper-demo-lavamoat-style-attenuator',
    entry: {
      globals: ['root'],
      noGlobalFreeze: true,
      packages: 'any',
      builtins: {
        fs: {
          attenuate: '@endo/compartment-mapper-demo-policy-attenuator1',
          params: ['existsSync'],
        },
      },
    },
    resources: {
      '@endo/compartment-mapper-demo-polyfill1': {
        globals: [
          {
            console: true,
            answerPolyfill: 'write',
          },
        ],
      },
      dotenv: {
        builtins: {
          fs: {
            attenuate: '@endo/compartment-mapper-demo-policy-attenuator1',
            params: ['readFileSync'],
          },
          os: true,
          path: true,
        },
        globals: {
          // one attenuator implementation can be used for builtins and globals
          attenuate: '@endo/compartment-mapper-demo-policy-attenuator1',
          params: ['console', 'process'],
        },
      },
      entropoetry: {
        builtins: {
          assert: true,
          buffer: true,
          zlib: true,
        },
        globals: {
          console: true,
        },
        packages: {
          'entropoetry>bn.js': true,
        },
      },
      'entropoetry>bn.js': {
        builtins: {
          buffer: true,
        },
        globals: 'any',
      },
      '@endo/compartment-mapper-demo-policy-attenuator1': {
        globals: {
          console: true,
        },
      },
      '@endo/compartment-mapper-demo-lavamoat-style-attenuator': {
        globals: {
          console: true,
        },
      },
    },
  },
  globals: {
    Buffer: ApiSubsetOfBuffer,
    console,
    process,
    setTimeout,
  },
  importHook: async specifier => {
    const ns = await import(specifier);
    return Object.freeze({
      imports: [],
      exports: Object.keys(ns),
      execute: moduleExports => {
        moduleExports.default = ns;
        Object.assign(moduleExports, ns);
      },
    });
  },
  modules: {
    buffer: Object.create(null), // imported but unused
  },
};

console.log('\n\n________________________________________________ Location\n');
{
  const { namespace } = await importLocation(
    readPower,
    entrypointPath,
    options,
  );
  console.log(1, namespace.poem);
}

console.log('\n\n________________________________________________ Archive\n');
{
  console.log('>----------start -> makeArchive');
  const archive = await makeArchive(readPower, entrypointPath, {
    modules: options.modules,
    policy: options.policy,
    importHook: options.importHook,
  });
  console.log('>----------makeArchive -> parseArchive');
  const application = await parseArchive(archive, '<unknown>', {
    modules: options.modules,
  });
  console.log('>----------parseArchive -> import');
  const { namespace } = await application.import({
    globals: options.globals,
    modules: options.modules,
    importHook: options.importHook,
  });
  console.log('>----------import -> end');
  console.log(2, namespace.poem);
}
