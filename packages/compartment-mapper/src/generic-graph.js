/**
 * Provides {@link GenericGraph} and {@link makeShortestPath}.
 *
 * Portions adapted from
 * [graph data structure](https://github.com/datavis-tech/graph-data-structure),
 * which is Copyright (c) 2016 Curran Kelleher and licensed under the MIT
 * License.
 *
 * @module
 */

import { pathCompare } from '@endo/path-compare';

/**
 * @import {GenericGraphNode, TraversalContext} from './types/generic-graph.js';
 */

const { quote: q } = assert;

/**
 * Returns `true` if the cost of path `a` is less than the cost of path `b`.
 *
 * @template {GenericGraphNode} [T=string]
 * @param {T[]} [pathA]
 * @param {T[]} [pathB]
 * @returns {boolean}
 */
const isLowerCost = (pathA, pathB) =>
  pathCompare(pathA?.map(String), pathB?.map(String)) < 0;

/**
 * Remove the node with the minimum weight from the priority queue.
 *
 * Performs linear search.
 *
 * @template {GenericGraphNode} [T=string]
 * @param {TraversalContext<T>} tracks
 * @returns {T|undefined}
 */
const extractMin = ({ paths, queue }) => {
  /** @type {T[]|undefined} */
  let minPath;

  /** @type {T|undefined} */
  let minNode;

  queue.forEach(node => {
    const path = paths.get(node);
    if (!path) {
      return;
    }

    if (!minPath || isLowerCost(path, minPath)) {
      minPath = path;
      minNode = node;
    }
  });

  if (minNode === undefined) {
    queue.clear();
    return undefined;
  }

  queue.delete(minNode);
  return minNode;
};

/**
 * Update context to include the current lowest-cost path to a target node
 * reachable by a single edge from a source node.
 *
 * @template {GenericGraphNode} [T=string]
 * @param {TraversalContext<T>} context
 * @param {NoInfer<T>} source
 * @param {NoInfer<T>} target
 */
const relax = ({ paths, predecessors }, source, target) => {
  const pathSource = paths.get(source);
  assert(pathSource, `Missing path to source ${q(source)}`);

  const pathTarget = paths.get(target);
  const newPath = [...pathSource, target];

  if (!pathTarget || isLowerCost(newPath, pathTarget)) {
    paths.set(target, newPath);
    predecessors.set(target, source);
  }
};

/**
 * Assembles the shortest path by traversing the
 * predecessor subgraph from destination to source.
 *
 * @template {GenericGraphNode} [T=string]
 * @param {TraversalContext<NoInfer<T>>} context Traversal context object
 * @param {NoInfer<T>} source Source node
 * @param {NoInfer<T>} target Destination node
 * @returns {[T, T, ...T[]]} Nodes from `source` to `target` inclusive
 * @throws If no path is found
 * @throws If the path has less than two nodes
 */
const getPath = ({ predecessors }, source, target) => {
  /** @type {T[]} */
  const nodeList = [];

  assert(
    source !== target,
    `Source ${q(source)} cannot be the same as target ${q(target)}`,
  );

  let node = target;

  while (predecessors.has(node)) {
    const currentNode = /** @type {T} */ (predecessors.get(node));
    nodeList.push(node);
    node = currentNode;
  }

  assert.equal(
    node,
    source,
    `No path found from ${q(String(source))} to ${q(String(target))}`,
  );

  nodeList.push(node);

  assert(
    nodeList.length >= 2,
    `The path from ${source} to ${target} should have at least two nodes`,
  );

  return /** @type {[T, T, ...T[]]} */ (nodeList.reverse());
};

/**
 * A generic graph implementation.
 *
 * @template {GenericGraphNode} [T=string] The type of nodes in the graph. If
 * `T` is not a string, relative paths will be compared by coercion to strings.
 */
export class GenericGraph {
  /**
   * @type {Set<T>}
   */
  #nodes;

  /**
   * @type {Map<T, Set<T>>}
   */
  #edges;

  /**
   * Initializes internal data structures.
   */
  constructor() {
    this.#edges = new Map();
    this.#nodes = new Set();
  }

  /**
   * Returns a shallow copy of the `Set` of nodes in the graph.
   */
  get nodes() {
    return new Set(this.#nodes);
  }

  /**
   * Adds a node to the graph.
   * If node was already added, this function does nothing.
   * If node was not already added, this function sets up an empty adjacency list.
   * @param {T} node Node to add
   * @returns {this} This graph instance
   */
  addNode(node) {
    if (!this.#nodes.has(node)) {
      this.#nodes.add(node);
    }
    if (!this.#edges.has(node)) {
      this.#edges.set(node, new Set());
    }
    return this;
  }

  /**
   * Removes a node from the graph.
   * Also removes incoming and outgoing edges.
   * @param {T} node
   * @returns {this}
   */
  removeNode(node) {
    this.#edges.delete(node);
    this.#nodes.delete(node);
    for (const adjacentNodes of this.#edges.values()) {
      adjacentNodes.delete(node);
    }
    return this;
  }

  /**
   * Gets the adjacent nodes set for the given node.
   * @param {T} node
   * @returns {Set<T>|undefined}
   */
  adjacent(node) {
    return this.#edges.get(node);
  }

  /**
   * Adds an edge from the `source` node to `target` node.
   *
   * This method will create the `source` and `target` node(s) if they do not
   * already exist.
   *
   * If {@link T `T`} is an object, the comparison is by-reference.
   *
   * @param {T} source Source node
   * @param {T} target Target node
   * @returns {this} This graph instance
   */
  addEdge(source, target) {
    this.addNode(source);
    this.addNode(target);
    const adjacentNodes = this.adjacent(source);
    assert(adjacentNodes, `Source ${q(source)} should have adjacent nodes`);

    adjacentNodes.add(target);
    return this;
  }

  /**
   * Removes the edge from the `source` node to `target` node.
   * Does not remove the nodes themselves.
   * Does nothing if the edge does not exist.
   * @param {T} source
   * @param {T} target
   * @returns {this}
   */
  removeEdge(source, target) {
    this.#edges.get(source)?.delete(target);
    return this;
  }

  /**
   * Returns true if there is an edge from the `source` node to `target` node.
   * @param {T} source
   * @param {T} target
   * @returns {boolean}
   */
  hasEdge(source, target) {
    return this.#edges.get(source)?.has(target) ?? false;
  }
}

/**
 * Dijkstra's single-source shortest path algorithm.
 *
 * Computes shortest paths from `source` to **all** reachable nodes.
 *
 * @template {GenericGraphNode} [T=string] The type of nodes in the graph
 * @param {GenericGraph<T>} graph
 * @param {T} source
 * @returns {TraversalContext<T>}
 */
const dijkstra = (graph, source) => {
  const { nodes } = graph;
  /** @type {TraversalContext<T>} */
  const context = {
    paths: new Map(),
    predecessors: new Map(),
    queue: nodes,
  };
  const { queue, paths } = context;

  for (const node of nodes) {
    queue.add(node);
  }

  assert(queue.has(source), `Source ${q(source)} is not in the graph`);
  paths.set(source, []);

  while (queue.size !== 0) {
    const node = extractMin(context);
    if (node === undefined) {
      return context;
    }
    const adjacent = graph.adjacent(node);
    if (adjacent) {
      for (const edge of adjacent) {
        relax(context, node, edge);
      }
    }
  }
  return context;
};

/**
 * Returns a function which computes the shortest path from `source` to
 * `target` in the given `graph`.
 *
 * Dijkstra's algorithm is a _single-source_ shortest path algorithm: one run
 * produces shortest paths to every reachable node. The returned function
 * caches the traversal context by source, so the first call for a given source
 * pays O(V²) and every subsequent call with the same source is O(path length).
 *
 * @template {GenericGraphNode} [T=string]
 * @param {GenericGraph<T>} graph Graph to use
 */
export const makeShortestPath = graph => {
  /** @type {Map<T, TraversalContext<T>>} */
  const contextCache = new Map();

  /**
   * @param {NoInfer<T>} source Source node
   * @param {NoInfer<T>} target Target node
   * @returns {[T, T, ...T[]]} Nodes from `source` to `target` inclusive (minimum of two nodes)
   */
  const shortestPath = (source, target) => {
    let context = contextCache.get(source);
    if (!context) {
      context = dijkstra(graph, source);
      contextCache.set(source, context);
    }
    return getPath(context, source, target);
  };
  return shortestPath;
};
