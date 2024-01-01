/* global globalThis */
globalThis.LOCKDOWN_OPTIONS = JSON.stringify({
  overrideTaming: 'moderate',
})

/* global process */
globalThis.process = {
  // version is less than 10.12.0 for fs.mkdir recursive polyfill
  version: '0.0.0',
  env: {},
  cwd: () => '/',
  // ignore handlers
  on: (event, handler) => {
    console.warn(`something attempted to set event "${event}" on process`, handler)
  },
  once: (event, handler) => {
    console.warn(`something attempted to set event "${event}" on process`, handler)
  },
};