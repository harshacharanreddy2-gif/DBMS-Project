const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function replaceObject(target, source) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }

  Object.assign(target, clone(source));
}

function readJson(filePath, fallback) {
  ensureDir(path.dirname(filePath));

  if (!fs.existsSync(filePath)) {
    writeJson(filePath, fallback);
    return clone(fallback);
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  return raw ? JSON.parse(raw) : clone(fallback);
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, filePath);
}

function createId(prefix) {
  const stamp = Date.now().toString(36);
  const random = crypto.randomBytes(3).toString("hex");
  return `${prefix}-${stamp}-${random}`;
}

function nowIso() {
  return new Date().toISOString();
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, {
    error: message,
    details: details || null
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function matchPath(pattern, pathname) {
  const patternParts = normalizePath(pattern).split("/").filter(Boolean);
  const pathParts = normalizePath(pathname).split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params = {};

  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];

    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      continue;
    }

    if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

function byId(collection, id) {
  return collection.find((item) => item.id === id);
}

function createService({ name, port, dataFile, seedFile, routes }) {
  const seed = readJson(seedFile, {});
  const db = readJson(dataFile, seed);

  function save() {
    writeJson(dataFile, db);
  }

  const normalizedRoutes = [
    {
      method: "GET",
      path: "/health",
      handler: ({ send }) => send(200, {
        service: name,
        status: "ok",
        checkedAt: nowIso()
      })
    },
    ...routes
  ];

  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = normalizePath(parsedUrl.pathname);
    const route = normalizedRoutes.find((candidate) => {
      return candidate.method === req.method && matchPath(candidate.path, pathname);
    });

    if (!route) {
      sendError(res, 404, `${name} route not found`);
      return;
    }

    const params = matchPath(route.path, pathname);
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    try {
      const body = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
        ? await readBody(req)
        : {};

      await route.handler({
        req,
        res,
        params,
        query,
        body,
        db,
        save,
        send: (status, payload, headers) => sendJson(res, status, payload, headers),
        error: (status, message, details) => sendError(res, status, message, details)
      });
    } catch (error) {
      sendError(res, error.statusCode || 500, error.message || "Unexpected service error");
    }
  });

  server.listen(port, () => {
    console.log(`${name} listening on http://localhost:${port}`);
  });

  return server;
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const transport = parsed.protocol === "https:" ? https : http;
  const method = options.method || "GET";
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers = {
    Accept: "application/json",
    ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
    ...(options.headers || {})
  };

  return new Promise((resolve, reject) => {
    const request = transport.request({
      method,
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      headers,
      timeout: options.timeoutMs || 5000
    }, (response) => {
      let responseBody = "";

      response.on("data", (chunk) => {
        responseBody += chunk;
      });

      response.on("end", () => {
        let json = null;

        try {
          json = responseBody ? JSON.parse(responseBody) : null;
        } catch (error) {
          json = responseBody;
        }

        resolve({
          status: response.statusCode || 0,
          ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
          headers: response.headers,
          json
        });
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error(`Request timed out for ${url}`));
    });

    request.on("error", reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => {
    return body[field] === undefined || body[field] === null || body[field] === "";
  });

  if (missing.length) {
    const error = new Error(`Missing required fields: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
}

function actor(req) {
  const role = req.headers["x-user-role"] || "";
  return { id: req.headers["x-user-id"] || "", role, staff: role === "doctor" || role === "admin" };
}

function fail(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

module.exports = {
  actor,
  byId,
  fail,
  clone,
  createId,
  createService,
  nowIso,
  readBody,
  readJson,
  replaceObject,
  requestJson,
  requireFields,
  sendError,
  sendJson,
  writeJson
};
