// Reexport just those exports that should be importable outside this package.
// DO NOT reexport `hiddenBuffers`.
export {
  isBufferImmutable,
  sliceBufferToImmutable,
  optTransferBufferToImmutable,
} from './immutable-arraybuffer-pony-internal.js';
