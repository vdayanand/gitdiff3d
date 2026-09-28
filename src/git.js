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

// The commits a diff spans, when its revisions name any: "a..b", "a...b" and
// "a b" all show what b added, and "a..b" is how log says that ("a...b" to log
// would also list a's side). A lone "a" is the working tree against a, which
// holds whatever was committed since. The index has no messages.
const rangeOf = (revs, cwd) => {
  const ranged = revs.find((r) => RANGE.test(r));
  if (ranged) return ranged.replace("...", "..");
  if (revs.length === 2 && revs.every((r) => isCommit(r, cwd))) return revs.join("..");
  if (revs.length === 1 && isCommit(revs[0], cwd)) return revs[0] + "..HEAD";
  return null;
};

const commitMessages = (revisions, cwd) => {
  if (revisions.some((r) => r === "--staged" || r === "--cached")) return "";
  const revs = beforePathspec(revisions).filter((r) => !r.startsWith("-"));
  const range = rangeOf(revs, cwd);
  if (!range) return "";
  const cut = revisions.indexOf("--");
  const paths = cut === -1 ? [] : revisions.slice(cut);
  try {
    return git(["log", "--no-color", "--format=%B%n---", range, ...paths], cwd);
  } catch {
    return "";
  }
};

// A diff header is text, and text can say "../../elsewhere"; the working tree
// is the only place this is allowed to read from. Both sides are resolved
// because git reports the root with forward slashes even on Windows.
const insideRoot = (root, filePath) => {
  const base = path.resolve(root);
  const full = path.resolve(base, filePath);
  return full === base || full.startsWith(base + path.sep);
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

module.exports = { repoRoot, diffText, headLabel, newSideOf, sourceOf, commitMessages };
