// @ts-check
/* global globalThis, process */

import harden from '@endo/harden';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { ZipWriter } from '@endo/zip/writer.js';
import { bytesFromText } from '@endo/bytes/from-string.js';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { makeNetstringCapTP } from './connection.js';
import { getUnredactedStackString } from './unredacted-stack.js';

import { WorkerFacetForDaemonInterface } from './interfaces.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoReadable, MignonicPowers } from './types.js' */
/** @import { TraceRecord } from './trace-aggregator.js' */

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
        for await (const chunk of iterateBytesReader(
          /** @type {any} */ (readableP),
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
 * Build a `marshalSaveError` callback that pushes a worker-side trace
 * record to the daemon for every outbound error this worker's CapTP
 * marshal serializes.
 *
 * The push uses `E.sendOnly` so the worker never blocks an outbound
 * error on the success of a trace push.
 *
 * @param {() => unknown} getDaemonFacet returns the daemon's
 *   `EndoDaemonFacetForWorker` once CapTP has resolved the bootstrap.
 *   May return undefined before the bootstrap arrives, in which case
 *   the push is dropped.
 * @param {string} site label for the capture site, recorded with
 *   each trace.
 */
const makeWorkerPushTrace = (getDaemonFacet, site) => {
  /**
   * @param {Error} err
   * @param {string} [errorId]
   */
  return (err, errorId) => {
    if (errorId === undefined) return;
    const daemonFacet = getDaemonFacet();
    if (daemonFacet === undefined) return;
    // Use the privileged SES hook (the same hack `@endo/ses-ava` taps to
    // surface unredacted traces to AVA) so the operator running
    // `endo trace` sees the originating stack, the cause chain, and any
    // `note(err, ...)` annotations rather than the redacted public
    // `err.stack` view (which is `''` on V8 under safe errorTaming).
    let stack = getUnredactedStackString(err);
    if (stack.length === 0) {
      // The realm has neither the ses-ava unredaction hook nor a usable
      // `err.stack` (a non-SES embedding, or an error constructed with
      // no stack). Capture a fresh trace at marshal time so the
      // operator at least sees where the error left the worker.
      const captureSite = Error('trace capture');
      stack = typeof captureSite.stack === 'string' ? captureSite.stack : '';
    }
    /** @type {TraceRecord} */
    const record = harden({
      errorId,
      // The daemon overwrites this with the connection's authoritative
      // workerId; we send a placeholder so the record is well-formed
      // for any local-only consumer.
      workerId: '',
      name: typeof err.name === 'string' ? err.name : 'Error',
      message: typeof err.message === 'string' ? err.message : `${err}`,
      stack,
      annotations: [],
      causes: [],
      t: Date.now(),
      site,
    });
    try {
      // The daemon facet is the bootstrap returned by CapTP and is
      // typed as opaque on the worker side; cast to access the trace
      // method we know the daemon exposes.
      /** @type {{ reportTrace: (r: TraceRecord) => void }} */
      const facet = /** @type {any} */ (daemonFacet);
      E.sendOnly(facet).reportTrace(record);
    } catch (pushError) {
      console.error(
        'Endo worker trace push failed:',
        /** @type {Error} */ (pushError).message || pushError,
      );
    }
  };
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

  /** @type {unknown} */
  let daemonFacet;
  const getDaemonFacet = () => daemonFacet;
  const pushTraceFromMarshal = makeWorkerPushTrace(getDaemonFacet, 'marshal');
  const pushTraceFromCapTP = makeWorkerPushTrace(getDaemonFacet, 'captp');

  const { closed, getBootstrap } = makeNetstringCapTP(
    'Endo',
    writer,
    reader,
    cancelled,
    workerFacet,
    {
      marshalSaveError: pushTraceFromMarshal,
      onReject: err => {
        pushTraceFromCapTP(err);
        console.error('CapTP Endo exception:', err);
      },
    },
  );

  daemonFacet = getBootstrap();

  // Capture top-level unhandled rejections as trace records so a
  // background failure inside an unconfined caplet still surfaces
  // through `traces.lookup`.
  if (typeof process !== 'undefined' && process.on !== undefined) {
    let unhandledSeq = 0;
    process.on(
      'unhandledRejection',
      /** @param {unknown} reason */ reason => {
        const err = reason instanceof Error ? reason : Error(String(reason));
        unhandledSeq += 1;
        const errorId = `error:Endo#unhandled-${unhandledSeq}`;
        pushTraceFromMarshal(err, errorId);
      },
    );
  }

  return Promise.race([cancelled, closed]);
};
