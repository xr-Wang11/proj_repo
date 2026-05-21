"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DIST_DIR = path.resolve(__dirname, "dist");
const HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
});

function parseArguments(argv) {
  let port = DEFAULT_PORT;
  let openBrowser = true;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--no-open") {
      openBrowser = false;
      continue;
    }

    if (current === "--port") {
      const next = argv[index + 1];
      const parsed = Number.parseInt(next, 10);

      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid port: ${next}`);
      }

      port = parsed;
      index += 1;
    }
  }

  return { openBrowser, port };
}

function ensureDistExists() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error("dist directory was not found. Please run npm.cmd run build first.");
  }

  const indexFile = path.join(DIST_DIR, "index.html");

  if (!fs.existsSync(indexFile)) {
    throw new Error("dist/index.html was not found. Please run npm.cmd run build first.");
  }
}

function resolveRequestedFile(requestUrl) {
  const url = new URL(requestUrl, `http://${HOST}`);
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolutePath = path.resolve(DIST_DIR, `.${normalized}`);

  if (!absolutePath.startsWith(DIST_DIR)) {
    return null;
  }

  return absolutePath;
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_TYPES[extension] || "application/octet-stream";
}

function openUrl(url) {
  spawn("cmd", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

function openExistingServer(url) {
  process.stdout.write(`Port is already in use. Opening existing page at ${url}\n`);
  openUrl(url);
}

function createRequestListener() {
  return (request, response) => {
    try {
      const filePath = resolveRequestedFile(request.url || "/");

      if (!filePath) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
      }

      fs.stat(filePath, (statError, stats) => {
        if (statError || !stats.isFile()) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Not Found");
          return;
        }

        response.writeHead(200, {
          "Content-Type": getContentType(filePath),
          "Cache-Control": "no-store",
        });

        fs.createReadStream(filePath).pipe(response);
      });
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Server Error: ${error.message}`);
    }
  };
}

function startServer(options) {
  ensureDistExists();

  const server = http.createServer(createRequestListener());
  const url = `http://${HOST}:${options.port}/`;

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") {
      openExistingServer(url);
      return;
    }

    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });

  server.listen(options.port, HOST, () => {
    process.stdout.write(`Serving dist at ${url}\n`);
    process.stdout.write("Close this window to stop the local server.\n");

    if (options.openBrowser) {
      openUrl(url);
    }
  });
}

try {
  startServer(parseArguments(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
