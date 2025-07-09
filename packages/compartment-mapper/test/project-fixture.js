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

/**
 * @import {MakeMaybeReadProjectFixtureOptions,
 *  MakeProjectFixtureReadPowersOptions,
 *  MakeMaybeReadProjectFixtureOptionsWithRandomDelay,
 *  ProjectFixture,
 *  RestParameters} from './test.types.js'
 * @import {CompartmentMapDescriptor, LogFn, MaybeReadFn, PackageDescriptor} from '../src/types.js'
 * @import {ExecutionContext} from 'ava'
 * @import {CustomInspectFunction} from 'node:util'
 */

const { entries, fromEntries, assign, getPrototypeOf } = Object;

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

/**
 * Creates a `maybeRead` function for use with a {@link ProjectFixture} having a
 * random delay.
 *
 * @overload
 * @param {ProjectFixture} fixture
 * @param {MakeMaybeReadProjectFixtureOptionsWithRandomDelay} options
 * @returns {MaybeReadFn}
 */

/**
 * Creates a `maybeRead` function for use with a {@link ProjectFixture}, optionally with static delay (in ms)
 * @overload
 * @param {ProjectFixture} fixture
 * @param {MakeMaybeReadProjectFixtureOptions} [options]
 * @returns {MaybeReadFn}
 */

/**
 * @param {ProjectFixture} fixture
 * @param {MakeMaybeReadProjectFixtureOptions|MakeMaybeReadProjectFixtureOptionsWithRandomDelay} [options]
 * @returns {MaybeReadFn}
 */
export const makeMaybeReadProjectFixture =
  ({ graph }, options = {}) =>
  async specifier => {
    await Promise.resolve();

    const chunks = specifier.split('node_modules/');
    if (chunks.length > 2) {
      return undefined;
    }

    assert(
      chunks.length > 0,
      `Invalid specifier "${specifier}" for makeMaybeReadProjectFixture`,
    );

    const filepath = chunks[1];

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

    const packageName = nodePath.dirname(filepath);
    const dependencies = graph[packageName] || [];

    /** @type {PackageDescriptor} */
    const packageDescriptor = {
      name: packageName,
      version: '1.0.0',
      dependencies: fromEntries(
        dependencies.map(dependencyName => [dependencyName, '1.0.0']),
      ),
    };

    return Buffer.from(JSON.stringify(packageDescriptor));
  };

/**
 * Creates `ReadPowers` for use with a {@link ProjectFixture}
 *
 * @param {ProjectFixture} fixture
 * @param {MakeProjectFixtureReadPowersOptions} [options]
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
  return {
    ...makeReadPowers({ fs, url, crypto, path }),
    maybeRead: makeMaybeReadProjectFixture(fixture, otherOptions),
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
 * @param {unknown} value
 * @returns {unknown}
 */
const styleObject = value => {
  if (value && getPrototypeOf(value) === null) {
    return fromEntries(entries(value).map(([k, v]) => [k, styleObject(v)]));
  }
  return value;
};

/**
 * Prepends a `CompartmentDescriptor.path` with the computed canonical name (or "[Root]" if entry compartment).
 *
 * Returns a shallow copy of `path` with a {@link CustomInspectFunction}.
 *
 * @param {string[]} path
 */
const stylePath = path => {
  const fancyPath = [...path];
  assign(fancyPath, {
    /** @type {CustomInspectFunction} */
    [inspect.custom]: (_, { stylize }) =>
      path.length
        ? `[${stylize('Canonical', 'date')}: ${stylize(path.join('>'), 'special')}] ${inspect(path)}`
        : `[${stylize('Root', 'date')}]`,
  });
  return fancyPath;
};

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
  const compartmentMapForInspect = {
    ...compartmentMap,
    /** @type {CustomInspectFunction} */
    [inspect.custom]: () => ({
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
              path = [],
            },
          ]) => [
            compartmentName,
            {
              label,
              name,
              scopes: styleObject(scopes),
              location: styleObject(location),
              sourceDirname,
              modules: styleObject(modules),
              path: stylePath(path),
            },
          ],
        ),
      ),

      entry: styleObject(compartmentMap.entry),
    }),
  };
  logger.log(
    `Compartment map for entry compartment at "${compartmentMap.entry.compartment}":\n${inspect(compartmentMapForInspect, false, 4, true)}`,
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
