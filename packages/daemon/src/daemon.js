// @ts-check
/// <reference types="ses"/>

/* global setTimeout, clearTimeout */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeNetstringCapTP } from './connection.js';
import { makeRefReader } from './ref-reader.js';
import { makeMailboxMaker } from './mail.js';
import { makeGuestMaker } from './guest.js';
import { makeHostMaker } from './host.js';

const { quote: q } = assert;

const zero512 =
  '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

/** @type {import('./types.js').EndoGuest} */
const leastAuthority = Far('EndoGuest', {
  async request() {
    throw new Error('declined');
  },
});

const delay = async (ms, cancelled) => {
  // Do not attempt to set up a timer if already cancelled.
  await Promise.race([cancelled, undefined]);
  return new Promise((resolve, reject) => {
    const handle = setTimeout(resolve, ms);
    cancelled.catch(error => {
      reject(error);
      clearTimeout(handle);
    });
  });
};

/**
 * @param {import('./types.js').DaemonicPowers} powers
 * @param {Promise<number>} webletPortP
 * @param {object} args
 * @param {Promise<never>} args.cancelled
 * @param {(error: Error) => void} args.cancel
 * @param {number} args.gracePeriodMs
 * @param {Promise<never>} args.gracePeriodElapsed
 */
const makeEndoBootstrap = (
  powers,
  webletPortP,
  { cancelled, cancel, gracePeriodMs, gracePeriodElapsed },
) => {
  const {
    crypto: cryptoPowers,
    petStore: petStorePowers,
    persistence: persistencePowers,
    control: controlPowers,
  } = powers;
  const { randomHex512, makeSha512 } = cryptoPowers;
  const contentStore = persistencePowers.makeContentSha512Store();

  /** @type {Map<string, unknown>} */
  const valuePromiseForFormulaIdentifier = new Map();
  // Reverse look-up, for answering "what is my name for this near or far
  // reference", and not for "what is my name for this promise".
  /** @type {WeakMap<object, string>} */
  const formulaIdentifierForRef = new WeakMap();

  /** @type {WeakMap<object, import('@endo/eventual-send').ERef<import('./worker.js').WorkerBootstrap>>} */
  const workerBootstraps = new WeakMap();

  /**
   * @param {string} sha512
   */
  const makeSha512ReadableBlob = sha512 => {
    const { text, json, stream } = contentStore.fetch(sha512);
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
    const sha512Hex = await contentStore.store(makeRefReader(readerRef));
    return `readable-blob-sha512:${sha512Hex}`;
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

    const { reject: cancelWorker, promise: workerCancelled } =
      /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
        makePromiseKit()
      );
    cancelled.catch(async error => cancelWorker(error));

    const {
      reader,
      writer,
      closed: workerClosed,
      pid: workerPid,
    } = await controlPowers.makeWorker(workerId512, workerCancelled);

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
      await delay(gracePeriodMs, workerGracePeriodCancelled)
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
        url: `http://${formulaNumber}.endo.localhost:${await webletPortP}`,
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
   * @param {string} formulaIdentifier
   */
  const makeValueForFormulaIdentifier = async formulaIdentifier => {
    const delimiterIndex = formulaIdentifier.indexOf(':');
    if (delimiterIndex < 0) {
      if (formulaIdentifier === 'pet-store') {
        return petStorePowers.makeOwnPetStore('pet-store');
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
        if (persistencePowers.webPageBundlerFormula === undefined) {
          throw Error('No web-page-js formula provided.');
        }
        return makeValueForFormula(
          'web-page-js',
          zero512,
          persistencePowers.webPageBundlerFormula,
        );
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
      return petStorePowers.makeIdentifiedPetStore(formulaNumber);
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
      const formula = await persistencePowers.readFormula(
        prefix,
        formulaNumber,
      );
      // TODO validate
      return makeValueForFormula(formulaIdentifier, formulaNumber, formula);
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

    await persistencePowers.writeFormula(formula, formulaType, formulaNumber);
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
    const formulaNumber = await randomHex512();
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

  const { makeMailbox, partyReceiveFunctions, partyRequestFunctions } =
    makeMailboxMaker({
      formulaIdentifierForRef,
      provideValueForFormulaIdentifier,
    });

  const makeIdentifiedGuest = makeGuestMaker({
    provideValueForFormulaIdentifier,
    partyReceiveFunctions,
    partyRequestFunctions,
    makeMailbox,
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
    makeMailbox,
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

/**
 * @param {import('./types.js').DaemonicPowers} powers
 * @param {string} daemonLabel
 * @param {(error: Error) => void} cancel
 * @param {Promise<never>} cancelled
 */
export const makeDaemon = async (powers, daemonLabel, cancel, cancelled) => {
  const { promise: gracePeriodCancelled, reject: cancelGracePeriod } =
    /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
      makePromiseKit()
    );

  // TODO thread through command arguments.
  const gracePeriodMs = 100;

  /** @type {Promise<never>} */
  const gracePeriodElapsed = cancelled.catch(async error => {
    await delay(gracePeriodMs, gracePeriodCancelled);
    console.log(
      `Endo daemon grace period ${gracePeriodMs}ms elapsed for ${daemonLabel}`,
    );
    throw error;
  });

  const { promise: assignedWebletPortP, resolve: assignWebletPort } =
    /** @type {import('@endo/promise-kit').PromiseKit<number>} */ (
      makePromiseKit()
    );

  const endoBootstrap = makeEndoBootstrap(powers, assignedWebletPortP, {
    cancelled,
    cancel,
    gracePeriodMs,
    gracePeriodElapsed,
  });

  return { endoBootstrap, cancelGracePeriod, assignWebletPort };
};
