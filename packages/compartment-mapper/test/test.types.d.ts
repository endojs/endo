/**
 * Utility types for tests
 *
 * @module
 */

import type { makeReadPowers } from '../src/node-powers.js';

/**
 * Map of package names to dependency package names.
 *
 * Part of a {@link ProjectFixture}
 */
export type ProjectFixtureGraph = Record<string, string[]>;

/**
 * An object representing a "project fixture" which is just a root package with
 * a dependency graph.
 */
export interface ProjectFixture<Root extends string = string> {
  root: Root;
  graph: ProjectFixtureGraph;
}

/**
 * Drops the first parameter of function `T` and returns a tuple of the remaining parameters.
 */
export type RestParameters<T> = T extends (arg0: any, ...rest: infer R) => any
  ? R
  : never;
/**
 * Options for `makeMaybeReadProjectFixture()` with a random delay.
 */
export type MakeMaybeReadProjectFixtureOptionsWithRandomDelay = {
  /**
   * Inject a random delay before "reading" a package descriptor
   */
  randomDelay: true;
  /**
   * Disallowed when `randomDelay` is `true`
   */
  delay?: never;
};

/**
 * Options for `makeMaybeReadProjectFixture()`
 */
export type MakeMaybeReadProjectFixtureOptions = {
  /**
   * Must be `false` or omitted if `delay` is specified
   */
  randomDelay?: boolean;
  /**
   * Inject a fixed delay before "reading" a package descriptor (in milliseconds)
   */
  delay?: number;
};

/**
 * Makes a nicer tooltip for `T` in IDEs (most of the time).
 */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Set all props of `T` to be optional
 */
export type SetOptional<T extends object> = {
  [K in keyof T]?: T[K];
};

/**
 * Options for `makeProjectFixtureReadPowers()`
 */
export type MakeProjectFixtureReadPowersOptions = Simplify<
  MakeMaybeReadProjectFixtureOptions &
    SetOptional<Parameters<typeof makeReadPowers>[0]>
>;
