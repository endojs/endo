#!/usr/bin/env node
// Update pinned GitHub Action SHAs in .github/workflows by resolving tag refs.
// Usage:
//   node scripts/update-action-pins.mjs
//   node scripts/update-action-pins.mjs --major
//   node scripts/update-action-pins.mjs --check-pins
//   node scripts/update-action-pins.mjs --report /tmp/action-pin-report.md
//   node scripts/update-action-pins.mjs --min-age-days 0
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as YAML from 'yaml';
import { CST } from 'yaml';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(scriptDir, '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');
const files = readdirSync(workflowsDir).filter(
  f => f.endsWith('.yml') || f.endsWith('.yaml'),
);
const { values } = parseArgs({
  options: {
    report: { type: 'string' },
    major: { type: 'boolean', default: false },
    'check-pins': { type: 'boolean', default: false },
    'min-age-days': { type: 'string' },
  },
});
const isMajor = values.major;
const checkPins = values['check-pins'];
const parsedMinAgeDays = Number.parseInt(values['min-age-days'] || '5', 10);
const minAgeDays = Number.isFinite(parsedMinAgeDays) && parsedMinAgeDays > 0
  ? parsedMinAgeDays
  : 0;
const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;
const reportPath = values.report || '/tmp/action-pin-report.md';
const resolvedReportPath = reportPath.startsWith('/')
  ? reportPath
  : join(repoRoot, reportPath);
const addComments = true;

const resolveTagCache = new Map();
function resolveTag(repo, tag) {
  const cacheKey = `${repo}@${tag}`;
  if (resolveTagCache.has(cacheKey)) return resolveTagCache.get(cacheKey);
  const repoUrl = `https://github.com/${repo}.git`;
  try {
    const out = execSync(`git ls-remote ${repoUrl} "refs/tags/${tag}^{}"`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (out) {
      const sha = out.split(/\s+/)[0];
      resolveTagCache.set(cacheKey, sha);
      return sha;
    }
  } catch {}
  try {
    const out = execSync(`git ls-remote ${repoUrl} "refs/tags/${tag}"`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (out) {
      const sha = out.split(/\s+/)[0];
      resolveTagCache.set(cacheKey, sha);
      return sha;
    }
  } catch {}
  resolveTagCache.set(cacheKey, null);
  return null;
}

function applyEdits(source, edits) {
  const ordered = edits.slice().sort((a, b) => b.start - a.start);
  let out = source;
  for (const edit of ordered) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

const tagListCache = new Map();
const commitDateCache = new Map();
function getTags(repo) {
  if (tagListCache.has(repo)) return tagListCache.get(repo);
  const repoUrl = `https://github.com/${repo}.git`;
  try {
    const out = execSync(`git ls-remote --tags ${repoUrl}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const tags = out
      .split('\n')
      .map(line => line.split(/\s+/)[1])
      .filter(Boolean)
      .map(ref => ref.replace(/^refs\/tags\//, ''))
      .filter(tag => /^v\\d+(\\.\\d+){0,2}$/.test(tag));
    tagListCache.set(repo, tags);
    return tags;
  } catch {
    tagListCache.set(repo, []);
    return [];
  }
}

function getCommitDate(repo, sha) {
  const cacheKey = `${repo}@${sha}`;
  if (commitDateCache.has(cacheKey)) return commitDateCache.get(cacheKey);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = [
    '-H',
    '"Accept: application/vnd.github+json"',
    '-H',
    '"X-GitHub-Api-Version: 2022-11-28"',
  ];
  if (token) headers.push('-H', `"Authorization: Bearer ${token}"`);
  const url = `https://api.github.com/repos/${repo}/commits/${sha}`;
  try {
    const out = execSync(`curl -sSL ${headers.join(' ')} ${url}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const data = JSON.parse(out);
    const dateStr =
      data && data.commit && data.commit.committer && data.commit.committer.date;
    if (dateStr) {
      const date = new Date(dateStr);
      if (!Number.isNaN(date.getTime())) {
        commitDateCache.set(cacheKey, date);
        return date;
      }
    }
  } catch {}
  commitDateCache.set(cacheKey, null);
  return null;
}

function compareTags(a, b) {
  const parse = tag =>
    tag
      .replace(/^v/, '')
      .split('.')
      .map(n => Number.parseInt(n, 10));
  const [am, ami = 0, ap = 0] = parse(a);
  const [bm, bmi = 0, bp = 0] = parse(b);
  if (am !== bm) return am - bm;
  if (ami !== bmi) return ami - bmi;
  return ap - bp;
}

const latestMajorCache = new Map();
function resolveLatestMajorTag(repo) {
  if (latestMajorCache.has(repo)) return latestMajorCache.get(repo);
  const tags = getTags(repo);
  if (tags.length === 0) {
    latestMajorCache.set(repo, null);
    return null;
  }
  const maxTag = tags.reduce((max, tag) =>
    compareTags(tag, max) > 0 ? tag : max,
  );
  latestMajorCache.set(repo, maxTag);
  return maxTag;
}

function visitNode(node, path, onPair) {
  if (!node) return;
  if (node.type === 'block-map') {
    for (const item of node.items || []) {
      const keyScalar = item.key && CST.resolveAsScalar(item.key);
      const key = keyScalar ? String(keyScalar.value) : null;
      if (key) onPair(item, path, key);
      if (item.value) visitNode(item.value, key ? [...path, key] : path, onPair);
    }
    return;
  }
  if (node.type === 'block-seq') {
    for (const item of node.items || []) {
      const value = item.value || item;
      visitNode(value, [...path, '[]'], onPair);
    }
    return;
  }
  if (node.type === 'flow-collection') {
    const isMap = (node.items || []).some(it => it && it.key);
    if (isMap) {
      for (const item of node.items || []) {
        const keyScalar = item.key && CST.resolveAsScalar(item.key);
        const key = keyScalar ? String(keyScalar.value) : null;
        if (key) onPair(item, path, key);
        if (item.value) visitNode(item.value, key ? [...path, key] : path, onPair);
      }
    } else {
      for (const item of node.items || []) {
        const value = item.value || item;
        visitNode(value, [...path, '[]'], onPair);
      }
    }
  }
}

function isStepUsesPath(path) {
  return path.length >= 4 && path[0] === 'jobs' && path[2] === 'steps' && path[3] === '[]';
}

function isJobUsesPath(path) {
  return path.length === 2 && path[0] === 'jobs';
}

let changed = 0;
const report = [];
const skipped = [];
const unpinned = [];
for (const file of files) {
  const path = join(workflowsDir, file);
  const original = readFileSync(path, 'utf8');
  const parser = new YAML.Parser();
  const cst = [...parser.parse(original)];
  const doc = cst[0];
  let updated = false;
  const edits = [];

  visitNode(doc, [], (item, nodePath, key) => {
    if (key !== 'uses') return;
    if (!isStepUsesPath(nodePath) && !isJobUsesPath(nodePath)) return;
    const value = item.value;
    if (!CST.isScalar(value)) return;
    const valueScalar = CST.resolveAsScalar(value);
    if (!valueScalar) return;
    const current = String(valueScalar.value);
    const at = current.lastIndexOf('@');
    if (at === -1) return;
    const actionPath = current.slice(0, at);
    const ref = current.slice(at + 1);
    const repo = actionPath.split('/').slice(0, 2).join('/');
    const commentTokenIndex = (value.end || []).findIndex(
      token => token.type === 'comment',
    );
    const commentToken =
      commentTokenIndex >= 0 ? value.end[commentTokenIndex] : null;
    const commentText = commentToken
      ? commentToken.source.replace(/^#\s?/, '').trim()
      : '';
    const commentIsVersion = commentText.startsWith('v');
    if (checkPins) {
      const isSha = /^[0-9a-f]{40}$/.test(ref);
      if (!isSha) unpinned.push(`${file}: ${actionPath}@${ref}`);
      return;
    }
    const tag = isMajor
      ? resolveLatestMajorTag(repo)
      : (commentIsVersion ? commentText : '') ||
        (ref.startsWith('v') ? ref : null) ||
        resolveLatestMajorTag(repo);
    if (!tag) return;
    const newSha = resolveTag(repo, tag);
    if (!newSha) {
      console.error(`warn: could not resolve ${repo}@${tag} in ${file}`);
      return;
    }
    if (minAgeMs > 0) {
      const commitDate = getCommitDate(repo, newSha);
      if (!commitDate) {
        skipped.push({
          actionPath,
          repo,
          tag,
          reason: 'commit date unavailable',
        });
        return;
      }
      const ageMs = Date.now() - commitDate.getTime();
      if (ageMs < minAgeMs) {
        skipped.push({
          actionPath,
          repo,
          tag,
          reason: `commit age ${Math.floor(ageMs / (24 * 60 * 60 * 1000))}d < ${minAgeDays}d`,
        });
        return;
      }
    }
    const oldSha = ref.startsWith('v') ? resolveTag(repo, ref) : ref;
    const shouldUpdateRef = oldSha && oldSha !== newSha;
    if (shouldUpdateRef) {
      edits.push({
        start: value.offset,
        end: value.offset + value.source.length,
        text: `${actionPath}@${newSha}`,
      });
      report.push({
        actionPath,
        repo,
        oldSha,
        newSha,
        tag,
      });
      updated = true;
    }

    if (addComments && (!commentText || commentIsVersion)) {
      const desiredComment = `# ${tag}`;
      if (commentToken) {
        if (commentToken.source !== desiredComment) {
          edits.push({
            start: commentToken.offset,
            end: commentToken.offset + commentToken.source.length,
            text: desiredComment,
          });
          updated = true;
        }
        const spaceToken = value.end[commentTokenIndex - 1];
        if (!spaceToken || spaceToken.type !== 'space') {
          edits.push({
            start: commentToken.offset,
            end: commentToken.offset,
            text: ' ',
          });
          updated = true;
        } else if (spaceToken.source !== ' ') {
          edits.push({
            start: spaceToken.offset,
            end: spaceToken.offset + spaceToken.source.length,
            text: ' ',
          });
          updated = true;
        }
      } else {
        const endTokens = value.end || [];
        const newlineToken = endTokens.find(t => t.type === 'newline');
        const spaceToken = newlineToken
          ? endTokens.find(
              t =>
                t.type === 'space' &&
                t.offset + t.source.length === newlineToken.offset,
            )
          : null;
        if (spaceToken) {
          edits.push({
            start: spaceToken.offset,
            end: spaceToken.offset + spaceToken.source.length,
            text: ` ${desiredComment}`,
          });
        } else {
          const insertAt = newlineToken
            ? newlineToken.offset
            : value.offset + value.source.length;
          edits.push({ start: insertAt, end: insertAt, text: ` ${desiredComment}` });
        }
        updated = true;
      }
    }
  });

  if (edits.length > 0) {
    const next = applyEdits(original, edits);
    writeFileSync(path, next);
    changed += 1;
  }
}

if (checkPins) {
  if (unpinned.length > 0) {
    console.error('Unpinned GitHub Actions found:');
    for (const entry of unpinned) console.error(`- ${entry}`);
    console.error('Run: node scripts/update-action-pins.mjs and commit results.');
    process.exitCode = 1;
  } else {
    console.log('All GitHub Actions are pinned to SHAs.');
  }
  process.exit(process.exitCode || 0);
}

if (report.length > 0) {
  const lines = [
    '# Action pin updates',
    '',
    `Mode: ${isMajor ? 'major' : 'patch/minor'}`,
    '',
  ];
  for (const entry of report) {
    const repoUrl = `https://github.com/${entry.repo}`;
    const compareUrl = `${repoUrl}/compare/${entry.oldSha}...${entry.newSha}`;
    const releaseUrl = `${repoUrl}/releases/tag/${entry.tag}`;
    const commitUrl = `${repoUrl}/commit/${entry.newSha}`;
    lines.push(`- ${entry.actionPath} (${entry.tag})`);
    lines.push(`  - Compare: ${compareUrl}`);
    lines.push(`  - Release: ${releaseUrl}`);
    lines.push(`  - Commit: ${commitUrl}`);
  }
  if (skipped.length > 0) {
    lines.push('');
    lines.push('## Skipped (age gate)');
    for (const entry of skipped) {
      lines.push(
        `- ${entry.actionPath} (${entry.tag}): ${entry.reason}`,
      );
    }
  }
  const reportText = `${lines.join('\n')}\n`;
  writeFileSync(resolvedReportPath, reportText);
} else {
  const lines = ['# Action pin updates', ''];
  if (skipped.length > 0) {
    lines.push('No changes detected.');
    lines.push('');
    lines.push('## Skipped (age gate)');
    for (const entry of skipped) {
      lines.push(
        `- ${entry.actionPath} (${entry.tag}): ${entry.reason}`,
      );
    }
  } else {
    lines.push('No changes detected.');
  }
  const reportText = `${lines.join('\n')}\n`;
  writeFileSync(resolvedReportPath, reportText);
}

if (changed === 0) {
  console.log('No workflow pins changed.');
} else {
  console.log(`Updated pins in ${changed} workflow file(s).`);
}
