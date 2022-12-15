// @ts-check

/* Infers the rendezvous path for the endo.sock file and apps from the platform
 * and environment.
 */

const { raw } = String;

/**
 * @param {{[name: string]: string}} env
 */
const whereEndoHomeWindows = env => {
  // Favoring local app data over roaming app data since I don't expect to be
  // able to listen on one host and connect on another.
  if (env.LOCALAPPDATA !== undefined) {
    return `${env.LOCALAPPDATA}\\Endo`;
  }
  if (env.APPDATA !== undefined) {
    return `${env.APPDATA}\\Endo`;
  }
  if (env.USERPROFILE !== undefined) {
    return `${env.USERPROFILE}\\AppData\\Endo`;
  }
  if (env.HOMEDRIVE !== undefined && env.HOMEPATH !== undefined) {
    return `${env.HOMEDRIVE}${env.HOMEPATH}\\AppData\\Endo`;
  }
  return 'Endo';
};

/**
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
 * @type {typeof import('./types.js').whereEndoSock}
 */
export const whereEndoSock = (platform, env) => {
  if (platform === 'win32') {
    // Named pipes have a special place in Windows (and in our ashen hearts).
    if (env.USERNAME !== undefined) {
      return `\\\\?\\pipe\\${env.USERNAME}-Endo\\endo.pipe`;
    } else {
      return raw`\\?\pipe\Endo\endo.pipe`;
    }
  } else if (env.XDG_RUNTIME_DIR !== undefined) {
    return `${env.XDG_RUNTIME_DIR}/endo/endo.sock`;
  } else if (platform === 'darwin') {
    if (env.HOME !== undefined) {
      return `${env.HOME}/Library/Application Support/Endo/endo.sock`;
    }
  } else if (env.USER !== undefined) {
    return `/tmp/endo-${env.USER}/endo.sock`;
  }
  return 'endo/endo.sock';
};

/**
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
