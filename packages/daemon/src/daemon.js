// @ts-check
/// <reference types="ses"/>

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { mapReader, mapWriter } from '@endo/stream';
import {
  makeMessageCapTP,
  makeNetstringCapTP,
  messageToBytes,
  bytesToMessage,
} from './connection.js';
import { makeRefReader } from './ref-reader.js';
import { makeReaderRef } from './reader-ref.js';
import { makeOwnPetStore, makeIdentifiedPetStore } from './pet-store.js';
import { makeGuestMaker } from './guest.js';
import { makeHostMaker } from './host.js';

const { quote: q } = assert;

const zero512 =
  '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

const defaultHttpPort = 8920; // Eight Nine Duo Oh: ENDO.

/** @type {import('./types.js').EndoGuest} */
const leastAuthority = Far('EndoGuest', {
  async request() {
    throw new Error('declined');
  },
});

/**
 * @param {import('./types.js').DaemonicPowers} powers
 * @param {import('./types.js').Locator} locator
 * @param {number} httpPort
 * @param {object} args
 * @param {Promise<never>} args.cancelled
 * @param {(error: Error) => void} args.cancel
 * @param {number} args.gracePeriodMs
 * @param {Promise<never>} args.gracePeriodElapsed
 */
const makeEndoBootstrap = (
  powers,
  locator,
  httpPort,
  { cancelled, cancel, gracePeriodMs, gracePeriodElapsed },
) => {
  const { randomHex512, makeSha512 } = powers;

  /** @type {Map<string, unknown>} */
  const valuePromiseForFormulaIdentifier = new Map();
  // Reverse look-up, for answering "what is my name for this near or far
  // reference", and not for "what is my name for this promise".
  /** @type {WeakMap<object, string>} */
  const formulaIdentifierForRef = new WeakMap();
  /** @type {WeakMap<object, import('./types.js').RequestFn>} */
  const partyRequestFunctions = new WeakMap();
  /** @type {WeakMap<object, import('./types.js').ReceiveFn>} */
  const partyReceiveFunctions = new WeakMap();

  /** @type {WeakMap<object, import('@endo/eventual-send').ERef<import('./worker.js').WorkerBootstrap>>} */
  const workerBootstraps = new WeakMap();

  /**
   * @param {string} sha512
   */
  const makeSha512ReadableBlob = sha512 => {
    const storageDirectoryPath = powers.joinPath(
      locator.statePath,
      'store-sha512',
    );
    const storagePath = powers.joinPath(storageDirectoryPath, sha512);
    const stream = async () => {
      const reader = powers.makeFileReader(storagePath);
      return makeReaderRef(reader);
    };
    const text = async () => {
      return powers.readFileText(storagePath);
    };
    const json = async () => {
      return JSON.parse(await text());
    };
    return Far(`Readable file with SHA-512 ${sha512.slice(0, 8)}...`, {
      sha512: () => sha512,
      stream,
      text,
      json,
      [Symbol.asyncIterator]: stream,
    });
  };

  /**
   * @param {import('@endo/eventual-send').ERef<AsyncIterableIterator<string>>} readerRef
   */
  const storeReaderRef = async readerRef => {
    const storageDirectoryPath = powers.joinPath(
      locator.statePath,
      'store-sha512',
    );
    await powers.makePath(storageDirectoryPath);

    // Pump the reader into a temporary file and hash.
    // We use a temporary file to avoid leaving a partially writen object,
    // but also because we won't know the name we will use until we've
    // completed the hash.
    const digester = powers.makeSha512();
    const storageId512 = await powers.randomHex512();
    const temporaryStoragePath = powers.joinPath(
      storageDirectoryPath,
      storageId512,
    );
    const writer = powers.makeFileWriter(temporaryStoragePath);
    for await (const chunk of makeRefReader(readerRef)) {
      await writer.next(chunk);
      digester.update(chunk);
    }
    await writer.return(undefined);
    const sha512 = digester.digestHex();

    // Finish with an atomic rename.
    const storagePath = powers.joinPath(storageDirectoryPath, sha512);
    await powers.renamePath(temporaryStoragePath, storagePath);

    return `readable-blob-sha512:${sha512}`;
  };

  /**
   * @param {string} workerId512
   * @param {string} workerFormulaIdentifier
   */
  const makeWorkerBootstrap = async (workerId512, workerFormulaIdentifier) => {
    // TODO validate workerId512, workerFormulaIdentifier
    return Far(`Endo for worker ${workerId512}`, {});
  };

  /**
   * @param {string} workerId512
   */
  const makeIdentifiedWorker = async workerId512 => {
    // TODO validate workerId512
    const workerFormulaIdentifier = `worker-id512:${workerId512}`;
    const workerCachePath = powers.joinPath(
      locator.cachePath,
      'worker-id512',
      workerId512,
    );
    const workerStatePath = powers.joinPath(
      locator.statePath,
      'worker-id512',
      workerId512,
    );
    const workerEphemeralStatePath = powers.joinPath(
      locator.ephemeralStatePath,
      'worker-id512',
      workerId512,
    );

    await Promise.all([
      powers.makePath(workerStatePath),
      powers.makePath(workerEphemeralStatePath),
    ]);

    const { reject: cancelWorker, promise: workerCancelled } =
      /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
        makePromiseKit()
      );
    cancelled.catch(async error => cancelWorker(error));

    const logPath = powers.joinPath(workerStatePath, 'worker.log');
    const workerPidPath = powers.joinPath(
      workerEphemeralStatePath,
      'worker.pid',
    );
    const {
      reader,
      writer,
      closed: workerClosed,
      pid: workerPid,
    } = await powers.makeWorker(
      workerId512,
      powers.endoWorkerPath,
      logPath,
      workerPidPath,
      locator.sockPath,
      workerStatePath,
      workerEphemeralStatePath,
      workerCachePath,
      workerCancelled,
    );

    console.log(
      `Endo worker started PID ${workerPid} unique identifier ${workerId512}`,
    );

    const { getBootstrap, closed: capTpClosed } = makeNetstringCapTP(
      `Worker ${workerId512}`,
      writer,
      reader,
      gracePeriodElapsed,
      makeWorkerBootstrap(workerId512, workerFormulaIdentifier),
    );

    const closed = Promise.race([workerClosed, capTpClosed]).finally(() => {
      console.log(
        `Endo worker stopped PID ${workerPid} with unique identifier ${workerId512}`,
      );
    });

    /** @type {import('@endo/eventual-send').ERef<import('./worker.js').WorkerBootstrap>} */
    const workerBootstrap = getBootstrap();

    const terminate = async () => {
      E.sendOnly(workerBootstrap).terminate();
      const cancelWorkerGracePeriod = () => {
        throw new Error('Exited gracefully before grace period elapsed');
      };
      const workerGracePeriodCancelled = Promise.race([
        gracePeriodElapsed,
        closed,
      ]).then(cancelWorkerGracePeriod, cancelWorkerGracePeriod);
      await powers
        .delay(gracePeriodMs, workerGracePeriodCancelled)
        .then(() => {
          throw new Error(
            `Worker termination grace period ${gracePeriodMs}ms elapsed`,
          );
        })
        .catch(cancelWorker);
    };

    const worker = Far('EndoWorker', {
      terminate,

      whenTerminated: () => closed,
    });

    workerBootstraps.set(worker, workerBootstrap);

    return worker;
  };

  /**
   * @param {string} workerFormulaIdentifier
   * @param {string} source
   * @param {Array<string>} codeNames
   * @param {Array<string>} formulaIdentifiers
   */
  const makeValueForEval = async (
    workerFormulaIdentifier,
    source,
    codeNames,
    formulaIdentifiers,
  ) => {
    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const workerFacet = await provideValueForFormulaIdentifier(
      workerFormulaIdentifier,
    );
    // TODO consider a better mechanism for hiding the private facet.
    // Maybe all these internal functions should return { public, private }
    // duples.
    const workerBootstrap = workerBootstraps.get(workerFacet);
    assert(workerBootstrap);
    const endowmentValues = await Promise.all(
      formulaIdentifiers.map(formulaIdentifier =>
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(formulaIdentifier),
      ),
    );
    return E(workerBootstrap).evaluate(source, codeNames, endowmentValues);
  };

  /**
   * @param {string} workerFormulaIdentifier
   * @param {string} guestFormulaIdentifier
   * @param {string} importPath
   */
  const makeValueForImportUnsafe0 = async (
    workerFormulaIdentifier,
    guestFormulaIdentifier,
    importPath,
  ) => {
    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const workerFacet = await provideValueForFormulaIdentifier(
      workerFormulaIdentifier,
    );
    const workerBootstrap = workerBootstraps.get(workerFacet);
    assert(workerBootstrap);
    const guestP = /** @type {Promise<import('./types.js').EndoGuest>} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      provideValueForFormulaIdentifier(guestFormulaIdentifier)
    );
    return E(workerBootstrap).importUnsafeAndEndow(importPath, guestP);
  };

  /**
   * @param {string} workerFormulaIdentifier
   * @param {string} guestFormulaIdentifier
   * @param {string} bundleFormulaIdentifier
   */
  const makeValueForImportBundle0 = async (
    workerFormulaIdentifier,
    guestFormulaIdentifier,
    bundleFormulaIdentifier,
  ) => {
    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const workerFacet = await provideValueForFormulaIdentifier(
      workerFormulaIdentifier,
    );
    const workerBootstrap = workerBootstraps.get(workerFacet);
    assert(workerBootstrap);
    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const readableBundleP =
      /** @type {Promise<import('./types.js').EndoReadable>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(bundleFormulaIdentifier)
      );
    const guestP = /** @type {Promise<import('./types.js').EndoGuest>} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      provideValueForFormulaIdentifier(guestFormulaIdentifier)
    );
    return E(workerBootstrap).importBundleAndEndow(readableBundleP, guestP);
  };

  /**
   * @param {string} formulaIdentifier
   * @param {string} formulaNumber
   * @param {import('./types.js').Formula} formula
   */
  const makeValueForFormula = async (
    formulaIdentifier,
    formulaNumber,
    formula,
  ) => {
    if (formula.type === 'eval') {
      return makeValueForEval(
        formula.worker,
        formula.source,
        formula.names,
        formula.values,
      );
    } else if (formula.type === 'import-unsafe') {
      return makeValueForImportUnsafe0(
        formula.worker,
        formula.powers,
        formula.importPath,
      );
    } else if (formula.type === 'import-bundle') {
      return makeValueForImportBundle0(
        formula.worker,
        formula.powers,
        formula.bundle,
      );
    } else if (formula.type === 'guest') {
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return makeIdentifiedGuest(
        formulaIdentifier,
        formula.host,
        `pet-store-id512:${formulaNumber}`,
        `worker-id512:${formulaNumber}`,
      );
    } else if (formula.type === 'web-bundle') {
      return harden({
        url: `http://${formulaNumber}.endo.localhost:${httpPort}`,
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        bundle: provideValueForFormulaIdentifier(formula.bundle),
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        powers: provideValueForFormulaIdentifier(formula.powers),
      });
    } else {
      throw new TypeError(`Invalid formula: ${q(formula)}`);
    }
  };

  /**
   * @param {string} formulaType
   * @param {string} formulaId512
   */
  const makeFormulaPath = (formulaType, formulaId512) => {
    if (formulaId512.length < 3) {
      throw new TypeError(
        `Invalid formula identifier ${q(formulaId512)} for formula of type ${q(
          formulaType,
        )}`,
      );
    }
    const head = formulaId512.slice(0, 2);
    const tail = formulaId512.slice(3);
    const directory = powers.joinPath(
      locator.statePath,
      'formulas',
      formulaType,
      head,
    );
    const file = powers.joinPath(directory, `${tail}.json`);
    return { directory, file };
  };

  // Persist instructions for revival (this can be collected)
  const writeFormula = async (formula, formulaType, formulaId512) => {
    const { directory, file } = makeFormulaPath(formulaType, formulaId512);
    // TODO Take care to write atomically with a rename here.
    await powers.makePath(directory);
    await powers.writeFileText(file, `${q(formula)}\n`);
  };

  /**
   * @param {string} formulaIdentifier
   * @param {string} formulaNumber
   * @param {string} formulaPath
   */
  const makeValueForFormulaAtPath = async (
    formulaIdentifier,
    formulaNumber,
    formulaPath,
  ) => {
    const formulaText = await powers.readFileText(formulaPath).catch(() => {
      // TODO handle EMFILE gracefully
      throw new ReferenceError(`No reference exists at path ${formulaPath}`);
    });
    const formula = (() => {
      try {
        return JSON.parse(formulaText);
      } catch (error) {
        throw new TypeError(
          `Corrupt description for reference in file ${formulaPath}: ${error.message}`,
        );
      }
    })();
    // TODO validate
    return makeValueForFormula(formulaIdentifier, formulaNumber, formula);
  };

  /**
   * @param {string} formulaIdentifier
   */
  const makeValueForFormulaIdentifier = async formulaIdentifier => {
    const delimiterIndex = formulaIdentifier.indexOf(':');
    if (delimiterIndex < 0) {
      if (formulaIdentifier === 'pet-store') {
        return makeOwnPetStore(powers, locator, 'pet-store');
      } else if (formulaIdentifier === 'host') {
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        return makeIdentifiedHost(
          formulaIdentifier,
          'pet-store',
          `worker-id512:${zero512}`,
        );
      } else if (formulaIdentifier === 'endo') {
        // Behold, self-referentiality:
        // eslint-disable-next-line no-use-before-define
        return endoBootstrap;
      } else if (formulaIdentifier === 'least-authority') {
        return leastAuthority;
      } else if (formulaIdentifier === 'web-page-js') {
        return makeValueForFormula('web-page-js', zero512, {
          type: /** @type {'import-unsafe'} */ ('import-unsafe'),
          worker: `worker-id512:${zero512}`,
          powers: 'host',
          importPath: powers.fileURLToPath(
            new URL('web-page-bundler.js', import.meta.url).href,
          ),
        });
      }
      throw new TypeError(
        `Formula identifier must have a colon: ${q(formulaIdentifier)}`,
      );
    }
    const prefix = formulaIdentifier.slice(0, delimiterIndex);
    const formulaNumber = formulaIdentifier.slice(delimiterIndex + 1);
    if (prefix === 'readable-blob-sha512') {
      return makeSha512ReadableBlob(formulaNumber);
    } else if (prefix === 'worker-id512') {
      return makeIdentifiedWorker(formulaNumber);
    } else if (prefix === 'pet-store-id512') {
      return makeIdentifiedPetStore(powers, locator, formulaNumber);
    } else if (prefix === 'host-id512') {
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return makeIdentifiedHost(
        formulaIdentifier,
        `pet-store-id512:${formulaNumber}`,
        `worker-id512:${formulaNumber}`,
      );
    } else if (
      [
        'eval-id512',
        'import-unsafe-id512',
        'import-bundle-id512',
        'guest-id512',
        'web-bundle',
      ].includes(prefix)
    ) {
      const { file: path } = makeFormulaPath(prefix, formulaNumber);
      return makeValueForFormulaAtPath(formulaIdentifier, formulaNumber, path);
    } else {
      throw new TypeError(
        `Invalid formula identifier, unrecognized type ${q(formulaIdentifier)}`,
      );
    }
  };

  // The two functions provideValueForFormula and provideValueForFormulaIdentifier
  // share a responsibility for maintaining the memoization tables
  // valuePromiseForFormulaIdentifier and formulaIdentifierForRef, since the
  // former bypasses the latter in order to avoid a round trip with disk.

  const provideValueForNumberedFormula = async (
    formulaType,
    formulaNumber,
    formula,
  ) => {
    const formulaIdentifier = `${formulaType}:${formulaNumber}`;

    await writeFormula(formula, formulaType, formulaNumber);
    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const promiseForValue = makeValueForFormula(
      formulaIdentifier,
      formulaNumber,
      formula,
    );

    // Memoize provide.
    valuePromiseForFormulaIdentifier.set(formulaIdentifier, promiseForValue);

    // Prepare an entry for reverse-lookup of formula for presence.
    const value = await promiseForValue;
    if (typeof value === 'object' && value !== null) {
      formulaIdentifierForRef.set(value, formulaIdentifier);
    }

    return { formulaIdentifier, value };
  };

  /**
   * @param {import('./types.js').Formula} formula
   * @param {string} formulaType
   */
  const provideValueForFormula = async (formula, formulaType) => {
    const formulaNumber = await powers.randomHex512();
    return provideValueForNumberedFormula(formulaType, formulaNumber, formula);
  };

  /**
   * @param {string} formulaIdentifier
   */
  const provideValueForFormulaIdentifier = async formulaIdentifier => {
    let promiseForValue =
      valuePromiseForFormulaIdentifier.get(formulaIdentifier);
    if (promiseForValue === undefined) {
      promiseForValue = makeValueForFormulaIdentifier(formulaIdentifier);
      valuePromiseForFormulaIdentifier.set(formulaIdentifier, promiseForValue);
    }
    const value = await promiseForValue;
    if (typeof value === 'object' && value !== null) {
      formulaIdentifierForRef.set(value, formulaIdentifier);
    }
    return value;
  };

  const makeIdentifiedGuest = makeGuestMaker({
    provideValueForFormulaIdentifier,
    partyReceiveFunctions,
    partyRequestFunctions,
  });

  const makeIdentifiedHost = makeHostMaker({
    provideValueForFormulaIdentifier,
    provideValueForFormula,
    provideValueForNumberedFormula,
    formulaIdentifierForRef,
    partyReceiveFunctions,
    partyRequestFunctions,
    storeReaderRef,
    randomHex512,
    makeSha512,
  });

  const endoBootstrap = Far('Endo private facet', {
    // TODO for user named

    ping: async () => 'pong',

    terminate: async () => {
      cancel(new Error('Termination requested'));
    },

    host: () => provideValueForFormulaIdentifier('host'),

    leastAuthority: () => leastAuthority,

    webPageJs: () => provideValueForFormulaIdentifier('web-page-js'),

    importAndEndowInWebPage: async (webPageP, webPageNumber) => {
      const { bundle: bundleBlob, powers: endowedPowers } =
        /** @type {import('./types.js').EndoWebBundle} */ (
          await provideValueForFormulaIdentifier(
            `web-bundle:${webPageNumber}`,
          ).catch(() => {
            throw new Error('Not found');
          })
        );
      const bundle = await E(bundleBlob).json();
      await E(webPageP).importBundleAndEndow(bundle, endowedPowers);
    },
  });

  return endoBootstrap;
};

/*
 * @param {import('./types.js').DaemonicPowers} powers
 * @param {import('./types.js').Locator} locator
 * @param {number | undefined} pid
 * @param {(error: Error) => void} cancel
 * @param {Promise<never>} cancelled
 */
export const main = async (powers, locator, pid, cancel, cancelled) => {
  console.log(`Endo daemon starting on PID ${pid}`);
  cancelled.catch(() => {
    console.log(`Endo daemon stopping on PID ${pid}`);
  });

  const { promise: gracePeriodCancelled, reject: cancelGracePeriod } =
    /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
      makePromiseKit()
    );

  // TODO thread through command arguments.
  const gracePeriodMs = 100;

  /** @type {Promise<never>} */
  const gracePeriodElapsed = cancelled.catch(async error => {
    await powers.delay(gracePeriodMs, gracePeriodCancelled);
    console.log(
      `Endo daemon grace period ${gracePeriodMs}ms elapsed on PID ${pid}`,
    );
    throw error;
  });

  /** @param {Error} error */
  const exitWithError = error => {
    cancel(error);
    cancelGracePeriod(error);
  };

  const statePathP = powers.makePath(locator.statePath);
  const ephemeralStatePathP = powers.makePath(locator.ephemeralStatePath);
  const cachePathP = powers.makePath(locator.cachePath);
  await Promise.all([statePathP, cachePathP, ephemeralStatePathP]);

  let nextConnectionNumber = 0;
  /** @type {Set<Promise<void>>} */
  const connectionClosedPromises = new Set();

  const respond = async request => {
    if (request.method === 'GET') {
      if (request.url === '/') {
        return {
          status: 200,
          headers: { 'Content-Type': 'text/html', Charset: 'utf-8' },
          content: `\
<meta charset="utf-8">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 10%22><text y=%228%22 font-size=%228%22>🐈‍⬛</text></svg>">
<body>
  <h1>⏳</h1>
  <script src="bootstrap.js"></script>
</body>`,
        };
      } else if (request.url === '/bootstrap.js') {
        // TODO readable mutable file formula (with watcher?)
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        const webPageJs = await E(endoBootstrap).webPageJs();
        return {
          status: 200,
          headers: { 'Content-Type': 'application/javascript' },
          content: webPageJs,
        };
      }
    }
    return {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
      content: `Not found: ${request.method} ${request.url}`,
    };
  };

  const requestedHttpPortString = powers.env.ENDO_HTTP_PORT;
  const requestedHttpPort = requestedHttpPortString
    ? Number(requestedHttpPortString)
    : defaultHttpPort;

  const httpReadyP = powers.serveHttp({
    port: requestedHttpPort,
    respond,
    connect(connection, request) {
      // TODO select attenuated bootstrap based on subdomain
      (async () => {
        const {
          reader: frameReader,
          writer: frameWriter,
          closed: connectionClosed,
        } = connection;

        const connectionNumber = nextConnectionNumber;
        nextConnectionNumber += 1;
        console.log(
          `Endo daemon received local web socket connection ${connectionNumber} at ${new Date().toISOString()}`,
        );

        const messageWriter = mapWriter(frameWriter, messageToBytes);
        const messageReader = mapReader(frameReader, bytesToMessage);

        const { closed: capTpClosed, getBootstrap } = makeMessageCapTP(
          'Endo',
          messageWriter,
          messageReader,
          cancelled,
          undefined, // bootstrap
        );

        const webBootstrap = getBootstrap();

        // TODO set up heart monitor
        E.sendOnly(webBootstrap).ping();

        const host = request.headers.host;
        if (host === undefined) {
          throw new Error('Host header required');
        }
        const match =
          /^([0-9a-f]{32})\.endo\.localhost:([1-9][0-9]{0,4})$/.exec(host);
        if (match === null) {
          throw new Error(`Invalid host ${host}`);
        }
        const [_, formulaNumber, portNumber] = match;
        // eslint-disable-next-line no-use-before-define
        if (assignedHttpPort !== +portNumber) {
          console.error(
            'Connected browser misreported port number in host header',
          );
          E(webBootstrap)
            .reject(
              'Your browser misreported your port number in the host header',
            )
            .catch(error => {
              console.error(error);
            });
        } else {
          // eslint-disable-next-line no-use-before-define
          E(endoBootstrap)
            .importAndEndowInWebPage(webBootstrap, formulaNumber)
            .catch(error => {
              E.sendOnly(webBootstrap).reject(error.message);
            })
            .catch(error => {
              console.error(error);
            });
        }

        const closed = Promise.race([connectionClosed, capTpClosed]);
        connectionClosedPromises.add(closed);
        closed.finally(() => {
          connectionClosedPromises.delete(closed);
          console.log(
            `Endo daemon closed local web socket connection ${connectionNumber} at ${new Date().toISOString()}`,
          );
        });
      })().catch(exitWithError);
    },
    cancelled,
  });

  const connectionsP = powers.listenOnPath(locator.sockPath, cancelled);

  await Promise.all([connectionsP, httpReadyP]).catch(error => {
    powers.reportErrorToParent(error.message);
    throw error;
  });

  const assignedHttpPort = await httpReadyP;
  console.log(
    `Endo daemon listening for HTTP on ${q(
      assignedHttpPort,
    )} ${new Date().toISOString()}`,
  );

  const endoBootstrap = makeEndoBootstrap(powers, locator, assignedHttpPort, {
    cancelled,
    cancel,
    gracePeriodMs,
    gracePeriodElapsed,
  });

  const pidPath = powers.joinPath(locator.ephemeralStatePath, 'endo.pid');

  await powers
    .readFileText(pidPath)
    .then(pidText => {
      const oldPid = Number(pidText);
      powers.kill(oldPid);
    })
    .catch(() => {});

  await powers.writeFileText(pidPath, `${pid}\n`);

  const connections = await connectionsP;
  // Resolve a promise in the Endo CLI through the IPC channel:
  console.log(
    `Endo daemon listening for CapTP on ${q(
      locator.sockPath,
    )} ${new Date().toISOString()}`,
  );

  powers.informParentWhenReady();

  for await (const {
    reader,
    writer,
    closed: connectionClosed,
  } of connections) {
    (async () => {
      const connectionNumber = nextConnectionNumber;
      nextConnectionNumber += 1;
      console.log(
        `Endo daemon received domain connection ${connectionNumber} at ${new Date().toISOString()}`,
      );

      const { closed: capTpClosed } = makeNetstringCapTP(
        'Endo',
        writer,
        reader,
        cancelled,
        endoBootstrap,
      );

      const closed = Promise.race([connectionClosed, capTpClosed]);
      connectionClosedPromises.add(closed);
      closed.finally(() => {
        connectionClosedPromises.delete(closed);
        console.log(
          `Endo daemon closed domain connection ${connectionNumber} at ${new Date().toISOString()}`,
        );
      });
    })().catch(exitWithError);
  }

  await Promise.all(Array.from(connectionClosedPromises));

  cancel(new Error('Terminated normally'));
  cancelGracePeriod(new Error('Terminated normally'));
};
