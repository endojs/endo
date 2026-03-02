// @ts-check
/* global document */

import { interpolateHeatColor, formatDuration, LOCKOUT_THRESHOLD } from './heat-engine.js';

/**
 * @typedef {import('./heat-engine.js').HeatState} HeatState
 */

/**
 * @typedef {object} HeatBarAPI
 * @property {(state: HeatState) => void} update - Update the heat bar with new state
 * @property {() => void} dispose - Remove the heat bar from the DOM
 */

/**
 * Create a heat bar component that shows the current heat level above the input.
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

  const $status = document.createElement('div');
  $status.className = 'heat-bar-status';
  $status.setAttribute('aria-live', 'polite');
  $status.setAttribute('role', 'status');
  $bar.appendChild($status);

  $container.appendChild($bar);

  /** @type {boolean} */
  let wasLocked = false;

  /**
   * @param {HeatState} state
   */
  const update = state => {
    const heat = Math.min(100, state.heat);
    const pct = heat / 100;

    $fill.style.width = `${pct * 100}%`;
    $fill.style.backgroundColor = interpolateHeatColor(heat);
    $bar.setAttribute('aria-valuenow', String(Math.round(heat)));

    // Visibility: hide when heat is negligible
    $bar.style.opacity = heat < 1 ? '0' : '1';

    // Send button visual states
    if (state.locked) {
      $sendButton.classList.add('heat-locked');
      $sendButton.classList.remove('heat-glow', 'heat-jitter');

      const remaining = Math.max(0, state.lockEndTime - Date.now());
      $status.textContent = `Locked: ${formatDuration(remaining)}`;

      if (!wasLocked) {
        // Trigger shake animation on lockout start
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

  const dispose = () => {
    $bar.remove();
    $sendButton.classList.remove('heat-locked', 'heat-glow', 'heat-jitter', 'heat-shake');
  };

  return { update, dispose };
};
harden(createHeatBar);
