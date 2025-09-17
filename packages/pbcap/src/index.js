import '@endo/init';

import { DocHandle } from '@automerge/automerge-repo';
import {
  makeTagged,
  passStyleOf,
  encodeSwissnum,
  makeClient,
  makeTcpNetLayer,
  E,
  Far,
} from '@endo/ocapn';
import { makeRepo } from './repo.js';

const { freeze } = Object;

const makeAutomergePlugin = repo => {
  return freeze({
    encode: value => {
      if (value instanceof DocHandle) {
        // console.log('encode Automerge DocHandle', value.url);
        return makeTagged('Automerge', value.url);
      }
      return undefined;
    },
    decode: value => {
      if (
        typeof value === 'object' &&
        value !== null &&
        passStyleOf(value) === 'tagged' &&
        value[Symbol.toStringTag] === 'Automerge'
      ) {
        // console.log('decode Automerge DocHandle', value.payload);
        return repo.find(value.payload);
      }
      return undefined;
    },
  });
};

/**
 * @param {string} debugLabel
 * @param makeDefaultSwissnumTable
 * @returns {Promise<{ client: Client, location: OcapnLocation, repo: Repo, rootDocUrl: string, handle: DocHandle }>}
 */
const makePBCapClient = async (debugLabel, makeDefaultSwissnumTable) => {
  const { repo, rootDocUrl } = makeRepo(debugLabel);
  const automergePlugin = makeAutomergePlugin(repo);
  const client = makeClient({
    debugLabel,
    swissnumTable: makeDefaultSwissnumTable && makeDefaultSwissnumTable(),
    marshalPlugins: [automergePlugin],
  });
  const tcpNetlayer = await makeTcpNetLayer({ client });
  client.registerNetlayer(tcpNetlayer);
  const { location } = tcpNetlayer;
  const handle = await repo.find(rootDocUrl);
  return { client, location, repo, rootDocUrl, handle };
};

/**
 * @param makeDefaultSwissnumTable
 * @returns {Promise<{ clientA: Client, clientB: Client, locationA: OcapnLocation, locationB: OcapnLocation, shutdownBoth: () => void, ocapnA: Ocapn, bootstrapB: any, repoA: Repo, rootDocUrlA: string, repoB: Repo, rootDocUrlB: string, handleA: DocHandle, handleB: DocHandle }>}
 */
const makeClientPair = async makeDefaultSwissnumTable => {
  const {
    client: clientA,
    location: locationA,
    repo: repoA,
    rootDocUrl: rootDocUrlA,
    handle: handleA,
  } = await makePBCapClient('A', makeDefaultSwissnumTable);
  const {
    client: clientB,
    location: locationB,
    repo: repoB,
    rootDocUrl: rootDocUrlB,
    handle: handleB,
  } = await makePBCapClient('B', makeDefaultSwissnumTable);
  const shutdownBoth = () => {
    clientA.shutdown();
    clientB.shutdown();
  };
  const { ocapn: ocapnA } = await clientA.provideSession(locationB);
  const bootstrapB = await ocapnA.getBootstrap();
  return {
    clientA,
    clientB,
    locationA,
    locationB,
    shutdownBoth,
    ocapnA,
    bootstrapB,
    repoA,
    rootDocUrlA,
    repoB,
    rootDocUrlB,
    handleA,
    handleB,
  };
};

const makeSwissnumTable = () => {
  const swissnumTable = new Map();
  swissnumTable.set(
    'AutomergeDocTaker',
    Far('take', async handleP => {
      const handle = await handleP;
      console.log('AutomergeDocTaker: modifying the received doc', handle.url);
      handle.change(doc => {
        doc.edited = true;
      });
    }),
  );
  return swissnumTable;
};

const { ocapnA, handleA } = await makeClientPair(makeSwissnumTable);

console.log('handleA', handleA.doc());

handleA.change(doc => {
  doc.edited = false;
});
await new Promise(resolve => setTimeout(resolve, 200));

handleA.on('change', ({ doc }) => {
  console.log('handleA changed', doc);
});

const bootstrap = ocapnA.getBootstrap();
const docTaker = E(bootstrap).fetch(encodeSwissnum('AutomergeDocTaker'));

// Client A sends the handle to Client B, which modifies the doc
await E(docTaker)(handleA);
