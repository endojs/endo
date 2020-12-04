/* eslint-disable no-redeclare */
/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */
import { URL } from 'url';

// eslint-disable-next-line import/no-extraneous-dependencies
import detective from 'detective-es6';

const USAGE = `findmods WORKSPACE FILE EXCLUDE`;

const resolve = (ref, base) => new URL(ref, base).toString();

function containingPackage(
  loc,
  { readFile, fileURL },
  sentinel = 'package.json',
) {
  async function recur(here, step) {
    const parent = resolve(step, here);

    if (parent === here && step === '..') {
      throw new Error(`no containing package: ${loc}`);
    }

    const descriptorPath = fileURL.toPath(resolve(sentinel, parent));
    return readFile(descriptorPath, 'utf8')
      .then(txt => {
        const { name, version = '' } = JSON.parse(txt);
        return { location: parent, name, version, label: `${name}@${version}` };
      })
      .catch(err => {
        if (['ENOTDIR', 'ENOENT'].includes(err.code)) {
          return recur(parent, '..');
        }
        throw err;
      });
  }

  return recur(loc, './');
}

function relativeTo(target, base) {
  if (!base.endsWith('/')) {
    base += '/';
  }

  if (target.startsWith(base)) {
    return target.slice(base.length);
  }
  return target;
}

async function walk(workspace, start, exclude, { fsp, cabinet, fileURL }) {
  const pkgOf = u => containingPackage(u, { readFile: fsp.readFile, fileURL });
  const u2p = u => fileURL.toPath(u);
  const p2u = p => fileURL.fromPath(p).toString();
  const inW = u => relativeTo(u, workspace);
  const unjs = p => p.replace(/\.js$/, '');

  const todo = [start];
  const seen = new Set();
  const compartments = {};

  while (todo.length > 0) {
    const importer = todo.shift();
    if (seen.has(importer)) {
      continue;
    }
    seen.add(importer);

    const srcPkg = await pkgOf(importer);
    const pkgName = inW(srcPkg.location);
    const compartment =
      compartments[pkgName] ||
      (compartments[pkgName] = {
        label: srcPkg.label,
        location: pkgName,
        contents: [],
        modules: {},
      });
    const contents = compartment.contents;
    const modules = compartment.modules;
    contents.push(`./${relativeTo(importer, srcPkg.location)}`);

    const src = await fsp.readFile(u2p(importer), 'utf8');

    const dependencies = detective(src);
    // console.log({ importer, srcLength: src.length, dependencies });
    // console.log({ src: src.slice(0, 30) });
    for (const specifier of dependencies) {
      if (exclude && specifier.match(exclude)) {
        // console.log('excluded:', specifier, ' by:', exclude);
        modules[specifier] = { exclude };
        continue;
      }

      const target = cabinet({
        partial: specifier,
        directory: u2p(workspace),
        filename: u2p(importer),
        nodeModulesConfig: { entry: 'module' },
      });
      // console.log({ specifier, target });
      if (target.length > 0) {
        const imported = p2u(target);
        todo.push(imported);

        const destPkg = await pkgOf(imported);
        const ref = relativeTo(imported, destPkg.location);
        if (destPkg.location !== srcPkg.location) {
          modules[specifier] = {
            compartment: inW(destPkg.location),
            module: `./${ref}`,
          };
        }
      }
    }
  }

  const ancestors = spec =>
    spec
      .split('/')
      .slice(0, -2)
      .reduce(
        ([p, ps], seg) => [`${p}/${seg}`, [...ps, `${p}/${seg}`.slice(1)]],
        ['', []],
      )[1];
  const modules = Object.fromEntries(
    Array.from(seen)
      .map(m => inW(m))
      .map(m => [m, ...ancestors(m).map(d => `${d}/0_MKDIR`)])
      .flat()
      .map(m => [unjs(m), `$(ROOT)/${unjs(m)}`])
      .sort(),
  );
  const mainPkg = await pkgOf(start);
  return {
    main: inW(mainPkg.location),
    compartments,
    modules,
  };
}

async function main(argv, { stdout, fsp, fileURL, cabinet }) {
  const [workspace, start, exclude] = argv.slice(2);
  if (!workspace || !start) {
    throw USAGE;
  }

  const p2u = p => fileURL.fromPath(p).toString();
  const info = await walk(p2u(workspace), p2u(start), exclude, {
    fsp,
    cabinet,
    fileURL,
  });

  stdout.write(JSON.stringify(info, null, 2));
  stdout.write('\n');
}

/* global require, module, process */
if (require.main === module) {
  main(process.argv, {
    stdout: process.stdout,
    // eslint-disable-next-line global-require
    fsp: require('fs').promises,
    fileURL: {
      // eslint-disable-next-line global-require
      fromPath: require('url').pathToFileURL,
      // eslint-disable-next-line global-require
      toPath: require('url').fileURLToPath,
    },
    // eslint-disable-next-line
    cabinet: require('filing-cabinet'),
  }).catch(err => console.error('main:', err));
}
