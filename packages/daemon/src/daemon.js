// @ts-check
/// <reference types="ses"/>

/* global setTimeout, clearTimeout */

import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeRefReader } from './ref-reader.js';
import { makeDirectoryMaker } from './directory.js';
import { makeMailboxMaker } from './mail.js';
import { makeGuestMaker } from './guest.js';
import { makeHostMaker } from './host.js';
import { assertPetName } from './pet-name.js';
import { makeTerminatorMaker } from './terminator.js';

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

const makeInfo = (type, number, record) =>
  Far(`Inspector (${type} ${number})`, {
    lookup: async petName => {
      if (!Object.hasOwn(record, petName)) {
        return undefined;
      }
      return record[petName];
    },
    list: () => Object.keys(record),
  });

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

  /** @type {Map<string, import('./types.js').Controller<>>} */
  const controllerForFormulaIdentifier = new Map();
  // Reverse look-up, for answering "what is my name for this near or far
  // reference", and not for "what is my name for this promise".
  /** @type {WeakMap<object, string>} */
  const formulaIdentifierForRef = new WeakMap();

  /**
   * @param {string} sha512
   */
  const makeReadableBlob = sha512 => {
    const { text, json, streamBase64 } = contentStore.fetch(sha512);
    return Far(`Readable file with SHA-512 ${sha512.slice(0, 8)}...`, {
      sha512: () => sha512,
      streamBase64,
      text,
      json,
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
   * @param {import('./types.js').Terminator} terminator
   */
  const makeIdentifiedWorkerController = async (workerId512, terminator) => {
    // TODO validate workerId512
    const workerFormulaIdentifier = `worker-id512:${workerId512}`;

    const daemonWorkerFacet = makeWorkerBootstrap(
      workerId512,
      workerFormulaIdentifier,
    );

    const { reject: cancelWorker, promise: workerCancelled } =
      /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
        makePromiseKit()
      );
    cancelled.catch(async error => cancelWorker(error));

    const { workerTerminated, workerDaemonFacet } =
      await controlPowers.makeWorker(
        workerId512,
        daemonWorkerFacet,
        Promise.race([workerCancelled, gracePeriodElapsed]),
      );

    const terminate = async () => {
      E.sendOnly(workerDaemonFacet).terminate();
      const cancelWorkerGracePeriod = () => {
        throw new Error('Exited gracefully before grace period elapsed');
      };
      const workerGracePeriodCancelled = Promise.race([
        gracePeriodElapsed,
        workerTerminated,
      ]).then(cancelWorkerGracePeriod, cancelWorkerGracePeriod);
      await delay(gracePeriodMs, workerGracePeriodCancelled)
        .then(() => {
          throw new Error(
            `Worker termination grace period ${gracePeriodMs}ms elapsed`,
          );
        })
        .catch(cancelWorker);
      await workerTerminated;
    };

    terminator.onTerminate(terminate);

    const worker = Far('EndoWorker', {
      terminate: terminator.terminate,
      whenTerminated: () => terminator.terminated,
    });

    return {
      external: worker,
      internal: workerDaemonFacet,
    };
  };

  /**
   * @param {string} evalFormulaIdentifier
   * @param {string} workerFormulaIdentifier
   * @param {string} source
   * @param {Array<string>} codeNames
   * @param {Array<string>} formulaIdentifiers
   * @param {import('./types.js').Terminator} terminator
   */
  const makeControllerForEval = async (
    evalFormulaIdentifier,
    workerFormulaIdentifier,
    source,
    codeNames,
    formulaIdentifiers,
    terminator,
  ) => {
    terminator.thisDiesIfThatDies(workerFormulaIdentifier);
    for (const formulaIdentifier of formulaIdentifiers) {
      terminator.thisDiesIfThatDies(formulaIdentifier);
    }

    const workerController =
      /** @type {import('./types.js').Controller<unknown, import('./worker.js').WorkerBootstrap>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideControllerForFormulaIdentifier(workerFormulaIdentifier)
      );
    const workerDaemonFacet = workerController.internal;
    assert(
      workerDaemonFacet,
      `panic: No internal bootstrap for worker ${workerFormulaIdentifier}`,
    );

    const endowmentValues = await Promise.all(
      formulaIdentifiers.map(formulaIdentifier =>
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(formulaIdentifier),
      ),
    );

    const external = E(workerDaemonFacet).evaluate(
      source,
      codeNames,
      endowmentValues,
      terminator.terminated.then(() => {
        throw new Error('Terminated');
      }),
    );

    // TODO check whether the promise resolves to data that can be marshalled
    // into the content-address-store and truncate the dependency chain.
    // That will require some funny business around allowing eval formulas to
    // have a level of indirection where the settled formula depends on how
    // the indirect formula resolves.
    // That might mean racing two formulas and terminating the evaluator
    // if it turns out the value can be captured.

    return { external, internal: undefined };
  };

  /**
   * @param {string} valueFormulaIdentifier
   * @param {string} workerFormulaIdentifier
   * @param {string} guestFormulaIdentifier
   * @param {string} specifier
   * @param {import('./types.js').Terminator} terminator
   */
  const makeControllerForUnsafePlugin = async (
    valueFormulaIdentifier,
    workerFormulaIdentifier,
    guestFormulaIdentifier,
    specifier,
    terminator,
  ) => {
    terminator.thisDiesIfThatDies(workerFormulaIdentifier);
    terminator.thisDiesIfThatDies(guestFormulaIdentifier);

    const workerController =
      /** @type {import('./types.js').Controller<unknown, import('./worker.js').WorkerBootstrap>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideControllerForFormulaIdentifier(workerFormulaIdentifier)
      );
    const workerDaemonFacet = workerController.internal;
    assert(
      workerDaemonFacet,
      `panic: No internal bootstrap for worker ${workerFormulaIdentifier}`,
    );
    const guestP = /** @type {Promise<import('./types.js').EndoGuest>} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      provideValueForFormulaIdentifier(guestFormulaIdentifier)
    );
    const external = E(workerDaemonFacet).importUnsafeAndEndow(
      specifier,
      guestP,
    );
    return { external, internal: undefined };
  };

  /**
   * @param {string} valueFormulaIdentifier
   * @param {string} workerFormulaIdentifier
   * @param {string} guestFormulaIdentifier
   * @param {string} bundleFormulaIdentifier
   * @param {import('./types.js').Terminator} terminator
   */
  const makeControllerForSafeBundle = async (
    valueFormulaIdentifier,
    workerFormulaIdentifier,
    guestFormulaIdentifier,
    bundleFormulaIdentifier,
    terminator,
  ) => {
    terminator.thisDiesIfThatDies(workerFormulaIdentifier);
    terminator.thisDiesIfThatDies(guestFormulaIdentifier);

    const workerController =
      /** @type {import('./types.js').Controller<unknown, import('./worker.js').WorkerBootstrap>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideControllerForFormulaIdentifier(workerFormulaIdentifier)
      );
    const workerDaemonFacet = workerController.internal;
    assert(
      workerDaemonFacet,
      `panic: No internal bootstrap for worker ${workerFormulaIdentifier}`,
    );
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
    const external = E(workerDaemonFacet).importBundleAndEndow(
      readableBundleP,
      guestP,
    );
    return { external, internal: undefined };
  };

  /**
   * @param {string} formulaIdentifier
   * @param {string} formulaNumber
   * @param {import('./types.js').Formula} formula
   * @param {import('./types.js').Terminator} terminator
   */
  const makeControllerForFormula = async (
    formulaIdentifier,
    formulaNumber,
    formula,
    terminator,
  ) => {
    if (formula.type === 'eval') {
      return makeControllerForEval(
        formulaIdentifier,
        formula.worker,
        formula.source,
        formula.names,
        formula.values,
        terminator,
      );
    } else if (formula.type === 'import-unsafe') {
      return makeControllerForUnsafePlugin(
        formulaIdentifier,
        formula.worker,
        formula.powers,
        formula.specifier ??
          // @ts-expect-error
          formula.importPath, // (TODO deprecated)
        terminator,
      );
    } else if (formula.type === 'import-bundle') {
      return makeControllerForSafeBundle(
        formulaIdentifier,
        formula.worker,
        formula.powers,
        formula.bundle,
        terminator,
      );
    } else if (formula.type === 'guest') {
      const storeFormulaIdentifier = `pet-store-id512:${formulaNumber}`;
      const workerFormulaIdentifier = `worker-id512:${formulaNumber}`;
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return makeIdentifiedGuestController(
        formulaIdentifier,
        formula.host,
        storeFormulaIdentifier,
        workerFormulaIdentifier,
        terminator,
      );
    } else if (formula.type === 'web-bundle') {
      // Behold, forward-reference:
      // eslint-disable-next-line no-use-before-define
      terminator.thisDiesIfThatDies(formula.bundle);
      terminator.thisDiesIfThatDies(formula.powers);
      return {
        external: (async () =>
          harden({
            url: `http://${formulaNumber}.endo.localhost:${await webletPortP}`,
            // Behold, recursion:
            // eslint-disable-next-line no-use-before-define
            bundle: provideValueForFormulaIdentifier(formula.bundle),
            // Behold, recursion:
            // eslint-disable-next-line no-use-before-define
            powers: provideValueForFormulaIdentifier(formula.powers),
          }))(),
        internal: undefined,
      };
    } else {
      throw new TypeError(`Invalid formula: ${q(formula)}`);
    }
  };

  /**
   * @param {string} formulaIdentifier
   * @param {import('./types.js').Terminator} terminator
   */
  const makeControllerForFormulaIdentifier = async (
    formulaIdentifier,
    terminator,
  ) => {
    const delimiterIndex = formulaIdentifier.indexOf(':');
    if (delimiterIndex < 0) {
      if (formulaIdentifier === 'pet-store') {
        const external = petStorePowers.makeOwnPetStore(
          'pet-store',
          assertPetName,
        );
        return { external, internal: undefined };
      } else if (formulaIdentifier === 'pet-inspector') {
        // Behold, unavoidable forward-reference:
        // eslint-disable-next-line no-use-before-define
        const external = makeIdentifiedInspector('pet-store');
        return { external, internal: undefined };
      } else if (formulaIdentifier === 'host') {
        const storeFormulaIdentifier = 'pet-store';
        const infoFormulaIdentifier = 'pet-inspector';
        const workerFormulaIdentifier = `worker-id512:${zero512}`;
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        return makeIdentifiedHost(
          formulaIdentifier,
          storeFormulaIdentifier,
          infoFormulaIdentifier,
          workerFormulaIdentifier,
          terminator,
        );
      } else if (formulaIdentifier === 'endo') {
        // TODO reframe "cancelled" as termination of the "endo" object and
        // ensure that all values ultimately depend on "endo".
        // Behold, self-referentiality:
        // eslint-disable-next-line no-use-before-define
        return { external: endoBootstrap, internal: undefined };
      } else if (formulaIdentifier === 'least-authority') {
        return { external: leastAuthority, internal: undefined };
      } else if (formulaIdentifier === 'web-page-js') {
        if (persistencePowers.webPageBundlerFormula === undefined) {
          throw Error('No web-page-js formula provided.');
        }
        return makeControllerForFormula(
          'web-page-js',
          zero512,
          persistencePowers.webPageBundlerFormula,
          terminator,
        );
      }
      throw new TypeError(
        `Formula identifier must have a colon: ${q(formulaIdentifier)}`,
      );
    }
    const prefix = formulaIdentifier.slice(0, delimiterIndex);
    const formulaNumber = formulaIdentifier.slice(delimiterIndex + 1);
    if (prefix === 'readable-blob-sha512') {
      // Behold, forward-reference:
      // eslint-disable-next-line no-use-before-define
      const external = makeReadableBlob(formulaNumber);
      return { external, internal: undefined };
    } else if (prefix === 'worker-id512') {
      return makeIdentifiedWorkerController(formulaNumber, terminator);
    } else if (prefix === 'pet-inspector-id512') {
      // Behold, unavoidable forward-reference:
      // eslint-disable-next-line no-use-before-define
      const external = makeIdentifiedInspector(
        `pet-store-id512:${formulaNumber}`,
      );
      return { external, internal: undefined };
    } else if (prefix === 'pet-store-id512') {
      const external = petStorePowers.makeIdentifiedPetStore(
        formulaNumber,
        assertPetName,
      );
      return { external, internal: undefined };
    } else if (prefix === 'directory-id512') {
      const petStoreFormulaIdentifier = `pet-store-id512:${formulaNumber}`;
      // Behold, forward-reference:
      // eslint-disable-next-line no-use-before-define
      return makeIdentifiedDirectory({
        petStoreFormulaIdentifier,
        terminator,
      });
    } else if (prefix === 'host-id512') {
      const storeFormulaIdentifier = `pet-store-id512:${formulaNumber}`;
      const infoFormulaIdentifier = `pet-inspector-id512:${formulaNumber}`;
      const workerFormulaIdentifier = `worker-id512:${formulaNumber}`;
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return makeIdentifiedHost(
        formulaIdentifier,
        storeFormulaIdentifier,
        infoFormulaIdentifier,
        workerFormulaIdentifier,
        terminator,
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
      return makeControllerForFormula(
        formulaIdentifier,
        formulaNumber,
        formula,
        terminator,
      );
    } else {
      throw new TypeError(
        `Invalid formula identifier, unrecognized type ${q(formulaIdentifier)}`,
      );
    }
  };

  // The two functions provideValueForFormula and provideValueForFormulaIdentifier
  // share a responsibility for maintaining the memoization tables
  // controllerForFormulaIdentifier and formulaIdentifierForRef, since the
  // former bypasses the latter in order to avoid a round trip with disk.

  const provideValueForNumberedFormula = async (
    formulaType,
    formulaNumber,
    formula,
  ) => {
    const formulaIdentifier = `${formulaType}:${formulaNumber}`;

    // Memoize for lookup.
    console.log(`Making ${formulaIdentifier}`);
    const { promise: partial, resolve } =
      /** @type {import('@endo/promise-kit').PromiseKit<import('./types.js').InternalExternal<>>} */ (
        makePromiseKit()
      );

    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const terminator = makeTerminator(formulaIdentifier);
    partial.catch(error => terminator.terminate());
    const controller = harden({
      terminator,
      external: E.get(partial).external.then(value => {
        if (typeof value === 'object' && value !== null) {
          formulaIdentifierForRef.set(value, formulaIdentifier);
        }
        return value;
      }),
      internal: E.get(partial).internal,
    });
    controllerForFormulaIdentifier.set(formulaIdentifier, controller);

    await persistencePowers.writeFormula(formula, formulaType, formulaNumber);
    resolve(
      makeControllerForFormula(
        formulaIdentifier,
        formulaNumber,
        formula,
        terminator,
      ),
    );

    return harden({
      formulaIdentifier,
      value: controller.external,
    });
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
  const provideControllerForFormulaIdentifier = formulaIdentifier => {
    let controller = controllerForFormulaIdentifier.get(formulaIdentifier);
    if (controller !== undefined) {
      return controller;
    }

    console.log(`Making ${formulaIdentifier}`);
    const { promise: partial, resolve } =
      /** @type {import('@endo/promise-kit').PromiseKit<import('./types.js').InternalExternal<>>} */ (
        makePromiseKit()
      );

    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const terminator = makeTerminator(formulaIdentifier);
    partial.catch(error => terminator.terminate());
    controller = harden({
      terminator,
      external: E.get(partial).external,
      internal: E.get(partial).internal,
    });
    controllerForFormulaIdentifier.set(formulaIdentifier, controller);
    resolve(makeControllerForFormulaIdentifier(formulaIdentifier, terminator));

    return controller;
  };

  /**
   * @param {string} formulaIdentifier
   */
  const provideValueForFormulaIdentifier = async formulaIdentifier => {
    const controller = /** @type {import('./types.js').Controller<>} */ (
      provideControllerForFormulaIdentifier(formulaIdentifier)
    );
    const value = await controller.external;
    if (typeof value === 'object' && value !== null) {
      formulaIdentifierForRef.set(value, formulaIdentifier);
    }
    return value;
  };

  const makeTerminator = makeTerminatorMaker({
    controllerForFormulaIdentifier,
    provideControllerForFormulaIdentifier,
  });

  const { makeIdentifiedDirectory, makeNode } = makeDirectoryMaker({
    provideValueForFormulaIdentifier,
    provideControllerForFormulaIdentifier,
    randomHex512,
  });

  const makeMailbox = makeMailboxMaker({
    formulaIdentifierForRef,
    provideValueForFormulaIdentifier,
    provideControllerForFormulaIdentifier,
    makeNode,
  });

  const makeIdentifiedGuestController = makeGuestMaker({
    provideValueForFormulaIdentifier,
    provideControllerForFormulaIdentifier,
    makeMailbox,
  });

  const makeIdentifiedHost = makeHostMaker({
    provideValueForFormulaIdentifier,
    provideValueForFormula,
    provideValueForNumberedFormula,
    formulaIdentifierForRef,
    storeReaderRef,
    randomHex512,
    makeSha512,
    makeMailbox,
  });

  const makeIdentifiedInspector = async petStoreFormulaIdentifier => {
    const petStore = /** @type {import('./types.js').PetStore} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(petStoreFormulaIdentifier)
    );

    /**
     * @param {string} petName
     */
    const lookup = async petName => {
      const formulaIdentifier = petStore.lookup(petName);
      if (formulaIdentifier === undefined) {
        throw new Error(`Unknown pet name ${petName}`);
      }
      const delimiterIndex = formulaIdentifier.indexOf(':');
      // eslint-disable-next-line @endo/restrict-comparison-operands
      if (delimiterIndex < 0) {
        return undefined;
      }
      const prefix = formulaIdentifier.slice(0, delimiterIndex);
      const formulaNumber = formulaIdentifier.slice(delimiterIndex + 1);
      if (
        ![
          'eval-id512',
          'import-unsafe-id512',
          'import-bundle-id512',
          'guest-id512',
          'web-bundle',
        ].includes(prefix)
      ) {
        return makeInfo(prefix, formulaNumber, harden({}));
      }
      const formula = await persistencePowers.readFormula(
        prefix,
        formulaNumber,
      );
      if (formula.type === 'eval') {
        return makeInfo(
          formula.type,
          formulaNumber,
          harden({
            SOURCE: formula.source,
            WORKER: provideValueForFormulaIdentifier(formula.worker),
            ENDOWMENTS: Object.fromEntries(
              formula.names.map((name, index) => {
                return [
                  name,
                  provideValueForFormulaIdentifier(formula.values[index]),
                ];
              }),
            ),
          }),
        );
      } else if (formula.type === 'import-unsafe') {
        return makeInfo(
          formula.type,
          formulaNumber,
          harden({
            SPECIFIER: formula.specifier,
            WORKER: provideValueForFormulaIdentifier(formula.worker),
            POWERS: provideValueForFormulaIdentifier(formula.powers),
          }),
        );
      } else if (formula.type === 'import-bundle') {
        return makeInfo(
          formula.type,
          formulaNumber,
          harden({
            WORKER: provideValueForFormulaIdentifier(formula.worker),
            BUNDLE: provideValueForFormulaIdentifier(formula.bundle),
            POWERS: provideValueForFormulaIdentifier(formula.powers),
          }),
        );
      } else if (formula.type === 'guest') {
        return makeInfo(
          formula.type,
          formulaNumber,
          harden({
            HOST: provideValueForFormulaIdentifier(formula.host),
          }),
        );
      } else if (formula.type === 'web-bundle') {
        return makeInfo(
          formula.type,
          formulaNumber,
          harden({
            BUNDLE: provideValueForFormulaIdentifier(formula.bundle),
            POWERS: provideValueForFormulaIdentifier(formula.powers),
          }),
        );
      }
      // @ts-expect-error this should never occur
      return makeInfo(formula.type, formulaNumber, harden({}));
    };

    const list = () => petStore.list();

    const info = Far('Endo info facet', {
      lookup,
      list,
    });

    return info;
  };

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
