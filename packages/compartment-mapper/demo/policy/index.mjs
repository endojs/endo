/* eslint-disable import/first */
import 'ses';

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'verbose',
});

import fs from 'fs';
import os from 'os';
import assert from 'assert';
import zlib from 'zlib';
import path from 'path';

import { importLocation, makeArchive, parseArchive } from '../../index.js';

import { addToCompartment } from './helper.mjs';

const readPower = async location =>
  fs.promises.readFile(new URL(location).pathname);

const entrypointPath = new URL('./app.js', import.meta.url).href;

const ApiSubsetOfBuffer = harden({ from: Buffer.from });

const options = {
  policy: {
    entry: {
      globals: 'any',
      packages: 'any',
      builtins: {
        fs: {
          attenuate: '@endo/compartment-mapper-demo-policy-attenuator1',
          params: ['existsSync'],
        },
      },
    },
    resources: {
      '@endo/compartment-mapper-demo-policy-attenuator1': {
        globals: {
          console: true,
        },
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
          console: true,
          process: true,
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
        globals: {
          Buffer: true,
        },
      },
    },
  },
  globals: {
    Buffer: ApiSubsetOfBuffer,
    console,
    process,
  },
  modules: {
    path: await addToCompartment('path', path),
    assert: await addToCompartment('assert', assert),
    buffer: await addToCompartment('buffer', Object.create(null)), // imported but unused
    zlib: await addToCompartment('zlib', zlib),
    fs: await addToCompartment('fs', fs),
    os: await addToCompartment('os', os),
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
  const archive = await makeArchive(readPower, entrypointPath, {
    modules: options.modules,
    policy: options.policy,
  });
  console.log('>----------makeArchive');
  const application = await parseArchive(archive, '<unknown>', {
    modules: options.modules,
  });
  console.log('>----------parseArchive');
  const { namespace } = await application.import({
    globals: options.globals,
    modules: options.modules,
  });
  console.log('>----------import');
  console.log(2, namespace.poem);
}
