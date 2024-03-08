// @ts-check
import url from 'url';
import path from 'path';
import { makePromiseKit } from '@endo/promise-kit';
import { E } from '@endo/eventual-send';
import { start, stop, purge, makeEndoClient } from '../../index.js';
import { makeLocator } from './basic.js';

const { promise: never } = makePromiseKit();

export const makeMultiplayerUtil = ({ testDir, dirname }) => {
  const makeNode = async ({ label, cancelled = never }) => {
    const locator = makeLocator(dirname, 'tmp', testDir, label);

    await stop(locator).catch(() => {});
    await purge(locator);
    await start(locator);
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    // Install test network
    const servicePath = path.join(
      dirname,
      'src',
      'networks',
      'tcp-netstring.js',
    );
    const serviceLocation = url.pathToFileURL(servicePath).href;
    const networkA = E(host).makeUnconfined(
      'MAIN',
      serviceLocation,
      'SELF',
      'test-network',
    );
    // set address via request
    const iteratorRef = E(host).followMessages();
    const { value: message } = await E(iteratorRef).next();
    const { number } = E.get(message);
    await E(host).evaluate('MAIN', '`127.0.0.1:0`', [], [], 'netport');
    await E(host).resolve(await number, 'netport');
    // move test network to network dir
    await networkA;
    await E(host).move(['test-network'], ['NETS', 'tcp']);

    return {
      locator,
      host,
    };
  };

  return {
    makeNode,
  };
};
