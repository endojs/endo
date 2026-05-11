// @ts-check

/// <reference types="ses" />

/**
 * @file Debugger exo — a CapTP-remotable wrapper around DebugSession.
 *
 * A Debugger exo adapts the local DebugSession (which speaks the
 * xsbug XML protocol over the envelope bus) into a hardened remotable
 * object whose methods can be invoked via `E()` from any CapTP peer.
 *
 * The exo is intentionally thin: each method delegates to the
 * underlying session, and return values (frames, locals, break
 * events) are already hardened plain-data records that survive
 * CapTP serialisation without extra marshalling.
 */

/** @import { DebugSession, BreakEvent, Frame, Property } from './types.js' */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

// ---------------------------------------------------------------------------
// Interface guard
// ---------------------------------------------------------------------------

const BreakEventShape = M.splitRecord({
  path: M.string(),
  line: M.number(),
  message: M.string(),
});

export const DebuggerInterface = M.interface('EndoDebugger', {
  help: M.call().returns(M.string()),
  go: M.call().returns(M.undefined()),
  step: M.call().returns(M.promise()),
  stepIn: M.call().returns(M.promise()),
  stepOut: M.call().returns(M.promise()),
  abort: M.call().returns(M.undefined()),
  setBreakpoint: M.call(M.string(), M.number()).returns(M.undefined()),
  clearBreakpoint: M.call(M.string(), M.number()).returns(M.undefined()),
  clearAllBreakpoints: M.call().returns(M.undefined()),
  getFrames: M.call().returns(M.promise()),
  getLocals: M.call().returns(M.promise()),
  getGlobals: M.call().returns(M.promise()),
  selectFrame: M.call(M.string()).returns(M.promise()),
  toggleProperty: M.call(M.string()).returns(M.promise()),
  evaluate: M.call(M.string()).returns(M.promise()),
  setExceptionBreakMode: M.call(M.or(M.scalar(), M.string())).returns(
    M.undefined(),
  ),
  isBroken: M.call().returns(M.boolean()),
  getTitle: M.call().returns(M.opt(M.string())),
  getTag: M.call().returns(M.opt(M.string())),
  getLastBreak: M.call().returns(M.or(BreakEventShape, M.null())),
});
harden(DebuggerInterface);

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Debugger exo wrapping a DebugSession.
 *
 * @param {DebugSession} session
 * @returns {import('@endo/exo').Guarded<{
 *   help(): string,
 *   go(): void,
 *   step(): Promise<BreakEvent>,
 *   stepIn(): Promise<BreakEvent>,
 *   stepOut(): Promise<BreakEvent>,
 *   abort(): void,
 *   setBreakpoint(path: string, line: number): void,
 *   clearBreakpoint(path: string, line: number): void,
 *   clearAllBreakpoints(): void,
 *   getFrames(): Promise<Frame[]>,
 *   getLocals(): Promise<Property[]>,
 *   getGlobals(): Promise<Property[]>,
 *   selectFrame(id: string): Promise<Property[]>,
 *   toggleProperty(id: string): Promise<Property[]>,
 *   evaluate(source: string): Promise<string>,
 *   setExceptionBreakMode(mode: 'none' | 'all' | 'uncaught'): void,
 *   isBroken(): boolean,
 *   getTitle(): string | undefined,
 *   getTag(): string | undefined,
 *   getLastBreak(): BreakEvent | null,
 * }>}
 */
export const makeDebugger = session => {
  return makeExo('EndoDebugger', DebuggerInterface, {
    help() {
      return session.help();
    },
    go() {
      session.go();
    },
    step() {
      return session.step();
    },
    stepIn() {
      return session.stepIn();
    },
    stepOut() {
      return session.stepOut();
    },
    abort() {
      session.abort();
    },
    setBreakpoint(path, line) {
      session.setBreakpoint(path, line);
    },
    clearBreakpoint(path, line) {
      session.clearBreakpoint(path, line);
    },
    clearAllBreakpoints() {
      session.clearAllBreakpoints();
    },
    getFrames() {
      return session.getFrames();
    },
    getLocals() {
      return session.getLocals();
    },
    getGlobals() {
      return session.getGlobals();
    },
    selectFrame(id) {
      return session.selectFrame(id);
    },
    toggleProperty(id) {
      return session.toggleProperty(id);
    },
    evaluate(source) {
      return session.evaluate(source);
    },
    setExceptionBreakMode(mode) {
      session.setExceptionBreakMode(
        /** @type {'none' | 'all' | 'uncaught'} */ (mode),
      );
    },
    isBroken() {
      return session.isBroken();
    },
    getTitle() {
      return session.getTitle();
    },
    getTag() {
      return session.getTag();
    },
    getLastBreak() {
      return session.getLastBreak();
    },
  });
};
harden(makeDebugger);
