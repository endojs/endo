/** console for xs platform */
// @ts-check
const { freeze } = Object;

/** @type { (it: unknown) => string } */
const text = it => ((typeof it === "object" ? JSON.stringify(it) : `${it}`));
/** @type { (...things: unknown[]) => string } */
const combine = (...things) => `${things.map(text).join(" ")}\n`;

/**
 * @param {(txt: string) => void} write_
 */
export function makeConsole(write_) {
  const write = write_;
  return freeze({
    /** @type { (...things: unknown[]) => void } */
    log(...things) {
      write(combine(...things));
    },
    // node.js docs say this is just an alias for error
    /** @type { (...things: unknown[]) => void } */
    warn(...things) {
      write(combine("WARNING: ", ...things));
    },
    // node docs say this goes to stderr
    /** @type { (...things: unknown[]) => void } */
    error(...things) {
      write(combine("ERROR: ", ...things));
    }
  });
}
