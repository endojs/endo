import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import fs from 'fs';

const metaPath = new URL('package.json', import.meta.url).pathname;
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
const name = meta.name.split('/').pop();

const resolveWithBuiltins = () => resolve({ preferBuiltins: true });
const external = ['buffer', 'events', 'os', 'stream', 'tty', 'util'];

export default [
  {
    input: 'src/main.js',
    output: [
      {
        file: `dist/${name}.cjs`,
        format: 'cjs',
      },
    ],
    external,
    plugins: [resolveWithBuiltins(), commonjs(), json()],
  },
];
