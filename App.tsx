#!/usr/bin/env node
// Usage:
//   node tools/github-get-pr.js --pr https://github.company.com/my-org/my-repo/pull/123
//   node tools/github-get-pr.js --owner my-org --repo my-repo --pull 123
//
// Optional:
//   --outDir output/custom-dir
//   --export-mode snapshot|full   (default: snapshot)
//   --snapshot-lines 25           (default: 25)

const { argv, env, process } = require('process');
const fs = require('fs/promises');
const path = require('path');
const { loadToolEnv } = require('./tool-env');

function usage() {
  console.error(
    'Usage: github-get-pr.js --pr <pull_request_url>\n' +
    '   or: github-get-pr.js --owner <owner> --repo <repo> --pull <pull_number>\n' +
    'Optional:\n' +
    '   --outDir <output_dir>\n' +
    '   --export-mode <snapshot|full>\n' +
    '   --snapshot-lines <number>'
  );
  process.exit(2);
}

function parseArgs() {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[k] = v;
    }
  }
  return args;
}

function parsePrUrl(prUrl) {
  try {
    const url = new URL(prUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    const pullIndex = parts.findIndex((p) => p === 'pull');

    if (pullIndex < 2 || !parts[pullIndex + 1]) {
      throw new Error('Not a valid PR URL');
    }

    return {
      owner: parts[pullIndex - 2],
      repo: parts[pullIndex - 1],
      pull: parts[pullIndex + 1],
    };
  } catch (e) {
    throw new Error(`Invalid PR URL: ${prUrl}`);
  }
}

function trimPatch(patch, maxLen) {
  if (!patch) return null;
  maxLen = maxLen || 12000;
  return patch.length > maxLen
    ? patch.slice(0, maxLen) + '\n...<truncated>'
    : patch;
}

function sanitizeRelativeFilePath(p) {
  if (!p || typeof p !== 'string') {
    throw new Error(`Invalid file path: ${p}`);
  }

  const normalized = p.replace(/\\/g, '/').replace(/^\/+/, '');
  if (
    normalized === '' ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Unsafe file path: ${p}`);
  }
  return normalized;
}

async function ensureDirForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeTextFile(rootDir, relPath, content) {
  const safeRelPath = sanitizeRelativeFilePath(relPath);
  const fullPath = path.join(rootDir, safeRelPath);
  await ensureDirForFile(fullPath);
  await fs.writeFile(fullPath, content, 'utf8');
  return fullPath;
}

async function ghGet(url, token, extraHeaders = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    ...extraHeaders,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub request failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function ghGetWithHeaders(url, token, extraHeaders = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    ...extraHeaders,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub request failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    data,
    headers: res.headers,
  };
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;

  const parts = linkHeader.split(',');
  for (const part of parts) {
    const section = part.trim();
    const match = section.match(/^<([^>]+)>\s*;\s*rel="([^"]+)"$/);
    if (match && match[2] === 'next') {
      return match[1];
    }
  }
  return null;
}

async function ghGetAllPages(url, token) {
  const all = [];
  let nextUrl = url;
  let pageCount = 0;
  const maxPages = 100;

  while (nextUrl) {
    pageCount += 1;
    if (pageCount > maxPages) {
      throw new Error(`Too many pages when fetching GitHub data, exceeded ${maxPages}`);
    }

    const { data, headers } = await ghGetWithHeaders(nextUrl, token);

    if (!Array.isArray(data)) {
      throw new Error('Expected paginated GitHub API response to be an array');
    }

    all.push(...data);
    nextUrl = parseNextLink(headers.get('link'));
  }

  return all;
}

async function ghGetText(url, token, extraHeaders = {}) {
  const headers = {
    Accept: 'application/vnd.github.raw',
    ...extraHeaders,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub raw request failed: ${res.status} ${text}`);
  }

  return res.text();
}

async function fetchFileContent({ base, owner, repo, filePath, ref, token }) {
  const encodedPath = filePath
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  const url = `${base}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  return ghGetText(url, token);
}

function shouldProcessFile(file) {
  return ['added', 'modified', 'removed', 'renamed'].includes(file.status);
}

function parsePatchHunks(patch) {
  if (!patch) return [];

  const lines = patch.split('\n');
  const hunks = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (m) {
      if (current) hunks.push(current);
      current = {
        hunk_header: line,
        before_line: Number(m[1]),
        before_count: m[2] ? Number(m[2]) : 1,
        after_line: Number(m[3]),
        after_count: m[4] ? Number(m[4]) : 1,
      };
    }
  }

  if (current) hunks.push(current);
  return hunks;
}

function splitLinesPreserve(text) {
  return text == null ? [] : text.split('\n');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function sliceLines(text, startLine, endLine) {
  const lines = splitLinesPreserve(text);
  if (lines.length === 0) return '';

  const startIdx = clamp(startLine - 1, 0, lines.length);
  const endIdx = clamp(endLine, 0, lines.length);
  return lines.slice(startIdx, endIdx).join('\n');
}

function buildSnapshotHunks({
  patch,
  beforeContent,
  afterContent,
  snapshotLines,
}) {
  const hunks = parsePatchHunks(patch);
  const beforeTotal = splitLinesPreserve(beforeContent).length;
  const afterTotal = splitLinesPreserve(afterContent).length;

  return hunks.map((h) => {
    const beforeCount = Math.max(h.before_count, 1);
    const afterCount = Math.max(h.after_count, 1);

    const beforeStart = beforeTotal === 0
      ? null
      : clamp(h.before_line - snapshotLines, 1, Math.max(beforeTotal, 1));
    const beforeEnd = beforeTotal === 0
      ? null
      : clamp(h.before_line + beforeCount - 1 + snapshotLines, 1, Math.max(beforeTotal, 1));

    const afterStart = afterTotal === 0
      ? null
      : clamp(h.after_line - snapshotLines, 1, Math.max(afterTotal, 1));
    const afterEnd = afterTotal === 0
      ? null
      : clamp(h.after_line + afterCount - 1 + snapshotLines, 1, Math.max(afterTotal, 1));

    return {
      hunk_header: h.hunk_header,
      before_start: beforeStart,
      before_end: beforeEnd,
      after_start: afterStart,
      after_end: afterEnd,
      before_snapshot: beforeStart == null ? null : sliceLines(beforeContent, beforeStart, beforeEnd),
      after_snapshot: afterStart == null ? null : sliceLines(afterContent, afterStart, afterEnd),
    };
  });
}

function guessFileFlags(filename) {
  const lower = filename.toLowerCase();

  return {
    is_test_file: /(^|\/)(test|tests|__tests__)\/|(\.test\.|\.(spec)\.)/.test(lower),
    is_lock_file: /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(lower),
    is_generated_file: /(^|\/)(dist|build|coverage)\//.test(lower),
    is_docs_file: /\.(md|txt|rst)$/.test(lower),
  };
}

async function exportChangedFiles({
  base,
  owner,
  repo,
  pr,
  files,
  token,
  outDir,
  exportMode,
  snapshotLines,
}) {
  const beforeRoot = path.join(outDir, 'before');
  const afterRoot = path.join(outDir, 'after');
  const manifestFiles = [];

  for (const file of files) {
    const status = file.status;
    const currentPath = file.filename;
    const previousPath = file.previous_filename || null;

    const beforePathInRepo =
      status === 'renamed'
        ? previousPath
        : (status === 'added' ? null : currentPath);

    const afterPathInRepo =
      status === 'removed'
        ? null
        : currentPath;

    const record = {
      filename: currentPath,
      previous_filename: previousPath,
      status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: trimPatch(file.patch),
      before_ref: pr.base.sha,
      after_ref: pr.head.sha,
      before_repo_path: beforePathInRepo,
      after_repo_path: afterPathInRepo,
      before_exported: null,
      after_exported: null,
      snapshot_hunks: [],
      skipped_reason: null,
      ...guessFileFlags(currentPath),
    };

    if (!shouldProcessFile(file)) {
      record.skipped_reason = `unsupported status: ${status}`;
      manifestFiles.push(record);
      continue;
    }

    try {
      let beforeContent = null;
      let afterContent = null;

      if (beforePathInRepo) {
        beforeContent = await fetchFileContent({
          base,
          owner,
          repo,
          filePath: beforePathInRepo,
          ref: pr.base.sha,
          token,
        });
      }

      if (afterPathInRepo) {
        afterContent = await fetchFileContent({
          base,
          owner,
          repo,
          filePath: afterPathInRepo,
          ref: pr.head.sha,
          token,
        });
      }

      if (record.patch && (beforeContent !== null || afterContent !== null)) {
        record.snapshot_hunks = buildSnapshotHunks({
          patch: record.patch,
          beforeContent,
          afterContent,
          snapshotLines,
        });
      }

      if (exportMode === 'full') {
        if (beforePathInRepo && beforeContent !== null) {
          const savedPath = await writeTextFile(beforeRoot, beforePathInRepo, beforeContent);
          record.before_exported = path.relative(outDir, savedPath).replace(/\\/g, '/');
        }

        if (afterPathInRepo && afterContent !== null) {
          const savedPath = await writeTextFile(afterRoot, afterPathInRepo, afterContent);
          record.after_exported = path.relative(outDir, savedPath).replace(/\\/g, '/');
        }
      }

      if (
        beforeContent === null &&
        afterContent === null &&
        (!record.snapshot_hunks || record.snapshot_hunks.length === 0)
      ) {
        record.skipped_reason = 'content not available or non-text/binary file';
      }
    } catch (e) {
      record.skipped_reason = e && e.message ? e.message : String(e);
    }

    manifestFiles.push(record);
  }

  const manifest = {
    repo: {
      owner,
      repo,
    },
    pr: {
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      state: pr.state,
      user: pr.user && pr.user.login,
      base: {
        ref: pr.base && pr.base.ref,
        sha: pr.base && pr.base.sha,
      },
      head: {
        ref: pr.head && pr.head.ref,
        sha: pr.head && pr.head.sha,
      },
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      commits: pr.commits,
      html_url: pr.html_url,
    },
    export_mode: exportMode,
    snapshot_lines: snapshotLines,
    files: manifestFiles,
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return manifest;
}

async function main() {
  loadToolEnv(argv);

  const args = parseArgs();

  const base = env.GITHUB_API_BASE;
  const token = env.GITHUB_TOKEN || env.GITHUB_API_TOKEN;

  if (!base) {
    console.error('Missing GITHUB_API_BASE');
    process.exit(3);
  }

  let owner = args.owner;
  let repo = args.repo;
  let pull = args.pull;

  if (args.pr) {
    const parsed = parsePrUrl(args.pr);
    owner = parsed.owner;
    repo = parsed.repo;
    pull = parsed.pull;
  }

  if (!owner || !repo || !pull) usage();

  const exportMode = args['export-mode'] || 'snapshot';
  const snapshotLines = Number(args['snapshot-lines'] || 25);

  if (!['snapshot', 'full'].includes(exportMode)) {
    console.error(`Invalid --export-mode: ${exportMode}`);
    process.exit(2);
  }

  if (!Number.isInteger(snapshotLines) || snapshotLines < 0 || snapshotLines > 200) {
    console.error(`Invalid --snapshot-lines: ${snapshotLines}`);
    process.exit(2);
  }

  const outDir = args.outDir || path.join('output', `${repo}-pr-${pull}`);

  try {
    const prUrl = `${base}/repos/${owner}/${repo}/pulls/${pull}`;
    const filesUrl = `${base}/repos/${owner}/${repo}/pulls/${pull}/files?per_page=100`;

    const [pr, files] = await Promise.all([
      ghGet(prUrl, token),
      ghGetAllPages(filesUrl, token),
    ]);

    const manifest = await exportChangedFiles({
      base,
      owner,
      repo,
      pr,
      files,
      token,
      outDir,
      exportMode,
      snapshotLines,
    });

    console.log(JSON.stringify({
      ok: true,
      outDir,
      manifest: path.join(outDir, 'manifest.json').replace(/\\/g, '/'),
      export_mode: exportMode,
      snapshot_lines: snapshotLines,
      exported_files: manifest.files.length,
    }, null, 2));
  } catch (e) {
    console.error('Request error', e && e.message ? e.message : e);
    process.exit(4);
  }
}

main();

node --check tools/github-get-pr.js

node tools/github-get-pr.js --pr "https://github.company.com/my-org/my-repo/pull/123"
node tools/github-get-pr.js --pr "https://github.company.com/my-org/my-repo/pull/123" --export-mode full
