export { deeplyFulfilled } from './src/deeplyFulfilled.js';

export { QCLASS } from './src/encodeToCapData.js';
export { makeMarshal } from './src/marshal.js';
export { stringify, parse } from './src/marshal-stringify.js';

export { decodeToJustin } from './src/marshal-justin.js';

// eslint-disable-next-line import/export
export * from './src/types.js';

// For compatibility, but importers of these should instead import these
// directly from `@endo/pass-style` or (if applicable) `@endo/far`.
// @ts-expect-error TS only complains about this line when checking other
// packages that depend on this one, like marshal. The complaint is about
// repeatedly exported types. Specifically "Remotable".
export * from '@endo/pass-style';
