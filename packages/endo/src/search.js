import { relativize } from "./node-module-specifier.js";
import { relative } from "./url.js";

// q, as in quote, for enquoting strings in error messages.
const q = JSON.stringify;

const decoder = new TextDecoder();

// Searches for the first ancestor directory of a module file that contains a
// package.json.
// Probes by attempting to read the file, not stat.
// To avoid duplicate work later, returns the text of the package.json for
// inevitable later use.
export const search = async (read, modulePath) => {
  let directory = new URL("./", modulePath).toString();
  for (;;) {
    const packageDescriptorPath = new URL("package.json", directory).toString();
    // eslint-disable-next-line no-await-in-loop
    const packageDescriptorBytes = await read(packageDescriptorPath).catch(
      () => undefined
    );
    if (packageDescriptorBytes !== undefined) {
      const packageDescriptorText = decoder.decode(packageDescriptorBytes);
      return {
        packagePath: directory,
        packageDescriptorText,
        moduleSpecifier: relativize(relative(directory, modulePath))
      };
    }
    const parentDirectory = new URL("../", directory).toString();
    if (parentDirectory === directory) {
      throw new Error(
        `Cannot find package.json along path to module ${q(modulePath)}`
      );
    }
    directory = parentDirectory;
  }
};
