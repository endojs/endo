// @ts-check

// Chat's local entry point for `@endo/preact-container` — the single,
// controlled rendering surface for the whole app.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ SECURITY BARRIER — read before adding a render function here.            │
// │                                                                          │
// │ ALL rendering in the chat app goes through `renderConfined`, the         │
// │ SANITIZING renderer. It treats its vnode tree as potentially untrusted:  │
// │ refs are stripped, dangerous tags/attrs removed, and event handlers      │
// │ receive a frozen `SafeEvent` facade (no real DOM nodes, no real          │
// │ `DataTransfer`). `confineComponent` guests nested anywhere inside stay   │
// │ sanitized by identity. This is the ONLY renderer this module exposes.    │
// │                                                                          │
// │ Do NOT re-export, wrap, or reach for:                                    │
// │   • Preact's own `render` — it has no SecureBoundary, so a confined      │
// │     component spliced inside it would NOT be sanitized (a silent hole),  │
// │     and `confineComponent` itself throws without the boundary.           │
// │   • `HostPassthrough` / any "trusted exit" wrapper — it hands host       │
// │     components the RAW DOM event, including the real `DataTransfer`       │
// │     whose `.files` / `.items[i].webkitGetAsEntry()` are a filesystem-    │
// │     read capability. Even though confined guests below it re-enter       │
// │     sanitization, surfacing a passthrough in app code is a confinement   │
// │     footgun: it is too easy to feed it untrusted vnodes by mistake.      │
// │                                                                          │
// │ Drag-and-drop works under confinement WITHOUT any passthrough: the       │
// │ sanitizing path gives drag handlers a narrow, string-only                │
// │ `SafeDataTransfer` (getData/setData/types/dropEffect/effectAllowed),     │
// │ which is all the app's DnD needs — and never a `File` or DOM node.       │
// └─────────────────────────────────────────────────────────────────────────┘
//
// `@endo/preact-container` requires the realm to be locked down with
// `overrideTaming: 'severe'` before any untrusted component source is
// evaluated. This module does NOT call `lockdown()` itself: the chat entry
// (main.js, via pre-lockdown.js + `@endo/init`) does so at startup, and
// `lockdown()` may only be called once.

export {
  confineComponent,
  isConfinedComponent,
} from '@endo/preact-container/compartment';

export {
  renderConfined,
  unmount,
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
