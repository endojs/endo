// @ts-check
/// <reference types="ses"/>

/* global setTimeout, clearTimeout */

import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { q } from '@endo/errors';
import { makeRefReader } from './ref-reader.js';
import { makeDirectoryMaker } from './directory.js';
import { makeMailboxMaker } from './mail.js';
import { makeGuestMaker } from './guest.js';
import { makeHostMaker } from './host.js';
import { assertPetName } from './pet-name.js';
import { makeContextMaker } from './context.js';
import { parseId, formatId } from './formula-identifier.js';
import { makeSerialJobs } from './serial-jobs.js';
import { makeWeakMultimap } from './weak-multimap.js';
import { makeLoopbackNetwork } from './networks/loopback.js';

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
 * Creates an inspector object for a formula.
 *
 * @param {string} type - The formula type.
 * @param {string} number - The formula number.
 * @param {Record<string, unknown>} record - A mapping from special names to formula values.
 * @returns {import('./types.js').EndoInspector} The inspector for the given formula.
 */
const makeInspector = (type, number, record) =>
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
 * @param {import('./types.js').Context} context - The context to make far.
 * @returns {import('./types.js').FarContext} The far context.
 */
const makeFarContext = context =>
  Far('Context', {
    cancel: context.cancel,
    whenCancelled: () => context.cancelled,
    whenDisposed: () => context.disposed,
    addDisposalHook: context.onCancel,
  });

/**
 *
 * @param {string} path
 * @param {string} rootNonce
 * @param {import('./types.js').Sha512} digester
 * @returns {string}
 */
const deriveId = (path, rootNonce, digester) => {
  digester.updateText(rootNonce);
  digester.updateText(path);
  const nonce = digester.digestHex();
  return nonce;
};

/**
 * @param {import('./types.js').DaemonicPowers} powers
 * @param {Promise<number>} webletPortP
 * @param {string} rootEntropy
 * @param {object} args
 * @param {(error: Error) => void} args.cancel
 * @param {number} args.gracePeriodMs
 * @param {Promise<never>} args.gracePeriodElapsed
 */
const makeDaemonCore = async (
  powers,
  webletPortP,
  rootEntropy,
  { cancel, gracePeriodMs, gracePeriodElapsed },
) => {
  const {
    crypto: cryptoPowers,
    petStore: petStorePowers,
    persistence: persistencePowers,
    control: controlPowers,
  } = powers;
  const { randomHex512 } = cryptoPowers;
  const contentStore = persistencePowers.makeContentSha512Store();
  /**
   * Mutations of the formula graph must be serialized through this queue.
   * "Mutations" include:
   * - Creation
   * - Removal
   * - Incarnation
   * - Cancellation
   */
  const formulaGraphJobs = makeSerialJobs();
  // This is the id of the node that is hosting the values.
  // This will likely get replaced with a public key in the future.
  const ownNodeIdentifier = deriveId(
    'node-id',
    rootEntropy,
    cryptoPowers.makeSha512(),
  );
  const peersFormulaNumber = deriveId(
    'peers',
    rootEntropy,
    cryptoPowers.makeSha512(),
  );
  const peersFormulaIdentifier = formatId({
    number: peersFormulaNumber,
    node: ownNodeIdentifier,
  });

  /**
   * The two functions "provideValueForNumberedFormula" and "provideValueForFormulaIdentifier"
   * share a responsibility for maintaining the memoization tables
   * "controllerForFormulaIdentifier" and "formulaIdentifierForRef".
   * "provideValueForNumberedFormula" is used for incarnating and persisting
   * new formulas, whereas "provideValueForFormulaIdentifier" is used for
   * reincarnating stored formulas.
   */

  /**
   * Reverse look-up, for answering "what is my name for this near or far
   * reference", and not for "what is my name for this promise".
   * @type {Map<string, import('./types.js').Controller>}
   */
  const controllerForFormulaIdentifier = new Map();

  /**
   * Reverse look-up, for answering "what is my name for this near or far
   * reference", and not for "what is my name for this promise".
   * @type {import('./types.js').WeakMultimap<Record<string | symbol, unknown>, string>}
   */
  const formulaIdentifierForRef = makeWeakMultimap();

  /** @type {import('./types.js').WeakMultimap<Record<string | symbol, unknown>, string>['get']} */
  const getFormulaIdentifierForRef = ref => formulaIdentifierForRef.get(ref);

  /**
   * @param {string} sha512
   * @returns {import('./types.js').FarEndoReadable}
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

  /** @type {import('./types.js').DaemonCore['storeReaderRef']} */
  const storeReaderRef = async readerRef => {
    const sha512Hex = await contentStore.store(makeRefReader(readerRef));
    // eslint-disable-next-line no-use-before-define
    const { formulaIdentifier } = await incarnateReadableBlob(sha512Hex);
    return formulaIdentifier;
  };

  /**
   * @param {string} workerId512
   */
  const makeWorkerBootstrap = async workerId512 => {
    // TODO validate workerId512
    return Far(`Endo for worker ${workerId512}`, {});
  };

  /**
   * @param {string} workerId512
   * @param {import('./types.js').Context} context
   */
  const makeIdentifiedWorkerController = async (workerId512, context) => {
    // TODO validate workerId512
    const daemonWorkerFacet = makeWorkerBootstrap(workerId512);

    const { promise: forceCancelled, reject: forceCancel } =
      /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
        makePromiseKit()
      );

    const { workerTerminated, workerDaemonFacet } =
      await controlPowers.makeWorker(
        workerId512,
        daemonWorkerFacet,
        Promise.race([forceCancelled, gracePeriodElapsed]),
      );

    const gracefulCancel = async () => {
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
        .catch(forceCancel);
      await workerTerminated;
    };

    context.onCancel(gracefulCancel);

    const worker = Far('EndoWorker', {});

    return {
      external: worker,
      internal: workerDaemonFacet,
    };
  };

  /**
   * @param {string} workerFormulaIdentifier
   * @param {string} source
   * @param {Array<string>} codeNames
   * @param {Array<string>} formulaIdentifiers
   * @param {import('./types.js').Context} context
   */
  const makeControllerForEval = async (
    workerFormulaIdentifier,
    source,
    codeNames,
    formulaIdentifiers,
    context,
  ) => {
    context.thisDiesIfThatDies(workerFormulaIdentifier);
    for (const formulaIdentifier of formulaIdentifiers) {
      context.thisDiesIfThatDies(formulaIdentifier);
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
      context.cancelled,
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
   * Creates a controller for a `lookup` formula. The external facet is the
   * resolved value of the lookup.
   *
   * @param {string} hubFormulaIdentifier
   * @param {string[]} path
   * @param {import('./types.js').Context} context
   */
  const makeControllerForLookup = async (
    hubFormulaIdentifier,
    path,
    context,
  ) => {
    context.thisDiesIfThatDies(hubFormulaIdentifier);

    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const hub = provideValueForFormulaIdentifier(hubFormulaIdentifier);
    // @ts-expect-error calling lookup on an unknown object
    const external = E(hub).lookup(...path);
    return { external, internal: undefined };
  };

  /**
   * @param {string} workerFormulaIdentifier
   * @param {string} guestFormulaIdentifier
   * @param {string} specifier
   * @param {import('./types.js').Context} context
   */
  const makeControllerForUnconfinedPlugin = async (
    workerFormulaIdentifier,
    guestFormulaIdentifier,
    specifier,
    context,
  ) => {
    context.thisDiesIfThatDies(workerFormulaIdentifier);
    context.thisDiesIfThatDies(guestFormulaIdentifier);

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
    const external = E(workerDaemonFacet).makeUnconfined(
      specifier,
      guestP,
      // TODO fix type
      /** @type {any} */ (makeFarContext(context)),
    );
    return { external, internal: undefined };
  };

  /**
   * @param {string} workerFormulaIdentifier
   * @param {string} guestFormulaIdentifier
   * @param {string} bundleFormulaIdentifier
   * @param {import('./types.js').Context} context
   */
  const makeControllerForSafeBundle = async (
    workerFormulaIdentifier,
    guestFormulaIdentifier,
    bundleFormulaIdentifier,
    context,
  ) => {
    context.thisDiesIfThatDies(workerFormulaIdentifier);
    context.thisDiesIfThatDies(guestFormulaIdentifier);

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
    const external = E(workerDaemonFacet).makeBundle(
      readableBundleP,
      guestP,
      // TODO fix type
      /** @type {any} */ (makeFarContext(context)),
    );
    return { external, internal: undefined };
  };

  /**
   * @param {string} formulaIdentifier
   * @param {string} formulaNumber
   * @param {import('./types.js').Formula} formula
   * @param {import('./types.js').Context} context
   */
  const makeControllerForFormula = (
    formulaIdentifier,
    formulaNumber,
    formula,
    context,
  ) => {
    if (formula.type === 'eval') {
      return makeControllerForEval(
        formula.worker,
        formula.source,
        formula.names,
        formula.values,
        context,
      );
    } else if (formula.type === 'readable-blob') {
      const external = makeReadableBlob(formula.content);
      return { external, internal: undefined };
    } else if (formula.type === 'lookup') {
      return makeControllerForLookup(formula.hub, formula.path, context);
    } else if (formula.type === 'worker') {
      return makeIdentifiedWorkerController(formulaNumber, context);
    } else if (formula.type === 'make-unconfined') {
      return makeControllerForUnconfinedPlugin(
        formula.worker,
        formula.powers,
        formula.specifier,
        context,
      );
    } else if (formula.type === 'make-bundle') {
      return makeControllerForSafeBundle(
        formula.worker,
        formula.powers,
        formula.bundle,
        context,
      );
    } else if (formula.type === 'host') {
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return makeIdentifiedHost(
        formulaIdentifier,
        formula.petStore,
        formula.inspector,
        formula.worker,
        formula.endo,
        formula.networks,
        formula.leastAuthority,
        context,
      );
    } else if (formula.type === 'guest') {
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return makeIdentifiedGuestController(
        formulaIdentifier,
        formula.host,
        formula.petStore,
        formula.worker,
        context,
      );
    } else if (formula.type === 'web-bundle') {
      // Behold, forward-reference:
      // eslint-disable-next-line no-use-before-define
      context.thisDiesIfThatDies(formula.bundle);
      context.thisDiesIfThatDies(formula.powers);
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
    } else if (formula.type === 'handle') {
      context.thisDiesIfThatDies(formula.target);
      return {
        external: {},
        internal: {
          targetFormulaIdentifier: formula.target,
        },
      };
    } else if (formula.type === 'endo') {
      // Gateway is equivalent to E's "nonce locator". It provides a value for
      // a formula identifier to a remote client.
      const gateway = Far('Gateway', {
        provide: async requestedFormulaIdentifier => {
          const { node } = parseId(requestedFormulaIdentifier);
          if (node !== ownNodeIdentifier) {
            throw new Error(
              `Gateway can only provide local values. Got request for node ${q(
                node,
              )}`,
            );
          }
          // eslint-disable-next-line no-use-before-define
          return provideValueForFormulaIdentifier(requestedFormulaIdentifier);
        },
      });
      /** @type {import('./types.js').FarEndoBootstrap} */
      const endoBootstrap = Far('Endo private facet', {
        // TODO for user named
        ping: async () => 'pong',
        terminate: async () => {
          cancel(new Error('Termination requested'));
        },
        host: () => {
          // Behold, recursion:
          return /** @type {Promise<import('./types.js').EndoHost>} */ (
            // eslint-disable-next-line no-use-before-define
            provideValueForFormulaIdentifier(formula.host)
          );
        },
        leastAuthority: () => {
          // Behold, recursion:
          return /** @type {Promise<import('./types.js').EndoGuest>} */ (
            // eslint-disable-next-line no-use-before-define
            provideValueForFormulaIdentifier(formula.leastAuthority)
          );
        },
        webPageJs: () => {
          if (formula.webPageJs === undefined) {
            throw new Error('No web-page-js formula provided.');
          }
          // Behold, recursion:
          // eslint-disable-next-line no-use-before-define
          return provideValueForFormulaIdentifier(formula.webPageJs);
        },
        importAndEndowInWebPage: async (webPageP, webPageNumber) => {
          const { bundle: bundleBlob, powers: endowedPowers } =
            /** @type {import('./types.js').EndoWebBundle} */ (
              // Behold, recursion:
              // eslint-disable-next-line no-use-before-define
              await provideValueForFormulaIdentifier(
                `web-bundle:${webPageNumber}`,
              ).catch(() => {
                throw new Error('Not found');
              })
            );
          const bundle = await E(bundleBlob).json();
          await E(webPageP).makeBundle(bundle, endowedPowers);
        },
        gateway: async () => {
          return gateway;
        },
        reviveNetworks: async () => {
          const networksDirectory =
            /** @type {import('./types.js').EndoDirectory} */ (
              // Behold, recursion:
              // eslint-disable-next-line no-use-before-define
              await provideValueForFormulaIdentifier(formula.networks)
            );
          const networkFormulaIdentifiers =
            await networksDirectory.listIdentifiers();
          await Promise.allSettled(
            networkFormulaIdentifiers.map(
              // Behold, recursion:
              // eslint-disable-next-line no-use-before-define
              provideValueForFormulaIdentifier,
            ),
          );
        },
        addPeerInfo: async peerInfo => {
          const peerPetstore =
            /** @type {import('./types.js').PetStore} */
            // Behold, recursion:
            // eslint-disable-next-line no-use-before-define
            (await provideValueForFormulaIdentifier(formula.peers));
          const { node, addresses } = peerInfo;
          // eslint-disable-next-line no-use-before-define
          const nodeName = petStoreNameForNodeIdentifier(node);
          if (peerPetstore.has(nodeName)) {
            // We already have this peer.
            // TODO: merge connection info
            return;
          }
          const { formulaIdentifier: peerFormulaIdentifier } =
            // eslint-disable-next-line no-use-before-define
            await incarnatePeer(formula.networks, addresses);
          await peerPetstore.write(nodeName, peerFormulaIdentifier);
        },
      });
      return {
        external: endoBootstrap,
        internal: undefined,
      };
    } else if (formula.type === 'loopback-network') {
      // Behold, forward-reference:
      const loopbackNetwork = makeLoopbackNetwork({
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier,
      });
      return {
        external: loopbackNetwork,
        internal: undefined,
      };
    } else if (formula.type === 'least-authority') {
      const disallowedFn = async () => {
        throw new Error('not allowed');
      };
      const leastAuthority =
        /** @type {import('@endo/far').FarRef<import('./types.js').EndoGuest>} */ (
          /** @type {unknown} */ (
            Far('EndoGuest', {
              has: disallowedFn,
              identify: disallowedFn,
              list: disallowedFn,
              followChanges: disallowedFn,
              lookup: disallowedFn,
              reverseLookup: disallowedFn,
              write: disallowedFn,
              remove: disallowedFn,
              move: disallowedFn,
              copy: disallowedFn,
              listMessages: disallowedFn,
              followMessages: disallowedFn,
              resolve: disallowedFn,
              reject: disallowedFn,
              adopt: disallowedFn,
              dismiss: disallowedFn,
              request: disallowedFn,
              send: disallowedFn,
              makeDirectory: disallowedFn,
            })
          )
        );
      return { external: leastAuthority, internal: undefined };
    } else if (formula.type === 'pet-store') {
      const external = petStorePowers.makeIdentifiedPetStore(
        formulaNumber,
        assertPetName,
      );
      return { external, internal: undefined };
    } else if (formula.type === 'pet-inspector') {
      // Behold, unavoidable forward-reference:
      // eslint-disable-next-line no-use-before-define
      const external = makePetStoreInspector(formula.petStore);
      return { external, internal: undefined };
    } else if (formula.type === 'directory') {
      // Behold, forward-reference:
      // eslint-disable-next-line no-use-before-define
      return makeIdentifiedDirectory({
        petStoreFormulaIdentifier: formula.petStore,
        context,
      });
    } else if (formula.type === 'peer') {
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      return makePeer(formula.networks, formula.addresses, context);
    } else {
      throw new TypeError(`Invalid formula: ${q(formula)}`);
    }
  };

  /**
   * @param {string} formulaIdentifier
   * @param {import('./types.js').Context} context
   */
  const makeControllerForFormulaIdentifier = async (
    formulaIdentifier,
    context,
  ) => {
    const { number: formulaNumber, node: formulaNode } =
      parseId(formulaIdentifier);
    const isRemote = formulaNode !== ownNodeIdentifier;
    if (isRemote) {
      // eslint-disable-next-line no-use-before-define
      const peerIdentifier = await getPeerFormulaIdentifierForNodeIdentifier(
        formulaNode,
      );
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      return provideRemoteValue(peerIdentifier, formulaIdentifier);
    }
    const formula = await persistencePowers.readFormula(formulaNumber);
    if (
      ![
        'endo',
        'worker',
        'eval',
        'readable-blob',
        'make-unconfined',
        'make-bundle',
        'host',
        'guest',
        'least-authority',
        'loopback-network',
        'peer',
        'web-bundle',
        'web-page-js',
        'handle',
        'pet-inspector',
        'pet-store',
        'lookup',
        'directory',
      ].includes(formula.type)
    ) {
      assert.Fail`Invalid formula identifier, unrecognized type ${q(
        formulaIdentifier,
      )}`;
    }
    // TODO further validation
    return makeControllerForFormula(
      formulaIdentifier,
      formulaNumber,
      formula,
      context,
    );
  };

  /** @type {import('./types.js').DaemonCore['provideValueForNumberedFormula']} */
  const provideValueForNumberedFormula = async (
    formulaType,
    formulaNumber,
    formula,
  ) => {
    const formulaIdentifier = formatId({
      number: formulaNumber,
      node: ownNodeIdentifier,
    });

    // Memoize for lookup.
    console.log(`Making ${formulaIdentifier}`);
    const { promise: partial, resolve: resolvePartial } =
      /** @type {import('@endo/promise-kit').PromiseKit<import('./types.js').InternalExternal<>>} */ (
        makePromiseKit()
      );

    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const context = makeContext(formulaIdentifier);
    partial.catch(context.cancel);
    const controller = harden({
      context,
      external: E.get(partial).external.then(value => {
        if (typeof value === 'object' && value !== null) {
          formulaIdentifierForRef.add(value, formulaIdentifier);
        }
        return value;
      }),
      internal: E.get(partial).internal,
    });
    controllerForFormulaIdentifier.set(formulaIdentifier, controller);

    // The controller _must_ be constructed in the synchronous prelude of this function.
    const controllerValue = makeControllerForFormula(
      formulaIdentifier,
      formulaNumber,
      formula,
      context,
    );

    // Ensure that failure to flush the formula to storage
    // causes a rejection for both the controller and the incarnation value.
    const written = persistencePowers.writeFormula(
      formula,
      formulaType,
      formulaNumber,
    );
    resolvePartial(written.then(() => /** @type {any} */ (controllerValue)));
    await written;

    return harden({
      formulaIdentifier,
      value: controller.external,
    });
  };

  /** @type {import('./types.js').DaemonCore['provideControllerForFormulaIdentifier']} */
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
    const context = makeContext(formulaIdentifier);
    partial.catch(context.cancel);
    controller = harden({
      context,
      external: E.get(partial).external,
      internal: E.get(partial).internal,
    });
    controllerForFormulaIdentifier.set(formulaIdentifier, controller);

    resolve(makeControllerForFormulaIdentifier(formulaIdentifier, context));

    return controller;
  };

  // TODO: sorry, forcing nodeId into a petstore name
  const petStoreNameForNodeIdentifier = nodeIdentifier => {
    return `p${nodeIdentifier.slice(0, 126)}`;
  };

  /**
   * @param {string} nodeIdentifier
   * @returns {Promise<string>}
   */
  const getPeerFormulaIdentifierForNodeIdentifier = async nodeIdentifier => {
    if (nodeIdentifier === ownNodeIdentifier) {
      throw new Error(`Cannot get peer formula identifier for self`);
    }
    const peerStore = /** @type {import('./types.js').PetStore} */ (
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(peersFormulaIdentifier)
    );
    const nodeName = petStoreNameForNodeIdentifier(nodeIdentifier);
    const peerFormulaIdentifier = peerStore.identifyLocal(nodeName);
    if (peerFormulaIdentifier === undefined) {
      throw new Error(
        `No peer found for node identifier ${q(nodeIdentifier)}.`,
      );
    }
    return peerFormulaIdentifier;
  };

  /** @type {import('./types.js').DaemonCore['cancelValue']} */
  const cancelValue = async (formulaIdentifier, reason) => {
    await formulaGraphJobs.enqueue();
    const controller = provideControllerForFormulaIdentifier(formulaIdentifier);
    console.log('Cancelled:');
    return controller.context.cancel(reason);
  };

  /** @type {import('./types.js').DaemonCore['provideValueForFormulaIdentifier']} */
  const provideValueForFormulaIdentifier = formulaIdentifier => {
    const controller = /** @type {import('./types.js').Controller<>} */ (
      provideControllerForFormulaIdentifier(formulaIdentifier)
    );
    return controller.external.then(value => {
      // Release the value to the public only after ensuring
      // we can reverse-lookup its nonce.
      if (typeof value === 'object' && value !== null) {
        formulaIdentifierForRef.add(value, formulaIdentifier);
      }
      return value;
    });
  };

  /** @type {import('./types.js').DaemonCore['provideControllerForFormulaIdentifierAndResolveHandle']} */
  const provideControllerForFormulaIdentifierAndResolveHandle =
    async formulaIdentifier => {
      let currentFormulaIdentifier = formulaIdentifier;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const controller = provideControllerForFormulaIdentifier(
          currentFormulaIdentifier,
        );
        // eslint-disable-next-line no-await-in-loop
        const internalFacet = await controller.internal;
        if (internalFacet === undefined || internalFacet === null) {
          return controller;
        }
        // @ts-expect-error We can't know the type of the internal facet.
        if (internalFacet.targetFormulaIdentifier === undefined) {
          return controller;
        }
        const handle = /** @type {import('./types.js').InternalHandle} */ (
          internalFacet
        );
        currentFormulaIdentifier = handle.targetFormulaIdentifier;
      }
    };

  /**
   * @type {import('./types.js').DaemonCoreInternal['incarnateNumberedLeastAuthority']}
   */
  const incarnateNumberedLeastAuthority = async formulaNumber => {
    /** @type {import('./types.js').LeastAuthorityFormula} */
    const formula = {
      type: 'least-authority',
    };

    return /** @type {import('./types').IncarnateResult<import('./types').EndoGuest>} */ (
      provideValueForNumberedFormula(formula.type, formulaNumber, formula)
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnateReadableBlob']} */
  const incarnateReadableBlob = async contentSha512 => {
    const formulaNumber = await randomHex512();
    /** @type {import('./types.js').ReadableBlobFormula} */
    const formula = {
      type: 'readable-blob',
      content: contentSha512,
    };
    return /** @type {import('./types.js').IncarnateResult<import('./types.js').FarEndoReadable>} */ (
      provideValueForNumberedFormula(formula.type, formulaNumber, formula)
    );
  };

  /**
   * Incarnates a `handle` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {string} formulaNumber - The formula number of the handle to incarnate.
   * @param {string} targetFormulaIdentifier - The formula identifier of the handle's target.
   * @returns {import('./types.js').IncarnateResult<import('./types.js').ExternalHandle>} The incarnated handle.
   */
  const incarnateNumberedHandle = (formulaNumber, targetFormulaIdentifier) => {
    /** @type {import('./types.js').HandleFormula} */
    const formula = {
      type: 'handle',
      target: targetFormulaIdentifier,
    };
    return /** @type {import('./types').IncarnateResult<import('./types').ExternalHandle>} */ (
      provideValueForNumberedFormula(formula.type, formulaNumber, formula)
    );
  };

  /**
   * Incarnates a `pet-store` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {string} formulaNumber - The formula number of the pet store to incarnate.
   * @returns {import('./types.js').IncarnateResult<import('./types.js').PetStore>} The incarnated pet store.
   */
  const incarnateNumberedPetStore = async formulaNumber => {
    /** @type {import('./types.js').PetStoreFormula} */
    const formula = {
      type: 'pet-store',
    };
    return /** @type {import('./types').IncarnateResult<import('./types').PetStore>} */ (
      provideValueForNumberedFormula(formula.type, formulaNumber, formula)
    );
  };

  /**
   * @type {import('./types.js').DaemonCore['incarnateDirectory']}
   */
  const incarnateDirectory = async () => {
    const { formulaIdentifier: petStoreFormulaIdentifier } =
      await incarnateNumberedPetStore(await randomHex512());
    const formulaNumber = await randomHex512();
    /** @type {import('./types.js').DirectoryFormula} */
    const formula = {
      type: 'directory',
      petStore: petStoreFormulaIdentifier,
    };
    return /** @type {import('./types').IncarnateResult<import('./types').EndoDirectory>} */ (
      provideValueForNumberedFormula(formula.type, formulaNumber, formula)
    );
  };

  /**
   * Incarnates a `worker` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {string} formulaNumber - The worker formula number.
   * @returns {ReturnType<import('./types.js').DaemonCore['incarnateWorker']>}
   */
  const incarnateNumberedWorker = formulaNumber => {
    /** @type {import('./types.js').WorkerFormula} */
    const formula = {
      type: 'worker',
    };

    return /** @type {import('./types').IncarnateResult<import('./types').EndoWorker>} */ (
      provideValueForNumberedFormula(formula.type, formulaNumber, formula)
    );
  };

  /**
   * @type {import('./types.js').DaemonCore['incarnateWorker']}
   */
  const incarnateWorker = async () => {
    const formulaNumber = await formulaGraphJobs.enqueue(randomHex512);
    return incarnateNumberedWorker(formulaNumber);
  };

  /**
   * @type {import('./types.js').DaemonCoreInternal['incarnateHostDependencies']}
   */
  const incarnateHostDependencies = async specifiedIdentifiers => {
    const {
      specifiedWorkerFormulaIdentifier,
      ...remainingSpecifiedIdentifiers
    } = specifiedIdentifiers;

    const storeFormulaIdentifier = (
      await incarnateNumberedPetStore(await randomHex512())
    ).formulaIdentifier;

    return harden({
      ...remainingSpecifiedIdentifiers,
      hostFormulaNumber: await randomHex512(),
      storeFormulaIdentifier,
      /* eslint-disable no-use-before-define */
      inspectorFormulaIdentifier: (
        await incarnateNumberedPetInspector(
          await randomHex512(),
          storeFormulaIdentifier,
        )
      ).formulaIdentifier,
      workerFormulaIdentifier: await provideWorkerFormulaIdentifier(
        specifiedWorkerFormulaIdentifier,
      ),
      /* eslint-enable no-use-before-define */
    });
  };

  /** @type {import('./types.js').DaemonCoreInternal['incarnateNumberedHost']} */
  const incarnateNumberedHost = identifiers => {
    /** @type {import('./types.js').HostFormula} */
    const formula = {
      type: 'host',
      petStore: identifiers.storeFormulaIdentifier,
      inspector: identifiers.inspectorFormulaIdentifier,
      worker: identifiers.workerFormulaIdentifier,
      endo: identifiers.endoFormulaIdentifier,
      networks: identifiers.networksDirectoryFormulaIdentifier,
      leastAuthority: identifiers.leastAuthorityFormulaIdentifier,
    };

    return /** @type {import('./types').IncarnateResult<import('./types').EndoHost>} */ (
      provideValueForNumberedFormula(
        'host',
        identifiers.hostFormulaNumber,
        formula,
      )
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnateHost']} */
  const incarnateHost = async (
    endoFormulaIdentifier,
    networksDirectoryFormulaIdentifier,
    leastAuthorityFormulaIdentifier,
    deferredTasks,
    specifiedWorkerFormulaIdentifier,
  ) => {
    return incarnateNumberedHost(
      await formulaGraphJobs.enqueue(async () => {
        const identifiers = await incarnateHostDependencies({
          endoFormulaIdentifier,
          leastAuthorityFormulaIdentifier,
          networksDirectoryFormulaIdentifier,
          specifiedWorkerFormulaIdentifier,
        });

        await deferredTasks.execute({
          agentFormulaIdentifier: formatId({
            number: identifiers.hostFormulaNumber,
            node: ownNodeIdentifier,
          }),
        });

        return identifiers;
      }),
    );
  };

  /** @type {import('./types.js').DaemonCoreInternal['incarnateGuestDependencies']} */
  const incarnateGuestDependencies = async hostFormulaIdentifier =>
    harden({
      guestFormulaNumber: await randomHex512(),
      hostHandleFormulaIdentifier: (
        await incarnateNumberedHandle(
          await randomHex512(),
          hostFormulaIdentifier,
        )
      ).formulaIdentifier,
      storeFormulaIdentifier: (
        await incarnateNumberedPetStore(await randomHex512())
      ).formulaIdentifier,
      workerFormulaIdentifier: (
        await incarnateNumberedWorker(await randomHex512())
      ).formulaIdentifier,
    });

  /** @type {import('./types.js').DaemonCoreInternal['incarnateNumberedGuest']} */
  const incarnateNumberedGuest = identifiers => {
    /** @type {import('./types.js').GuestFormula} */
    const formula = {
      type: 'guest',
      host: identifiers.hostHandleFormulaIdentifier,
      petStore: identifiers.storeFormulaIdentifier,
      worker: identifiers.workerFormulaIdentifier,
    };

    return /** @type {import('./types').IncarnateResult<import('./types').EndoGuest>} */ (
      provideValueForNumberedFormula(
        formula.type,
        identifiers.guestFormulaNumber,
        formula,
      )
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnateGuest']} */
  const incarnateGuest = async (hostFormulaIdentifier, deferredTasks) => {
    return incarnateNumberedGuest(
      await formulaGraphJobs.enqueue(async () => {
        const identifiers = await incarnateGuestDependencies(
          hostFormulaIdentifier,
        );

        await deferredTasks.execute({
          agentFormulaIdentifier: formatId({
            number: identifiers.guestFormulaNumber,
            node: ownNodeIdentifier,
          }),
        });

        return identifiers;
      }),
    );
  };

  /**
   * @param {string} [specifiedWorkerFormulaIdentifier]
   */
  const provideWorkerFormulaIdentifier =
    async specifiedWorkerFormulaIdentifier => {
      await null;
      if (typeof specifiedWorkerFormulaIdentifier === 'string') {
        return specifiedWorkerFormulaIdentifier;
      }

      const workerFormulaNumber = await randomHex512();
      const workerIncarnation = await incarnateNumberedWorker(
        workerFormulaNumber,
      );
      return workerIncarnation.formulaIdentifier;
    };

  /** @type {import('./types.js').DaemonCore['incarnateEval']} */
  const incarnateEval = async (
    nameHubFormulaIdentifier,
    source,
    codeNames,
    endowmentFormulaIdsOrPaths,
    deferredTasks,
    specifiedWorkerFormulaIdentifier,
  ) => {
    const {
      workerFormulaIdentifier,
      endowmentFormulaIdentifiers,
      evalFormulaNumber,
    } = await formulaGraphJobs.enqueue(async () => {
      const ownFormulaNumber = await randomHex512();
      const ownFormulaIdentifier = formatId({
        number: ownFormulaNumber,
        node: ownNodeIdentifier,
      });

      const identifiers = harden({
        workerFormulaIdentifier: await provideWorkerFormulaIdentifier(
          specifiedWorkerFormulaIdentifier,
        ),
        endowmentFormulaIdentifiers: await Promise.all(
          endowmentFormulaIdsOrPaths.map(async formulaIdOrPath => {
            if (typeof formulaIdOrPath === 'string') {
              return formulaIdOrPath;
            }
            return (
              /* eslint-disable no-use-before-define */
              (
                await incarnateNumberedLookup(
                  await randomHex512(),
                  nameHubFormulaIdentifier,
                  formulaIdOrPath,
                )
              ).formulaIdentifier
              /* eslint-enable no-use-before-define */
            );
          }),
        ),
        evalFormulaIdentifier: ownFormulaIdentifier,
        evalFormulaNumber: ownFormulaNumber,
      });

      await deferredTasks.execute(identifiers);
      return identifiers;
    });

    /** @type {import('./types.js').EvalFormula} */
    const formula = {
      type: 'eval',
      worker: workerFormulaIdentifier,
      source,
      names: codeNames,
      values: endowmentFormulaIdentifiers,
    };
    return /** @type {import('./types.js').IncarnateResult<unknown>} */ (
      provideValueForNumberedFormula(formula.type, evalFormulaNumber, formula)
    );
  };

  /**
   * Incarnates a `lookup` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   * @param {string} formulaNumber - The lookup formula's number.
   * @param {string} hubFormulaIdentifier - The formula identifier of the naming
   * hub to call `lookup` on. A "naming hub" is an objected with a variadic
   * lookup method. It includes objects such as guests and hosts.
   * @param {string[]} petNamePath - The pet name path to look up.
   * @returns {Promise<{ formulaIdentifier: string, value: import('./types').EndoWorker }>}
   */
  const incarnateNumberedLookup = (
    formulaNumber,
    hubFormulaIdentifier,
    petNamePath,
  ) => {
    /** @type {import('./types.js').LookupFormula} */
    const formula = {
      type: 'lookup',
      hub: hubFormulaIdentifier,
      path: petNamePath,
    };

    return /** @type {import('./types.js').IncarnateResult<import('./types.js').EndoWorker>} */ (
      provideValueForNumberedFormula(formula.type, formulaNumber, formula)
    );
  };

  /**
   * @param {string} hostFormulaIdentifier
   * @param {string} [specifiedPowersFormulaIdentifier]
   */
  const providePowersFormulaIdentifier = async (
    hostFormulaIdentifier,
    specifiedPowersFormulaIdentifier,
  ) => {
    await null;
    if (typeof specifiedPowersFormulaIdentifier === 'string') {
      return specifiedPowersFormulaIdentifier;
    }

    const guestIncarnationData = await incarnateGuestDependencies(
      hostFormulaIdentifier,
    );
    const guestIncarnation = await incarnateNumberedGuest(guestIncarnationData);
    return guestIncarnation.formulaIdentifier;
  };

  /**
   * Helper for `incarnateUnconfined` and `incarnateBundle`.
   * @param {'make-bundle' | 'make-unconfined'} formulaType
   * @param {string} hostFormulaIdentifier
   * @param {import('./types.js').DeferredTasks<import('./types.js').MakeCapletDeferredTaskParams>} deferredTasks
   * @param {string} [specifiedWorkerFormulaIdentifier]
   * @param {string} [specifiedPowersFormulaIdentifier]
   */
  const incarnateCapletDependencies = async (
    formulaType,
    hostFormulaIdentifier,
    deferredTasks,
    specifiedWorkerFormulaIdentifier,
    specifiedPowersFormulaIdentifier,
  ) => {
    const ownFormulaNumber = await randomHex512();
    const identifiers = harden({
      powersFormulaIdentifier: await providePowersFormulaIdentifier(
        hostFormulaIdentifier,
        specifiedPowersFormulaIdentifier,
      ),
      capletFormulaIdentifier: formatId({
        number: ownFormulaNumber,
        node: ownNodeIdentifier,
      }),
      capletFormulaNumber: ownFormulaNumber,
      workerFormulaIdentifier: await provideWorkerFormulaIdentifier(
        specifiedWorkerFormulaIdentifier,
      ),
    });
    await deferredTasks.execute(identifiers);
    return identifiers;
  };

  /** @type {import('./types.js').DaemonCore['incarnateUnconfined']} */
  const incarnateUnconfined = async (
    hostFormulaIdentifier,
    specifier,
    deferredTasks,
    specifiedWorkerFormulaIdentifier,
    specifiedPowersFormulaIdentifier,
  ) => {
    const {
      powersFormulaIdentifier,
      capletFormulaNumber,
      workerFormulaIdentifier,
    } = await formulaGraphJobs.enqueue(() =>
      incarnateCapletDependencies(
        'make-unconfined',
        hostFormulaIdentifier,
        deferredTasks,
        specifiedWorkerFormulaIdentifier,
        specifiedPowersFormulaIdentifier,
      ),
    );

    /** @type {import('./types.js').MakeUnconfinedFormula} */
    const formula = {
      type: 'make-unconfined',
      worker: workerFormulaIdentifier,
      powers: powersFormulaIdentifier,
      specifier,
    };
    return provideValueForNumberedFormula(
      formula.type,
      capletFormulaNumber,
      formula,
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnateBundle']} */
  const incarnateBundle = async (
    hostFormulaIdentifier,
    bundleFormulaIdentifier,
    deferredTasks,
    specifiedWorkerFormulaIdentifier,
    specifiedPowersFormulaIdentifier,
  ) => {
    const {
      powersFormulaIdentifier,
      capletFormulaNumber,
      workerFormulaIdentifier,
    } = await formulaGraphJobs.enqueue(() =>
      incarnateCapletDependencies(
        'make-bundle',
        hostFormulaIdentifier,
        deferredTasks,
        specifiedWorkerFormulaIdentifier,
        specifiedPowersFormulaIdentifier,
      ),
    );

    /** @type {import('./types.js').MakeBundleFormula} */
    const formula = {
      type: 'make-bundle',
      worker: workerFormulaIdentifier,
      powers: powersFormulaIdentifier,
      bundle: bundleFormulaIdentifier,
    };
    return provideValueForNumberedFormula(
      formula.type,
      capletFormulaNumber,
      formula,
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnateBundler']} */
  const incarnateBundler = async (
    powersFormulaIdentifier,
    workerFormulaIdentifier,
  ) => {
    if (persistencePowers.getWebPageBundlerFormula === undefined) {
      throw Error('No web-page-js bundler formula provided.');
    }
    const formulaNumber = await randomHex512();
    const formula = persistencePowers.getWebPageBundlerFormula(
      workerFormulaIdentifier,
      powersFormulaIdentifier,
    );
    return provideValueForNumberedFormula(formula.type, formulaNumber, formula);
  };

  /** @type {import('./types.js').DaemonCore['incarnateWebBundle']} */
  const incarnateWebBundle = async (
    powersFormulaIdentifier,
    bundleFormulaIdentifier,
  ) => {
    // TODO use regular-length (512-bit) formula numbers for web bundles
    const formulaNumber = (await randomHex512()).slice(32, 64);
    /** @type {import('./types.js').WebBundleFormula} */
    const formula = {
      type: 'web-bundle',
      powers: powersFormulaIdentifier,
      bundle: bundleFormulaIdentifier,
    };
    return provideValueForNumberedFormula(formula.type, formulaNumber, formula);
  };

  /**
   * @param {string} formulaNumber
   * @param {string} petStoreFormulaIdentifier
   */
  const incarnateNumberedPetInspector = (
    formulaNumber,
    petStoreFormulaIdentifier,
  ) => {
    /** @type {import('./types.js').PetInspectorFormula} */
    const formula = {
      type: 'pet-inspector',
      petStore: petStoreFormulaIdentifier,
    };
    return /** @type {import('./types').IncarnateResult<import('./types').EndoInspector>} */ (
      provideValueForNumberedFormula(formula.type, formulaNumber, formula)
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnatePeer']} */
  const incarnatePeer = async (
    networksDirectoryFormulaIdentifier,
    addresses,
  ) => {
    const formulaNumber = await randomHex512();
    // TODO: validate addresses
    // TODO: mutable state like addresses should not be stored in formula
    /** @type {import('./types.js').PeerFormula} */
    const formula = {
      type: 'peer',
      networks: networksDirectoryFormulaIdentifier,
      addresses,
    };
    return /** @type {import('./types').IncarnateResult<import('./types').EndoPeer>} */ (
      provideValueForNumberedFormula(formula.type, formulaNumber, formula)
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnateLoopbackNetwork']} */
  const incarnateLoopbackNetwork = async () => {
    const formulaNumber = await randomHex512();
    /** @type {import('./types').LoopbackNetworkFormula} */
    const formula = {
      type: 'loopback-network',
    };
    return /** @type {import('./types').IncarnateResult<import('./types').EndoNetwork>} */ (
      provideValueForNumberedFormula(formula.type, formulaNumber, formula)
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnateNetworksDirectory']} */
  const incarnateNetworksDirectory = async () => {
    const { formulaIdentifier, value } = await incarnateDirectory();
    // Make default networks.
    const { formulaIdentifier: loopbackNetworkFormulaIdentifier } =
      await incarnateLoopbackNetwork();
    await E(value).write(['loop'], loopbackNetworkFormulaIdentifier);
    return { formulaIdentifier, value };
  };

  /** @type {import('./types.js').DaemonCore['incarnateEndoBootstrap']} */
  const incarnateEndoBootstrap = async specifiedFormulaNumber => {
    const formulaNumber = await (specifiedFormulaNumber ?? randomHex512());
    const endoFormulaIdentifier = formatId({
      number: formulaNumber,
      node: ownNodeIdentifier,
    });

    const { formulaIdentifier: defaultHostWorkerFormulaIdentifier } =
      await incarnateNumberedWorker(await randomHex512());
    const { formulaIdentifier: networksDirectoryFormulaIdentifier } =
      await incarnateNetworksDirectory();
    const { formulaIdentifier: leastAuthorityFormulaIdentifier } =
      await incarnateNumberedLeastAuthority(await randomHex512());
    const { formulaIdentifier: newPeersFormulaIdentifier } =
      await incarnateNumberedPetStore(peersFormulaNumber);
    if (newPeersFormulaIdentifier !== peersFormulaIdentifier) {
      assert.Fail`Peers PetStore formula identifier did not match expected value, expected ${peersFormulaIdentifier}, got ${newPeersFormulaIdentifier}`;
    }

    // Ensure the default host is incarnated and persisted.
    const { formulaIdentifier: defaultHostFormulaIdentifier } =
      await incarnateNumberedHost(
        await incarnateHostDependencies({
          endoFormulaIdentifier,
          networksDirectoryFormulaIdentifier,
          leastAuthorityFormulaIdentifier,
          specifiedWorkerFormulaIdentifier: defaultHostWorkerFormulaIdentifier,
        }),
      );
    // If supported, ensure the web page bundler is incarnated and persisted.
    let webPageJsFormulaIdentifier;
    if (persistencePowers.getWebPageBundlerFormula !== undefined) {
      ({ formulaIdentifier: webPageJsFormulaIdentifier } =
        await incarnateBundler(
          defaultHostFormulaIdentifier,
          defaultHostWorkerFormulaIdentifier,
        ));
    }

    /** @type {import('./types.js').EndoFormula} */
    const formula = {
      type: 'endo',
      networks: networksDirectoryFormulaIdentifier,
      peers: peersFormulaIdentifier,
      host: defaultHostFormulaIdentifier,
      leastAuthority: leastAuthorityFormulaIdentifier,
      webPageJs: webPageJsFormulaIdentifier,
    };
    return /** @type {import('./types').IncarnateResult<import('./types').FarEndoBootstrap>} */ (
      provideValueForNumberedFormula(formula.type, formulaNumber, formula)
    );
  };

  /**
   * @param {string} networksDirectoryFormulaIdentifier
   * @returns {Promise<import('./types').EndoNetwork[]>}
   */
  const getAllNetworks = async networksDirectoryFormulaIdentifier => {
    const networksDirectory = /** @type {import('./types').EndoDirectory} */ (
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(networksDirectoryFormulaIdentifier)
    );
    const networkFormulaIdentifiers = await networksDirectory.listIdentifiers();
    const networks = /** @type {import('./types').EndoNetwork[]} */ (
      await Promise.all(
        networkFormulaIdentifiers.map(provideValueForFormulaIdentifier),
      )
    );
    return networks;
  };

  /** @type {import('./types.js').DaemonCore['getAllNetworkAddresses']} */
  const getAllNetworkAddresses = async networksDirectoryFormulaIdentifier => {
    const networks = await getAllNetworks(networksDirectoryFormulaIdentifier);
    const addresses = (
      await Promise.all(
        networks.map(async network => {
          return E(network).addresses();
        }),
      )
    ).flat();
    return addresses;
  };

  /**
   * @param {string} networksDirectoryFormulaIdentifier
   * @param {string[]} addresses
   * @param {import('./types.js').Context} context
   * @returns {Promise<import('./types.js').EndoPeerControllerPartial>}
   */
  const makePeer = async (
    networksDirectoryFormulaIdentifier,
    addresses,
    context,
  ) => {
    // TODO race networks that support protocol for connection
    // TODO retry, exponential back-off, with full jitter
    // TODO (in connect implementations) allow for the possibility of
    // connection loss and invalidate the connection formula and its transitive
    // dependees when this occurs.
    const networks = await getAllNetworks(networksDirectoryFormulaIdentifier);
    // Connect on first support address.
    for (const address of addresses) {
      const { protocol } = new URL(address);
      for (const network of networks) {
        // eslint-disable-next-line no-await-in-loop
        if (await E(network).supports(protocol)) {
          const remoteGateway = E(network).connect(
            address,
            makeFarContext(context),
          );
          const external = Promise.resolve({
            provide: remoteFormulaIdentifier => {
              return /** @type {Promise<unknown>} */ (
                E(remoteGateway).provide(remoteFormulaIdentifier)
              );
            },
          });
          const internal = Promise.resolve(undefined);
          // const internal = {
          //   receive, // TODO
          //   respond, // TODO
          //   lookupPath, // TODO
          // };
          return harden({ internal, external });
        }
      }
    }
    throw new Error('Cannot connect to peer: no supported addresses');
  };

  /**
   * This is used to provide a value for a formula identifier that is known to
   * originate from the specified peer.
   * @param {string} peerFormulaIdentifier
   * @param {string} remoteValueFormulaIdentifier
   * @returns {Promise<import('./types.js').ControllerPartial<unknown, undefined>>}
   */
  const provideRemoteValue = async (
    peerFormulaIdentifier,
    remoteValueFormulaIdentifier,
  ) => {
    const peer = /** @type {import('./types.js').EndoPeer} */ (
      await provideValueForFormulaIdentifier(peerFormulaIdentifier)
    );
    const remoteValueP = peer.provide(remoteValueFormulaIdentifier);
    const external = remoteValueP;
    const internal = Promise.resolve(undefined);
    return harden({ internal, external });
  };

  const makeContext = makeContextMaker({
    controllerForFormulaIdentifier,
    provideControllerForFormulaIdentifier,
  });

  const { makeIdentifiedDirectory, makeDirectoryNode } = makeDirectoryMaker({
    provideValueForFormulaIdentifier,
    getFormulaIdentifierForRef,
    incarnateDirectory,
  });

  const makeMailbox = makeMailboxMaker({
    provideValueForFormulaIdentifier,
    provideControllerForFormulaIdentifierAndResolveHandle,
  });

  const makeIdentifiedGuestController = makeGuestMaker({
    provideValueForFormulaIdentifier,
    provideControllerForFormulaIdentifierAndResolveHandle,
    makeMailbox,
    makeDirectoryNode,
  });

  const makeIdentifiedHost = makeHostMaker({
    provideValueForFormulaIdentifier,
    provideControllerForFormulaIdentifier,
    cancelValue,
    incarnateWorker,
    incarnateHost,
    incarnateGuest,
    incarnateEval,
    incarnateUnconfined,
    incarnateBundle,
    incarnateWebBundle,
    storeReaderRef,
    makeMailbox,
    makeDirectoryNode,
    getAllNetworkAddresses,
    ownNodeIdentifier,
  });

  /**
   * Creates an inspector for the current agent's pet store, used to create
   * inspectors for values therein. Notably, can provide references to otherwise
   * un-nameable values such as the `MAIN` worker. See `KnownEndoInspectors` for
   * more details.
   *
   * @param {string} petStoreFormulaIdentifier
   * @returns {Promise<import('./types').EndoInspector>}
   */
  const makePetStoreInspector = async petStoreFormulaIdentifier => {
    const petStore = /** @type {import('./types').PetStore} */ (
      await provideValueForFormulaIdentifier(petStoreFormulaIdentifier)
    );

    /**
     * @param {string} petName - The pet name to inspect.
     * @returns {Promise<import('./types').KnownEndoInspectors[string]>} An
     * inspector for the value of the given pet name.
     */
    const lookup = async petName => {
      const formulaIdentifier = petStore.identifyLocal(petName);
      if (formulaIdentifier === undefined) {
        throw new Error(`Unknown pet name ${petName}`);
      }
      const { number: formulaNumber } = parseId(formulaIdentifier);
      // TODO memoize formulas at the root of the
      // id->formula->controller->incarnation tree.
      const formula = await persistencePowers.readFormula(formulaNumber);
      if (
        ![
          'eval',
          'lookup',
          'make-unconfined',
          'make-bundle',
          'guest',
          'web-bundle',
        ].includes(formula.type)
      ) {
        return makeInspector(formula.type, formulaNumber, harden({}));
      }
      if (formula.type === 'eval') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            endowments: Object.fromEntries(
              formula.names.map((name, index) => {
                return [
                  name,
                  provideValueForFormulaIdentifier(formula.values[index]),
                ];
              }),
            ),
            source: formula.source,
            worker: provideValueForFormulaIdentifier(formula.worker),
          }),
        );
      } else if (formula.type === 'lookup') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            hub: provideValueForFormulaIdentifier(formula.hub),
            path: formula.path,
          }),
        );
      } else if (formula.type === 'guest') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            host: provideValueForFormulaIdentifier(formula.host),
          }),
        );
      } else if (formula.type === 'make-bundle') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            bundle: provideValueForFormulaIdentifier(formula.bundle),
            powers: provideValueForFormulaIdentifier(formula.powers),
            worker: provideValueForFormulaIdentifier(formula.worker),
          }),
        );
      } else if (formula.type === 'make-unconfined') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            powers: provideValueForFormulaIdentifier(formula.powers),
            specifier: formula.type,
            worker: provideValueForFormulaIdentifier(formula.worker),
          }),
        );
      } else if (formula.type === 'web-bundle') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            bundle: provideValueForFormulaIdentifier(formula.bundle),
            powers: provideValueForFormulaIdentifier(formula.powers),
          }),
        );
      } else if (formula.type === 'peer') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            ADDRESSES: formula.addresses,
          }),
        );
      }
      return makeInspector(formula.type, formulaNumber, harden({}));
    };

    /** @returns {string[]} The list of all names in the pet store. */
    const list = () => petStore.list();

    const info = Far('Endo inspector facet', {
      lookup,
      list,
    });

    return info;
  };

  /** @type {import('./types.js').DaemonCore} */
  const daemonCore = {
    nodeIdentifier: ownNodeIdentifier,
    provideControllerForFormulaIdentifier,
    provideControllerForFormulaIdentifierAndResolveHandle,
    provideValueForFormulaIdentifier,
    provideValueForNumberedFormula,
    getFormulaIdentifierForRef,
    getAllNetworkAddresses,
    cancelValue,
    storeReaderRef,
    makeMailbox,
    makeDirectoryNode,
    incarnateEndoBootstrap,
    incarnateNetworksDirectory,
    incarnateLoopbackNetwork,
    incarnateDirectory,
    incarnateWorker,
    incarnateHost,
    incarnateGuest,
    incarnatePeer,
    incarnateEval,
    incarnateUnconfined,
    incarnateReadableBlob,
    incarnateBundler,
    incarnateBundle,
    incarnateWebBundle,
  };
  return daemonCore;
};

/**
 * @param {import('./types.js').DaemonicPowers} powers
 * @param {Promise<number>} webletPortP
 * @param {object} args
 * @param {(error: Error) => void} args.cancel
 * @param {number} args.gracePeriodMs
 * @param {Promise<never>} args.gracePeriodElapsed
 * @returns {Promise<import('./types.js').FarEndoBootstrap>}
 */
const provideEndoBootstrap = async (
  powers,
  webletPortP,
  { cancel, gracePeriodMs, gracePeriodElapsed },
) => {
  const { persistence: persistencePowers } = powers;
  const { rootNonce: endoFormulaNumber, isNewlyCreated } =
    await persistencePowers.provideRootNonce();
  const daemonCore = await makeDaemonCore(
    powers,
    webletPortP,
    endoFormulaNumber,
    {
      cancel,
      gracePeriodMs,
      gracePeriodElapsed,
    },
  );
  const isInitialized = !isNewlyCreated;
  if (isInitialized) {
    const endoFormulaIdentifier = formatId({
      number: endoFormulaNumber,
      node: daemonCore.nodeIdentifier,
    });
    return /** @type {Promise<import('./types.js').FarEndoBootstrap>} */ (
      daemonCore.provideValueForFormulaIdentifier(endoFormulaIdentifier)
    );
  } else {
    const { value: endoBootstrap } = await daemonCore.incarnateEndoBootstrap(
      endoFormulaNumber,
    );
    return endoBootstrap;
  }
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

  const endoBootstrap = await provideEndoBootstrap(
    powers,
    assignedWebletPortP,
    {
      cancel,
      gracePeriodMs,
      gracePeriodElapsed,
    },
  );

  await E(endoBootstrap).reviveNetworks();

  return { endoBootstrap, cancelGracePeriod, assignWebletPort };
};
