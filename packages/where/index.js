// @ts-check

/* Infers the rendezvous path for the endo.sock file and apps from the platform
 * and environment.
 */

const { raw } = String;

/**
 * @param {{[name: string]: string}} env
 */
const whereEndoWindows = env => {
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
  return '.';
};

/**
 * @type {typeof import('./types.js').whereEndo}
 */
export const whereEndo = (platform, env) => {
  if (platform === 'win32') {
    return whereEndoWindows(env);
  } else if (platform === 'darwin') {
    if (env.HOME !== undefined) {
      return `${env.HOME}/Library/Application Support/Endo`;
    }
  } else {
    if (env.XDG_CONFIG_DIR !== undefined) {
      return `${env.XDG_CONFIG_DIR}/endo`;
    }
    if (env.HOME !== undefined) {
      return `${env.HOME}/.config/endo`;
    }
  }
  return 'endo';
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
  } else if (platform === 'darwin') {
    if (env.HOME !== undefined) {
      return `${env.HOME}/Library/Application Support/Endo/endo.sock`;
    }
  } else if (env.XDG_RUNTIME_DIR !== undefined) {
    return `${env.XDG_RUNTIME_DIR}/endo/endo.sock`;
  } else if (env.USER !== undefined) {
    return `/tmp/endo-${env.USER}/endo.sock`;
  }
  return 'endo.sock';
};

/**
 * @type {typeof import('./types.js').whereEndoLog}
 */
export const whereEndoLog = (platform, env) => {
  if (platform === 'win32') {
    return `${whereEndoWindows(env)}\\endo.log`;
  } else if (platform === 'darwin') {
    if (env.HOME !== undefined) {
      return `${env.HOME}/Library/Caches/Endo/endo.log`;
    }
  } else if (env.XDG_CACHE_HOME !== undefined) {
    return `${env.XDG_CACHE_HOME}/endo/endo.log`;
  } else if (env.HOME !== undefined) {
    return `${env.HOME}/.cache/endo/endo.log`;
  }
  return 'endo.log';
};
