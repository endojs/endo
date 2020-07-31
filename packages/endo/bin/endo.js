#!/usr/bin/env node
import fs from "fs";
import { main } from "../src/cli.js";

main(process, { fs: fs.promises });
