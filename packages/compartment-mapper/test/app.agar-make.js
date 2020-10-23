import "ses";
import fs from "fs";
import { writeArchive } from "../src/main.js";

const fixture = new URL("node_modules/app/main.js", import.meta.url).toString();
const archiveFixture = new URL("app.agar", import.meta.url).toString();

const read = async location => fs.promises.readFile(new URL(location).pathname);
const write = async (location, data) =>
  fs.promises.writeFile(new URL(location).pathname, data);

writeArchive(write, read, archiveFixture, fixture);
