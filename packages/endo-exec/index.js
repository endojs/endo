// Ensure endo is initialized synchronously.
import '@endo/init/legacy.js';

// Asynchronously run the exported main function.
import './endo-exec.cjs';

/**
 * @typedef {(
 *  powers: { process: { argv: string[], env: Record<string, string | undefined> } }
 * ) => Promise<any>} OnEndoExec
 */
