/* global process */

import crypto from 'crypto';
import path from 'path';
import url from 'url';
import fs from 'fs';
import os from 'os';

import { makeAndHashArchive } from '@endo/compartment-mapper/archive.js';
import { encodeBase64 } from '@endo/base64';
import { whereEndoCache } from '@endo/where';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';
import { transformSource } from './transform.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const readPowers = makeReadPowers({ fs, url, crypto });

export async function bundleZipBase64(
  startFilename,
  options = {},
  grantedPowers = {},
) {
  const { dev = false, cacheSourceMaps = false } = options;
  const powers = { ...readPowers, ...grantedPowers };
  const {
    computeSha512,
    pathResolve = path.resolve,
    userInfo = os.userInfo,
    env = process.env,
    platform = process.platform,
  } = powers;

  const entry = url.pathToFileURL(pathResolve(startFilename));

  const sourceMapJobs = new Set();
  let writeSourceMap = Function.prototype;
  if (cacheSourceMaps) {
    const { homedir: home } = userInfo();
    const cacheDirectory = whereEndoCache(platform, env, { home });
    const sourceMapsCacheDirectory = pathResolve(cacheDirectory, 'source-map');
    const sourceMapsTrackerDirectory = pathResolve(
      cacheDirectory,
      'source-map-track',
    );
    writeSourceMap = async (
      sourceMap,
      { sha512, compartment: packageLocation, module: moduleSpecifier },
    ) => {
      const location = new URL(moduleSpecifier, packageLocation).href;
      const locationSha512 = computeSha512(location);
      const locationSha512Head = locationSha512.slice(0, 2);
      const locationSha512Tail = locationSha512.slice(2);
      const sha512Head = sha512.slice(0, 2);
      const sha512Tail = sha512.slice(2);
      const sourceMapTrackerDirectory = pathResolve(
        sourceMapsTrackerDirectory,
        locationSha512Head,
      );
      const sourceMapTrackerPath = pathResolve(
        sourceMapTrackerDirectory,
        locationSha512Tail,
      );
      const sourceMapDirectory = pathResolve(
        sourceMapsCacheDirectory,
        sha512Head,
      );
      const sourceMapPath = pathResolve(
        sourceMapDirectory,
        `${sha512Tail}.map.json`,
      );

      await fs.promises
        .readFile(sourceMapTrackerPath, 'utf-8')
        .then(async oldSha512 => {
          oldSha512 = oldSha512.trim();
          if (oldSha512 === sha512) {
            return;
          }
          const oldSha512Head = oldSha512.slice(0, 2);
          const oldSha512Tail = oldSha512.slice(2);
          const oldSourceMapDirectory = pathResolve(
            sourceMapsCacheDirectory,
            oldSha512Head,
          );
          const oldSourceMapPath = pathResolve(
            oldSourceMapDirectory,
            `${oldSha512Tail}.map.json`,
          );
          await fs.promises.unlink(oldSourceMapPath);
          const entries = await fs.promises.readdir(oldSourceMapDirectory);
          if (entries.length === 0) {
            await fs.promises.rmdir(oldSourceMapDirectory);
          }
        })
        .catch(error => {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        });

      await fs.promises.mkdir(sourceMapDirectory, { recursive: true });
      await fs.promises.writeFile(sourceMapPath, sourceMap);

      await fs.promises.mkdir(sourceMapTrackerDirectory, { recursive: true });
      await fs.promises.writeFile(sourceMapTrackerPath, sha512);
    };
  }

  const { bytes, sha512 } = await makeAndHashArchive(powers, entry, {
    dev,
    moduleTransforms: {
      async mjs(
        sourceBytes,
        specifier,
        location,
        _packageLocation,
        { sourceMap },
      ) {
        const source = textDecoder.decode(sourceBytes);
        let object;
        ({ code: object, map: sourceMap } = await transformSource(source, {
          sourceType: 'module',
          sourceMap,
          sourceMapUrl: new URL(specifier, location).href,
        }));
        const objectBytes = textEncoder.encode(object);
        return { bytes: objectBytes, parser: 'mjs', sourceMap };
      },
    },
    sourceMapHook(sourceMap, sourceDescriptor) {
      sourceMapJobs.add(writeSourceMap(sourceMap, sourceDescriptor));
    },
  });
  assert(sha512);
  await Promise.all(sourceMapJobs);
  const endoZipBase64 = encodeBase64(bytes);
  return harden({
    moduleFormat: /** @type {const} */ ('endoZipBase64'),
    endoZipBase64,
    endoZipBase64Sha512: sha512,
  });
}
