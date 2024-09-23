// @ts-check
/* eslint-disable no-void */

import { makePromiseKit } from '@endo/promise-kit';
import { makePipe } from '@endo/stream';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';
import { makeNetstringCapTP } from './connection.js';

/* @import { Config, CryptoPowers, DaemonWorkerFacet, DaemonicPersistencePowers, DaemonicPowers, EndoReadable, FilePowers, Formula, NetworkPowers, SocketPowers, WorkerDaemonFacet } from './types.js' */

const textEncoder = new TextEncoder();

/*
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

  /* @type {SocketPowers['servePort']} */
  const servePort = async ({ port, host = '0.0.0.0', cancelled }) =>
    serveListener(
      server =>
        new Promise(resolve =>
          server.listen(port, host, () => resolve(server.address().port)),
        ),
      cancelled,
    );

  /* @type {SocketPowers['connectPort']} */
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

  /* @type {SocketPowers['servePath']} */
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

/*
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

/*
 * @param {Config} config
 * @param {import('url').fileURLToPath} fileURLToPath
 * @param {FilePowers} filePowers
 * @param {typeof import('fs')} fs
 * @param {typeof import('child_process')} popen
 */
export const makeDaemonicControlPowers = (
  config,
  fileURLToPath,
  popen,
  captpOpts,
) => {
  const endoWorkerPath = config.workerPath || fileURLToPath(
    new URL('worker-node.js', import.meta.url),
  );

  /*
   * @param {string} workerId
   * @param {DaemonWorkerFacet} daemonWorkerFacet
   * @param {Promise<never>} cancelled
   */
  const makeWorker = async (workerId, daemonWorkerFacet, cancelled, vatState) => {
    const { statePath, ephemeralStatePath } = config;

    // const workerStatePath = filePowers.joinPath(statePath, 'worker', workerId);
    // const workerEphemeralStatePath = filePowers.joinPath(
    //   ephemeralStatePath,
    //   'worker',
    //   workerId,
    // );

    // await Promise.all([
    //   filePowers.makePath(workerStatePath),
    //   filePowers.makePath(workerEphemeralStatePath),
    // ]);

    // const logPath = filePowers.joinPath(workerStatePath, 'worker.log');
    // const pidPath = filePowers.joinPath(workerEphemeralStatePath, 'worker.pid');

    // const log = fs.openSync(logPath, 'a');
    const vatStateBlob = JSON.stringify(vatState);
    const child = popen.fork(endoWorkerPath, [vatStateBlob], {
      // stdio: ['ignore', log, log, 'pipe', 'pipe', 'ipc'],
      stdio: ['ignore', 'inherit', 'inherit', 'pipe', 'pipe', 'ipc'],
      // stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'ipc'],
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

    // await filePowers.writeFileText(pidPath, `${child.pid}\n`);

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
      captpOpts,
    );

    capTpClosed.finally(() => {
      console.log(
        `Endo worker connection closed for PID ${workerPid} with unique identifier ${workerId}`,
      );
    });

    const workerTerminated = Promise.race([workerClosed, capTpClosed]);

    /* @type {ERef<WorkerDaemonFacet>} */
    const workerDaemonFacet = getBootstrap();

    return { workerTerminated, workerDaemonFacet };
  };

  return harden({
    makeWorker,
  });
};

/*
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

  const daemonicControlPowers = makeDaemonicControlPowers(
    config,
    fileURLToPath,
    filePowers,
    fs,
    popen,
  );

  return harden({
    crypto: cryptoPowers,
    control: daemonicControlPowers,
  });
};
