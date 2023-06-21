// @ts-check
/// <reference types="ses"/>

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeChangeTopic } from './pubsub.js';
import { makeNetstringCapTP } from './connection.js';
import { makeRefReader } from './ref-reader.js';
import { makeReaderRef, makeIteratorRef } from './reader-ref.js';
import { makeOwnPetStore, makeIdentifiedPetStore } from './pet-store.js';

const { quote: q } = assert;

const validNamePattern = /^[a-zA-Z][a-zA-Z0-9]{0,127}$/;

/**
 * @param {import('./types.js').DaemonicPowers} powers
 * @param {import('./types.js').Locator} locator
 * @param {object} args
 * @param {Promise<never>} args.cancelled
 * @param {(error: Error) => void} args.cancel
 * @param {number} args.gracePeriodMs
 * @param {Promise<never>} args.gracePeriodElapsed
 */
const makeEndoBootstrap = (
  powers,
  locator,
  { cancelled, cancel, gracePeriodMs, gracePeriodElapsed },
) => {
  /** @type {Map<string, unknown>} */
  const valuePromiseForFormulaIdentifier = new Map();
  // Reverse look-up, for answering "what is my name for this near or far
  // reference", and not for "what is my name for this promise".
  /** @type {WeakMap<object, string>} */
  const formulaIdentifierForRef = new WeakMap();
  /** @type {WeakMap<import('./types.js').EndoInbox, import('./types.js').RequestFn>} */
  const inboxRequestFunctions = new WeakMap();

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
    return Far(`Readable file with SHA-512 ${sha512.slice(0, 8)}...`, {
      sha512: () => sha512,
      stream,
      text,
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
   * @param {string} outboxFormulaIdentifier
   * @param {string} importPath
   */
  const makeValueForImportUnsafe0 = async (
    workerFormulaIdentifier,
    outboxFormulaIdentifier,
    importPath,
  ) => {
    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const workerFacet = await provideValueForFormulaIdentifier(
      workerFormulaIdentifier,
    );
    const workerBootstrap = workerBootstraps.get(workerFacet);
    assert(workerBootstrap);
    const outboxP = /** @type {Promise<import('./types.js').EndoOutbox>} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      provideValueForFormulaIdentifier(outboxFormulaIdentifier)
    );
    return E(workerBootstrap).importUnsafe0(importPath, outboxP);
  };

  /**
   * @param {string} workerFormulaIdentifier
   * @param {string} outboxFormulaIdentifier
   * @param {string} bundleFormulaIdentifier
   */
  const makeValueForImportBundle0 = async (
    workerFormulaIdentifier,
    outboxFormulaIdentifier,
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
    const outboxP = /** @type {Promise<import('./types.js').EndoOutbox>} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      provideValueForFormulaIdentifier(outboxFormulaIdentifier)
    );
    return E(workerBootstrap).importBundle0(readableBundleP, outboxP);
  };

  /**
   * @param {string} outboxFormulaIdentifier
   * @param {string} inboxFormulaIdentifier
   * @param {string} petStoreFormulaIdentifier
   */
  const makeIdentifiedOutbox = async (
    outboxFormulaIdentifier,
    inboxFormulaIdentifier,
    petStoreFormulaIdentifier,
  ) => {
    /** @type {Map<string, Promise<unknown>>} */
    const responses = new Map();

    const outboxPetStore = /** @type {import('./types.js').PetStore} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(petStoreFormulaIdentifier)
    );
    const inbox = /** @type {object} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(inboxFormulaIdentifier)
    );

    const request = inboxRequestFunctions.get(inbox);
    if (request === undefined) {
      throw new Error(
        `Programmer invariant failed: an inbox request function must exist for every inbox`,
      );
    }

    /**
     * @param {string} petName
     */
    const provide = async petName => {
      const formulaIdentifier = outboxPetStore.get(petName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name: ${q(petName)}`);
      }
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return provideValueForFormulaIdentifier(formulaIdentifier);
    };

    const { list, remove, rename } = outboxPetStore;

    /** @type {import('@endo/eventual-send').ERef<import('./types.js').EndoOutbox>} */
    const outbox = Far('EndoOutbox', {
      request: async (what, responseName) => {
        if (responseName === undefined) {
          // Behold, recursion:
          // eslint-disable-next-line no-use-before-define
          return request(what, responseName, outbox, outboxPetStore);
        }
        const responseP = responses.get(responseName);
        if (responseP !== undefined) {
          return responseP;
        }
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        const newResponseP = request(
          what,
          responseName,
          outbox,
          outboxPetStore,
        );
        responses.set(responseName, newResponseP);
        return newResponseP;
      },
      list,
      remove,
      rename,
      provide,
    });

    return outbox;
  };

  /**
   * @param {string} inboxFormulaIdentifier
   * @param {string} storeFormulaIdentifier
   */
  const makeIdentifiedInbox = async (
    inboxFormulaIdentifier,
    storeFormulaIdentifier,
  ) => {
    const petStore = /** @type {import('./types.js').PetStore} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(storeFormulaIdentifier)
    );

    /** @type {Map<number, import('./types.js').Message>} */
    const requests = new Map();
    /** @type {WeakMap<object, (value: unknown) => void>} */
    const resolvers = new WeakMap();
    /** @type {import('./types.js').Topic<import('./types.js').Message>} */
    const requestsTopic = makeChangeTopic();
    let nextRequestNumber = 0;

    const listMessages = async () => harden(Array.from(requests.values()));

    const followMessages = async () =>
      makeIteratorRef(
        (async function* currentAndSubsequentMessages() {
          const subsequentRequests = requestsTopic.subscribe();
          yield* requests.values();
          yield* subsequentRequests;
        })(),
      );

    /**
     * @param {string} what - user visible description of the desired value
     * @param {unknown} whom - the requester
     */
    const requestFormulaIdentifier = async (what, whom) => {
      /** @type {import('@endo/promise-kit/src/types.js').PromiseKit<string>} */
      const { promise, resolve } = makePromiseKit();
      const requestNumber = nextRequestNumber;
      nextRequestNumber += 1;
      const settle = () => {
        requests.delete(requestNumber);
      };
      const settled = promise.then(settle, settle);

      // How does the receiver know the sender?
      const formulaIdentifier = formulaIdentifierForRef.get(whom);
      if (formulaIdentifier === undefined) {
        throw new Error(
          `Programmer invariant failed: requestFormulaIdentifier must be called with an Outbox (who) that was obtained through provideValueFor*`,
        );
      }
      const [who] = petStore.lookup(formulaIdentifier);
      // TODO consider having an invariant that a formula dictionary
      // can only have one name for each formula identifier,
      // so any attempt to copy a name is effectively enforced as a rename.

      const req = harden({
        type: /** @type {'request'} */ ('request'),
        number: requestNumber,
        who,
        what,
        when: new Date().toISOString(),
        settled,
      });

      requests.set(requestNumber, req);
      resolvers.set(req, resolve);
      requestsTopic.publisher.next(req);
      return promise;
    };

    /**
     * @param {string} what
     * @param {string} responseName
     * @param {import('./types.js').EndoOutbox} who
     * @param {import('./types.js').PetStore} outboxPetStore
     */
    const request = async (what, responseName, who, outboxPetStore) => {
      if (responseName !== undefined) {
        /** @type {string | undefined} */
        let formulaIdentifier = outboxPetStore.get(responseName);
        if (formulaIdentifier === undefined) {
          formulaIdentifier = await requestFormulaIdentifier(what, who);
          await outboxPetStore.write(responseName, formulaIdentifier);
        }
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        return provideValueForFormulaIdentifier(formulaIdentifier);
      }
      // The reference is not named nor to be named.
      const formulaIdentifier = await requestFormulaIdentifier(what, who);
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return provideValueForFormulaIdentifier(formulaIdentifier);
    };

    const resolve = async (requestNumber, resolutionName) => {
      if (!validNamePattern.test(resolutionName)) {
        throw new Error(`Invalid pet name ${q(resolutionName)}`);
      }
      if (
        typeof requestNumber !== 'number' ||
        requestNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid request number ${q(requestNumber)}`);
      }
      const req = requests.get(requestNumber);
      const resolveRequest = resolvers.get(req);
      if (resolveRequest === undefined) {
        throw new Error(`No pending request for number ${requestNumber}`);
      }
      const formulaIdentifier = petStore.get(resolutionName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(
          `No formula exists for the pet name ${q(resolutionName)}`,
        );
      }
      resolveRequest(formulaIdentifier);
    };

    // TODO test reject
    /**
     * @param {number} requestNumber
     * @param {string} [message]
     */
    const reject = async (requestNumber, message = 'Declined') => {
      const req = requests.get(requestNumber);
      if (req !== undefined) {
        const resolveRequest = resolvers.get(req);
        if (resolveRequest === undefined) {
          throw new Error(
            `Programmer invariant violated: a resolver must exist for every request`,
          );
        }
        resolveRequest(harden(Promise.reject(harden(new Error(message)))));
      }
    };

    /**
     * @param {string} petName
     */
    const makeOutbox = async petName => {
      const outboxStoreId512 = await powers.randomHex512();
      const outboxStoreFormulaIdentifier = `pet-store-id512:${outboxStoreId512}`;
      /** @type {import('./types.js').OutboxFormula} */
      const formula = {
        type: /* @type {'outbox'} */ 'outbox',
        inbox: inboxFormulaIdentifier,
        store: outboxStoreFormulaIdentifier,
      };
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value, formulaIdentifier } = await provideValueForFormula(
        formula,
        'outbox-id512',
      );
      if (petName !== undefined) {
        await petStore.write(petName, formulaIdentifier);
      }
      return /** @type {Promise<import('./types.js').EndoOutbox>} */ (value);
    };

    /**
     * @param {import('@endo/eventual-send').ERef<AsyncIterableIterator<string>>} readerRef
     * @param {string} [petName]
     */
    const store = async (readerRef, petName) => {
      if (petName !== undefined) {
        if (!validNamePattern.test(petName)) {
          throw new Error(`Invalid pet name ${q(petName)}`);
        }
      }

      const formulaIdentifier = await storeReaderRef(readerRef);

      if (petName !== undefined) {
        await petStore.write(petName, formulaIdentifier);
      }
    };

    /**
     * @param {string} petName
     */
    const provide = async petName => {
      const formulaIdentifier = petStore.get(petName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name: ${q(petName)}`);
      }
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return provideValueForFormulaIdentifier(formulaIdentifier);
    };

    const lookup = async presence => {
      const formulaIdentifier = formulaIdentifierForRef.get(await presence);
      if (formulaIdentifier === undefined) {
        return [];
      }
      return E(petStore).lookup(formulaIdentifier);
    };

    /**
     * @param {string | undefined} workerName
     */
    const provideWorkerFormulaIdentifier = async workerName => {
      /** @type {string | undefined} */
      let workerFormulaIdentifier;
      if (workerName === undefined) {
        const workerId512 = await powers.randomHex512();
        workerFormulaIdentifier = `worker-id512:${workerId512}`;
      } else {
        workerFormulaIdentifier = petStore.get(workerName);
        if (workerFormulaIdentifier === undefined) {
          throw new Error(`Unknown worker for pet name: ${q(workerName)}`);
        }
      }
      if (workerFormulaIdentifier === undefined) {
        throw new Error(
          `Programmer invariant failed: workerFormulaIdentifier must be defined`,
        );
      }
      return workerFormulaIdentifier;
    };

    /**
     * @param {string} outboxName
     */
    const provideOutboxFormulaIdentifier = async outboxName => {
      let outboxFormulaIdentifier = petStore.get(outboxName);
      if (outboxFormulaIdentifier === undefined) {
        const outbox = await makeOutbox(outboxName);
        outboxFormulaIdentifier = formulaIdentifierForRef.get(outbox);
        if (outboxFormulaIdentifier === undefined) {
          throw new Error(
            `Programmer invariant violated: makeOutbox must return an outbox with a corresponding formula identifier`,
          );
        }
      }
      return outboxFormulaIdentifier;
    };

    /**
     * @param {string | undefined} workerName
     * @param {string} source
     * @param {Array<string>} codeNames
     * @param {Array<string>} petNames
     * @param {string} resultName
     */
    const evaluate = async (
      workerName,
      source,
      codeNames,
      petNames,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      if (resultName !== undefined && !validNamePattern.test(resultName)) {
        throw new Error(`Invalid pet name ${q(resultName)}`);
      }
      if (petNames.length !== codeNames.length) {
        throw new Error('Evaluator requires one pet name for each code name');
      }

      const formulaIdentifiers = await Promise.all(
        petNames.map(async (petName, index) => {
          assertPetName(petName);
          if (typeof codeNames[index] !== 'string') {
            throw new Error(`Invalid endowment name: ${q(codeNames[index])}`);
          }
          const formulaIdentifier = petStore.get(petName);
          if (formulaIdentifier === undefined) {
            throw new Error(`Unknown pet name ${q(petName)}`);
          }
          return formulaIdentifier;
        }),
      );

      const formula = {
        /** @type {'eval'} */
        type: 'eval',
        worker: workerFormulaIdentifier,
        source,
        names: codeNames,
        values: formulaIdentifiers,
      };

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { formulaIdentifier, value } = await provideValueForFormula(
        formula,
        'eval-id512',
      );
      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }
      return value;
    };

    /**
     * @param {string | undefined} workerName
     * @param {string} importPath
     * @param {string} outboxName
     * @param {string} resultName
     */
    const importUnsafe0 = async (
      workerName,
      importPath,
      outboxName,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      const outboxFormulaIdentifier = await provideOutboxFormulaIdentifier(
        outboxName,
      );

      const formula = {
        /** @type {'import-unsafe0'} */
        type: 'import-unsafe0',
        worker: workerFormulaIdentifier,
        outbox: outboxFormulaIdentifier,
        importPath,
      };

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { formulaIdentifier, value } = await provideValueForFormula(
        formula,
        'import-unsafe0-id512',
      );
      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }
      return value;
    };

    /**
     * @param {string} workerName
     * @param {string} bundleName
     * @param {string} outboxName
     * @param {string} resultName
     */
    const importBundle0 = async (
      workerName,
      bundleName,
      outboxName,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      const bundleFormulaIdentifier = petStore.get(bundleName);
      if (bundleFormulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name for bundle: ${bundleName}`);
      }

      const outboxFormulaIdentifier = await provideOutboxFormulaIdentifier(
        outboxName,
      );

      const formula = {
        /** @type {'import-bundle0'} */
        type: 'import-bundle0',
        worker: workerFormulaIdentifier,
        outbox: outboxFormulaIdentifier,
        bundle: bundleFormulaIdentifier,
      };

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value, formulaIdentifier } = await provideValueForFormula(
        formula,
        'import-bundle0-id512',
      );

      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }

      return value;
    };

    /**
     * @param {string} [petName]
     */
    const makeWorker = async petName => {
      const workerId512 = await powers.randomHex512();
      const formulaIdentifier = `worker-id512:${workerId512}`;
      if (petName !== undefined) {
        await petStore.write(petName, formulaIdentifier);
      }
      return /** @type {Promise<import('./types.js').EndoWorker>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(formulaIdentifier)
      );
    };

    /**
     * @param {string} [petName]
     */
    const makeInbox = async petName => {
      const inboxId512 = await powers.randomHex512();
      const formulaIdentifier = `inbox-id512:${inboxId512}`;
      if (petName !== undefined) {
        await petStore.write(petName, formulaIdentifier);
      }
      return /** @type {Promise<import('./types.js').EndoInbox>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(formulaIdentifier)
      );
    };

    const { list, remove, rename } = petStore;

    /** @type {import('./types.js').EndoInbox} */
    const inbox = Far('EndoInbox', {
      listMessages,
      followMessages,
      provide,
      resolve,
      reject,
      lookup,
      list,
      remove,
      rename,
      store,
      makeOutbox,
      makeInbox,
      makeWorker,
      evaluate,
      importUnsafe0,
      importBundle0,
    });

    inboxRequestFunctions.set(inbox, request);

    return inbox;
  };

  /**
   * @param {string} formulaIdentifier
   * @param {import('./types.js').Formula} formula
   */
  const makeValueForFormula = async (formulaIdentifier, formula) => {
    if (formula.type === 'eval') {
      return makeValueForEval(
        formula.worker,
        formula.source,
        formula.names,
        formula.values,
      );
    } else if (formula.type === 'import-unsafe0') {
      return makeValueForImportUnsafe0(
        formula.worker,
        formula.outbox,
        formula.importPath,
      );
    } else if (formula.type === 'import-bundle0') {
      return makeValueForImportBundle0(
        formula.worker,
        formula.outbox,
        formula.bundle,
      );
    } else if (formula.type === 'outbox') {
      return makeIdentifiedOutbox(
        formulaIdentifier,
        formula.inbox,
        formula.store,
      );
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
    await powers.makePath(directory);
    await powers.writeFileText(file, `${q(formula)}\n`);
  };

  /**
   * @param {string} formulaIdentifier
   * @param {string} formulaPath
   */
  const makeValueForFormulaAtPath = async (formulaIdentifier, formulaPath) => {
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
    return makeValueForFormula(formulaIdentifier, formula);
  };

  /**
   * @param {string} formulaIdentifier
   */
  const makeValueForFormulaIdentifier = async formulaIdentifier => {
    if (formulaIdentifier === 'pet-store') {
      return makeOwnPetStore(powers, locator);
    } else if (formulaIdentifier === 'inbox') {
      return makeIdentifiedInbox(formulaIdentifier, 'pet-store');
    }
    const delimiterIndex = formulaIdentifier.indexOf(':');
    if (delimiterIndex < 0) {
      throw new TypeError(
        `Formula identifier must have a colon: ${q(formulaIdentifier)}`,
      );
    }
    const prefix = formulaIdentifier.slice(0, delimiterIndex);
    const suffix = formulaIdentifier.slice(delimiterIndex + 1);
    if (prefix === 'readable-blob-sha512') {
      return makeSha512ReadableBlob(suffix);
    } else if (prefix === 'worker-id512') {
      return makeIdentifiedWorker(suffix);
    } else if (prefix === 'pet-store-id512') {
      return makeIdentifiedPetStore(powers, locator, suffix);
    } else if (prefix === 'inbox-id512') {
      return makeIdentifiedInbox(
        formulaIdentifier,
        `pet-store-id512:${suffix}`,
      );
    } else if (
      [
        'eval-id512',
        'import-unsafe0-id512',
        'import-bundle0-id512',
        'outbox-id512',
      ].includes(prefix)
    ) {
      const { file: path } = makeFormulaPath(prefix, suffix);
      return makeValueForFormulaAtPath(formulaIdentifier, path);
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

  /**
   * @param {import('./types.js').Formula} formula
   * @param {string} formulaType
   */
  const provideValueForFormula = async (formula, formulaType) => {
    const formulaId512 = await powers.randomHex512();
    const formulaIdentifier = `${formulaType}:${formulaId512}`;
    await writeFormula(formula, formulaType, formulaId512);
    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const promiseForValue = makeValueForFormula(formulaIdentifier, formula);

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

  const endoBootstrap = Far('Endo private facet', {
    // TODO for user named

    ping: async () => 'pong',

    terminate: async () => {
      cancel(new Error('Termination requested'));
    },

    inbox: () => provideValueForFormulaIdentifier('inbox'),
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

  const endoBootstrap = makeEndoBootstrap(powers, locator, {
    cancelled,
    cancel,
    gracePeriodMs,
    gracePeriodElapsed,
  });

  const statePathP = powers.makePath(locator.statePath);
  const ephemeralStatePathP = powers.makePath(locator.ephemeralStatePath);
  const cachePathP = powers.makePath(locator.cachePath);
  await Promise.all([statePathP, cachePathP, ephemeralStatePathP]);

  const pidPath = powers.joinPath(locator.ephemeralStatePath, 'endo.pid');
  await powers.writeFileText(pidPath, `${pid}\n`);

  const connections = await powers.listenOnPath(locator.sockPath, cancelled);
  // Resolve a promise in the Endo CLI through the IPC channel:
  powers.informParentWhenListeningOnPath(locator.sockPath);
  console.log(
    `Endo daemon listening on ${q(
      locator.sockPath,
    )} ${new Date().toISOString()}`,
  );
  let nextConnectionNumber = 0;
  /** @type {Set<Promise<void>>} */
  const connectionClosedPromises = new Set();
  try {
    for await (const {
      reader,
      writer,
      closed: connectionClosed,
    } of connections) {
      const connectionNumber = nextConnectionNumber;
      nextConnectionNumber += 1;
      console.log(
        `Endo daemon received connection ${connectionNumber} at ${new Date().toISOString()}`,
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
          `Endo daemon closed connection ${connectionNumber} at ${new Date().toISOString()}`,
        );
      });
    }
  } catch (error) {
    cancel(error);
    cancelGracePeriod(error);
  } finally {
    await Promise.all(Array.from(connectionClosedPromises));
    cancel(new Error('Terminated normally'));
    cancelGracePeriod(new Error('Terminated normally'));
  }
};
