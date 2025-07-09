/**
 * The compartment mapper requires certain host capabilities.
 * These are the platform-neutral types for those capabilities.
 * For example, {@file node-powers.js} adapts Node.js how modules
 * to various subsets of these capabilities.
 *
 * @module
 */

/* eslint-disable no-use-before-define */

import type { SomeObject } from './typescript.js';

// #region read

/**
 * All available read powers
 *
 * @template T The expected input/output type of the {@link CanonicalFn}.
 */
export type ReadPowers<T extends string = any> = {
  canonical: CanonicalFn<T>;
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

/**
 * @template T The expected input/output type of the {@link CanonicalFn}.
 */
export type MaybeReadPowers<T extends string = any> = ReadPowers<T> & {
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
 *
 * @template T The expected input/output type of the {@link CanonicalFn}.
 */
export type ReadNowPowers<T extends string = any> = Omit<
  ReadPowers<T>,
  ReadNowPowersProp
> &
  Required<Pick<ReadPowers<T>, ReadNowPowersProp>>;

/**
 * These properties are necessary for dynamic require support
 */
export type ReadNowPowersProp = 'fileURLToPath' | 'isAbsolute' | 'maybeReadNow';

/**
 * Returns a canonical URL for a given URL, following redirects or symbolic
 * links if any exist along the path. Must return the given logical location if
 * the real location does not exist.
 *
 * @template T The expected input/output type of the {@link CanonicalFn}. This
 * may be a particular type of URL, such as a `FileUrlString`.
 */
export type CanonicalFn<T extends string = string> = (
  location: T,
) => Promise<T>;

/**
 * A function which reads some location and resolves with bytes.
 */
export type ReadFn = (location: string) => Promise<Uint8Array>;

/**
 * A resolution of `undefined` indicates `ENOENT` or the equivalent.
 */
export type MaybeReadFn = (location: string) => Promise<Uint8Array | undefined>;

/**
 * A function which reads some location and returns bytes.
 */
export type ReadNowFn = (location: string) => Uint8Array;

/**
 * A resolution of `undefined` indicates `ENOENT` or the equivalent.
 */
export type MaybeReadNowFn = (location: string) => Uint8Array | undefined;

/**
 * Returns a string hash of a byte array
 */
export type HashFn = (bytes: Uint8Array) => string;

export type FileURLToPathFn = (url: URL | string) => string;

export type PathToFileURLFn = (path: string) => URL;

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

/**
 * Read powers with a {@link HashFn}.
 *
 * @template T The expected input/output type of the {@link CanonicalFn}.
 */
export type HashPowers<T extends string = any> = {
  read: ReadFn;
  canonical: CanonicalFn<T>;
  computeSha512: HashFn;
};
// #endregion

// #region write
export type WritePowers = {
  write: WriteFn;
};

export type WriteFn = (location: string, bytes: Uint8Array) => Promise<void>;

export type ArchiveWriter = {
  write: WriteFn;
  snapshot: SnapshotFn;
};

export type SnapshotFn = () => Promise<Uint8Array>;
// #endregion

// #region execute
export type Application = {
  import: ExecuteFn;
  sha512?: string | undefined;
};

export type ExecuteFn = (options?: any) => Promise<SomeObject>;
// #endregion
