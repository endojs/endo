// Thin entry: bootstrap, then hand off to the DOM UI module.

import '@endo/init/debug.js';

import {
  createSimulatorController,
  wireSimulatorControls,
} from './sim-ui-dom.js';

const controller = createSimulatorController(document);
wireSimulatorControls(controller, document);
