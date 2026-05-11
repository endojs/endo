// @ts-check

/** @import { Formula, FormulaIdentifier } from './types.js' */

/**
 * @typedef {object} LabeledEdge
 * @property {string} label
 * @property {FormulaIdentifier} target
 */

/**
 * @typedef {object} RetentionPathSegment
 * @property {FormulaIdentifier[]} groupMembers
 * @property {FormulaIdentifier} [referencedBy] - source group representative
 * @property {string[]} [labels] - edge labels from source
 * @property {'root'} [type] - present if this is a root group
 */

/** @typedef {RetentionPathSegment[]} RetentionPath */

/**
 * The formula graph tracks the dependency structure between formulas
 * and performs immediate reference-counted collection when formulas
 * become unreachable.
 *
 * It maintains two kinds of raw edges:
 *
 * 1. **Formula deps** — static edges derived from a formula's
 *    definition (e.g., a guest depends on its worker, pet store).
 * 2. **Pet store edges** — dynamic edges from pet stores to the
 *    formulas they name.
 * 3. **Retention edges** — edges from agent formulas to formulas
 *    that remote peers depend on.
 *
 * Formulas that share identity (host↔handle, channel↔handle,
 * promise↔resolver) are merged into **groups** via union-find and
 * collected atomically.
 *
 * Each group maintains a reference count: the number of distinct
 * external groups referencing it, plus virtual root contributions.
 * When a group's ref count drops to zero and it is not a root,
 * it is collected immediately.
 *
 * @param {object} args
 * @param {(formula: Formula) => Array<[string, FormulaIdentifier]>} args.extractLabeledDeps
 * @param {(id: FormulaIdentifier) => boolean} args.isLocalId
 * @param {(collectedIds: FormulaIdentifier[]) => void} args.onCollect
 */
export const makeFormulaGraph = ({
  extractLabeledDeps,
  isLocalId,
  onCollect,
}) => {
  // --- Raw edge storage ---

  /** @type {Map<FormulaIdentifier, Set<FormulaIdentifier>>} */
  const formulaDeps = new Map();
  /** @type {Map<FormulaIdentifier, Set<FormulaIdentifier>>} */
  const petStoreEdges = new Map();
  /** @type {Set<FormulaIdentifier>} */
  const roots = new Set();

  // Labeled edges for retention-path queries.
  /** @type {Map<FormulaIdentifier, LabeledEdge[]>} */
  const labeledEdges = new Map();

  // In-memory retention edges: agentId → Set<formulaId>.
  /** @type {Map<FormulaIdentifier, Set<FormulaIdentifier>>} */
  const retentionEdges = new Map();

  // Transient roots (protect formulas during command execution).
  // Values are pin counts — a formula can be pinned multiple times
  // and must be unpinned the same number of times.
  /** @type {Map<FormulaIdentifier, number>} */
  const transientRoots = new Map();

  // --- Union-find ---

  /** @type {Map<FormulaIdentifier, FormulaIdentifier>} */
  const parent = new Map();
  /** @type {Map<FormulaIdentifier, number>} */
  const ufSize = new Map();
  /** @type {Map<FormulaIdentifier, { promiseId?: FormulaIdentifier, resolverId?: FormulaIdentifier }>} */
  const promiseResolverByStore = new Map();

  // --- Group-level ref counting ---

  // group → Set<member formula ids>
  /** @type {Map<FormulaIdentifier, Set<FormulaIdentifier>>} */
  const groupMembers = new Map();
  // group → Map<targetGroup, edgeMultiplicity>
  /** @type {Map<FormulaIdentifier, Map<FormulaIdentifier, number>>} */
  const groupOutEdges = new Map();
  // group → Set<sourceGroup>
  /** @type {Map<FormulaIdentifier, Set<FormulaIdentifier>>} */
  const groupInEdges = new Map();
  // group → number of distinct referrers + root contributions
  /** @type {Map<FormulaIdentifier, number>} */
  const groupRefCount = new Map();

  // Whether collection is currently in progress (prevents re-entrant
  // collection from maybeCollect calls during onCollect).
  let collecting = false;

  // Whether formula addition is in progress (prevents premature
  // collection of formulas whose transient pins haven't been applied yet).
  let addingFormula = false;

  // --- Union-find operations ---

  /** @param {FormulaIdentifier} id */
  const ensure = id => {
    if (!parent.has(id)) {
      parent.set(id, id);
      ufSize.set(id, 1);
      const members = new Set();
      members.add(id);
      groupMembers.set(id, members);
      groupRefCount.set(id, 0);
    }
  };

  /** @param {FormulaIdentifier} id */
  const findGroup = id => {
    ensure(id);
    const next = /** @type {FormulaIdentifier} */ (parent.get(id));
    if (next !== id) {
      const root = findGroup(next);
      parent.set(id, root);
      return root;
    }
    return id;
  };

  /**
   * Check if a group is a root (any member in roots or transientRoots).
   * @param {FormulaIdentifier} group
   */
  const isRootGroup = group => {
    const members = groupMembers.get(group);
    if (members === undefined) return false;
    for (const m of members) {
      if (roots.has(m) || (transientRoots.get(m) ?? 0) > 0) return true;
    }
    return false;
  };

  // --- Group-level edge primitives ---

  /**
   * Add a group-level edge from sourceId's group to targetId's group.
   * Increments the target group's ref count if this is the first edge
   * from the source group.
   *
   * @param {FormulaIdentifier} sourceId
   * @param {FormulaIdentifier} targetId
   */
  const addGroupEdge = (sourceId, targetId) => {
    const sg = findGroup(sourceId);
    const tg = findGroup(targetId);
    if (sg === tg) return;

    const out = groupOutEdges.get(sg) ?? new Map();
    const prev = out.get(tg) ?? 0;
    out.set(tg, prev + 1);
    groupOutEdges.set(sg, out);

    if (prev === 0) {
      groupRefCount.set(tg, (groupRefCount.get(tg) ?? 0) + 1);
      const inSet = groupInEdges.get(tg) ?? new Set();
      inSet.add(sg);
      groupInEdges.set(tg, inSet);
    }
  };

  /**
   * Remove a group-level edge from sourceId's group to targetId's group.
   * Decrements the target group's ref count if this was the last edge
   * from the source group. May trigger collection.
   *
   * @param {FormulaIdentifier} sourceId
   * @param {FormulaIdentifier} targetId
   */
  const removeGroupEdge = (sourceId, targetId) => {
    const sg = findGroup(sourceId);
    const tg = findGroup(targetId);
    if (sg === tg) return;

    const out = groupOutEdges.get(sg);
    if (!out) return;
    const prev = out.get(tg) ?? 0;
    if (prev <= 0) return;

    if (prev === 1) {
      out.delete(tg);
      if (out.size === 0) {
        groupOutEdges.delete(sg);
      }
      const newCount = (groupRefCount.get(tg) ?? 0) - 1;
      groupRefCount.set(tg, newCount);
      groupInEdges.get(tg)?.delete(sg);
      // eslint-disable-next-line no-use-before-define
      maybeCollect(tg);
    } else {
      out.set(tg, prev - 1);
    }
  };

  // --- Cascading collection ---

  /**
   * If `startGroup` has zero ref count and is not a root, collect it
   * and cascade to any children whose ref counts drop to zero.
   *
   * @param {FormulaIdentifier} startGroup
   */
  const maybeCollect = startGroup => {
    if (collecting || addingFormula) return;

    const rc = groupRefCount.get(startGroup) ?? 0;
    if (rc > 0) return;
    if (isRootGroup(startGroup)) return;

    collecting = true;
    try {
      const queue = [startGroup];
      /** @type {FormulaIdentifier[]} */
      const collectedGroups = [];

      while (queue.length > 0) {
        const g = /** @type {FormulaIdentifier} */ (queue.shift());
        const eligible =
          (groupRefCount.get(g) ?? 0) <= 0 &&
          !isRootGroup(g) &&
          !collectedGroups.includes(g);
        if (eligible) {
          collectedGroups.push(g);

          // Decrement children's ref counts.
          const out = groupOutEdges.get(g);
          if (out !== undefined) {
            for (const [child] of out) {
              const newCount = (groupRefCount.get(child) ?? 0) - 1;
              groupRefCount.set(child, newCount);
              groupInEdges.get(child)?.delete(g);
              if (newCount <= 0 && !isRootGroup(child)) {
                queue.push(child);
              }
            }
            groupOutEdges.delete(g);
          }
        }
      }

      if (collectedGroups.length === 0) return;

      // Flatten to formula IDs.
      /** @type {FormulaIdentifier[]} */
      const collectedIds = [];
      for (const g of collectedGroups) {
        const members = groupMembers.get(g);
        if (members !== undefined) {
          for (const id of members) {
            collectedIds.push(id);
          }
        }
      }

      // Clean up graph structures for collected formulas.
      for (const id of collectedIds) {
        formulaDeps.delete(id);
        labeledEdges.delete(id);
        petStoreEdges.delete(id);
        retentionEdges.delete(id);
        parent.delete(id);
        ufSize.delete(id);
        // Clean up promiseResolverByStore entries.
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
      }
      for (const g of collectedGroups) {
        groupMembers.delete(g);
        groupRefCount.delete(g);
        groupInEdges.delete(g);
        // groupOutEdges already deleted above
      }

      onCollect(collectedIds);
    } finally {
      collecting = false;
    }
  };

  // --- Union with ref-count reconciliation ---

  /**
   * Merges two formulas into the same group. Reconciles group-level
   * ref counts so that cross-group edges becoming intra-group edges
   * correctly decrement counts.
   *
   * @param {FormulaIdentifier} left
   * @param {FormulaIdentifier} right
   */
  const union = (left, right) => {
    let winner = findGroup(left);
    let loser = findGroup(right);
    if (winner === loser) return;

    // Union-by-size: smaller tree merges into larger.
    const winnerSize = ufSize.get(winner) || 1;
    const loserSize = ufSize.get(loser) || 1;
    if (winnerSize < loserSize) {
      const tmp = winner;
      winner = loser;
      loser = tmp;
    }

    // 1. Merge outgoing edges from loser into winner.
    const loserOut = groupOutEdges.get(loser);
    if (loserOut !== undefined) {
      const winnerOut = groupOutEdges.get(winner) ?? new Map();
      groupOutEdges.set(winner, winnerOut);

      for (const [targetGroup, count] of loserOut) {
        if (targetGroup === winner) {
          // Edge from loser to winner becomes intra-group.
          const rc = (groupRefCount.get(winner) ?? 0) - 1;
          groupRefCount.set(winner, rc);
          groupInEdges.get(winner)?.delete(loser);
        } else {
          const existing = winnerOut.get(targetGroup) ?? 0;
          if (existing === 0) {
            // Winner didn't previously reference this target.
            // Ref count of target stays the same (was counting loser,
            // now counts winner).
            groupInEdges.get(targetGroup)?.delete(loser);
            const inSet = groupInEdges.get(targetGroup) ?? new Set();
            inSet.add(winner);
            groupInEdges.set(targetGroup, inSet);
          } else {
            // Both groups already referenced this target.
            // Target loses one distinct referrer.
            const rc = (groupRefCount.get(targetGroup) ?? 0) - 1;
            groupRefCount.set(targetGroup, rc);
            groupInEdges.get(targetGroup)?.delete(loser);
          }
          winnerOut.set(targetGroup, existing + count);
        }
      }
      groupOutEdges.delete(loser);
    }

    // 2. Merge incoming edges to loser into winner.
    const loserIn = groupInEdges.get(loser);
    if (loserIn !== undefined) {
      for (const sourceGroup of loserIn) {
        if (sourceGroup === winner) {
          // Edge from winner to loser becomes intra-group.
          // Winner's outgoing to loser was already handled in step 1
          // if loser had outgoing to winner — but this is the reverse.
          const winnerOut = groupOutEdges.get(winner);
          if (winnerOut) {
            winnerOut.delete(loser);
            if (winnerOut.size === 0) {
              groupOutEdges.delete(winner);
            }
          }
          // Loser's ref count was counting this; it will be transferred below.
        } else {
          const srcOut = groupOutEdges.get(sourceGroup);
          if (srcOut) {
            const countToLoser = srcOut.get(loser) ?? 0;
            srcOut.delete(loser);

            const existingToWinner = srcOut.get(winner) ?? 0;
            if (existingToWinner === 0) {
              // Source didn't previously reference winner.
              // Transfer the edge, ref count neutral.
              const inSet = groupInEdges.get(winner) ?? new Set();
              inSet.add(sourceGroup);
              groupInEdges.set(winner, inSet);
            } else {
              // Source already referenced winner. Lose one distinct referrer.
              const rc = (groupRefCount.get(winner) ?? 0) - 1;
              groupRefCount.set(winner, rc);
            }
            srcOut.set(winner, existingToWinner + countToLoser);
          }
        }
      }
      groupInEdges.delete(loser);
    }

    // 3. Transfer root contributions from loser to winner.
    const loserMembers = groupMembers.get(loser);
    if (loserMembers !== undefined) {
      let loserRootCount = 0;
      for (const m of loserMembers) {
        if (roots.has(m)) loserRootCount += 1;
        if ((transientRoots.get(m) ?? 0) > 0) loserRootCount += 1;
      }
      if (loserRootCount > 0) {
        const rc = (groupRefCount.get(winner) ?? 0) + loserRootCount;
        groupRefCount.set(winner, rc);
      }
    }

    // 4. Transfer members.
    const winnerMembers = groupMembers.get(winner) ?? new Set();
    groupMembers.set(winner, winnerMembers);
    if (loserMembers !== undefined) {
      for (const m of loserMembers) {
        winnerMembers.add(m);
      }
    }

    // 5. Clean up loser.
    groupMembers.delete(loser);
    groupRefCount.delete(loser);

    // 6. Do the actual union-find parent update.
    parent.set(loser, winner);
    ufSize.set(winner, winnerSize + loserSize);

    // 7. Merging can only decrease ref counts; check if winner
    //    is now collectible.
    maybeCollect(winner);
  };

  // --- Labeled edge helpers ---

  /**
   * @param {FormulaIdentifier} sourceId
   * @param {string} label
   * @param {FormulaIdentifier} target
   */
  const addLabeledEdge = (sourceId, label, target) => {
    const edges = labeledEdges.get(sourceId) ?? [];
    edges.push({ label, target });
    labeledEdges.set(sourceId, edges);
  };

  /**
   * @param {FormulaIdentifier} sourceId
   * @param {string} label
   * @param {FormulaIdentifier} target
   */
  const removeLabeledEdge = (sourceId, label, target) => {
    const edges = labeledEdges.get(sourceId);
    if (edges === undefined) return;
    const idx = edges.findIndex(e => e.label === label && e.target === target);
    if (idx >= 0) {
      edges.splice(idx, 1);
      if (edges.length === 0) {
        labeledEdges.delete(sourceId);
      }
    }
  };

  // --- Public hooks ---

  /**
   * Registers a new formula: records static dependencies, adds
   * group-level edges, and unions related formulas.
   *
   * @param {FormulaIdentifier} id
   * @param {Formula} formula
   */
  const onFormulaAdded = (id, formula) => {
    // Suppress collection during formula addition. Unions performed
    // here can temporarily drop a group's ref count to 0, but the
    // caller (formulate/formulateLazy) will immediately pin or
    // reference the formula afterward.
    addingFormula = true;
    try {
      ensure(id);
      const labeled = extractLabeledDeps(formula);
      const localDeps = labeled.filter(([, dep]) => isLocalId(dep));

      formulaDeps.set(id, new Set(localDeps.map(([, dep]) => dep)));

      // Register labeled edges and add group-level edges.
      for (const [label, dep] of localDeps) {
        ensure(dep);
        addLabeledEdge(id, label, dep);
        addGroupEdge(id, dep);
      }

      // Union formulas that share identity.
      if (formula.type === 'handle') {
        union(id, formula.agent);
      } else if (
        formula.type === 'host' ||
        formula.type === 'guest' ||
        formula.type === 'channel'
      ) {
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
    } finally {
      addingFormula = false;
    }
  };

  /**
   * Removes a formula's static dependency edges from the graph.
   * Called as part of collection cleanup.
   *
   * Note: This does NOT trigger further collection — it is called
   * after the group has already been collected by maybeCollect.
   * The group-level edge decrements happen inside maybeCollect itself.
   *
   * @param {FormulaIdentifier} id
   */
  const onFormulaRemoved = id => {
    formulaDeps.delete(id);
    labeledEdges.delete(id);
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
  };

  /**
   * Records that a pet store now names a formula.
   *
   * @param {FormulaIdentifier} petStoreId
   * @param {FormulaIdentifier} id
   */
  const onPetStoreWrite = (petStoreId, id) => {
    const set = petStoreEdges.get(petStoreId) || new Set();
    const isNew = !set.has(id);
    set.add(id);
    petStoreEdges.set(petStoreId, set);
    if (isNew) {
      addLabeledEdge(petStoreId, 'petName', id);
      addGroupEdge(petStoreId, id);
    }
  };

  /**
   * Records that a pet store no longer names a formula.
   *
   * @param {FormulaIdentifier} petStoreId
   * @param {FormulaIdentifier} id
   */
  const onPetStoreRemove = (petStoreId, id) => {
    const set = petStoreEdges.get(petStoreId);
    if (set !== undefined && set.has(id)) {
      set.delete(id);
      if (set.size === 0) {
        petStoreEdges.delete(petStoreId);
      }
      removeLabeledEdge(petStoreId, 'petName', id);
      removeGroupEdge(petStoreId, id);
    }
  };

  /**
   * Removes all dynamic edges from a pet store.
   *
   * @param {FormulaIdentifier} petStoreId
   */
  const onPetStoreRemoveAll = petStoreId => {
    const set = petStoreEdges.get(petStoreId);
    if (set !== undefined) {
      for (const id of set) {
        removeLabeledEdge(petStoreId, 'petName', id);
        removeGroupEdge(petStoreId, id);
      }
      petStoreEdges.delete(petStoreId);
    }
  };

  /**
   * Adds a formula to the permanent root set.
   *
   * @param {FormulaIdentifier} id
   */
  const addRoot = id => {
    ensure(id);
    if (!roots.has(id)) {
      roots.add(id);
      const g = findGroup(id);
      groupRefCount.set(g, (groupRefCount.get(g) ?? 0) + 1);
    }
  };

  // --- Transient roots ---

  /**
   * Temporarily adds a formula to the root set, protecting it
   * from collection until unpinned.
   *
   * @param {FormulaIdentifier} id
   */
  const pinTransient = id => {
    ensure(id);
    const prev = transientRoots.get(id) ?? 0;
    transientRoots.set(id, prev + 1);
    if (prev === 0) {
      // First pin: increment group ref count.
      const g = findGroup(id);
      groupRefCount.set(g, (groupRefCount.get(g) ?? 0) + 1);
    }
  };

  /**
   * Removes a formula from the transient root set.
   *
   * @param {FormulaIdentifier} id
   */
  const unpinTransient = id => {
    const prev = transientRoots.get(id) ?? 0;
    if (prev <= 0) return;
    if (prev === 1) {
      transientRoots.delete(id);
      const g = findGroup(id);
      const rc = (groupRefCount.get(g) ?? 0) - 1;
      groupRefCount.set(g, rc);
      maybeCollect(g);
    } else {
      transientRoots.set(id, prev - 1);
    }
  };

  // --- Retention edges ---

  /**
   * Add a retention edge from an agent to a formula that a remote
   * peer depends on.
   *
   * @param {FormulaIdentifier} agentId
   * @param {FormulaIdentifier} formulaId
   */
  const addRetention = (agentId, formulaId) => {
    const set = retentionEdges.get(agentId) ?? new Set();
    if (set.has(formulaId)) return;
    set.add(formulaId);
    retentionEdges.set(agentId, set);
    addLabeledEdge(agentId, 'retention', formulaId);
    addGroupEdge(agentId, formulaId);
  };

  /**
   * Remove a retention edge.
   *
   * @param {FormulaIdentifier} agentId
   * @param {FormulaIdentifier} formulaId
   */
  const removeRetention = (agentId, formulaId) => {
    const set = retentionEdges.get(agentId);
    if (set === undefined || !set.has(formulaId)) return;
    set.delete(formulaId);
    if (set.size === 0) {
      retentionEdges.delete(agentId);
    }
    removeLabeledEdge(agentId, 'retention', formulaId);
    removeGroupEdge(agentId, formulaId);
  };

  /**
   * Replace the entire retention set for an agent.
   * Diffs against the current set and applies add/remove operations.
   *
   * @param {FormulaIdentifier} agentId
   * @param {FormulaIdentifier[]} newIds
   */
  const replaceRetention = (agentId, newIds) => {
    const oldSet = retentionEdges.get(agentId) ?? new Set();
    const newSet = new Set(newIds);
    // Remove entries no longer in the new set.
    for (const id of oldSet) {
      if (!newSet.has(id)) {
        removeRetention(agentId, id);
      }
    }
    // Add entries not in the old set.
    for (const id of newSet) {
      if (!oldSet.has(id)) {
        addRetention(agentId, id);
      }
    }
  };

  // --- Retention path listing ---

  /**
   * Find the edge labels from members of srcGroup to members of
   * tgtGroup by scanning labeledEdges.
   *
   * @param {FormulaIdentifier} srcGroup
   * @param {FormulaIdentifier} tgtGroup
   * @returns {string[]}
   */
  const findEdgeLabels = (srcGroup, tgtGroup) => {
    const srcMembers = groupMembers.get(srcGroup);
    const tgtMembers = groupMembers.get(tgtGroup);
    if (!srcMembers || !tgtMembers) return [];
    /** @type {string[]} */
    const labels = [];
    for (const src of srcMembers) {
      const edges = labeledEdges.get(src);
      if (edges !== undefined) {
        for (const { label, target } of edges) {
          if (tgtMembers.has(target)) {
            labels.push(label);
          }
        }
      }
    }
    return labels;
  };

  /**
   * Enumerate all retention paths from roots to a target formula.
   * Each path is an array of segments from the target back to a root.
   *
   * @param {FormulaIdentifier} targetId
   * @returns {RetentionPath[]}
   */
  const listRetentionPaths = targetId => {
    if (!parent.has(targetId)) return [];
    const targetGroup = findGroup(targetId);
    /** @type {RetentionPath[]} */
    const paths = [];
    /** @type {Array<{group: FormulaIdentifier, path: RetentionPath}>} */
    const queue = [{ group: targetGroup, path: [] }];
    /** @type {Set<FormulaIdentifier>} */
    const visited = new Set();

    while (queue.length > 0) {
      const { group, path } =
        /** @type {{group: FormulaIdentifier, path: RetentionPath}} */ (
          queue.shift()
        );
      if (!visited.has(group)) {
        visited.add(group);

        /** @type {RetentionPathSegment} */
        const entry = {
          groupMembers: [...(groupMembers.get(group) ?? [])],
        };

        if (isRootGroup(group)) {
          paths.push([...path, { ...entry, type: 'root' }]);
        } else {
          const inSet = groupInEdges.get(group);
          if (inSet !== undefined && inSet.size > 0) {
            for (const src of inSet) {
              const labels = findEdgeLabels(src, group);
              queue.push({
                group: src,
                path: [...path, { ...entry, referencedBy: src, labels }],
              });
            }
          }
        }
      }
    }

    return paths;
  };

  /**
   * Run a one-time sweep for unreachable groups. Called after
   * seeding the graph from persistence at startup.
   */
  const sweepUnreachable = () => {
    // Collect all groups.
    /** @type {Set<FormulaIdentifier>} */
    const allGroups = new Set();
    for (const [, group] of [...parent.entries()].map(([id]) => [
      id,
      findGroup(id),
    ])) {
      allGroups.add(group);
    }
    for (const g of allGroups) {
      if ((groupRefCount.get(g) ?? 0) <= 0 && !isRootGroup(g)) {
        maybeCollect(g);
      }
    }
  };

  return harden({
    addRoot,
    onFormulaAdded,
    onFormulaRemoved,
    onPetStoreWrite,
    onPetStoreRemove,
    onPetStoreRemoveAll,
    addRetention,
    removeRetention,
    replaceRetention,
    pinTransient,
    unpinTransient,
    findGroup,
    roots,
    listRetentionPaths,
    sweepUnreachable,
    formulaDeps,
    petStoreEdges,
    groupMembers,
  });
};
harden(makeFormulaGraph);
