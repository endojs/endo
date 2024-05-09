// import "./ses-lockdown.js";
import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

const fixture = new URL(
  'fixtures-policy/node_modules/app/importActualBuiltin.js',
  import.meta.url,
).toString();

scaffold(
  'exitModule importHook - import actual builtin',
  test,
  fixture,
  (t, { namespace }) => {
    t.is(namespace.rootExists, true);
  },
  1, // expected number of assertions
  {
    additionalOptions: {
      importHook: async specifier => {
        const ns = await import(specifier);
        return Object.freeze({
          imports: [],
          exports: Object.keys(ns),
          execute: moduleExports => {
            moduleExports.default = ns;
            Object.assign(moduleExports, ns);
          },
        });
      },
    },
  },
);
