const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RANGE = /^(.*?)\.{2,3}(.*)$/;

const git = (args, cwd) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

const repoRoot = (cwd) => git(["rev-parse", "--show-toplevel"], cwd).trim();

const diffText = (revisions, cwd, context) =>
  git(["diff", "--no-color", "--no-ext-diff", "-U" + context, ...revisions], cwd);

const headLabel = (cwd) => {
  try {
    return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd).trim();
  } catch {
    return "HEAD";
  }
};

const isCommit = (token, cwd) => {
  try {
    git(["rev-parse", "--verify", "--quiet", token + "^{commit}"], cwd);
    return true;
  } catch {
    return false;
  }
};

const beforePathspec = (revisions) => {
  const cut = revisions.indexOf("--");
  return cut === -1 ? revisions : revisions.slice(0, cut);
};

const newSideOf = (revisions, cwd) => {
  if (revisions.some((r) => r === "--staged" || r === "--cached")) return "";
  const revs = beforePathspec(revisions).filter((r) => !r.startsWith("-"));
  const ranged = revs.map((r) => RANGE.exec(r)).find(Boolean);
  if (ranged) return ranged[2] === "" ? "HEAD" : ranged[2];
  const last = revs[revs.length - 1];
  return revs.length > 1 && isCommit(last, cwd) ? last : null;
};

// A diff header is text, and text can say "../../elsewhere"; the working tree
// is the only place this is allowed to read from.
const insideRoot = (root, filePath) => {
  const full = path.resolve(root, filePath);
  return full === root || full.startsWith(root + path.sep);
};

const sourceOf = (rev, filePath, root) => {
  if (!insideRoot(root, filePath)) return null;
  try {
    return rev === null
      ? fs.readFileSync(path.join(root, filePath), "utf8")
      : git(["show", rev + ":" + filePath], root);
  } catch {
    return null;
  }
};

module.exports = { repoRoot, diffText, headLabel, newSideOf, sourceOf };
