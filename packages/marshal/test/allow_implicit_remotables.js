// @ts-check

// This one is designed to be imported this early
import { setEnvironmentOption } from '../src/helpers/environment-options.js';

// Import this module early, so it initializes before any module whose
// initialization reads this option.

setEnvironmentOption('ALLOW_IMPLICIT_REMOTABLES', 'true');
