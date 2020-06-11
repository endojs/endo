// Decouples Endo's usage from JSZip's particular presentation.

import JSZip from "jszip";

export const readZip = async data => {
  const zip = new JSZip();
  await zip.loadAsync(data);
  const read = async path => zip.file(path).async("uint8array");
  return { read };
};

export const writeZip = () => {
  const zip = new JSZip();
  const write = async (path, data) => zip.file(path, data);
  const data = async () => zip.generateAsync({ type: "uint8array" });
  return { write, data };
};
