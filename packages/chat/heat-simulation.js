// @ts-check

import harden from '@endo/harden';
import {
  runSimulation,
  deriveConstants,
  interpolateHeatColor,
  LOCKOUT_THRESHOLD,
  formatDuration,
} from './heat-engine.js';

/**
 * @typedef {import('./heat-engine.js').HeatConfig} HeatConfig
 */

/**
 * @typedef {object} HeatSimulationAPI
 * @property {(p: HeatConfig) => void} updateParams - Update the simulation parameters
 * @property {() => void} dispose - Remove the simulation from the DOM
 */

/**
 * @typedef {object} Scenario
 * @property {string} name
 * @property {string} label
 * @property {(params: HeatConfig) => number[]} messageTimes
 */

const CANVAS_HEIGHT = 140;
const SIM_DURATION_MS = 30000;

/** @type {Scenario[]} */
const scenarios = [
  {
    name: 'spam',
    label: 'Spam burst',
    messageTimes: params => {
      const times = [];
      // Send burstLimit + 5 messages as fast as possible (50ms apart)
      const count = params.burstLimit + 5;
      for (let i = 0; i < count; i += 1) {
        times.push(i * 50);
      }
      return times;
    },
  },
  {
    name: 'sustained-1.5x',
    label: '1.5\u00D7 sustained',
    messageTimes: params => {
      const times = [];
      const interval = (60 / (params.sustainedRate * 1.5)) * 1000;
      for (let t = 0; t < SIM_DURATION_MS; t += interval) {
        times.push(t);
      }
      return times;
    },
  },
  {
    name: 'at-limit',
    label: 'At limit',
    messageTimes: params => {
      const times = [];
      const interval = (60 / params.sustainedRate) * 1000;
      for (let t = 0; t < SIM_DURATION_MS; t += interval) {
        times.push(t);
      }
      return times;
    },
  },
  {
    name: 'casual',
    label: 'Casual',
    messageTimes: () => {
      // A few messages spread casually
      return [0, 2000, 5000, 8000, 15000, 20000, 25000];
    },
  },
];
harden(scenarios);

/**
 * Create a heat simulation chart component for the admin panel.
 *
 * @param {HTMLElement} $container - Container element
 * @param {HeatConfig} initialParams - Initial heat config
 * @returns {HeatSimulationAPI}
 */
export const createHeatSimulation = ($container, initialParams) => {
  let currentParams = initialParams;
  let activeScenario = scenarios[0];

  const $wrapper = document.createElement('div');
  $wrapper.className = 'heat-sim-wrapper';

  const $canvas = document.createElement('canvas');
  $canvas.className = 'heat-sim-canvas';
  $canvas.height = CANVAS_HEIGHT;
  $wrapper.appendChild($canvas);

  const $picker = document.createElement('div');
  $picker.className = 'heat-scenario-picker';
  $wrapper.appendChild($picker);

  const $summary = document.createElement('div');
  $summary.className = 'heat-summary';
  $wrapper.appendChild($summary);

  $container.appendChild($wrapper);

  const renderPicker = () => {
    $picker.innerHTML = '';
    for (const scenario of scenarios) {
      const $btn = document.createElement('button');
      $btn.type = 'button';
      $btn.className = `heat-scenario-btn${scenario === activeScenario ? ' active' : ''}`;
      $btn.textContent = scenario.label;
      $btn.addEventListener('click', () => {
        activeScenario = scenario;
        renderPicker();
        drawChart();
      });
      $picker.appendChild($btn);
    }
  };

  const drawChart = () => {
    const width = $wrapper.clientWidth || 400;
    $canvas.width = width;

    const ctx = $canvas.getContext('2d');
    if (!ctx) return;

    // Read theme colors from CSS custom properties
    const styles = getComputedStyle(document.documentElement);
    const bgColor =
      styles.getPropertyValue('--bg-secondary').trim() || '#f8f9fa';
    const dangerColor = styles.getPropertyValue('--danger').trim() || '#e03131';

    const messageTimes = activeScenario.messageTimes(currentParams);
    const points = runSimulation(currentParams, messageTimes, SIM_DURATION_MS);

    // Clear
    ctx.clearRect(0, 0, width, CANVAS_HEIGHT);

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, CANVAS_HEIGHT);

    // Lockout threshold dashed line
    const thresholdY =
      CANVAS_HEIGHT - (LOCKOUT_THRESHOLD / 100) * CANVAS_HEIGHT;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = dangerColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, thresholdY);
    ctx.lineTo(width, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw lockout shading (danger color with low opacity)
    for (const point of points) {
      if (point.locked) {
        const x = (point.t / SIM_DURATION_MS) * width;
        const stepWidth = Math.max(1, (50 / SIM_DURATION_MS) * width);
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = dangerColor;
        ctx.fillRect(x, 0, stepWidth, CANVAS_HEIGHT);
        ctx.globalAlpha = 1.0;
      }
    }

    // Draw heat line
    ctx.beginPath();
    ctx.lineWidth = 2;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const x = (point.t / SIM_DURATION_MS) * width;
      const y =
        CANVAS_HEIGHT - (Math.min(100, point.heat) / 100) * CANVAS_HEIGHT;

      ctx.strokeStyle = interpolateHeatColor(point.heat);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }

    // Summary text
    const { heatPerMessage, coolRate } = deriveConstants(currentParams);
    const lockoutCount = points.filter(
      (p, i) => p.locked && (i === 0 || !points[i - 1].locked),
    ).length;
    $summary.textContent =
      `Heat/msg: ${heatPerMessage.toFixed(1)} | ` +
      `Cool rate: ${coolRate.toFixed(2)}/s | ` +
      `Lockouts: ${lockoutCount} | ` +
      `Lockout: ${formatDuration(currentParams.lockoutDurationMs)}`;
  };

  renderPicker();
  // Use requestAnimationFrame to ensure canvas is laid out before drawing
  requestAnimationFrame(() => drawChart());

  // Redraw when the color scheme changes
  const onThemeChange = () => drawChart();
  document.addEventListener('endo-theme-change', onThemeChange);

  return {
    updateParams: p => {
      currentParams = p;
      drawChart();
    },
    dispose: () => {
      document.removeEventListener('endo-theme-change', onThemeChange);
      $wrapper.remove();
    },
  };
};
harden(createHeatSimulation);
