// @ts-check
/* global process, setTimeout, clearTimeout */
/* eslint-disable no-void */

import { makePromiseKit } from '@endo/promise-kit';
import { makePipe } from '@endo/stream';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';
import { makeReaderRef } from './reader-ref.js';
import { makePetStoreMaker } from './pet-store.js';
import { servePrivatePortHttp } from './serve-private-port-http.js';
import { servePrivatePath } from './serve-private-path.js';

const { quote: q } = assert;

const textEncoder = new TextEncoder();
const medialIterationResult = harden({ done: false });
const finalIterationResult = harden({ done: false });

const defaultHttpPort = 8920; // Eight Nine Duo Oh: ENDO.

/**
 * @param {object} modules
 * @param {typeof import('ws')} modules.ws
 * @param {typeof import('http')} modules.http
 */
export const makeHttpPowers = ({ http, ws }) => {
  // @ts-ignore Not sure why TypeScript gets this wrong.
  const { WebSocketServer } = ws;
  const { createServer } = http;

  /**
   * @param {object} args
   * @param {number} args.port
   * @param {string} args.host
   * @param {import('./types.js').HttpRespond} [args.respond]
   * @param {import('./types.js').HttpConnect} [args.connect]
   * @param {Promise<never>} args.cancelled
   */
  const servePortHttp = async ({
    port,
    host = '0.0.0.0',
    respond,
    connect,
    cancelled,
  }) => {
    const server = createServer();

    server.on('error', error => {
      console.error(error);
    });

    if (respond) {
      server.on('request', (req, res) => {
        (async () => {
          if (req.method === undefined) {
            return;
          }
          if (req.url === undefined) {
            return;
          }
          const response = await respond(
            harden({
              method: req.method,
              url: req.url,
              // TODO Node.js headers are a far more detailed type.
              headers: harden(
                /** @type {Record<string, string | Array<string> | undefined>} */ (
                  req.headers
                ),
              ),
            }),
          );
          res.writeHead(response.status, response.headers);
          if (response.content === undefined) {
            res.end();
          } else if (
            typeof response.content === 'string' ||
            response.content instanceof Uint8Array
          ) {
            res.end(response.content);
          } else {
            for await (const chunk of response.content) {
              res.write(chunk);
            }
            res.end();
          }
        })();
      });
    }

    if (connect) {
      const wss = new WebSocketServer({ server });
      wss.on('connection', (socket, req) => {
        const {
          promise: closed,
          resolve: close,
          reject: abort,
        } = makePromiseKit();

        closed.finally(() => socket.close());

        const [reader, sink] = makePipe();

        socket.on('message', (bytes, isBinary) => {
          if (!isBinary) {
            abort(new Error('expected binary'));
            return;
          }
          // TODO Ignoring back-pressure signal:
          // Unclear whether WebSocketServer accounts for this possibility.
          sink.next(bytes);
        });
        socket.on('close', () => {
          sink.return(undefined);
          socket.close();
          close(finalIterationResult);
        });

        const writer = {
          async next(bytes) {
            socket.send(bytes, { binary: true });
            return Promise.race([closed, medialIterationResult]);
          },
          async return() {
            socket.close();
            return Promise.race([closed, medialIterationResult]);
          },
          async throw(error) {
            socket.close();
            abort(error);
            return Promise.race([closed, medialIterationResult]);
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };

        connect(
          harden({
            reader,
            writer,
            closed: closed.then(() => {}),
          }),
          // @ts-ignore
          harden({
            method: req.method,
            url: req.url,
            headers: req.headers,
          }),
        );
      });
    }

    return new Promise((resolve, reject) => {
      server.listen(port, host, error => {
        if (error) {
          reject(error);
        } else {
          cancelled.catch(() => server.close());
          const address = server.address();
          if (address === null || typeof address === 'string') {
            reject(new Error('expected listener to be assigned a port'));
          } else {
            resolve(address.port);
          }
        }
      });
    });
  };

  return harden({ servePortHttp });
};

/**
 * @param {object} modules
 * @param {typeof import('net')} modules.net
 * @param {typeof import('http')} modules.http
 * @param {typeof import('ws')} modules.ws
 * @returns {import('./types.js').NetworkPowers}
 */
export const makeNetworkPowers = ({
  http,
  ws,
  net,
}) => {
  const { servePortHttp } = makeHttpPowers({ http, ws });

  const serveListener = async (listen, cancelled) => {
    const [
      /** @type {Reader<import('./types.js').Connection>} */ readFrom,
      /** @type {Writer<import('./types.js').Connection} */ writeTo,
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

    return readFrom;
  };

  const servePort = async ({ port, host = '0.0.0.0', cancelled }) =>
    serveListener(
      server =>
        new Promise(resolve =>
          server.listen(port, host, () => resolve(undefined)),
        ),
      cancelled,
    );

  const servePath = async ({ path, cancelled }) =>
    serveListener(
      server =>
        new Promise(resolve =>
          server.listen({ path }, () => resolve(undefined)),
        ),
      cancelled,
    );

  return harden({
    servePortHttp,
    servePort,
    servePath,
  });
}

export const makeDiskPowers = ({
  fs,
  path: fspath,
}) => {

  /**
   * @param {string} path
   */
  const makeFileReader = path => {
    const nodeReadStream = fs.createReadStream(path);
    return makeNodeReader(nodeReadStream);
  };

  /**
   * @param {string} path
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
    await fs.promises.writeFile(path, text);
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
    return fs.promises.rm(path);
  };

  const renamePath = async (source, target) =>
    fs.promises.rename(source, target);

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
}

/**
 * @param {object} modules
 * @param {typeof import('crypto')} modules.crypto
 * @param {typeof import('net')} modules.net
 * @param {typeof import('fs')} modules.fs
 * @param {typeof import('path')} modules.path
 * @param {typeof import('child_process')} modules.popen
 * @param {typeof import('url')} modules.url
 * @param {typeof import('ws')} modules.ws
 * @param {typeof import('http')} modules.http
 * @param {Record<string, string | undefined>} modules.env
 * @param {(pid: number) => void} modules.kill
 * @returns {import('./types.js').DaemonicPowers}
 */
export const makePowers = ({
  crypto,
  net,
  fs,
  path: fspath,
  popen,
  url,
  http,
  ws,
  kill,
  env,
}) => {
  const diskPowers = makeDiskPowers({ fs, path: fspath });
  const petStorePowers = makePetStoreMaker(diskPowers);
  const networkPowers = makeNetworkPowers({ http, ws, net });

  /** @param {Error} error */
  const sinkError = error => {
    console.error(error);
  };

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

  const informParentWhenReady = () => {
    if (process.send) {
      process.send({ type: 'ready' });
    }
  };

  const reportErrorToParent = message => {
    if (process.send) {
      process.send({ type: 'error', message });
    }
  };

  const makeHashedContentReadeableBlob = (statePath, sha512) => {
    const storageDirectoryPath = diskPowers.joinPath(
      statePath,
      'store-sha512',
    );
    const storagePath = diskPowers.joinPath(storageDirectoryPath, sha512);
    const stream = async () => {
      const reader = diskPowers.makeFileReader(storagePath);
      return makeReaderRef(reader);
    };
    const text = async () => {
      return diskPowers.readFileText(storagePath);
    };
    const json = async () => {
      return JSON.parse(await text());
    };
    return { stream, text, json }
  };

  const makeHashedContentWriter = async (statePath) => {
    const storageDirectoryPath = diskPowers.joinPath(
      statePath,
      'store-sha512',
    );
    await diskPowers.makePath(storageDirectoryPath);

    // Pump the reader into a temporary file and hash.
    // We use a temporary file to avoid leaving a partially writen object,
    // but also because we won't know the name we will use until we've
    // completed the hash.
    const digester = makeSha512();
    const storageId512 = await randomHex512();
    const temporaryStoragePath = diskPowers.joinPath(
      storageDirectoryPath,
      storageId512,
    );
    const fileWriter = diskPowers.makeFileWriter(temporaryStoragePath);
    const sha512Kit = makePromiseKit();

    /** @type {import('@endo/stream').Writer<Uint8Array>} */
    const hashedFileWriter = {
      async next(chunk) {
        digester.update(chunk);
        return fileWriter.next(chunk);
      },
      async return() {
        // Finish writing the file.
        const result = await fileWriter.return(undefined);
        // Calculate hash.
        const sha512 = digester.digestHex();
        // Finish with an atomic rename.
        const storagePath = diskPowers.joinPath(storageDirectoryPath, sha512);
        await diskPowers.renamePath(temporaryStoragePath, storagePath);
        // Notify the caller of the hash.
        sha512Kit.resolve(sha512);
        return result;
      },
      async throw(error) {
        return fileWriter.throw(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };

    const getSha512Hex = () => {
      return sha512Kit.promise;
    }

    return { writer: hashedFileWriter, getSha512Hex };
  };

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
   * @param {string} statePath
   * @param {string} formulaType
   * @param {string} formulaId512
   */
  const makeFormulaPath = (statePath, formulaType, formulaId512) => {
    if (formulaId512.length < 3) {
      throw new TypeError(
        `Invalid formula identifier ${q(formulaId512)} for formula of type ${q(
          formulaType,
        )}`,
      );
    }
    const head = formulaId512.slice(0, 2);
    const tail = formulaId512.slice(3);
    const directory = diskPowers.joinPath(
      statePath,
      'formulas',
      formulaType,
      head,
    );
    const file = diskPowers.joinPath(directory, `${tail}.json`);
    return { directory, file };
  };

  const readFormula = async (statePath, prefix, formulaNumber) => {
    const { file: formulaPath } = makeFormulaPath(statePath, prefix, formulaNumber);
    const formulaText = await diskPowers.maybeReadFileText(formulaPath);
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
  const writeFormula = async (statePath, formula, formulaType, formulaId512) => {
    const { directory, file } = makeFormulaPath(statePath, formulaType, formulaId512);
    // TODO Take care to write atomically with a rename here.
    await diskPowers.makePath(directory);
    await diskPowers.writeFileText(file, `${q(formula)}\n`);
  };

  const initializePersistence = async locator => {
    const statePathP = diskPowers.makePath(locator.statePath);
    const ephemeralStatePathP = diskPowers.makePath(locator.ephemeralStatePath);
    const cachePathP = diskPowers.makePath(locator.cachePath);
    await Promise.all([statePathP, cachePathP, ephemeralStatePathP]);
  }

  const finalizeInitialization = async (locator, pid) => {
    const pidPath = diskPowers.joinPath(locator.ephemeralStatePath, 'endo.pid');

    await diskPowers
      .readFileText(pidPath)
      .then(pidText => {
        const oldPid = Number(pidText);
        kill(oldPid);
      })
      .catch(() => {});

    await diskPowers.writeFileText(pidPath, `${pid}\n`);
  }

  const { fileURLToPath } = url;

  const endoWorkerPath = fileURLToPath(
    new URL('worker-node.js', import.meta.url),
  );

  /**
   * @param {string} id
   * @param {import('./types.js').Locator} locator
   * @param {Promise<never>} cancelled
   */
  const makeWorker = async (
    id,
    locator,
    cancelled,
  ) => {
    const { sockPath } = locator;
    const path = endoWorkerPath;

    const cachePath = diskPowers.joinPath(
      locator.cachePath,
      'worker-id512',
      id,
    );
    const statePath = diskPowers.joinPath(
      locator.statePath,
      'worker-id512',
      id,
    );
    const ephemeralStatePath = diskPowers.joinPath(
      locator.ephemeralStatePath,
      'worker-id512',
      id,
    );

    await Promise.all([
      diskPowers.makePath(statePath),
      diskPowers.makePath(ephemeralStatePath),
    ]);

    const logPath = diskPowers.joinPath(statePath, 'worker.log');
    const pidPath = diskPowers.joinPath(
      ephemeralStatePath,
      'worker.pid',
    );

    const log = fs.openSync(logPath, 'a');
    const child = popen.fork(
      path,
      [id, sockPath, statePath, ephemeralStatePath, cachePath],
      {
        stdio: ['ignore', log, log, 'pipe', 'pipe', 'ipc'],
        // @ts-ignore Stale Node.js type definition.
        windowsHide: true,
      },
    );
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

    const closed = new Promise(resolve => {
      child.on('exit', () => resolve(undefined));
    });

    await diskPowers.writeFileText(pidPath, `${child.pid}\n`);

    cancelled.catch(async () => {
      child.kill();
    });

    return { reader, writer, closed, pid: child.pid };
  };

  const zero512 =
  '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

  const webPageFormula = {
    type: /** @type {'import-unsafe'} */ ('import-unsafe'),
    worker: `worker-id512:${zero512}`,
    powers: 'host',
    importPath: fileURLToPath(
      new URL('web-page-bundler.js', import.meta.url).href,
    ),
  }

  /**
   *
   * @param {import('./types.js').Locator} locator
   * @param {import('@endo/far').FarRef<unknown>} endoBootstrap
   * @param {(port: Promise<number>) => void} assignWebletPort
   * @param {Promise<never>} cancelled
   * @param {(error: Error) => void} exitWithError
   * @returns {Promise<{ servicesStopped: Promise<void> }>}
   */
  const announceBootstrapReady = async (locator, endoBootstrap, assignWebletPort, cancelled, exitWithError) => {

    const connectionNumbers = (function* generateNumbers() {
      let n = 0;
      for (;;) {
        yield n;
        n += 1;
      }
    })();

    const privatePathService = servePrivatePath(locator.sockPath, endoBootstrap, {
      servePath: networkPowers.servePath,
      connectionNumbers,
      cancelled,
      exitWithError,
    });

    const requestedWebletPortText = env.ENDO_HTTP_PORT;
    const requestedWebletPort = requestedWebletPortText
      ? Number(requestedWebletPortText)
      : defaultHttpPort;
    const privateHttpService = servePrivatePortHttp(
      requestedWebletPort,
      endoBootstrap,
      {
        servePortHttp: networkPowers.servePortHttp,
        connectionNumbers,
        cancelled,
        exitWithError,
      },
    );

    assignWebletPort(privateHttpService.started);

    const services = [privatePathService, privateHttpService];

    await Promise.all(services.map(({ started }) => started)).then(() => {
      informParentWhenReady();
    },
    error => {
      reportErrorToParent(error.message);
      throw error;
    })

    const servicesStopped = Promise.all(services.map(({ stopped }) => stopped)).then(() => {});

    return { servicesStopped };
  }

  return harden({
    // start stop platform hooks (to be removed)
    initializePersistence,
    announceBootstrapReady,
    finalizeInitialization,
    // util
    delay,
    sinkError,
    makeSha512,
    randomHex512,
    // daemonic control powers
    makeWorker,
    // daemonic storage powers
    makeHashedContentWriter,
    makeHashedContentReadeableBlob,
    readFormula,
    writeFormula,
    webPageFormula,
    // petstore
    petStorePowers,
  });
};
