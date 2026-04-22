const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { seedData, getPlan, savePlan, importSnapshotsFromCsv } = require("./src/store");
const { buildForecast } = require("./src/forecast");

const PORT = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const publicDir = path.join(rootDir, "web");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(request, response) {
  const requestPath = request.url === "/" ? "/index.html" : request.url;
  const filePath = path.join(publicDir, requestPath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
    });
    response.end(content);
  } catch (error) {
    sendJson(response, 404, { error: "Not found" });
  }
}

async function handleApi(request, response) {
  if (request.method === "GET" && request.url === "/api/bootstrap") {
    const plan = await getPlan();
    sendJson(response, 200, {
      plan,
      forecast: buildForecast(plan),
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/plan") {
    const body = await readRequestBody(request);
    const plan = await savePlan(body);
    sendJson(response, 201, {
      plan,
      forecast: buildForecast(plan),
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/import-snapshots") {
    const body = await readRequestBody(request);
    const result = await importSnapshotsFromCsv(body.csv || "");
    const plan = await getPlan();
    sendJson(response, 200, {
      imported: result,
      plan,
      forecast: buildForecast(plan),
    });
    return;
  }

  sendJson(response, 404, { error: "Unknown API route" });
}

async function start() {
  await seedData();

  const server = http.createServer(async (request, response) => {
    try {
      if ((request.url || "").startsWith("/api/")) {
        await handleApi(request, response);
        return;
      }
      await serveStatic(request, response);
    } catch (error) {
      sendJson(response, 500, {
        error: "Server error",
        detail: error.message,
      });
    }
  });

  server.listen(PORT, () => {
    console.log(`Mojito running at http://localhost:${PORT}`);
  });
}

start();
