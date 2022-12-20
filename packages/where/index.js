// @ts-check

/**
 * Returns a path for local Endo application user data on Windows.
 *
 * @param {{[name: string]: string}} env
 */
const whereEndoHomeWindows = env => {
  // Favoring local app data over roaming app data since I don't expect to be
  // able to listen on one host and connect on another.
  // TODO support roaming data for shared content addressable state and
  // find a suitable mechanism for merging state that may change independently
  // on separate roaming hosts.
  if (env.LOCALAPPDATA !== undefined) {
    return `${env.LOCALAPPDATA}\\Endo`;
  }
  if (env.APPDATA !== undefined) {
    return `${env.APPDATA}\\Local\\Endo`;
  }
  if (env.USERPROFILE !== undefined) {
    return `${env.USERPROFILE}\\AppData\\Local\\Endo`;
  }
  if (env.HOMEDRIVE !== undefined && env.HOMEPATH !== undefined) {
    return `${env.HOMEDRIVE}${env.HOMEPATH}\\AppData\\Local\\Endo`;
  }
  return 'Endo';
};

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
export const whereEndoState = (platform, env) => {
  if (env.XDG_STATE_HOME !== undefined) {
    return `${env.XDG_STATE_HOME}/endo`;
  } else if (platform === 'win32') {
    return whereEndoHomeWindows(env);
  } else if (platform === 'darwin') {
    if (env.HOME !== undefined) {
      return `${env.HOME}/Library/Application Support/Endo`;
    }
  } else if (env.HOME !== undefined) {
    return `${env.HOME}/.local/state/endo`;
  }
  return 'endo/state';
};

/**
 * Returns the most suitable location for storing state that ideally does not
 * persist between restarts or reboots, specifically PID files.
 * This should be coincident with the directory containing UNIX domain sockets,
 * but is not suitable for Windows named pipes.
 *
 * @type {typeof import('./types.js').whereEndoEphemeralState}
 */
export const whereEndoEphemeralState = (platform, env) => {
  if (env.XDG_RUNTIME_DIR !== undefined) {
    return `${env.XDG_RUNTIME_DIR}/endo`;
  } else if (platform === 'win32') {
    return whereEndoHomeWindows(env);
  } else if (platform === 'darwin') {
    if (env.HOME !== undefined) {
      return `${env.HOME}/Library/Application Support/Endo`;
    }
  }
  if (env.USER !== undefined) {
    // The XDG specification says that in this case, we should fall through to
    // system specific behavior, but we are not in a position to assume which
    // system we're using, other than it is probably a variety of Linux,
    // in which case /tmp and /run might be viable base paths.
    return `/tmp/endo-${env.USER}`;
  }
  return '/tmp/endo';
};

/**
 * Returns the most suitable path for the Endo UNIX domain socket or Windows
 * named pipe.
 *
 * @type {typeof import('./types.js').whereEndoSock}
 */
export const whereEndoSock = (platform, env, protocol = 'captp0') => {
  if (platform === 'win32') {
    // Named pipes have a special place in Windows (and in our ashen hearts).
    if (env.USERNAME !== undefined) {
      return `\\\\?\\pipe\\${env.USERNAME}-Endo\\${protocol}.pipe`;
    } else {
      return `\\\\?\\pipe\\Endo\\${protocol}.pipe`;
    }
  } else if (env.XDG_RUNTIME_DIR !== undefined) {
    return `${env.XDG_RUNTIME_DIR}/endo/${protocol}.sock`;
  } else if (platform === 'darwin') {
    if (env.HOME !== undefined) {
      return `${env.HOME}/Library/Application Support/Endo/${protocol}.sock`;
    }
  } else if (env.USER !== undefined) {
    return `/tmp/endo-${env.USER}/${protocol}.sock`;
  }
  return `endo/${protocol}.sock`;
};

/**
 * Returns the most suitable path for Endo caches.
 *
 * @type {typeof import('./types.js').whereEndoCache}
 */
export const whereEndoCache = (platform, env) => {
  if (env.XDG_CACHE_HOME !== undefined) {
    return `${env.XDG_CACHE_HOME}/endo`;
  } else if (platform === 'win32') {
    return `${whereEndoHomeWindows(env)}`;
  } else if (platform === 'darwin') {
    if (env.HOME !== undefined) {
      return `${env.HOME}/Library/Caches/Endo`;
    }
  } else if (env.HOME !== undefined) {
    return `${env.HOME}/.cache/endo`;
  }
  return 'endo/cache';
};
