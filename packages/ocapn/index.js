export { makeClient, makeSelfIdentity } from './src/client/index.js';
export {
  makeInMemoryBaggage,
  provideFromBaggage,
  provideMapStoreFromBaggage,
} from './src/client/baggage.js';
export {
  encodeSwissnum,
  decodeSwissnum,
  locationToLocationId,
  toHex,
} from './src/client/util.js';
export { makeOcapnTable } from './src/captp/ocapn-tables.js';
export { makeSlot, parseSlot } from './src/captp/pairwise.js';
export { makeTcpNetLayer } from './src/netlayers/tcp-test-only.js';
