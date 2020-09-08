// Decouples Zip usage from JSZip's particular presentation.

import JSZip from "jszip";

export const readZip = async (data, location) => {
  const zip = new JSZip();
  await zip.loadAsync(data);
  const read = async path => {
    const file = zip.file(path);
    if (!file) {
      throw new Error(
        `Cannot find file to read ${path} in archive ${location || "<unknown>"}`
      );
    }
    return file.async("uint8array");
  };
  return { read };
};

export const writeZip = () => {
  const zip = new JSZip();
  const write = async (path, data) => zip.file(path, data);
  const data = async () => zip.generateAsync({ type: "uint8array" });
  return { write, data };
};
