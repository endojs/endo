// @ts-check

/**
 * The `EndoWorkerFacetForDaemon` interface guard, in a module of its
 * own.
 *
 * Both worker implementations must guard their facet with the *same*
 * pattern, but they cannot share a module that reaches Node-only
 * code:
 *
 *   - `./worker.js` (the Node worker) reads it from `./interfaces.js`,
 *     which imports `@endo/platform/fs/lite`.
 *   - `./bus-worker-xs.js` (the XS worker) is bundled for XS by
 *     `../scripts/bundle-bus-worker-xs.mjs`, and must not drag
 *     `@endo/platform`'s Node-only paths into that bundle.
 *
 * Hoisting the guard here gives both a single definition to import.
 * The XS bundle pays only for `@endo/patterns`, which it already
 * retains.  `./interfaces.js` re-exports this binding, so existing
 * importers are unaffected.
 *
 * Before this module existed the XS worker carried a hand-copy of the
 * guard, which could drift from the Node worker's silently.
 */

import { M } from '@endo/patterns';

// Formula identifiers are strings.
const IdShape = M.string();

// Environment records are string-to-string.
const EnvShape = M.recordOf(M.string(), M.string());

export const WorkerFacetForDaemonInterface = M.interface(
  'EndoWorkerFacetForDaemon',
  {
    terminate: M.call().returns(M.promise()),
    evaluate: M.call(
      M.string(),
      M.arrayOf(M.string()),
      M.arrayOf(M.any()),
      IdShape,
      M.promise(),
    ).returns(M.promise()),
    // Args: (readableP, powersP, contextP, env) — readable is a ZIP
    // archive of a compartment-map plus source-form modules.  These
    // methods receive promises that get resolved inside the worker.
    makeArchive: M.call(M.any(), M.any(), M.any(), EnvShape).returns(
      M.promise(),
    ),
    // Args: (treeP, powersP, contextP, env) — tree is a ReadableTree
    // or Mount whose layout mirrors a compartment-mapper archive
    // (compartment-map.json at root plus modules at their referenced
    // paths).
    makeFromTree: M.call(M.any(), M.any(), M.any(), EnvShape).returns(
      M.promise(),
    ),
    // Args: (specifier, powersP, contextP, env)
    makeUnconfined: M.call(M.string(), M.any(), M.any(), EnvShape).returns(
      M.promise(),
    ),
  },
);
