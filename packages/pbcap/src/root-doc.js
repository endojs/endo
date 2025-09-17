import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const ROOT_DOC_URL_KEY = 'rootDocUrl';

// Ensure the storage directory exists
const ensureStorageDir = () => {
  const dir = join(homedir(), '.pbcap');
  if (!existsSync(dir)) {
    // Create directory synchronously if it doesn't exist
    mkdirSync(dir, { recursive: true });
  }
};

/**
 * Set the root document URL in persistent storage.
 * @param profileName
 * @param {string} url - The AutomergeUrl to set as the root document URL.
 */
export const setRootDocUrl = (profileName, url) => {
  ensureStorageDir();
  const data = { [ROOT_DOC_URL_KEY]: url };
  const storageFile = join(homedir(), '.pbcap', `${profileName}-root-doc.json`);
  writeFileSync(storageFile, JSON.stringify(data, null, 2));
};

const getRootDocUrl = profileName => {
  const storageFile = join(homedir(), '.pbcap', `${profileName}-root-doc.json`);
  try {
    if (!existsSync(storageFile)) {
      return null;
    }
    const data = JSON.parse(readFileSync(storageFile, 'utf8'));
    return data[ROOT_DOC_URL_KEY] || null;
  } catch (error) {
    // If there's any error reading the file, return null
    return null;
  }
};

/**
 * Get or create the root document in the repo.
 * @param {Repo} repo - The Automerge Repo instance.
 * @param profileName
 * @returns {string} The AutomergeUrl of the root document.
 */
export const getOrCreateRoot = (repo, profileName) => {
  // Check if we already have a root document
  const existingId = getRootDocUrl(profileName);
  if (existingId) {
    // @type {string} AutomergeUrl
    return existingId;
  }

  // Create the root document
  /** @type {any} RootDocument */
  const root = repo.create({ edited: false });

  setRootDocUrl(profileName, root.url);
  return root.url;
};
