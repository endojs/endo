/**
 * Types for the `generic-graph` module
 *
 * @module
 */

/**
 * A node in a `GenericGraph`.
 */
export type GenericGraphNode = string | { toString: () => string };

/**
 * Context used for shortest-path traversal algorithm
 *
 * @template T The type of nodes in the graph
 * @internal
 */
export interface TraversalContext<T extends GenericGraphNode = string> {
  paths: Map<T, T[]>;
  predecessors: Map<T, T>;
  queue: Set<T>;
}
