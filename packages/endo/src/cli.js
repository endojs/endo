/* eslint no-shadow: [0] */
import "./lockdown.js";
import subprocess from "child_process";
import {
  search,
  writeArchive,
  compartmentMapForNodeModules
} from "@agoric/compartment-mapper";

const mitmPath = new URL("../mitm", import.meta.url).pathname;

function usage(message) {
  console.error(message);
  return 1;
}

async function noEntryUsage() {
  return usage(`expected path to program`);
}

async function noArchiveUsage() {
  return usage(`expected path for archive`);
}

async function subcommand([arg, ...rest], handlers) {
  const keys = Object.keys(handlers);
  if (arg === undefined || !keys.includes(arg)) {
    return usage(`expected one of ${keys.join(", ")}`);
  }
  return handlers[arg](rest);
}

async function parameter(args, handle, usage) {
  const [arg, ...rest] = args;
  if (arg === undefined) {
    return usage(`expected an argument`);
  }
  if (arg.startsWith("-")) {
    return usage(`unexpected flag: ${arg}`);
  }
  return handle(arg, rest);
}

async function run(args, { cwd, read, write, stdout, env }) {
  async function map(args) {
    async function handleEntry(applicationPath, args) {
      if (args.length) {
        return usage(`unexpected arguments: ${JSON.stringify(args)}`);
      }
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
    return parameter(args, handleEntry, noEntryUsage);
  }

  async function archive(args) {
    async function handleArchive(archivePath, args) {
      async function handleEntry(applicationPath, args) {
        if (args.length) {
          return usage(`unexpected arguments: ${JSON.stringify(args)}`);
        }
        const currentLocation = new URL(`${cwd()}/`, "file:///");
        const archiveLocation = new URL(archivePath, currentLocation);
        const applicationLocation = new URL(applicationPath, currentLocation);
        await writeArchive(write, read, archiveLocation, applicationLocation);
        return 0;
      }
      return parameter(args, handleEntry, noEntryUsage);
    }
    return parameter(args, handleArchive, noArchiveUsage);
  }

  async function exec([arg, ...args]) {
    const child = subprocess.spawn(arg, args, {
      env: { ...env, PATH: `${mitmPath}:${env.PATH}` },
      stdio: "inherit"
    });
    return new Promise(resolve => child.on("exit", resolve));
  }

  return subcommand(args, { map, archive, exec });
}

export async function main(process, modules) {
  const { fs } = modules;
  const { cwd, stdout, env } = process;

  // Filesystem errors often don't have stacks:

  async function read(location) {
    try {
      return await fs.readFile(new URL(location).pathname);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async function write(location, content) {
    try {
      return await fs.writeFile(new URL(location).pathname, content);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  try {
    process.exitCode = await run(process.argv.slice(2), {
      read,
      write,
      cwd,
      stdout,
      env
    });
  } catch (error) {
    process.exitCode = usage(error.stack || error.message);
  }
}
