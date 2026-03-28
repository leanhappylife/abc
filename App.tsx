#!/usr/bin/env node
import fs from "fs";
import path from "path";
import "dotenv/config";

const base = process.env.GITHUB_API_BASE;
const token = process.env.GITHUB_TOKEN;

function parsePrInput(args) {
  if (args.length === 1) {
    const raw = args[0];

    try {
      const url = new URL(raw);
      const parts = url.pathname.split("/").filter(Boolean);

      // 兼容:
      // /owner/repo/pull/123
      // /some-prefix/owner/repo/pull/123 这种不建议，但这里先按标准路径处理
      const pullIndex = parts.findIndex((p) => p === "pull");

      if (pullIndex >= 2 && parts[pullIndex + 1]) {
        const owner = parts[pullIndex - 2];
        const repo = parts[pullIndex - 1];
        const pullNumber = parts[pullIndex + 1];
        return { owner, repo, pullNumber };
      }

      throw new Error("Not a valid pull request URL");
    } catch (e) {
      throw new Error(`Invalid PR URL: ${raw}`);
    }
  }

  if (args.length === 3) {
    const [owner, repo, pullNumber] = args;
    return { owner, repo, pullNumber };
  }

  throw new Error(
    "Usage:\n" +
      "  node tools/github-pr-review-input.js <owner> <repo> <pull_number>\n" +
      "  or\n" +
      "  node tools/github-pr-review-input.js <pull_request_url>"
  );
}

async function ghGet(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

function trimPatch(patch, maxLen = 12000) {
  if (!patch) return null;
  return patch.length > maxLen
    ? patch.slice(0, maxLen) + "\n...<truncated>"
    : patch;
}

async function main() {
  if (!base || !token) {
    console.error("Missing GITHUB_API_BASE or GITHUB_TOKEN");
    process.exit(1);
  }

  const { owner, repo, pullNumber } = parsePrInput(process.argv.slice(2));

  const prUrl = `${base}/repos/${owner}/${repo}/pulls/${pullNumber}`;
  const filesUrl = `${base}/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`;

  const [pr, files] = await Promise.all([
    ghGet(prUrl),
    ghGet(filesUrl),
  ]);

  const reviewInput = {
    repo: { owner, repo },
    pr: {
      number: pr.number,
      title: pr.title,
      body: pr.body || "",
      state: pr.state,
      base: pr.base?.ref,
      head: pr.head?.ref,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
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

  fs.mkdirSync("out", { recursive: true });
  const outPath = path.join("out", `pr-${pullNumber}-review-input.json`);
  fs.writeFileSync(outPath, JSON.stringify(reviewInput, null, 2), "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});


node tools/review-pr.js https://github.company.com/my-org/my-repo/pull/123
