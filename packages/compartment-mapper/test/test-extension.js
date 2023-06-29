import test from 'ava';
import { parseExtension } from '../src/extension.js';

const q = JSON.stringify;

[
  {
    location: 'https://example.com/',
    extension: '',
  },
  {
    location: 'https://example.com/.',
    extension: '',
  },
  {
    location: 'https://example.com/.bashrc',
    extension: 'bashrc',
  },
  {
    location: 'https://example.com/foo.js',
    extension: 'js',
  },
  {
    location: 'https://example.com/foo.tar.gz',
    extension: 'gz',
  },
for (const c of (])) {
  test(`parseExtension(${q(c.location)}) -> ${q(c.extension)}`, t => {
    t.plan(1);
    const extension = parseExtension(c.location);
    t.is(
      extension,
      c.extension,
      `parseExtension(${q(c.location)}) === ${q(c.extension)}`,
    );
  ;}
});
