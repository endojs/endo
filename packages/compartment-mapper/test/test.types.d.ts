/**
 * Utility types for tests
 *
 * @module
 */

import type { ExecutionContext } from 'ava';
import type { makeReadPowers } from '../src/node-powers.js';
import type { LoadLocationOptions, SomePolicy } from '../archive-lite.js';

// #region utility
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
 * Drops the first parameter of function `T` and returns a tuple of the remaining parameters.
 */
export type RestParameters<T> = T extends (arg0: any, ...rest: infer R) => any
  ? R
  : never;
// #endregion

// #region project-fixture.js
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
 * Options for `makeProjectFixtureReadPowers()`
 */
export type MakeProjectFixtureReadPowersOptions = Simplify<
  MakeMaybeReadProjectFixtureOptions &
    SetOptional<Parameters<typeof makeReadPowers>[0]>
>;
// #endregion

// #region scaffold.js
export type TestCategoryHint = 'Location' | 'Archive';

interface BaseAssertionFixtureNamespace<T = unknown> {
  assertions: Record<string, () => void>;
  results: Record<string, T>;
}

export interface AssertionLocationFixtureNamespace<T = unknown>
  extends BaseAssertionFixtureNamespace<T> {
  __dirname: string;
  __filename: string;
}

export interface AssertionFixtureNamespace<T = unknown>
  extends BaseAssertionFixtureNamespace<T> {
  __dirname?: null;
  __filename?: null;
}

interface BaseFixtureAssertionFnParameters {
  compartments: Array<Compartment>;
  globals: object;
  policy?: SomePolicy;
}

interface FixtureAssertionFnLocationParameters<T = unknown>
  extends BaseFixtureAssertionFnParameters {
  namespace: AssertionLocationFixtureNamespace<T>;
  testCategoryHint: 'Location';
}

interface FixtureAssertionFnOtherParameters<
  T = unknown,
  U extends TestCategoryHint = TestCategoryHint,
> extends BaseFixtureAssertionFnParameters {
  namespace: AssertionFixtureNamespace<T>;
  testCategoryHint?: U;
}

export type FixtureAssertionFnParameters<
  T = unknown,
  U extends TestCategoryHint = TestCategoryHint,
> = U extends 'Location'
  ? FixtureAssertionFnLocationParameters<T>
  : FixtureAssertionFnOtherParameters<T, U>;

export type FixtureAssertionFn<T = unknown> = <
  Params extends FixtureAssertionFnParameters<T>,
>(
  t: ExecutionContext,
  params: Params,
) => Promise<void> | void;

export type ScaffoldOnErrorFn = (
  t: ExecutionContext,
  options: { error: Error; title: string },
) => void;

export interface ScaffoldOptions extends LoadLocationOptions {
  shouldFailBeforeArchiveOperations?: boolean;
  knownFailure?: boolean;
  knownArchiveFailure?: boolean;
  onError?: ScaffoldOnErrorFn;
  addGlobals?: object;
  additionalOptions?: object;
}

export type WrappedTestFn = (
  title: string,
  implementation: (
    t: ExecutionContext,
    compartment: typeof Compartment,
  ) => Promise<void>,
) => void | Promise<void>;
// #endregion
