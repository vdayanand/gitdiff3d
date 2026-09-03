const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ASSETS = {
  "/": { file: "viewer.html", type: "text/html; charset=utf-8" },
  "/vendor/three.min.js": { file: "vendor/three.min.js", type: "text/javascript" },
};

const asset = (spec) => ({
  type: spec.type,
  body: fs.readFileSync(path.join(__dirname, spec.file)),
});

function respond(url, scene) {
  if (url === "/scene.json") {
    return { type: "application/json", body: JSON.stringify(scene) };
  }
  const spec = ASSETS[url];
  return spec ? asset(spec) : null;
}

function serve(scene, port) {
  const server = http.createServer((req, res) => {
    const payload = respond(req.url.split("?")[0], scene);
    if (!payload) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": payload.type, "cache-control": "no-store" });
    res.end(payload.body);
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve(server.address().port)),
  );
}

module.exports = { serve };
