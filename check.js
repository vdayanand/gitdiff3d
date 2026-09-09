// What has to be true on every platform we claim to run on: the modules load,
// a real repository produces a scene with symbols in it, a file with windows
// line endings does not smuggle a carriage return into the plates, and the
// viewer is actually served.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const CLI = path.join(__dirname, "bin", "gitdiff3d.js");

const fail = (what) => {
  console.error("FAIL " + what);
  process.exit(1);
};

const ok = (condition, what) => (condition ? console.log("ok   " + what) : fail(what));

const git = (args, cwd) =>
  execFileSync("git", ["-c", "user.email=check@example.com", "-c", "user.name=check", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const sceneOf = (cwd, args = []) =>
  JSON.parse(execFileSync(process.execPath, [CLI, ...args, "--json"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }));

const get = (port, route) =>
  new Promise((resolve) =>
    http.get({ host: "127.0.0.1", port, path: route }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }),
  );

function repoWith(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitdiff3d-"));
  git(["init", "-q", "."], root);
  git(["config", "core.autocrlf", "false"], root);
  Object.entries(files.before).forEach(([name, text]) =>
    fs.writeFileSync(path.join(root, name), text));
  git(["add", "-A"], root);
  git(["commit", "-qm", "base"], root);
  Object.entries(files.after).forEach(([name, text]) =>
    fs.writeFileSync(path.join(root, name), text));
  return root;
}

function modulesLoad() {
  ["parse-diff", "layout", "structure", "server", "git", "order", "replace"]
    .forEach((name) => require("./src/" + name));
  ok(true, "modules load");
  execFileSync(process.execPath, [CLI, "--help"], { stdio: "ignore" });
  ok(true, "cli responds");
}

// The symbol only appears if the new side of the file could be read, which is
// the whole of the path handling: this is the check that fails on windows when
// the root is compared with the wrong separator.
function scenesHaveSymbols() {
  const root = repoWith({
    before: { "a.js": "function alpha() {\n  return 1;\n}\n" },
    after: { "a.js": "function alpha() {\n  return 2;\n}\n" },
  });
  try {
    const scene = sceneOf(root);
    ok(scene.totals.files === 1, "one changed file");
    ok(scene.hunks.length === 1, "one hunk");
    ok(scene.files[0].language === "c-like", "language recognised");
    ok(scene.hunks[0].symbol === "alpha", "hunk named by its enclosing function");
    const edit = scene.hunks[0].rows.find((row) => row.span !== null);
    ok(edit !== undefined, "the scene ships the row that was edited in place");
    ok(scene.hunks[0].lines[edit.after].text.slice(...edit.span.after) === "2",
      "the span points at the character that changed");
    ok(!JSON.stringify(scene).includes(root), "scene carries no path from this machine");
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

// A rename inside a line is the whole point of the overlay: the span has to
// land on the word, cover it whole, and refuse to appear when the two lines
// have nothing left in common.
function spansFindTheChangedWords() {
  const { changedSpan, rowsOf } = require("./src/replace");
  const of = (before, after) => {
    const span = changedSpan(before, after);
    return span === null ? null
      : [before.slice(...span.before), after.slice(...span.after)];
  };

  ok(JSON.stringify(of("const a = bodyOf(x);", "const a = spanOf(x);"))
    === JSON.stringify(["bodyOf", "spanOf"]), "a renamed word is the span, whole");
  ok(JSON.stringify(of("const bodyOf = 1;", "const bodySpan = 1;"))
    === JSON.stringify(["bodyOf", "bodySpan"]),
    "a shared prefix running into a word does not leave half of it behind");
  ok(JSON.stringify(of("send(payload);", "sendAll(payload);"))
    === JSON.stringify(["send", "sendAll"]), "a suffix added to a name takes the whole name");
  ok(JSON.stringify(of("if (a > b) {", "if (a >= b) {"))
    === JSON.stringify(["", "="]), "tightening an operator is one character arriving");
  ok(JSON.stringify(of("f(a, b);", "f(a, b, c);"))
    === JSON.stringify(["", ", c"]), "an insertion leaves the before side empty");
  ok(changedSpan("return items.filter(ok);", "throw new Error('gone');") === null,
    "a rewrite has no span");
  ok(changedSpan("same();", "same();") === null, "identical lines have no span");

  const spanStartsTogether = changedSpan("aaa bodyOf bbb", "aaa spanOf bbb");
  ok(spanStartsTogether.before[0] === spanStartsTogether.after[0],
    "both sides of a span start at the same column, so they line up in depth");

  // an insertion sitting between two edits: pairing by position would marry
  // the second removal to the new line and lose both spans
  const lines = [
    { kind: "del", text: "  const a = one(x);" },
    { kind: "del", text: "  const b = two(x);" },
    { kind: "add", text: "  const a = ONE(x);" },
    { kind: "add", text: "  const fresh = brand(x);" },
    { kind: "add", text: "  const b = TWO(x);" },
  ];
  const rows = rowsOf(lines);
  ok(rows.length === 3, "five lines fold into three rows");
  ok(rows[0].before === 0 && rows[0].after === 2 && rows[0].span !== null, "first edit paired");
  ok(rows[1].before === null && rows[1].after === 3, "the inserted line stands alone");
  ok(rows[2].before === 1 && rows[2].after === 4 && rows[2].span !== null,
    "the second removal waited for the addition it matches");

  const plain = rowsOf([{ kind: "ctx", text: "x" }, { kind: "del", text: "gone entirely" }]);
  ok(plain[0].before === 0 && plain[0].after === 0, "an unchanged line is its own before and after");
  ok(plain[1].before === 1 && plain[1].after === null, "a removal with no partner has no after");
}

function carriageReturnsAreDropped() {
  const root = repoWith({
    before: { "b.js": "const a = 1;\r\nconst b = 2;\r\n" },
    after: { "b.js": "const a = 1;\r\nconst b = 3;\r\n" },
  });
  try {
    const scene = sceneOf(root);
    const texts = scene.hunks.flatMap((hunk) => hunk.lines.map((line) => line.text));
    ok(texts.length > 0, "crlf file still produces lines");
    ok(texts.every((text) => !text.includes("\r")), "no carriage return survives into a plate");
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

async function viewerIsServed() {
  const { serve } = require("./src/server");
  const root = repoWith({
    before: { "c.js": "const x = 1;\n" },
    after: { "c.js": "const x = 2;\n" },
  });
  try {
    const scene = sceneOf(root);
    const port = await serve(() => scene, 0);
    const page = await get(port, "/");
    const json = await get(port, "/scene.json");
    const three = await get(port, "/vendor/three.min.js");
    const elsewhere = await get(port, "/etc/passwd");
    ok(page.status === 200 && page.body.includes("<title>gitdiff3d"), "viewer served");
    ok(json.status === 200 && JSON.parse(json.body).hunks.length === 1, "scene served");
    ok(three.status === 200 && three.body.length > 100000, "three served");
    ok(elsewhere.status === 404, "unknown routes refused");
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

async function main() {
  modulesLoad();
  scenesHaveSymbols();
  spansFindTheChangedWords();
  carriageReturnsAreDropped();
  await viewerIsServed();
  console.log("all checks passed on " + process.platform + " node " + process.versions.node);
  process.exit(0);
}

main();
