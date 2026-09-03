#!/usr/bin/env node
const { execFile } = require("node:child_process");
const { repoRoot, diffText, headLabel, newSideOf, sourceOf } = require("../src/git");
const { parseDiff } = require("../src/parse-diff");
const { buildScene } = require("../src/layout");
const { orderHunks } = require("../src/order");
const { serve } = require("../src/server");

const USAGE = `usage: gitdiff3d [<revs>] [-- <path>...] [options]

  gitdiff3d                    working tree vs HEAD
  gitdiff3d --staged           the index
  gitdiff3d HEAD~3..HEAD       a commit range
  gitdiff3d main HEAD          two revisions
  gitdiff3d -- src/            limit to a path

options:
  --port <n>   listen on port n (default: random)
  --max-hunks <n>  keep only the first n hunks (default: all)
  --order <how>    story (definitions before their callers, schema before docs)
                   or git (the order git prints them in). default: story
  --context <n>    lines of unchanged code around each hunk (default: 3)
  --json       print the scene model, do not serve
  --no-open    serve without opening a browser
  -h, --help   this message`;

function readArgs(argv) {
  const flags = { port: 0, json: false, open: true, maxHunks: 0, order: "story", context: 3 };
  const revisions = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") flags.port = Number(argv[(i += 1)]);
    else if (arg === "--max-hunks") flags.maxHunks = Number(argv[(i += 1)]);
    else if (arg === "--order") flags.order = argv[(i += 1)];
    else if (arg === "--context" || arg === "-U") flags.context = Number(argv[(i += 1)]);
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
  const newSide = newSideOf(revisions, root);
  const readSource = (filePath) => sourceOf(newSide, filePath, root);
  const label = describe(revisions, root);

  // The player can ask for a wider view of the surrounding code, which means
  // re-running the diff; each width is built once and kept.
  const built = new Map();
  const sceneFor = (context) => {
    const lines = context === null ? flags.context : context;
    if (!built.has(lines)) {
      const diff = parseDiff(diffText(revisions, root, lines));
      built.set(lines, orderHunks(
        buildScene(diff, { root, label, context: lines }, readSource, flags.maxHunks),
        flags.order,
      ));
    }
    return built.get(lines);
  };
  const scene = sceneFor(null);

  if (flags.json) {
    console.log(JSON.stringify(scene, null, 2));
    return;
  }
  if (scene.totals.files === 0) {
    console.error("no textual changes to show");
    process.exitCode = 1;
    return;
  }
  const port = await serve(sceneFor, flags.port);
  const url = "http://127.0.0.1:" + port + "/";
  console.log(scene.totals.files + " files, " + scene.totals.shown + " of " +
    scene.totals.hunks + " hunks, +" +
    scene.totals.additions + " -" + scene.totals.deletions + "  ->  " + url);
  console.log("keys: space pause, , . keystroke, < > line, b rewind, arrows hunk, x/X speed, a autoplay");
  if (flags.open) execFile("open", [url]);
}

main().catch((err) => {
  console.error("gitdiff3d: " + (err.stderr || err.message).toString().trim());
  process.exit(1);
});
