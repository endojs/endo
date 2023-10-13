// @ts-check
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

const zero512 =
  '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

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
        if (req.method === undefined) {
          throw Error('expected method in request');
        }
        if (req.url === undefined) {
          throw Error('expected url in request');
        }

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
export const makeNetworkPowers = ({ http, ws, net }) => {
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

  const connectionNumbers = (function* generateNumbers() {
    let n = 0;
    for (;;) {
      yield n;
      n += 1;
    }
  })();

  /**
   * @param {import('@endo/far').FarRef<unknown>} endoBootstrap
   * @param {string} sockPath
   * @param {Promise<never>} cancelled
   * @param {(error: Error) => void} exitWithError
   * @returns {{ started: () => Promise<void>, stopped: Promise<void> }}
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

  /**
   * @param {import('@endo/far').FarRef<unknown>} endoBootstrap
   * @param {number} port
   * @param {(port: Promise<number>) => void} assignWebletPort
   * @param {Promise<never>} cancelled
   * @param {(error: Error) => void} exitWithError
   * @returns {{ started: () => Promise<void>, stopped: Promise<void> }}
   */
  const makePrivateHttpService = (
    endoBootstrap,
    port,
    assignWebletPort,
    cancelled,
    exitWithError,
  ) => {
    const privateHttpService = servePrivatePortHttp(port, endoBootstrap, {
      servePortHttp,
      connectionNumbers,
      cancelled,
      exitWithError,
    });

    assignWebletPort(privateHttpService.started);

    return privateHttpService;
  };

  return harden({
    servePortHttp,
    servePort,
    servePath,
    makePrivatePathService,
    makePrivateHttpService,
  });
};

export const makeFilePowers = ({ fs, path: fspath }) => {
  /**
   * @param {string} path
   */
  const makeFileReader = path => {
    const nodeReadStream = fs.createReadStream(path);
    return makeNodeReader(nodeReadStream);
  };

  /**
   * @param {string} path
   * @returns {import('@endo/stream').Writer<Uint8Array>}
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
};

/**
 * @param {typeof import('crypto')} crypto
 * @returns {import('./types.js').CryptoPowers}
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
 * @param {(URL) => string} fileURLToPath
 * @param {import('./types.js').FilePowers} filePowers
 * @param {import('./types.js').CryptoPowers} cryptoPowers
 * @param {import('./types.js').Locator} locator
 * @param {boolean} [includeWebPageBundler]
 * @returns {import('./types.js').DaemonicPersistencePowers}
 */
export const makeDaemonicPersistencePowers = (
  fileURLToPath,
  filePowers,
  cryptoPowers,
  locator,
  includeWebPageBundler = true,
) => {
  const initializePersistence = async () => {
    const { statePath, ephemeralStatePath, cachePath } = locator;
    const statePathP = filePowers.makePath(statePath);
    const ephemeralStatePathP = filePowers.makePath(ephemeralStatePath);
    const cachePathP = filePowers.makePath(cachePath);
    await Promise.all([statePathP, cachePathP, ephemeralStatePathP]);
  };

  const makeContentSha512Store = () => {
    const { statePath } = locator;
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
       * @returns {import('./types.js').AlmostEndoReadable}
       */
      fetch(sha512) {
        const storagePath = filePowers.joinPath(storageDirectoryPath, sha512);
        const stream = () => {
          const reader = filePowers.makeFileReader(storagePath);
          return makeReaderRef(reader);
        };
        const text = async () => {
          return filePowers.readFileText(storagePath);
        };
        const json = async () => {
          return JSON.parse(await text());
        };
        return harden({
          sha512: () => sha512,
          stream,
          text,
          json,
          [Symbol.asyncIterator]: () => stream(),
        });
      },
    });
  };

  /**
   * @param {string} formulaType
   * @param {string} formulaId512
   */
  const makeFormulaPath = (formulaType, formulaId512) => {
    const { statePath } = locator;
    if (formulaId512.length < 3) {
      throw new TypeError(
        `Invalid formula identifier ${q(formulaId512)} for formula of type ${q(
          formulaType,
        )}`,
      );
    }
    const head = formulaId512.slice(0, 2);
    const tail = formulaId512.slice(3);
    const directory = filePowers.joinPath(
      statePath,
      'formulas',
      formulaType,
      head,
    );
    const file = filePowers.joinPath(directory, `${tail}.json`);
    return harden({ directory, file });
  };

  /**
   * @param {string} prefix
   * @param {string} formulaNumber
   * @returns {Promise<import('./types.js').Formula>}
   */
  const readFormula = async (prefix, formulaNumber) => {
    const { file: formulaPath } = makeFormulaPath(prefix, formulaNumber);
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
  const writeFormula = async (formula, formulaType, formulaId512) => {
    const { directory, file } = makeFormulaPath(formulaType, formulaId512);
    // TODO Take care to write atomically with a rename here.
    await filePowers.makePath(directory);
    await filePowers.writeFileText(file, `${q(formula)}\n`);
  };

  const webPageBundlerFormula = includeWebPageBundler
    ? {
        type: /** @type {'import-unsafe'} */ ('import-unsafe'),
        worker: `worker-id512:${zero512}`,
        powers: 'host',
        importPath: fileURLToPath(
          new URL('web-page-bundler.js', import.meta.url).href,
        ),
      }
    : undefined;

  return harden({
    initializePersistence,
    makeContentSha512Store,
    readFormula,
    writeFormula,
    webPageBundlerFormula,
  });
};

export const makeDaemonicControlPowers = (
  locator,
  fileURLToPath,
  filePowers,
  fs,
  popen,
) => {
  const endoWorkerPath = fileURLToPath(
    new URL('worker-node.js', import.meta.url),
  );

  /**
   * @param {string} id
   * @param {Promise<never>} cancelled
   */
  const makeWorker = async (id, cancelled) => {
    const { cachePath, statePath, ephemeralStatePath, sockPath } = locator;

    const workerCachePath = filePowers.joinPath(cachePath, 'worker-id512', id);
    const workerStatePath = filePowers.joinPath(statePath, 'worker-id512', id);
    const workerEphemeralStatePath = filePowers.joinPath(
      ephemeralStatePath,
      'worker-id512',
      id,
    );

    await Promise.all([
      filePowers.makePath(workerStatePath),
      filePowers.makePath(workerEphemeralStatePath),
    ]);

    const logPath = filePowers.joinPath(workerStatePath, 'worker.log');
    const pidPath = filePowers.joinPath(workerEphemeralStatePath, 'worker.pid');

    const log = fs.openSync(logPath, 'a');
    const child = popen.fork(
      endoWorkerPath,
      [
        id,
        sockPath,
        workerStatePath,
        workerEphemeralStatePath,
        workerCachePath,
      ],
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

    await filePowers.writeFileText(pidPath, `${child.pid}\n`);

    cancelled.catch(async () => {
      child.kill();
    });

    return { reader, writer, closed, pid: child.pid };
  };

  return harden({
    makeWorker,
  });
};

/**
 * @param {object} opts
 * @param {import('./types.js').Locator} opts.locator
 * @param {typeof import('fs')} opts.fs
 * @param {typeof import('child_process')} opts.popen
 * @param {typeof import('url')} opts.url
 * @param {import('./types.js').FilePowers} opts.filePowers
 * @param {import('./types.js').CryptoPowers} opts.cryptoPowers
 * @returns {import('./types.js').DaemonicPowers}
 */
export const makeDaemonicPowers = ({
  locator,
  fs,
  popen,
  url,
  filePowers,
  cryptoPowers,
}) => {
  const { fileURLToPath } = url;

  const petStorePowers = makePetStoreMaker(filePowers, locator);
  const daemonicPersistencePowers = makeDaemonicPersistencePowers(
    fileURLToPath,
    filePowers,
    cryptoPowers,
    locator,
  );
  const daemonicControlPowers = makeDaemonicControlPowers(
    locator,
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
