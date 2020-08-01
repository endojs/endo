/* global harden */

import "./lockdown.js";
import { loadLocation, writeArchive, loadArchive } from "./main.js";
import { search } from "./search.js";
import { compartmentMapForNodeModules } from "./compartmap.js";

const iterate = sequence => sequence[Symbol.iterator]();

function usage(message) {
  console.error(message);
  return 1;
}

async function execute(application) {
  const endowments = harden({
    console: {
      log(...args) {
        console.log(...args);
      }
    }
  });

  await application.execute(endowments);
  return 0;
}

async function executeLocation(applicationPath, { cwd, read }) {
  const currentLocation = new URL(`${cwd()}/`, "file:///");
  const applicationLocation = new URL(applicationPath, currentLocation);
  const application = await loadLocation(read, applicationLocation);
  return execute(application);
}

async function archive(archivePath, applicationPath, { cwd, read, write }) {
  const currentLocation = new URL(`${cwd()}/`, "file:///");
  const archiveLocation = new URL(archivePath, currentLocation);
  const applicationLocation = new URL(applicationPath, currentLocation);
  await writeArchive(write, read, archiveLocation, applicationLocation);
  return 0;
}

async function executeArchive(archivePath, { read, cwd }) {
  const currentLocation = new URL(`${cwd()}/`, "file:///");
  const archiveLocation = new URL(archivePath, currentLocation);
  const application = await loadArchive(read, archiveLocation);
  return execute(application);
}

async function compartmap(applicationPath, { read, cwd, stdout }) {
  const currentLocation = new URL(`${cwd()}/`, "file:///");
  const applicationLocation = new URL(applicationPath, currentLocation);
  const { packageLocation } = await search(read, applicationLocation);
  const compartmentMap = await compartmentMapForNodeModules(
    read,
    packageLocation
  );
  stdout.write(`${JSON.stringify(compartmentMap, null, 2)}\n`);
  return 0;
}

// run parses command line arguments and dispatches to a subcommand.
async function run(args, powers) {
  for (const arg of args) {
    if (arg === "--") {
      for (const applicationLocation of args) {
        return executeLocation(applicationLocation, powers);
      }
    } else if (arg === "--compartmap") {
      for (const applicationPath of args) {
        const rem = Array.from(args);
        if (rem.length > 0) {
          return usage(
            `Unexpected arguments after --compartmap ${applicationPath}: ${rem}`
          );
        }
        return compartmap(applicationPath, powers);
      }
    } else if (arg === "-w") {
      for (const archivePath of args) {
        for (const applicationPath of args) {
          const rem = Array.from(args);
          if (rem.length > 0) {
            return usage(
              `Unexpected arguments after --archive ${archivePath} ${applicationPath}: ${rem}`
            );
          }
          return archive(archivePath, applicationPath, powers);
        }
        return usage(`Expected application path`);
      }
      return usage(`Expected archive path`);
    } else if (arg === "-x") {
      for (const archivePath of args) {
        const rem = Array.from(args);
        if (rem.length > 0) {
          return usage(`Unexpected arguments after -x ${archivePath}: ${rem}`);
        }
        return executeArchive(archivePath, powers);
      }
      return usage(`Expected archive path`);
    } else if (arg.startsWith("-")) {
      return usage(`Unrecognized flag ${arg}`);
    } else {
      const rem = Array.from(args);
      if (rem.length > 0) {
        return usage(`Unexpected arguments after ${arg}: ${rem}`);
      }
      return executeLocation(arg, powers);
    }
  }
  return usage(`Expected script path or flag`);
}

export async function main(process, modules) {
  const { fs } = modules;
  const read = async location => fs.readFile(new URL(location).pathname);
  const write = async (location, content) =>
    fs.writeFile(new URL(location).pathname, content);
  try {
    const args = iterate(process.argv.slice(2));
    process.exitCode = await run(args, {
      read,
      write,
      cwd: process.cwd,
      stdout: process.stdout
    });
  } catch (error) {
    process.exitCode = usage(error.stack || error.message);
  }
}
