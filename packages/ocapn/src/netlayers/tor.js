// @ts-check

import fs from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import harden from '@endo/harden';

import { locationToLocationId } from '../client/util.js';

/**
 * @import { Connection, NetLayer, NetlayerHandlers, SocketOperations } from '../client/types.js'
 * @import { OcapnLocation } from '../codecs/components.js'
 */

const { isNaN } = Number;

const TOR_CONTROL_OK = '250 OK';
const TOR_CONTROL_CONTINUATION_PREFIX = '250-';
const TOR_CONTROL_SUCCESS_PREFIX = '250 ';

const SOCKS_VERSION = 0x05;
const SOCKS_NO_AUTHENTICATION = 0x00;
const SOCKS_CONNECT_COMMAND = 0x01;
const SOCKS_ATYP_DOMAIN = 0x03;

export const DEFAULT_TOR_VIRTUAL_PORT = 9045;
export const DEFAULT_TOR_CONTROL_SOCKET_PATH =
  '~/.cache/ocapn/tor/tor-control-sock';
export const DEFAULT_TOR_SOCKS_SOCKET_PATH = '~/.cache/ocapn/tor/tor-socks-sock';
export const DEFAULT_TOR_OCAPN_SOCKET_DIR = '~/.cache/ocapn/tor/ocapn-sockets';

/**
 * @param {Buffer} buffer
 * @returns {Uint8Array}
 */
const bufferToBytes = buffer => {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};

/**
 * @param {string} candidatePath
 * @returns {string}
 */
const expandHomePath = candidatePath => {
  if (candidatePath === '~') {
    return os.homedir();
  }
  if (candidatePath.startsWith('~/')) {
    return path.join(os.homedir(), candidatePath.slice(2));
  }
  return candidatePath;
};

/**
 * @param {string} command
 * @param {string} unixPath
 * @returns {string}
 */
const makeTorPathError = (command, unixPath) => {
  return `Unable to ${command} unix socket path: ${unixPath}`;
};

/**
 * @typedef {object} LineReader
 * @property {() => Promise<string>} readLine
 * @property {() => void} dispose
 */

/**
 * @param {net.Socket} socket
 * @returns {LineReader}
 */
const makeSocketLineReader = socket => {
  /** @type {Array<{resolve: (line: string) => void, reject: (reason?: any) => void}>} */
  const waiters = [];
  let bufferedText = '';
  /** @type {Error | undefined} */
  let terminalError;
  let isDisposed = false;

  const failWaiters = error => {
    terminalError = error;
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter.reject(error);
      }
    }
  };

  const popLine = () => {
    const newLineIndex = bufferedText.indexOf('\n');
    if (newLineIndex < 0) {
      return undefined;
    }
    const line = bufferedText.slice(0, newLineIndex).replace(/\r$/, '');
    bufferedText = bufferedText.slice(newLineIndex + 1);
    return line;
  };

  const flushWaiters = () => {
    if (isDisposed) {
      return;
    }
    while (waiters.length > 0) {
      const line = popLine();
      if (line === undefined) {
        return;
      }
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve(line);
      }
    }
  };

  const onData = chunk => {
    bufferedText += chunk.toString('utf8');
    flushWaiters();
  };
  const onError = err => {
    failWaiters(err instanceof Error ? err : Error(String(err)));
  };
  const onClose = () => {
    if (!terminalError) {
      failWaiters(Error('Socket closed while waiting for Tor control response'));
    }
  };

  socket.on('data', onData);
  socket.on('error', onError);
  socket.on('close', onClose);

  return {
    readLine() {
      const line = popLine();
      if (line !== undefined) {
        return Promise.resolve(line);
      }
      if (terminalError) {
        return Promise.reject(terminalError);
      }
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    dispose() {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      failWaiters(Error('Tor control reader disposed'));
    },
  };
};

/**
 * @param {net.Socket} socket
 * @returns {Promise<void>}
 */
const waitForSocketConnect = socket => {
  return new Promise((resolve, reject) => {
    if (socket.readyState === 'open') {
      resolve();
      return;
    }
    const onConnect = () => {
      socket.off('error', onError);
      resolve();
    };
    const onError = err => {
      socket.off('connect', onConnect);
      reject(err);
    };
    socket.once('connect', onConnect);
    socket.once('error', onError);
  });
};

/**
 * @param {string} unixPath
 * @returns {Promise<net.Socket>}
 */
const connectUnixSocket = async unixPath => {
  const socket = net.createConnection({ path: unixPath });
  try {
    await waitForSocketConnect(socket);
    return socket;
  } catch (error) {
    socket.destroy();
    throw error;
  }
};

/**
 * @param {net.Socket} socket
 * @param {string} line
 * @returns {void}
 */
const writeControlLine = (socket, line) => {
  socket.write(`${line}\r\n`);
};

/**
 * @param {LineReader} lineReader
 * @returns {Promise<string[]>}
 */
const readTorControlReply = async lineReader => {
  /** @type {string[]} */
  const lines = [];
  while (true) {
    const line = await lineReader.readLine();
    lines.push(line);
    if (line.startsWith(TOR_CONTROL_CONTINUATION_PREFIX)) {
      // Multi-line continuation: keep reading.
      // Example:
      // 250-ServiceID=...
      // 250-PrivateKey=...
      // 250 OK
      // eslint-disable-next-line no-continue
      continue;
    }
    if (line.startsWith(TOR_CONTROL_SUCCESS_PREFIX)) {
      return lines;
    }
    throw Error(`Unexpected Tor control response line: ${line}`);
  }
};

/**
 * @param {string[]} lines
 * @returns {{ serviceId: string, privateKey: string | undefined }}
 */
export const parseAddOnionReplyLines = lines => {
  let serviceId;
  /** @type {string | undefined} */
  let privateKey;
  for (const line of lines) {
    if (line.startsWith('250-ServiceID=')) {
      serviceId = line.slice('250-ServiceID='.length);
    } else if (line.startsWith('250-PrivateKey=')) {
      privateKey = line.slice('250-PrivateKey='.length);
    }
  }
  if (!serviceId) {
    throw Error(`ADD_ONION did not return ServiceID. Reply: ${lines.join(' | ')}`);
  }
  return { serviceId, privateKey };
};

/**
 * @param {object} options
 * @param {string} options.targetSocketPath
 * @param {number} options.virtualPort
 * @param {string} [options.privateKey]
 * @returns {string}
 */
export const buildAddOnionCommand = ({
  targetSocketPath,
  virtualPort,
  privateKey,
}) => {
  if (privateKey) {
    return `ADD_ONION ${privateKey} PORT=${virtualPort},unix:${targetSocketPath}`;
  }
  return `ADD_ONION NEW:ED25519-V3 PORT=${virtualPort},unix:${targetSocketPath}`;
};

/**
 * @param {number} code
 * @returns {string}
 */
const describeSocks5ReplyCode = code => {
  switch (code) {
    case 0x00:
      return 'succeeded';
    case 0x01:
      return 'general SOCKS server failure';
    case 0x02:
      return 'connection not allowed by ruleset';
    case 0x03:
      return 'network unreachable';
    case 0x04:
      return 'host unreachable';
    case 0x05:
      return 'connection refused by destination host';
    case 0x06:
      return 'TTL expired';
    case 0x07:
      return 'command not supported';
    case 0x08:
      return 'address type not supported';
    default:
      return `unassigned error (${code})`;
  }
};

/**
 * @param {string} onionHostname
 * @param {number} port
 * @returns {Buffer}
 */
export const buildSocks5ConnectRequest = (onionHostname, port) => {
  const hostBytes = Buffer.from(onionHostname, 'utf8');
  if (hostBytes.length > 255) {
    throw Error(
      `SOCKS5 domain must be <=255 bytes, got ${hostBytes.length}: ${onionHostname}`,
    );
  }
  const request = Buffer.alloc(5 + hostBytes.length + 2);
  request[0] = SOCKS_VERSION;
  request[1] = SOCKS_CONNECT_COMMAND;
  request[2] = 0x00;
  request[3] = SOCKS_ATYP_DOMAIN;
  request[4] = hostBytes.length;
  hostBytes.copy(request, 5);
  request.writeUInt16BE(port, 5 + hostBytes.length);
  return request;
};

/**
 * @param {Buffer} buffer
 * @returns {number | undefined} Number of bytes consumed when a full reply is available.
 */
export const parseSocks5ConnectReply = buffer => {
  if (buffer.length < 5) {
    return undefined;
  }
  if (buffer[0] !== SOCKS_VERSION) {
    throw Error(`Unexpected SOCKS version in connect reply: ${buffer[0]}`);
  }
  const replyCode = buffer[1];
  if (replyCode !== 0x00) {
    throw Error(
      `SOCKS5 connect failed: ${describeSocks5ReplyCode(replyCode)} (${replyCode})`,
    );
  }

  const atyp = buffer[3];
  let expectedLength;
  if (atyp === 0x01) {
    expectedLength = 4 + 4 + 2;
  } else if (atyp === 0x04) {
    expectedLength = 4 + 16 + 2;
  } else if (atyp === SOCKS_ATYP_DOMAIN) {
    const domainLength = buffer[4];
    expectedLength = 4 + 1 + domainLength + 2;
  } else {
    throw Error(`Unsupported SOCKS5 ATYP value in connect reply: ${atyp}`);
  }
  if (buffer.length < expectedLength) {
    return undefined;
  }
  return expectedLength;
};

/**
 * @typedef {object} ConnectionSocketPair
 * @property {Connection} connection
 * @property {net.Socket} socket
 */

/**
 * Debug interface for Tor netlayer.
 * @typedef {object} TorNetLayerDebug
 * @property {string} onionServiceId
 * @property {string | undefined} onionPrivateKey
 * @property {string} ocapnSocketPath
 * @property {string} controlSocketPath
 * @property {string} socksSocketPath
 *
 * @typedef {NetLayer & { _debug: TorNetLayerDebug }} TorNetLayer
 */

/**
 * @param {object} options
 * @param {NetlayerHandlers} options.handlers
 * @param {import('../client/types.js').Logger} options.logger
 * @param {string} [options.controlSocketPath]
 * @param {string} [options.socksSocketPath]
 * @param {string} [options.ocapnSocketDir]
 * @param {string} [options.privateKey]
 * @param {string} [options.serviceId]
 * @param {number} [options.virtualPort]
 * @returns {Promise<TorNetLayer>}
 */
export const makeTorNetLayer = async ({
  handlers,
  logger,
  controlSocketPath = DEFAULT_TOR_CONTROL_SOCKET_PATH,
  socksSocketPath = DEFAULT_TOR_SOCKS_SOCKET_PATH,
  ocapnSocketDir = DEFAULT_TOR_OCAPN_SOCKET_DIR,
  privateKey,
  serviceId,
  virtualPort = DEFAULT_TOR_VIRTUAL_PORT,
}) => {
  if ((privateKey && !serviceId) || (!privateKey && serviceId)) {
    throw Error(
      'privateKey and serviceId must both be provided when restoring an onion service',
    );
  }
  if (isNaN(virtualPort) || virtualPort <= 0 || virtualPort > 65535) {
    throw Error(`Invalid Tor virtual port: ${virtualPort}`);
  }

  const resolvedControlSocketPath = expandHomePath(controlSocketPath);
  const resolvedSocksSocketPath = expandHomePath(socksSocketPath);
  const resolvedOcapnSocketDir = expandHomePath(ocapnSocketDir);

  await fs.mkdir(resolvedOcapnSocketDir, { recursive: true });
  const ocapnSocketPath = path.join(
    resolvedOcapnSocketDir,
    `ocapn-${process.pid}-${randomBytes(6).toString('hex')}.sock`,
  );

  /** @type {net.Server | undefined} */
  let server;
  /** @type {net.Socket | undefined} */
  let torControlSocket;
  /** @type {LineReader | undefined} */
  let torControlLineReader;
  /** @type {string} */
  let actualServiceId;
  /** @type {string | undefined} */
  let onionPrivateKey;

  try {
    server = net.createServer();
    await new Promise((resolve, reject) => {
      server.listen(ocapnSocketPath, err => {
        if (err) {
          reject(
            Error(`${makeTorPathError('listen on', ocapnSocketPath)}: ${err}`),
          );
        } else {
          resolve(undefined);
        }
      });
    });

    torControlSocket = await connectUnixSocket(resolvedControlSocketPath);
    torControlLineReader = makeSocketLineReader(torControlSocket);

    writeControlLine(torControlSocket, 'AUTHENTICATE');
    const authReply = await readTorControlReply(torControlLineReader);
    if (
      authReply.length < 1 ||
      authReply[authReply.length - 1] !== TOR_CONTROL_OK
    ) {
      throw Error(`Tor AUTHENTICATE failed: ${authReply.join(' | ')}`);
    }

    writeControlLine(
      torControlSocket,
      buildAddOnionCommand({
        targetSocketPath: ocapnSocketPath,
        virtualPort,
        privateKey,
      }),
    );
    const addOnionReply = await readTorControlReply(torControlLineReader);
    const parsedAddOnionReply = parseAddOnionReplyLines(addOnionReply);
    actualServiceId = parsedAddOnionReply.serviceId;

    if (serviceId && serviceId !== actualServiceId) {
      throw Error(
        `ADD_ONION service id mismatch: expected ${serviceId}, got ${actualServiceId}`,
      );
    }
    onionPrivateKey = privateKey || parsedAddOnionReply.privateKey;
  } catch (error) {
    if (torControlLineReader) {
      torControlLineReader.dispose();
    }
    if (torControlSocket) {
      torControlSocket.destroy();
    }
    if (server) {
      server.close();
    }
    await fs.rm(ocapnSocketPath, { force: true }).catch(() => undefined);
    throw error;
  }

  logger.log('Tor onion service registered', actualServiceId);
  logger.info('Tor control socket path', resolvedControlSocketPath);
  logger.info('Tor SOCKS socket path', resolvedSocksSocketPath);
  logger.info('Tor OCapN unix listener path', ocapnSocketPath);

  /** @type {OcapnLocation} */
  const localLocation = {
    type: 'ocapn-peer',
    transport: 'onion',
    designator: actualServiceId,
    hints: false,
  };

  /** @type {Map<string, Connection>} */
  const outgoingConnections = new Map();
  /** @type {Set<net.Socket>} */
  const activeSockets = new Set();

  /**
   * @param {net.Socket} socket
   * @param {Connection} connection
   * @param {() => void} [onClose]
   */
  const setupSocketHandlers = (socket, connection, onClose, onData) => {
    socket.on('data', data => {
      if (onData) {
        onData(data);
        return;
      }
      if (connection.isDestroyed) {
        return;
      }
      handlers.handleMessageData(connection, bufferToBytes(data));
    });
    socket.on('error', err => {
      logger.error('Tor netlayer socket error:', err);
      connection.end();
    });
    socket.on('close', () => {
      activeSockets.delete(socket);
      if (onClose) {
        onClose();
      }
      handlers.handleConnectionClose(connection);
    });
  };

  /**
   * @param {Connection} connection
   * @param {net.Socket} socket
   * @param {{stage: 'auth-reply' | 'connect-reply' | 'connected', buffer: Buffer, pendingWrites: Uint8Array[]}} state
   * @param {string} designator
   * @returns {void}
   */
  const processSocks5HandshakeChunk = (connection, socket, state, designator) => {
    if (state.stage === 'connected') {
      if (state.buffer.length > 0) {
        handlers.handleMessageData(connection, bufferToBytes(state.buffer));
        state.buffer = Buffer.alloc(0);
      }
      return;
    }

    if (state.stage === 'auth-reply') {
      if (state.buffer.length < 2) {
        return;
      }
      const version = state.buffer[0];
      const method = state.buffer[1];
      if (version !== SOCKS_VERSION || method !== SOCKS_NO_AUTHENTICATION) {
        throw Error(
          `Unexpected SOCKS5 auth reply version=${version} method=${method}`,
        );
      }
      state.buffer = state.buffer.subarray(2);
      socket.write(
        buildSocks5ConnectRequest(`${designator}.onion`, virtualPort),
      );
      state.stage = 'connect-reply';
    }

    if (state.stage === 'connect-reply') {
      const consumed = parseSocks5ConnectReply(state.buffer);
      if (consumed === undefined) {
        return;
      }
      state.buffer = state.buffer.subarray(consumed);
      state.stage = 'connected';
      for (const pendingWrite of state.pendingWrites) {
        socket.write(pendingWrite);
      }
      state.pendingWrites.length = 0;
    }

    if (state.stage === 'connected' && state.buffer.length > 0) {
      if (!connection.isDestroyed) {
        handlers.handleMessageData(connection, bufferToBytes(state.buffer));
      }
      state.buffer = Buffer.alloc(0);
    }
  };

  /**
   * @param {OcapnLocation} location
   * @returns {ConnectionSocketPair}
   */
  const internalEstablishConnection = location => {
    if (location.transport !== localLocation.transport) {
      throw Error(`Unsupported transport: ${location.transport}`);
    }
    const designator = location.designator;
    if (!designator) {
      throw Error('Tor connection requires a designator');
    }

    const socket = net.createConnection({ path: resolvedSocksSocketPath });
    activeSockets.add(socket);
    const state = {
      stage: /** @type {'auth-reply' | 'connect-reply' | 'connected'} */ (
        'auth-reply'
      ),
      buffer: Buffer.alloc(0),
      /** @type {Uint8Array[]} */
      pendingWrites: [],
    };

    /** @type {SocketOperations} */
    const socketOps = {
      write(bytes) {
        if (state.stage === 'connected') {
          socket.write(bytes);
        } else {
          state.pendingWrites.push(bytes);
        }
      },
      end() {
        socket.end();
      },
    };

    // eslint-disable-next-line no-use-before-define
    const connection = handlers.makeConnection(netlayer, true, socketOps);

    socket.on('connect', () => {
      socket.write(
        Buffer.from([
          SOCKS_VERSION,
          0x01, // one auth method offered
          SOCKS_NO_AUTHENTICATION,
        ]),
      );
    });

    setupSocketHandlers(
      socket,
      connection,
      () => {
        outgoingConnections.delete(location.designator);
      },
      chunk => {
        if (state.stage === 'connected') {
          if (!connection.isDestroyed) {
            handlers.handleMessageData(connection, bufferToBytes(chunk));
          }
          return;
        }
        state.buffer = Buffer.concat([state.buffer, chunk]);
        try {
          processSocks5HandshakeChunk(connection, socket, state, designator);
        } catch (error) {
          logger.error('SOCKS5 handshake failed', error);
          connection.end();
        }
      },
    );

    return { connection, socket };
  };

  /**
   * @param {OcapnLocation} location
   * @returns {Connection}
   */
  const connect = location => {
    logger.info('Connecting over Tor to', location.designator);
    const { connection } = internalEstablishConnection(location);
    return connection;
  };

  /**
   * @param {OcapnLocation} location
   * @returns {Connection}
   */
  const lookupOrConnect = location => {
    if (location.transport !== localLocation.transport) {
      throw Error(`Unsupported transport: ${location.transport}`);
    }
    const existingConnection = outgoingConnections.get(location.designator);
    if (existingConnection && !existingConnection.isDestroyed) {
      return existingConnection;
    }
    if (existingConnection) {
      outgoingConnections.delete(location.designator);
    }
    const newConnection = connect(location);
    outgoingConnections.set(location.designator, newConnection);
    return newConnection;
  };

  const shutdown = () => {
    server.close();
    torControlLineReader.dispose();
    torControlSocket.end();
    for (const socket of activeSockets) {
      socket.destroy();
    }
    activeSockets.clear();
    outgoingConnections.clear();
    fs.rm(ocapnSocketPath, { force: true }).catch(err => {
      logger.error(`Failed to remove OCapN Tor socket ${ocapnSocketPath}`, err);
    });
  };

  /** @type {TorNetLayer} */
  const netlayer = harden({
    location: localLocation,
    locationId: locationToLocationId(localLocation),
    connect: lookupOrConnect,
    shutdown,
    // eslint-disable-next-line no-underscore-dangle
    _debug: {
      onionServiceId: actualServiceId,
      onionPrivateKey,
      ocapnSocketPath,
      controlSocketPath: resolvedControlSocketPath,
      socksSocketPath: resolvedSocksSocketPath,
    },
  });

  server.on('connection', socket => {
    activeSockets.add(socket);
    const socketOps = {
      write(bytes) {
        socket.write(bytes);
      },
      end() {
        socket.end();
      },
    };
    const connection = handlers.makeConnection(netlayer, false, socketOps);
    setupSocketHandlers(socket, connection);
  });

  return netlayer;
};
