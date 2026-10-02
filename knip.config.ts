import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreIssues: {
    // ignore unused files here
    '**/demo/**': ['files', 'exports'],
    'browser-test/**': ['files'],
    // ignore unused files and unlisted deps in all fixtures
    '**/test/fixture*/**/*.js': ['unlisted', 'files'],
  },

  // workspace-specific settings
  workspaces: {
    // workspace root
    '.': {
      node: {
        entry: [
          // ses-ava configs
          './ava*.mjs',
          // any script
          'scripts/**/*.{js,mjs,cjs}',
        ],
      },
      ignoreDependencies: [
        // 'yarn changeset'
        '@changesets/cli',
        '@lavamoat/allow-scripts',
        '@lavamoat/preinstall-always-fail',
        '@endo/*',
        // used by update-typeCoverage-floor.sh
        'type-coverage',
        // used by browser-test in CI
        '@playwright/test',
      ],
    },
    // settings for all packages
    'packages/*': {
      node: {
        // these are considered the source files for the package
        project: ['*.{js,d.ts}', 'src/**/*.{js,ts,d.ts}', 'bin/*.{js,mjs,cjs}'],
        // essentially overrides for project
        entry: [
          // consider any .js file in test except for fixtures and test files to
          // be an entry point
          'test/**/*.js',
          '!test/**/fixture*/**/*.js',
          '!test/**/*.test*.js',
        ],
      },
      ava: {
        // all AVA tests should be named like *.test*.js
        entry: ['test/**/*.test*.js'],
      },
      tsd: {
        // consider any .test-d.ts file to be a tsd test including in src dirs
        entry: ['**/*.test-d.ts'],
      },
      // ses-ava invokes ava, but knip cannot detect this
      ignoreDependencies: ['ava'],
    },
    'packages/cli': {
      ignoreBinaries: ['tail'],
    },
    'packages/daemon': {
      node: {
        entry: [
          // referenced by path in tests
          'src/networks/tcp-netstring.js',
          // looks like it might be a debugging script
          'src/serve-private-port-http.js',
        ],
      },
    },
    'packages/errors': {
      ignoreDependencies: ['ses0.18.3'],
    },
    'packages/bundle-source': {
      node: {
        entry: ['bin/bundle-source.cjs'],
      },
    },
    'packages/compartment-mapper': {
      ignoreIssues: {
        // may be a knip bug
        'test/subpath-patterns-node-condition.node-condition.test.js': [
          'files',
        ],
      },
    },
    'packages/module-source': {
      // this is a CI-only thing
      ignoreBinaries: ['xst'],
    },
    'packages/ses': {
      // this is a CI-only thing
      ignoreBinaries: ['xst'],
      ignoreDependencies: ['hermes-engine-cli'],
      node: {
        // non-AVA test files
        entry: ['test262/*.js'],
      },
      ignoreIssues: {
        'src/commons.js': ['exports'],
        'src/permits.js': ['exports'],
      },
    },
    'packages/skel': {
      ignoreDependencies: [/.*/],
    },
    'packages/stream-types-test': {
      node: {
        // script; should probably be moved
        entry: ['validation.ts'],
      },
    },
    'packages/test262-runner': {
      node: {
        // afaict everything here is up for grabs
        entry: ['**/*.js'],
      },
    },
  },
  // allows use of @knipignore in docstrings to suppress errors
  tags: ['-@knipignore'],
};

export default config;
