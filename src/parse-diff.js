const FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const RENAME_TO = /^rename to (.+)$/;

const lineKind = (raw) =>
  raw.startsWith("+") ? "add" : raw.startsWith("-") ? "del" : "ctx";

const statusOf = (oldPath, newPath, flags) =>
  flags.isNew ? "added"
    : flags.isGone ? "deleted"
    : oldPath === newPath ? "modified"
    : "renamed";

function parseDiff(text) {
  const files = [];
  let file = null;
  let hunk = null;
  let flags = null;
  let oldNo = 0;
  let newNo = 0;

  const closeFile = () => {
    if (file) files.push(finishFile(file, flags));
    file = null;
    hunk = null;
    flags = null;
  };

  for (const raw of text.split("\n")) {
    const header = FILE_HEADER.exec(raw);
    if (header) {
      closeFile();
      file = { oldPath: header[1], newPath: header[2], hunks: [] };
      flags = { isNew: false, isGone: false, isBinary: false };
      continue;
    }
    if (!file) continue;

    if (raw.startsWith("new file mode")) { flags.isNew = true; continue; }
    if (raw.startsWith("deleted file mode")) { flags.isGone = true; continue; }
    if (raw.startsWith("Binary files")) { flags.isBinary = true; continue; }
    const renamed = RENAME_TO.exec(raw);
    if (renamed) { file.newPath = renamed[1]; continue; }

    const bounds = HUNK_HEADER.exec(raw);
    if (bounds) {
      oldNo = Number(bounds[1]);
      newNo = Number(bounds[3]);
      hunk = {
        oldStart: oldNo,
        oldLines: bounds[2] === undefined ? 1 : Number(bounds[2]),
        newStart: newNo,
        newLines: bounds[4] === undefined ? 1 : Number(bounds[4]),
        lines: [],
      };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk || raw.startsWith("\\")) continue;
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;

    const kind = lineKind(raw);
    hunk.lines.push({
      kind,
      text: raw.slice(1),
      oldNo: kind === "add" ? null : oldNo,
      newNo: kind === "del" ? null : newNo,
    });
    if (kind !== "add") oldNo += 1;
    if (kind !== "del") newNo += 1;
  }
  closeFile();
  return { files };
}

function finishFile(file, flags) {
  const lines = file.hunks.flatMap((h) => h.lines);
  return {
    path: file.newPath,
    oldPath: file.oldPath,
    status: statusOf(file.oldPath, file.newPath, flags),
    binary: flags.isBinary,
    additions: lines.filter((l) => l.kind === "add").length,
    deletions: lines.filter((l) => l.kind === "del").length,
    hunks: file.hunks,
  };
}

module.exports = { parseDiff };
