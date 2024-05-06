// @ts-check
/// <reference types="ses"/>

/* global setTimeout, clearTimeout */

import { makeExo } from '@endo/exo';
import { E, Far } from '@endo/far';
import { makeMarshal } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { q } from '@endo/errors';
import { makeRefReader } from './ref-reader.js';
import { makeDirectoryMaker } from './directory.js';
import { makeMailboxMaker } from './mail.js';
import { makeGuestMaker } from './guest.js';
import { makeHostMaker } from './host.js';
import { makeRemoteControlProvider } from './remote-control.js';
import { assertPetName } from './pet-name.js';
import { makeContextMaker } from './context.js';
import { assertValidNumber, parseId, formatId } from './formula-identifier.js';
import { makeSerialJobs } from './serial-jobs.js';
import { makeWeakMultimap } from './multimap.js';
import { makeLoopbackNetwork } from './networks/loopback.js';
import { assertValidFormulaType } from './formula-type.js';

// Sorted:
import {
  DaemonFacetForWorkerInterface,
  GuestInterface,
  InspectorHubInterface,
  InspectorInterface,
  InvitationInterface,
  WorkerInterface,
  BlobInterface,
  EndoInterface,
} from './interfaces.js';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef, FarRef } from '@endo/eventual-send' */
/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { Builtins, Context, Controller, DaemonCore, DaemonCoreExternal, DaemonicPowers, DeferredTasks, DirectoryFormula, EndoBootstrap, EndoDirectory, EndoFormula, EndoGateway, EndoGreeter, EndoGuest, EndoHost, EndoInspector, EndoNetwork, EndoPeer, EndoReadable, EndoWorker, EvalFormula, FarContext, Formula, FormulaMakerTable, FormulateResult, GuestFormula, HandleFormula, HostFormula, Invitation, InvitationDeferredTaskParams, InvitationFormula, KnownEndoInspectors, LookupFormula, LoopbackNetworkFormula, MakeBundleFormula, MakeCapletDeferredTaskParams, MakeUnconfinedFormula, PeerFormula, PeerInfo, PetInspectorFormula, PetStore, PetStoreFormula, Provide, ReadableBlobFormula, Sha512, Specials, MarshalFormula, WeakMultimap, WorkerDaemonFacet, WorkerFormula } from './types.js' */

/**
 * @param {number} ms
 * @param {Promise<never>} cancelled
 */
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
 * @returns {EndoInspector} The inspector for the given formula.
 */
const makeInspector = (type, number, record) =>
  makeExo(`Inspector (${type} ${number})`, InspectorInterface, {
    lookup: async petName => {
      if (!Object.hasOwn(record, petName)) {
        return undefined;
      }
      return record[petName];
    },
    list: () => Object.keys(record),
  });

/**
 * @param {Context} context - The context to make far.
 * @returns {FarContext} The far context.
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
 * @param {Sha512} digester
 * @returns {string}
 */
const deriveId = (path, rootNonce, digester) => {
  digester.updateText(rootNonce);
  digester.updateText(path);
  const nonce = digester.digestHex();
  return nonce;
};

/**
 * @param {DaemonicPowers} powers
 * @param {string} rootEntropy
 * @param {object} args
 * @param {(error: Error) => void} args.cancel
 * @param {number} args.gracePeriodMs
 * @param {Specials} args.specials
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
  /** @type {WeakMap<object, ERef<WorkerDaemonFacet>>} */
  const workerDaemonFacets = new WeakMap();
  /**
   * Mutations of the formula graph must be serialized through this queue.
   * "Mutations" include:
   * - Formulation
   * - Removal
   * - Provision
   * - Cancellation
   */
  const formulaGraphJobs = makeSerialJobs();
  // This is the id of the node that is hosting the values.
  // This will likely get replaced with a public key in the future.
  const localNodeId = deriveId('node', rootEntropy, cryptoPowers.makeSha512());
  console.log('Node', localNodeId);

  // We generate formulas for some entities that are presumed to exist
  // because they are parts of the daemon's root object.

  /**
   * @param {string} derivation
   * @param {Formula} formula
   */
  const preformulate = async (derivation, formula) => {
    const formulaId = deriveId(
      derivation,
      rootEntropy,
      cryptoPowers.makeSha512(),
    );
    const id = formatId({
      number: formulaId,
      node: localNodeId,
    });
    await persistencePowers.writeFormula(formulaId, formula);
    return { id, formulaId };
  };

  const { id: knownPeersId } = await preformulate('peers', {
    type: 'known-peers-store',
  });
  const { id: leastAuthorityId } = await preformulate('least-authority', {
    type: 'least-authority',
  });
  const { id: mainWorkerId } = await preformulate('main', { type: 'worker' });

  /** @type {Builtins} */
  const builtins = {
    NONE: leastAuthorityId,
    MAIN: mainWorkerId,
  };

  // Prepare platform formulas
  const platformNames = Object.fromEntries(
    await Promise.all(
      Object.entries(specials).map(async ([specialName, makeFormula]) => {
        const formula = makeFormula(builtins);
        const { id } = await preformulate(specialName, formula);
        return [specialName, id];
      }),
    ),
  );

  // The following are the root state tables for the daemon.

  /**
   * The two functions "formulate" and "provide" share a responsibility for
   * maintaining the memoization tables "controllerForId", "formulaForId", and
   * "idForRef".
   * "formulate" is used for creating and persisting new formulas, whereas
   * "provide" is used for "reincarnating" the values of stored formulas.
   */

  /**
   * Forward look-up, for answering "what is the value of this id".
   * @type {Map<string, Controller>}
   */
  const controllerForId = new Map();

  /**
   * Forward look-up, for answering "what is the formula for this id".
   * @type {Map<string, Formula>}
   */
  const formulaForId = new Map();

  /** @type {WeakMap<{}, string>} */
  const agentIdForHandle = new WeakMap();

  // The following are functions that manage that state.

  /** @param {string} id */
  const getFormulaForId = async id => {
    // No synchronous preamble.
    await null;

    let formula = formulaForId.get(id);
    if (formula !== undefined) {
      return formula;
    }

    formula = await persistencePowers.readFormula(parseId(id).number);
    formulaForId.set(id, formula);
    return formula;
  };

  /** @param {string} id */
  const getTypeForId = async id => {
    if (parseId(id).node !== localNodeId) {
      return 'remote';
    }
    const { type } = await getFormulaForId(id);
    return type;
  };

  /**
   * Reverse look-up, for answering "what is my name for this near or far
   * reference", and not for "what is my name for this promise".
   * @type {WeakMultimap<Record<string | symbol, unknown>, string>}
   */
  const idForRef = makeWeakMultimap();

  /** @type {Map<string, object>} */
  const refForId = new Map();

  /** @type {WeakMultimap<Record<string | symbol, unknown>, string>['get']} */
  const getIdForRef = ref => idForRef.get(ref);

  /** @type {Provide} */
  const provide = (id, _expectedType) =>
    /** @type {any} */ (
      // Behold, unavoidable forward-reference:
      // eslint-disable-next-line no-use-before-define
      provideController(id).value
    );

  // The following concern connections to other daemons.

  const provideRemoteControl = makeRemoteControlProvider(localNodeId);

  /**
   * @param {string} remoteNodeId
   * @param {(error: Error) => void} cancelPeer
   * @param {Promise<never>} peerCancelled
   */
  const providePeer = async (remoteNodeId, cancelPeer, peerCancelled) => {
    const remoteControl = provideRemoteControl(remoteNodeId);
    return remoteControl.connect(
      async () => {
        // eslint-disable-next-line no-use-before-define
        const peerId = await getPeerIdForNodeIdentifier(remoteNodeId);
        return provide(peerId, 'peer');
      },
      cancelPeer,
      peerCancelled,
    );
  };

  // Gateway is equivalent to E's "nonce locator".
  // It provides a value for a formula identifier to a remote client.
  const localGateway = Far('Gateway', {
    /** @param {string} requestedId */
    provide: async requestedId => {
      const { node } = parseId(requestedId);
      if (node !== localNodeId) {
        throw new Error(
          `Gateway can only provide local values. Got request for node ${q(
            node,
          )}`,
        );
      }
      return provide(requestedId);
    },
  });

  /** @type {EndoGreeter} */
  const localGreeter = Far('Greeter', {
    /**
     * @param {string} remoteNodeId
     * @param {Promise<EndoGateway>} remoteGateway
     * @param {ERef<(error: Error) => void>} cancelConnection
     * @param {Promise<never>} connectionCancelled
     */
    hello: async (
      remoteNodeId,
      remoteGateway,
      cancelConnection,
      connectionCancelled,
    ) => {
      const remoteControl = provideRemoteControl(remoteNodeId);
      /** @param {Error} error */
      const wrappedCancel = error => E(cancelConnection)(error);
      remoteControl.accept(remoteGateway, wrappedCancel, connectionCancelled);
      return localGateway;
    },
  });

  /**
   * @param {string} workerId512
   */
  const makeDaemonFacetForWorker = async workerId512 => {
    return makeExo(
      `Endo facet for worker ${workerId512}`,
      DaemonFacetForWorkerInterface,
      {},
    );
  };

  /**
   * @param {string} workerId512
   * @param {Context} context
   */
  const makeIdentifiedWorker = async (workerId512, context) => {
    const daemonWorkerFacet = makeDaemonFacetForWorker(workerId512);

    const { promise: forceCancelled, reject: forceCancel } =
      /** @type {PromiseKit<never>} */ (makePromiseKit());

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

    const worker = makeExo('EndoWorker', WorkerInterface, {});

    workerDaemonFacets.set(worker, workerDaemonFacet);

    return worker;
  };

  /**
   * @param {string} sha512
   */
  const makeReadableBlob = sha512 => {
    const { text, json, streamBase64 } = contentStore.fetch(sha512);
    /** @type {FarRef<EndoReadable>} */
    return makeExo(
      `Readable file with SHA-512 ${sha512.slice(0, 8)}...`,
      BlobInterface,
      {
        sha512: () => sha512,
        streamBase64,
        text,
        json,
      },
    );
  };

  /**
   * @param {string} workerId
   * @param {string} source
   * @param {Array<string>} codeNames
   * @param {Array<string>} ids
   * @param {Context} context
   */
  const makeEval = async (workerId, source, codeNames, ids, context) => {
    context.thisDiesIfThatDies(workerId);
    for (const id of ids) {
      context.thisDiesIfThatDies(id);
    }

    const worker = await provide(workerId, 'worker');
    const workerDaemonFacet = workerDaemonFacets.get(worker);
    assert(workerDaemonFacet, `Cannot evaluate using non-worker`);

    const endowmentValues = await Promise.all(ids.map(id => provide(id)));

    return E(workerDaemonFacet).evaluate(
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
  };

  /**
   * Creates a controller for a `lookup` formula.
   *
   * @param {string} hubId
   * @param {string[]} path
   * @param {Context} context
   */
  const makeLookup = async (hubId, path, context) => {
    context.thisDiesIfThatDies(hubId);

    const hub = provide(hubId, 'hub');
    return E(hub).lookup(...path);
  };

  /**
   * @param {string} workerId
   * @param {string} powersId
   * @param {string} specifier
   * @param {Context} context
   */
  const makeUnconfined = async (workerId, powersId, specifier, context) => {
    context.thisDiesIfThatDies(workerId);
    context.thisDiesIfThatDies(powersId);

    const worker = await provide(workerId, 'worker');
    const workerDaemonFacet = workerDaemonFacets.get(worker);
    assert(workerDaemonFacet, 'Cannot make unconfined plugin with non-worker');
    const powersP = provide(powersId);
    return E(workerDaemonFacet).makeUnconfined(
      specifier,
      // TODO fix type
      /** @type {any} */ (powersP),
      /** @type {any} */ (makeFarContext(context)),
    );
  };

  /**
   * @param {string} workerId
   * @param {string} powersId
   * @param {string} bundleId
   * @param {Context} context
   */
  const makeBundle = async (workerId, powersId, bundleId, context) => {
    context.thisDiesIfThatDies(workerId);
    context.thisDiesIfThatDies(powersId);

    const worker = await provide(workerId, 'worker');
    const workerDaemonFacet = workerDaemonFacets.get(worker);
    assert(workerDaemonFacet, 'Cannot make caplet with non-worker');
    const readableBundleP = provide(bundleId, 'readable-blob');
    const powersP = provide(powersId);
    return E(workerDaemonFacet).makeBundle(
      readableBundleP,
      // TODO fix type
      /** @type {any} */ (powersP),
      /** @type {any} */ (makeFarContext(context)),
    );
  };

  /** @param {object} ref */
  const mustGetIdForRef = ref => {
    const id = idForRef.get(ref);
    if (id === undefined) {
      throw assert.error(assert.details`No corresponding formula for ${ref}`);
    }
    return id;
  };

  /** @param {string} id */
  const mustGetRefForId = id => {
    const ref = refForId.get(id);
    if (ref === undefined) {
      if (formulaForId.get(id) !== undefined) {
        throw assert.error(
          assert.details`Formula has not produced a ref ${id}`,
        );
      }
      throw assert.error(assert.details`Unknown identifier ${id}`);
    }
    return ref;
  };

  const marshaller = makeMarshal(mustGetIdForRef, mustGetRefForId, {
    serializeBodyFormat: 'smallcaps',
  });

  /** @type {FormulaMakerTable} */
  const makers = {
    marshal: async ({ body, slots }) => {
      await Promise.all(slots.map(id => provide(id)));
      return marshaller.fromCapData({ body, slots });
    },
    eval: ({ worker, source, names, values }, context) =>
      makeEval(worker, source, names, values, context),
    'readable-blob': ({ content }) => makeReadableBlob(content),
    lookup: ({ hub, path }, context) => makeLookup(hub, path, context),
    worker: (_formula, context, _id, formulaNumber) =>
      makeIdentifiedWorker(formulaNumber, context),
    'make-unconfined': (
      { worker: workerId, powers: powersId, specifier },
      context,
    ) => makeUnconfined(workerId, powersId, specifier, context),
    'make-bundle': (
      { worker: workerId, powers: powersId, bundle: bundleId },
      context,
    ) => makeBundle(workerId, powersId, bundleId, context),
    host: async (
      {
        handle: handleId,
        petStore: petStoreId,
        inspector: inspectorId,
        worker: workerId,
        endo: endoId,
        networks: networksId,
      },
      context,
      id,
    ) => {
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      const agent = await makeHost(
        id,
        handleId,
        petStoreId,
        inspectorId,
        workerId,
        endoId,
        networksId,
        leastAuthorityId,
        platformNames,
        context,
      );
      const handle = agent.handle();
      agentIdForHandle.set(handle, id);
      return agent;
    },
    guest: async (
      {
        handle: handleId,
        hostAgent: hostAgentId,
        hostHandle: hostHandleId,
        petStore: petStoreId,
        worker: workerId,
      },
      context,
      id,
    ) => {
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      const agent = await makeGuest(
        id,
        handleId,
        hostAgentId,
        hostHandleId,
        petStoreId,
        workerId,
        context,
      );
      const handle = agent.handle();
      agentIdForHandle.set(handle, id);
      return agent;
    },
    handle: async ({ agent: agentId }) => {
      const agent = await provide(agentId, 'agent');
      const handle = agent.handle();
      agentIdForHandle.set(handle, agentId);
      return handle;
    },
    endo: async ({ host: hostId, networks: networksId, peers: peersId }) => {
      /** @type {FarRef<EndoBootstrap>} */
      const endoBootstrap = makeExo('Endo', EndoInterface, {
        ping: async () => 'pong',
        terminate: async () => {
          cancel(new Error('Termination requested'));
        },
        host: () => provide(hostId, 'host'),
        leastAuthority: () => provide(leastAuthorityId, 'guest'),
        greeter: async () => localGreeter,
        gateway: async () => localGateway,
        nodeId: () => localNodeId,
        reviveNetworks: async () => {
          const networksDirectory = await provide(networksId, 'directory');
          const networkIds = await networksDirectory.listIdentifiers();
          await Promise.allSettled(networkIds.map(id => provide(id)));
        },
        addPeerInfo: async peerInfo => {
          const knownPeers = await provide(peersId, 'pet-store');
          const { node: nodeId, addresses } = peerInfo;
          if (knownPeers.has(nodeId)) {
            // We already have this peer.
            // TODO: merge connection info
            return;
          }
          const { id: peerId } =
            // eslint-disable-next-line no-use-before-define
            await formulatePeer(networksId, nodeId, addresses);
          await knownPeers.write(nodeId, peerId);
        },
      });
      return endoBootstrap;
    },
    'loopback-network': () =>
      makeLoopbackNetwork(Promise.resolve(localGateway)),
    'least-authority': () => {
      const disallowedFn = async () => {
        throw new Error('not allowed');
      };
      return /** @type {FarRef<EndoGuest>} */ (
        /** @type {unknown} */ (
          makeExo('EndoGuest', GuestInterface, {
            has: disallowedFn,
            identify: disallowedFn,
            list: disallowedFn,
            followNameChanges: disallowedFn,
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
    },
    'pet-store': (_formula, _context, _id, formulaNumber) =>
      petStorePowers.makeIdentifiedPetStore(
        formulaNumber,
        'pet-store',
        assertPetName,
      ),
    'known-peers-store': (_formula, _context, _id, formulaNumber) =>
      petStorePowers.makeIdentifiedPetStore(
        formulaNumber,
        'known-peers-store',
        // The known peers store is just a pet store that only accepts node identifiers
        // (i.e. formula numbers) as "names".
        assertValidNumber,
      ),
    'pet-inspector': ({ petStore: petStoreId }) =>
      // Behold, unavoidable forward-reference:
      // eslint-disable-next-line no-use-before-define
      makePetStoreInspector(petStoreId),
    directory: ({ petStore: petStoreId }, context) =>
      // Behold, forward-reference:
      // eslint-disable-next-line no-use-before-define
      makeIdentifiedDirectory({
        petStoreId,
        context,
      }),
    peer: (
      { networks: networksId, node: nodeId, addresses: addressesId },
      context,
    ) =>
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      makePeer(networksId, nodeId, addressesId, context),
    invitation: (
      { hostAgent: hostAgentId, hostHandle: hostHandleId, guestName },
      _context,
      id,
    ) =>
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      makeInvitation(id, hostAgentId, hostHandleId, guestName),
  };

  /**
   * @param {string} id
   * @param {string} formulaNumber
   * @param {Formula} formula
   * @param {Context} context
   */
  const evaluateFormula = async (id, formulaNumber, formula, context) => {
    if (Object.hasOwn(makers, formula.type)) {
      const make = makers[formula.type];
      const value = await /** @type {unknown} */ (
        // @ts-expect-error TypeScript is trying too hard to infer the unknown.
        make(formula, context, id, formulaNumber)
      );
      if (typeof value === 'object' && value !== null) {
        // @ts-expect-error TypeScript seems to believe the value might be a string here.
        idForRef.add(value, id);
        refForId.set(id, value);
      }
      return value;
    } else {
      throw new TypeError(`Invalid formula: ${q(formula)}`);
    }
  };

  /**
   * @param {string} id
   * @param {Context} context
   */
  const evaluateFormulaForId = async (id, context) => {
    const { number: formulaNumber, node: formulaNode } = parseId(id);
    const isRemote = formulaNode !== localNodeId;
    if (isRemote) {
      const peer = providePeer(formulaNode, context.cancel, context.cancelled);
      return E(peer).provide(id);
    }

    const formula = await getFormulaForId(id);
    console.log(`Reincarnating ${formula.type} ${id}`);
    assertValidFormulaType(formula.type);

    return evaluateFormula(id, formulaNumber, formula, context);
  };

  /** @type {DaemonCore['formulate']} */
  const formulate = async (formulaNumber, formula) => {
    const id = formatId({
      number: formulaNumber,
      node: localNodeId,
    });

    formulaForId.has(id) && assert.Fail`Formula already exists for id ${id}`;
    formulaForId.set(id, formula);

    // Memoize for lookup.
    console.log(`Making ${formula.type} ${id}`);
    const { promise, resolve } = /** @type {PromiseKit<unknown>} */ (
      makePromiseKit()
    );

    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const context = makeContext(id);
    promise.catch(context.cancel);
    const controller = harden({
      context,
      value: promise,
    });
    controllerForId.set(id, controller);

    // Ensure that failure to flush the formula to storage
    // causes a rejection for both the controller and the value.
    const written = persistencePowers.writeFormula(formulaNumber, formula);
    // The controller _must_ be constructed in the synchronous prelude of this function.
    const valuePromise = evaluateFormula(id, formulaNumber, formula, context);
    resolve(written.then(() => valuePromise));
    await written;

    return harden({
      id,
      value: controller.value,
    });
  };

  /** @type {DaemonCore['provideController']} */
  const provideController = id => {
    let controller = controllerForId.get(id);
    if (controller !== undefined) {
      return controller;
    }

    const { promise, resolve } = /** @type {PromiseKit<unknown>} */ (
      makePromiseKit()
    );

    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const context = makeContext(id);
    promise.catch(context.cancel);
    controller = harden({
      context,
      value: promise,
    });
    controllerForId.set(id, controller);

    // The controller must be in place before we evaluate the formula.
    resolve(evaluateFormulaForId(id, context));

    return controller;
  };

  /**
   * @param {string} nodeId
   * @returns {Promise<string>}
   */
  const getPeerIdForNodeIdentifier = async nodeId => {
    if (nodeId === localNodeId) {
      throw new Error(`Cannot get peer formula identifier for self`);
    }
    const knownPeers = await provide(knownPeersId, 'pet-store');
    const peerId = knownPeers.identifyLocal(nodeId);
    if (peerId === undefined) {
      throw new Error(`No peer found for node identifier ${q(nodeId)}.`);
    }
    return peerId;
  };

  /** @type {DaemonCore['cancelValue']} */
  const cancelValue = async (id, reason) => {
    await formulaGraphJobs.enqueue();
    const controller = provideController(id);
    console.log('Cancelled:');
    return controller.context.cancel(reason);
  };

  /** @type {DaemonCore['formulateReadableBlob']} */
  const formulateReadableBlob = async (readerRef, deferredTasks) => {
    const { formulaNumber, contentSha512 } = await formulaGraphJobs.enqueue(
      async () => {
        const values = {
          formulaNumber: await randomHex512(),
          contentSha512: await contentStore.store(makeRefReader(readerRef)),
        };

        await deferredTasks.execute({
          readableBlobId: formatId({
            number: values.formulaNumber,
            node: localNodeId,
          }),
        });

        return values;
      },
    );

    /** @type {ReadableBlobFormula} */
    const formula = {
      type: 'readable-blob',
      content: contentSha512,
    };

    return /** @type {FormulateResult<FarRef<EndoReadable>>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * @param {string} hostAgentId
   * @param {string} hostHandleId
   * @param {string} guestName
   * @param {DeferredTasks<InvitationDeferredTaskParams>} deferredTasks
   */
  const formulateInvitation = async (
    hostAgentId,
    hostHandleId,
    guestName,
    deferredTasks,
  ) => {
    const identifiers = await formulaGraphJobs.enqueue(async () => {
      const invitationNumber = await randomHex512();
      const invitationId = formatId({
        number: invitationNumber,
        node: localNodeId,
      });
      await deferredTasks.execute({
        invitationId,
      });
      return { invitationNumber };
    });

    /** @type {InvitationFormula} */
    const formula = {
      type: 'invitation',
      hostAgent: hostAgentId,
      hostHandle: hostHandleId,
      guestName,
    };

    return /** @type {FormulateResult<Invitation>} */ (
      formulate(identifiers.invitationNumber, formula)
    );
  };

  /**
   * Unlike other formulate functions, formulateNumberedHandle *only* writes a
   * formula to the formula graph and does not attempt to incarnate it.
   * This is to break an incarnation cycle between agents and their handles.
   * The agent must be incarnated first, contains its own handle object, and
   * produces a agentIdForHandle entry as a side-effect.
   * Explicitly incarnating the handle formula later simply looks up the handle
   * reference on the already-incarnated agent.
   *
   * @param {string} formulaNumber - The formula number of the handle to formulate.
   * @param {string} agentId - The formula identifier of the handle's agent.
   * @returns {Promise<string>}
   */
  const formulateNumberedHandle = async (formulaNumber, agentId) => {
    /** @type {HandleFormula} */
    const formula = {
      type: 'handle',
      agent: agentId,
    };
    await persistencePowers.writeFormula(formulaNumber, formula);
    const id = formatId({
      number: formulaNumber,
      node: localNodeId,
    });
    formulaForId.set(id, formula);
    return id;
  };

  /**
   * Formulates a `pet-store` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {string} formulaNumber - The formula number of the pet store to formulate.
   * @returns {FormulateResult<PetStore>} The formulated pet store.
   */
  const formulateNumberedPetStore = async formulaNumber => {
    /** @type {PetStoreFormula} */
    const formula = {
      type: 'pet-store',
    };
    return /** @type {FormulateResult<PetStore>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * @type {DaemonCore['formulateDirectory']}
   */
  const formulateDirectory = async () => {
    const { id: petStoreId } = await formulateNumberedPetStore(
      await randomHex512(),
    );
    const formulaNumber = await randomHex512();
    /** @type {DirectoryFormula} */
    const formula = {
      type: 'directory',
      petStore: petStoreId,
    };
    return /** @type {FormulateResult<EndoDirectory>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * Formulates a `worker` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {string} formulaNumber - The worker formula number.
   * @returns {ReturnType<DaemonCore['formulateWorker']>}
   */
  const formulateNumberedWorker = formulaNumber => {
    /** @type {WorkerFormula} */
    const formula = {
      type: 'worker',
    };

    return /** @type {FormulateResult<EndoWorker>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * @type {DaemonCore['formulateWorker']}
   */
  const formulateWorker = async deferredTasks => {
    return formulateNumberedWorker(
      await formulaGraphJobs.enqueue(async () => {
        const formulaNumber = await randomHex512();

        await deferredTasks.execute({
          workerId: formatId({
            number: formulaNumber,
            node: localNodeId,
          }),
        });

        return formulaNumber;
      }),
    );
  };

  /**
   * @type {DaemonCore['formulateHostDependencies']}
   */
  const formulateHostDependencies = async specifiedIdentifiers => {
    const { specifiedWorkerId, ...remainingSpecifiedIdentifiers } =
      specifiedIdentifiers;

    const storeId = (await formulateNumberedPetStore(await randomHex512())).id;

    const hostFormulaNumber = await randomHex512();
    const hostId = formatId({
      number: hostFormulaNumber,
      node: localNodeId,
    });

    const handleId = await formulateNumberedHandle(
      await randomHex512(),
      hostId,
    );

    return harden({
      ...remainingSpecifiedIdentifiers,
      hostFormulaNumber,
      hostId,
      handleId,
      storeId,
      /* eslint-disable no-use-before-define */
      inspectorId: (
        await formulateNumberedPetInspector(await randomHex512(), storeId)
      ).id,
      workerId: await provideWorkerId(specifiedWorkerId),
      /* eslint-enable no-use-before-define */
    });
  };

  /** @type {DaemonCore['formulateNumberedHost']} */
  const formulateNumberedHost = identifiers => {
    /** @type {HostFormula} */
    const formula = {
      type: 'host',
      handle: identifiers.handleId,
      petStore: identifiers.storeId,
      inspector: identifiers.inspectorId,
      worker: identifiers.workerId,
      endo: identifiers.endoId,
      networks: identifiers.networksDirectoryId,
    };

    return /** @type {FormulateResult<EndoHost>} */ (
      formulate(identifiers.hostFormulaNumber, formula)
    );
  };

  /** @type {DaemonCore['formulateHost']} */
  const formulateHost = async (
    endoId,
    networksDirectoryId,
    deferredTasks,
    specifiedWorkerId,
  ) => {
    return formulateNumberedHost(
      await formulaGraphJobs.enqueue(async () => {
        const identifiers = await formulateHostDependencies({
          endoId,
          networksDirectoryId,
          specifiedWorkerId,
        });

        await deferredTasks.execute({
          agentId: identifiers.hostId,
          handleId: identifiers.handleId,
        });

        return identifiers;
      }),
    );
  };

  /** @type {DaemonCore['formulateGuestDependencies']} */
  const formulateGuestDependencies = async (hostAgentId, hostHandleId) => {
    const guestFormulaNumber = await randomHex512();
    const guestId = formatId({
      number: guestFormulaNumber,
      node: localNodeId,
    });
    const handleId = await formulateNumberedHandle(
      await randomHex512(),
      guestId,
    );
    return harden({
      guestFormulaNumber,
      guestId,
      handleId,
      hostAgentId,
      hostHandleId,
      storeId: (await formulateNumberedPetStore(await randomHex512())).id,
      workerId: (await formulateNumberedWorker(await randomHex512())).id,
    });
  };

  /** @type {DaemonCore['formulateNumberedGuest']} */
  const formulateNumberedGuest = identifiers => {
    /** @type {GuestFormula} */
    const formula = {
      type: 'guest',
      handle: identifiers.handleId,
      hostHandle: identifiers.hostHandleId,
      hostAgent: identifiers.hostAgentId,
      petStore: identifiers.storeId,
      worker: identifiers.workerId,
    };

    return /** @type {FormulateResult<EndoGuest>} */ (
      formulate(identifiers.guestFormulaNumber, formula)
    );
  };

  /** @type {DaemonCore['formulateGuest']} */
  const formulateGuest = async (hostAgentId, hostHandleId, deferredTasks) => {
    return formulateNumberedGuest(
      await formulaGraphJobs.enqueue(async () => {
        const identifiers = await formulateGuestDependencies(
          hostAgentId,
          hostHandleId,
        );

        await deferredTasks.execute({
          agentId: identifiers.guestId,
          handleId: identifiers.handleId,
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
    const workerFormulation =
      await formulateNumberedWorker(workerFormulaNumber);
    return workerFormulation.id;
  };

  /** @type {DaemonCore['formulateMarshalValue']} */
  const formulateMarshalValue = async (value, deferredTasks) => {
    const { marshalFormulaNumber } = await formulaGraphJobs.enqueue(
      async () => {
        const ownFormulaNumber = await randomHex512();
        const ownId = formatId({
          number: ownFormulaNumber,
          node: localNodeId,
        });

        const identifiers = harden({
          marshalId: ownId,
          marshalFormulaNumber: ownFormulaNumber,
        });

        await deferredTasks.execute(identifiers);
        return identifiers;
      },
    );

    const { body, slots } = marshaller.toCapData(value);

    /** @type {MarshalFormula} */
    const formula = {
      type: 'marshal',
      body,
      slots,
    };
    return /** @type {FormulateResult<void>} */ (
      formulate(marshalFormulaNumber, formula)
    );
  };

  /** @type {DaemonCore['formulateEval']} */
  const formulateEval = async (
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
          node: localNodeId,
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
                  await formulateNumberedLookup(
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

    /** @type {EvalFormula} */
    const formula = {
      type: 'eval',
      worker: workerId,
      source,
      names: codeNames,
      values: endowmentIds,
    };
    return /** @type {FormulateResult<unknown>} */ (
      formulate(evalFormulaNumber, formula)
    );
  };

  /**
   * Formulates a `lookup` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   * @param {string} formulaNumber - The lookup formula's number.
   * @param {string} hubId - The formula identifier of the naming
   * hub to call `lookup` on. A "naming hub" is an objected with a variadic
   * lookup method. It includes objects such as guests and hosts.
   * @param {string[]} petNamePath - The pet name path to look up.
   * @returns {Promise<{ id: string, value: EndoWorker }>}
   */
  const formulateNumberedLookup = (formulaNumber, hubId, petNamePath) => {
    /** @type {LookupFormula} */
    const formula = {
      type: 'lookup',
      hub: hubId,
      path: petNamePath,
    };

    return /** @type {FormulateResult<EndoWorker>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * @param {string} hostAgentId
   * @param {string} hostHandleId
   * @param {string} [specifiedPowersId]
   */
  const providePowersId = async (
    hostAgentId,
    hostHandleId,
    specifiedPowersId,
  ) => {
    await null;
    if (typeof specifiedPowersId === 'string') {
      return specifiedPowersId;
    }

    const guestFormulationData = await formulateGuestDependencies(
      hostAgentId,
      hostHandleId,
    );
    const guestFormulation = await formulateNumberedGuest(guestFormulationData);
    return guestFormulation.id;
  };

  /**
   * Helper for `formulateUnconfined` and `formulateBundle`.
   * @param {string} hostAgentId
   * @param {string} hostHandleId
   * @param {DeferredTasks<MakeCapletDeferredTaskParams>} deferredTasks
   * @param {string} [specifiedWorkerId]
   * @param {string} [specifiedPowersId]
   */
  const formulateCapletDependencies = async (
    hostAgentId,
    hostHandleId,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
  ) => {
    const ownFormulaNumber = await randomHex512();
    const identifiers = harden({
      powersId: await providePowersId(
        hostAgentId,
        hostHandleId,
        specifiedPowersId,
      ),
      capletId: formatId({
        number: ownFormulaNumber,
        node: localNodeId,
      }),
      capletFormulaNumber: ownFormulaNumber,
      workerId: await provideWorkerId(specifiedWorkerId),
    });
    await deferredTasks.execute(identifiers);
    return identifiers;
  };

  /** @type {DaemonCore['formulateUnconfined']} */
  const formulateUnconfined = async (
    hostAgentId,
    hostHandleId,
    specifier,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
  ) => {
    const { powersId, capletFormulaNumber, workerId } =
      await formulaGraphJobs.enqueue(() =>
        formulateCapletDependencies(
          hostAgentId,
          hostHandleId,
          deferredTasks,
          specifiedWorkerId,
          specifiedPowersId,
        ),
      );

    /** @type {MakeUnconfinedFormula} */
    const formula = {
      type: 'make-unconfined',
      worker: workerId,
      powers: powersId,
      specifier,
    };
    return formulate(capletFormulaNumber, formula);
  };

  /** @type {DaemonCore['formulateBundle']} */
  const formulateBundle = async (
    hostAgentId,
    hostHandleId,
    bundleId,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
  ) => {
    const { powersId, capletFormulaNumber, workerId } =
      await formulaGraphJobs.enqueue(() =>
        formulateCapletDependencies(
          hostAgentId,
          hostHandleId,
          deferredTasks,
          specifiedWorkerId,
          specifiedPowersId,
        ),
      );

    /** @type {MakeBundleFormula} */
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
  const formulateNumberedPetInspector = (formulaNumber, petStoreId) => {
    /** @type {PetInspectorFormula} */
    const formula = {
      type: 'pet-inspector',
      petStore: petStoreId,
    };
    return /** @type {FormulateResult<EndoInspector>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /** @type {DaemonCore['formulatePeer']} */
  const formulatePeer = async (networksDirectoryId, nodeId, addresses) => {
    const formulaNumber = await randomHex512();
    // TODO: validate addresses
    // TODO: mutable state like addresses should not be stored in formula
    /** @type {PeerFormula} */
    const formula = {
      type: 'peer',
      networks: networksDirectoryId,
      node: nodeId,
      addresses,
    };
    return /** @type {FormulateResult<EndoPeer>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /** @type {DaemonCore['formulateLoopbackNetwork']} */
  const formulateLoopbackNetwork = async () => {
    const formulaNumber = await randomHex512();
    /** @type {LoopbackNetworkFormula} */
    const formula = {
      type: 'loopback-network',
    };
    return /** @type {FormulateResult<EndoNetwork>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /** @type {DaemonCore['formulateNetworksDirectory']} */
  const formulateNetworksDirectory = async () => {
    const { id, value } = await formulateDirectory();
    // Make default networks.
    const { id: loopbackNetworkId } = await formulateLoopbackNetwork();
    await E(value).write(['loop'], loopbackNetworkId);
    return { id, value };
  };

  /** @type {DaemonCore['formulateEndo']} */
  const formulateEndo = async specifiedFormulaNumber => {
    const identifiers = await formulaGraphJobs.enqueue(async () => {
      const formulaNumber = await (specifiedFormulaNumber ?? randomHex512());
      const endoId = formatId({
        number: formulaNumber,
        node: localNodeId,
      });

      const { id: defaultHostWorkerId } = await formulateNumberedWorker(
        await randomHex512(),
      );
      const { id: networksDirectoryId } = await formulateNetworksDirectory();

      // Ensure the default host is formulated and persisted.
      const { id: defaultHostId } = await formulateNumberedHost(
        await formulateHostDependencies({
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

    /** @type {EndoFormula} */
    const formula = {
      type: 'endo',
      networks: identifiers.networksDirectoryId,
      peers: knownPeersId,
      host: identifiers.defaultHostId,
      leastAuthority: leastAuthorityId,
    };

    return /** @type {FormulateResult<FarRef<EndoBootstrap>>} */ (
      formulate(identifiers.formulaNumber, formula)
    );
  };

  /**
   * @param {string} networksDirectoryId
   * @returns {Promise<EndoNetwork[]>}
   */
  const getAllNetworks = async networksDirectoryId => {
    const networksDirectory = await provide(networksDirectoryId, 'directory');
    const networkIds = await networksDirectory.listIdentifiers();
    const networks = await Promise.all(
      networkIds.map(id => provide(id, 'network')),
    );
    return networks;
  };

  /** @type {DaemonCore['getAllNetworkAddresses']} */
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
   * @param {string} nodeId
   * @param {string[]} addresses
   * @param {Context} context
   */
  const makePeer = async (networksDirectoryId, nodeId, addresses, context) => {
    const remoteControl = provideRemoteControl(nodeId);
    return remoteControl.connect(
      async () => {
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
              return E(network).connect(address, makeFarContext(context));
            }
          }
        }
        throw new Error('Cannot connect to peer: no supported addresses');
      },
      context.cancel,
      context.cancelled,
    );
  };

  /**
   * @param {string} id
   * @param {string} hostAgentId
   * @param {string} hostHandleId
   * @param {string} guestName
   */
  const makeInvitation = async (id, hostAgentId, hostHandleId, guestName) => {
    const hostAgent = /** @type {EndoHost} */ (await provide(hostAgentId));

    const locate = async () => {
      const { node, addresses } = await hostAgent.getPeerInfo();
      const { number: hostHandleNumber } = parseId(hostHandleId);
      const { number } = parseId(id);
      const url = new URL('endo://');
      url.hostname = node;
      url.searchParams.set('id', number);
      url.searchParams.set('from', hostHandleNumber);
      for (const address of addresses) {
        url.searchParams.append('at', address);
      }
      return url.href;
    };

    /**
     * @param {string} guestHandleLocator
     */
    const accept = async guestHandleLocator => {
      const url = new URL(guestHandleLocator);
      const guestHandleNumber = url.searchParams.get('id');
      const addresses = url.searchParams.getAll('at');
      const guestNodeNumber = url.hostname;

      if (!guestHandleNumber) {
        throw assert.error('Handle locator must have an "id" parameter');
      }

      const guestHandleId = formatId({
        node: guestNodeNumber,
        number: guestHandleNumber,
      });

      /** @type {PeerInfo} */
      const peerInfo = {
        node: guestNodeNumber,
        addresses,
      };
      await hostAgent.addPeerInfo(peerInfo);

      // TODO ensure that this is sufficient to cancel the previous
      // incarnation, this invitation, such that it can no longer be redeemed,
      // and such that overwriting the invitation also revokes the invitation.
      await formulaGraphJobs.enqueue();
      const controller = provideController(id);
      console.log('Cancelled:');
      await controller.context.cancel(new Error('Invitation accepted'));

      await E(hostAgent).write([guestName], guestHandleId);

      return provide(guestHandleId);
    };

    return makeExo('Invitation', InvitationInterface, { accept, locate });
  };

  const makeContext = makeContextMaker({
    controllerForId,
    provideController,
  });

  const { makeIdentifiedDirectory, makeDirectoryNode } = makeDirectoryMaker({
    provide,
    getIdForRef,
    getTypeForId,
    formulateDirectory,
  });

  const makeMailbox = makeMailboxMaker({ provide });

  const makeGuest = makeGuestMaker({
    provide,
    makeMailbox,
    makeDirectoryNode,
  });

  const makeHost = makeHostMaker({
    provide,
    provideController,
    cancelValue,
    formulateWorker,
    formulateHost,
    formulateGuest,
    formulateMarshalValue,
    formulateEval,
    formulateUnconfined,
    formulateBundle,
    formulateReadableBlob,
    formulateInvitation,
    makeMailbox,
    makeDirectoryNode,
    getAllNetworkAddresses,
    localNodeId,
  });

  /**
   * Creates an inspector for the current agent's pet store, used to create
   * inspectors for values therein. Notably, can provide references to otherwise
   * un-nameable values such as the `MAIN` worker. See `KnownEndoInspectors` for
   * more details.
   *
   * @param {string} petStoreId
   * @returns {Promise<EndoInspector>}
   */
  const makePetStoreInspector = async petStoreId => {
    const petStore = await provide(petStoreId, 'pet-store');

    /**
     * @param {string} petName - The pet name to inspect.
     * @returns {Promise<KnownEndoInspectors[string]>} An
     * inspector for the value of the given pet name.
     */
    const lookup = async petName => {
      const id = petStore.identifyLocal(petName);
      if (id === undefined) {
        throw new Error(`Unknown pet name ${petName}`);
      }
      const { number: formulaNumber } = parseId(id);
      const formula = await getFormulaForId(id);
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
            worker: provide(formula.worker, 'worker'),
          }),
        );
      } else if (formula.type === 'lookup') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            hub: provide(formula.hub, 'hub'),
            path: formula.path,
          }),
        );
      } else if (formula.type === 'guest') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            hostAgent: provide(formula.hostAgent, 'host'),
            hostHandle: provide(formula.hostHandle, 'handle'),
          }),
        );
      } else if (formula.type === 'make-bundle') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            bundle: provide(formula.bundle, 'readable-blob'),
            powers: provide(formula.powers),
            worker: provide(formula.worker, 'worker'),
          }),
        );
      } else if (formula.type === 'make-unconfined') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            powers: provide(formula.powers),
            specifier: formula.type,
            worker: provide(formula.worker, 'worker'),
          }),
        );
      } else if (formula.type === 'peer') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            NODE: formula.node,
            ADDRESSES: formula.addresses,
          }),
        );
      }
      return makeInspector(formula.type, formulaNumber, harden({}));
    };

    /** @returns {string[]} The list of all names in the pet store. */
    const list = () => petStore.list();

    const info = makeExo('EndoInspectorHub', InspectorHubInterface, {
      lookup,
      list,
    });

    return info;
  };

  /** @type {DaemonCoreExternal} */
  return {
    formulateEndo,
    provide,
    nodeId: localNodeId,
  };
};

/**
 * @param {DaemonicPowers} powers
 * @param {object} args
 * @param {(error: Error) => void} args.cancel
 * @param {number} args.gracePeriodMs
 * @param {Promise<never>} args.gracePeriodElapsed
 * @param {Specials} args.specials
 * @returns {Promise<FarRef<EndoBootstrap>>}
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
      node: daemonCore.nodeId,
    });
    return /** @type {Promise<FarRef<EndoBootstrap>>} */ (
      daemonCore.provide(endoId)
    );
  } else {
    const { value: endoBootstrap } =
      await daemonCore.formulateEndo(endoFormulaNumber);
    return endoBootstrap;
  }
};

/**
 * @param {DaemonicPowers} powers
 * @param {string} daemonLabel
 * @param {(error: Error) => void} cancel
 * @param {Promise<never>} cancelled
 * @param {Specials} [specials]
 */
export const makeDaemon = async (
  powers,
  daemonLabel,
  cancel,
  cancelled,
  specials = {},
) => {
  const { promise: gracePeriodCancelled, reject: cancelGracePeriod } =
    /** @type {PromiseKit<never>} */ (makePromiseKit());

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
