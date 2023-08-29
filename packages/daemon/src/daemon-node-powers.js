// @ts-check
/* global process, setTimeout, clearTimeout */
/* eslint-disable no-void */

import { makePromiseKit } from '@endo/promise-kit';
import { makePipe } from '@endo/stream';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';

const textEncoder = new TextEncoder();
const medialIterationResult = harden({ done: false });
const finalIterationResult = harden({ done: false });

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
   * @param {string} id
   * @param {string} path
   * @param {string} logPath
   * @param {string} pidPath
   * @param {string} sockPath
   * @param {string} statePath
   * @param {string} ephemeralStatePath
   * @param {string} cachePath
   * @param {Promise<never>} cancelled
   */
  const makeWorker = async (
    id,
    path,
    logPath,
    pidPath,
    sockPath,
    statePath,
    ephemeralStatePath,
    cachePath,
    cancelled,
  ) => {
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

    await writeFileText(pidPath, `${child.pid}\n`);

    cancelled.catch(async () => {
      child.kill();
    });

    return { reader, writer, closed, pid: child.pid };
  };

  const { fileURLToPath } = url;

  const endoWorkerPath = fileURLToPath(
    new URL('worker-node.js', import.meta.url),
  );

  return harden({
    kill: pid => kill(pid),
    env: { ...env },
    sinkError,
    makeSha512,
    randomHex512,
    servePort,
    servePath,
    informParentWhenReady,
    reportErrorToParent,
    makeFileReader,
    makeFileWriter,
    writeFileText,
    readFileText,
    readDirectory,
    makePath,
    joinPath,
    removePath,
    renamePath,
    delay,
    makeWorker,
    endoWorkerPath,
    fileURLToPath,

    ...makeHttpPowers({ http, ws }),
  });
};
