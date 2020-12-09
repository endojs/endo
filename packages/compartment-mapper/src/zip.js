// Decouples Zip usage from JSZip's particular presentation.

import { ZipReader } from "./zip/reader";
import { ZipWriter } from "./zip/writer";

export const readZip = async (data, location) => {
  const reader = new ZipReader(data, { name: location });
  const read = async path => reader.read(path);
  return { read };
};

export const writeZip = () => {
  const writer = new ZipWriter();
  const write = async (path, data) => writer.write(path, data);
  const snapshot = async () => writer.snapshot();
  return { write, snapshot };
};
