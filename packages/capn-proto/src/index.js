// @ts-check
export { E, HandledPromise } from '@endo/eventual-send';
export { makeCapnp } from './rpc-system.js';
export { makeInterfaceRegistry } from './interfaces.js';
export { makeLoopback } from './loopback.js';
export { makeTwoPartyVatNetwork } from './two-party.js';
export {
  makeCapnpTrapHost,
  makeCapnpTrapGuest,
  MIN_TRANSFER_BUFFER_LENGTH,
  MIN_DATA_BUFFER_LENGTH,
  TRANSFER_OVERHEAD_LENGTH,
} from './trap.js';
export {
  encodeBootstrap,
  encodeCall,
  encodeReturn,
  encodeFinish,
  encodeResolve,
  encodeRelease,
  encodeDisembargo,
  encodeProvide,
  encodeAccept,
  encodeUnimplemented,
  encodeAbort,
  decodeMessage,
} from './proto/messages.js';
export * from './proto/schema.js';
export {
  makeMessageBuilder,
  makeMessageReader,
  WORD_SIZE,
} from './wire/segment.js';
export { frameSegments, unframeSegments } from './wire/framing.js';
export { readPointer, writePointer, resolvePointer } from './wire/pointer.js';
export { pack, unpack } from './wire/packed.js';
export {
  loadSchema,
  parseCapnpSchema,
  layoutSchema,
  layoutStruct,
  encodeRootStruct,
  decodeRootStruct,
} from './schema/index.js';
