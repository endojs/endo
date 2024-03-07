// @ts-check
import net from 'net';

import { E, Far } from '@endo/far';
import { mapWriter, mapReader } from '@endo/stream';
import { makeNetstringReader, makeNetstringWriter } from '@endo/netstring';
import {
  makeMessageCapTP,
  bytesToMessage,
  messageToBytes,
} from '../connection.js';
import { makeSocketPowers } from '../daemon-node-powers.js';

const protocol = 'tcp+netstring+json+captp0';

export const make = async (powers, context) => {
  const { servePort, connectPort } = makeSocketPowers({ net });

  const cancelled = E(context).whenCancelled();
  const cancel = error => E(context).cancel(error);

  /** @type {Array<string>} */
  const addresses = [];

  const gateway = E(powers).gateway();

  // TODO
  // const port = await E(powers).request('port to listen for public web socket connections', 'port', {
  //   default: '8080',
  // });

  const connectionNumbers = (function* generateNumbers() {
    let n = 0;
    for (;;) {
      yield n;
      n += 1;
    }
  })();

  /** @type {Set<Promise<void>>} */
  const connectionClosedPromises = new Set();

  const started = (async () => {
    // TODO make responding to this less of a pain.
    // defaults, type hints, anything and everything.
    // TODO more validation
    const hostPort = await E(powers).request(
      'SELF',
      'Please select a host:port like 127.0.0.1:8920',
      'tcp-netstring-json-captp0-host-port',
    );
    const { hostname: host, port: portname } = new URL(
      `protocol://${hostPort}`,
    );
    const port = Number(portname);
    const { port: assignedPort, connections } = await servePort({
      port,
      host,
      cancelled,
    });

    // TODO log assigned port
    console.log(`Endo daemon started local ${protocol} network device`);
    addresses.push(`${protocol}://${host}:${assignedPort}`);

    return connections;
  })();

  const stopped = (async () => {
    const connections = await started;
    for await (const {
      reader: bytesReader,
      writer: bytesWriter,
      closed: connectionClosed,
    } of connections) {
      (async () => {
        const { value: connectionNumber } = connectionNumbers.next();

        // TODO listen and connect addresses should be logged
        console.log(
          `Endo daemon accepted connection ${connectionNumber} over ${protocol} at ${new Date().toISOString()}`,
        );

        const messageWriter = mapWriter(
          makeNetstringWriter(bytesWriter, { chunked: true }),
          messageToBytes,
        );
        const messageReader = mapReader(
          makeNetstringReader(bytesReader),
          bytesToMessage,
        );

        const { closed: capTpClosed } = makeMessageCapTP(
          'Endo',
          messageWriter,
          messageReader,
          cancelled,
          gateway,
        );

        const closed = Promise.race([connectionClosed, capTpClosed]);
        connectionClosedPromises.add(closed);
        closed.finally(() => {
          connectionClosedPromises.delete(closed);
          console.log(
            `Endo daemon closed connection ${connectionNumber} over ${protocol} at ${new Date().toISOString()}`,
          );
        });
      })().catch(cancel);
    }

    await Promise.all(Array.from(connectionClosedPromises));
  })();

  E.sendOnly(context).addDisposalHook(() => stopped);

  const connect = async (address, connectionContext) => {
    const { value: connectionNumber } = connectionNumbers.next();

    const { port: portname, hostname: host } = new URL(address);
    const port = Number(portname);

    const connectionCancelled = E(connectionContext).whenCancelled();

    const {
      reader: bytesReader,
      writer: bytesWriter,
      closed: connectionClosed,
    } = await connectPort({
      port,
      host,
      cancelled: connectionCancelled,
    });

    // TODO listen and connect addresses should be logged
    console.log(
      `Endo daemon connected ${connectionNumber} over ${protocol} at ${new Date().toISOString()}`,
    );

    const messageWriter = mapWriter(
      makeNetstringWriter(bytesWriter, { chunked: true }),
      messageToBytes,
    );
    const messageReader = mapReader(
      makeNetstringReader(bytesReader),
      bytesToMessage,
    );

    const { closed: capTpClosed, getBootstrap } = makeMessageCapTP(
      'Endo',
      messageWriter,
      messageReader,
      cancelled,
      gateway,
    );

    const closed = Promise.race([connectionClosed, capTpClosed]);
    connectionClosedPromises.add(closed);
    closed.finally(() => {
      E(context).cancel();
      connectionClosedPromises.delete(closed);
      console.log(
        `Endo daemon closed connection ${connectionNumber} over ${protocol}at ${new Date().toISOString()}`,
      );
    });

    return getBootstrap();
  };

  await started;

  return Far('TcpNetstringService', {
    addresses: () => harden(addresses),
    supports: address => new URL(address).protocol === `${protocol}:`,
    connect,
  });
};
