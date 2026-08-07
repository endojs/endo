// @ts-check

/**
 * Returns a path for local Endo application user data on Windows.
 *
 * @param {{[name: string]: string | undefined}} env
 * @param {{home: string}} info
 */
const whereHomeWindows = (env, info) => {
  // Favoring local app data over roaming app data since I don't expect to be
  // able to listen on one host and connect on another.
  // TODO support roaming data for shared content addressable state and
  // find a suitable mechanism for merging state that may change independently
  // on separate roaming hosts.
  if (env.LOCALAPPDATA !== undefined) {
    return `${env.LOCALAPPDATA}`;
  }
  if (env.APPDATA !== undefined) {
    return `${env.APPDATA}\\Local`;
  }
  if (env.USERPROFILE !== undefined) {
    return `${env.USERPROFILE}\\AppData\\Local`;
  }
  if (env.HOMEDRIVE !== undefined && env.HOMEPATH !== undefined) {
    return `${env.HOMEDRIVE}${env.HOMEPATH}\\AppData\\Local`;
  }
  return `${info.home}\\AppData\\Local`;
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
export const whereEndoState = (platform, env, info) => {
  if (env.ENDO_STATE !== undefined) {
    return env.ENDO_STATE;
  } else if (env.XDG_STATE_HOME !== undefined) {
    return `${env.XDG_STATE_HOME}/endo`;
  } else if (platform === 'win32') {
    return `${whereHomeWindows(env, info)}\\Endo`;
  }
  const home = env.HOME !== undefined ? env.HOME : info.home;
  if (platform === 'darwin') {
    if (home !== undefined) {
      return `${home}/Library/Application Support/Endo`;
    }
  }
  return `${home}/.local/state/endo`;
};

/**
 * Returns the most suitable location for storing state that ideally does not
 * persist between restarts or reboots, specifically PID files.
 *
 * @type {typeof import('./types.js').whereEndoEphemeralState}
 */
export const whereEndoEphemeralState = (platform, env, info) => {
  if (env.ENDO_TEMP_STATE !== undefined) {
    return env.ENDO_TEMP_STATE;
  } else if (env.XDG_RUNTIME_DIR !== undefined) {
    return `${env.XDG_RUNTIME_DIR}/endo`;
  } else if (platform === 'win32') {
    return `${whereHomeWindows(env, info)}\\Temp\\Endo`;
  }
  const temp = env.TMPDIR !== undefined ? env.TMPDIR : info.temp;
  const user = env.USER !== undefined ? env.USER : info.user;
  return `${temp}/endo-${user}`;
};

/**
 * Returns the most suitable path for the Endo UNIX domain socket or Windows
 * named pipe.
 *
 * @type {typeof import('./types.js').whereEndoSock}
 */
export const whereEndoSock = (platform, env, info, protocol = 'captp0') => {
  // It must be possible to override the socket or named pipe location, but we
  // cannot use XDG_RUNTIME_DIR for Windows named pipes, so for this case, we
  // invent our own environment variable.
  if (env.ENDO_SOCK !== undefined) {
    return env.ENDO_SOCK;
  } else if (platform === 'win32') {
    // Named pipes have a special place in Windows (and in our ashen hearts).
    const user = env.USERNAME !== undefined ? env.USERNAME : info.user;
    return `\\\\?\\pipe\\${user}-Endo\\${protocol}.pipe`;
  } else if (env.XDG_RUNTIME_DIR !== undefined) {
    return `${env.XDG_RUNTIME_DIR}/endo/${protocol}.sock`;
  } else if (platform === 'darwin') {
    const home = env.HOME !== undefined ? env.HOME : info.home;
    return `${home}/Library/Application Support/Endo/${protocol}.sock`;
  }
  const user = env.USER !== undefined ? env.USER : info.user;
  const temp = env.TMPDIR !== undefined ? env.TMPDIR : info.temp;
  return `${temp}/endo-${user}/${protocol}.sock`;
};

/**
 * Returns the most suitable path for Endo caches.
 *
 * @type {typeof import('./types.js').whereEndoCache}
 */
export const whereEndoCache = (platform, env, info) => {
  if (env.ENDO_CACHE !== undefined) {
    return env.ENDO_CACHE;
  } else if (env.XDG_CACHE_HOME !== undefined) {
    return `${env.XDG_CACHE_HOME}/endo`;
  } else if (platform === 'win32') {
    return `${whereHomeWindows(env, info)}\\Endo`;
  } else if (platform === 'darwin') {
    const home = env.HOME !== undefined ? env.HOME : info.home;
    return `${home}/Library/Caches/Endo`;
  }
  const home = env.HOME !== undefined ? env.HOME : info.home;
  return `${home}/.cache/endo`;
};
