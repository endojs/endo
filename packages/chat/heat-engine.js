// @ts-check

/**
 * @typedef {object} HeatConfig
 * @property {number} burstLimit - Max messages in a burst (3–30)
 * @property {number} sustainedRate - Messages per minute sustained (1–60)
 * @property {number} lockoutDurationMs - Lockout duration in ms (2000–259200000)
 * @property {number} postLockoutPct - Heat percentage after lockout ends (0–100)
 */

/**
 * @typedef {object} HeatConstants
 * @property {number} heatPerMessage - Heat added per message
 * @property {number} coolRate - Heat units cooled per second
 */

/**
 * @typedef {object} HeatState
 * @property {number} heat - Current heat level (0–100+)
 * @property {boolean} locked - Whether currently locked out
 * @property {number} lockEndTime - Epoch ms when lockout ends (0 = no lockout)
 * @property {number} lastUpdateTime - Last time heat was updated (epoch ms)
 */

/**
 * @typedef {object} AttemptSendResult
 * @property {HeatState} newState
 * @property {boolean} allowed
 * @property {number} lockRemainingMs - ms remaining in lockout (0 if not locked)
 */

/**
 * @typedef {object} SimulationPoint
 * @property {number} t - Time in ms from start
 * @property {number} heat - Heat level at this point
 * @property {boolean} locked - Whether locked at this point
 */

const LOCKOUT_THRESHOLD = 90;

/**
 * Derive heat constants from a heat config.
 *
 * @param {HeatConfig} params
 * @returns {HeatConstants}
 */
const deriveConstants = params => {
  const heatPerMessage = LOCKOUT_THRESHOLD / params.burstLimit;
  const coolRate = heatPerMessage * (params.sustainedRate / 60);
  return { heatPerMessage, coolRate };
};

/**
 * Create a fresh heat state.
 *
 * @returns {HeatState}
 */
const makeHeatState = () => ({
  heat: 0,
  locked: false,
  lockEndTime: 0,
  lastUpdateTime: 0,
});

/**
 * Apply cooling and check lockout expiry. Returns a new state.
 *
 * @param {HeatState} state
 * @param {HeatConfig} params
 * @param {number} now - Current epoch ms
 * @returns {HeatState}
 */
const tickHeat = (state, params, now) => {
  const { coolRate } = deriveConstants(params);

  // If locked, check if lockout has expired
  if (state.locked) {
    if (now >= state.lockEndTime) {
      return {
        heat: params.postLockoutPct,
        locked: false,
        lockEndTime: 0,
        lastUpdateTime: now,
      };
    }
    // Still locked — no cooling applies
    return { ...state, lastUpdateTime: now };
  }

  // Apply cooling
  const dt = state.lastUpdateTime > 0 ? (now - state.lastUpdateTime) / 1000 : 0;
  const cooled = Math.max(0, state.heat - coolRate * dt);
  return {
    heat: cooled,
    locked: false,
    lockEndTime: 0,
    lastUpdateTime: now,
  };
};

/**
 * Attempt to send a message. Returns whether it was allowed and the new state.
 *
 * @param {HeatState} state
 * @param {HeatConfig} params
 * @param {number} now
 * @returns {AttemptSendResult}
 */
const attemptSend = (state, params, now) => {
  const ticked = tickHeat(state, params, now);

  if (ticked.locked) {
    return {
      newState: ticked,
      allowed: false,
      lockRemainingMs: Math.max(0, ticked.lockEndTime - now),
    };
  }

  const { heatPerMessage } = deriveConstants(params);
  const newHeat = ticked.heat + heatPerMessage;

  if (newHeat >= LOCKOUT_THRESHOLD) {
    const lockEndTime = now + params.lockoutDurationMs;
    return {
      newState: {
        heat: LOCKOUT_THRESHOLD,
        locked: true,
        lockEndTime,
        lastUpdateTime: now,
      },
      allowed: false,
      lockRemainingMs: params.lockoutDurationMs,
    };
  }

  return {
    newState: {
      heat: newHeat,
      locked: false,
      lockEndTime: 0,
      lastUpdateTime: now,
    },
    allowed: true,
    lockRemainingMs: 0,
  };
};

/**
 * Create a live heat engine driven by requestAnimationFrame.
 *
 * @param {HeatConfig} params
 * @param {(state: HeatState) => void} onUpdate
 * @returns {{ start: () => void, stop: () => void, attemptSend: () => AttemptSendResult, updateParams: (p: HeatConfig) => void, getState: () => HeatState }}
 */
const makeLiveHeatEngine = (params, onUpdate) => {
  let currentParams = params;
  let state = makeHeatState();
  /** @type {number | null} */
  let rafId = null;

  const tick = () => {
    const now = Date.now();
    state = tickHeat(state, currentParams, now);
    onUpdate(state);
    rafId = requestAnimationFrame(tick);
  };

  return {
    start: () => {
      if (rafId !== null) return;
      state.lastUpdateTime = Date.now();
      rafId = requestAnimationFrame(tick);
    },
    stop: () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    attemptSend: () => {
      const now = Date.now();
      const result = attemptSend(state, currentParams, now);
      state = result.newState;
      onUpdate(state);
      return result;
    },
    updateParams: p => {
      currentParams = p;
    },
    getState: () => state,
  };
};

/**
 * @typedef {object} SimulationScenario
 * @property {string} name
 * @property {(durationMs: number) => number[]} messageTimes - Returns array of epoch-relative ms timestamps
 */

/**
 * Run a simulation of the heat model with a given message scenario.
 *
 * @param {HeatConfig} params
 * @param {number[]} messageTimes - Array of ms timestamps when messages are sent
 * @param {number} durationMs - Total simulation duration in ms
 * @returns {SimulationPoint[]}
 */
const runSimulation = (params, messageTimes, durationMs) => {
  const stepMs = 50;
  const sortedTimes = [...messageTimes].sort((a, b) => a - b);
  let msgIdx = 0;
  let state = makeHeatState();

  /** @type {SimulationPoint[]} */
  const points = [];

  for (let t = 0; t <= durationMs; t += stepMs) {
    // Send any messages at or before this time
    while (msgIdx < sortedTimes.length && sortedTimes[msgIdx] <= t) {
      const result = attemptSend(state, params, t);
      state = result.newState;
      msgIdx += 1;
    }

    // Tick for cooling
    state = tickHeat(state, params, t);
    points.push({ t, heat: state.heat, locked: state.locked });
  }

  return points;
};

/**
 * Interpolate a heat value (0–100) to an RGB color string.
 * Blue (cool) → amber (warm) → red (hot).
 *
 * @param {number} heat
 * @returns {string}
 */
const interpolateHeatColor = heat => {
  const clamped = Math.max(0, Math.min(100, heat));

  if (clamped < 45) {
    // Blue to amber: 0→45
    const t = clamped / 45;
    const r = Math.round(59 + t * (245 - 59));
    const g = Math.round(130 + t * (166 - 130));
    const b = Math.round(246 + t * (35 - 246));
    return `rgb(${r},${g},${b})`;
  }
  // Amber to red: 45→100
  const t = (clamped - 45) / 55;
  const r = Math.round(245 + t * (220 - 245));
  const g = Math.round(166 + t * (38 - 166));
  const b = Math.round(35 + t * (38 - 35));
  return `rgb(${r},${g},${b})`;
};

/**
 * Format a duration in ms to a human-readable string.
 *
 * @param {number} ms
 * @returns {string}
 */
const formatDuration = ms => {
  if (ms < 1000) return `${ms}ms`;

  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.floor(seconds % 60);
  if (minutes < 60) {
    return remainSeconds > 0 ? `${minutes}m ${remainSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) {
    return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`;
};

export {
  LOCKOUT_THRESHOLD,
  deriveConstants,
  makeHeatState,
  tickHeat,
  attemptSend,
  makeLiveHeatEngine,
  runSimulation,
  interpolateHeatColor,
  formatDuration,
};
