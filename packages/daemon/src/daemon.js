// @ts-check
/// <reference types="ses"/>
/* global process, setTimeout, clearTimeout */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
import '@endo/lockdown/commit.js';

import crypto from 'crypto';
import net from 'net';
import fs from 'fs';
import path from 'path';
import popen from 'child_process';
import url from 'url';

import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';
import { makeNodeNetstringCapTP } from './connection.js';
import { makeRefReader } from './ref-reader.js';
import { makeReaderRef } from './reader-ref.js';

const { quote: q } = assert;

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

const validNamePattern = /^[a-z][a-z0-9]*$/;

const endoWorkerPath = url.fileURLToPath(new URL('worker.js', import.meta.url));

/** @param {Error} error */
const sinkError = error => {
  console.error(error);
};

/**
 * @param {import('../index.js').Locator} locator
 * @param {object} args
 * @param {Promise<never>} args.cancelled
 * @param {(error: Error) => void} args.cancel
 * @param {Promise<never>} args.gracePeriodElapsed
 */
const makeEndoBootstrap = (
  locator,
  { cancelled, cancel, gracePeriodElapsed },
) => {
  /** @type {Map<string, unknown>} */
  const pets = new Map();
  /** @type {Map<string, unknown>} */
  const values = new Map();

  /**
   * @param {string} sha512
   */
  const makeReadableSha512 = sha512 => {
    const storageDirectoryPath = path.join(locator.statePath, 'store-sha512');
    const storagePath = path.join(storageDirectoryPath, sha512);
    const stream = () => {
      const nodeReadStream = fs.createReadStream(storagePath);
      const reader = makeNodeReader(nodeReadStream);
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

    const storageDirectoryPath = path.join(locator.statePath, 'store-sha512');
    await fs.promises.mkdir(storageDirectoryPath, { recursive: true });

    // Pump the reader into a temporary file and hash.
    // We use a temporary file to avoid leaving a partially writen object,
    // but also because we won't know the name we will use until we've
    // completed the hash.
    const digester = crypto.createHash('sha512');
    const storageUuid = crypto.randomUUID();
    const temporaryStoragePath = path.join(storageDirectoryPath, storageUuid);
    const nodeWriteStream = fs.createWriteStream(temporaryStoragePath);
    const writer = makeNodeWriter(nodeWriteStream);
    for await (const chunk of makeRefReader(readerRef)) {
      await writer.next(chunk);
      digester.update(chunk);
    }
    await writer.return(undefined);
    const sha512 = digester.digest('hex');

    // Retain the pet name first (to win a garbage collection race)
    if (name !== undefined) {
      const petNameDirectoryPath = path.join(locator.statePath, 'pet-name');
      await fs.promises.mkdir(petNameDirectoryPath, { recursive: true });
      const petNamePath = path.join(petNameDirectoryPath, `${name}.json`);
      await fs.promises.writeFile(
        petNamePath,
        `${JSON.stringify({
          type: 'readableSha512',
          readableSha512: sha512,
        })}\n`,
      );
    }

    // Finish with an atomic rename.
    const storagePath = path.join(storageDirectoryPath, sha512);
    await fs.promises.rename(temporaryStoragePath, storagePath);
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
    const workerCachePath = path.join(
      locator.cachePath,
      'worker-uuid',
      workerUuid,
    );
    const workerStatePath = path.join(
      locator.statePath,
      'worker-uuid',
      workerUuid,
    );
    const workerEphemeralStatePath = path.join(
      locator.ephemeralStatePath,
      'worker-uuid',
      workerUuid,
    );

    await fs.promises.mkdir(workerCachePath, { recursive: true });
    await fs.promises.mkdir(workerStatePath, { recursive: true });
    await fs.promises.mkdir(workerEphemeralStatePath, { recursive: true });

    if (workerName !== undefined) {
      const petNameDirectoryPath = path.join(locator.statePath, 'pet-name');
      await fs.promises.mkdir(petNameDirectoryPath, { recursive: true });
      const petNamePath = path.join(petNameDirectoryPath, `${workerName}.json`);
      await fs.promises.writeFile(
        petNamePath,
        `${JSON.stringify({
          type: 'workerUuid',
          workerUuid,
        })}\n`,
      );
    }

    const logPath = path.join(workerStatePath, 'worker.log');
    const output = fs.openSync(logPath, 'a');
    const child = popen.fork(
      endoWorkerPath,
      [workerUuid, workerStatePath, workerEphemeralStatePath, workerCachePath],
      {
        stdio: ['ignore', output, output, 'pipe', 'ipc'],
      },
    );
    console.error(`Endo worker started PID ${child.pid} UUID ${workerUuid}`);
    const stream = /** @type {import('stream').Duplex} */ (child.stdio[3]);
    assert(stream);
    const { getBootstrap, closed } = makeNodeNetstringCapTP(
      `Worker ${workerUuid}`,
      stream,
      stream,
      cancelled,
      makeWorkerBootstrap(workerUuid),
    );

    const workerPidPath = path.join(workerEphemeralStatePath, 'worker.pid');
    await fs.promises.writeFile(workerPidPath, `${child.pid}\n`);

    const workerBootstrap = getBootstrap();

    const exited = new Promise(resolve => {
      child.on('exit', () => {
        console.error(
          `Endo worker stopped PID ${child.pid} UUID ${workerUuid}`,
        );
        resolve(undefined);
      });
    });

    const exitedAndClosed = Promise.all([exited, closed]);

    const { reject: cancelWorker, promise: workerCancelled } = makePromiseKit();

    cancelled.catch(async error => cancelWorker(error));

    workerCancelled.then(async () => {
      const terminated = E(workerBootstrap).terminate();
      await Promise.race([gracePeriodElapsed, exitedAndClosed, terminated]);
      child.kill();
    });

    const terminate = () => {
      cancelWorker(new Error('Terminated'));
    };

    return Far('EndoWorker', {
      terminate,

      whenTerminated: () => exitedAndClosed,

      // TODO encapsulate the endo bootstrap facet
      bootstrap: () => workerBootstrap,

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

        const valueUuid = crypto.randomUUID();

        const petNameDirectoryPath = path.join(locator.statePath, 'pet-name');
        const refs = Object.fromEntries(
          await Promise.all(
            petNames.map(async (endowmentPetName, index) => {
              const endowmentCodeName = codeNames[index];
              const petNamePath = path.join(
                petNameDirectoryPath,
                `${endowmentPetName}.json`,
              );
              const petNameText = await fs.promises.readFile(
                petNamePath,
                'utf8',
              );
              try {
                return [endowmentCodeName, JSON.parse(petNameText)];
              } catch (error) {
                throw new TypeError(
                  `Corrupt pet name description for ${endowmentPetName}: ${error.message}`,
                );
              }
            }),
          ),
        );

        if (resultName !== undefined) {
          // Persist instructions for revival (this can be collected)
          const valuesDirectoryPath = path.join(
            locator.statePath,
            'value-uuid',
          );
          await fs.promises.mkdir(valuesDirectoryPath, { recursive: true });
          const valuePath = path.join(valuesDirectoryPath, `${valueUuid}.json`);
          await fs.promises.writeFile(
            valuePath,
            `${JSON.stringify({
              type: 'eval',
              workerUuid,
              source,
              refs,
            })}\n`,
          );

          // Make a reference by pet name (this can be overwritten)
          await fs.promises.mkdir(petNameDirectoryPath, { recursive: true });
          const petNamePath = path.join(
            petNameDirectoryPath,
            `${resultName}.json`,
          );
          await fs.promises.writeFile(
            petNamePath,
            `${JSON.stringify({
              type: 'valueUuid',
              valueUuid,
            })}\n`,
          );
        }

        const endowmentValues = await Promise.all(
          // Behold, recursion:
          // eslint-disable-next-line no-use-before-define
          petNames.map(endowmentName => provide(endowmentName)),
        );
        return E(workerBootstrap).evaluate(source, codeNames, endowmentValues);
      },
    });
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
   * @param {string} valueUuid
   */
  const reviveValueUuid = async valueUuid => {
    const valuesDirectoryPath = path.join(locator.statePath, 'value-uuid');
    await fs.promises.mkdir(valuesDirectoryPath, { recursive: true });
    const valuePath = path.join(valuesDirectoryPath, `${valueUuid}.json`);
    const descriptionText = await fs.promises.readFile(valuePath, 'utf-8');
    const description = (() => {
      try {
        return JSON.parse(descriptionText);
      } catch (error) {
        throw new TypeError(
          `Corrupt description for value to be derived according to file ${valuePath}: {error.message}`,
        );
      }
    })();
    // TODO stronger validation
    if (description.type === 'eval') {
      const { workerUuid, source, refs } = description;
      const workerFacet = provideWorkerUuid(workerUuid);
      const workerBootstrap = E(workerFacet).bootstrap();
      const codeNames = Object.keys(refs);
      const endowmentValues = await Promise.all(
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        Object.values(refs).map(ref => provideRef(ref)),
      );
      return E(workerBootstrap).evaluate(source, codeNames, endowmentValues);
    } else {
      throw new Error(
        `Corrupt description for value in file ${valuePath}: unknown type ${q(
          description.type,
        )}`,
      );
    }
  };

  /**
   * @param {string} valueUuid
   */
  const provideValueUuid = async valueUuid => {
    let value = values.get(valueUuid);
    if (value === undefined) {
      value = reviveValueUuid(valueUuid);
      values.set(valueUuid, value);
    }
    return value;
  };

  /**
   * @param {any} ref TODO unknown and validate
   */
  const provideRef = async ref => {
    if (ref.type === 'workerUuid') {
      return provideWorkerUuid(ref.workerUuid);
    } else if (ref.type === 'readableSha512') {
      return provideReadableSha512(ref.readableSha512);
    } else if (ref.type === 'valueUuid') {
      return provideValueUuid(ref.valueUuid);
    } else {
      throw new Error(`Corrupt ref description ${ref}`);
    }
  };

  /**
   * @param {string} refPath
   */
  const revivePath = async refPath => {
    const descriptionText = await fs.promises
      .readFile(refPath, 'utf-8')
      .catch(() => {
        // TODO handle EMFILE gracefully
        throw new ReferenceError(`No reference exists at path ${refPath}`);
      });
    const description = (() => {
      try {
        return JSON.parse(descriptionText);
      } catch (error) {
        throw new TypeError(
          `Corrupt description for reference in file ${refPath}: {error.message}`,
        );
      }
    })();

    return provideRef(description);
  };

  /**
   * @param {string} name
   */
  const revive = async name => {
    const petNameDirectoryPath = path.join(locator.statePath, 'pet-name');
    const petNamePath = path.join(petNameDirectoryPath, `${name}.json`);
    return revivePath(petNamePath).catch(error => {
      throw new Error(
        `Corrupt pet name ${name} for file ${petNamePath}: ${error.message}`,
      );
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
      cancel(new Error('Terminate'));
    },

    /**
     * @param {string} [name]
     */
    makeWorker: async name => {
      // @ts-ignore Node.js crypto does in fact have randomUUID.
      const workerUuid = crypto.randomUUID();
      return provideWorkerUuid(workerUuid, name);
    },

    store,
    provide,
  });
};

export const main = async () => {
  const { promise: cancelled, reject: cancel } =
    /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
      makePromiseKit()
    );

  const { promise: exitReported, reject: reportExit } =
    /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
      makePromiseKit()
    );

  // TODO thread through command arguments.
  const gracePeriodMs = 100;

  /** @type {Promise<never>} */
  const gracePeriodElapsed = cancelled.catch(async error => {
    await delay(gracePeriodMs, exitReported);
    throw error;
  });

  console.error(`Endo daemon starting on PID ${process.pid}`);
  process.once('exit', () => {
    console.error(`Endo daemon stopping on PID ${process.pid}`);
  });

  if (process.argv.length < 5) {
    throw new Error(
      `daemon.js requires arguments [sockPath] [statePath] [ephemeralStatePath] [cachePath], got ${process.argv.join(
        ', ',
      )}`,
    );
  }

  const sockPath = process.argv[2];
  const statePath = process.argv[3];
  const ephemeralStatePath = process.argv[4];
  const cachePath = process.argv[5];

  /** @type {import('../index.js').Locator} */
  const locator = {
    sockPath,
    statePath,
    ephemeralStatePath,
    cachePath,
  };

  const endoBootstrap = makeEndoBootstrap(locator, {
    cancelled,
    cancel,
    gracePeriodElapsed,
  });

  const statePathP = fs.promises.mkdir(statePath, { recursive: true });
  const ephemeralStatePathP = fs.promises.mkdir(ephemeralStatePath, {
    recursive: true,
  });
  const cachePathP = fs.promises.mkdir(cachePath, { recursive: true });
  await Promise.all([statePathP, cachePathP, ephemeralStatePathP]);

  const pidPath = path.join(ephemeralStatePath, 'endo.pid');
  await fs.promises.writeFile(pidPath, `${process.pid}\n`);

  const server = net.createServer();

  let nextConnectionNumber = 0;
  /** @type {Set<Promise<void>>} */
  const connectionClosedPromises = new Set();

  server.listen(
    {
      path: sockPath,
    },
    () => {
      console.log(
        `Endo daemon listening on ${q(sockPath)} ${new Date().toISOString()}`,
      );
      // Inform parent that we have an open unix domain socket, if we were
      // spawned with IPC.
      if (process.send) {
        process.send({ type: 'listening', path: sockPath });
      }
    },
  );
  server.on('error', error => {
    sinkError(error);
    process.exit(-1);
  });
  server.on('connection', conn => {
    const connectionNumber = nextConnectionNumber;
    nextConnectionNumber += 1;

    console.log(
      `Endo daemon received connection ${connectionNumber} at ${new Date().toISOString()}`,
    );
    const { closed } = makeNodeNetstringCapTP(
      'Endo',
      conn,
      conn,
      cancelled,
      endoBootstrap,
    );

    connectionClosedPromises.add(closed);

    closed.catch(sinkError);
    conn.on('close', () => {
      connectionClosedPromises.delete(closed);
      console.log(
        `Endo daemon closed connection ${connectionNumber} at ${new Date().toISOString()}`,
      );
    });
  });

  reportExit(
    cancelled.catch(async () => {
      server.close();
      await Promise.all(Array.from(connectionClosedPromises));
    }),
  );
};

main().catch(sinkError);
