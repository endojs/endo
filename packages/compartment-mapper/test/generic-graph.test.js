import 'ses';
import test from 'ava';

import { GenericGraph, makeShortestPath } from '../src/generic-graph.js';
import { projectFixtureToGenericGraph } from './project-fixture.js';

/**
 * @import {ProjectFixture} from './test.types.js'
 */

/**
 * This is a copy of `calculatePackageWeight` in `node-modules.js`.
 *
 * The value here is used as the edge weight in the graph; note that the weight
 * is a function of the _destination_ node only.
 *
 * @param {string} packageName
 * @returns {number}
 */
const calculatePackageWeight = packageName => {
  let totalCodeValue = packageName.length * 65536; // each character contributes 65536
  for (let i = 0; i < packageName.length; i += 1) {
    totalCodeValue += packageName.charCodeAt(i);
  }
  return totalCodeValue;
};

/**
 * Creates a graph from a tree with the following structure:
 *
 * ```
 * app
 * ├── pippo
 * │   └── gambadilegno
 * │       └── topolino
 * │           └── goofy
 * └── paperino
 *     └── topolino
 *         └── goofy
 * ```
 *
 * @type {ProjectFixture}
 */
const fixture = {
  root: 'app',
  graph: {
    app: ['pippo', 'paperino'],
    paperino: ['topolino'],
    pippo: ['gambadilegno'],
    gambadilegno: ['topolino'],
    topolino: ['goofy'],
  },
};

test('GenericGraph - basic node/edge operations', t => {
  t.plan(10);
  const graph = new GenericGraph();
  t.false(graph.nodes.has('app'));
  graph.addNode('app');
  t.true(graph.nodes.has('app'));
  t.is(graph.adjacent('app')?.size, 0);
  graph.addEdge('app', 'pippo', 3);
  t.true(graph.nodes.has('pippo'));
  t.true(graph.hasEdge('app', 'pippo'));
  t.is(graph.getEdgeWeight('app', 'pippo'), 3);
  graph.setEdgeWeight('app', 'pippo', 5);
  t.is(graph.getEdgeWeight('app', 'pippo'), 5);
  graph.removeEdge('app', 'pippo');
  t.false(graph.hasEdge('app', 'pippo'));
  graph.removeNode('app');
  t.false(graph.nodes.has('app'));
  t.true(graph.nodes.has('pippo'));
});

test('GenericGraph.adjacent() - returns undefined for missing node', t => {
  const graph = new GenericGraph();
  t.is(graph.adjacent('nope'), undefined);
});

test('GenericGraph.getEdgeWeight() - throws for missing edge', t => {
  const graph = new GenericGraph();
  graph.addNode('app');
  graph.addNode('pippo');
  t.throws(() => graph.getEdgeWeight('app', 'pippo'), {
    instanceOf: ReferenceError,
  });
});

test('makeShortestPath() - finds correct path', t => {
  t.plan(8);
  const graph = projectFixtureToGenericGraph(fixture, calculatePackageWeight);
  const shortestPath = makeShortestPath(graph);
  // app to pippo (direct)
  t.deepEqual(shortestPath('app', 'pippo'), ['app', 'pippo']);
  // app to paperino (direct)
  t.deepEqual(shortestPath('app', 'paperino'), ['app', 'paperino']);
  // app to topolino (via paperino)
  t.deepEqual(shortestPath('app', 'topolino'), ['app', 'paperino', 'topolino']);
  // app to gambadilegno (via pippo is shorter than via paperino/topolino)
  t.deepEqual(shortestPath('app', 'gambadilegno'), [
    'app',
    'pippo',
    'gambadilegno',
  ]);
  // app to goofy (via pippo/gambadilegno)
  t.deepEqual(shortestPath('app', 'goofy'), [
    'app',
    'paperino',
    'topolino',
    'goofy',
  ]);
  // paperino to topolino
  t.deepEqual(shortestPath('paperino', 'topolino'), ['paperino', 'topolino']);
  // paperino to gambadilegno (via topolino)
  t.deepEqual(shortestPath('paperino', 'goofy'), [
    'paperino',
    'topolino',
    'goofy',
  ]);
  // pippo to goofy (via gambadilegno)
  t.deepEqual(shortestPath('pippo', 'goofy'), [
    'pippo',
    'gambadilegno',
    'topolino',
    'goofy',
  ]);
});

test('makeShortestPath() - returns a function which throws if no path exists', t => {
  const graph = new GenericGraph();
  graph.addNode('app');
  graph.addNode('pippo');
  const shortestPath = makeShortestPath(graph);
  t.throws(() => shortestPath('app', 'pippo'), {
    message: /No path found from "app" to "pippo"/,
  });
});

test('makeShortestPath() - returns a function which throws if source node missing', t => {
  const graph = new GenericGraph();
  graph.addNode('pippo');
  const shortestPath = makeShortestPath(graph);
  t.throws(() => shortestPath('app', 'pippo'), {
    message: /Source "app" is not in the graph/,
  });
});

test('makeShortestPath() - returns a function which throws if destination node missing', t => {
  const graph = new GenericGraph();
  graph.addNode('app');
  const shortestPath = makeShortestPath(graph);
  t.throws(() => shortestPath('app', 'pippo'), {
    message: /Target "pippo" is not in the graph/,
  });
});

test('makeShortestPath() - returns a function which throws if path has less than two nodes', t => {
  const graph = new GenericGraph();
  graph.addNode('app');
  graph.addNode('pippo');
  // Add edge from pippo to app, but not from app to pippo
  graph.addEdge('pippo', 'app', 1);
  const shortestPath = makeShortestPath(graph);
  // There is no path from app to pippo, so this will throw for 'No path found'
  t.throws(() => shortestPath('app', 'pippo'), {
    message: /No path found from "app" to "pippo"/,
  });
});
