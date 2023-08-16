import { makePromiseKit } from '@endo/promise-kit';
import { E, Far } from '@endo/far';
import { makeIteratorRef } from './reader-ref.js';
import { makeChangeTopic } from './pubsub.js';
import { assertPetName } from './pet-name.js';

const { quote: q } = assert;

const zero512 =
  '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

export const makeHostMaker = ({
  provideValueForFormulaIdentifier,
  provideValueForFormula,
  provideValueForNumberedFormula,
  partyReceiveFunctions,
  partyRequestFunctions,
  formulaIdentifierForRef,
  storeReaderRef,
  makeSha512,
  randomHex512,
}) => {
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
        const id512 = await randomHex512();
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
        const workerId512 = await randomHex512();
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
        const workerId512 = await randomHex512();
        return `worker-id512:${workerId512}`;
      }
      assertPetName(workerName);
      let workerFormulaIdentifier = petStore.get(workerName);
      if (workerFormulaIdentifier === undefined) {
        const workerId512 = await randomHex512();
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
      const workerId512 = await randomHex512();
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
        const id512 = await randomHex512();
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

      const digester = makeSha512();
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

  return makeIdentifiedHost;
};
