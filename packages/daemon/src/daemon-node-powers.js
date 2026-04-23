// @ts-check
/* eslint-disable no-void */

import os from 'os';
import fsp from 'fs/promises';

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';
import { makePipe } from '@endo/stream';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';
import { q } from '@endo/errors';
import { xsnap } from '@agoric/xsnap';
import { getLockdownBundle } from '@agoric/xsnap-lockdown';
import { makeNetstringCapTP } from './connection.js';
import { makeReaderRef } from './reader-ref.js';
import { makePetStoreMaker } from './pet-store.js';
import { servePrivatePath } from './serve-private-path.js';
import { makeSerialJobs } from './serial-jobs.js';

/** @import { Reader, Writer } from '@endo/stream' */
/** @import { ERef, FarRef } from '@endo/eventual-send' */
/** @import { Config, CryptoPowers, DaemonWorkerFacet, DaemonicPersistencePowers, DaemonicPowers, EndoReadable, FilePowers, Formula, FormulaNumber, NetworkPowers, SocketPowers, WorkerDaemonFacet, XsnapWorkerDaemonFacet } from './types.js' */

const textEncoder = new TextEncoder();

/**
 * @param {object} modules
 * @param {typeof import('net')} modules.net
 * @returns {SocketPowers}
 */
export const makeSocketPowers = ({ net }) => {
  const serveListener = async (listen, cancelled) => {
    const [
      /** @type {Reader<Connection>} */ readFrom,
      /** @type {Writer<Connection} */ writeTo,
    ] = makePipe();

    const server = net.createServer();
    const { promise: erred, reject: err } = makePromiseKit();
    server.on('error', error => {
      err(error);
      void writeTo.throw(error);
    });
    server.on('close', () => {
      void writeTo.return(undefined);
    });

    cancelled.catch(error => {
      server.close();
      void writeTo.throw(error);
    });

    const listening = listen(server);

    await Promise.race([erred, cancelled, listening]);

    server.on('connection', conn => {
      const reader = makeNodeReader(conn);
      const writer = makeNodeWriter(conn);
      const closed = new Promise(resolve => conn.on('close', resolve));
      // TODO Respect back-pressure signal and avoid accepting new connections.
      void writeTo.next({ reader, writer, closed });
    });

    const port = await listening;

    return harden({
      port,
      connections: readFrom,
    });
  };

  /** @type {SocketPowers['servePort']} */
  const servePort = async ({ port, host = '0.0.0.0', cancelled }) =>
    serveListener(
      server =>
        new Promise(resolve =>
          server.listen(port, host, () => resolve(server.address().port)),
        ),
      cancelled,
    );

  /** @type {SocketPowers['connectPort']} */
  const connectPort = ({ port, host }) =>
    new Promise((resolve, reject) => {
      const conn = net.connect(port, host, err => {
        if (err) {
          reject(err);
          return;
        }
        const reader = makeNodeReader(conn);
        const writer = makeNodeWriter(conn);
        const closed = new Promise(close => conn.on('close', close));
        resolve({
          reader,
          writer,
          closed,
        });
      });
    });

  /** @type {SocketPowers['servePath']} */
  const servePath = async ({ path, cancelled }) => {
    const { connections } = await serveListener(server => {
      return new Promise((resolve, reject) =>
        server.listen({ path }, error => {
          if (error) {
            if (path.length >= 104) {
              console.warn(
                `Warning: Length of path for domain socket or named path exceeeds common maximum (104, possibly 108) for some platforms (length: ${path.length}, path: ${path})`,
              );
            }
            reject(error);
          } else {
            resolve(undefined);
          }
        }),
      );
    }, cancelled);
    return connections;
  };

  return { servePort, servePath, connectPort };
};

/**
 * @param {object} modules
 * @param {typeof import('net')} modules.net
 * @returns {NetworkPowers}
 */
export const makeNetworkPowers = ({ net }) => {
  const { servePort, servePath, connectPort } = makeSocketPowers({ net });

  const connectionNumbers = (function* generateNumbers() {
    let n = 0;
    for (;;) {
      yield n;
      n += 1;
    }
  })();

  /**
   * @param {FarRef<unknown>} endoBootstrap
   * @param {string} sockPath
   * @param {Promise<never>} cancelled
   * @param {(error: Error) => void} exitWithError
   * @returns {{ started: Promise<void>, stopped: Promise<void> }}
   */
  const makePrivatePathService = (
    endoBootstrap,
    sockPath,
    cancelled,
    exitWithError,
  ) => {
    const privatePathService = servePrivatePath(sockPath, endoBootstrap, {
      servePath,
      connectionNumbers,
      cancelled,
      exitWithError,
    });
    return privatePathService;
  };

  return harden({
    servePort,
    servePath,
    connectPort,
    makePrivatePathService,
  });
};

export const makeFilePowers = ({ fs, path: fspath }) => {
  const writeJobs = makeSerialJobs();

  /**
   * @param {string} path
   */
  const makeFileReader = path => {
    const nodeReadStream = fs.createReadStream(path);
    return makeNodeReader(nodeReadStream);
  };

  /**
   * @param {string} path
   * @returns {Writer<Uint8Array>}
   */
  const makeFileWriter = path => {
    const nodeWriteStream = fs.createWriteStream(path);
    return makeNodeWriter(nodeWriteStream);
  };

  /**
   * @param {string} path
   * @param {string} text
   */
  const writeFileText = async (path, text) => {
    await writeJobs.enqueue(async () => {
      await fs.promises.writeFile(path, text);
    });
  };

  /**
   * @param {string} path
   */
  const readFileText = async path => {
    return fs.promises.readFile(path, 'utf-8');
  };

  /**
   * @param {string} path
   */
  const maybeReadFileText = async path =>
    readFileText(path).catch(error => {
      if (
        error.message.startsWith('ENOENT: ') ||
        error.message.startsWith('EISDIR: ')
      ) {
        return undefined;
      }
      throw error;
    });

  /**
   * @param {string} path
   */
  const readDirectory = async path => {
    return fs.promises.readdir(path);
  };

  /**
   * @param {string} path
   */
  const makePath = async path => {
    await fs.promises.mkdir(path, { recursive: true });
  };

  /**
   * @param {string} path
   */
  const removePath = async path => {
    await writeJobs.enqueue(async () => {
      return fs.promises.rm(path);
    });
  };

  const renamePath = async (source, target) => {
    await writeJobs.enqueue(async () => {
      return fs.promises.rename(source, target);
    });
  };

  const joinPath = (...components) => fspath.join(...components);

  return harden({
    makeFileReader,
    makeFileWriter,
    writeFileText,
    readFileText,
    maybeReadFileText,
    readDirectory,
    makePath,
    joinPath,
    removePath,
    renamePath,
  });
};

/**
 * @param {typeof import('crypto')} crypto
 * @returns {CryptoPowers}
 */
export const makeCryptoPowers = crypto => {
  const makeSha512 = () => {
    const digester = crypto.createHash('sha512');
    return harden({
      update: chunk => digester.update(chunk),
      updateText: chunk => digester.update(textEncoder.encode(chunk)),
      digestHex: () => digester.digest('hex'),
    });
  };

  const randomHex512 = () =>
    new Promise((resolve, reject) =>
      crypto.randomBytes(64, (err, bytes) => {
        if (err) {
          reject(err);
        } else {
          resolve(bytes.toString('hex'));
        }
      }),
    );

  return harden({
    makeSha512,
    randomHex512,
  });
};

/**
 * @param {FilePowers} filePowers
 * @param {CryptoPowers} cryptoPowers
 * @param {Config} config
 * @returns {DaemonicPersistencePowers}
 */
export const makeDaemonicPersistencePowers = (
  filePowers,
  cryptoPowers,
  config,
) => {
  const initializePersistence = async () => {
    const { statePath, ephemeralStatePath, cachePath } = config;
    const statePathP = filePowers.makePath(statePath);
    const ephemeralStatePathP = filePowers.makePath(ephemeralStatePath);
    const cachePathP = filePowers.makePath(cachePath);
    await Promise.all([statePathP, cachePathP, ephemeralStatePathP]);
  };

  /** @type {DaemonicPersistencePowers['provideRootNonce']} */
  const provideRootNonce = async () => {
    const noncePath = filePowers.joinPath(config.statePath, 'nonce');
    const existingNonce = await filePowers.maybeReadFileText(noncePath);
    if (existingNonce === undefined) {
      const rootNonce = /** @type {FormulaNumber} */ (
        await cryptoPowers.randomHex512()
      );
      await filePowers.writeFileText(noncePath, `${rootNonce}\n`);
      return { rootNonce, isNewlyCreated: true };
    } else {
      const rootNonce = /** @type {FormulaNumber} */ (existingNonce.trim());
      return { rootNonce, isNewlyCreated: false };
    }
  };

  const makeContentSha512Store = () => {
    const { statePath } = config;
    const storageDirectoryPath = filePowers.joinPath(statePath, 'store-sha512');

    return harden({
      /**
       * @param {AsyncIterable<Uint8Array>} readable
       * @returns {Promise<string>}
       */
      async store(readable) {
        const digester = cryptoPowers.makeSha512();
        const storageId512 = await cryptoPowers.randomHex512();
        const temporaryStoragePath = filePowers.joinPath(
          storageDirectoryPath,
          storageId512,
        );

        // Stream to temporary file and calculate hash.
        await filePowers.makePath(storageDirectoryPath);
        const fileWriter = filePowers.makeFileWriter(temporaryStoragePath);
        for await (const chunk of readable) {
          digester.update(chunk);
          await fileWriter.next(chunk);
        }
        await fileWriter.return(undefined);

        // Calculate hash.
        const sha512 = digester.digestHex();
        // Finish with an atomic rename.
        const storagePath = filePowers.joinPath(storageDirectoryPath, sha512);
        await filePowers.renamePath(temporaryStoragePath, storagePath);
        return sha512;
      },
      /**
       * @param {string} sha512
       * @returns {EndoReadable}
       */
      fetch(sha512) {
        const storagePath = filePowers.joinPath(storageDirectoryPath, sha512);
        const streamBase64 = () => {
          const reader = filePowers.makeFileReader(storagePath);
          return makeReaderRef(reader);
        };
        const text = async () => {
          return filePowers.readFileText(storagePath);
        };
        const json = async () => {
          const jsonSrc = await text();
          return JSON.parse(jsonSrc);
        };
        return harden({
          sha512: () => sha512,
          streamBase64,
          text,
          json,
        });
      },
    });
  };

  /**
   * @param {string} formulaNumber
   */
  const makeFormulaPath = formulaNumber => {
    const { statePath } = config;
    if (formulaNumber.length < 3) {
      throw new TypeError(`Invalid formula number ${q(formulaNumber)}`);
    }
    const head = formulaNumber.slice(0, 2);
    const tail = formulaNumber.slice(2);
    const directory = filePowers.joinPath(statePath, 'formulas', head);
    const file = filePowers.joinPath(directory, `${tail}.json`);
    return harden({ directory, file });
  };

  /**
   * @param {string} formulaNumber
   * @returns {Promise<Formula>}
   */
  const readFormula = async formulaNumber => {
    const { file: formulaPath } = makeFormulaPath(formulaNumber);
    const formulaText = await filePowers.maybeReadFileText(formulaPath);
    if (formulaText === undefined) {
      throw new ReferenceError(`No reference exists at path ${formulaPath}`);
    }
    const formula = (() => {
      try {
        return JSON.parse(formulaText);
      } catch (error) {
        throw new TypeError(
          `Corrupt description for reference in file ${formulaPath}: ${error.message}`,
        );
      }
    })();
    return formula;
  };

  // Persist instructions for revival (this can be collected)
  /** @type {DaemonicPersistencePowers['writeFormula']} */
  const writeFormula = async (formulaNumber, formula) => {
    const { directory, file } = makeFormulaPath(formulaNumber);
    // TODO Take care to write atomically with a rename here.
    await filePowers.makePath(directory);
    await filePowers.writeFileText(file, `${q(formula)}\n`);
  };

  return harden({
    initializePersistence,
    provideRootNonce,
    makeContentSha512Store,
    readFormula,
    writeFormula,
  });
};

/**
 * @param {Config} config
 * @param {import('url').fileURLToPath} fileURLToPath
 * @param {FilePowers} filePowers
 * @param {typeof import('fs')} fs
 * @param {typeof import('child_process')} popen
 */
export const makeDaemonicControlPowers = (
  config,
  fileURLToPath,
  filePowers,
  fs,
  popen,
) => {
  const endoWorkerPath = fileURLToPath(
    new URL('worker-node.js', import.meta.url),
  );
  const xsnapWorkerBootstrapPath = fileURLToPath(
    new URL('xsnap-worker-bootstrap.js', import.meta.url),
  );

  /**
   * Minimal `fs` adapter for @agoric/xsnap in pipe-snapshot mode. xsnap only
   * calls `tmpName` when `snapshotUseFs` is true, which we never set.
   */
  const xsnapFs = harden({
    open: fsp.open,
    stat: fsp.stat,
    unlink: fsp.unlink,
    createReadStream: fs.createReadStream,
  });

  /**
   * @param {string} workerId
   * @param {DaemonWorkerFacet} daemonWorkerFacet
   * @param {Promise<never>} cancelled
   */
  const makeWorker = async (workerId, daemonWorkerFacet, cancelled) => {
    const { statePath, ephemeralStatePath } = config;

    const workerStatePath = filePowers.joinPath(statePath, 'worker', workerId);
    const workerEphemeralStatePath = filePowers.joinPath(
      ephemeralStatePath,
      'worker',
      workerId,
    );

    await Promise.all([
      filePowers.makePath(workerStatePath),
      filePowers.makePath(workerEphemeralStatePath),
    ]);

    const logPath = filePowers.joinPath(workerStatePath, 'worker.log');
    const pidPath = filePowers.joinPath(workerEphemeralStatePath, 'worker.pid');

    const log = fs.openSync(logPath, 'a');
    const child = popen.fork(endoWorkerPath, [], {
      stdio: ['ignore', log, log, 'pipe', 'pipe', 'ipc'],
      // @ts-ignore Stale Node.js type definition.
      windowsHide: true,
    });
    const workerPid = child.pid;
    const nodeWriter = /** @type {import('stream').Writable} */ (
      child.stdio[3]
    );
    const nodeReader = /** @type {import('stream').Readable} */ (
      child.stdio[4]
    );
    assert(nodeWriter);
    assert(nodeReader);
    const reader = makeNodeReader(nodeReader);
    const writer = makeNodeWriter(nodeWriter);

    const workerClosed = new Promise(resolve => {
      child.on('exit', () => {
        console.log(
          `Endo worker exited for PID ${workerPid} with unique identifier ${workerId}`,
        );
        resolve(undefined);
      });
    });

    await filePowers.writeFileText(pidPath, `${child.pid}\n`);

    cancelled.catch(async () => {
      child.kill();
    });

    console.log(
      `Endo worker started PID ${workerPid} unique identifier ${workerId}`,
    );

    const { getBootstrap, closed: capTpClosed } = makeNetstringCapTP(
      `Worker ${workerId}`,
      writer,
      reader,
      cancelled,
      daemonWorkerFacet,
    );

    capTpClosed.finally(() => {
      console.log(
        `Endo worker connection closed for PID ${workerPid} with unique identifier ${workerId}`,
      );
    });

    const workerTerminated = Promise.race([workerClosed, capTpClosed]);

    /** @type {ERef<WorkerDaemonFacet>} */
    const workerDaemonFacet = getBootstrap();

    return { workerTerminated, workerDaemonFacet };
  };

  /**
   * Spawn or revive an xsnap-hosted worker.
   *
   * The xsnap process is the persistence boundary. On graceful shutdown the
   * daemon asks xsnap to stream a snapshot of the entire JS heap, writes it
   * to `heap.xss.tmp`, then atomic-renames to `heap.xss`. On revival, the
   * snapshot is streamed back into a fresh xsnap process and the worker
   * resumes with every value still reachable from its globals.
   *
   * This is orthogonal persistence — the guest opts in to nothing — and is
   * deliberately NOT a durable zone: there is no per-object durability
   * mechanism, no upgrade-survivable virtual collections, and no persistent
   * storage layer separate from the snapshot.
   *
   * Wire protocol: each daemon→worker `issueCommand` carries one JSON
   * `{ type: 'eval', source }` request; xsnap's `handleCommand` returns one
   * JSON `{ ok }` or `{ error }` reply. `daemonWorkerFacet` is unused — the
   * xsnap worker speaks an eval-only dialect rather than CapTP, because the
   * xsnap runtime does not host the SES shim or Node module loader on its
   * own. Mutations to `globalThis` from successive evals survive snapshot/
   * revival; everything else is gone.
   *
   * @param {string} workerId
   * @param {DaemonWorkerFacet} _daemonWorkerFacet - Unused; see above.
   * @param {Promise<never>} cancelled
   */
  const makeXsnapWorker = async (workerId, _daemonWorkerFacet, cancelled) => {
    const { statePath, ephemeralStatePath } = config;
    const workerStatePath = filePowers.joinPath(
      statePath,
      'xsnap-worker',
      workerId,
    );
    const workerEphemeralStatePath = filePowers.joinPath(
      ephemeralStatePath,
      'xsnap-worker',
      workerId,
    );
    const snapshotPath = filePowers.joinPath(workerStatePath, 'heap.xss');
    const snapshotTmpPath = `${snapshotPath}.tmp`;

    await Promise.all([
      filePowers.makePath(workerStatePath),
      filePowers.makePath(workerEphemeralStatePath),
    ]);

    const pidPath = filePowers.joinPath(workerEphemeralStatePath, 'worker.pid');

    const hasSnapshot = await fsp
      .access(snapshotPath)
      .then(() => true)
      .catch(() => false);

    let snapshotStream;
    if (hasSnapshot) {
      const handle = await fsp.open(snapshotPath, 'r');
      snapshotStream = /** @type {AsyncIterable<Uint8Array>} */ (
        /** @type {unknown} */ (handle.createReadStream({ autoClose: true }))
      );
    }

    // The xsnap protocol delivers worker→host replies through the host's
    // `handleCommand` callback rather than through the `issueCommand` reply.
    // We serialize evaluations through a single in-flight slot so each
    // command's reply is unambiguous.
    /** @type {((bytes: Uint8Array) => void) | undefined} */
    let pendingReplyResolver;
    const handleCommand = bytes => {
      if (pendingReplyResolver !== undefined) {
        const resolver = pendingReplyResolver;
        pendingReplyResolver = undefined;
        // Copy defensively; xsnap may reuse the buffer.
        resolver(new Uint8Array(bytes));
      }
      return new Uint8Array();
    };

    /** @type {Awaited<ReturnType<typeof xsnap>>} */
    const vat = await xsnap({
      os: os.type(),
      spawn: popen.spawn,
      fs: xsnapFs,
      name: `xsnap-worker ${workerId}`,
      handleCommand,
      stdout: 'inherit',
      stderr: 'inherit',
      snapshotStream,
      snapshotDescription: `xsnap-worker ${workerId}`,
    });

    await filePowers.writeFileText(pidPath, `\n`);

    if (!hasSnapshot) {
      // First-boot sequence. All three steps leave their state in the heap,
      // which the first snapshot captures — neither is re-evaluated on
      // revival.
      //   1. Apply SES lockdown using the pre-built bundle from
      //      @agoric/xsnap-lockdown. xsnap's Start Compartment has no SES
      //      shim built in, so without this step the bootstrap would run
      //      on raw XS with no `harden`, no tamed primordials, and no
      //      Compartment constructor.
      //   2. Evaluate the worker bootstrap, which installs the
      //      request/response handler on `globalThis`.
      // Even if the bootstrap does not strictly require SES today, running
      // under lockdown matches the surface the regular worker presents to
      // guest code, so future CapTP wiring that reuses worker.js can rely
      // on `harden`, `Compartment`, and hardened primordials.
      const lockdownBundle = await getLockdownBundle();
      await vat.evaluate(`(${lockdownBundle.source}\n)()`.trim());

      const bootstrapSource = await fsp.readFile(
        xsnapWorkerBootstrapPath,
        'utf-8',
      );
      await vat.evaluate(bootstrapSource);
    }

    console.log(
      `Endo xsnap worker started unique identifier ${workerId} (${hasSnapshot ? 'revived from snapshot' : 'fresh boot'})`,
    );

    /**
     * Take a snapshot of the live heap and atomically replace `heap.xss`.
     * Must not interleave with `issueCommand`; xsnap serializes both through
     * its own internal baton.
     */
    const takeSnapshot = async () => {
      const stream = vat.makeSnapshotStream(`xsnap-worker ${workerId}`);
      const handle = await fsp.open(snapshotTmpPath, 'w');
      try {
        await handle.writeFile(stream);
      } finally {
        await handle.close();
      }
      await fsp.rename(snapshotTmpPath, snapshotPath);
    };

    const workerTerminatedKit =
      /** @type {import('@endo/promise-kit').PromiseKit<void>} */ (
        makePromiseKit()
      );

    cancelled.catch(async error => {
      await null;
      try {
        await takeSnapshot();
        await vat.close();
      } catch (snapshotError) {
        console.warn(
          `Endo xsnap worker ${workerId} snapshot failed: ${snapshotError.message}; forcing termination`,
        );
        await vat.terminate().catch(() => {});
      } finally {
        workerTerminatedKit.resolve(undefined);
      }
      void error;
    });

    const requestEncoder = new TextEncoder();
    const responseDecoder = new TextDecoder();

    let evalChain = Promise.resolve();

    /**
     * @param {string} source
     * @returns {Promise<unknown>}
     */
    const xsnapEvaluate = source => {
      const next = evalChain.then(async () => {
        if (pendingReplyResolver !== undefined) {
          throw new Error(
            `xsnap-worker ${workerId}: pending reply slot already in use`,
          );
        }
        const replyPromise = /** @type {Promise<Uint8Array>} */ (
          new Promise(resolve => {
            pendingReplyResolver = resolve;
          })
        );
        const requestBytes = requestEncoder.encode(
          JSON.stringify({ type: 'eval', source }),
        );
        await vat.issueCommand(requestBytes);
        const replyBytes = await replyPromise;
        const reply = JSON.parse(responseDecoder.decode(replyBytes));
        if (reply && Object.prototype.hasOwnProperty.call(reply, 'error')) {
          throw new Error(`xsnap-worker ${workerId}: ${reply.error}`);
        }
        return reply.ok;
      });
      evalChain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    };

    /** @type {ERef<XsnapWorkerDaemonFacet>} */
    const workerDaemonFacet = Object.freeze({
      terminate: async () => {
        await vat.close().catch(() => {});
      },
      evaluate: async source => xsnapEvaluate(source),
    });

    return {
      workerTerminated: workerTerminatedKit.promise,
      workerDaemonFacet,
    };
  };

  return harden({
    makeWorker,
    makeXsnapWorker,
  });
};

/**
 * @param {object} opts
 * @param {Config} opts.config
 * @param {typeof import('fs')} opts.fs
 * @param {typeof import('child_process')} opts.popen
 * @param {typeof import('url')} opts.url
 * @param {FilePowers} opts.filePowers
 * @param {CryptoPowers} opts.cryptoPowers
 * @returns {DaemonicPowers}
 */
export const makeDaemonicPowers = ({
  config,
  fs,
  popen,
  url,
  filePowers,
  cryptoPowers,
}) => {
  const { fileURLToPath } = url;

  const petStorePowers = makePetStoreMaker(filePowers, config);
  const daemonicPersistencePowers = makeDaemonicPersistencePowers(
    filePowers,
    cryptoPowers,
    config,
  );
  const daemonicControlPowers = makeDaemonicControlPowers(
    config,
    fileURLToPath,
    filePowers,
    fs,
    popen,
  );

  return harden({
    crypto: cryptoPowers,
    petStore: petStorePowers,
    persistence: daemonicPersistencePowers,
    control: daemonicControlPowers,
  });
};
