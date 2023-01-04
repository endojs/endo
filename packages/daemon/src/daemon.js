// @ts-check
/// <reference types="ses"/>

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeNetstringCapTP } from './connection.js';
import { makeRefReader } from './ref-reader.js';
import { makeReaderRef } from './reader-ref.js';

const { quote: q } = assert;

const validNamePattern = /^[a-zA-Z][a-zA-Z0-9]{0,127}$/;

/**
 * @param {import('./types.js').DaemonicPowers} powers
 * @param {import('../index.js').Locator} locator
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
  const pets = new Map();
  /** @type {Map<string, unknown>} */
  const values = new Map();
  /** @type {WeakMap<object, import('@endo/eventual-send').ERef<import('./worker.js').WorkerBootstrap>>} */
  const workerBootstraps = new WeakMap();

  const petNameDirectoryPath = powers.joinPath(locator.statePath, 'pet-name');

  /**
   * @param {string} sha512
   */
  const makeReadableSha512 = sha512 => {
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
   * @param {string} sha512
   */
  const provideReadableSha512 = sha512 => {
    // TODO Contemplate using a different map for storage.
    // For the moment, there's no risk of a UUID colliding with a SHA512.
    let readable = values.get(sha512);
    if (readable === undefined) {
      readable = makeReadableSha512(sha512);
      values.set(sha512, readable);
    }
    return readable;
  };

  /**
   * @param {import('@endo/eventual-send').ERef<AsyncIterableIterator<string>>} readerRef
   * @param {string} [name]
   */
  const store = async (readerRef, name) => {
    if (name !== undefined) {
      if (!validNamePattern.test(name)) {
        throw new Error(`Invalid pet name ${q(name)}`);
      }
    }

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
    const storageUuid = powers.randomUuid();
    const temporaryStoragePath = powers.joinPath(
      storageDirectoryPath,
      storageUuid,
    );
    const writer = powers.makeFileWriter(temporaryStoragePath);
    for await (const chunk of makeRefReader(readerRef)) {
      await writer.next(chunk);
      digester.update(chunk);
    }
    await writer.return(undefined);
    const sha512 = digester.digestHex();

    // Retain the pet name first (to win a garbage collection race)
    if (name !== undefined) {
      await powers.makePath(petNameDirectoryPath);
      const petNamePath = powers.joinPath(petNameDirectoryPath, `${name}.json`);
      await powers.writeFileText(
        petNamePath,
        `${JSON.stringify({
          type: 'readableSha512',
          readableSha512: sha512,
        })}\n`,
      );
    }

    // Finish with an atomic rename.
    const storagePath = powers.joinPath(storageDirectoryPath, sha512);
    await powers.renamePath(temporaryStoragePath, storagePath);
    return makeReadableSha512(sha512);
  };

  /**
   * @param {string} workerUuid
   */
  const makeWorkerBootstrap = async workerUuid => {
    return Far(`Endo for worker ${workerUuid}`, {});
  };

  /**
   * @param {string} workerUuid
   * @param {string} [workerName]
   */
  const makeWorkerUuid = async (workerUuid, workerName) => {
    const workerCachePath = powers.joinPath(
      locator.cachePath,
      'worker-uuid',
      workerUuid,
    );
    const workerStatePath = powers.joinPath(
      locator.statePath,
      'worker-uuid',
      workerUuid,
    );
    const workerEphemeralStatePath = powers.joinPath(
      locator.ephemeralStatePath,
      'worker-uuid',
      workerUuid,
    );

    await Promise.all([
      powers.makePath(workerStatePath),
      powers.makePath(workerEphemeralStatePath),
    ]);

    if (workerName !== undefined) {
      await powers.makePath(petNameDirectoryPath);
      const petNamePath = powers.joinPath(
        petNameDirectoryPath,
        `${workerName}.json`,
      );
      await powers.writeFileText(
        petNamePath,
        `${JSON.stringify({
          type: 'workerUuid',
          workerUuid,
        })}\n`,
      );
    }

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
      workerUuid,
      powers.endoWorkerPath,
      logPath,
      workerPidPath,
      locator.sockPath,
      workerStatePath,
      workerEphemeralStatePath,
      workerCachePath,
      workerCancelled,
    );

    console.log(`Endo worker started PID ${workerPid} UUID ${workerUuid}`);

    const { getBootstrap, closed: capTpClosed } = makeNetstringCapTP(
      `Worker ${workerUuid}`,
      writer,
      reader,
      gracePeriodElapsed,
      makeWorkerBootstrap(workerUuid),
    );

    const closed = Promise.race([workerClosed, capTpClosed]).finally(() => {
      console.log(`Endo worker stopped PID ${workerPid} UUID ${workerUuid}`);
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

      /**
       * @param {string} source
       * @param {Array<string>} codeNames
       * @param {Array<string>} petNames
       * @param {string} resultName
       */
      evaluate: async (source, codeNames, petNames, resultName) => {
        if (!validNamePattern.test(resultName)) {
          throw new Error(`Invalid pet name ${q(resultName)}`);
        }
        if (petNames.length !== codeNames.length) {
          throw new Error('Evaluator requires one pet name for each code name');
          // TODO and they must all be strings. Use pattern language.
        }

        await powers.makePath(petNameDirectoryPath);
        const refs = Object.fromEntries(
          await Promise.all(
            petNames.map(async (endowmentPetName, index) => {
              const endowmentCodeName = codeNames[index];
              const petNamePath = powers.joinPath(
                petNameDirectoryPath,
                `${endowmentPetName}.json`,
              );
              const petNameText = await powers.readFileText(petNamePath);
              try {
                // TODO validate
                /** @type {[string, import('./types.js').Ref]} */
                return [endowmentCodeName, JSON.parse(petNameText)];
              } catch (error) {
                throw new TypeError(
                  `Corrupt pet name description for ${endowmentPetName}: ${error.message}`,
                );
              }
            }),
          ),
        );

        const ref = {
          /** @type {'eval'} */
          type: 'eval',
          workerUuid,
          source,
          refs,
        };
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        return makeRef(ref, resultName);
      },
    });

    workerBootstraps.set(worker, workerBootstrap);

    return worker;
  };

  /**
   * @param {string} workerUuid
   * @param {string} [name]
   */
  const provideWorkerUuid = async (workerUuid, name) => {
    let worker =
      /** @type {import('@endo/eventual-send').ERef<ReturnType<makeWorkerUuid>>} */ (
        values.get(workerUuid)
      );
    if (worker === undefined) {
      worker = makeWorkerUuid(workerUuid, name);
      values.set(workerUuid, worker);
    }
    return worker;
  };

  /**
   * @param {string} workerUuid
   * @param {string} source
   * @param {Record<string, import('./types.js').Ref>} refs
   */
  const provideEval = async (workerUuid, source, refs) => {
    const workerFacet = await provideWorkerUuid(workerUuid);
    const workerBootstrap = workerBootstraps.get(workerFacet);
    assert(workerBootstrap);
    const codeNames = Object.keys(refs);
    const endowmentValues = await Promise.all(
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      Object.values(refs).map(ref => provideRef(ref)),
    );
    return E(workerBootstrap).evaluate(source, codeNames, endowmentValues);
  };

  /**
   * @param {string} valueUuid
   */
  const makeValueUuid = async valueUuid => {
    const valuesDirectoryPath = powers.joinPath(
      locator.statePath,
      'value-uuid',
    );
    const valuePath = powers.joinPath(valuesDirectoryPath, `${valueUuid}.json`);
    const refText = await powers.readFileText(valuePath);
    const ref = (() => {
      try {
        return JSON.parse(refText);
      } catch (error) {
        throw new TypeError(
          `Corrupt description for value to be derived according to file ${valuePath}: ${error.message}`,
        );
      }
    })();
    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    return provideRef(ref);
  };

  /**
   * @param {string} valueUuid
   */
  const provideValueUuid = async valueUuid => {
    let value = values.get(valueUuid);
    if (value === undefined) {
      value = makeValueUuid(valueUuid);
      values.set(valueUuid, value);
    }
    return value;
  };

  /**
   * @param {import('./types.js').Ref} ref
   */
  const provideRef = async ref => {
    if (ref.type === 'readableSha512') {
      return provideReadableSha512(ref.readableSha512);
    } else if (ref.type === 'workerUuid') {
      return provideWorkerUuid(ref.workerUuid);
    } else if (ref.type === 'valueUuid') {
      return provideValueUuid(ref.valueUuid);
    } else if (ref.type === 'eval') {
      return provideEval(ref.workerUuid, ref.source, ref.refs);
    } else {
      throw new TypeError(`Invalid reference: ${JSON.stringify(ref)}`);
    }
  };

  /**
   * @param {import('./types.js').Ref} ref
   * @param {string} [petName]
   */
  const makeRef = async (ref, petName) => {
    const value = await provideRef(ref);
    if (petName !== undefined) {
      const valueUuid = powers.randomUuid();

      // Persist instructions for revival (this can be collected)
      const valuesDirectoryPath = powers.joinPath(
        locator.statePath,
        'value-uuid',
      );
      await powers.makePath(valuesDirectoryPath);
      const valuePath = powers.joinPath(
        valuesDirectoryPath,
        `${valueUuid}.json`,
      );
      await powers.writeFileText(valuePath, `${JSON.stringify(ref)}\n`);

      // Make a reference by pet name (this can be overwritten)
      await powers.makePath(petNameDirectoryPath);
      const petNamePath = powers.joinPath(
        petNameDirectoryPath,
        `${petName}.json`,
      );
      await powers.writeFileText(
        petNamePath,
        `${JSON.stringify({
          type: 'valueUuid',
          valueUuid,
        })}\n`,
      );

      values.set(valueUuid, value);
    }
    return value;
  };

  /**
   * @param {string} refPath
   */
  const provideRefPath = async refPath => {
    const refText = await powers.readFileText(refPath).catch(() => {
      // TODO handle EMFILE gracefully
      throw new ReferenceError(`No reference exists at path ${refPath}`);
    });
    const ref = (() => {
      try {
        return JSON.parse(refText);
      } catch (error) {
        throw new TypeError(
          `Corrupt description for reference in file ${refPath}: ${error.message}`,
        );
      }
    })();
    // TODO validate
    return provideRef(ref);
  };

  /**
   * @param {string} name
   */
  const revive = async name => {
    const petNamePath = powers.joinPath(petNameDirectoryPath, `${name}.json`);
    return provideRefPath(petNamePath).catch(error => {
      throw new Error(`Corrupt pet name ${name}: ${error.message}`);
    });
  };

  /**
   * @param {string} name
   */
  const provide = async name => {
    if (!validNamePattern.test(name)) {
      throw new Error(`Invalid pet name ${q(name)}`);
    }

    let pet = pets.get(name);
    if (pet === undefined) {
      pet = revive(name);
      pets.set(name, pet);
    }
    return pet;
  };

  return Far('Endo private facet', {
    // TODO for user named

    ping: async () => 'pong',

    terminate: async () => {
      cancel(new Error('Termination requested'));
    },

    /**
     * @param {string} [name]
     */
    makeWorker: async name => {
      // @ts-ignore Node.js crypto does in fact have randomUUID.
      const workerUuid = powers.randomUuid();
      return provideWorkerUuid(workerUuid, name);
    },

    store,
    provide,
  });
};

/**
 * @param {import('./types.js').DaemonicPowers} powers
 * @param {import('../index.js').Locator} locator
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
