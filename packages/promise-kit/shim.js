import { memoRace } from './src/memo-race.js';

// Unconditionally replace with a non-leaking version
Promise.race = memoRace;
