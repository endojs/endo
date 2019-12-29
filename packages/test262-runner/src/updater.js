import fs from 'fs';
import path from 'path';

const USAGE = `
This updates the test262 test files. Given a clone of the test262 git repo,
it copies all tests that validate conformance to TC39 specifications.

Usage: 
  update-test262 <path-to-test262-git-clone>
`;

function copyFileSync(source, target) {
  let targetFile = target;

  if (fs.existsSync(target) && fs.lstatSync(target).isDirectory()) {
    targetFile = path.join(target, path.basename(source));
  }

  fs.writeFileSync(targetFile, fs.readFileSync(source));
}

function copyTreeSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  if (fs.lstatSync(source).isDirectory()) {
    const files = fs.readdirSync(source);
    files.forEach(function(file) {
      const sourcePath = path.join(source, file);
      if (fs.lstatSync(sourcePath).isDirectory()) {
        const targetPath = path.join(target, file);
        copyTreeSync(sourcePath, targetPath);
      } else {
        copyFileSync(sourcePath, target);
      }
    });
  }
}

function countTreeSync(source) {
  let count = 0;

  // Copy.
  if (fs.lstatSync(source).isDirectory()) {
    const files = fs.readdirSync(source);
    files.forEach(function(file) {
      const sourcePath = path.join(source, file);
      if (fs.lstatSync(sourcePath).isDirectory()) {
        count += countTreeSync(sourcePath);
      } else if (file.endsWith('.js')) {
        count += 1;
      }
    });
  }

  return count;
}

function existsDirsSync(base, dirs) {
  return dirs.every(dir => fs.lstatSync(path.join(base, dir)).isDirectory());
}

function existsFilesSync(base, files) {
  return files.every(file => fs.lstatSync(path.join(base, file)).isFile());
}

function getGitCommit(source) {
  const rev = fs
    .readFileSync(path.join(source, '.git', 'HEAD'))
    .toString()
    .trim();

  if (rev.startsWith('ref:')) {
    return fs
      .readFileSync(path.join(source, '.git', rev.substring(5)))
      .toString();
  }

  return rev;
}

function checkSource(source, root, target) {
  console.log('Checking argument provided...');
  if (!(typeof source === 'string') || source === '') {
    console.log(USAGE);
    return false;
  }

  // Check wheter we have the signature of a source test262 repo.
  console.log('Checking source path...');
  if (
    !existsFilesSync(source, ['README.md', 'package.json']) ||
    !existsDirsSync(source, ['harness', 'test'])
  ) {
    console.log('The path provided is not a test262 git clone.');
    return false;
  }

  // Check wheter we have the signature of a target repo.
  console.log('Checking current path...');
  if (
    !existsFilesSync(root, ['README.md', 'package.json']) ||
    !existsDirsSync(source, ['src', 'test262'])
  ) {
    console.log('Must execute from the root of the target repo.');
    return false;
  }

  // Check if the target directory is empty (we require a manual cleanup).
  console.log('Checking target path...');
  if (fs.existsSync(path.join(target, 'test'))) {
    console.log('Directory test262/test must be manually removed first.');
    console.log('Use "trash test262/test" or a similar command.');
    return false;
  }

  // Good to go.
  return true;
}

export default function({ testDirs }) {
  // Was argument provided?
  const source = process.argv[2];
  const root = process.cwd();
  const target = path.join(root, 'test262');

  if (checkSource(source, root, target)) {
    // Copy files.
    console.log('Copying files...');
    testDirs.forEach(dir =>
      copyTreeSync(path.join(source, dir), path.join(target, dir)),
    );

    // Display count.
    const count = countTreeSync(target);
    console.log(count, 'files copied.');

    // Get git info.
    console.log('Updating git revision...');
    const commit = getGitCommit(source);
    const content = `commit: ${commit}\nfiles: ${count}\n`;
    fs.writeFileSync(path.join(root, 'test262/test262-revision.txt'), content, {
      encoding: 'utf8',
      flag: 'w',
    });

    console.log('Done!');
  } else {
    console.log('Aborted!');
  }
}
