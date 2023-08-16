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
import { makeChangeTopic } from './pubsub.js';
import {
  makeMessageCapTP,
  makeNetstringCapTP,
  messageToBytes,
  bytesToMessage,
} from './connection.js';
import { makeRefReader } from './ref-reader.js';
import { makeReaderRef, makeIteratorRef } from './reader-ref.js';
import { makeOwnPetStore, makeIdentifiedPetStore } from './pet-store.js';

const { quote: q } = assert;

const validNamePattern = /^[a-z][a-z0-9-]{0,127}$/;
const zero512 =
  '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

/**
 * @param {string} petName
 */
const assertPetName = petName => {
  if (typeof petName !== 'string' || !validNamePattern.test(petName)) {
    throw new Error(`Invalid pet name ${q(petName)}`);
  }
};

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
   * @param {string} guestFormulaIdentifier
   * @param {string} hostFormulaIdentifier
   * @param {string} petStoreFormulaIdentifier
   */
  const makeIdentifiedGuest = async (
    guestFormulaIdentifier,
    hostFormulaIdentifier,
    petStoreFormulaIdentifier,
  ) => {
    /** @type {Map<string, Promise<unknown>>} */
    const responses = new Map();

    const guestPetStore = /** @type {import('./types.js').PetStore} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(petStoreFormulaIdentifier)
    );
    const host = /** @type {object} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(hostFormulaIdentifier)
    );

    const hostRequest = partyRequestFunctions.get(host);
    if (hostRequest === undefined) {
      throw new Error(
        `panic: a host request function must exist for every host`,
      );
    }

    /**
     * @param {string} petName
     */
    const provide = async petName => {
      assertPetName(petName);
      const formulaIdentifier = guestPetStore.get(petName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name: ${q(petName)}`);
      }
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return provideValueForFormulaIdentifier(formulaIdentifier);
    };

    /**
     * @param {string} fromName
     * @param {string} toName
     */
    const rename = async (fromName, toName) => {
      assertPetName(fromName);
      assertPetName(toName);
      await guestPetStore.rename(fromName, toName);
      const formulaIdentifier = responses.get(fromName);
      if (formulaIdentifier === undefined) {
        throw new Error(
          `panic: the pet store rename must ensure that the renamed identifier exists`,
        );
      }
      responses.set(toName, formulaIdentifier);
      responses.delete(fromName);
    };

    /**
     * @param {string} petName
     */
    const remove = async petName => {
      await guestPetStore.remove(petName);
      responses.delete(petName);
    };

    const { list } = guestPetStore;

    const request = async (what, responseName) => {
      if (responseName === undefined) {
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        return hostRequest(
          what,
          responseName,
          guestFormulaIdentifier,
          guestPetStore,
        );
      }
      const responseP = responses.get(responseName);
      if (responseP !== undefined) {
        return responseP;
      }
      // Behold, recursion:
      // eslint-disable-next-line
      const newResponseP = hostRequest(
        what,
        responseName,
        guestFormulaIdentifier,
        guestPetStore,
      );
      responses.set(responseName, newResponseP);
      return newResponseP;
    };

    /**
     * @param {Array<string>} strings
     * @param {Array<string>} edgeNames
     * @param {Array<string>} petNames
     */
    const receive = async (strings, edgeNames, petNames) => {
      petNames.forEach(assertPetName);
      edgeNames.forEach(assertPetName);
      if (petNames.length !== edgeNames.length) {
        throw new Error(
          `Message must have one edge name (${q(
            edgeNames.length,
          )}) for every pet name (${q(petNames.length)})`,
        );
      }
      if (strings.length < petNames.length) {
        throw new Error(
          `Message must have one string before every value delivered`,
        );
      }

      const partyReceive = partyReceiveFunctions.get(host);
      if (partyReceive === undefined) {
        throw new Error(`panic: Message not deliverable`);
      }
      const formulaIdentifiers = petNames.map(petName => {
        const formulaIdentifier = guestPetStore.get(petName);
        if (formulaIdentifier === undefined) {
          throw new Error(`Unknown pet name ${q(petName)}`);
        }
        return formulaIdentifier;
      });
      partyReceive(
        guestFormulaIdentifier,
        strings,
        edgeNames,
        formulaIdentifiers,
      );
    };

    /** @type {import('@endo/eventual-send').ERef<import('./types.js').EndoGuest>} */
    const guest = Far('EndoGuest', {
      request,
      receive,
      list,
      remove,
      rename,
      provide,
    });

    return guest;
  };

  /**
   * @param {string} hostFormulaIdentifier
   * @param {string} storeFormulaIdentifier
   */
  const makeIdentifiedHost = async (
    hostFormulaIdentifier,
    storeFormulaIdentifier,
  ) => {
    const petStore = /** @type {import('./types.js').PetStore} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(storeFormulaIdentifier)
    );

    /** @type {Map<number, import('./types.js').InternalMessage>} */
    const messages = new Map();
    /** @type {WeakMap<object, (value: unknown) => void>} */
    const resolvers = new WeakMap();
    /** @type {WeakMap<object, () => void>} */
    const dismissers = new WeakMap();
    /** @type {import('./types.js').Topic<import('./types.js').InternalMessage>} */
    const messagesTopic = makeChangeTopic();
    let nextMessageNumber = 0;

    /**
     * @param {import('./types.js').InternalMessage} message
     * @returns {import('./types.js').Message}
     */
    const dubMessage = message => {
      if (message.type === 'request') {
        const { who: senderFormula, ...rest } = message;
        const [senderName] = petStore.lookup(senderFormula);
        if (senderName !== undefined) {
          return { who: senderName, ...rest };
        }
      } else if (message.type === 'package') {
        const { formulas: _, who: senderFormula, ...rest } = message;
        const [senderName] = petStore.lookup(senderFormula);
        if (senderName !== undefined) {
          return { who: senderName, ...rest };
        }
      }
      throw new Error(`panic: Unknown message type ${message.type}`);
    };

    const listMessages = async () =>
      harden(Array.from(messages.values(), dubMessage));

    const followMessages = async () =>
      makeIteratorRef(
        (async function* currentAndSubsequentMessages() {
          const subsequentRequests = messagesTopic.subscribe();
          for (const message of messages.values()) {
            yield dubMessage(message);
          }
          for await (const message of subsequentRequests) {
            yield dubMessage(message);
          }
        })(),
      );

    /**
     * @param {string} what - user visible description of the desired value
     * @param {string} guestFormulaIdentifier
     */
    const requestFormulaIdentifier = async (what, guestFormulaIdentifier) => {
      /** @type {import('@endo/promise-kit/src/types.js').PromiseKit<string>} */
      const { promise, resolve } = makePromiseKit();
      const messageNumber = nextMessageNumber;
      nextMessageNumber += 1;
      const settle = () => {
        messages.delete(messageNumber);
      };
      const settled = promise.then(
        () => {
          settle();
          return /** @type {'fulfilled'} */ ('fulfilled');
        },
        () => {
          settle();
          return /** @type {'rejected'} */ ('rejected');
        },
      );

      const req = harden({
        type: /** @type {'request'} */ ('request'),
        number: messageNumber,
        who: guestFormulaIdentifier,
        what,
        when: new Date().toISOString(),
        settled,
      });

      messages.set(messageNumber, req);
      resolvers.set(req, resolve);
      messagesTopic.publisher.next(req);
      return promise;
    };

    /**
     * @param {string} what
     * @param {string} responseName
     * @param {string} guestFormulaIdentifier
     * @param {import('./types.js').PetStore} guestPetStore
     */
    const request = async (
      what,
      responseName,
      guestFormulaIdentifier,
      guestPetStore,
    ) => {
      if (responseName !== undefined) {
        /** @type {string | undefined} */
        let formulaIdentifier = guestPetStore.get(responseName);
        if (formulaIdentifier === undefined) {
          formulaIdentifier = await requestFormulaIdentifier(
            what,
            guestFormulaIdentifier,
          );
          await guestPetStore.write(responseName, formulaIdentifier);
        }
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        return provideValueForFormulaIdentifier(formulaIdentifier);
      }
      // The reference is not named nor to be named.
      const formulaIdentifier = await requestFormulaIdentifier(
        what,
        guestFormulaIdentifier,
      );
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return provideValueForFormulaIdentifier(formulaIdentifier);
    };

    const resolve = async (messageNumber, resolutionName) => {
      assertPetName(resolutionName);
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid request number ${q(messageNumber)}`);
      }
      const req = messages.get(messageNumber);
      const resolveRequest = resolvers.get(req);
      if (resolveRequest === undefined) {
        throw new Error(`No pending request for number ${messageNumber}`);
      }
      const formulaIdentifier = petStore.get(resolutionName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(
          `No formula exists for the pet name ${q(resolutionName)}`,
        );
      }
      resolveRequest(formulaIdentifier);
    };

    /**
     * @param {string} senderFormulaIdentifier
     * @param {Array<string>} strings
     * @param {Array<string>} edgeNames
     * @param {Array<string>} formulaIdentifiers
     */
    const receive = (
      senderFormulaIdentifier,
      strings,
      edgeNames,
      formulaIdentifiers,
    ) => {
      /** @type {import('@endo/promise-kit/src/types.js').PromiseKit<void>} */
      const dismissal = makePromiseKit();
      const messageNumber = nextMessageNumber;
      nextMessageNumber += 1;

      const message = harden({
        type: /** @type {const} */ ('package'),
        number: messageNumber,
        strings,
        names: edgeNames,
        formulas: formulaIdentifiers, // TODO should not be visible to recipient
        who: senderFormulaIdentifier,
        when: new Date().toISOString(),
        dismissed: dismissal.promise,
      });

      messages.set(messageNumber, message);
      dismissers.set(message, () => {
        messages.delete(messageNumber);
        dismissal.resolve();
      });
      messagesTopic.publisher.next(message);
    };

    const dismiss = async messageNumber => {
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid request number ${q(messageNumber)}`);
      }
      const message = messages.get(messageNumber);
      const dismissMessage = dismissers.get(message);
      if (dismissMessage === undefined) {
        throw new Error(`No dismissable message for number ${messageNumber}`);
      }
      dismissMessage();
    };

    const adopt = async (messageNumber, edgeName, petName) => {
      assertPetName(edgeName);
      assertPetName(petName);
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid message number ${q(messageNumber)}`);
      }
      const message = messages.get(messageNumber);
      if (message === undefined) {
        throw new Error(`No such message with number ${q(messageNumber)}`);
      }
      if (message.type !== 'package') {
        throw new Error(`Message must be a package ${q(messageNumber)}`);
      }
      const index = message.names.lastIndexOf(edgeName);
      if (index === -1) {
        throw new Error(
          `No reference named ${q(edgeName)} in message ${q(messageNumber)}`,
        );
      }
      const formulaIdentifier = message.formulas[index];
      if (formulaIdentifier === undefined) {
        throw new Error(
          `panic: message must contain a formula for every name, including the name ${q(
            edgeName,
          )} at ${q(index)}`,
        );
      }
      await petStore.write(petName, formulaIdentifier);
    };

    // TODO test reject
    /**
     * @param {number} messageNumber
     * @param {string} [message]
     */
    const reject = async (messageNumber, message = 'Declined') => {
      const req = messages.get(messageNumber);
      if (req !== undefined) {
        const resolveRequest = resolvers.get(req);
        if (resolveRequest === undefined) {
          throw new Error(`panic: a resolver must exist for every request`);
        }
        resolveRequest(harden(Promise.reject(harden(new Error(message)))));
      }
    };

    /**
     * @param {string} petName
     */
    const provideGuest = async petName => {
      /** @type {string | undefined} */
      let formulaIdentifier;
      if (petName !== undefined) {
        formulaIdentifier = petStore.get(petName);
      }
      if (formulaIdentifier === undefined) {
        const id512 = await powers.randomHex512();
        const guestStoreFormulaIdentifier = `pet-store-id512:${id512}`;
        /** @type {import('./types.js').GuestFormula} */
        const formula = {
          type: /* @type {'guest'} */ 'guest',
          host: hostFormulaIdentifier,
          store: guestStoreFormulaIdentifier,
        };
        const { value, formulaIdentifier: guestFormulaIdentifier } =
          // Behold, recursion:
          // eslint-disable-next-line no-use-before-define
          await provideValueForFormula(formula, 'guest-id512');
        if (petName !== undefined) {
          await petStore.write(petName, guestFormulaIdentifier);
        }
        return value;
      } else if (!formulaIdentifier.startsWith('guest-id512:')) {
        throw new Error(
          `Existing pet name does not designate a guest powers capability: ${q(
            petName,
          )}`,
        );
      }
      return /** @type {Promise<import('./types.js').EndoHost>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(formulaIdentifier)
      );
    };

    /**
     * @param {import('@endo/eventual-send').ERef<AsyncIterableIterator<string>>} readerRef
     * @param {string} [petName]
     */
    const store = async (readerRef, petName) => {
      if (petName !== undefined) {
        assertPetName(petName);
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

    /**
     * @param {string} workerName
     */
    const provideWorker = async workerName => {
      if (typeof workerName !== 'string') {
        throw new Error('worker name must be string');
      }
      let workerFormulaIdentifier = petStore.get(workerName);
      if (workerFormulaIdentifier === undefined) {
        const workerId512 = await powers.randomHex512();
        workerFormulaIdentifier = `worker-id512:${workerId512}`;
        await petStore.write(workerName, workerFormulaIdentifier);
      } else if (!workerFormulaIdentifier.startsWith('worker-id512:')) {
        throw new Error(`Not a worker ${q(workerName)}`);
      }
      return /** @type {Promise<import('./types.js').EndoWorker>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(workerFormulaIdentifier)
      );
    };

    const lookup = async presence => {
      const formulaIdentifier = formulaIdentifierForRef.get(await presence);
      if (formulaIdentifier === undefined) {
        return [];
      }
      return E(petStore).lookup(formulaIdentifier);
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     */
    const provideWorkerFormulaIdentifier = async workerName => {
      if (workerName === 'MAIN') {
        return `worker-id512:${zero512}`;
      } else if (workerName === 'NEW') {
        const workerId512 = await powers.randomHex512();
        return `worker-id512:${workerId512}`;
      }
      assertPetName(workerName);
      let workerFormulaIdentifier = petStore.get(workerName);
      if (workerFormulaIdentifier === undefined) {
        const workerId512 = await powers.randomHex512();
        workerFormulaIdentifier = `worker-id512:${workerId512}`;
        await petStore.write(workerName, workerFormulaIdentifier);
      }
      return workerFormulaIdentifier;
    };

    /**
     * @param {string | 'NONE' | 'HOST' | 'ENDO'} partyName
     */
    const providePowersFormulaIdentifier = async partyName => {
      if (partyName === 'NONE') {
        return 'least-authority';
      } else if (partyName === 'HOST') {
        return 'host';
      } else if (partyName === 'ENDO') {
        return 'endo';
      }
      assertPetName(partyName);
      let guestFormulaIdentifier = petStore.get(partyName);
      if (guestFormulaIdentifier === undefined) {
        const guest = await provideGuest(partyName);
        guestFormulaIdentifier = formulaIdentifierForRef.get(guest);
        if (guestFormulaIdentifier === undefined) {
          throw new Error(
            `panic: provideGuest must return an guest with a corresponding formula identifier`,
          );
        }
      }
      return guestFormulaIdentifier;
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
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

      if (resultName !== undefined) {
        assertPetName(resultName);
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
     * @param {string | 'NEW' | 'MAIN'} workerName
     * @param {string} importPath
     * @param {string | 'NONE' | 'HOST' | 'ENDO'} powersName
     * @param {string} resultName
     */
    const importUnsafeAndEndow = async (
      workerName,
      importPath,
      powersName,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      const formula = {
        /** @type {'import-unsafe'} */
        type: 'import-unsafe',
        worker: workerFormulaIdentifier,
        powers: powersFormulaIdentifier,
        importPath,
      };

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { formulaIdentifier, value } = await provideValueForFormula(
        formula,
        'import-unsafe-id512',
      );
      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }
      return value;
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     * @param {string} bundleName
     * @param {string | 'NONE' | 'HOST' | 'ENDO'} powersName
     * @param {string} resultName
     */
    const importBundleAndEndow = async (
      workerName,
      bundleName,
      powersName,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      const bundleFormulaIdentifier = petStore.get(bundleName);
      if (bundleFormulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name for bundle: ${bundleName}`);
      }

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      const formula = {
        /** @type {'import-bundle'} */
        type: 'import-bundle',
        worker: workerFormulaIdentifier,
        powers: powersFormulaIdentifier,
        bundle: bundleFormulaIdentifier,
      };

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value, formulaIdentifier } = await provideValueForFormula(
        formula,
        'import-bundle-id512',
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
    const provideHost = async petName => {
      /** @type {string | undefined} */
      let formulaIdentifier;
      if (petName !== undefined) {
        formulaIdentifier = petStore.get(petName);
      }
      if (formulaIdentifier === undefined) {
        const id512 = await powers.randomHex512();
        formulaIdentifier = `host-id512:${id512}`;
        if (petName !== undefined) {
          await petStore.write(petName, formulaIdentifier);
        }
      } else if (!formulaIdentifier.startsWith('host-id512:')) {
        throw new Error(
          `Existing pet name does not designate a host powers capability: ${q(
            petName,
          )}`,
        );
      }
      return /** @type {Promise<import('./types.js').EndoHost>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(formulaIdentifier)
      );
    };

    /**
     * @param {string} webPageName
     * @param {string} bundleName
     * @param {string | 'NONE' | 'HOST' | 'ENDO'} powersName
     */
    const provideWebPage = async (webPageName, bundleName, powersName) => {
      const bundleFormulaIdentifier = petStore.get(bundleName);
      if (bundleFormulaIdentifier === undefined) {
        throw new Error(`Unknown pet name: ${q(bundleName)}`);
      }

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      const digester = powers.makeSha512();
      digester.updateText(
        `${bundleFormulaIdentifier},${powersFormulaIdentifier}`,
      );
      const formulaNumber = digester.digestHex().slice(32, 64);

      const formula = {
        type: 'web-bundle',
        bundle: bundleFormulaIdentifier,
        powers: powersFormulaIdentifier,
      };

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value, formulaIdentifier } = await provideValueForNumberedFormula(
        'web-bundle',
        formulaNumber,
        formula,
      );

      if (webPageName !== undefined) {
        await petStore.write(webPageName, formulaIdentifier);
      }

      return value;
    };

    const { list, remove, rename } = petStore;

    /** @type {import('./types.js').EndoHost} */
    const host = Far('EndoHost', {
      listMessages,
      followMessages,
      provide,
      resolve,
      reject,
      adopt,
      dismiss,
      lookup,
      list,
      remove,
      rename,
      store,
      provideGuest,
      provideHost,
      makeWorker,
      provideWorker,
      evaluate,
      importUnsafeAndEndow,
      importBundleAndEndow,
      provideWebPage,
    });

    partyReceiveFunctions.set(host, receive);
    partyRequestFunctions.set(host, request);

    return host;
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
      return makeIdentifiedGuest(
        formulaIdentifier,
        formula.host,
        formula.store,
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
        return makeIdentifiedHost(formulaIdentifier, 'pet-store');
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
      return makeIdentifiedHost(
        formulaIdentifier,
        `pet-store-id512:${formulaNumber}`,
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
