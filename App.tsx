#!/usr/bin/env node
// Usage:
//   node tools/github-get-pr.js --pr https://github.company.com/my-org/my-repo/pull/123
//   node tools/github-get-pr.js --owner my-org --repo my-repo --pull 123

const process = require('process');
const { loadToolEnv } = require('./tool-env');

function usage() {
  console.error(
    'Usage: github-get-pr.js --pr <pull_request_url>\n' +
    '   or: github-get-pr.js --owner <owner> --repo <repo> --pull <pull_number>'
  );
  process.exit(2);
}

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v =
        process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
          ? process.argv[++i]
          : 'true';
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

async function ghGet(url, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub request failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function main() {
  loadToolEnv(process.argv);

  const args = parseArgs();

  const base = process.env.GITHUB_API_BASE;
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_API_TOKEN;

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

  try {
    const prUrl = `${base}/repos/${owner}/${repo}/pulls/${pull}`;
    const filesUrl = `${base}/repos/${owner}/${repo}/pulls/${pull}/files?per_page=100`;

    const [pr, files] = await Promise.all([
      ghGet(prUrl, token),
      ghGet(filesUrl, token),
    ]);

    const body = {
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
        base: pr.base && pr.base.ref,
        head: pr.head && pr.head.ref,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
        commits: pr.commits,
        html_url: pr.html_url,
      },
      files: files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: trimPatch(f.patch),
      })),
    };

    console.log(JSON.stringify(body, null, 2));
  } catch (e) {
    console.error('Request error', e && e.message ? e.message : e);
    process.exit(4);
  }
}





------------------
  #!/usr/bin/env node
// Usage:
//   node tools/github-get-pr.js --pr https://github.company.com/my-org/my-repo/pull/123
//   node tools/github-get-pr.js --owner my-org --repo my-repo --pull 123

const { argv, env, process } = require('process');
const { loadToolEnv } = require('./tool-env');

function usage() {
  console.error(
    'Usage: github-get-pr.js --pr <pull_request_url>\n' +
    '   or: github-get-pr.js --owner <owner> --repo <repo> --pull <pull_number>'
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

async function ghGet(url, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub request failed: ${res.status} ${text}`);
  }

  return res.json();
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

  try {
    const prUrl = `${base}/repos/${owner}/${repo}/pulls/${pull}`;
    const filesUrl = `${base}/repos/${owner}/${repo}/pulls/${pull}/files?per_page=100`;

    const [pr, files] = await Promise.all([
      ghGet(prUrl, token),
      ghGet(filesUrl, token),
    ]);

    const body = {
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
        base: pr.base && pr.base.ref,
        head: pr.head && pr.head.ref,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
        commits: pr.commits,
        html_url: pr.html_url,
      },
      files: files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: trimPatch(f.patch),
      })),
    };

    console.log(JSON.stringify(body, null, 2));
  } catch (e) {
    console.error('Request error', e && e.message ? e.message : e);
    process.exit(4);
  }
}

main();

main();
