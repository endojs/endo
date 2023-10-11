// @ts-check
// modified from https://www.npmjs.com/package/localstorage-fs

import pathutil from 'path';
import { Buffer } from 'buffer';

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

class Stats {
  constructor() {
    this.mode = 0;
  }
  _checkModeProperty(property) {
    return ((this.mode & constants.S_IFMT) === property);
  }
  isDirectory() {
    return this._checkModeProperty(constants.S_IFDIR);
  }
  isFile() {
    return this._checkModeProperty(constants.S_IFREG);
  }
  isBlockDevice() {
    return this._checkModeProperty(constants.S_IFBLK);
  }
  isCharacterDevice() {
    return this._checkModeProperty(constants.S_IFCHR);
  }
  isSymbolicLink() {
    return this._checkModeProperty(constants.S_IFLNK);
  }
  isFIFO() {
    return this._checkModeProperty(constants.S_IFIFO);
  }
  isSocket() {
    return this._checkModeProperty(constants.S_IFSOCK);
  }
}

function error(code, message) {
  message = `${code  }, ${message}`;
  const err = new Error(message);
  // @ts-ignore
  err.code = code;
  throw err;
}

/**
 * 
 * @param {{
 *  set: (key: string, value: string) => Promise<void>
 *  get: (key: string) => Promise<string>
 *  remove: (key: string) => Promise<void>
 * }} store 
 * @param {*} options
 */
export const makeKeyValueFs = (store, options = {}) => {
  const { mountpoint = 'file', processCwd = '/' } = options;
  let mounted = false;

  const processUmask = 0o22;

  const getNodeMeta = async (path) => {
    const data = await store.get(`${mountpoint}-meta://${path}`);
    if (data === undefined) {
      error('ENOENT', `no such file or directory '${path}'`);
    }
    return JSON.parse(data);
  }
  const existsNodeMeta = async (path) => {
    try {
      await getNodeMeta(path)
      return true
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }
  const setNodeMeta = async (path, data) => {
    await store.set(`${mountpoint}-meta://${path}`, JSON.stringify(data));
  }
  const removeNodeMeta = async (path) => {
    await store.remove(`${mountpoint}-meta://${path}`);
  }
  const getNodeData = async (path) => {
    const data = await store.get(`${mountpoint}://${path}`);
    if (data === undefined) {
      error('ENOENT', `no such file or directory '${path}'`);
    }
    return data;
  }
  const existsNodeData = async (path) => {
    try {
      await getNodeData(path)
      return true
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }
  const setNodeData = async (path, data) => {
    await store.set(`${mountpoint}://${path}`, data);
  }
  const removeNodeData = async (path) => {
    await store.remove(`${mountpoint}://${path}`);
  }

  async function normalizePath (path) {
    if (typeof path !== 'string') throw new TypeError('path must be a string');
    if (!path) error('ENOENT', "no such file or directory ''");
    if (!mounted) await mount();
    if (path.match(/^\//)) {
      return pathutil.normalize(path);
    }
    else {
      return pathutil.normalize(`${processCwd}/${path}`);
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

  async function mount() {
    if (!await existsNodeData('/')) {
      const mode = 0o777 & ~processUmask;
      await setNodeMeta('/', { mode: mode | constants.S_IFDIR });
      await setNodeData('/', '');
    }
    mounted = true;
  }

  const stat = async (path) => {
    path = await normalizePath(path);
    const entry = await getNodeMeta(path);
    
    const stats = new Stats();
    for (const key in entry) {
      stats[key] = entry[key];
    }
    return stats;
  }

  async function addDirectoryListing(path) {
    const lastslash = path.lastIndexOf('/');
    const filename = path.slice(lastslash + 1);
    const dirname = path.slice(0, lastslash) || '/';
    const ls = await readdir(dirname);
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
      await setNodeData(dirname, ls.join('\n'));
    }
  }

  async function openFile(path, stats, options, write) {
    const flag = options.flag;
    switch (flag) {
      
      // file must exist
      case 'r':
      case 'r+':
      case 'rs':
      case 'rs+':
        if (!stats) {
          error('ENOENT', `no such file or directory '${path}'`);
        }
        break;
      
      // file must not exist
      case 'wx':
      case 'wx+':
      case 'ax':
      case 'ax+':
        if (stats) {
          error('EEXIST', `file already exists '${path}'`);
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
      await setNodeData(path, '');
      await setNodeMeta(path, JSON.stringify(stats));
    }
  }

  const exists = async (path) => {
    path = await normalizePath(path);
    return await existsNodeMeta(path);
  }

  const readFile = async (path, options) => {
    path = await normalizePath(path);
    let stats;
    try {
      stats = await stat(path);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    if (stats && stats.isDirectory()) {
      error('EISDIR', `illegal operation on a directory '${path}'`);
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
    
    const buf = Buffer.from(await getNodeData(path), 'base64');
    if (opts.encoding) return buf.toString(opts.encoding);
    return buf;
  }

  const writeFile = async (path, data, options) => {
    path = await normalizePath(path);
    let stats;
    try {
      stats = await stat(path);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    if (stats && stats.isDirectory()) {
      error('EISDIR', `illegal operation on a directory '${path}'`);
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
      const prepend = Buffer.from(await getNodeData(path), 'base64');
      data = Buffer.concat([ prepend, data ]);
    }
    await setNodeData(path, data.toString('base64'));
    
    addDirectoryListing(path);
  }
  const readdir = async (path) => {
    path = await normalizePath(path);
    const stats = await stat(path);
    if (!stats.isDirectory()) {
      error('ENOTDIR', `not a directory '${path}'`);
    }
    
    const ls = await getNodeData(path);
    if (ls) return ls.split('\n');
    return [];
  }

  const mkdir = async (path, options = {}) => {
    path = await normalizePath(path);
    if (!await exists(path)) {
      if (options.recursive) {
        // ignore errror when recursive
      } else {
        error('EEXIST', `file already exists '${path}'`);
      }
    }
    
    let stats
    try {
      stats = await stat(pathutil.dirname(path));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      if (options.recursive) {
        await mkdir(pathutil.dirname(path), options);
        stats = await stat(pathutil.dirname(path));
      } else {
        throw err;
      }
    }
    if (!stats.isDirectory()) {
      error('ENOTDIR', `not a directory '${path}'`);
    }
    
    let mode = options.mode === undefined ? 0o777 : modeNum(options.mode);
    mode &= ~processUmask;
    stats = { mode: mode | constants.S_IFDIR };

    await setNodeMeta(path, stats);
    await setNodeData(path, '');
    
    addDirectoryListing(path);
  }

  const rm = async (path) => {
    path = await normalizePath(path);
    const stats = await stat(path);
    if (stats.isDirectory()) {
      error('EPERM', `operation not permitted '${path}'`);
    }
    
    await removeNodeData(path);
    await removeNodeMeta(path);

    // update listing in parent dir
    let data;
    try {
      data = await getNodeData(pathutil.dirname(path));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    if (!data) {
      return
    }
    const lines = data.split('\n');
    const index = lines.indexOf(pathutil.basename(path));
    if (index !== -1) {
      lines.splice(index, 1);
      await setNodeData(pathutil.dirname(path), lines.join('\n'));
    }
  }

  const rename = async (oldPath, newPath) => {
    oldPath = await normalizePath(oldPath);
    newPath = await normalizePath(newPath);
    
    const oldStats = await stat(oldPath);
    if (await exists(newPath)) {
      const newStats = await stat(newPath);
      if (oldStats.isDirectory()) {
        if (!newStats.isDirectory()) {
          error('ENOTDIR', `not a directory '${newPath}'`);
        }
      }
      else if (newStats.isDirectory()) {
          error('EISDIR', `illegal operation on a directory '${newPath}'`);
        }
    }
    
    const oldData = await getNodeData(oldPath);
    await setNodeData(newPath, oldData);
    await removeNodeData(oldPath);
    
    const oldMeta = await getNodeMeta(oldPath);
    await setNodeMeta(newPath, oldMeta);
    await removeNodeMeta(oldPath);
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
    return asyncIterator;
  }

  const fs = {
    createReadStream,
    createWriteStream,
    promises: {
      readFile,
      writeFile,
      readdir,
      mkdir,
      rm,
      rename,
    },
  }
  return { fs }
}