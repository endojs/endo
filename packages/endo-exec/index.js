// Ensure endo is initialized synchronously.
import '@endo/init/legacy.js';

// Asynchronously run the exported main function.
import './endo-exec.cjs';

/**
 * @template {Record<string, any>} [P=Record<string, any>]
 * @typedef {(
 *  argv: string[],
 *  envp: Record<string, string>,
 *  powers: P,
 * ) => Promise<any>} Main
 */
