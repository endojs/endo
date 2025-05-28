// @ts-check

import '@endo/ses-ava/prepare-endo.js';

import { E } from '@endo/eventual-send';
import { testWithErrorUnwrapping } from './_util.js';
import { makeTcpNetLayer } from '../src/netlayers/tcp-test-only.js';
import { makeClient } from '../src/client/index.js';
import { OCapNFar } from '../src/client/ocapn.js';
import { locationToLocationId } from '../src/client/util.js';

const textEncoder = new TextEncoder();

const toSwissnum = str => textEncoder.encode(str);

/**
 * @param {string} debugLabel
 * @param {() => Map<string, any>} [makeDefaultSwissnumTable]
 * @returns {Promise<{ client: Client, location: OCapNLocation }>}
 */
const makeTestClient = async (debugLabel, makeDefaultSwissnumTable) => {
  const client = makeClient({
    debugLabel,
    swissnumTable: makeDefaultSwissnumTable && makeDefaultSwissnumTable(),
  });
  const tcpNetlayer = await makeTcpNetLayer({ client });
  client.registerNetlayer(tcpNetlayer);
  const { location } = tcpNetlayer;
  return { client, location };
};

const makeTestClientTrio = async makeDefaultSwissnumTable => {
  const { client: clientA } = await makeTestClient(
    'A',
    makeDefaultSwissnumTable,
  );
  const { client: clientB, location: locationB } = await makeTestClient(
    'B',
    makeDefaultSwissnumTable,
  );
  const { client: clientC, location: locationC } = await makeTestClient(
    'C',
    makeDefaultSwissnumTable,
  );
  const shutdownAll = () => {
    clientA.shutdown();
    clientB.shutdown();
    clientC.shutdown();
  };
  // A -> B, A -> C
  const { ocapn: ocapnB } = await clientA.provideSession(locationB);
  const { ocapn: ocapnC } = await clientA.provideSession(locationC);
  const bootstrapB = await ocapnB.getBootstrap();
  const bootstrapC = await ocapnC.getBootstrap();
  return {
    clientA,
    clientB,
    clientC,
    locationB,
    locationC,
    bootstrapB,
    bootstrapC,
    shutdownAll,
  };
};

testWithErrorUnwrapping('sturdyref transported as sturdyref', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Cat',
    OCapNFar('Cat', {
      pet: () => {
        console.log('The cat is petted.');
      },
    }),
  );
  testObjectTable.set(
    'CatSitter',
    OCapNFar('CatSitter', {
      takeCareOf: cat => {
        console.log('CatSitter called with', cat);
        return E(cat).pet();
      },
    }),
  );

  const { clientC, locationB, bootstrapB, bootstrapC, shutdownAll } =
    await makeTestClientTrio(() => testObjectTable);

  const catB = await E(bootstrapB).fetch(toSwissnum('Cat'));
  const catSitterC = await E(bootstrapC).fetch(toSwissnum('CatSitter'));

  let clientCSessionForB;
  const locationIdB = locationToLocationId(locationB);

  clientCSessionForB = clientC.sessionManager.getActiveSession(locationIdB);
  t.falsy(clientCSessionForB, 'C has no session for B');
  await E(catSitterC).takeCareOf(catB);

  clientCSessionForB = clientC.sessionManager.getActiveSession(locationIdB);
  t.truthy(clientCSessionForB, 'C has a session for B');

  shutdownAll();
});

testWithErrorUnwrapping('third party handoff', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'ObjMaker',
    OCapNFar('ObjMaker', {
      makeObj: () => {
        return OCapNFar('Obj', {
          getNumber: () => 42,
        });
      },
    }),
  );
  testObjectTable.set(
    'ObjUser',
    OCapNFar('ObjUser', {
      useObj: obj => {
        console.log('ObjUser called with', obj);
        return E(obj).getNumber();
      },
    }),
  );

  const { clientC, locationB, bootstrapB, bootstrapC, shutdownAll } =
    await makeTestClientTrio(() => testObjectTable);

  const objMakerB = await E(bootstrapB).fetch(toSwissnum('ObjMaker'));
  const objUserC = await E(bootstrapC).fetch(toSwissnum('ObjUser'));

  let clientCSessionForB;
  const locationIdB = locationToLocationId(locationB);

  clientCSessionForB = clientC.sessionManager.getActiveSession(locationIdB);
  t.falsy(clientCSessionForB, 'C has no session for B');

  const objB = await E(objMakerB).makeObj();
  const number = await E(objUserC).useObj(objB);
  t.is(number, 42, 'number is 42');

  clientCSessionForB = clientC.sessionManager.getActiveSession(locationIdB);
  t.truthy(clientCSessionForB, 'C has a session for B');

  shutdownAll();
});
