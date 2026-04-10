import 'ses';
import test from 'ava';

import { GenericGraph, makeShortestPath } from '../src/generic-graph.js';
import { projectFixtureToGenericGraph } from './project-fixture.js';

/**
 * @import {ProjectFixture} from './test.types.js'
 */

const { entries } = Object;

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
  t.plan(8);
  const graph = new GenericGraph();
  t.false(graph.nodes.has('app'));
  graph.addNode('app');
  t.true(graph.nodes.has('app'));
  t.is(graph.adjacent('app')?.size, 0);
  graph.addEdge('app', 'pippo');
  t.true(graph.nodes.has('pippo'));
  t.true(graph.hasEdge('app', 'pippo'));
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

test('makeShortestPath() - finds correct path', t => {
  t.plan(8);
  const graph = projectFixtureToGenericGraph(fixture);
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

test('makeShortestPath() - finds correct path when GenericGraphNode is an object', t => {
  t.plan(3);

  const graph = /** @type {GenericGraph<{ toString: () => string }>} */ (
    new GenericGraph()
  );

  /**
   * Store of node references by name
   * @type {Map<string, { toString: () => string }>}
   */
  const nodes = new Map();

  // this terrible thing builds a GenericGraph using the fixture data, but fudges the node types
  // so they are objects. purely for asserting object-based nodes work
  for (const [node, children] of entries(fixture.graph)) {
    const nodeNode = nodes.get(node) ?? { toString: () => node };
    nodes.set(node, nodeNode);
    graph.addNode(nodeNode);
    for (const child of children) {
      const childNode = nodes.get(child) ?? {
        toString: () => child,
      };
      nodes.set(child, childNode);
      graph.addEdge(nodeNode, childNode);
    }
  }
  const shortestPath = makeShortestPath(graph);
  // app to pippo (direct)
  // @ts-expect-error - nodes.get returns undefined if the node is not found
  t.deepEqual(shortestPath(nodes.get('app'), nodes.get('pippo')), [
    nodes.get('app'),
    nodes.get('pippo'),
  ]);
  // app to paperino (direct)
  // @ts-expect-error - nodes.get returns undefined if the node is not found
  t.deepEqual(shortestPath(nodes.get('app'), nodes.get('paperino')), [
    nodes.get('app'),
    nodes.get('paperino'),
  ]);
  // app to topolino (via paperino)
  // @ts-expect-error - nodes.get returns undefined if the node is not found
  t.deepEqual(shortestPath(nodes.get('app'), nodes.get('topolino')), [
    nodes.get('app'),
    nodes.get('paperino'),
    nodes.get('topolino'),
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
    message: /No path found from "app" to "pippo"/,
  });
});

test('makeShortestPath() - returns a function which throws if path has less than two nodes', t => {
  const graph = new GenericGraph();
  graph.addNode('app');
  graph.addNode('pippo');
  // Add edge from pippo to app, but not from app to pippo
  graph.addEdge('pippo', 'app');
  const shortestPath = makeShortestPath(graph);
  // There is no path from app to pippo, so this will throw for 'No path found'
  t.throws(() => shortestPath('app', 'pippo'), {
    message: /No path found from "app" to "pippo"/,
  });
});
