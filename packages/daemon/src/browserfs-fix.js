

const cb2promise =
  (obj, method) =>
  (...args) =>
    new Promise((resolve, reject) => {
      obj[method](...args, (err, ...rest) => {
        if (err) {
          reject(err);
        } else {
          // @ts-ignore
          resolve(...rest);
        }
      });
    });


// const permissionError = pth => {
// 	// This replicates the exception of `fs.mkdir` with native the
// 	// `recusive` option when run on an invalid drive under Windows.
// 	const error = new Error(`operation not permitted, mkdir '${pth}'`);
// 	error.code = 'EPERM';
// 	error.errno = -4048;
// 	error.path = pth;
// 	error.syscall = 'mkdir';
// 	return error;
// };

// const makeDirectory = async (input, options) => {
//   const fs = options.fs.promises;
//   const path = options.path;

//   const make = async pth => {
//     console.log(`makeDirectory ${pth}`);
//     // workaround for browserfs bug?
//     if (pth === '/') {
//       return pth;
//     }
//     try {
//       await fs.mkdir(pth, options.mode);

//       return pth;
//     } catch (error) {
//       // workaround for browserfs bug?
//       if (error.code === 'EEXIST') {
//         // continue normally
//         return pth;
//       }

//       if (error.code === 'EPERM') {
//         throw error;
//       }

//       if (error.code === 'ENOENT') {
//         if (path.dirname(pth) === pth) {
//           throw permissionError(pth);
//         }

//         if (error.message.includes('null bytes')) {
//           throw error;
//         }

//         await make(path.dirname(pth));

//         return make(pth);
//       }

//       // try {
//       //   const stats = await stat(pth);
//       //   if (!stats.isDirectory()) {
//       //     throw new Error('The path is not a directory');
//       //   }
//       // } catch {
//       //   throw error;
//       // }

//       return pth;
//     }
//   };

//   return make(path.resolve(input));
// };


  // shim fs
  // await new Promise(cb => configure({
  //   fs: 'IndexedDB',
  //   options: {},
  // }, cb));
  // // const fs = BFSRequire('fs');
  // // const fsPath = BFSRequire('path');
  // // @ts-ignore
  // fs.promises = {
  //   readFile: cb2promise(fs, 'readFile'),
  //   writeFile: cb2promise(fs, 'writeFile'),
  //   readdir: cb2promise(fs, 'readdir'),
  //   mkdir: cb2promise(fs, 'mkdir'),
  //   rm: cb2promise(fs, 'rmdir'),
  //   rename: cb2promise(fs, 'rename'),
  // };
  // // shim mkdir recursive: true
  // const _mkDir = fs.mkdir;
  // fs.mkdir = (path, options, cb) => {
  //   if (typeof options === 'function') {
  //     cb = options;
  //     options = undefined;
  //   }
  //   if (options && options.recursive) {
  //     makeDirectory(path, {
  //       fs,
  //       path: fsPath,
  //       mode: options.mode,
  //     }).then(() => cb(null), cb);
  //     return;
  //   }
  //   _mkDir.call(fs, path, options, cb);
  // };