/**
 * These interfaces describe the powers needed in `node-powers.js` to
 * adapt host capabilities for the compartment mapper.
 *
 * @module
 */

/* eslint-disable no-use-before-define */

/** For creating `ReadPowers` */
export type FsInterface = {
  promises: {
    realpath: (filepath: string) => Promise<string>;
    writeFile: (location: string, bytes: Uint8Array) => Promise<void>;
    readFile: (location: string) => Promise<Uint8Array>;
  };
  readFileSync: (location: string) => Uint8Array;
};

/**
 * The portion of the "node:url" module needed to normalize paths to fully
 * qualified file URLs, as used by the compartment mapper internally.
 */
export interface UrlInterface {
  fileURLToPath: typeof import('node:url').fileURLToPath;
  pathToFileURL: typeof import('node:url').pathToFileURL;
}

/**
 * The portion of the "node:path" module needed to support dynamic-require for
 * a module specifier that is an absolute path.
 */
export type PathInterface = {
  isAbsolute: (location: string) => boolean;
};

/**
 * The portion of the "node:crypto" module needed for generating and verifying
 * integrity hashes, optionally consumed to make "read powers".
 */
export type CryptoInterface = {
  createHash: (algorithm: 'sha512') => Hash;
};

/**
 * Object returned by function in `CryptoInterface`
 */
type Hash = {
  update: (data: Uint8Array | string) => Hash;
  digest: () => {
    // This is the exact subset of Node.js Buffer that we need.
    toString: (radix: 'hex') => string;
  };
};
