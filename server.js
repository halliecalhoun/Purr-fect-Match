var http = require("http");
var fs = require("fs");
var path = require("path");

var port = Number(process.env.PORT) || 8000;
var root = path.resolve(__dirname);

var types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function safePath(urlPath) {
  var decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch (err) {
    return null;
  }
  var requested = path.normalize(path.join(root, decoded));
  if (requested !== root && requested.indexOf(root + path.sep) !== 0) return null;
  return requested;
}

var server = http.createServer(function (req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end("Method not allowed");
    return;
  }

  var requested = safePath(req.url || "/");
  if (!requested) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  fs.stat(requested, function (err, stat) {
    var filePath = requested;
    if (!err && stat.isDirectory()) filePath = path.join(requested, "index.html");

    fs.readFile(filePath, function (readErr, body) {
      if (readErr) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      var type = types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : body);
    });
  });
});

server.listen(port, function () {
  console.log("Purr-fect Match is running at http://localhost:" + port);
});
