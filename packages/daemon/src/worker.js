// @ts-check
/* global globalThis */

import harden from '@endo/harden';
import { E, Far } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { ZipWriter } from '@endo/zip/writer.js';
import { bytesFromText } from '@endo/bytes/from-string.js';
import { makeNetstringCapTP } from './connection.js';
import { makeRefReader } from './ref-reader.js';

import { WorkerFacetForDaemonInterface } from './interfaces.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoReadable, MignonicPowers } from './types.js' */

const endowments = harden({
  // See https://github.com/Agoric/agoric-sdk/issues/9515
  assert: globalThis.assert,
  console,
  E,
  Far,
  makeExo,
  M,
  TextEncoder,
  TextDecoder,
  URL,
});

const normalizeFilePath = path => {
  // Check if the path is already a file URL.
  if (path.startsWith('file://')) {
    return path;
  }
  // Windows path detection and conversion (look for a drive letter at the start).
  const isWindowsPath = /^[a-zA-Z]:/.test(path);
  if (isWindowsPath) {
    // Correctly format the Windows path with three slashes.
    return `file:///${path}`;
  }
  // For non-Windows paths, prepend the file protocol.
  return `file://${path}`;
};

/**
 * @typedef {ReturnType<makeWorkerFacet>} WorkerBootstrap
 */

/**
 * @param {object} args
 * @param {(error: Error) => void} args.cancel
 */
export const makeWorkerFacet = ({ cancel }) => {
  return makeExo(
    'EndoWorkerFacetForDaemon',
    WorkerFacetForDaemonInterface,
    /** @type {any} */ ({
      terminate: async () => {
        console.error('Endo worker received terminate request');
        cancel(Error('terminate'));
      },

      /**
       * @param {string} source
       * @param {Array<string>} names
       * @param {Array<unknown>} values
       * @param {string} $id
       * @param {Promise<never>} $cancelled
       */
      evaluate: async (source, names, values, $id, $cancelled) => {
        const compartment = new Compartment(
          harden({
            ...endowments,
            $id,
            $cancelled,
            ...Object.fromEntries(
              names.map((name, index) => [name, values[index]]),
            ),
          }),
        );
        return compartment.evaluate(source);
      },

      /**
       * @param {string} specifier
       * @param {Promise<unknown>} powersP
       * @param {Promise<unknown>} contextP
       * @param {Record<string, string>} env
       */
      makeUnconfined: async (specifier, powersP, contextP, env) => {
        // Windows absolute path includes drive letter which is confused for
        // protocol specifier. So, we reformat the specifier to include the
        // file protocol.
        const specifierUrl = normalizeFilePath(specifier);
        const namespace = await import(specifierUrl);
        return namespace.make(powersP, contextP, Object.freeze({ env }));
      },

      /**
       * @param {ERef<unknown>} treeP - Readable tree (or Mount) whose
       *   contents are laid out as a compartment-mapper archive:
       *   `compartment-map.json` at the root, with module source files
       *   at their referenced paths (`<compartmentName>/<moduleLocation>`).
       * @param {Promise<unknown>} powersP
       * @param {Promise<unknown>} contextP
       * @param {Record<string, string>} env
       */
      makeFromTree: async (treeP, powersP, contextP, env) => {
        // Read the compartment map from the tree root.  Tree 'lookup'
        // returns a blob Exo (ReadableTree) or MountFile Exo (Mount);
        // both expose `.text()`.
        const mapBlob = await E(/** @type {any} */ (treeP)).lookup(
          'compartment-map.json',
        );
        const mapText = await E(/** @type {any} */ (mapBlob)).text();
        /** @type {{ compartments: Record<string, any> }} */
        const compartmentMap = JSON.parse(mapText);

        // Pack the tree into an in-memory ZIP using the same layout
        // compartment-mapper.makeArchive produces, then hand it to the
        // existing parseArchive pipeline.  Keeps tree loading on the
        // worker side without duplicating the archive loader.
        const [{ parseArchive }, { defaultParserForLanguage }] =
          await Promise.all([
            import('@endo/compartment-mapper'),
            import('@endo/compartment-mapper/import-archive-all-parsers.js'),
          ]);
        const zip = new ZipWriter();
        zip.write('compartment-map.json', bytesFromText(mapText));

        for (const [compartmentName, descriptor] of Object.entries(
          compartmentMap.compartments,
        )) {
          const modules = descriptor.modules || {};
          for (const moduleInfo of Object.values(modules)) {
            if (
              typeof moduleInfo === 'object' &&
              moduleInfo !== null &&
              'location' in moduleInfo &&
              typeof moduleInfo.location === 'string'
            ) {
              const archivePath = `${compartmentName}/${moduleInfo.location}`;
              const pathSegments = archivePath.split('/').filter(Boolean);
              // eslint-disable-next-line no-await-in-loop
              const blob = await E(/** @type {any} */ (treeP)).lookup(
                pathSegments,
              );
              // eslint-disable-next-line no-await-in-loop
              const src = await E(/** @type {any} */ (blob)).text();
              zip.write(archivePath, bytesFromText(src));
            }
          }
        }

        const archiveBytes = zip.snapshot();
        const application = await parseArchive(archiveBytes, '<tree>', {
          parserForLanguage: defaultParserForLanguage,
        });
        const { namespace } = await application.import({
          globals: endowments,
        });
        return /** @type {{make: Function}} */ (namespace).make(
          powersP,
          contextP,
          Object.freeze({ env }),
        );
      },

      /**
       * @param {ERef<EndoReadable>} readableP - Readable blob of a ZIP
       *   archive containing a `compartment-map.json` and module sources
       *   (no precompiled module formats).
       * @param {Promise<unknown>} powersP
       * @param {Promise<unknown>} contextP
       * @param {Record<string, string>} env
       */
      makeArchive: async (readableP, powersP, contextP, env) => {
        // Stream the archive via the existing base64-encoded reader so
        // we never hand a mutable Uint8Array across CapTP (which would
        // be rejected by @endo/marshal).  Concatenate the chunks into
        // a single Uint8Array for compartment-mapper.parseArchive.
        /** @type {Uint8Array[]} */
        const chunks = [];
        let total = 0;
        for await (const chunk of makeRefReader(
          /** @type {any} */ (await E(readableP).streamBase64()),
        )) {
          chunks.push(chunk);
          total += chunk.byteLength;
        }
        const archiveBytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          archiveBytes.set(chunk, offset);
          offset += chunk.byteLength;
        }

        // Defer the compartment-mapper imports so workers that never
        // call makeArchive don't pay the babel/parser load cost.
        // Use the "all parsers" set so we accept source-form modules
        // (mjs/cjs) but degrade gracefully if a precompiled module
        // format slips through.
        const [{ parseArchive }, { defaultParserForLanguage }] =
          await Promise.all([
            import('@endo/compartment-mapper'),
            import('@endo/compartment-mapper/import-archive-all-parsers.js'),
          ]);
        const application = await parseArchive(archiveBytes, '<archive>', {
          parserForLanguage: defaultParserForLanguage,
        });
        const { namespace } = await application.import({
          globals: endowments,
        });
        return /** @type {{make: Function}} */ (namespace).make(
          powersP,
          contextP,
          Object.freeze({ env }),
        );
      },
    }),
  );
};

/**
 * @param {MignonicPowers} powers
 * @param {number | undefined} pid
 * @param {(error: Error) => void} cancel
 * @param {Promise<never>} cancelled
 */
export const main = async (powers, pid, cancel, cancelled) => {
  console.error(`Endo worker started on pid ${pid}`);
  cancelled.catch(() => {
    console.error(`Endo worker exiting on pid ${pid}`);
  });

  const { reader, writer } = powers.connection;

  const workerFacet = makeWorkerFacet({
    cancel,
  });

  const { closed } = makeNetstringCapTP(
    'Endo',
    writer,
    reader,
    cancelled,
    workerFacet,
  );

  return Promise.race([cancelled, closed]);
};
