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
    id: () => context.id,
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
 * @param {string} rootEntropy
 * @param {object} args
 * @param {(error: Error) => void} args.cancel
 * @param {number} args.gracePeriodMs
 * @param {import('./types.js').Specials} args.specials
 * @param {Promise<never>} args.gracePeriodElapsed
 */
const makeDaemonCore = async (
  powers,
  rootEntropy,
  { cancel, gracePeriodMs, gracePeriodElapsed, specials },
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
    'node',
    rootEntropy,
    cryptoPowers.makeSha512(),
  );
  console.log('Node', ownNodeIdentifier);

  const peersFormulaNumber = deriveId(
    'peers',
    rootEntropy,
    cryptoPowers.makeSha512(),
  );
  const peersId = formatId({
    number: peersFormulaNumber,
    node: ownNodeIdentifier,
  });

  // Prime least authority formula (without incarnation)
  const leastAuthorityFormulaNumber = deriveId(
    'none',
    rootEntropy,
    cryptoPowers.makeSha512(),
  );
  const leastAuthorityId = formatId({
    number: leastAuthorityFormulaNumber,
    node: ownNodeIdentifier,
  });
  await persistencePowers.writeFormula(leastAuthorityFormulaNumber, {
    type: 'least-authority',
  });

  // Prime main worker formula (without incarnation)
  const mainWorkerFormulaNumber = deriveId(
    'main',
    rootEntropy,
    cryptoPowers.makeSha512(),
  );
  const mainWorkerId = formatId({
    number: mainWorkerFormulaNumber,
    node: ownNodeIdentifier,
  });
  await persistencePowers.writeFormula(mainWorkerFormulaNumber, {
    type: 'worker',
  });

  /** @type {import('./types.js').Builtins} */
  const builtins = {
    NONE: leastAuthorityId,
    MAIN: mainWorkerId,
  };

  // Generate platform formulas (without incarnation)
  const platformNames = Object.fromEntries(
    await Promise.all(
      Object.entries(specials).map(async ([specialName, makeFormula]) => {
        const formula = makeFormula(builtins);
        const formulaNumber = deriveId(
          specialName,
          rootEntropy,
          cryptoPowers.makeSha512(),
        );
        const id = formatId({
          number: formulaNumber,
          node: ownNodeIdentifier,
        });
        await persistencePowers.writeFormula(formulaNumber, formula);
        return [specialName, id];
      }),
    ),
  );

  /**
   * The two functions "formulate" and "provide" share a responsibility for
   * maintaining the memoization tables "controllerForId" and
   * "idForRef".
   * "formulate" is used for incarnating and persisting new formulas, whereas
   * "provide" is used for reincarnating stored formulas.
   */

  /**
   * Reverse look-up, for answering "what is my name for this near or far
   * reference", and not for "what is my name for this promise".
   * @type {Map<string, import('./types.js').Controller>}
   */
  const controllerForId = new Map();

  /**
   * Reverse look-up, for answering "what is my name for this near or far
   * reference", and not for "what is my name for this promise".
   * @type {import('./types.js').WeakMultimap<Record<string | symbol, unknown>, string>}
   */
  const idForRef = makeWeakMultimap();

  /** @type {import('./types.js').WeakMultimap<Record<string | symbol, unknown>, string>['get']} */
  const getIdForRef = ref => idForRef.get(ref);

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
   * @param {string} sha512
   */
  const makeControllerForReadableBlob = sha512 => {
    const { text, json, streamBase64 } = contentStore.fetch(sha512);
    return {
      /** @type {import('./types.js').FarEndoReadable} */
      external: Far(`Readable file with SHA-512 ${sha512.slice(0, 8)}...`, {
        sha512: () => sha512,
        streamBase64,
        text,
        json,
      }),
      internal: undefined,
    };
  };

  /**
   * @param {string} workerId
   * @param {string} source
   * @param {Array<string>} codeNames
   * @param {Array<string>} ids
   * @param {import('./types.js').Context} context
   */
  const makeControllerForEval = async (
    workerId,
    source,
    codeNames,
    ids,
    context,
  ) => {
    context.thisDiesIfThatDies(workerId);
    for (const id of ids) {
      context.thisDiesIfThatDies(id);
    }

    const workerController =
      /** @type {import('./types.js').Controller<unknown, import('./worker.js').WorkerBootstrap>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideControllerForId(workerId)
      );
    const workerDaemonFacet = workerController.internal;
    assert(
      workerDaemonFacet,
      `panic: No internal bootstrap for worker ${workerId}`,
    );

    const endowmentValues = await Promise.all(
      ids.map(id =>
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provide(id),
      ),
    );

    const external = E(workerDaemonFacet).evaluate(
      source,
      codeNames,
      endowmentValues,
      context.id,
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
   * @param {string} hubId
   * @param {string[]} path
   * @param {import('./types.js').Context} context
   */
  const makeControllerForLookup = async (hubId, path, context) => {
    context.thisDiesIfThatDies(hubId);

    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const hub = provide(hubId);
    // @ts-expect-error calling lookup on an unknown object
    const external = E(hub).lookup(...path);
    return { external, internal: undefined };
  };

  /**
   * @param {string} workerId
   * @param {string} guestId
   * @param {string} specifier
   * @param {import('./types.js').Context} context
   */
  const makeControllerForUnconfinedPlugin = async (
    workerId,
    guestId,
    specifier,
    context,
  ) => {
    context.thisDiesIfThatDies(workerId);
    context.thisDiesIfThatDies(guestId);

    const workerController =
      /** @type {import('./types.js').Controller<unknown, import('./worker.js').WorkerBootstrap>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideControllerForId(workerId)
      );
    const workerDaemonFacet = workerController.internal;
    assert(
      workerDaemonFacet,
      `panic: No internal bootstrap for worker ${workerId}`,
    );
    const guestP = /** @type {Promise<import('./types.js').EndoGuest>} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      provide(guestId)
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
   * @param {string} workerId
   * @param {string} guestId
   * @param {string} bundleId
   * @param {import('./types.js').Context} context
   */
  const makeControllerForSafeBundle = async (
    workerId,
    guestId,
    bundleId,
    context,
  ) => {
    context.thisDiesIfThatDies(workerId);
    context.thisDiesIfThatDies(guestId);

    const workerController =
      /** @type {import('./types.js').Controller<unknown, import('./worker.js').WorkerBootstrap>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideControllerForId(workerId)
      );
    const workerDaemonFacet = workerController.internal;
    assert(
      workerDaemonFacet,
      `panic: No internal bootstrap for worker ${workerId}`,
    );
    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const readableBundleP =
      /** @type {Promise<import('./types.js').EndoReadable>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provide(bundleId)
      );
    const guestP = /** @type {Promise<import('./types.js').EndoGuest>} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      provide(guestId)
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
   * @param {string} id
   * @param {string} formulaNumber
   * @param {import('./types.js').Formula} formula
   * @param {import('./types.js').Context} context
   */
  const makeControllerForFormula = (id, formulaNumber, formula, context) => {
    if (formula.type === 'eval') {
      return makeControllerForEval(
        formula.worker,
        formula.source,
        formula.names,
        formula.values,
        context,
      );
    } else if (formula.type === 'readable-blob') {
      return makeControllerForReadableBlob(formula.content);
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
        id,
        formula.petStore,
        formula.inspector,
        formula.worker,
        formula.endo,
        formula.networks,
        leastAuthorityId,
        platformNames,
        context,
      );
    } else if (formula.type === 'guest') {
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return makeIdentifiedGuestController(
        id,
        formula.host,
        formula.petStore,
        formula.worker,
        context,
      );
    } else if (formula.type === 'handle') {
      context.thisDiesIfThatDies(formula.target);
      return {
        external: {},
        internal: {
          targetId: formula.target,
        },
      };
    } else if (formula.type === 'endo') {
      // Gateway is equivalent to E's "nonce locator". It provides a value for
      // a formula identifier to a remote client.
      const gateway = Far('Gateway', {
        provide: async requestedId => {
          const { node } = parseId(requestedId);
          if (node !== ownNodeIdentifier) {
            throw new Error(
              `Gateway can only provide local values. Got request for node ${q(
                node,
              )}`,
            );
          }
          // eslint-disable-next-line no-use-before-define
          return provide(requestedId);
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
            provide(formula.host)
          );
        },
        leastAuthority: () => {
          // Behold, recursion:
          return /** @type {Promise<import('./types.js').EndoGuest>} */ (
            // eslint-disable-next-line no-use-before-define
            provide(leastAuthorityId)
          );
        },
        gateway: async () => {
          return gateway;
        },
        reviveNetworks: async () => {
          const networksDirectory =
            /** @type {import('./types.js').EndoDirectory} */ (
              // Behold, recursion:
              // eslint-disable-next-line no-use-before-define
              await provide(formula.networks)
            );
          const networkIds = await networksDirectory.listIdentifiers();
          await Promise.allSettled(
            networkIds.map(
              // Behold, recursion:
              // eslint-disable-next-line no-use-before-define
              provide,
            ),
          );
        },
        addPeerInfo: async peerInfo => {
          const peerPetstore =
            /** @type {import('./types.js').PetStore} */
            // Behold, recursion:
            // eslint-disable-next-line no-use-before-define
            (await provide(formula.peers));
          const { node, addresses } = peerInfo;
          // eslint-disable-next-line no-use-before-define
          const nodeName = petStoreNameForNodeIdentifier(node);
          if (peerPetstore.has(nodeName)) {
            // We already have this peer.
            // TODO: merge connection info
            return;
          }
          const { id: peerId } =
            // eslint-disable-next-line no-use-before-define
            await incarnatePeer(formula.networks, addresses);
          await peerPetstore.write(nodeName, peerId);
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
        provide,
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
        petStoreId: formula.petStore,
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
   * @param {string} id
   * @param {import('./types.js').Context} context
   */
  const makeControllerForId = async (id, context) => {
    const { number: formulaNumber, node: formulaNode } = parseId(id);
    const isRemote = formulaNode !== ownNodeIdentifier;
    if (isRemote) {
      // eslint-disable-next-line no-use-before-define
      const peerIdentifier = await getPeerIdForNodeIdentifier(formulaNode);
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      return provideRemoteValue(peerIdentifier, id);
    }
    const formula = await persistencePowers.readFormula(formulaNumber);
    console.log(`Making ${formula.type} ${formulaNumber}`);
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
        'handle',
        'pet-inspector',
        'pet-store',
        'lookup',
        'directory',
      ].includes(formula.type)
    ) {
      assert.Fail`Invalid formula identifier, unrecognized type ${q(id)}`;
    }
    // TODO further validation
    return makeControllerForFormula(id, formulaNumber, formula, context);
  };

  /** @type {import('./types.js').DaemonCore['formulate']} */
  const formulate = async (formulaNumber, formula) => {
    const id = formatId({
      number: formulaNumber,
      node: ownNodeIdentifier,
    });

    // Memoize for lookup.
    console.log(`Making ${id}`);
    const { promise: partial, resolve: resolvePartial } =
      /** @type {import('@endo/promise-kit').PromiseKit<import('./types.js').InternalExternal<>>} */ (
        makePromiseKit()
      );

    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const context = makeContext(id);
    partial.catch(context.cancel);
    const controller = harden({
      context,
      external: E.get(partial).external.then(value => {
        if (typeof value === 'object' && value !== null) {
          idForRef.add(value, id);
        }
        return value;
      }),
      internal: E.get(partial).internal,
    });
    controllerForId.set(id, controller);

    // The controller _must_ be constructed in the synchronous prelude of this function.
    const controllerValue = makeControllerForFormula(
      id,
      formulaNumber,
      formula,
      context,
    );

    // Ensure that failure to flush the formula to storage
    // causes a rejection for both the controller and the incarnation value.
    const written = persistencePowers.writeFormula(formulaNumber, formula);
    resolvePartial(written.then(() => /** @type {any} */ (controllerValue)));
    await written;

    return harden({
      id,
      value: controller.external,
    });
  };

  /** @type {import('./types.js').DaemonCore['provideControllerForId']} */
  const provideControllerForId = id => {
    let controller = controllerForId.get(id);
    if (controller !== undefined) {
      return controller;
    }

    const { promise: partial, resolve } =
      /** @type {import('@endo/promise-kit').PromiseKit<import('./types.js').InternalExternal<>>} */ (
        makePromiseKit()
      );

    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const context = makeContext(id);
    partial.catch(context.cancel);
    controller = harden({
      context,
      external: E.get(partial).external,
      internal: E.get(partial).internal,
    });
    controllerForId.set(id, controller);

    resolve(makeControllerForId(id, context));

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
  const getPeerIdForNodeIdentifier = async nodeIdentifier => {
    if (nodeIdentifier === ownNodeIdentifier) {
      throw new Error(`Cannot get peer formula identifier for self`);
    }
    const peerStore = /** @type {import('./types.js').PetStore} */ (
      // eslint-disable-next-line no-use-before-define
      await provide(peersId)
    );
    const nodeName = petStoreNameForNodeIdentifier(nodeIdentifier);
    const peerId = peerStore.identifyLocal(nodeName);
    if (peerId === undefined) {
      throw new Error(
        `No peer found for node identifier ${q(nodeIdentifier)}.`,
      );
    }
    return peerId;
  };

  /** @type {import('./types.js').DaemonCore['cancelValue']} */
  const cancelValue = async (id, reason) => {
    await formulaGraphJobs.enqueue();
    const controller = provideControllerForId(id);
    console.log('Cancelled:');
    return controller.context.cancel(reason);
  };

  /** @type {import('./types.js').DaemonCore['provide']} */
  const provide = id => {
    const controller = /** @type {import('./types.js').Controller<>} */ (
      provideControllerForId(id)
    );
    return controller.external.then(value => {
      // Release the value to the public only after ensuring
      // we can reverse-lookup its nonce.
      if (typeof value === 'object' && value !== null) {
        idForRef.add(value, id);
      }
      return value;
    });
  };

  /** @type {import('./types.js').DaemonCore['provideControllerForIdAndResolveHandle']} */
  const provideControllerForIdAndResolveHandle = async id => {
    let currentId = id;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const controller = provideControllerForId(currentId);
      // eslint-disable-next-line no-await-in-loop
      const internalFacet = await controller.internal;
      if (internalFacet === undefined || internalFacet === null) {
        return controller;
      }
      // @ts-expect-error We can't know the type of the internal facet.
      if (internalFacet.targetId === undefined) {
        return controller;
      }
      const handle = /** @type {import('./types.js').InternalHandle} */ (
        internalFacet
      );
      currentId = handle.targetId;
    }
  };

  /** @type {import('./types.js').DaemonCore['incarnateReadableBlob']} */
  const incarnateReadableBlob = async (readerRef, deferredTasks) => {
    const { formulaNumber, contentSha512 } = await formulaGraphJobs.enqueue(
      async () => {
        const values = {
          formulaNumber: await randomHex512(),
          contentSha512: await contentStore.store(makeRefReader(readerRef)),
        };

        await deferredTasks.execute({
          readableBlobId: formatId({
            number: values.formulaNumber,
            node: ownNodeIdentifier,
          }),
        });

        return values;
      },
    );

    /** @type {import('./types.js').ReadableBlobFormula} */
    const formula = {
      type: 'readable-blob',
      content: contentSha512,
    };

    return /** @type {import('./types.js').IncarnateResult<import('./types.js').FarEndoReadable>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * Incarnates a `handle` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {string} formulaNumber - The formula number of the handle to incarnate.
   * @param {string} targetId - The formula identifier of the handle's target.
   * @returns {import('./types.js').IncarnateResult<import('./types.js').ExternalHandle>} The incarnated handle.
   */
  const incarnateNumberedHandle = (formulaNumber, targetId) => {
    /** @type {import('./types.js').HandleFormula} */
    const formula = {
      type: 'handle',
      target: targetId,
    };
    return /** @type {import('./types').IncarnateResult<import('./types').ExternalHandle>} */ (
      formulate(formulaNumber, formula)
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
      formulate(formulaNumber, formula)
    );
  };

  /**
   * @type {import('./types.js').DaemonCore['incarnateDirectory']}
   */
  const incarnateDirectory = async () => {
    const { id: petStoreId } = await incarnateNumberedPetStore(
      await randomHex512(),
    );
    const formulaNumber = await randomHex512();
    /** @type {import('./types.js').DirectoryFormula} */
    const formula = {
      type: 'directory',
      petStore: petStoreId,
    };
    return /** @type {import('./types').IncarnateResult<import('./types').EndoDirectory>} */ (
      formulate(formulaNumber, formula)
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
      formulate(formulaNumber, formula)
    );
  };

  /**
   * @type {import('./types.js').DaemonCore['incarnateWorker']}
   */
  const incarnateWorker = async deferredTasks => {
    return incarnateNumberedWorker(
      await formulaGraphJobs.enqueue(async () => {
        const formulaNumber = await randomHex512();

        await deferredTasks.execute({
          workerId: formatId({
            number: formulaNumber,
            node: ownNodeIdentifier,
          }),
        });

        return formulaNumber;
      }),
    );
  };

  /**
   * @type {import('./types.js').DaemonCoreInternal['incarnateHostDependencies']}
   */
  const incarnateHostDependencies = async specifiedIdentifiers => {
    const { specifiedWorkerId, ...remainingSpecifiedIdentifiers } =
      specifiedIdentifiers;

    const storeId = (await incarnateNumberedPetStore(await randomHex512())).id;

    return harden({
      ...remainingSpecifiedIdentifiers,
      hostFormulaNumber: await randomHex512(),
      storeId,
      /* eslint-disable no-use-before-define */
      inspectorId: (
        await incarnateNumberedPetInspector(await randomHex512(), storeId)
      ).id,
      workerId: await provideWorkerId(specifiedWorkerId),
      /* eslint-enable no-use-before-define */
    });
  };

  /** @type {import('./types.js').DaemonCoreInternal['incarnateNumberedHost']} */
  const incarnateNumberedHost = identifiers => {
    /** @type {import('./types.js').HostFormula} */
    const formula = {
      type: 'host',
      petStore: identifiers.storeId,
      inspector: identifiers.inspectorId,
      worker: identifiers.workerId,
      endo: identifiers.endoId,
      networks: identifiers.networksDirectoryId,
    };

    return /** @type {import('./types').IncarnateResult<import('./types').EndoHost>} */ (
      formulate(identifiers.hostFormulaNumber, formula)
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnateHost']} */
  const incarnateHost = async (
    endoId,
    networksDirectoryId,
    deferredTasks,
    specifiedWorkerId,
  ) => {
    return incarnateNumberedHost(
      await formulaGraphJobs.enqueue(async () => {
        const identifiers = await incarnateHostDependencies({
          endoId,
          networksDirectoryId,
          specifiedWorkerId,
        });

        await deferredTasks.execute({
          agentId: formatId({
            number: identifiers.hostFormulaNumber,
            node: ownNodeIdentifier,
          }),
        });

        return identifiers;
      }),
    );
  };

  /** @type {import('./types.js').DaemonCoreInternal['incarnateGuestDependencies']} */
  const incarnateGuestDependencies = async hostId =>
    harden({
      guestFormulaNumber: await randomHex512(),
      hostHandleId: (
        await incarnateNumberedHandle(await randomHex512(), hostId)
      ).id,
      storeId: (await incarnateNumberedPetStore(await randomHex512())).id,
      workerId: (await incarnateNumberedWorker(await randomHex512())).id,
    });

  /** @type {import('./types.js').DaemonCoreInternal['incarnateNumberedGuest']} */
  const incarnateNumberedGuest = identifiers => {
    /** @type {import('./types.js').GuestFormula} */
    const formula = {
      type: 'guest',
      host: identifiers.hostHandleId,
      petStore: identifiers.storeId,
      worker: identifiers.workerId,
    };

    return /** @type {import('./types').IncarnateResult<import('./types').EndoGuest>} */ (
      formulate(identifiers.guestFormulaNumber, formula)
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnateGuest']} */
  const incarnateGuest = async (hostId, deferredTasks) => {
    return incarnateNumberedGuest(
      await formulaGraphJobs.enqueue(async () => {
        const identifiers = await incarnateGuestDependencies(hostId);

        await deferredTasks.execute({
          agentId: formatId({
            number: identifiers.guestFormulaNumber,
            node: ownNodeIdentifier,
          }),
        });

        return identifiers;
      }),
    );
  };

  /**
   * @param {string} [specifiedWorkerId]
   */
  const provideWorkerId = async specifiedWorkerId => {
    await null;
    if (typeof specifiedWorkerId === 'string') {
      return specifiedWorkerId;
    }

    const workerFormulaNumber = await randomHex512();
    const workerIncarnation = await incarnateNumberedWorker(
      workerFormulaNumber,
    );
    return workerIncarnation.id;
  };

  /** @type {import('./types.js').DaemonCore['incarnateEval']} */
  const incarnateEval = async (
    nameHubId,
    source,
    codeNames,
    endowmentIdsOrPaths,
    deferredTasks,
    specifiedWorkerId,
  ) => {
    const { workerId, endowmentIds, evalFormulaNumber } =
      await formulaGraphJobs.enqueue(async () => {
        const ownFormulaNumber = await randomHex512();
        const ownId = formatId({
          number: ownFormulaNumber,
          node: ownNodeIdentifier,
        });

        const identifiers = harden({
          workerId: await provideWorkerId(specifiedWorkerId),
          endowmentIds: await Promise.all(
            endowmentIdsOrPaths.map(async formulaIdOrPath => {
              if (typeof formulaIdOrPath === 'string') {
                return formulaIdOrPath;
              }
              return (
                /* eslint-disable no-use-before-define */
                (
                  await incarnateNumberedLookup(
                    await randomHex512(),
                    nameHubId,
                    formulaIdOrPath,
                  )
                ).id
                /* eslint-enable no-use-before-define */
              );
            }),
          ),
          evalId: ownId,
          evalFormulaNumber: ownFormulaNumber,
        });

        await deferredTasks.execute(identifiers);
        return identifiers;
      });

    /** @type {import('./types.js').EvalFormula} */
    const formula = {
      type: 'eval',
      worker: workerId,
      source,
      names: codeNames,
      values: endowmentIds,
    };
    return /** @type {import('./types.js').IncarnateResult<unknown>} */ (
      formulate(evalFormulaNumber, formula)
    );
  };

  /**
   * Incarnates a `lookup` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   * @param {string} formulaNumber - The lookup formula's number.
   * @param {string} hubId - The formula identifier of the naming
   * hub to call `lookup` on. A "naming hub" is an objected with a variadic
   * lookup method. It includes objects such as guests and hosts.
   * @param {string[]} petNamePath - The pet name path to look up.
   * @returns {Promise<{ id: string, value: import('./types').EndoWorker }>}
   */
  const incarnateNumberedLookup = (formulaNumber, hubId, petNamePath) => {
    /** @type {import('./types.js').LookupFormula} */
    const formula = {
      type: 'lookup',
      hub: hubId,
      path: petNamePath,
    };

    return /** @type {import('./types.js').IncarnateResult<import('./types.js').EndoWorker>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * @param {string} hostId
   * @param {string} [specifiedPowersId]
   */
  const providePowersId = async (hostId, specifiedPowersId) => {
    await null;
    if (typeof specifiedPowersId === 'string') {
      return specifiedPowersId;
    }

    const guestIncarnationData = await incarnateGuestDependencies(hostId);
    const guestIncarnation = await incarnateNumberedGuest(guestIncarnationData);
    return guestIncarnation.id;
  };

  /**
   * Helper for `incarnateUnconfined` and `incarnateBundle`.
   * @param {'make-bundle' | 'make-unconfined'} formulaType
   * @param {string} hostId
   * @param {import('./types.js').DeferredTasks<import('./types.js').MakeCapletDeferredTaskParams>} deferredTasks
   * @param {string} [specifiedWorkerId]
   * @param {string} [specifiedPowersId]
   */
  const incarnateCapletDependencies = async (
    formulaType,
    hostId,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
  ) => {
    const ownFormulaNumber = await randomHex512();
    const identifiers = harden({
      powersId: await providePowersId(hostId, specifiedPowersId),
      capletId: formatId({
        number: ownFormulaNumber,
        node: ownNodeIdentifier,
      }),
      capletFormulaNumber: ownFormulaNumber,
      workerId: await provideWorkerId(specifiedWorkerId),
    });
    await deferredTasks.execute(identifiers);
    return identifiers;
  };

  /** @type {import('./types.js').DaemonCore['incarnateUnconfined']} */
  const incarnateUnconfined = async (
    hostId,
    specifier,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
  ) => {
    const { powersId, capletFormulaNumber, workerId } =
      await formulaGraphJobs.enqueue(() =>
        incarnateCapletDependencies(
          'make-unconfined',
          hostId,
          deferredTasks,
          specifiedWorkerId,
          specifiedPowersId,
        ),
      );

    /** @type {import('./types.js').MakeUnconfinedFormula} */
    const formula = {
      type: 'make-unconfined',
      worker: workerId,
      powers: powersId,
      specifier,
    };
    return formulate(capletFormulaNumber, formula);
  };

  /** @type {import('./types.js').DaemonCore['incarnateBundle']} */
  const incarnateBundle = async (
    hostId,
    bundleId,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
  ) => {
    const { powersId, capletFormulaNumber, workerId } =
      await formulaGraphJobs.enqueue(() =>
        incarnateCapletDependencies(
          'make-bundle',
          hostId,
          deferredTasks,
          specifiedWorkerId,
          specifiedPowersId,
        ),
      );

    /** @type {import('./types.js').MakeBundleFormula} */
    const formula = {
      type: 'make-bundle',
      worker: workerId,
      powers: powersId,
      bundle: bundleId,
    };
    return formulate(capletFormulaNumber, formula);
  };

  /**
   * @param {string} formulaNumber
   * @param {string} petStoreId
   */
  const incarnateNumberedPetInspector = (formulaNumber, petStoreId) => {
    /** @type {import('./types.js').PetInspectorFormula} */
    const formula = {
      type: 'pet-inspector',
      petStore: petStoreId,
    };
    return /** @type {import('./types').IncarnateResult<import('./types').EndoInspector>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnatePeer']} */
  const incarnatePeer = async (networksDirectoryId, addresses) => {
    const formulaNumber = await randomHex512();
    // TODO: validate addresses
    // TODO: mutable state like addresses should not be stored in formula
    /** @type {import('./types.js').PeerFormula} */
    const formula = {
      type: 'peer',
      networks: networksDirectoryId,
      addresses,
    };
    return /** @type {import('./types').IncarnateResult<import('./types').EndoPeer>} */ (
      formulate(formulaNumber, formula)
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
      formulate(formulaNumber, formula)
    );
  };

  /** @type {import('./types.js').DaemonCore['incarnateNetworksDirectory']} */
  const incarnateNetworksDirectory = async () => {
    const { id, value } = await incarnateDirectory();
    // Make default networks.
    const { id: loopbackNetworkId } = await incarnateLoopbackNetwork();
    await E(value).write(['loop'], loopbackNetworkId);
    return { id, value };
  };

  /** @type {import('./types.js').DaemonCore['incarnateEndoBootstrap']} */
  const incarnateEndoBootstrap = async specifiedFormulaNumber => {
    const identifiers = await formulaGraphJobs.enqueue(async () => {
      const formulaNumber = await (specifiedFormulaNumber ?? randomHex512());
      const endoId = formatId({
        number: formulaNumber,
        node: ownNodeIdentifier,
      });

      const { id: defaultHostWorkerId } = await incarnateNumberedWorker(
        await randomHex512(),
      );
      const { id: networksDirectoryId } = await incarnateNetworksDirectory();
      const { id: newPeersId } = await incarnateNumberedPetStore(
        peersFormulaNumber,
      );
      if (newPeersId !== peersId) {
        assert.Fail`Peers PetStore formula identifier did not match expected value, expected ${peersId}, got ${newPeersId}`;
      }

      // Ensure the default host is incarnated and persisted.
      const { id: defaultHostId } = await incarnateNumberedHost(
        await incarnateHostDependencies({
          endoId,
          networksDirectoryId,
          specifiedWorkerId: defaultHostWorkerId,
        }),
      );

      return {
        formulaNumber,
        defaultHostId,
        networksDirectoryId,
      };
    });

    /** @type {import('./types.js').EndoFormula} */
    const formula = {
      type: 'endo',
      networks: identifiers.networksDirectoryId,
      peers: peersId,
      host: identifiers.defaultHostId,
      leastAuthority: leastAuthorityId,
    };

    return /** @type {import('./types').IncarnateResult<import('./types').FarEndoBootstrap>} */ (
      formulate(identifiers.formulaNumber, formula)
    );
  };

  /**
   * @param {string} networksDirectoryId
   * @returns {Promise<import('./types').EndoNetwork[]>}
   */
  const getAllNetworks = async networksDirectoryId => {
    const networksDirectory = /** @type {import('./types').EndoDirectory} */ (
      // eslint-disable-next-line no-use-before-define
      await provide(networksDirectoryId)
    );
    const networkIds = await networksDirectory.listIdentifiers();
    const networks = /** @type {import('./types').EndoNetwork[]} */ (
      await Promise.all(networkIds.map(provide))
    );
    return networks;
  };

  /** @type {import('./types.js').DaemonCore['getAllNetworkAddresses']} */
  const getAllNetworkAddresses = async networksDirectoryId => {
    const networks = await getAllNetworks(networksDirectoryId);
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
   * @param {string} networksDirectoryId
   * @param {string[]} addresses
   * @param {import('./types.js').Context} context
   * @returns {Promise<import('./types.js').EndoPeerControllerPartial>}
   */
  const makePeer = async (networksDirectoryId, addresses, context) => {
    // TODO race networks that support protocol for connection
    // TODO retry, exponential back-off, with full jitter
    // TODO (in connect implementations) allow for the possibility of
    // connection loss and invalidate the connection formula and its transitive
    // dependees when this occurs.
    const networks = await getAllNetworks(networksDirectoryId);
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
            provide: remoteId => {
              return /** @type {Promise<unknown>} */ (
                E(remoteGateway).provide(remoteId)
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
   * @param {string} peerId
   * @param {string} remoteValueId
   * @returns {Promise<import('./types.js').ControllerPartial<unknown, undefined>>}
   */
  const provideRemoteValue = async (peerId, remoteValueId) => {
    const peer = /** @type {import('./types.js').EndoPeer} */ (
      await provide(peerId)
    );
    const remoteValueP = peer.provide(remoteValueId);
    const external = remoteValueP;
    const internal = Promise.resolve(undefined);
    return harden({ internal, external });
  };

  const makeContext = makeContextMaker({
    controllerForId,
    provideControllerForId,
  });

  const { makeIdentifiedDirectory, makeDirectoryNode } = makeDirectoryMaker({
    provide,
    getIdForRef,
    incarnateDirectory,
  });

  const makeMailbox = makeMailboxMaker({
    provide,
    provideControllerForIdAndResolveHandle,
  });

  const makeIdentifiedGuestController = makeGuestMaker({
    provide,
    provideControllerForIdAndResolveHandle,
    makeMailbox,
    makeDirectoryNode,
  });

  const makeIdentifiedHost = makeHostMaker({
    provide,
    provideControllerForId,
    cancelValue,
    incarnateWorker,
    incarnateHost,
    incarnateGuest,
    incarnateEval,
    incarnateUnconfined,
    incarnateBundle,
    incarnateReadableBlob,
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
   * @param {string} petStoreId
   * @returns {Promise<import('./types').EndoInspector>}
   */
  const makePetStoreInspector = async petStoreId => {
    const petStore = /** @type {import('./types').PetStore} */ (
      await provide(petStoreId)
    );

    /**
     * @param {string} petName - The pet name to inspect.
     * @returns {Promise<import('./types').KnownEndoInspectors[string]>} An
     * inspector for the value of the given pet name.
     */
    const lookup = async petName => {
      const id = petStore.identifyLocal(petName);
      if (id === undefined) {
        throw new Error(`Unknown pet name ${petName}`);
      }
      const { number: formulaNumber } = parseId(id);
      // TODO memoize formulas at the root of the
      // id->formula->controller->incarnation tree.
      const formula = await persistencePowers.readFormula(formulaNumber);
      if (
        !['eval', 'lookup', 'make-unconfined', 'make-bundle', 'guest'].includes(
          formula.type,
        )
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
                return [name, provide(formula.values[index])];
              }),
            ),
            source: formula.source,
            worker: provide(formula.worker),
          }),
        );
      } else if (formula.type === 'lookup') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            hub: provide(formula.hub),
            path: formula.path,
          }),
        );
      } else if (formula.type === 'guest') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            host: provide(formula.host),
          }),
        );
      } else if (formula.type === 'make-bundle') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            bundle: provide(formula.bundle),
            powers: provide(formula.powers),
            worker: provide(formula.worker),
          }),
        );
      } else if (formula.type === 'make-unconfined') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            powers: provide(formula.powers),
            specifier: formula.type,
            worker: provide(formula.worker),
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
    provideControllerForId,
    provideControllerForIdAndResolveHandle,
    provide,
    formulate,
    getIdForRef,
    getAllNetworkAddresses,
    cancelValue,
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
    incarnateBundle,
  };
  return daemonCore;
};

/**
 * @param {import('./types.js').DaemonicPowers} powers
 * @param {object} args
 * @param {(error: Error) => void} args.cancel
 * @param {number} args.gracePeriodMs
 * @param {Promise<never>} args.gracePeriodElapsed
 * @param {import('./types.js').Specials} args.specials
 * @returns {Promise<import('./types.js').FarEndoBootstrap>}
 */
const provideEndoBootstrap = async (
  powers,
  { cancel, gracePeriodMs, gracePeriodElapsed, specials },
) => {
  const { persistence: persistencePowers } = powers;
  const { rootNonce: endoFormulaNumber, isNewlyCreated } =
    await persistencePowers.provideRootNonce();
  const daemonCore = await makeDaemonCore(powers, endoFormulaNumber, {
    cancel,
    gracePeriodMs,
    gracePeriodElapsed,
    specials,
  });
  const isInitialized = !isNewlyCreated;
  if (isInitialized) {
    const endoId = formatId({
      number: endoFormulaNumber,
      node: daemonCore.nodeIdentifier,
    });
    return /** @type {Promise<import('./types.js').FarEndoBootstrap>} */ (
      daemonCore.provide(endoId)
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
 * @param {import('./types.js').Specials} [specials]
 */
export const makeDaemon = async (
  powers,
  daemonLabel,
  cancel,
  cancelled,
  specials = {},
) => {
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

  const endoBootstrap = await provideEndoBootstrap(powers, {
    cancel,
    gracePeriodMs,
    gracePeriodElapsed,
    specials,
  });

  await E(endoBootstrap).reviveNetworks();

  return { endoBootstrap, cancelGracePeriod };
};
