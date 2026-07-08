// @ts-check
/// <reference types="ses"/>

import { M } from '@endo/patterns';

// #region Shape primitives

/**
 * The policy surface `inspect()` reveals to a holder of the Shell cap.
 * Deliberately a *closed* record of exactly the three fields the design's
 * `ShellPolicy` names — so the sanitized-env passlist, the baked `searchPath`,
 * and the host working directory (all host-path-bearing) can never leak through
 * `inspect()`.  `M.splitRecord` is *open* by default (its rest pattern defaults
 * to `M.any()`, admitting any extra field), so closing the record takes an
 * explicit empty rest pattern: the leftover, collected as a record, must match
 * `{}`, so any field beyond the three named ones is rejected.  With the record
 * genuinely closed the returns-guard is a real defense-in-depth net: if a future
 * `inspect()` regressed to include `cwd` / `env` / `searchPath`, the guard would
 * reject the value rather than let a host path escape.
 */
const ShellPolicyShape = M.splitRecord(
  {
    allowedCommands: M.arrayOf(M.string()),
    timeoutMs: M.number(),
    maxOutputBytes: M.number(),
  },
  undefined,
  harden({}),
);

/**
 * A complete, buffered execution result.  `exitCode` / `signal` are nullable
 * because a process may terminate by signal (code `null`) or be observed with
 * no signal (signal `null`); `truncated` flags that stdout or stderr hit the
 * policy's `maxOutputBytes` cap.
 */
const ShellResultShape = M.splitRecord({
  stdout: M.string(),
  stderr: M.string(),
  exitCode: M.or(M.number(), M.null()),
  signal: M.or(M.string(), M.null()),
  truncated: M.boolean(),
});

/** Per-call options; a per-call `timeoutMs` may only *narrow* the policy's. */
const ExecOptionsShape = M.splitRecord({}, { timeoutMs: M.number() });

// #endregion

/**
 * Runtime guard for the `Shell` exo.  `exec` takes an argv split into
 * `(command, args[])` — never a shell string — matching the design's Decision
 * 4 (argv arrays only; no shell interpolation on the guest surface).
 */
export const ShellInterface = M.interface('Shell', {
  // `callWhen` so the returns guard applies to the *resolved* value (these
  // methods are async); `M.promise(...)` takes a label, not a payload shape,
  // so it cannot constrain the resolution — `callWhen().returns(shape)` can.
  inspect: M.callWhen().returns(ShellPolicyShape),
  exec: M.callWhen(M.string(), M.arrayOf(M.string()))
    .optional(ExecOptionsShape)
    .returns(ShellResultShape),
});
