// @ts-check

const { freeze } = Object;

export const padding = '=';

export const alphabet64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * The numeric value corresponding to each letter of the alphabet.
 * If an alphabet is named for the Greek letters alpha and beta, then clearly a
 * monodu is named for the corresponding Greek numbers mono and duo.
 *
 * @type {Record<string, number>}
 */
export const monodu64 = {};
for (let i = 0; i < alphabet64.length; i += 1) {
  const c = alphabet64[i];
  monodu64[c] = i;
}
freeze(monodu64);
