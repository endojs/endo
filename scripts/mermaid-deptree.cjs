/**
 * This script generates Mermaid graph of a dependency tree from the root package.
 *
 * Usage: `node mermaid-deptree.cjs <entry> [<node_modules_path>]`
 *
 * Fair warning: Copilot wrote most of this.
 *
 * @module
 */

const fs = require('fs');
const path = require('path');

/**
 * Recursively reads all `package.json` files in the `node_modules` directory
 * and builds a dependency graph.
 *
 * @param {string} entry - The root package.
 * @param {string} nodeModulesPath - Path to the `node_modules` directory.
 * @returns {Record<string, string[]>} - A dependency graph where keys are package names and values are arrays of dependencies.
 */
function buildDependencyGraph(entry, nodeModulesPath) {
  /** @type {Record<string, string[]>} */
  const graph = {};

  const seen = new Set();

  /**
   * @param {string} directory
   * @returns {void}
   */
  function traverse(directory) {
    const packageJsonPath = path.join(directory, 'package.json');
    if (!seen.has(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const packageName = packageJson.name || path.basename(directory);
      const dependencies = Object.keys(packageJson.dependencies || {});
      graph[packageName] = dependencies;

      // Traverse dependencies
      dependencies.forEach(dependency => {
        const dependencyPath = path.join(nodeModulesPath, dependency);
        if (
          fs.existsSync(dependencyPath) &&
          fs.statSync(dependencyPath).isDirectory()
        ) {
          traverse(dependencyPath);
        }
      });
    }
    seen.add(packageJsonPath);
  }

  // Start traversal from the root of `node_modules`
  if (fs.statSync(entry).isDirectory()) {
    traverse(entry);
  }

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

// Main script
(async () => {
  let entry = process.argv[2];
  if (!entry) {
    console.error(
      'Usage: node mermaid-deptree.cjs <entry> [<node_modules_path>]\n\n  - <entry> is the path to the entry package.\n  - <node_modules_path> is the path to the node_modules directory; if not provided, it is assumed to be the parent dir of the entry package',
    );
    process.exitCode = 1;
    return;
  }
  entry = path.resolve(entry);
  console.error(`Entry package resolved to: ${entry}`);
  let nodeModulesPath = process.argv[3] || path.join(entry, '..');
  nodeModulesPath = path.resolve(nodeModulesPath);

  if (!fs.existsSync(nodeModulesPath)) {
    console.error(
      `Error: Directory "${nodeModulesPath}" does not exist. If not provided, the path is assumed to be the parent dir of the entry package`,
    );
    process.exit(1);
  }

  console.error('Building dependency graph...');
  const dependencyGraph = buildDependencyGraph(entry, nodeModulesPath);

  console.error('Generating Mermaid graph...');
  const mermaidGraph = generateMermaidGraph(dependencyGraph);

  console.error('Mermaid graph:\n');
  console.log(mermaidGraph);
})();
