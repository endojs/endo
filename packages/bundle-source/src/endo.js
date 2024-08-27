// @ts-nocheck

import fs from 'fs';

import { evadeCensor } from '@endo/evasive-transform';
import { whereEndoCache } from '@endo/where';
import { defaultParserForLanguage as transformingParserForLanguage } from '@endo/compartment-mapper/archive-parsers.js';
import { defaultParserForLanguage as transparentParserForLanguage } from '@endo/compartment-mapper/import-parsers.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const makeBundlingKit = (
  { pathResolve, userInfo, computeSha512, platform, env },
  { cacheSourceMaps, elideComments, noTransforms, commonDependencies },
) => {
  if (noTransforms && elideComments) {
    throw new Error(
      'bundleSource endoZipBase64 cannot elideComments with noTransforms',
    );
  }

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

  /**
   * @param {import('@endo/compartment-mapper/src/types.js').Language} parser
   * @param {Uint8Array} sourceBytes
   * @param {string} specifier
   * @param {string} location
   * @param {string|import('source-map').RawSourceMap} sourceMap
   */
  const transformModuleSource = async (
    parser,
    sourceBytes,
    specifier,
    location,
    sourceMap,
  ) => {
    if (!['mjs', 'cjs'].includes(parser)) {
      throw Error(`Parser ${parser} not supported in evadeEvalCensor`);
    }
    const babelSourceType = parser === 'mjs' ? 'module' : 'script';
    const source = textDecoder.decode(sourceBytes);
    let object;
    ({ code: object, map: sourceMap } = await evadeCensor(source, {
      sourceType: babelSourceType,
      sourceMap,
      sourceMapUrl: new URL(specifier, location).href,
      elideComments,
    }));
    const objectBytes = textEncoder.encode(object);
    return { bytes: objectBytes, parser, sourceMap };
  };

  let parserForLanguage = transparentParserForLanguage;
  let moduleTransforms = {};
  if (!noTransforms) {
    parserForLanguage = transformingParserForLanguage;
    moduleTransforms = {
      async mjs(
        sourceBytes,
        specifier,
        location,
        _packageLocation,
        { sourceMap },
      ) {
        return transformModuleSource(
          'mjs',
          sourceBytes,
          specifier,
          location,
          sourceMap,
        );
      },
      async cjs(
        sourceBytes,
        specifier,
        location,
        _packageLocation,
        { sourceMap },
      ) {
        return transformModuleSource(
          'cjs',
          sourceBytes,
          specifier,
          location,
          sourceMap,
        );
      },
    };
  }

  const sourceMapHook = (sourceMap, sourceDescriptor) => {
    sourceMapJobs.add(writeSourceMap(sourceMap, sourceDescriptor));
  };

  return { sourceMapHook, sourceMapJobs, moduleTransforms, parserForLanguage };
};
