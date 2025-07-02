/**
 * Types for the `generic-graph` module
 *
 * @module
 */

/**
 * Context used for shortest-path traversal algorithm
 *
 * @template T The type of nodes in the graph
 * @internal
 */
export interface TraversalContext<T = string, U = number> {
  distances: Map<T, U>;
  predecessors: Map<T, T>;
  queue: Set<T>;
}
