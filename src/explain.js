// Why a change exists is not in the diff, so it is asked of Claude: the whole
// change goes in one request, in story order, with whatever commit messages
// the range carries, and each hunk comes back with a group label and a note.
// The viewer already shows and speaks both.

const MODEL = "claude-opus-5";

const SYSTEM = `You explain code changes to a reviewer who is stepping through a diff one hunk at a time, in the order given.

For every hunk, write:
- group: a label of two to five words naming the part of the overall change this hunk belongs to. Hunks that serve the same purpose share the same label, spelled identically.
- note: one or two plain sentences saying what this hunk does and why it is needed, and how it connects to the rest of the change (for example, which earlier hunk it relies on or which later hunk relies on it).

The notes are read aloud and shown in a small panel, so write plain prose: no markdown, no backticks, no code, no lists, no line numbers. Name functions and files in words as they appear. Stick to what the diff and the commit messages support; when the reason for a hunk is not evident, say what it does and leave the why out rather than guessing.`;

const SCHEMA = {
  type: "object",
  properties: {
    hunks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          group: { type: "string" },
          note: { type: "string" },
        },
        required: ["index", "group", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["hunks"],
  additionalProperties: false,
};

const MARK = { add: "+", del: "-", ctx: " " };

const hunkText = (scene, hunk) => {
  const file = scene.files[hunk.file];
  const where = file.path + (hunk.symbol ? " (in " + hunk.symbol + ")" : "");
  const body = hunk.lines.map((line) => MARK[line.kind] + line.text).join("\n");
  return "### hunk " + hunk.index + ": " + where + ", " + file.status + "\n" + body;
};

function promptOf(scene, messages) {
  const history = messages.trim()
    ? "Messages of the commits in this change:\n\n" + messages.trim()
    : "No commit messages are available for this change.";
  return history + "\n\nThe hunks, in the order the reviewer will see them:\n\n" +
    scene.hunks.map((hunk) => hunkText(scene, hunk)).join("\n\n");
}

// Every changed line has one name that survives any context width: its side
// and its number on that side. A hunk's notes follow its lines.
const changedKeys = (scene, hunk) => {
  const path = scene.files[hunk.file].path;
  return hunk.lines
    .filter((line) => line.kind !== "ctx")
    .map((line) => path + (line.kind === "add" ? "|+" + line.newNo : "|-" + line.oldNo));
};

// What came back, pinned to changed lines rather than to hunk numbers, which
// change the moment the context width does.
function notesOf(scene, answer) {
  const byIndex = new Map(scene.hunks.map((hunk) => [hunk.index, hunk]));
  const notes = [];
  (answer.hunks || []).forEach(({ index, group, note }) => {
    const hunk = byIndex.get(index);
    if (!hunk || !note) return;
    notes.push({ keys: new Set(changedKeys(scene, hunk)), group, note });
  });
  return notes;
}

// A wider context can merge hunks, so one hunk may inherit several notes; they
// are read in the order they were written, and the first group names it.
function withNotes(scene, notes) {
  if (!notes || notes.length === 0) return scene;
  const hunks = scene.hunks.map((hunk) => {
    const keys = changedKeys(scene, hunk);
    const mine = notes.filter((entry) => keys.some((key) => entry.keys.has(key)));
    if (mine.length === 0) return hunk;
    const texts = [...new Set(mine.map((entry) => entry.note))];
    return { ...hunk, group: mine[0].group, note: texts.join(" ") };
  });
  return { ...scene, hunks };
}

const textOf = (blocks) =>
  blocks.filter((block) => block.type === "text").map((block) => block.text).join("");

// A model that declines partway leaves its partial answer in the stream, then a
// fallback block, then the other model's. Whether that one restarts or carries
// on is not ours to know, so the answer after the boundary is tried first and
// the whole of it second.
function answerOf(message) {
  const boundary = message.content.map((block) => block.type).lastIndexOf("fallback");
  const tries = boundary === -1 ? [message.content]
    : [message.content.slice(boundary + 1), message.content];
  for (const blocks of tries) {
    try {
      return JSON.parse(textOf(blocks));
    } catch {}
  }
  return null;
}

// Resolves to { notes } or { error }, never throws: a scene without notes is
// still worth serving.
async function explain(scene, messages, client) {
  if (scene.hunks.length === 0) return { notes: [] };
  let Anthropic = null;
  try {
    if (!client) {
      Anthropic = require("@anthropic-ai/sdk");
      client = new Anthropic();
    }
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: promptOf(scene, messages) }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") return { error: "Claude declined to explain this diff" };
    if (message.stop_reason === "max_tokens") return { error: "the explanation ran out of room" };
    const answer = answerOf(message);
    if (!answer) return { error: "Claude's answer was not valid JSON" };
    return { notes: notesOf(scene, answer) };
  } catch (err) {
    if (err && err.code === "MODULE_NOT_FOUND" && !Anthropic) {
      return { error: "run npm install in the gitdiff3d folder first" };
    }
    if (Anthropic && err instanceof Anthropic.AuthenticationError) {
      return { error: "no valid Anthropic credentials" };
    }
    if (Anthropic && err instanceof Anthropic.APIError) {
      return { error: "Claude API " + (err.status || "error") + ": " + err.message };
    }
    if (Anthropic && err instanceof Anthropic.AnthropicError) {
      // raised before any request, which in practice means no credentials
      return { error: err.message.split(". ")[0] + "; set ANTHROPIC_API_KEY" };
    }
    return { error: err && err.message ? err.message : String(err) };
  }
}

module.exports = { explain, withNotes, notesOf, promptOf, MODEL };
