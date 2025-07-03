// @ts-check

/**
 * This script generates Mermaid graph of a dependency tree from the root package.
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
 * Recursively reads all `package.json` files in the `node_modules` directory
 * and builds a dependency graph.
 *
 * @param {string} entry - The root package.
 * @param {string} nodeModulesPath - Path to the `node_modules` directory.
 * @returns {Promise<Record<string, string[]>>} - A dependency graph where keys are package names and values are arrays of dependencies.
 */
async function buildDependencyGraph(entry, nodeModulesPath) {
  /** @type {Record<string, string[]>} */
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
      const packageJsonPath = path.join(directory, PACKAGE_JSON);
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, 'utf8'),
      );
      const packageName = packageJson.name || path.basename(directory);
      const dependencies = Object.keys({
        ...packageJson.peerDependencies,
        ...packageJson.devDependencies,
        ...packageJson.dependencies,
      });
      graph[packageName] = dependencies;

      // Traverse dependencies
      await Promise.all(
        dependencies.map(async dependency => {
          const dependencyPath = path.join(nodeModulesPath, dependency);
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
 * Converts a dependency graph into a Mermaid graph definition.
 *
 * @param {Record<string, string[]>} graph - The dependency graph.
 * @returns {string} - A Mermaid graph definition.
 */
function generateMermaidGraph(graph) {
  const lines = ['graph TD'];
  for (const [packageName, dependencies] of Object.entries(graph)) {
    dependencies.forEach(dependency => {
      lines.push(`    ${packageName} --> ${dependency}`);
    });
  }
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

  console.error('Building dependency graph...');
  const dependencyGraph = await buildDependencyGraph(entry, nodeModulesPath);

  console.error('Generating Mermaid graph...');
  const mermaidGraph = generateMermaidGraph(dependencyGraph);

  console.error('Mermaid graph:\n');
  console.log(mermaidGraph);
})().catch(err => {
  printUsage();
  console.error(err);
  process.exitCode = 1;
});
