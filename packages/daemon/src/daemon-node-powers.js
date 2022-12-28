// @ts-check
/* global process, setTimeout, clearTimeout */
/* eslint-disable no-void */

import { makePromiseKit } from '@endo/promise-kit';
import { makePipe } from '@endo/stream';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';

/**
 * @param {object} modules
 * @param {typeof import('crypto')} modules.crypto
 * @param {typeof import('net')} modules.net
 * @param {typeof import('fs')} modules.fs
 * @param {typeof import('path')} modules.path
 * @param {typeof import('child_process')} modules.popen
 * @param {typeof import('url')} modules.url
 * @returns {import('./types.js').DaemonicPowers}
 */
export const makePowers = ({ crypto, net, fs, path: fspath, popen, url }) => {
  /** @param {Error} error */
  const sinkError = error => {
    console.error(error);
  };

  /** @param {Error} error */
  const exitOnError = error => {
    console.error(error);
    process.exit(-1);
  };

  const makeSha512 = () => {
    const digester = crypto.createHash('sha512');
    return harden({
      update: chunk => digester.update(chunk),
      digestHex: () => digester.digest('hex'),
    });
  };

  const randomUuid = () => crypto.randomUUID();

  const listenOnPath = async (sockPath, cancelled) => {
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

    const listening = new Promise(resolve =>
      server.listen({ path: sockPath }, () => resolve(undefined)),
    );

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

  /**
   * @param {string} path
   */
  const informParentWhenListeningOnPath = path => {
    if (process.send) {
      process.send({ type: 'listening', path });
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
  const makePath = async path => {
    await fs.promises.mkdir(path, { recursive: true });
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
   * @param {string} uuid
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
    uuid,
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
      [uuid, sockPath, statePath, ephemeralStatePath, cachePath],
      {
        stdio: ['ignore', log, log, 'pipe', 'ipc'],
      },
    );
    const stream = /** @type {import('stream').Duplex} */ (child.stdio[3]);
    assert(stream);
    const reader = makeNodeReader(stream);
    const writer = makeNodeWriter(stream);

    const closed = new Promise(resolve => {
      child.on('exit', () => resolve(undefined));
    });

    await writeFileText(pidPath, `${child.pid}\n`);

    cancelled.catch(async () => {
      child.kill();
    });

    return { reader, writer, closed, pid: child.pid };
  };

  const endoWorkerPath = url.fileURLToPath(
    new URL('worker-node.js', import.meta.url),
  );

  return harden({
    sinkError,
    exitOnError,
    makeSha512,
    randomUuid,
    listenOnPath,
    informParentWhenListeningOnPath,
    makeFileReader,
    makeFileWriter,
    writeFileText,
    readFileText,
    makePath,
    joinPath,
    renamePath,
    delay,
    makeWorker,
    endoWorkerPath,
  });
};
