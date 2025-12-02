/* eslint-disable no-shadow */
/**
 * Utilities for working with {@link ProjectFixture} objects
 *
 * @module
 */

import 'ses';

import { Buffer } from 'node:buffer';
import nodeCrypto from 'node:crypto';
import nodeFs from 'node:fs';
import nodePath from 'node:path';
import { scheduler } from 'node:timers/promises';
import nodeUrl from 'node:url';
import { inspect } from 'node:util';
import { makeReadPowers } from '../node-powers.js';
import { GenericGraph } from '../src/generic-graph.js';
import {
  ATTENUATORS_COMPARTMENT,
  ENTRY_COMPARTMENT,
  WILDCARD_POLICY_VALUE,
} from '../src/policy-format.js';

/**
 * @import {MakeMaybeReadProjectFixtureOptions,
 *  MakeProjectFixtureReadPowersOptions,
 *  MakeMaybeReadProjectFixtureOptionsWithRandomDelay,
 *  ProjectFixture,
 *  FixedCustomInspectFunction,
 *  RestParameters,
 *  CustomInspectStyles} from './test.types.js'
 * @import {CompartmentMapDescriptor,
 *  LogFn,
 *  MaybeReadFn,
 *  MaybeReadNowFn,
 *  MaybeReadPowers,
 *  PackageDescriptor,
 *  PackagePolicy,
 *  ReadFn} from '../src/types.js'
 * @import {ExecutionContext} from 'ava'
 */

const { entries, fromEntries, getPrototypeOf, freeze, keys } = Object;

/**
 * Pretty-prints a {@link ProjectFixture} as an ASCII tree.
 *
 * @template [Context=unknown]
 * @param {{log: LogFn}|ExecutionContext<Context>} logger - Object with a `log` function
 * @param {ProjectFixture} fixture - Adjacency list: { node: [children...] }
 * @param {object} [options]
 * @param {string} [options.root] - Which node in the graph to start dumping from
 * @param {string[]} [options.prefixParts] - Used internally for recursion
 * @param {string} [options.name] - Name of the fixture, used for logging
 * @returns {void}
 */
export const dumpProjectFixture = (
  logger,
  fixture,
  { root = fixture.root, prefixParts, name = root } = {},
) => {
  const children = fixture.graph[root] || [];
  const lastIdx = children.length - 1;
  if (!prefixParts) {
    logger.log(`Project "${name}" dependency graph:`);
    prefixParts = [];
    logger.log(root);
  }
  children.forEach((child, idx) => {
    const isLast = idx === lastIdx;
    const branch = isLast ? '└── ' : '├── ';
    const prefix = prefixParts.join('');
    logger.log(prefix + branch + child);
    // Prepare prefix for next level
    const nextPrefixParts = prefixParts.concat(isLast ? '    ' : '│   ');
    dumpProjectFixture(logger, fixture, {
      prefixParts: nextPrefixParts,
      root: child,
      name,
    });
  });
};

/**
 * Convenience function to create a version of `dumpProjectFixture` bound to a logger.
 *
 * @template [Context=unknown]
 * @param {{log: LogFn}|ExecutionContext<Context>} logger
 * @returns {RestParameters<typeof dumpProjectFixture>}
 */
export const makeDumpProjectFixture = logger =>
  dumpProjectFixture.bind(null, logger);

/**
 * Minimum random delay in milliseconds for {@link makeMaybeReadProjectFixture}.
 */
const MIN_DELAY = 10;

/**
 * Maximum random delay in milliseconds for {@link makeMaybeReadProjectFixture}.
 */
const MAX_DELAY = 100;

const customStyles = freeze(
  /** @type {CustomInspectStyles} */ ({
    ...inspect.styles,
    name: 'white',
    undefined: 'dim',
    endoKind: 'magenta',
    endoCanonical: 'cyanBright',
    endoConstant: 'magentaBright',
  }),
);

/**
 * Core logic for reading project fixture files. Handles different file types:
 * - `package.json`: Generates a package descriptor with `type: 'module'` based
 *   on the fixture's dependency graph
 * - JavaScript files (`.js`, `.mjs`): Returns deterministic ESM module content
 *   with named and default exports
 * - Other files: Returns deterministic text content suitable for testing
 *
 * @param {ProjectFixture} fixture
 * @param {string} specifier
 * @returns {Buffer|undefined}
 */
const readProjectFixtureCore = ({ graph }, specifier) => {
  const chunks = specifier.split('node_modules/');

  if (chunks.length > 2 || chunks.length === 0) {
    return undefined;
  }

  const filepath = chunks[1];
  const packageName = nodePath.dirname(filepath);
  const filename = nodePath.basename(filepath);

  // Handle non-package.json files with deterministic dummy content
  if (filename !== 'package.json') {
    const extension = nodePath.extname(filename);

    if (extension === '.js' || extension === '.mjs') {
      // Return deterministic dummy ESM content
      return Buffer.from(`// Module: ${packageName}/${filename}
export const value = '${packageName}-${filename}';
export default value;
`);
    }

    // For other file types, return generic content
    return Buffer.from(`// File: ${packageName}/${filename}\n`);
  }

  // Handle package.json files
  const dependencies = graph[packageName] || [];
  const packageDescriptor = {
    name: packageName,
    version: '1.0.0',
    type: 'module',
    dependencies: fromEntries(
      dependencies.map(dependencyName => [dependencyName, '1.0.0']),
    ),
  };

  return Buffer.from(JSON.stringify(packageDescriptor, undefined, 2));
};

/**
 * Creates a `maybeRead` function for use with a {@link ProjectFixture}.
 *
 * This is the async version that supports delay options and returns `undefined`
 * for missing files instead of throwing errors.
 *
 * @param {ProjectFixture} fixture
 * @param {MakeMaybeReadProjectFixtureOptions|MakeMaybeReadProjectFixtureOptionsWithRandomDelay} [options]
 * @returns {MaybeReadFn}
 */
export const makeMaybeReadProjectFixture = (fixture, options = {}) => {
  return async specifier => {
    await Promise.resolve();

    // Handle delay options
    /** @type {() => Promise<void>} */
    let wait;
    if ('randomDelay' in options && options.randomDelay === false) {
      wait = () =>
        scheduler.wait(
          Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY,
        );
    } else if ('delay' in options) {
      wait = () => scheduler.wait(options.delay);
    } else {
      wait = async () => {};
    }

    await wait();

    return readProjectFixtureCore(fixture, specifier);
  };
};

/**
 * Creates a `read` function for use with a {@link ProjectFixture}.
 *
 * This is the async version that throws errors for missing files instead of
 * returning `undefined`.
 *
 * @param {ProjectFixture} fixture
 * @param {MakeMaybeReadProjectFixtureOptions|MakeMaybeReadProjectFixtureOptionsWithRandomDelay} [options]
 * @returns {ReadFn}
 */
const makeReadProjectFixture = (fixture, options = {}) => {
  const maybeRead = makeMaybeReadProjectFixture(fixture, options);

  return async specifier => {
    const result = await maybeRead(specifier);

    if (result === undefined) {
      const err = new Error(`File not found: ${specifier}`);
      /** @type {any} */ (err).code = 'ENOENT';
      throw err;
    }

    return result;
  };
};

/**
 * Creates a `maybeReadNow` function for use with a {@link ProjectFixture}.
 *
 * This is the synchronous version that returns `undefined` for missing files.
 *
 * @param {ProjectFixture} fixture
 * @returns {MaybeReadNowFn}
 */
const makeMaybeReadNowProjectFixture = fixture => {
  /** @type {MaybeReadNowFn} */
  const maybeReadNow = specifier => {
    return readProjectFixtureCore(fixture, specifier);
  };
  return maybeReadNow;
};

/**
 * Creates `ReadPowers` for use with a {@link ProjectFixture}
 *
 * @param {ProjectFixture} fixture
 * @param {MakeProjectFixtureReadPowersOptions} [options]
 * @see {@link makeMaybeReadProjectFixture} for details
 * @returns {MaybeReadPowers}
 */
export const makeProjectFixtureReadPowers = (
  fixture,
  {
    fs = nodeFs,
    url = nodeUrl,
    crypto = nodeCrypto,
    path = nodePath,
    ...otherOptions
  } = {},
) => {
  const basePowers = makeReadPowers({ fs, url, crypto, path });
  const maybeRead = makeMaybeReadProjectFixture(fixture, otherOptions);
  const maybeReadNow = makeMaybeReadNowProjectFixture(fixture);
  const read = makeReadProjectFixture(fixture, otherOptions);
  return {
    ...basePowers,
    maybeRead,
    maybeReadNow,
    read,
  };
};

/**
 * If `value` is an object and has a `null` prototype, re-create it as a "plain"
 * object to suppress the annoying `[Object: null prototype]` in `inspect()`.
 *
 * In the above case, returns a shallow copy of `value`. Any nested object fulfilling the same condition will also be converted and become a shallow copy.
 *
 * Otherwise this function is just the identity
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
const unnullify = value => {
  if (value === undefined) {
    return value;
  }
  if (value !== null && getPrototypeOf(value) === null) {
    return entries(value).reduce(
      (acc, [k, v]) => ({
        ...acc,
        [k]: unnullify(v),
      }),
      /** @type {T} */ ({}),
    );
  }
  return value;
};

/**
 * Prepares a {@link PackagePolicy} for inspection by {@link dumpCompartmentMap}.
 *
 * @template {PackagePolicy|undefined} T
 * @param {T} packagePolicy
 * @returns {T}
 */
const stylePackagePolicy = packagePolicy => {
  if (packagePolicy === undefined) {
    return packagePolicy;
  }
  const policy = unnullify(packagePolicy);
  return {
    ...policy,
    /** @type {FixedCustomInspectFunction} */
    [inspect.custom]: (_, options, inspect) => {
      for (const [key, value] of entries(policy)) {
        if (value === WILDCARD_POLICY_VALUE) {
          // styles value as a constant. this could also be done by mutating styles,
          // but since the value is just a string, we don't need to. we _do_ however
          // need to turn it into an object so that it can have a custom inspect function.
          policy[key] = {
            /** @type {FixedCustomInspectFunction} */
            [inspect.custom]: (_, options) =>
              options.stylize(value, 'endoConstant'),
          };
        } else if (
          key === 'packages' &&
          typeof value === 'object' &&
          keys(/** @type {any} */ (value)).length
        ) {
          // styles non-empty `packages` prop; all object keys are temporarily
          // styled as canonical names. I was unable to find a nicer way to do
          // this (e.g. with `stylize`), since the `inspect()` call will want to
          // apply its own colors.
          policy[key] = /** @type {any} */ ({
            ...value,
            /** @type {FixedCustomInspectFunction} */
            [inspect.custom]: (_, options, inspect) => {
              const { styles } = inspect;
              try {
                inspect.styles = /** @type {any} */ ({
                  ...customStyles,
                  string: 'cyanBright',
                  name: 'cyanBright',
                });
                return inspect(value, options);
              } finally {
                inspect.styles = styles;
              }
            },
          });
        }
      }
      return `${options.stylize('PackagePolicy', 'endoKind')}(${inspect(policy, { ...options })})`;
    },
  };
};

/**
 *
 * @param {string} label
 */
const styleLabel = label => ({
  /** @type {FixedCustomInspectFunction} */
  [inspect.custom]: (_, options) => {
    const { stylize } = options;
    const kind = stylize('Canonical', 'endoKind');
    if (label === ATTENUATORS_COMPARTMENT) {
      return `${kind}(${stylize('Attenuators', 'endoConstant')})`;
    }
    if (label === ENTRY_COMPARTMENT) {
      return `${kind}(${stylize('Entry', 'endoConstant')})`;
    }
    return `${kind}(${stylize(label, 'endoCanonical')})`;
  },
});

/**
 * Dump a {@link CompartmentMapDescriptor}, omitting some fields.
 *
 * - {@link CompartmentMapDescriptor.tags} is omitted
 * - A `CompartmentDescriptor` will only show the following fields: `label`,
 *   `name`, `scopes`, `location`, `sourceDirname`, `modules`, and `path`
 *
 * This can be used on any `CompartmentMapDescriptor` and is not purpose-built
 * for `ProjectFixture` objects.
 *
 * @template [Context=unknown]
 * @param {{log: LogFn}|ExecutionContext<Context>} logger
 * @param {CompartmentMapDescriptor} compartmentMap
 * @returns {void}
 */
export const dumpCompartmentMap = (logger, compartmentMap) => {
  const originalStyles = inspect.styles;

  inspect.styles = customStyles;

  let inspected;
  try {
    const compartmentMapForInspect = {
      ...compartmentMap,
      /** @type {FixedCustomInspectFunction} */
      [inspect.custom]: () => {
        return {
          compartments: fromEntries(
            entries(compartmentMap.compartments).map(
              ([
                compartmentName,
                {
                  label,
                  name,
                  scopes,
                  location,
                  sourceDirname,
                  modules,
                  policy,
                  ...rest
                },
              ]) => [
                compartmentName,
                {
                  label: styleLabel(label),
                  name,
                  location, // TODO: style if file URL
                  policy: stylePackagePolicy(policy),
                  sourceDirname,
                  ...unnullify(rest),
                },
              ],
            ),
          ),

          entry: unnullify(compartmentMap.entry),
        };
      },
    };
    inspected = inspect(compartmentMapForInspect, { depth: 4, colors: true });
  } finally {
    inspect.styles = originalStyles;
  }
  logger.log(
    `Compartment map for entry compartment at "${compartmentMap.entry.compartment}":\n${inspected}`,
  );
};

/**
 * Default weight function for {@link projectFixtureToGenericGraph}.
 * @param {string} node
 * @returns {number}
 */
const defaultWeightFn = node => node.length;

/**
 *
 * @param {ProjectFixture} fixture
 * @param {(node: string) => number} [weightFn]
 * @returns {GenericGraph<string>}
 */
export const projectFixtureToGenericGraph = (
  fixture,
  weightFn = defaultWeightFn,
) => {
  const graph = /** @type {GenericGraph<string>} */ (new GenericGraph());
  for (const [node, children] of entries(fixture.graph)) {
    graph.addNode(node);
    for (const child of children) {
      graph.addEdge(node, child, weightFn(child));
    }
  }
  return graph;
};
