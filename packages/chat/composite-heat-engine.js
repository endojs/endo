// @ts-check
/* global requestAnimationFrame, cancelAnimationFrame */

import {
  deriveConstants,
  LOCKOUT_THRESHOLD,
  formatDuration,
} from './heat-engine.js';

/**
 * @typedef {object} HopPolicy
 * @property {number} hopIndex
 * @property {string} label
 * @property {string} memberId
 * @property {number} burstLimit
 * @property {number} sustainedRate
 * @property {number} lockoutDurationMs
 * @property {number} postLockoutPct
 */

/**
 * @typedef {object} HopState
 * @property {number} hopIndex
 * @property {number} heat
 * @property {boolean} locked
 * @property {number} lockRemaining
 */

/**
 * @typedef {object} HeatEvent
 * @property {string} type - 'heat' or 'snapshot'
 * @property {string} hopMemberId
 * @property {number} heat
 * @property {boolean} locked
 * @property {number} lockEndTime
 * @property {number} timestamp
 */

/**
 * @typedef {object} PerHopSim
 * @property {HopPolicy} policy
 * @property {number} heat
 * @property {boolean} locked
 * @property {number} lockEndTime
 * @property {number} lastUpdateTime
 * @property {number} heatPerMessage
 * @property {number} coolRate
 */

/**
 * @typedef {object} CompositeState
 * @property {number} effectiveHeat - Max normalized heat across all hops (0–100)
 * @property {boolean} effectiveLocked - True if any hop is locked
 * @property {number} effectiveLockRemaining - Max lock remaining across hops (ms)
 * @property {boolean} canSend - False if any hop is locked
 * @property {number} bottleneckIndex - Index of the hop with highest normalized heat
 * @property {string} bottleneckLabel - Label of the bottleneck hop
 * @property {boolean} isSelfBottleneck - True if bottleneck is the user's own hop (last in chain)
 * @property {PerHopView[]} hops - Per-hop view data for UI rendering
 */

/**
 * @typedef {object} PerHopView
 * @property {number} hopIndex
 * @property {string} label
 * @property {number} normalizedHeat - 0–100 relative to its own threshold
 * @property {boolean} locked
 * @property {number} lockRemaining
 * @property {boolean} isSelf - True if this is the user's own hop (last in chain)
 */

/**
 * Create a composite heat engine that tracks multiple hops independently.
 *
 * @param {HopPolicy[]} hopPolicies
 * @param {HopState[]} initialStates
 * @param {(state: CompositeState) => void} onUpdate
 * @returns {{ start: () => void, stop: () => void, applyEvent: (event: HeatEvent) => void, recordSend: () => { allowed: boolean, lockRemainingMs: number }, getCompositeState: () => CompositeState, getHopStates: () => PerHopView[] }}
 */
const makeCompositeHeatEngine = (hopPolicies, initialStates, onUpdate) => {
  /** @type {PerHopSim[]} */
  const hops = hopPolicies.map((policy, i) => {
    const { heatPerMessage, coolRate } = deriveConstants(policy);
    const initial = initialStates[i] || {
      heat: 0,
      locked: false,
      lockRemaining: 0,
    };
    // Only honour server lock state if there is meaningful time remaining.
    // A lockRemaining of 0 (or already expired) means the lockout is over.
    const stillLocked = initial.locked && initial.lockRemaining > 0;
    return {
      policy,
      heat: stillLocked ? LOCKOUT_THRESHOLD : initial.heat,
      locked: stillLocked,
      lockEndTime: stillLocked ? Date.now() + initial.lockRemaining : 0,
      lastUpdateTime: Date.now(),
      heatPerMessage,
      coolRate,
    };
  });

  // Map from memberId to hop index for event routing
  /** @type {Map<string, number>} */
  const memberIdToIndex = new Map();
  for (let i = 0; i < hopPolicies.length; i += 1) {
    memberIdToIndex.set(hopPolicies[i].memberId, i);
  }

  /** @type {number | null} */
  let rafId = null;

  /**
   * Apply cooling to a single hop.
   * @param {PerHopSim} hop
   * @param {number} now
   */
  const tickHop = (hop, now) => {
    if (hop.locked) {
      if (now >= hop.lockEndTime) {
        hop.heat = hop.policy.postLockoutPct;
        hop.locked = false;
        hop.lockEndTime = 0;
      }
      hop.lastUpdateTime = now;
      return;
    }
    const dt = hop.lastUpdateTime > 0 ? (now - hop.lastUpdateTime) / 1000 : 0;
    hop.heat = Math.max(0, hop.heat - hop.coolRate * dt);
    hop.lastUpdateTime = now;
  };

  /**
   * @returns {CompositeState}
   */
  const computeComposite = () => {
    let effectiveHeat = 0;
    let effectiveLocked = false;
    let effectiveLockRemaining = 0;
    let bottleneckIndex = 0;
    const now = Date.now();

    /** @type {PerHopView[]} */
    const hopViews = hops.map((hop, i) => {
      const normalizedHeat = Math.min(
        100,
        (hop.heat / LOCKOUT_THRESHOLD) * 100,
      );
      const lockRemaining = hop.locked ? Math.max(0, hop.lockEndTime - now) : 0;
      const isSelf = i === hops.length - 1;

      if (normalizedHeat > effectiveHeat) {
        effectiveHeat = normalizedHeat;
        bottleneckIndex = i;
      }
      if (hop.locked) {
        effectiveLocked = true;
        effectiveLockRemaining = Math.max(
          effectiveLockRemaining,
          lockRemaining,
        );
      }

      return {
        hopIndex: i,
        label: hop.policy.label,
        normalizedHeat,
        locked: hop.locked,
        lockRemaining,
        isSelf,
      };
    });

    return {
      effectiveHeat,
      effectiveLocked,
      effectiveLockRemaining,
      canSend: !effectiveLocked,
      bottleneckIndex,
      bottleneckLabel: hops[bottleneckIndex]?.policy.label || '',
      isSelfBottleneck: bottleneckIndex === hops.length - 1,
      hops: hopViews,
    };
  };

  const tick = () => {
    const now = Date.now();
    for (const hop of hops) {
      tickHop(hop, now);
    }
    onUpdate(computeComposite());
    rafId = requestAnimationFrame(tick);
  };

  return {
    start: () => {
      if (rafId !== null) return;
      const now = Date.now();
      for (const hop of hops) {
        hop.lastUpdateTime = now;
      }
      rafId = requestAnimationFrame(tick);
    },
    stop: () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    applyEvent: event => {
      const idx = memberIdToIndex.get(event.hopMemberId);
      if (idx === undefined) return;
      const hop = hops[idx];

      if (event.type === 'snapshot') {
        // Blend toward server value (0.3 factor)
        hop.heat = hop.heat * 0.7 + event.heat * 0.3;
      } else {
        // Heat event — blend toward server value
        hop.heat = hop.heat * 0.7 + event.heat * 0.3;
      }

      // Hard-sync lock state from server
      hop.locked = event.locked;
      hop.lockEndTime = event.lockEndTime;
      hop.lastUpdateTime = Date.now();
    },
    recordSend: () => {
      const now = Date.now();
      let anyLocked = false;
      let maxLockRemaining = 0;

      // Add heat to ALL hops (user's send affects every pool in chain)
      for (const hop of hops) {
        tickHop(hop, now);

        if (hop.locked) {
          anyLocked = true;
          maxLockRemaining = Math.max(maxLockRemaining, hop.lockEndTime - now);
          continue;
        }

        hop.heat += hop.heatPerMessage;
        hop.lastUpdateTime = now;

        if (hop.heat >= LOCKOUT_THRESHOLD) {
          hop.lockEndTime = now + hop.policy.lockoutDurationMs;
          hop.locked = true;
          anyLocked = true;
          maxLockRemaining = Math.max(
            maxLockRemaining,
            hop.policy.lockoutDurationMs,
          );
        }
      }

      onUpdate(computeComposite());
      return {
        allowed: !anyLocked,
        lockRemainingMs: Math.max(0, maxLockRemaining),
      };
    },
    getCompositeState: computeComposite,
    getHopStates: () => computeComposite().hops,
  };
};

export { makeCompositeHeatEngine, formatDuration, LOCKOUT_THRESHOLD };
