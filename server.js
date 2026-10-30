const http = require("node:http");
const { createReadStream } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, ".data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const NEWS_FILE = path.join(DATA_DIR, "news.json");
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.NEWS_ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.NEWS_ADMIN_PASSWORD;
const SESSION_TTL = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 125 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 90 * 1024 * 1024;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};
const MEDIA_TYPES = {
  "image/jpeg": { extension: ".jpg", limit: MAX_IMAGE_BYTES },
  "image/png": { extension: ".png", limit: MAX_IMAGE_BYTES },
  "image/webp": { extension: ".webp", limit: MAX_IMAGE_BYTES },
  "image/gif": { extension: ".gif", limit: MAX_IMAGE_BYTES },
  "video/mp4": { extension: ".mp4", limit: MAX_VIDEO_BYTES },
  "video/webm": { extension: ".webm", limit: MAX_VIDEO_BYTES },
};

if (!ADMIN_PASSWORD) {
  console.error("Set NEWS_ADMIN_PASSWORD before starting the news site.");
  process.exit(1);
}

const sessions = new Map();
const loginAttempts = new Map();
let news = [];

async function loadNews() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    const saved = JSON.parse(await fs.readFile(NEWS_FILE, "utf8"));
    if (!Array.isArray(saved)) throw new Error("News data must be an array.");
    news = saved;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await saveNews([]);
  }
}

async function saveNews(items) {
  const temporary = `${NEWS_FILE}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(items, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, NEWS_FILE);
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function getSession(request) {
  const cookie = request.headers.cookie || "";
  const token = cookie.match(/(?:^|;\s*)news_session=([a-f0-9]+)/)?.[1];
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_TTL);
  return true;
}

function requireAdmin(request, response) {
  if (getSession(request)) return true;
  sendJson(response, 401, { error: "Please sign in to continue." });
  return false;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let oversized = false;
    request.on("data", (chunk) => {
      if (oversized) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        oversized = true;
        chunks.length = 0;
        reject(Object.assign(new Error("The upload is too large."), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (oversized) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("The request body must be valid JSON."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function hasExpectedSignature(mime, bytes) {
  if (mime === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"));
  if (mime === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (mime === "video/mp4") return bytes.subarray(4, 8).toString("ascii") === "ftyp";
  if (mime === "video/webm") return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return false;
}

function parseUpload(upload) {
  if (!upload) return null;
  const definition = MEDIA_TYPES[upload.type];
  if (!definition || typeof upload.data !== "string") {
    throw Object.assign(new Error("Choose a supported photo or video file."), { status: 400 });
  }
  const match = upload.data.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/]*={0,2})$/i);
  if (!match || match[1] !== upload.type || match[2].length % 4 !== 0) {
    throw Object.assign(new Error("The uploaded file could not be read. Please choose it again."), { status: 400 });
  }
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > definition.limit) {
    throw Object.assign(
      new Error(upload.type.startsWith("video/") ? "Videos must be 90 MB or smaller." : "Photos must be 15 MB or smaller."),
      { status: 413 },
    );
  }
  if (!hasExpectedSignature(upload.type, bytes)) {
    throw Object.assign(new Error("This file does not appear to match its selected photo or video format."), { status: 400 });
  }
  return {
    bytes,
    filename: `${randomUUID()}${definition.extension}`,
    mime: upload.type,
  };
}

async function sendFile(request, response, filePath, contentType) {
  try {
    const stat = await fs.stat(filePath);
    const headers = {
      "Content-Type": contentType,
      "Cache-Control": contentType.startsWith("video/") || contentType.startsWith("image/") ? "public, max-age=31536000, immutable" : "no-cache",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };
    const range = request.headers.range;
    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    if (range) {
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!match || (!match[1] && !match[2])) {
        response.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        response.end();
        return;
      }
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : end;
      } else {
        const suffixLength = Number(match[2]);
        if (!suffixLength) {
          response.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
          response.end();
          return;
        }
        start = Math.max(0, stat.size - suffixLength);
      }
      end = Math.min(end, stat.size - 1);
      if (start >= stat.size || start > end) {
        response.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        response.end();
        return;
      }
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers["Content-Length"] = end - start + 1;
    response.writeHead(status, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    const stream = createReadStream(filePath, { start, end });
    stream.on("error", (error) => {
      if (response.headersSent) response.destroy(error);
      else {
        console.error("Unable to stream file:", error);
        response.writeHead(500);
        response.end("Internal server error");
      }
    });
    stream.pipe(response);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    console.error("Unable to serve file:", error);
    response.writeHead(500);
    response.end("Internal server error");
  }
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/news") {
    sendJson(response, 200, news);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/session") {
    sendJson(response, 200, { authenticated: getSession(request), username: ADMIN_USER });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    const now = Date.now();
    const ip = request.socket.remoteAddress || "unknown";
    const attempts = loginAttempts.get(ip) || [];
    const recentAttempts = attempts.filter((timestamp) => now - timestamp < 15 * 60 * 1000);
    if (recentAttempts.length >= 10) {
      sendJson(response, 429, { error: "Too many sign-in attempts. Please try again in 15 minutes." });
      return;
    }
    loginAttempts.set(ip, recentAttempts);
    const credentials = await readJson(request);
    const suppliedPassword = typeof credentials?.password === "string" ? credentials.password : "";
    const passwordsMatch = timingSafeEqual(
      createHash("sha256").update(suppliedPassword).digest(),
      createHash("sha256").update(ADMIN_PASSWORD).digest(),
    );
    if (credentials?.username !== ADMIN_USER || !passwordsMatch) {
      recentAttempts.push(now);
      loginAttempts.set(ip, recentAttempts);
      sendJson(response, 401, { error: "That username or password is not correct." });
      return;
    }
    loginAttempts.delete(ip);
    const token = randomBytes(32).toString("hex");
    sessions.set(token, now + SESSION_TTL);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.setHeader("Set-Cookie", `news_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`);
    sendJson(response, 200, { authenticated: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    const cookie = request.headers.cookie || "";
    const token = cookie.match(/(?:^|;\s*)news_session=([a-f0-9]+)/)?.[1];
    if (token) sessions.delete(token);
    response.setHeader("Set-Cookie", "news_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    sendJson(response, 200, { authenticated: false });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/news") {
    if (!requireAdmin(request, response)) return;
    const data = await readJson(request);
    if (typeof data.title !== "string" || !data.title.trim() || data.title.trim().length > 160) {
      sendJson(response, 400, { error: "Add a headline of up to 160 characters." });
      return;
    }
    if (typeof data.body !== "string" || !data.body.trim() || data.body.trim().length > 12000) {
      sendJson(response, 400, { error: "Add a story of up to 12,000 characters." });
      return;
    }
    const categories = ["Latest", "Local", "World", "Politics", "Business", "Culture", "Sport"];
    if (!categories.includes(data.category)) {
      sendJson(response, 400, { error: "Choose one of the available story sections." });
      return;
    }
    const media = parseUpload(data.media);
    if (media) await fs.writeFile(path.join(UPLOAD_DIR, media.filename), media.bytes, { flag: "wx", mode: 0o644 });
    const article = {
      id: randomUUID(),
      title: data.title.trim(),
      body: data.body.trim(),
      category: data.category,
      createdAt: new Date().toISOString(),
      media: media ? { url: `/uploads/${media.filename}`, type: media.mime } : null,
    };
    const updatedNews = [article, ...news];
    try {
      await saveNews(updatedNews);
    } catch (error) {
      if (media) await fs.unlink(path.join(UPLOAD_DIR, media.filename)).catch(() => {});
      throw error;
    }
    news = updatedNews;
    sendJson(response, 201, article);
    return;
  }

  const deleteMatch = url.pathname.match(/^\/api\/admin\/news\/([0-9a-f-]{36})$/);
  if (request.method === "DELETE" && deleteMatch) {
    if (!requireAdmin(request, response)) return;
    const article = news.find((item) => item.id === deleteMatch[1]);
    if (!article) {
      sendJson(response, 404, { error: "That story could not be found." });
      return;
    }
    const updatedNews = news.filter((item) => item.id !== article.id);
    await saveNews(updatedNews);
    news = updatedNews;
    if (article.media?.url) {
      const filename = path.basename(article.media.url);
      await fs.unlink(path.join(UPLOAD_DIR, filename)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    sendJson(response, 200, { deleted: true });
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    if (url.pathname.startsWith("/uploads/")) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end();
        return;
      }
      const filename = path.basename(decodeURIComponent(url.pathname.slice("/uploads/".length)));
      const match = filename.match(/^([0-9a-f-]{36})\.(jpg|png|webp|gif|mp4|webm)$/);
      if (!match) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const extension = path.extname(filename);
      const mediaType = Object.entries(MEDIA_TYPES).find(([, value]) => value.extension === extension)?.[0];
      await sendFile(request, response, path.join(UPLOAD_DIR, filename), mediaType);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    const requestedPath = url.pathname === "/" || url.pathname === "/admin" || url.pathname === "/admin/"
      ? "index.html"
      : path.basename(decodeURIComponent(url.pathname));
    if (!["index.html", "styles.css", "app.js"].includes(requestedPath)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const content = await fs.readFile(path.join(ROOT, requestedPath));
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(requestedPath)],
      "Content-Length": content.length,
      "Cache-Control": "no-cache",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    const status = error.status || 500;
    if (status === 500) console.error("Request failed:", error);
    sendJson(response, status, { error: status === 500 ? "Something went wrong. Please try again." : error.message });
  }
});

loadNews().then(() => {
  server.listen(PORT, () => {
    console.log(`News site running at http://localhost:${PORT}`);
    console.log(`Admin page: http://localhost:${PORT}/admin`);
  });
}).catch((error) => {
  console.error("Unable to start the news site:", error);
  process.exit(1);
});
