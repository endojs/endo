// @ts-check
/* global document, setTimeout */

import { interpolateHeatColor, formatDuration, LOCKOUT_THRESHOLD } from './heat-engine.js';

/**
 * @typedef {import('./heat-engine.js').HeatState} HeatState
 */

/**
 * @typedef {import('./composite-heat-engine.js').CompositeState} CompositeState
 */

/**
 * @typedef {import('./composite-heat-engine.js').PerHopView} PerHopView
 */

/**
 * @typedef {object} HeatBarAPI
 * @property {(state: HeatState | CompositeState) => void} update - Update the heat bar
 * @property {() => void} dispose - Remove the heat bar from the DOM
 */

/**
 * Desaturate a heat color for ancestor hops.
 * @param {string} rgb - e.g. "rgb(245,166,35)"
 * @returns {string}
 */
const desaturateColor = rgb => {
  const match = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return rgb;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  // Blend toward gray (reduce saturation by 40%, add transparency)
  const gray = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
  const dr = Math.round(r * 0.6 + gray * 0.4);
  const dg = Math.round(g * 0.6 + gray * 0.4);
  const db = Math.round(b * 0.6 + gray * 0.4);
  return `rgba(${dr},${dg},${db},0.7)`;
};

/**
 * Create a heat bar component that shows the current heat level above the input.
 * Supports both single-hop (legacy HeatState) and multi-hop (CompositeState) modes.
 *
 * @param {HTMLElement} $container - The container to insert the bar into
 * @param {HTMLElement} $sendButton - The send button for visual feedback
 * @returns {HeatBarAPI}
 */
export const createHeatBar = ($container, $sendButton) => {
  const $bar = document.createElement('div');
  $bar.className = 'heat-bar';
  $bar.setAttribute('role', 'progressbar');
  $bar.setAttribute('aria-valuemin', '0');
  $bar.setAttribute('aria-valuemax', '100');
  $bar.setAttribute('aria-valuenow', '0');

  const $fill = document.createElement('div');
  $fill.className = 'heat-bar-fill';
  $bar.appendChild($fill);

  const $segmentContainer = document.createElement('div');
  $segmentContainer.className = 'heat-bar-segments';
  $bar.appendChild($segmentContainer);

  const $status = document.createElement('div');
  $status.className = 'heat-bar-status';
  $status.setAttribute('aria-live', 'polite');
  $status.setAttribute('role', 'status');
  $bar.appendChild($status);

  $container.appendChild($bar);

  /** @type {boolean} */
  let wasLocked = false;

  /**
   * Check if state is a CompositeState (has hops array).
   * @param {HeatState | CompositeState} state
   * @returns {state is CompositeState}
   */
  const isComposite = state => 'hops' in state && Array.isArray(/** @type {any} */ (state).hops);

  /**
   * Update with a single-hop (legacy) HeatState.
   * @param {HeatState} state
   */
  const updateSingleHop = state => {
    const heat = Math.min(100, state.heat);
    const pct = heat / 100;

    // Hide segments, show single fill
    $segmentContainer.style.display = 'none';
    $fill.style.display = 'block';
    $fill.style.width = `${pct * 100}%`;
    $fill.style.backgroundColor = interpolateHeatColor(heat);
    $bar.setAttribute('aria-valuenow', String(Math.round(heat)));

    $bar.style.opacity = heat < 1 ? '0' : '1';

    if (state.locked) {
      $sendButton.classList.add('heat-locked');
      $sendButton.classList.remove('heat-glow', 'heat-jitter');

      const remaining = Math.max(0, state.lockEndTime - Date.now());
      $status.textContent = `Locked: ${formatDuration(remaining)}`;

      if (!wasLocked) {
        $sendButton.classList.add('heat-shake');
        setTimeout(() => $sendButton.classList.remove('heat-shake'), 500);
      }
    } else {
      $sendButton.classList.remove('heat-locked');
      $status.textContent = '';

      if (heat >= LOCKOUT_THRESHOLD * 0.8) {
        $sendButton.classList.add('heat-jitter');
        $sendButton.classList.remove('heat-glow');
      } else if (heat >= LOCKOUT_THRESHOLD * 0.5) {
        $sendButton.classList.add('heat-glow');
        $sendButton.classList.remove('heat-jitter');
      } else {
        $sendButton.classList.remove('heat-glow', 'heat-jitter');
      }
    }

    wasLocked = state.locked;
  };

  /**
   * Update with a CompositeState (multi-hop segmented bar).
   * @param {CompositeState} state
   */
  const updateComposite = state => {
    const { effectiveHeat, effectiveLocked, effectiveLockRemaining, bottleneckLabel, isSelfBottleneck, hops } = state;

    // Hide single fill, show segments
    $fill.style.display = 'none';
    $segmentContainer.style.display = 'flex';

    $bar.setAttribute('aria-valuenow', String(Math.round(effectiveHeat)));
    $bar.style.opacity = effectiveHeat < 1 ? '0' : '1';

    // Calculate total heat for proportional widths
    let totalHeat = 0;
    for (const hop of hops) {
      totalHeat += hop.normalizedHeat;
    }

    // Rebuild segments
    while ($segmentContainer.firstChild) {
      $segmentContainer.removeChild($segmentContainer.firstChild);
    }

    for (const hop of hops) {
      const $seg = document.createElement('div');
      $seg.className = `heat-bar-segment${hop.isSelf ? ' self' : ' ancestor'}`;

      // Width proportional to share of total heat (with minimum 2px)
      let widthPct = totalHeat > 0 ? (hop.normalizedHeat / totalHeat) * 100 : 100 / hops.length;
      // The segment container fills the bar width proportional to effective heat
      const color = interpolateHeatColor(hop.normalizedHeat);
      $seg.style.backgroundColor = hop.isSelf ? color : desaturateColor(color);
      $seg.style.flex = `${widthPct} 0 2px`;
      $seg.style.height = '100%';
      $seg.title = `${hop.label}: ${Math.round(hop.normalizedHeat)}%`;

      $segmentContainer.appendChild($seg);
    }

    // Overall bar width = effective heat percentage
    $segmentContainer.style.width = `${Math.min(100, effectiveHeat)}%`;

    // Send button visual states
    if (effectiveLocked) {
      $sendButton.classList.add('heat-locked');
      $sendButton.classList.remove('heat-glow', 'heat-jitter');

      const label = isSelfBottleneck ? '' : `${bottleneckLabel} `;
      $status.textContent = `${label}cooldown — ${formatDuration(effectiveLockRemaining)}`;

      if (!wasLocked) {
        $sendButton.classList.add('heat-shake');
        setTimeout(() => $sendButton.classList.remove('heat-shake'), 500);
      }
    } else {
      $sendButton.classList.remove('heat-locked');

      if (effectiveHeat < 20) {
        $status.textContent = '';
      } else if (isSelfBottleneck) {
        $status.textContent = `heat: ${Math.round(effectiveHeat)}%`;
      } else {
        $status.textContent = `${bottleneckLabel}: ${Math.round(effectiveHeat)}%`;
      }

      if (effectiveHeat >= LOCKOUT_THRESHOLD * 0.8) {
        $sendButton.classList.add('heat-jitter');
        $sendButton.classList.remove('heat-glow');
      } else if (effectiveHeat >= LOCKOUT_THRESHOLD * 0.5) {
        $sendButton.classList.add('heat-glow');
        $sendButton.classList.remove('heat-jitter');
      } else {
        $sendButton.classList.remove('heat-glow', 'heat-jitter');
      }
    }

    wasLocked = effectiveLocked;
  };

  /**
   * @param {HeatState | CompositeState} state
   */
  const update = state => {
    if (isComposite(state)) {
      updateComposite(/** @type {CompositeState} */ (state));
    } else {
      updateSingleHop(/** @type {HeatState} */ (state));
    }
  };

  const dispose = () => {
    $bar.remove();
    $sendButton.classList.remove('heat-locked', 'heat-glow', 'heat-jitter', 'heat-shake');
  };

  return { update, dispose };
};
harden(createHeatBar);
