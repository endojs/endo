// @ts-nocheck
/* global globalThis */
// Imported ahead of 'ses' by _xs-missing-text-codecs.js so that SES-for-XS,
// which samples the start compartment's globals when it is imported, sees a
// host without the text codecs.
delete globalThis.TextEncoder;
delete globalThis.TextDecoder;
