/**
 * @module The compartment mapper requires certain host capabilities.
 * These are the platform-neutral types for those capabilities.
 * For example, {@file node-powers.js} adapts Node.js how modules
 * to various subsets of these capabilities.
 */

/* eslint-disable no-use-before-define */

import type { SomeObject } from './typescript.js';

// Read

export type ReadPowers = {
  canonical: CanonicalFn;
  read: ReadFn;
  maybeRead?: MaybeReadFn;
  readNow?: ReadNowFn;
  maybeReadNow?: MaybeReadNowFn;
  computeSha512?: HashFn;
  fileURLToPath?: FileURLToPathFn;
  pathToFileURL?: PathToFileURLFn;
  requireResolve?: RequireResolveFn;
  isAbsolute?: IsAbsoluteFn;
};

export type MaybeReadPowers = ReadPowers & {
  maybeRead: MaybeReadFn;
};

/**
 * The extension of {@link ReadPowers} necessary for dynamic require support
 *
 * For a `ReadPowers` to be a `ReadNowPowers`:
 *
 * 1. It must be an object (not a {@link ReadFn})
 * 2. Prop `maybeReadNow` is a function
 * 3. Prop `fileURLToPath` is a function
 * 4. Prop `isAbsolute` is a function
 */
export type ReadNowPowers = Omit<ReadPowers, ReadNowPowersProp> &
  Required<Pick<ReadPowers, ReadNowPowersProp>>;

/**
 * These properties are necessary for dynamic require support
 */
export type ReadNowPowersProp = 'fileURLToPath' | 'isAbsolute' | 'maybeReadNow';

/**
 * Returns a canonical URL for a given URL, following redirects or symbolic
 * links if any exist along the path.
 * Must return the given logical location if the real location does not exist.
 */
export type CanonicalFn = (location: string) => Promise<string>;

export type ReadFn = (location: string) => Promise<Uint8Array>;

/**
 * A resolution of `undefined` indicates `ENOENT` or the equivalent.
 */
export type MaybeReadFn = (location: string) => Promise<Uint8Array | undefined>;

export type ReadNowFn = (location: string) => Uint8Array;

/**
 * A resolution of `undefined` indicates `ENOENT` or the equivalent.
 */
export type MaybeReadNowFn = (location: string) => Uint8Array | undefined;

export type HashFn = (bytes: Uint8Array) => string;

export type FileURLToPathFn = (location: string | URL) => string;

export type PathToFileURLFn = (location: string) => URL;

export type RequireResolveFn = (
  fromLocation: string,
  specifier: string,
  options?:
    | {
        paths?: string[];
      }
    | undefined,
) => any;

export type IsAbsoluteFn = (location: string) => boolean;

export type ArchiveReader = {
  read: ReadFn;
};

export type HashPowers = {
  read: ReadFn;
  canonical: CanonicalFn;
  computeSha512: HashFn;
};

// Write

export type WritePowers = {
  write: WriteFn;
};

export type WriteFn = (location: string, bytes: Uint8Array) => Promise<void>;

export type ArchiveWriter = {
  write: WriteFn;
  snapshot: SnapshotFn;
};

export type SnapshotFn = () => Promise<Uint8Array>;

// Execute

export type Application = {
  import: ExecuteFn;
  sha512?: string | undefined;
};

export type ExecuteFn = (options?: any) => Promise<SomeObject>;
