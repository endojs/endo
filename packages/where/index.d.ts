/**
 * Returns the most suitable path for Endo state with this platform and
 * environment.
 * Endo uses the state directory for saved files including applications,
 * durable capabilities, and the user's pet names for them.
 * Endo also logs here, per XDG's preference to persist logs even when caches
 * are purged.
 *
 * @type {typeof import('./types.js').whereEndoState}
 */
export const whereEndoState: typeof import('./types.js').whereEndoState;
/**
 * Returns the most suitable location for storing state that ideally does not
 * persist between restarts or reboots, specifically PID files.
 *
 * @type {typeof import('./types.js').whereEndoEphemeralState}
 */
export const whereEndoEphemeralState: typeof import('./types.js').whereEndoEphemeralState;
/**
 * Returns the most suitable path for the Endo UNIX domain socket or Windows
 * named pipe.
 *
 * @type {typeof import('./types.js').whereEndoSock}
 */
export const whereEndoSock: typeof import('./types.js').whereEndoSock;
/**
 * Returns the most suitable path for Endo caches.
 *
 * @type {typeof import('./types.js').whereEndoCache}
 */
export const whereEndoCache: typeof import('./types.js').whereEndoCache;
//# sourceMappingURL=index.d.ts.map