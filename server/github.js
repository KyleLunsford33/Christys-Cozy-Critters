"use strict";

/**
 * Tiny wrapper around the GitHub Contents API.
 *
 * This is how the admin service "saves" changes: it reads and writes files
 * (products.json and uploaded photos) directly in your GitHub repo. Pushing to
 * the repo makes the Render static site rebuild, so the public site updates.
 *
 * Required environment variables:
 *   GITHUB_TOKEN   a fine-grained token with Contents: Read and write on the repo
 *   GITHUB_OWNER   the GitHub username or org that owns the repo
 *   GITHUB_REPO    the repository name
 *   GITHUB_BRANCH  the branch to commit to (defaults to "main")
 */

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;

function assertConfigured() {
  if (!OWNER || !REPO || !TOKEN) {
    throw new Error(
      "GitHub storage is not configured. Set GITHUB_OWNER, GITHUB_REPO, and GITHUB_TOKEN."
    );
  }
}

function apiUrl(path) {
  return (
    "https://api.github.com/repos/" +
    encodeURIComponent(OWNER) +
    "/" +
    encodeURIComponent(REPO) +
    "/contents/" +
    path
      .split("/")
      .map(encodeURIComponent)
      .join("/")
  );
}

function headers() {
  return {
    Authorization: "Bearer " + TOKEN,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "christys-cozy-critters-admin",
  };
}

/**
 * Read a file. Returns { content: <string>, sha: <string> } or null if missing.
 */
async function getFile(path) {
  assertConfigured();
  const res = await fetch(apiUrl(path) + "?ref=" + encodeURIComponent(BRANCH), {
    headers: headers(),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error("GitHub read failed (" + res.status + "): " + (await res.text()));
  }
  const data = await res.json();
  const content = Buffer.from(data.content || "", "base64").toString("utf8");
  return { content: content, sha: data.sha };
}

/**
 * Read a file as raw bytes. Returns { buffer: <Buffer>, sha } or null if missing.
 */
async function getFileBuffer(path) {
  assertConfigured();
  const res = await fetch(apiUrl(path) + "?ref=" + encodeURIComponent(BRANCH), {
    headers: headers(),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error("GitHub read failed (" + res.status + "): " + (await res.text()));
  }
  const data = await res.json();
  return { buffer: Buffer.from(data.content || "", "base64"), sha: data.sha };
}

/**
 * Create or update a file with a Buffer or string of contents.
 */
async function putFile(path, contents, message, sha) {
  assertConfigured();
  const body = {
    message: message,
    content: Buffer.from(contents).toString("base64"),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl(path), {
    method: "PUT",
    headers: Object.assign({ "Content-Type": "application/json" }, headers()),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error("GitHub write failed (" + res.status + "): " + (await res.text()));
  }
  return res.json();
}

module.exports = {
  isConfigured: function () {
    return Boolean(OWNER && REPO && TOKEN);
  },
  branch: BRANCH,
  getFile: getFile,
  getFileBuffer: getFileBuffer,
  putFile: putFile,
};
