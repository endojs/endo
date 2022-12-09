/* eslint-disable import/first */
import 'ses';

lockdown();

import fs from 'fs';
import os from 'os';
import assert from 'assert';
import zlib from 'zlib';
import path from 'path';

import { importLocation } from '../../index.js';

import { addToCompartment } from './helper.mjs';

const readPower = async location =>
  fs.promises.readFile(new URL(location).pathname);

const entrypointPath = new URL('./app.js', import.meta.url).href;

const ApiSubsetOfBuffer = harden({ from: Buffer.from });

const { namespace } = await importLocation(readPower, entrypointPath, {
  policy: {
    resources: {
      'endo-sample': {
        globals: {
          // 'Buffer.from': true, // "write"
          Buffer: true,
        },
        packages: {
          entropoetry: true,
          dotenv: true,
        },
        builtin: {
          fs: {
            attenuate: 'fs-read-attenuation',
            params: ['existsSync'],
          },
        },
      },
      dotenv: {
        builtin: {
          // "fs.readFileSync": true,
          // "fs": "fs-read-attenuation",
          fs: {
            attenuate: 'fs-read-attenuation',
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
        builtin: {
          assert: true,
          buffer: true,
          zlib: true,
        },
        globals: {
          console: true,
        },
        packages: {
          'bn.js': true,
        },
      },
      'bn.js': {
        builtin: {
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
  attenuations: {
    'fs-read-attenuation': (params, originalModuleNamespace) => {
      console.log('>>>fs-read-attenuation', params);
      // Object.assign(exportsProxy, originalModuleNamespace);
      const ns = params.reduce((acc, k) => {
        acc[k] = originalModuleNamespace[k];
        return acc;
      }, {});
      return ns;
    },
  },
});

console.log(namespace.poem);
