// Browser UI: wires SimController emissions to the SVG viz and log panels.

import { SimController } from './sim-controller.js';
import { makeViz } from './visualization.js';

const LOG_MAX_LINES = 220;

const nowStr = () => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

/**
 * @param {Document} doc
 * @returns {SimController}
 */
export function createSimulatorController(doc = document) {
  const $ = id => doc.getElementById(id);
  const svg = $('viz-svg');
  const eventLog = $('log-events');
  const sessionLog = $('log-sessions');

  const appendEventLog = (category, text, ooo = false) => {
    const line = doc.createElement('div');
    line.className = `log-line cat-${category}${ooo ? ' log-ooo' : ''}`;
    const timeEl = doc.createElement('span');
    timeEl.className = 'log-time';
    timeEl.textContent = `[${nowStr()}] `;
    const bodyEl = doc.createElement('span');
    bodyEl.className = 'log-body';
    bodyEl.textContent = text;
    line.append(timeEl, bodyEl);
    eventLog.prepend(line);
    while (eventLog.childElementCount > LOG_MAX_LINES) {
      eventLog.lastElementChild?.remove();
    }
  };

  const viz = makeViz(svg);

  return new SimController({
    emit: ev => {
      switch (ev.type) {
        case 'worldView':
          viz.render({
            designators: ev.designators,
            sessions: new Set(ev.sessions),
            active: new Set(ev.active),
            busyDesignators: new Set(ev.busyDesignators),
          });
          sessionLog.textContent = ev.sessionSummaryText;
          break;
        case 'log':
          appendEventLog(ev.category, ev.text, ev.ooo);
          break;
        case 'logClear':
          eventLog.replaceChildren();
          sessionLog.textContent = '';
          break;
        case 'vizClearFlights':
          viz.clearFlights();
          break;
        case 'vizPulse':
          viz.pulse(ev.from, ev.peer, ev.flightMs, ev.pulseClass, ev.labelText);
          break;
        default:
          break;
      }
    },
  });
}

/**
 * Binds form controls to the controller and auto-starts the simulation.
 * @param {SimController} controller
 * @param {Document} [doc]
 */
export function wireSimulatorControls(controller, doc = document) {
  const $ = id => doc.getElementById(id);

  const numericInput = (id, fallback) => {
    const el = $(id);
    const v = parseInt(el.value, 10);
    return Number.isFinite(v) ? v : fallback;
  };

  const readEnableFlush = () => $('control-enable-flush').checked;

  const readChainUniqueInPath = () => $('control-chain-unique-in-path').checked;

  const runRestart = () =>
    controller.restart({
      clientCount: Math.min(
        12,
        Math.max(2, numericInput('control-client-count', 8)),
      ),
      latencyMs: Math.min(
        2000,
        Math.max(0, numericInput('control-latency', 500)),
      ),
      enableFlush: readEnableFlush(),
      chainLength: Math.min(
        20,
        Math.max(1, numericInput('control-chain-length', 4)),
      ),
      chainUniqueInPath: readChainUniqueInPath(),
    });

  $('control-restart').addEventListener('click', () => {
    runRestart().catch(err => console.error(err));
  });

  const bindVizToggle = (checkboxId, category) => {
    const el = $(checkboxId);
    el.addEventListener('change', () => {
      controller.setGraphMessageFilter(category, el.checked);
    });
  };

  bindVizToggle('toggle-viz-forward', 'forward');
  bindVizToggle('toggle-viz-noop', 'noop');
  bindVizToggle('toggle-viz-flush', 'flush');
  bindVizToggle('toggle-viz-handoff', 'handoff');
  bindVizToggle('toggle-viz-handshake', 'handshake');
  bindVizToggle('toggle-viz-abort', 'abort');

  runRestart().catch(err => console.error(err));
}
