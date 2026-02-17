// @ts-check

/** @import { Formula, FormulaIdentifier } from './types.js' */

/**
 * The formula graph tracks the dependency structure between formulas for
 * garbage collection (formula collection). It maintains two kinds of edges:
 *
 * 1. **Formula deps** — static edges derived from a formula's definition
 *    (e.g., a guest depends on its worker, pet store, mailbox store).
 * 2. **Pet store edges** — dynamic edges from pet stores to the formulas
 *    they name. These change as pet names are added and removed.
 *
 * Formulas that share identity (e.g., a host and its handle, or a
 * promise and its resolver) are merged into **groups** using a
 * union-find structure so they are collected atomically.
 *
 * The collector (collectIfDirty) builds a group-level dependency graph,
 * computes reference counts, and collects groups with zero incoming
 * references that are not in the root set. The `dirty` flag avoids
 * redundant collection passes when the graph hasn't changed.
 *
 * @param {object} args
 * @param {(formula: Formula) => FormulaIdentifier[]} args.extractDeps
 * @param {(id: FormulaIdentifier) => boolean} args.isLocalId
 */
export const makeFormulaGraph = ({ extractDeps, isLocalId }) => {
  // Static dependencies: formula id -> set of formula ids it depends on.
  /** @type {Map<FormulaIdentifier, Set<FormulaIdentifier>>} */
  const formulaDeps = new Map();
  // Dynamic dependencies: pet store id -> set of formula ids named in it.
  /** @type {Map<FormulaIdentifier, Set<FormulaIdentifier>>} */
  const petStoreEdges = new Map();
  // Formulas that are never collected (endo, main worker, known peers, etc.).
  /** @type {Set<FormulaIdentifier>} */
  const roots = new Set();

  // Union-find: each id maps to its parent; a root maps to itself.
  /** @type {Map<FormulaIdentifier, FormulaIdentifier>} */
  const parent = new Map();
  // Union-find: rank heuristic — size of each root's tree.
  /** @type {Map<FormulaIdentifier, number>} */
  const size = new Map();
  // Tracks promise/resolver pairs by their shared store so they can be
  // unioned once both halves are known.
  /** @type {Map<FormulaIdentifier, { promiseId?: FormulaIdentifier, resolverId?: FormulaIdentifier }>} */
  const promiseResolverByStore = new Map();
  let dirty = true;

  /**
   * Initializes a formula as a singleton group in the union-find
   * if it hasn't been seen before. Idempotent.
   *
   * @param {FormulaIdentifier} id
   */
  const ensure = id => {
    if (!parent.has(id)) {
      parent.set(id, id);
      size.set(id, 1);
    }
  };

  /**
   * Returns the representative (root) of the group containing `id`,
   * applying path compression so future lookups are O(1).
   *
   * @param {FormulaIdentifier} id
   */
  const findGroup = id => {
    ensure(id);
    // Safe: ensure() guarantees parent.has(id).
    const next = /** @type {FormulaIdentifier} */ (parent.get(id));
    if (next !== id) {
      const root = findGroup(next);
      parent.set(id, root);
      return root;
    }
    return id;
  };

  /**
   * Merges two formulas into the same group so they are collected
   * together. Uses union-by-size to keep trees balanced.
   *
   * @param {FormulaIdentifier} left
   * @param {FormulaIdentifier} right
   */
  const union = (left, right) => {
    const leftRoot = findGroup(left);
    const rightRoot = findGroup(right);
    if (leftRoot === rightRoot) {
      return;
    }
    const leftSize = size.get(leftRoot) || 1;
    const rightSize = size.get(rightRoot) || 1;
    if (leftSize < rightSize) {
      parent.set(leftRoot, rightRoot);
      size.set(rightRoot, leftSize + rightSize);
    } else {
      parent.set(rightRoot, leftRoot);
      size.set(leftRoot, leftSize + rightSize);
    }
    dirty = true;
  };

  /**
   * Registers a new formula: records its static dependencies and
   * unions it with related formulas that share identity
   * (host<->handle, promise<->resolver).
   *
   * @param {FormulaIdentifier} id
   * @param {Formula} formula
   */
  const onFormulaAdded = (id, formula) => {
    ensure(id);
    const deps = extractDeps(formula).filter(isLocalId);
    formulaDeps.set(id, new Set(deps));
    if (formula.type === 'handle') {
      union(id, formula.agent);
    } else if (formula.type === 'host' || formula.type === 'guest') {
      union(id, formula.handle);
    } else if (formula.type === 'promise' || formula.type === 'resolver') {
      const record = promiseResolverByStore.get(formula.store) || {};
      if (formula.type === 'promise') {
        record.promiseId = id;
      } else {
        record.resolverId = id;
      }
      promiseResolverByStore.set(formula.store, record);
      if (record.promiseId && record.resolverId) {
        union(record.promiseId, record.resolverId);
      }
    }
    dirty = true;
  };

  /**
   * Removes a collected formula from the dependency graph and cleans
   * up any promise/resolver pairing that referenced it.
   *
   * @param {FormulaIdentifier} id
   */
  const onFormulaRemoved = id => {
    formulaDeps.delete(id);
    for (const [storeId, record] of promiseResolverByStore.entries()) {
      if (record.promiseId === id) {
        delete record.promiseId;
      }
      if (record.resolverId === id) {
        delete record.resolverId;
      }
      if (!record.promiseId && !record.resolverId) {
        promiseResolverByStore.delete(storeId);
      }
    }
    dirty = true;
  };

  /**
   * Records that a pet store now names a formula (a dynamic edge).
   *
   * @param {FormulaIdentifier} petStoreId
   * @param {FormulaIdentifier} id
   */
  const onPetStoreWrite = (petStoreId, id) => {
    const set = petStoreEdges.get(petStoreId) || new Set();
    set.add(id);
    petStoreEdges.set(petStoreId, set);
    dirty = true;
  };

  /**
   * Records that a pet store no longer names a formula.
   *
   * @param {FormulaIdentifier} petStoreId
   * @param {FormulaIdentifier} id
   */
  const onPetStoreRemove = (petStoreId, id) => {
    const set = petStoreEdges.get(petStoreId);
    if (set !== undefined) {
      set.delete(id);
      if (set.size === 0) {
        petStoreEdges.delete(petStoreId);
      }
      dirty = true;
    }
  };

  /**
   * Removes all dynamic edges from a pet store (used when the store
   * itself is collected).
   *
   * @param {FormulaIdentifier} petStoreId
   */
  const onPetStoreRemoveAll = petStoreId => {
    if (petStoreEdges.delete(petStoreId)) {
      dirty = true;
    }
  };

  /**
   * Adds a formula to the permanent root set (never collected).
   *
   * @param {FormulaIdentifier} id
   */
  const addRoot = id => {
    roots.add(id);
    dirty = true;
  };

  return harden({
    addRoot,
    onFormulaAdded,
    onFormulaRemoved,
    onPetStoreWrite,
    onPetStoreRemove,
    onPetStoreRemoveAll,
    findGroup,
    roots,
    isDirty: () => dirty,
    clearDirty: () => {
      dirty = false;
    },
    formulaDeps,
    petStoreEdges,
  });
};
