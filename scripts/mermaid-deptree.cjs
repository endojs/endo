/* eslint-env es2022, node */
// @ts-check

/**
 * This script generates Mermaid top-down "flowchart" of a dependency tree from
 * a root package.
 *
 * The output is wrapped in a Markdown fenced code block, and contains
 * {@link https://mermaid.js.org/intro/syntax-reference.html#frontmatter-for-diagram-code configuration front matter}
 * and a word-wrapping fix.
 *
 * Usage: `node mermaid-deptree.cjs [<entry_dir>] [<node_modules_dir>]`
 *
 * Fair warning: Copilot wrote most of this.
 *
 * @module
 */
const { Stats } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');

const PACKAGE_JSON = 'package.json';

/**
 * Dependency type
 *
 * @typedef {'peer'|'production'|'dev'|'optional'|'optionalPeer'} DepType
 */

/**
 * A node in a {@link DependencyGraph} containing minimal info needed to
 * represent a dependency and relationships in a Mermaid graph
 *
 * @typedef Node
 * @property {DepType} type - The type of dependency
 * @property {string} name - The package name of the dependency; must correspond
 * to a subdir of `node_modules`
 */

/**
 * A flat graph mapping package names to their dependencies.
 *
 * @typedef {Record<string, Node[]>} DependencyGraph
 */

/**
 * Recursively reads all `package.json` files in the `node_modules` directory
 * and builds a dependency graph.
 *
 * @param {string} entry The root package.
 * @param {string} nodeModulesPath Path to the `node_modules` directory.
 * @returns {Promise<DependencyGraph>} Dependency graph mapping package names to their dependencies.
 */
async function buildDependencyGraph(entry, nodeModulesPath) {
  /** @type {DependencyGraph} */
  const graph = {};
  /** @type {Set<string>} */
  const seen = new Set();

  /**
   * @param {string} directory
   * @returns {Promise<void>}
   */
  async function traverse(directory) {
    await null;
    if (!seen.has(directory)) {
      seen.add(directory);
      const packageDirname = path.basename(directory);
      console.error(`Reading package in ${packageDirname}…`);
      const packageJsonPath = path.join(directory, PACKAGE_JSON);
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, 'utf8'),
      );
      let packageName = packageJson.name;
      if (!packageName) {
        console.warn(
          `Warning: No package name found in for package in ${directory}; using relative directory name`,
        );
        packageName = packageDirname;
      }

      const prodDependencies = Object.keys(packageJson.dependencies ?? []).map(
        dep => ({ type: 'production', name: dep }),
      );

      const devDependencies = Object.keys(
        packageJson.devDependencies ?? {},
      ).map(dep => ({ type: 'dev', name: dep }));

      const optionalDependencies = Object.keys(
        packageJson.optionalDependencies ?? {},
      ).map(dep => ({ type: 'optional', name: dep }));

      const peerDependencies = Object.keys(
        packageJson.peerDependencies ?? {},
      ).map(dep => ({ type: 'peer', name: dep }));

      let optionalPeerDependencies = [];
      if (packageJson.peerDependenciesMeta) {
        optionalPeerDependencies = Object.entries(
          packageJson.peerDependenciesMeta,
        ).reduce((acc, [dep, meta]) => {
          if (meta.optional) {
            acc.push({ type: 'optionalPeer', name: dep });
          }
          return acc;
        }, /** @type {Node[]} */ ([]));
      }

      /** @type {Node[]} */
      const nodes = [
        ...prodDependencies,
        ...devDependencies,
        ...optionalDependencies,
        ...peerDependencies,
        ...optionalPeerDependencies,
      ];
      graph[packageName] = nodes;

      // Traverse dependencies
      await Promise.all(
        nodes.map(async node => {
          const dependencyPath = path.join(nodeModulesPath, node.name);
          await assertIsDir(dependencyPath);
          return traverse(dependencyPath);
        }),
      );
    }
  }

  await traverse(entry);

  return graph;
}

/**
 * Converts a dependency graph into a top-down Mermaid flowchart graph, wrapped
 * in a fenced code block.
 *
 * @param {DependencyGraph} graph The dependency graph.
 * @returns {string} A Mermaid graph definition.
 */
function generateMermaidGraph(graph) {
  const lines = [
    '```mermaid',
    `---
config:
  themeVariables:
    fontFamily: "Fira Mono,Menlo,Consolas,Liberation Mono,monospace"
---`,
    'graph TD',
  ];
  for (const [packageName, dependencies] of Object.entries(graph)) {
    dependencies.forEach(({ name, type }) => {
      let line = `  ${packageName}`;
      switch (type) {
        case 'dev':
          line += `-->`;
          break;
        case 'optional':
          line += `-.->`;
          break;
        case 'production':
          line += `==>`;
          break;
        case 'peer':
          line += `---`;
          break;
        case 'optionalPeer':
          line += `-.-`;
          break;
      }
      if (type !== 'production') {
        line += ` |"\`_${type}_\`"|`;
      }
      line += ` ${name}`;
      lines.push(line);
    });
  }

  lines.push('classDef default white-space:nowrap', '```');
  return lines.join('\n');
}

/**
 * Asserts the given path `dir` points to a directory.
 * @param {string} dir
 * @returns {Promise<void>}
 */
const assertIsDir = async dir => {
  /** @type {Stats} */
  let stat;
  try {
    stat = await fs.stat(dir);
  } catch (error) {
    throw new Error(`Error: "${dir}" does not exist`, { cause: error });
  }

  if (!stat.isDirectory()) {
    throw new Error(`"${dir}" is not a directory`);
  }
};

const printUsage = () => {
  console.error(
    `Usage: node mermaid-deptree.cjs [<entry_dir>] [<node_modules_path>]

  - <entry_dir> is the path to the entry dir containing a \`package.json\`; defaults to the current working directory 
  - <node_modules_dir> is the path to the \`node_modules\` directory; defaults to the parent dir of <entry_dir>

`,
  );
};

// Main script
(async () => {
  const entry = path.resolve(process.argv[2] || process.cwd());
  const nodeModulesPath = path.resolve(
    process.argv[3] || path.join(entry, '..'),
  );
  await Promise.all([assertIsDir(entry), assertIsDir(nodeModulesPath)]);

  console.error('Traversing dependencies…');
  const dependencyGraph = await buildDependencyGraph(entry, nodeModulesPath);

  console.error('Generating Mermaid graph…');
  const mermaidGraph = generateMermaidGraph(dependencyGraph);

  console.error('Mermaid graph:\n\n');
  console.log(mermaidGraph);
})().catch(err => {
  printUsage();
  console.error(err);
  process.exitCode = 1;
});
