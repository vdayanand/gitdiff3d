#!/usr/bin/env node
const { execFile } = require("node:child_process");
const { repoRoot, diffText, headLabel, newSideOf, sourceOf } = require("../src/git");
const { parseDiff } = require("../src/parse-diff");
const { buildScene } = require("../src/layout");
const { serve } = require("../src/server");

const USAGE = `usage: gitdiff3d [<revs>] [-- <path>...] [options]

  gitdiff3d                    working tree vs HEAD
  gitdiff3d --staged           the index
  gitdiff3d HEAD~3..HEAD       a commit range
  gitdiff3d main HEAD          two revisions
  gitdiff3d -- src/            limit to a path

options:
  --port <n>   listen on port n (default: random)
  --json       print the scene model, do not serve
  --no-open    serve without opening a browser
  -h, --help   this message`;

function readArgs(argv) {
  const flags = { port: 0, json: false, open: true };
  const revisions = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") flags.port = Number(argv[(i += 1)]);
    else if (arg === "--json") flags.json = true;
    else if (arg === "--no-open") flags.open = false;
    else if (arg === "-h" || arg === "--help") flags.help = true;
    else revisions.push(arg);
  }
  return { flags, revisions };
}

const describe = (revisions, cwd) =>
  revisions.length ? revisions.join(" ") : "working tree vs " + headLabel(cwd);

async function main() {
  const { flags, revisions } = readArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(USAGE);
    return;
  }
  const cwd = process.cwd();
  const root = repoRoot(cwd);
  const diff = parseDiff(diffText(revisions, root));
  const newSide = newSideOf(revisions, root);
  const sources = Object.fromEntries(
    diff.files.map((file) => [file.path, sourceOf(newSide, file.path, root)]),
  );
  const scene = buildScene(diff, { root, label: describe(revisions, root) }, sources);

  if (flags.json) {
    console.log(JSON.stringify(scene, null, 2));
    return;
  }
  if (scene.totals.files === 0) {
    console.error("no textual changes to show");
    process.exitCode = 1;
    return;
  }
  const port = await serve(scene, flags.port);
  const url = "http://127.0.0.1:" + port + "/";
  console.log(scene.totals.files + " files, " + scene.totals.hunks + " hunks, +" +
    scene.totals.additions + " -" + scene.totals.deletions + "  ->  " + url);
  console.log("keys: space pause, b rewind, r replay, arrows hunk, a autoplay");
  if (flags.open) execFile("open", [url]);
}

main().catch((err) => {
  console.error("gitdiff3d: " + (err.stderr || err.message).toString().trim());
  process.exit(1);
});
