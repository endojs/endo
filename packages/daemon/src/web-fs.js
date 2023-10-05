// @ts-check
// modified from https://www.npmjs.com/package/localstorage-fs

import pathutil from 'path';
import { Buffer } from 'buffer';

const mountpoint = 'file';
let mounted = false;

const processCwd = '/';
const processUmask = 0o22;

const constants = {
  UV_FS_SYMLINK_DIR: 1,
  UV_FS_SYMLINK_JUNCTION: 2,
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  UV_DIRENT_UNKNOWN: 0,
  UV_DIRENT_FILE: 1,
  UV_DIRENT_DIR: 2,
  UV_DIRENT_LINK: 3,
  UV_DIRENT_FIFO: 4,
  UV_DIRENT_SOCKET: 5,
  UV_DIRENT_CHAR: 6,
  UV_DIRENT_BLOCK: 7,
  S_IFMT: 61440,
  S_IFREG: 32768,
  S_IFDIR: 16384,
  S_IFCHR: 8192,
  S_IFBLK: 24576,
  S_IFIFO: 4096,
  S_IFLNK: 40960,
  S_IFSOCK: 49152,
  O_CREAT: 64,
  O_EXCL: 128,
  UV_FS_O_FILEMAP: 0,
  O_NOCTTY: 256,
  O_TRUNC: 512,
  O_APPEND: 1024,
  O_DIRECTORY: 65536,
  O_NOATIME: 262144,
  O_NOFOLLOW: 131072,
  O_SYNC: 1052672,
  O_DSYNC: 4096,
  O_DIRECT: 16384,
  O_NONBLOCK: 2048,
  S_IRWXU: 448,
  S_IRUSR: 256,
  S_IWUSR: 128,
  S_IXUSR: 64,
  S_IRWXG: 56,
  S_IRGRP: 32,
  S_IWGRP: 16,
  S_IXGRP: 8,
  S_IRWXO: 7,
  S_IROTH: 4,
  S_IWOTH: 2,
  S_IXOTH: 1,
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
  UV_FS_COPYFILE_EXCL: 1,
  COPYFILE_EXCL: 1,
  UV_FS_COPYFILE_FICLONE: 2,
  COPYFILE_FICLONE: 2,
  UV_FS_COPYFILE_FICLONE_FORCE: 4,
  COPYFILE_FICLONE_FORCE: 4,
}

const permissionsMask = constants.S_IRWXU
                    | constants.S_IRWXG
                    | constants.S_IRWXO;

function Stats() {
  this.mode = 0;
  if (!(this instanceof Stats))
    return new Stats;
}

Stats.prototype._checkModeProperty = function(property) {
  return ((this.mode & constants.S_IFMT) === property);
};

Stats.prototype.isDirectory = function() {
  return this._checkModeProperty(constants.S_IFDIR);
};

Stats.prototype.isFile = function() {
  return this._checkModeProperty(constants.S_IFREG);
};

Stats.prototype.isBlockDevice = function() {
  return this._checkModeProperty(constants.S_IFBLK);
};

Stats.prototype.isCharacterDevice = function() {
  return this._checkModeProperty(constants.S_IFCHR);
};

Stats.prototype.isSymbolicLink = function() {
  return this._checkModeProperty(constants.S_IFLNK);
};

Stats.prototype.isFIFO = function() {
  return this._checkModeProperty(constants.S_IFIFO);
};

Stats.prototype.isSocket = function() {
  return this._checkModeProperty(constants.S_IFSOCK);
};

function error(code, message) {
  message = `${code  }, ${  message}`;
  const err = new Error(message);
  // @ts-ignore
  err.code = code;
  throw err;
}

function normalizePath(path) {
  if (typeof path !== 'string') throw new TypeError('path must be a string');
  if (!path) error('ENOENT', "no such file or directory ''");
  if (!mounted) mount();
  if (path.match(/^\//)) {
    return pathutil.normalize(path);
  }
  else {
    return pathutil.normalize(`${processCwd  }/${  path}`);
  }
}

function modeNum(mode) {
  if (typeof mode !== 'number') {
    if (typeof mode === 'string') {
      mode = parseInt(mode, 8);
    }
    else {
      error('EPERM', `${mode  } is not a valid permission mode`);
    }
  }
  return mode & permissionsMask;
}

function mount() {
  if (localStorage.getItem(`${mountpoint  }:///`) === null) {
    const mode = 0o777 & ~processUmask;
    localStorage.setItem(`${mountpoint  }-meta:///`, JSON.stringify({ mode: mode | constants.S_IFDIR }));
    localStorage.setItem(`${mountpoint  }:///`, '');
  }
  mounted = true;
}

const stat = (path) => {
  path = normalizePath(path);
  let data = localStorage.getItem(`${mountpoint  }-meta://${  path}`);
  if (data === null) {
    error('ENOENT', `no such file or directory '${  path  }'`);
  }
  data = JSON.parse(data);
  
  const stats = new Stats();
  for (const key in data) {
    stats[key] = data[key];
  }
  return stats;
}

function addDirectoryListing(path) {
  const lastslash = path.lastIndexOf('/');
  const filename = path.slice(lastslash + 1);
  const dirname = path.slice(0, lastslash) || '/';
  const ls = readdir(dirname);
  let listed = false;
  for (let i=0; i<ls.length; i++) {
    const file = ls[i];
    if (file === filename) {
      listed = true;
      break;
    }
  }
  if (!listed) {
    ls.push(filename);
    localStorage.setItem(`${mountpoint  }://${  dirname}`, ls.join('\n'));
  }
}

function openFile(path, stats, options, write) {
  const flag = options.flag;
  switch (flag) {
    
    // file must exist
    case 'r':
    case 'r+':
    case 'rs':
    case 'rs+':
      if (!stats) {
        error('ENOENT', `no such file or directory '${  path  }'`);
      }
      break;
    
    // file must not exist
    case 'wx':
    case 'wx+':
    case 'ax':
    case 'ax+':
      if (stats) {
        error('EEXIST', `file already exists '${  path  }'`);
      }
      break;
    
    // move along
    case 'w':
    case 'w+':
    case 'a':
    case 'a+':
      break;
    
    default:
      throw new TypeError('Unknown flag');
  }
  
  if (write) {
    if (flag.match(/^r/) &&
        flag.match(/[^\+]$/)) {
      error('EBADF', 'bad file descriptor');
    }
  }
  else if (flag.match(/^[w|a]/) &&
        flag.match(/[^\+]$/)) {
      error('EBADF', 'bad file descriptor');
    }
  
  if (!stats) {
    const mode = options.mode & ~processUmask;
    stats = { mode: mode | constants.S_IFREG };
    localStorage.setItem(`${mountpoint  }://${  path}`, '');
    localStorage.setItem(`${mountpoint  }-meta://${  path}`, JSON.stringify(stats));
  }
}

const exists = (path) => {
  path = normalizePath(path);
  return localStorage.getItem(`${mountpoint  }://${  path}`) !== null;
}

const readFile = async (path, options) => {
  path = normalizePath(path);
  try {
    var stats = stat(path);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  if (stats && stats.isDirectory()) {
    error('EISDIR', `illegal operation on a directory '${  path  }'`);
  }
  
  options = options || {};
  if (typeof options === 'string') {
    options = { encoding: options };
  }
  if (typeof options !== 'object') {
    throw new TypeError('Bad arguments');
  }
  const opts = {};
  for (const k in options) opts[k] = options[k];
  opts.flag = opts.flag || 'r';
  opts.mode = opts.mode === undefined ? 0o666
                                      : opts.mode;
  
  openFile(path, stats, opts);
  
  const buf = Buffer.from(localStorage.getItem(`${mountpoint  }://${  path}`), 'base64');
  if (opts.encoding) return buf.toString(opts.encoding);
  return buf;
}

const writeFile = async (path, data, options) => {
  path = normalizePath(path);
  try {
    var stats = stat(path);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  if (stats && stats.isDirectory()) {
    error('EISDIR', `illegal operation on a directory '${  path  }'`);
  }
  
  options = options || {};
  if (typeof options === 'string') {
    options = { encoding: options };
  }
  else if (typeof options !== 'object') {
    throw new TypeError('Bad arguments');
  }
  const opts = {};
  for (const k in options) opts[k] = options[k];
  opts.flag = opts.flag || 'w';
  opts.mode = opts.mode === undefined ? 0o666
                                      : opts.mode;
  
  openFile(path, stats, opts, true);
  
  if (!Buffer.isBuffer(data)) data = Buffer.from(data, opts.encoding);
  if (stats && opts.flag.match(/^a/)) {
    const prepend = Buffer.from(localStorage.getItem(`${mountpoint  }://${  path}`), 'base64');
    data = Buffer.concat([ prepend, data ]);
  }
  localStorage.setItem(`${mountpoint  }://${  path}`, data.toString('base64'));
  
  addDirectoryListing(path);
}
const readdir = (path) => {
  path = normalizePath(path);
  const stats = stat(path);
  if (!stats.isDirectory()) {
    error('ENOTDIR', `not a directory '${  path  }'`);
  }
  
  const ls = localStorage.getItem(`${mountpoint  }://${  path}`);
  if (ls) return ls.split('\n');
  return [];
}

const mkdir = (path, options = {}) => {
  path = normalizePath(path);
  if (localStorage.getItem(`${mountpoint  }://${  path}`) !== null) {
    if (!options.recursive) {
      error('EEXIST', `file already exists '${  path  }'`);
    }
  }
  
  let stats
  try {
    stats = stat(pathutil.dirname(path));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    if (options.recursive) {
      mkdir(pathutil.dirname(path), options);
      stats = stat(pathutil.dirname(path));
    }
  }
  if (!stats.isDirectory()) {
    error('ENOTDIR', `not a directory '${  path  }'`);
  }
  
  let mode = options.mode === undefined ? 0o777 : modeNum(options.mode);
  mode &= ~processUmask;
  stats = { mode: mode | constants.S_IFDIR };
  localStorage.setItem(`${mountpoint  }-meta://${  path}`, JSON.stringify(stats));
  
  localStorage.setItem(`${mountpoint  }://${  path}`, '');
  
  addDirectoryListing(path);
}

const rm = (path) => {
  path = normalizePath(path);
  const stats = stat(path);
  if (stats.isDirectory()) {
    error('EPERM', `operation not permitted '${  path  }'`);
  }
  
  localStorage.removeItem(`${mountpoint  }://${  path}`);
  localStorage.removeItem(`${mountpoint  }-meta://${  path}`);
  
  let ls = localStorage.getItem(`${mountpoint  }://${  pathutil.dirname(path)}`);
  if (ls) {
    ls = ls.split('\n');
    const index = ls.indexOf(pathutil.basename(path));
    if (index !== -1) {
      ls.splice(index, 1);
      localStorage.setItem(`${mountpoint  }://${  pathutil.dirname(path)}`, ls.join('\n'));
    }
  }
}

const rename = (oldPath, newPath) => {
  oldPath = normalizePath(oldPath);
  newPath = normalizePath(newPath);
  
  const oldStats = stat(oldPath);
  if (exists(newPath)) {
    const newStats = stat(newPath);
    if (oldStats.isDirectory()) {
      if (!newStats.isDirectory()) {
        error('ENOTDIR', `not a directory '${  newPath  }'`);
      }
    }
    else if (newStats.isDirectory()) {
        error('EISDIR', `illegal operation on a directory '${  newPath  }'`);
      }
  }
  
  const oldData = localStorage.getItem(`${mountpoint  }://${  oldPath}`);
  localStorage.setItem(`${mountpoint  }://${  oldPath}`, oldData);
  localStorage.removeItem(`${mountpoint  }://${  oldPath}`);
  
  const oldMeta = localStorage.getItem(`${mountpoint  }-meta://${  oldPath}`);
  localStorage.setItem(`${mountpoint  }-meta://${  oldPath}`, oldMeta);
  localStorage.removeItem(`${mountpoint  }-meta://${  oldPath}`);
};

const createReadStream = (path, options) => {
  let done = false;
  const dataP = readFile(path, options);
  const asyncIterator = {
    next () {
      return dataP.then(data => {
        const result = { value: data, done };
        done = true;
        return result;
      });
    },
    return () {
      done = true;
    },
    throw (error) {
      done = true;
      throw error;
    },
    [Symbol.asyncIterator]() {
      return asyncIterator;
    },
  }
}

const createWriteStream = (path, options) => {
  let data = Buffer.alloc(0);
  const asyncIterator = {
    next (chunk) {
      if (chunk) {
        data = Buffer.concat([data, chunk]);
      }
      return Promise.resolve({ value: undefined, done: false });
    },
    return () {
      return writeFile(path, data, options);
    },
    throw (error) {
      throw error;
    },
    [Symbol.asyncIterator]() {
      return asyncIterator;
    },
  }
}

export const fs = {
  createReadStream,
  createWriteStream,
  promises: {
    readFile: async (...args) => readFile(...args),
    writeFile: async (...args) => writeFile(...args),
    readdir: async (...args) => readdir(...args),
    mkdir: async (...args) => mkdir(...args),
    rm: async (...args) => rm(...args),
    rename: async (...args) => rename(...args),
  },
}
