// @ts-check

// Chat's local entry point for `@endo/preact-container` — a single import
// surface for the confine/render helpers.
//
// `@endo/preact-container` mounts *untrusted* Preact component code (e.g. a
// guest-supplied widget the host evaluated in a SES `Compartment`) inside an
// ordinary Preact tree without handing it the live DOM. It has a hard
// precondition: the realm must be locked down with `overrideTaming: 'severe'`
// before any untrusted component source is evaluated. Two reasons (see the
// package README for detail):
//
//   1. Containment integrity. Without `lockdown()`, every endowment handed to
//      confined code reaches the host realm's `Function` via `.constructor`
//      (`endowments.h.constructor('return globalThis')()`). `lockdown()` tames
//      the `Function` constructor and that escape ceases to exist.
//
//   2. `overrideTaming: 'severe'` is *required for Preact to run at all*.
//      Preact instantiates function components by assigning
//      `component.constructor = type`, which hits the SES "override mistake"
//      under 'min'/'moderate' taming. `'severe'` enables `'%ObjectPrototype%':
//      '*'`, making `constructor` overridable so the assignment succeeds.
//
// This module does NOT call `lockdown()` itself: the chat entry (main.js, via
// pre-lockdown.js + `@endo/init`) locks the realm down with severe taming at
// startup, and `lockdown()` may only be called once. A different host
// embedding these helpers is responsible for establishing the same taming
// before importing this module.

export {
  confineComponent,
  isConfinedComponent,
} from '@endo/preact-container/compartment';

export {
  renderConfined,
  unmount,
  HostPassthrough,
  h,
  Fragment,
  createElement,
} from '@endo/preact-container/renderer';

// Hooks for host-authored components. (Confined guest components receive these
// as endowments instead; trusted host components import them here.) This is
// the same hook set `@endo/preact-container/compartment` endows to guests.
export {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useReducer,
} from 'preact/hooks';
