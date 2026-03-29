#!/usr/bin/env node
// Usage:
//   node tools/github-get-pr.js --pr https://github.company.com/my-org/my-repo/pull/123
//   node tools/github-get-pr.js --owner my-org --repo my-repo --pull 123
//
// Optional:
//   --outDir output/custom-dir
//   --export-mode snapshot|full        (default: snapshot)
//   --snapshot-lines 25                (default: 25)
//   --full-snippet-lines 60            (default: 60)
//   --head-lines 80                    (default: 80)
//   --tail-lines 40                    (default: 40)
//   --max-embed-bytes 200000           (default: 200000)

const { argv, env, process } = require('process');
const fs = require('fs/promises');
const path = require('path');
const { loadToolEnv } = require('./tool-env');

/**
 * Print CLI usage and exit.
 */
function usage() {
  console.error(
    'Usage: github-get-pr.js --pr <pull_request_url>\n' +
    '   or: github-get-pr.js --owner <owner> --repo <repo> --pull <pull_number>\n' +
    'Optional:\n' +
    '   --outDir <output_dir>\n' +
    '   --export-mode <snapshot|full>\n' +
    '   --snapshot-lines <number>\n' +
    '   --full-snippet-lines <number>\n' +
    '   --head-lines <number>\n' +
    '   --tail-lines <number>\n' +
    '   --max-embed-bytes <number>'
  );
  process.exit(2);
}

/**
 * Parse CLI arguments in a simple --key value format.
 * Example:
 *   --repo my-repo --pull 123
 */
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

/**
 * Parse a GitHub PR URL and extract owner, repo, and pull number.
 * Example:
 *   https://github.company.com/my-org/my-repo/pull/123
 * becomes:
 *   { owner: 'my-org', repo: 'my-repo', pull: '123' }
 */
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

/**
 * Trim a patch string so manifest.json does not become too large.
 * This only affects the patch summary stored in the manifest.
 * Full file contents are still exported separately.
 */
function trimPatch(patch, maxLen) {
  if (!patch) return null;
  maxLen = maxLen || 12000;
  return patch.length > maxLen
    ? patch.slice(0, maxLen) + '\n...<truncated>'
    : patch;
}

/**
 * Normalize and validate a repo-relative file path before writing to disk.
 * This prevents path traversal such as ../../secret.txt.
 */
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

/**
 * Ensure the parent directory for a file path exists.
 */
async function ensureDirForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

/**
 * Write text content under a root directory using a repo-relative path.
 * Example:
 *   rootDir = output/github/pr_review/my-repo-pr-123/before
 *   relPath = src/app.js
 * writes:
 *   output/github/pr_review/my-repo-pr-123/before/src/app.js
 */
async function writeTextFile(rootDir, relPath, content) {
  const safeRelPath = sanitizeRelativeFilePath(relPath);
  const fullPath = path.join(rootDir, safeRelPath);
  await ensureDirForFile(fullPath);
  await fs.writeFile(fullPath, content, 'utf8');
  return fullPath;
}

/**
 * Ensure deletion is limited to output/github/pr_review only.
 * This prevents accidental deletion of unrelated directories.
 */
function ensureSafeOutputDir(outDir) {
  const normalized = path.resolve(outDir);
  const allowedRoot = path.resolve(path.join('output', 'github', 'pr_review'));

  if (
    normalized !== allowedRoot &&
    !normalized.startsWith(allowedRoot + path.sep)
  ) {
    throw new Error(`Refusing to delete unsafe output directory: ${outDir}`);
  }

  return normalized;
}

/**
 * Remove the existing output directory if present, then recreate it.
 * This prevents stale exports from mixing with the new run.
 */
async function resetOutputDir(outDir) {
  const safeDir = ensureSafeOutputDir(outDir);
  await fs.rm(safeDir, { recursive: true, force: true });
  await fs.mkdir(safeDir, { recursive: true });
}

/**
 * Perform a GitHub JSON API GET request and return parsed JSON.
 */
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

/**
 * Same as ghGet, but also return response headers.
 * This is useful for paginated endpoints because pagination info is in Link.
 */
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

/**
 * Parse the GitHub Link header and return the URL for rel="next", if any.
 * Example:
 *   <...page=2>; rel="next", <...page=3>; rel="last"
 */
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

/**
 * Fetch all pages from a paginated GitHub endpoint and return one combined array.
 * This is mainly needed for PR files because a PR may touch more than 100 files.
 */
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

/**
 * Perform a GitHub raw-content request and return the file as text.
 * Return null on 404 so callers can treat missing content gracefully.
 */
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

/**
 * Fetch file content from the GitHub contents API at a specific ref.
 * This is how we get the "before" and "after" file versions for a PR.
 */
async function fetchFileContent({ base, owner, repo, filePath, ref, token }) {
  const encodedPath = filePath
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  const url = `${base}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  return ghGetText(url, token);
}

/**
 * Decide whether a changed file status is supported for export/review.
 */
function shouldProcessFile(file) {
  return ['added', 'modified', 'removed', 'renamed'].includes(file.status);
}

/**
 * Parse diff hunk headers from a unified patch.
 * Example hunk header:
 *   @@ -42,7 +42,9 @@
 */
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

/**
 * Split text into lines.
 * Return an empty array when the input is null.
 */
function splitLinesPreserve(text) {
  return text == null ? [] : text.split('\n');
}

/**
 * Clamp a number into the inclusive [min, max] range.
 */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Slice text by 1-based line range.
 * endLine is treated in a way that matches Array.slice behavior after conversion.
 */
function sliceLines(text, startLine, endLine) {
  const lines = splitLinesPreserve(text);
  if (lines.length === 0) return '';

  const startIdx = clamp(startLine - 1, 0, lines.length);
  const endIdx = clamp(endLine, 0, lines.length);
  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * Return the last N lines from a text block.
 */
function sliceTailLines(text, lineCount) {
  const lines = splitLinesPreserve(text);
  if (lines.length === 0) return '';
  const start = Math.max(lines.length - lineCount, 0);
  return lines.slice(start).join('\n');
}

/**
 * Build token-efficient diff-hunk snippets for review.
 * For each patch hunk, include N surrounding lines from both before/after versions.
 */
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
      kind: 'diff_hunk',
      hunk_header: h.hunk_header,
      before_start: beforeStart,
      before_end: beforeEnd,
      after_start: afterStart,
      after_end: afterEnd,
      before_snippet: beforeStart == null ? null : sliceLines(beforeContent, beforeStart, beforeEnd),
      after_snippet: afterStart == null ? null : sliceLines(afterContent, afterStart, afterEnd),
    };
  });
}

/**
 * Add lightweight classification flags.
 * These help the review agent prioritize higher-value files.
 */
function guessFileFlags(filename) {
  const lower = filename.toLowerCase();

  return {
    is_test_file: /(^|\/)(test|tests|__tests__)\/|(\.test\.|\.(spec)\.)/.test(lower),
    is_lock_file: /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|cargo\.lock|composer\.lock|gemfile\.lock)$/i.test(lower),
    is_generated_file: /(^|\/)(dist|build|coverage|target|out|generated|node_modules)\//.test(lower),
    is_docs_file: /\.(md|txt|rst|adoc)$/i.test(lower),
  };
}

/**
 * Compute UTF-8 byte length of a string.
 */
function utf8ByteLength(text) {
  return text == null ? 0 : Buffer.byteLength(text, 'utf8');
}

/**
 * Decide whether the full before/after content should be embedded into manifest.json.
 * In full mode, only smaller and higher-value files are embedded.
 */
function shouldEmbedManifestContent({
  exportMode,
  fileFlags,
  beforeContent,
  afterContent,
  maxEmbedBytes,
}) {
  if (exportMode !== 'full') {
    return {
      embed: false,
      reason: 'export_mode_is_not_full',
    };
  }

  if (fileFlags.is_lock_file) {
    return {
      embed: false,
      reason: 'lock_file',
    };
  }

  if (fileFlags.is_generated_file) {
    return {
      embed: false,
      reason: 'generated_file',
    };
  }

  if (fileFlags.is_docs_file) {
    return {
      embed: false,
      reason: 'docs_file',
    };
  }

  const beforeBytes = utf8ByteLength(beforeContent);
  const afterBytes = utf8ByteLength(afterContent);
  const largest = Math.max(beforeBytes, afterBytes);

  if (largest > maxEmbedBytes) {
    return {
      embed: false,
      reason: `file_too_large_over_${maxEmbedBytes}_bytes`,
    };
  }

  return {
    embed: true,
    reason: null,
  };
}

/**
 * Decide whether fallback snippets should be generated.
 * Low-value files like lock/generated files can be excluded to reduce noise.
 */
function shouldUseSnippets(fileFlags) {
  if (fileFlags.is_lock_file) {
    return {
      use: false,
      reason: 'lock_file',
    };
  }

  if (fileFlags.is_generated_file) {
    return {
      use: false,
      reason: 'generated_file',
    };
  }

  return {
    use: true,
    reason: null,
  };
}

/**
 * Build richer snippets for manifest embedding when full-file embedding is skipped.
 * The snippet set includes:
 * - file head
 * - file tail
 * - expanded diff hunks
 */
function buildEmbeddedSnippets({
  patch,
  beforeContent,
  afterContent,
  snippetLines,
  headLines,
  tailLines,
}) {
  const snippets = [];

  if (beforeContent != null || afterContent != null) {
    snippets.push({
      kind: 'file_head',
      before_start: beforeContent == null ? null : 1,
      before_end: beforeContent == null ? null : Math.min(splitLinesPreserve(beforeContent).length, headLines),
      after_start: afterContent == null ? null : 1,
      after_end: afterContent == null ? null : Math.min(splitLinesPreserve(afterContent).length, headLines),
      before_snippet: beforeContent == null ? null : sliceLines(beforeContent, 1, headLines),
      after_snippet: afterContent == null ? null : sliceLines(afterContent, 1, headLines),
    });

    snippets.push({
      kind: 'file_tail',
      before_start: beforeContent == null
        ? null
        : Math.max(splitLinesPreserve(beforeContent).length - tailLines + 1, 1),
      before_end: beforeContent == null ? null : splitLinesPreserve(beforeContent).length,
      after_start: afterContent == null
        ? null
        : Math.max(splitLinesPreserve(afterContent).length - tailLines + 1, 1),
      after_end: afterContent == null ? null : splitLinesPreserve(afterContent).length,
      before_snippet: beforeContent == null ? null : sliceTailLines(beforeContent, tailLines),
      after_snippet: afterContent == null ? null : sliceTailLines(afterContent, tailLines),
    });
  }

  const diffSnippets = buildSnapshotHunks({
    patch,
    beforeContent,
    afterContent,
    snapshotLines: snippetLines,
  });

  snippets.push(...diffSnippets);

  return snippets;
}

/**
 * Export all changed PR files into:
 * - manifest.json
 * - before/ full file copies
 * - after/ full file copies
 *
 * Content strategy:
 * - full mode:
 *   small/high-value files -> embed full content in manifest
 *   larger files -> embed snippets instead
 * - snapshot mode:
 *   embed snippets only
 */
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
  fullSnippetLines,
  headLines,
  tailLines,
  maxEmbedBytes,
}) {
  const beforeRoot = path.join(outDir, 'before');
  const afterRoot = path.join(outDir, 'after');
  const manifestFiles = [];

  for (const file of files) {
    const status = file.status;
    const currentPath = file.filename;
    const previousPath = file.previous_filename || null;
    const fileFlags = guessFileFlags(currentPath);

    // For renamed files:
    // - before path uses previous_filename
    // - after path uses filename
    //
    // For added files:
    // - no before version exists
    //
    // For removed files:
    // - no after version exists
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

      // manifest_content_mode:
      // - full: full before/after content embedded
      // - snippets: snippet fallback embedded
      // - none: metadata only, no embedded content
      manifest_content_mode: 'none',
      before_content: null,
      after_content: null,
      embedded_snippets: [],
      manifest_content_embedded: false,
      manifest_content_skipped_reason: null,

      // snapshot_hunks is kept for backward compatibility and quick review access.
      snapshot_hunks: [],
      skipped_reason: null,
      ...fileFlags,
    };

    if (!shouldProcessFile(file)) {
      record.skipped_reason = `unsupported status: ${status}`;
      manifestFiles.push(record);
      continue;
    }

    try {
      let beforeContent = null;
      let afterContent = null;

      // Fetch the before version from the PR base commit SHA.
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

      // Fetch the after version from the PR head commit SHA.
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

      // Always build compact hunk snapshots when possible.
      if (record.patch && (beforeContent !== null || afterContent !== null)) {
        record.snapshot_hunks = buildSnapshotHunks({
          patch: record.patch,
          beforeContent,
          afterContent,
          snapshotLines,
        });
      }

      // Decide whether full content should be embedded directly into manifest.json.
      const embedDecision = shouldEmbedManifestContent({
        exportMode,
        fileFlags,
        beforeContent,
        afterContent,
        maxEmbedBytes,
      });

      if (embedDecision.embed) {
        record.before_content = beforeContent;
        record.after_content = afterContent;
        record.manifest_content_mode = 'full';
        record.manifest_content_embedded = true;
      } else {
        // If full embedding is skipped, optionally downgrade to snippets.
        const snippetDecision = shouldUseSnippets(fileFlags);

        if (snippetDecision.use) {
          const snippetLines = exportMode === 'full' ? fullSnippetLines : snapshotLines;

          record.embedded_snippets = buildEmbeddedSnippets({
            patch: record.patch,
            beforeContent,
            afterContent,
            snippetLines,
            headLines,
            tailLines,
          });

          record.manifest_content_mode = 'snippets';
          record.manifest_content_skipped_reason = embedDecision.reason;
        } else {
          record.manifest_content_mode = 'none';
          record.manifest_content_skipped_reason = snippetDecision.reason || embedDecision.reason;
        }
      }

      // Export the full before file to disk for manual QA and fallback reading.
      if (beforePathInRepo && beforeContent !== null) {
        const savedPath = await writeTextFile(beforeRoot, beforePathInRepo, beforeContent);
        record.before_exported = path.relative(outDir, savedPath).replace(/\\/g, '/');
      }

      // Export the full after file to disk for manual QA and fallback reading.
      if (afterPathInRepo && afterContent !== null) {
        const savedPath = await writeTextFile(afterRoot, afterPathInRepo, afterContent);
        record.after_exported = path.relative(outDir, savedPath).replace(/\\/g, '/');
      }

      // Mark as skipped only when nothing useful could be fetched or built.
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

  const fullCount = manifestFiles.filter((f) => f.manifest_content_mode === 'full').length;
  const snippetCount = manifestFiles.filter((f) => f.manifest_content_mode === 'snippets').length;
  const noneCount = manifestFiles.filter((f) => f.manifest_content_mode === 'none').length;

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
    full_snippet_lines: fullSnippetLines,
    head_lines: headLines,
    tail_lines: tailLines,
    max_embed_bytes: maxEmbedBytes,
    full_files_exported: true,
    manifest_content_summary: {
      full: fullCount,
      snippets: snippetCount,
      none: noneCount,
    },
    files: manifestFiles,
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return manifest;
}

/**
 * Main entry point.
 * Responsibilities:
 * - load environment
 * - parse CLI args
 * - validate options
 * - fetch PR metadata and files
 * - export results
 * - print machine-readable summary
 */
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

  // If a PR URL is provided, derive owner/repo/pull from it.
  if (args.pr) {
    const parsed = parsePrUrl(args.pr);
    owner = parsed.owner;
    repo = parsed.repo;
    pull = parsed.pull;
  }

  if (!owner || !repo || !pull) usage();

  const exportMode = args['export-mode'] || 'snapshot';
  const snapshotLines = Number(args['snapshot-lines'] || 25);
  const fullSnippetLines = Number(args['full-snippet-lines'] || 60);
  const headLines = Number(args['head-lines'] || 80);
  const tailLines = Number(args['tail-lines'] || 40);
  const maxEmbedBytes = Number(args['max-embed-bytes'] || 200000);

  if (!['snapshot', 'full'].includes(exportMode)) {
    console.error(`Invalid --export-mode: ${exportMode}`);
    process.exit(2);
  }

  if (!Number.isInteger(snapshotLines) || snapshotLines < 0 || snapshotLines > 200) {
    console.error(`Invalid --snapshot-lines: ${snapshotLines}`);
    process.exit(2);
  }

  if (!Number.isInteger(fullSnippetLines) || fullSnippetLines < 0 || fullSnippetLines > 400) {
    console.error(`Invalid --full-snippet-lines: ${fullSnippetLines}`);
    process.exit(2);
  }

  if (!Number.isInteger(headLines) || headLines < 0 || headLines > 400) {
    console.error(`Invalid --head-lines: ${headLines}`);
    process.exit(2);
  }

  if (!Number.isInteger(tailLines) || tailLines < 0 || tailLines > 400) {
    console.error(`Invalid --tail-lines: ${tailLines}`);
    process.exit(2);
  }

  if (!Number.isInteger(maxEmbedBytes) || maxEmbedBytes < 0) {
    console.error(`Invalid --max-embed-bytes: ${maxEmbedBytes}`);
    process.exit(2);
  }

  // Default output location:
  // output/github/pr_review/<repo>-pr-<pull>/
  const outDir =
    args.outDir || path.join('output', 'github', 'pr_review', `${repo}-pr-${pull}`);

  try {
    // Clear old output first so the export stays deterministic.
    await resetOutputDir(outDir);

    const prUrl = `${base}/repos/${owner}/${repo}/pulls/${pull}`;
    const filesUrl = `${base}/repos/${owner}/${repo}/pulls/${pull}/files?per_page=100`;

    // Fetch PR metadata and all changed files in parallel.
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
      fullSnippetLines,
      headLines,
      tailLines,
      maxEmbedBytes,
    });

    // Print a compact machine-readable summary for callers/agents.
    console.log(JSON.stringify({
      ok: true,
      outDir,
      manifest: path.join(outDir, 'manifest.json').replace(/\\/g, '/'),
      export_mode: exportMode,
      snapshot_lines: snapshotLines,
      full_snippet_lines: fullSnippetLines,
      head_lines: headLines,
      tail_lines: tailLines,
      max_embed_bytes: maxEmbedBytes,
      full_files_exported: true,
      manifest_content_summary: manifest.manifest_content_summary,
      exported_files: manifest.files.length,
    }, null, 2));
  } catch (e) {
    console.error('Request error', e && e.message ? e.message : e);
    process.exit(4);
  }
}

main();
