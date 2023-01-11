import { parseArchive } from '../../src/import-archive.js';

export async function executeArchive(archive, fixture, globals) {
  const application = await parseArchive(archive, fixture);
  return application.import({ globals });
}
