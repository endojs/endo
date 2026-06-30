/** @import {TestRoutine} from '../_types.js' */

/**
 * `endo inspect` exposes the host-only `getFormula` daemon method
 * per `designs/formula-inspector.md`. The verb accepts either a
 * pet-name path (resolved via `host.identify`) or, with
 * `--identifier`, an already-encoded formula identifier. With
 * `--json` the raw `FormulaRecord` is emitted for scripting.
 *
 * @type {TestRoutine}
 */
export const section = async (execa, testLine) => {
  // The counter-example context has already established the pet
  // name `counter` (a make-archive formula per `endo make`, which
  // calls `E(agent).makeArchive(...)` and emits a formula of
  // `type: 'make-archive'` per `packages/daemon/src/daemon.js`'s
  // `formulateArchive`). The human-readable mode prints the
  // formula type and number (64 hex chars) on the first line and
  // one row per property.
  await testLine(execa`endo inspect counter`, {
    stdout: /^make-archive {2}[0-9a-f]{64}\n/u,
  });

  // The `--json` flag emits the raw FormulaRecord. The output
  // parses as JSON and carries the canonical record shape.
  await testLine(execa`endo inspect counter --json`, {
    stdout: /"type":\s*"make-archive"/u,
  });

  // `counter`'s make-archive formula carries `archive`, `powers`,
  // and `worker` references.
  await testLine(execa`endo inspect counter --json`, {
    stdout: /"kind":\s*"reference"/u,
  });
  await testLine(execa`endo inspect counter --json`, {
    stdout: /"archive"/u,
  });
};
