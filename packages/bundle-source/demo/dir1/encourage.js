export const message = `You're great!`;
export const makeError = msg => Error(msg);
// Without an evasive transform, the following comment will trip the SES censor
// for dynamic imports. */
/** @type {import('./types.js').EncourageFn} */
export const encourage = nick => `Hey ${nick}!  ${message}`;
