// @ts-check
/* eslint-disable no-void */

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';
import { makePipe } from '@endo/stream';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';
import { E, Far } from '@endo/far';
import { q } from '@endo/errors';
import { makeNetstringCapTP } from './connection.js';
import { makeReaderRef } from './reader-ref.js';
import { makePetStoreMaker } from './pet-store.js';
import { servePrivatePath } from './serve-private-path.js';
import { makeSerialJobs } from './serial-jobs.js';

/** @import { Reader, Writer } from '@endo/stream' */
/** @import { ERef, FarRef } from '@endo/eventual-send' */
/** @import { Config, CryptoPowers, DaemonWorkerFacet, DaemonicPersistencePowers, DaemonicPowers, EndoReadable, FilePowers, Formula, FormulaNumber, NetworkPowers, SocketPowers, WorkerDaemonFacet } from './types.js' */

const textEncoder = new TextEncoder();

/**
 * @param {object} modules
 * @param {typeof import('net')} modules.net
 * @param {Pick<typeof import('fs/promises'), 'access'>} modules.fsp
 * @returns {SocketPowers}
 */
export const makeSocketPowers = ({ net, fsp: { access } }) => {
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
        server.listen({ path }, async error => {
          await null;
          // In some environments, an overly-long Unix domain socket path
          // (`sockaddr_un` `sun_path`) is silently truncated. This exposes the
          // problem, but we may still leak the incorrectly-named file and
          // thereby cause EADDRINUSE errors for future attempts to start.
          error ||= await access(path).catch(err => err);
          if (error) {
            if (path.length >= 104) {
              console.warn(
                `Warning: Length of path for domain socket or named path exceeeds common maximum (104, possibly 108) for some platforms (length: ${path.length}, path: ${path})`,
              );
            }
            try {
              server.close(_serverNotRunningErr => reject(error));
            } catch (_serverCloseErr) {
              reject(error);
            }
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
 * @param {Pick<typeof import('fs/promises'), 'access'>} modules.fsp
 * @returns {NetworkPowers}
 */
export const makeNetworkPowers = ({ net, fsp }) => {
  const { servePort, servePath, connectPort } = makeSocketPowers({ net, fsp });

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
  const wireDecoder = new TextDecoder();
  const wireEncoder = new TextEncoder();

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
   * @param {string} workerId
   * @param {DaemonWorkerFacet} _daemonWorkerFacet
   * @param {Promise<never>} cancelled
   */
  const makeXsnapWorker = async (workerId, _daemonWorkerFacet, cancelled) => {
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

    const snapshotPath = filePowers.joinPath(workerStatePath, 'worker.xss');
    const pidPath = filePowers.joinPath(workerEphemeralStatePath, 'worker.pid');
    const workerName = `endo-xsnap-${workerId.slice(0, 16)}`;
    const os = await import('os');
    const path = await import('path');
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const { xsnap } = await import('@agoric/xsnap');

    /** @type {Map<number, unknown>} */
    const hostSlots = new Map();
    /** @type {WeakMap<object, number>} */
    const hostValuesToSlots = new WeakMap();
    let nextHostSlot = 1;

    /** @type {Map<number, unknown>} */
    const xsSlots = new Map();

    /**
     * @param {number} slot
     */
    const provideHostSlot = slot => {
      const target = hostSlots.get(slot);
      if (target === undefined) {
        throw new Error(`Unknown host slot ${q(slot)}`);
      }
      return target;
    };

    /** @type {(slot: number, methods?: string[]) => unknown} */
    let provideXsnapSlot = (slot, _methods = []) => {
      throw new Error(`Unknown xs slot ${q(slot)}`);
    };

    /**
     * @param {unknown} value
     * @returns {unknown}
     */
    const decodeWireData = value => {
      if (Array.isArray(value)) {
        return value.map(decodeWireData);
      }
      if (value && typeof value === 'object') {
        if ('xsSlot' in value) {
          const slot = Reflect.get(value, 'xsSlot');
          const methods = Reflect.get(value, 'methods');
          const normalizedMethods = Array.isArray(methods)
            ? methods.filter(method => typeof method === 'string')
            : [];
          return provideXsnapSlot(/** @type {number} */ (slot), normalizedMethods);
        }
        if ('hostSlot' in value) {
          const slot = Reflect.get(value, 'hostSlot');
          return provideHostSlot(/** @type {number} */ (slot));
        }
        return Object.fromEntries(
          Object.entries(value).map(([key, inner]) => [key, decodeWireData(inner)]),
        );
      }
      return value;
    };

    /**
     * @param {unknown} value
     * @returns {unknown}
     */
    const encodeWireData = value => {
      if (value === null || value === undefined) {
        return value;
      }
      const valueType = typeof value;
      if (
        valueType === 'boolean' ||
        valueType === 'number' ||
        valueType === 'string'
      ) {
        return value;
      }
      if (Array.isArray(value)) {
        return value.map(encodeWireData);
      }
      if (valueType === 'object') {
        if (Object.getPrototypeOf(value) === Object.prototype) {
          return Object.fromEntries(
            Object.entries(value).map(([key, inner]) => [key, encodeWireData(inner)]),
          );
        }
        const knownSlot = hostValuesToSlots.get(/** @type {object} */ (value));
        if (knownSlot !== undefined) {
          return harden({ hostSlot: knownSlot });
        }
        const newSlot = nextHostSlot;
        nextHostSlot += 1;
        hostValuesToSlots.set(/** @type {object} */ (value), newSlot);
        hostSlots.set(newSlot, value);
        return harden({ hostSlot: newSlot });
      }
      throw new TypeError(`Cannot pass unsupported value into xsnap worker`);
    };

    const maybeBuildXsnapBinary = () => {
      const xsnapPackageJsonPath = require.resolve('@agoric/xsnap/package.json');
      const xsnapPackagePath = path.dirname(xsnapPackageJsonPath);
      const binaryPath = path.join(
        xsnapPackagePath,
        'xsnap-native/xsnap/build/bin/lin/release/xsnap-worker',
      );
      if (fs.existsSync(binaryPath)) {
        return;
      }
      const result = popen.spawnSync('npm', ['run', 'build:from-env'], {
        cwd: xsnapPackagePath,
        stdio: 'pipe',
      });
      if (result.status !== 0 || !fs.existsSync(binaryPath)) {
        const stderr = result.stderr?.toString() ?? '';
        throw new Error(
          `Failed to build xsnap worker binary for ${workerName}: ${stderr}`,
        );
      }
    };

    const snapshotStream = fs.existsSync(snapshotPath)
      ? fs.createReadStream(snapshotPath)
      : undefined;

    /** @type {Awaited<ReturnType<typeof xsnap>> | undefined} */
    let worker;

    const spawnXsnap = async () => {
      await null;
      return xsnap({
        os: os.type(),
        spawn: popen.spawn,
        fs,
        name: workerName,
        snapshotStream,
        snapshotDescription: workerId,
        stdout: 'ignore',
        stderr: 'ignore',
        handleCommand: async request => {
          await null;
          const command = JSON.parse(wireDecoder.decode(request));
          if (command.type !== 'host-call') {
            const failure = harden({
              ok: false,
              message: `Unknown host command ${q(command.type)}`,
            });
            return wireEncoder.encode(JSON.stringify(failure));
          }
          const { slot, method, args } = command;
          if (typeof method !== 'string') {
            const failure = harden({
              ok: false,
              message: `Invalid host method ${q(method)}`,
            });
            return wireEncoder.encode(JSON.stringify(failure));
          }
          const target = hostSlots.get(slot);
          if (target === undefined) {
            const failure = harden({
              ok: false,
              message: `Unknown host slot ${q(slot)}`,
            });
            return wireEncoder.encode(JSON.stringify(failure));
          }
          try {
            const decodedArgs = decodeWireData(args);
            if (!Array.isArray(decodedArgs)) {
              throw new Error('Host call arguments must be an array');
            }
            const targetAny = /** @type {any} */ (target);
            const result = await /** @type {any} */ (E(targetAny)[method])(
              ...decodedArgs,
            );
            const success = harden({
              ok: true,
              value: encodeWireData(result),
            });
            return wireEncoder.encode(JSON.stringify(success));
          } catch (error) {
            const failure = harden({
              ok: false,
              message: error instanceof Error ? error.message : String(error),
            });
            return wireEncoder.encode(JSON.stringify(failure));
          }
        },
      });
    };

    try {
      worker = await spawnXsnap();
    } catch {
      maybeBuildXsnapBinary();
      worker = await spawnXsnap();
    }

    const persistSnapshot = async reason => {
      await null;
      if (worker === undefined) {
        throw new Error('xsnap worker not initialized');
      }
      const stream = worker.makeSnapshotStream(reason);
      await fs.promises.writeFile(snapshotPath, stream);
    };

    await filePowers.writeFileText(pidPath, `xsnap:${workerName}\n`);

    /**
     * @param {Record<string, unknown>} command
     */
    const callWorker = async command => {
      await null;
      const { reply } = await worker.issueCommand(
        wireEncoder.encode(JSON.stringify(command)),
      );
      const response = JSON.parse(wireDecoder.decode(reply));
      if (!response || response.ok !== true) {
        throw new Error(response?.message ?? 'Unknown xsnap worker error');
      }
      return decodeWireData(response.value);
    };

    provideXsnapSlot = (slot, methods = []) => {
      if (xsSlots.has(slot)) {
        return xsSlots.get(slot);
      }
      const invoke = async (method, args) => {
        await null;
        const result = await callWorker({
          type: 'call',
          slot,
          method,
          args: encodeWireData(args),
        });
        await persistSnapshot(`call-${workerId}-${method}`);
        return result;
      };

      const methodTable = Object.create(null);
      for (const method of methods) {
        methodTable[method] = (...args) => invoke(method, args);
      }
      const value = Far(`XsnapValue-${slot}`, methodTable);
      xsSlots.set(slot, value);
      return value;
    };

    await worker.evaluate(`
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const formulas = new Map();
      const xsSlots = new Map();
      let nextXsSlot = 1;

      const M = { interface: () => ({}) };
      globalThis.M = M;
      globalThis.makeExo = (_name, _iface, methods) => methods;
      globalThis.E = target => new Proxy({}, {
        get: (_obj, prop) => (...args) => target[prop](...args),
      });
      globalThis.E.get = target => target;

      const issueHost = payload => {
        const response = issueCommand(encoder.encode(JSON.stringify(payload)));
        const parsed = JSON.parse(decoder.decode(response));
        if (!parsed || parsed.ok !== true) {
          throw new Error(parsed && parsed.message || 'Host command failed');
        }
        return parsed.value;
      };

      const decodeData = value => {
        if (Array.isArray(value)) {
          return value.map(decodeData);
        }
        if (value && typeof value === 'object') {
          if ('hostSlot' in value) {
            const hostSlot = value.hostSlot;
            return new Proxy({}, {
              get: (_obj, prop) => {
                if (prop === 'then') {
                  return undefined;
                }
                return (...args) =>
                  decodeData(
                    issueHost({
                      type: 'host-call',
                      slot: hostSlot,
                      method: String(prop),
                      args: encodeData(args),
                    }),
                  );
              },
            });
          }
          if ('xsSlot' in value) {
            return xsSlots.get(value.xsSlot);
          }
          return Object.fromEntries(
            Object.entries(value).map(([key, inner]) => [key, decodeData(inner)]),
          );
        }
        return value;
      };

      const encodeData = value => {
        if (value === null || value === undefined) {
          return value;
        }
        const valueType = typeof value;
        if (valueType === 'boolean' || valueType === 'number' || valueType === 'string') {
          return value;
        }
        if (Array.isArray(value)) {
          return value.map(encodeData);
        }
        if (valueType === 'object' || valueType === 'function') {
          if (valueType === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
            return Object.fromEntries(
              Object.entries(value).map(([key, inner]) => [key, encodeData(inner)]),
            );
          }
          for (const [slot, stored] of xsSlots.entries()) {
            if (stored === value) {
              return { xsSlot: slot, methods: stored.__methodNames__ || [] };
            }
          }
          const slot = nextXsSlot++;
          const methodNames = Object.getOwnPropertyNames(value).filter(name =>
            typeof value[name] === 'function',
          );
          value.__methodNames__ = methodNames;
          xsSlots.set(slot, value);
          return { xsSlot: slot, methods: methodNames };
        }
        throw new Error('Unsupported xs value type');
      };

      globalThis.handleCommand = message => {
        const command = JSON.parse(decoder.decode(message));
        try {
          if (command.type === 'evaluate') {
            const { id, source, names, values } = command;
            if (formulas.has(id)) {
              return encoder.encode(
                JSON.stringify({ ok: true, value: encodeData(formulas.get(id)) }),
              ).buffer;
            }
            const decodedValues = decodeData(values || []);
            for (let i = 0; i < names.length; i += 1) {
              globalThis[names[i]] = decodedValues[i];
            }
            const value = eval(source);
            formulas.set(id, value);
            return encoder.encode(
              JSON.stringify({ ok: true, value: encodeData(value) }),
            ).buffer;
          }
          if (command.type === 'call') {
            const target = xsSlots.get(command.slot);
            if (target === undefined) {
              throw new Error('Unknown xs slot');
            }
            const decodedArgs = decodeData(command.args || []);
            const value = target[command.method](...decodedArgs);
            return encoder.encode(
              JSON.stringify({ ok: true, value: encodeData(value) }),
            ).buffer;
          }
          return encoder.encode(
            JSON.stringify({ ok: false, message: 'Unknown command type' }),
          ).buffer;
        } catch (error) {
          return encoder.encode(
            JSON.stringify({
              ok: false,
              message: error instanceof Error ? error.message : String(error),
            }),
          ).buffer;
        }
      };
    `);

    const terminated = makePromiseKit();
    const closeWorker = async () => {
      await null;
      try {
        await persistSnapshot(`close-${workerId}`);
      } finally {
        await worker.close().catch(() => undefined);
        terminated.resolve(undefined);
      }
    };
    cancelled.catch(() => {
      void closeWorker();
    });

    const workerDaemonFacet = Far(`EndoXsnapWorkerFacet-${workerId}`, {
      terminate: async () => {
        await closeWorker();
      },
      evaluate: async (source, names, values, id, _workerCancelled) => {
        const result = await callWorker({
          type: 'evaluate',
          id,
          source,
          names,
          values: encodeWireData(values),
        });
        await persistSnapshot(`eval-${workerId}`);
        return result;
      },
      makeBundle: async () => {
        throw new Error('xsnap worker does not support makeBundle yet');
      },
      makeUnconfined: async () => {
        throw new Error('xsnap worker does not support makeUnconfined yet');
      },
    });

    return {
      workerTerminated: terminated.promise,
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
