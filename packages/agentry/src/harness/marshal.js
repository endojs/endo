// @ts-check
/// <reference types="ses"/>

/** @import { Passable } from '@endo/pass-style' */

import { makeMarshal } from '@endo/marshal';

// SmallCaps marshaller for plain-data tool results and tool-call arguments,
// the codec the Endo agent harness speaks end to end. `toCapData(harden(value))`
// yields a `{ body: '#<smallcaps-json>', slots: [] }` record whose leading `#`
// sentinel callers strip, so the model reads BigInts as `"+N"`/`"-N"` strings,
// `undefined` as `"#undefined"`, and strings beginning with a SmallCaps special
// character as `"!<s>"`. This codec is for plain data only; cap-bearing values
// are stored out of band and never reach it.
//
// The codec is constructed once at module load. No slot converters are needed
// because tool args and plain results never carry remotables or promises; the
// defaults throw if one somehow reaches the boundary.
/** @type {ReturnType<typeof makeMarshal>} */
export const smallcapsMarshal = makeMarshal(undefined, undefined, {
  serializeBodyFormat: 'smallcaps',
  // Tool-result encoding only; error logging is irrelevant here.
  marshalSaveError: () => {},
});
harden(smallcapsMarshal);

/**
 * Encode a plain-data tool result as the SmallCaps text the model reads; plain
 * strings pass through unwrapped, while every other value is SmallCaps-encoded
 * so BigInts, `undefined`, and SmallCaps-special-prefixed strings round-trip
 * losslessly.
 *
 * @param {unknown} result
 * @returns {string}
 */
export const toolResultToSmallcaps = result => {
  if (typeof result === 'string') {
    // Plain-string results carry no non-JSON values; no SmallCaps wrapping.
    return result;
  }
  const { body } = smallcapsMarshal.toCapData(
    /** @type {Passable} */ (harden(result)),
  );
  // `body` is '#<smallcaps-json>'; slice off the '#' sentinel so the model
  // reads the raw SmallCaps JSON object/array.
  return body.slice(1);
};
harden(toolResultToSmallcaps);
