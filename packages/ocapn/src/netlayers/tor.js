// @ts-check
/* global setTimeout */

import fs from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { Buffer } from 'buffer';
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

// Default SOCKS5 dial retry policy. We only retry on transient reply codes
// (see `TRANSIENT_SOCKS5_REPLY_CODES`). Total worst-case wait is
// `sum(SOCKS5_DIAL_BACKOFF_MS) ≈ 37s` plus per-attempt timeout, which is
// short enough to keep CI responsive but long enough to ride out a fresh
// hidden-service descriptor not yet replicating to HSDir relays.
const DEFAULT_SOCKS5_DIAL_MAX_ATTEMPTS = 4;
const SOCKS5_DIAL_BACKOFF_MS = [2000, 5000, 10000, 20000];

export const DEFAULT_TOR_VIRTUAL_PORT = 9045;
export const DEFAULT_TOR_CONTROL_SOCKET_PATH =
  '~/.cache/ocapn/tor/tor-control-sock';
export const DEFAULT_TOR_SOCKS_SOCKET_PATH =
  '~/.cache/ocapn/tor/tor-socks-sock';
export const DEFAULT_TOR_OCAPN_SOCKET_DIR = '~/.cache/ocapn/tor/ocapn-sockets';

// Tor v3 hidden services advertise a 56-char lowercase base32 service id
// (32-byte ed25519 public key + 2-byte checksum + 1-byte version, base32
// encoded). See `rend-spec-v3.txt` section 6 in the tor-spec repo. Anything
// that is not exactly this shape can not be a valid onion address and must
// be rejected before we use it as part of a SOCKS5 dial target or splice
// it into log messages.
const TOR_V3_SERVICE_ID_PATTERN = /^[a-z2-7]{56}$/u;

/**
 * @param {unknown} designator
 * @returns {designator is string}
 */
export const isV3OnionServiceId = designator => {
  return (
    typeof designator === 'string' && TOR_V3_SERVICE_ID_PATTERN.test(designator)
  );
};

/**
 * @param {unknown} designator
 * @returns {string}
 */
const assertV3OnionServiceId = designator => {
  if (!isV3OnionServiceId(designator)) {
    // Avoid echoing arbitrary peer-supplied bytes into the error message;
    // the type/length tell the caller exactly what's wrong without leaking.
    const kind = typeof designator;
    const length =
      kind === 'string' ? /** @type {string} */ (designator).length : 'n/a';
    throw Error(
      `Tor designator must be a 56-character lowercase base32 v3 onion service id (got kind=${kind}, length=${length})`,
    );
  }
  return /** @type {string} */ (designator);
};

/**
 * @param {Buffer} buffer
 * @returns {Uint8Array}
 */
const bufferToBytes = buffer => {
  // Keep handshake/decoder paths compatible with BufferReader.fromBytes(),
  // which currently rejects Uint8Array views with non-zero byteOffset.
  return new Uint8Array(buffer);
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
      failWaiters(
        Error('Socket closed while waiting for Tor control response'),
      );
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
    /** @type {(err: Error) => void} */
    let onError = () => {};
    const onConnect = () => {
      socket.off('error', onError);
      resolve();
    };
    onError = err => {
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
  await undefined;
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
  await undefined;
  /**
   * @param {string[]} lines
   * @returns {Promise<string[]>}
   */
  const readNext = async lines => {
    const line = await lineReader.readLine();
    const nextLines = [...lines, line];
    if (line.startsWith(TOR_CONTROL_CONTINUATION_PREFIX)) {
      // Multi-line continuation:
      // 250-ServiceID=...
      // 250-PrivateKey=...
      // 250 OK
      return readNext(nextLines);
    }
    if (line.startsWith(TOR_CONTROL_SUCCESS_PREFIX)) {
      return nextLines;
    }
    throw Error(`Unexpected Tor control response line: ${line}`);
  };
  return readNext([]);
};

/**
 * Replace any `250-PrivateKey=…` line with a redacted placeholder so the
 * private onion key never leaks through error messages, logs, or test
 * output. Other reply lines are returned verbatim — they don't contain
 * secrets and remain useful for debugging.
 *
 * @param {string[]} lines
 * @returns {string[]}
 */
const redactAddOnionReplyLines = lines =>
  lines.map(line =>
    line.startsWith('250-PrivateKey=') ? '250-PrivateKey=[REDACTED]' : line,
  );

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
    throw Error(
      `ADD_ONION did not return ServiceID. Reply: ${redactAddOnionReplyLines(
        lines,
      ).join(' | ')}`,
    );
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

// SOCKS5 reply codes that indicate a transient Tor hidden-service lookup
// problem rather than a permanent dial failure. Tor returns `0x06` (TTL
// expired) when its hidden-service descriptor fetch budget runs out, and
// occasionally `0x04` (host unreachable) when no HSDir replied yet. Both
// recover once the descriptor finishes propagating, so callers should
// retry rather than treat the connection as dead.
const TRANSIENT_SOCKS5_REPLY_CODES = new Set([0x04, 0x06]);

/**
 * @param {unknown} error
 * @returns {boolean}
 */
const isTransientSocks5DialError = error => {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = /** @type {{socksReplyCode?: unknown}} */ (
    /** @type {unknown} */ (error)
  ).socksReplyCode;
  return typeof code === 'number' && TRANSIENT_SOCKS5_REPLY_CODES.has(code);
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
    const error = Error(
      `SOCKS5 connect failed: ${describeSocks5ReplyCode(replyCode)} (${replyCode})`,
    );
    // Tagging the reply code lets higher layers distinguish transient HS
    // descriptor-propagation failures (worth retrying) from permanent
    // refusals (e.g. `command not supported`, `connection refused`).
    /** @type {Error & {socksReplyCode: number}} */ (error).socksReplyCode =
      replyCode;
    throw error;
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
    `ocapn-${randomBytes(8).toString('hex')}.sock`,
  );

  const server = net.createServer();
  /** @type {Set<net.Socket>} */
  const activeSockets = new Set();
  /** @type {Set<net.Socket>} */
  const pendingIncomingSockets = new Set();
  /** @type {(socket: net.Socket) => void} */
  let handleIncomingSocket = socket => {
    pendingIncomingSockets.add(socket);
  };
  server.on('connection', socket => {
    handleIncomingSocket(socket);
  });

  /** @type {net.Socket | undefined} */
  let torControlSocket;
  /** @type {LineReader | undefined} */
  let torControlLineReader;
  /** @type {string} */
  let actualServiceId;
  /** @type {string | undefined} */
  let onionPrivateKey;

  try {
    await new Promise((resolve, reject) => {
      let onError = () => {};
      const onListening = () => {
        server.off('error', onError);
        resolve(undefined);
      };
      onError = err => {
        server.off('listening', onListening);
        reject(
          Error(`${makeTorPathError('listen on', ocapnSocketPath)}: ${err}`),
        );
      };
      server.once('listening', onListening);
      server.once('error', onError);
      server.listen(ocapnSocketPath);
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
    // Defensive: reject anything that doesn't look like a v3 service id so a
    // misbehaving (or future-format) Tor daemon can't poison the location we
    // publish as our designator. Also catches the case where a caller passed
    // a bogus restored `serviceId` that Tor accepted unchanged.
    actualServiceId = assertV3OnionServiceId(parsedAddOnionReply.serviceId);

    if (serviceId && serviceId !== actualServiceId) {
      throw Error(
        `ADD_ONION service id mismatch: expected ${serviceId}, got ${actualServiceId}`,
      );
    }
    onionPrivateKey = privateKey || parsedAddOnionReply.privateKey;
  } catch (error) {
    for (const socket of pendingIncomingSockets) {
      socket.destroy();
    }
    pendingIncomingSockets.clear();
    if (torControlLineReader) {
      torControlLineReader.dispose();
    }
    if (torControlSocket) {
      torControlSocket.destroy();
    }
    server.close();
    await fs.rm(ocapnSocketPath, { force: true }).catch(() => undefined);
    throw error;
  }

  if (!torControlSocket || !torControlLineReader) {
    throw Error('Tor control connection setup incomplete');
  }

  const controlSocket = torControlSocket;
  const controlLineReader = torControlLineReader;

  logger.info('Tor onion service registered', actualServiceId);
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
  /** @type {TorNetLayer | undefined} */
  let netlayer;

  /**
   * @param {net.Socket} socket
   * @param {Connection} connection
   * @param {() => void} [onClose]
   * @param {(data: Buffer) => void} [onData]
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
   * @param {net.Socket} socket
   * @returns {void}
   */
  const attachIncomingSocket = socket => {
    activeSockets.add(socket);
    if (!netlayer) {
      pendingIncomingSockets.add(socket);
      return;
    }
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
  };

  /**
   * @param {Connection} connection
   * @param {net.Socket} socket
   * @param {{stage: 'auth-reply' | 'connect-reply' | 'connected', buffer: Buffer, pendingWrites: Uint8Array[]}} state
   * @param {string} designator
   * @returns {void}
   */
  const processSocks5HandshakeChunk = (
    connection,
    socket,
    state,
    designator,
  ) => {
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
   * @returns {Connection}
   */
  const internalEstablishConnection = location => {
    if (location.transport !== localLocation.transport) {
      throw Error(`Unsupported transport: ${location.transport}`);
    }
    // Validate the v3 onion service id shape before using the value as a
    // SOCKS5 dial target hostname or letting it reach log/error sinks.
    // Without this, a peer could supply e.g. a `*.onion` hostname or
    // arbitrary bytes that would either yield an invalid hostname or get
    // mirrored verbatim into local diagnostics.
    const designator = assertV3OnionServiceId(location.designator);

    if (!netlayer) {
      throw Error('Tor netlayer is not ready');
    }

    // The SOCKS5 dial may have to retry on transient HSDir descriptor
    // propagation failures. The Connection object stays stable across
    // attempts; only the underlying net.Socket gets replaced. Writes
    // submitted before the handshake completes are buffered in
    // `pendingWrites` and replayed atomically once SOCKS5 reaches
    // `connected` on a successful attempt.
    const dialState = {
      stage: /** @type {'auth-reply' | 'connect-reply' | 'connected'} */ (
        'auth-reply'
      ),
      buffer: Buffer.alloc(0),
      /** @type {Uint8Array[]} */
      pendingWrites: [],
      /** @type {net.Socket | undefined} */
      currentSocket: undefined,
      aborted: false,
    };

    /** @type {SocketOperations} */
    const socketOps = {
      write(bytes) {
        if (dialState.aborted) {
          return;
        }
        const activeSocket = dialState.currentSocket;
        if (dialState.stage === 'connected' && activeSocket) {
          activeSocket.write(bytes);
        } else {
          dialState.pendingWrites.push(bytes);
        }
      },
      end() {
        dialState.aborted = true;
        const activeSocket = dialState.currentSocket;
        if (activeSocket) {
          activeSocket.end();
        }
      },
    };

    const connection = handlers.makeConnection(netlayer, true, socketOps);

    /** @param {number} attempt */
    const dial = attempt => {
      if (dialState.aborted || connection.isDestroyed) {
        return;
      }
      dialState.stage = 'auth-reply';
      dialState.buffer = Buffer.alloc(0);

      const socket = net.createConnection({ path: resolvedSocksSocketPath });
      activeSockets.add(socket);
      dialState.currentSocket = socket;

      let promoted = false;

      /**
       * @param {string} message
       * @param {Error} error
       */
      function failAndMaybeRetry(message, error) {
        if (promoted) {
          return;
        }
        socket.destroy();
        activeSockets.delete(socket);
        if (dialState.currentSocket === socket) {
          dialState.currentSocket = undefined;
        }
        if (dialState.aborted || connection.isDestroyed) {
          return;
        }
        const transient = isTransientSocks5DialError(error);
        const moreAttempts = attempt < DEFAULT_SOCKS5_DIAL_MAX_ATTEMPTS;
        if (transient && moreAttempts) {
          const idx = Math.min(
            attempt - 1,
            SOCKS5_DIAL_BACKOFF_MS.length - 1,
          );
          const backoffMs = SOCKS5_DIAL_BACKOFF_MS[idx];
          logger.info(
            `Tor SOCKS5 dial failed transiently (attempt ${attempt}/${DEFAULT_SOCKS5_DIAL_MAX_ATTEMPTS}); retrying in ${backoffMs}ms`,
            error,
          );
          setTimeout(() => dial(attempt + 1), backoffMs);
        } else {
          logger.error(message, error);
          connection.end();
        }
      }

      /** @param {Buffer} chunk */
      function onDialData(chunk) {
        if (dialState.aborted || promoted) {
          return;
        }
        dialState.buffer = Buffer.concat([dialState.buffer, chunk]);
        try {
          processSocks5HandshakeChunk(
            connection,
            socket,
            dialState,
            designator,
          );
        } catch (error) {
          failAndMaybeRetry(
            'SOCKS5 handshake failed',
            /** @type {Error} */ (error),
          );
          return;
        }
        if (dialState.stage === 'connected') {
          // eslint-disable-next-line no-use-before-define
          promote();
        }
      }

      /** @param {Error} err */
      function onDialError(err) {
        failAndMaybeRetry('Tor SOCKS5 dial socket error', err);
      }

      function onDialClose() {
        activeSockets.delete(socket);
        if (!promoted) {
          failAndMaybeRetry(
            'Tor SOCKS5 dial socket closed before handshake completed',
            Error('socket closed before SOCKS5 handshake completed'),
          );
        }
      }

      function promote() {
        promoted = true;
        socket.removeListener('data', onDialData);
        socket.removeListener('error', onDialError);
        socket.removeListener('close', onDialClose);
        // Hand the connected socket off to the production handler chain.
        // setupSocketHandlers also wires `handleConnectionClose`, which we
        // intentionally suppressed during dial-phase retries.
        setupSocketHandlers(socket, connection, () => {
          outgoingConnections.delete(location.designator);
        });
      }

      socket.on('connect', () => {
        if (dialState.aborted) {
          socket.destroy();
          return;
        }
        socket.write(
          Buffer.from([
            SOCKS_VERSION,
            0x01, // one auth method offered
            SOCKS_NO_AUTHENTICATION,
          ]),
        );
      });

      socket.on('data', onDialData);
      socket.on('error', onDialError);
      socket.on('close', onDialClose);
    };

    dial(1);

    return connection;
  };

  /**
   * @param {OcapnLocation} location
   * @returns {Connection}
   */
  const connect = location => {
    const connection = internalEstablishConnection(location);
    logger.info('Connecting over Tor to', location.designator);
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
    server.close(closeError => {
      if (closeError) {
        logger.error('Failed to close Tor OCapN listener', closeError);
      }
      fs.rm(ocapnSocketPath, { force: true }).catch(err => {
        logger.error(
          `Failed to remove OCapN Tor socket ${ocapnSocketPath}`,
          err,
        );
      });
    });
    controlLineReader.dispose();
    controlSocket.end();
    for (const socket of activeSockets) {
      socket.destroy();
    }
    activeSockets.clear();
    outgoingConnections.clear();
  };

  netlayer = harden({
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

  handleIncomingSocket = socket => {
    attachIncomingSocket(socket);
  };
  for (const socket of pendingIncomingSockets) {
    pendingIncomingSockets.delete(socket);
    attachIncomingSocket(socket);
  }

  return netlayer;
};
