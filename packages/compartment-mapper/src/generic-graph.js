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

/**
 * @import {TraversalContext} from './types/generic-graph.js';
 */

const { stringify: q } = JSON;

/**
 * Remove the node with the minimum weight from the priority queue.
 *
 * Performs linear search.
 * @template [T=string]
 * @param {TraversalContext<T>} tracks
 * @returns {T|undefined}
 */
const extractMin = ({ distances, queue }) => {
  let min = Infinity;

  /** @type {T|undefined} */
  let minNode;

  queue.forEach(node => {
    const nodeWeight = distances.get(node) ?? Infinity;

    if (nodeWeight < min) {
      min = nodeWeight;
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
 * Update context with the new distance to the target node if the distance
 * through the source node is shorter than the current distance.
 *
 * @template [T=string]
 * @param {GenericGraph<T>} graph
 * @param {TraversalContext<NoInfer<T>>} context
 * @param {NoInfer<T>} source
 * @param {NoInfer<T>} target
 */
const relax = (graph, { distances, predecessors }, source, target) => {
  const number = graph.getEdgeWeight(source, target);

  const distanceSource = distances.get(source);
  const distanceTarget = distances.get(target);

  assert(
    distanceSource !== undefined,
    `Missing distance for source ${q(source)}`,
  );
  assert(
    distanceTarget !== undefined,
    `Missing distance for target ${q(target)} target`,
  );

  if (distanceTarget > distanceSource + number) {
    distances.set(target, distanceSource + number);
    predecessors.set(target, source);
  }
};

/**
 * Assembles the shortest path by traversing the
 * predecessor subgraph from destination to source.
 *
 * @template [T=string]
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

  let node = target;

  while (predecessors.has(node)) {
    const currentNode = /** @type {T} */ (predecessors.get(node));
    nodeList.push(node);
    node = currentNode;
  }

  assert.equal(node, source, `No path found from ${q(source)} to ${q(target)}`);

  nodeList.push(node);

  assert(
    nodeList.length >= 2,
    `The path from ${source} to ${target} should have a least two nodes`,
  );

  return /** @type {[T, T, ...T[]]} */ (nodeList.reverse());
};

/**
 * @template [T=string] The type of nodes in the graph
 *
 * A generic graph implementation with edge weights.
 *
 * Edge weights are assumed to be non-negative numbers (including `Infinity`)
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
   * @type {Map<T, Map<T, number>>}
   */
  #edgeWeights;

  /**
   * Initializes internal data structures.
   */
  constructor() {
    this.#edgeWeights = new Map();
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
   * Sets the weight of the given edge between `source` and `target`.
   *
   * @param {T} source Source node
   * @param {T} target Target node
   * @param {number} weight New edge weight
   * @returns {this}
   */
  setEdgeWeight(source, target, weight) {
    if (!this.#edgeWeights.has(source)) {
      this.#edgeWeights.set(source, new Map());
    }
    const weights = /** @type {Map<T, number>} */ (
      this.#edgeWeights.get(source)
    );
    weights.set(target, weight);
    return this;
  }

  /**
   * Gets the weight of the given edge between `source` and `target`.
   *
   * @param {T} source Source node
   * @param {T} target Target node
   * @returns {number} Edge weight from source to target
   */
  getEdgeWeight(source, target) {
    const weight = this.#edgeWeights.get(source)?.get(target);
    if (weight === undefined) {
      throw new ReferenceError(
        `Edge weight from ${q(source)} to ${q(target)} is not set`,
      );
    }
    return weight;
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
   * @param {number} weight Edge weight from source to target
   * @returns {this} This graph instance
   */
  addEdge(source, target, weight) {
    this.addNode(source);
    this.addNode(target);
    const adjacentNodes = this.adjacent(source);
    assert(adjacentNodes, `Source ${q(source)} should have adjacent nodes`);

    adjacentNodes.add(target);
    this.setEdgeWeight(source, target, weight);
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
 * Dijkstra's algorithm for shortest paths in a graph.
 * @template [T=string] The type of nodes in the graph
 * @param {GenericGraph<T>} graph
 * @param {T} source
 * @param {T} target
 * @returns {TraversalContext<T>}
 */
const dijkstra = (graph, source, target) => {
  const { nodes } = graph;
  /** @type {TraversalContext<T>} */
  const context = {
    distances: new Map(),
    predecessors: new Map(),
    queue: new Set(),
  };
  const { queue, distances } = context;

  for (const node of nodes) {
    distances.set(node, Infinity);
  }

  assert(
    distances.get(source) === Infinity,
    `Source ${q(source)} is not in the graph`,
  );
  assert(
    distances.get(target) === Infinity,
    `Target ${q(target)} is not in the graph`,
  );

  distances.set(source, 0);

  for (const node of nodes) {
    queue.add(node);
  }

  while (queue.size !== 0) {
    const node = extractMin(context);
    if (node === undefined) {
      return context;
    }
    const adjacent = graph.adjacent(node);
    if (adjacent) {
      for (const edge of adjacent) {
        relax(graph, context, node, edge);
      }
    }
  }
  return context;
};

/**
 * Returns a function which uses Dijkstra's shortest path algorithm to compute
 * the shortest path from `source` to `destination` in the given `graph`.
 *
 * @template [T=string]
 * @param {GenericGraph<T>} graph Graph to use
 */
export const makeShortestPath = graph => {
  /**
   * @param {NoInfer<T>} source Source node
   * @param {NoInfer<T>} target Target node
   * @returns {[T, T, ...T[]]} Nodes from `source` to `target` inclusive (minimum of two nodes)
   */
  const shortestPath = (source, target) => {
    const context = dijkstra(graph, source, target);
    return getPath(context, source, target);
  };
  return shortestPath;
};
